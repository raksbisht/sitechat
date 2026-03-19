"""
MongoDB connection and operations for conversations, pages, and memory.
"""
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from loguru import logger
import re

from app.config import settings


class MongoDB:
    """MongoDB client for managing conversations, pages, and long-term memory."""
    
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
    
    async def connect(self):
        """Connect to MongoDB."""
        try:
            self.client = AsyncIOMotorClient(settings.MONGODB_URI)
            self.db = self.client[settings.MONGODB_DB_NAME]
            await self.client.admin.command('ping')
            logger.info(f"Connected to MongoDB: {settings.MONGODB_DB_NAME}")
            await self._create_indexes()
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from MongoDB."""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    async def _create_indexes(self):
        """Create necessary indexes."""
        await self.db.conversations.create_index("session_id")
        await self.db.conversations.create_index("site_id")
        await self.db.conversations.create_index("updated_at")
        await self.db.conversations.create_index("created_at")
        await self.db.conversations.create_index([("messages.content", "text")])
        await self.db.pages.create_index("url", unique=True)
        await self.db.crawl_jobs.create_index("created_at")
        await self.db.long_term_memory.create_index("user_id")
        await self.db.sites.create_index("site_id", unique=True)
        await self.db.sites.create_index("status")
        await self.db.trigger_events.create_index("site_id")
        await self.db.trigger_events.create_index("trigger_id")
        await self.db.trigger_events.create_index("timestamp")
        await self.db.trigger_events.create_index([("site_id", 1), ("timestamp", -1)])
        await self.db.handoff_sessions.create_index("handoff_id", unique=True)
        await self.db.handoff_sessions.create_index("session_id")
        await self.db.handoff_sessions.create_index("site_id")
        await self.db.handoff_sessions.create_index("status")
        await self.db.handoff_sessions.create_index([("site_id", 1), ("status", 1), ("created_at", 1)])
        # Q&A pairs indexes
        await self.db.qa_pairs.create_index("id", unique=True)
        await self.db.qa_pairs.create_index("site_id")
        await self.db.qa_pairs.create_index([("site_id", 1), ("enabled", 1)])
        await self.db.qa_pairs.create_index([("question", "text"), ("answer", "text")])
        await self.db.leads.create_index("lead_id", unique=True)
        await self.db.leads.create_index("site_id")
        await self.db.leads.create_index("session_id")
        await self.db.leads.create_index("email")
        await self.db.leads.create_index([("site_id", 1), ("captured_at", -1)])
        await self.db.users.create_index("owner_id")
        await self.db.users.create_index([("role", 1), ("owner_id", 1)])
    
    # ==================== Conversations ====================
    
    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        sources: List[Dict] = None,
        metadata: Dict = None,
        site_id: str = None,
        response_time_ms: int = None
    ) -> str:
        """Save a message to a conversation."""
        message = {
            "role": role,
            "content": content,
            "sources": sources or [],
            "metadata": metadata or {},
            "timestamp": datetime.utcnow(),
            "message_id": f"{session_id}_{datetime.utcnow().timestamp()}"
        }
        
        if response_time_ms is not None:
            message["response_time_ms"] = response_time_ms
        
        update_set = {"updated_at": datetime.utcnow()}
        if site_id:
            update_set["site_id"] = site_id
        
        result = await self.db.conversations.update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": message},
                "$set": update_set,
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        return message["message_id"]
    
    async def add_message_feedback(
        self,
        session_id: str,
        message_id: str,
        feedback: str
    ) -> bool:
        """Add feedback to a specific message (positive/negative)."""
        result = await self.db.conversations.update_one(
            {
                "session_id": session_id,
                "messages.message_id": message_id
            },
            {
                "$set": {
                    "messages.$.feedback": feedback,
                    "messages.$.feedback_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0
    
    async def add_feedback_by_index(
        self,
        session_id: str,
        message_index: int,
        feedback: str
    ) -> bool:
        """Add feedback to a message by its index in the conversation."""
        result = await self.db.conversations.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    f"messages.{message_index}.feedback": feedback,
                    f"messages.{message_index}.feedback_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0
    
    async def get_conversation_history(
        self,
        session_id: str,
        limit: int = None
    ) -> List[Dict]:
        """Get conversation history for a session."""
        limit = limit or settings.CONVERSATION_WINDOW_SIZE
        
        doc = await self.db.conversations.find_one({"session_id": session_id})
        if not doc:
            return []
        
        messages = doc.get("messages", [])
        return messages[-limit:] if limit else messages
    
    async def clear_conversation(self, session_id: str) -> bool:
        """Clear conversation history for a session."""
        result = await self.db.conversations.delete_one({"session_id": session_id})
        return result.deleted_count > 0
    
    async def get_all_sessions(self, limit: int = 50) -> List[Dict]:
        """Get all conversation sessions."""
        cursor = self.db.conversations.find(
            {},
            {"session_id": 1, "created_at": 1, "updated_at": 1}
        ).sort("updated_at", -1).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def get_conversations_paginated(
        self,
        site_id: str = None,
        page: int = 1,
        limit: int = 20,
        sort_by: str = "updated_at",
        order: int = -1,
        date_from: datetime = None,
        date_to: datetime = None
    ) -> Tuple[List[Dict], int]:
        """Get paginated conversations with filters."""
        query = {}
        
        if site_id:
            query["site_id"] = site_id
        
        if date_from or date_to:
            query["created_at"] = {}
            if date_from:
                query["created_at"]["$gte"] = date_from
            if date_to:
                query["created_at"]["$lte"] = date_to
        
        total = await self.db.conversations.count_documents(query)
        
        skip = (page - 1) * limit
        cursor = self.db.conversations.find(
            query,
            {
                "session_id": 1,
                "site_id": 1,
                "created_at": 1,
                "updated_at": 1,
                "messages": {"$slice": 1}
            }
        ).sort(sort_by, order).skip(skip).limit(limit)
        
        conversations = await cursor.to_list(length=limit)
        
        for conv in conversations:
            conv["_id"] = str(conv["_id"])
            msg_count = await self.db.conversations.aggregate([
                {"$match": {"session_id": conv["session_id"]}},
                {"$project": {"message_count": {"$size": "$messages"}}}
            ]).to_list(1)
            conv["message_count"] = msg_count[0]["message_count"] if msg_count else 0
            
            if conv.get("messages"):
                first_msg = conv["messages"][0]
                conv["first_message"] = first_msg.get("content", "")[:100]
                del conv["messages"]
            else:
                conv["first_message"] = ""
        
        return conversations, total
    
    async def get_conversation_full(self, session_id: str) -> Optional[Dict]:
        """Get full conversation with all messages and stats."""
        conv = await self.db.conversations.find_one({"session_id": session_id})
        if not conv:
            return None
        
        conv["_id"] = str(conv["_id"])
        messages = conv.get("messages", [])
        
        positive_feedback = sum(1 for m in messages if m.get("feedback") == "positive")
        negative_feedback = sum(1 for m in messages if m.get("feedback") == "negative")
        response_times = [m.get("response_time_ms") for m in messages if m.get("response_time_ms")]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        conv["stats"] = {
            "message_count": len(messages),
            "user_messages": sum(1 for m in messages if m.get("role") == "user"),
            "assistant_messages": sum(1 for m in messages if m.get("role") == "assistant"),
            "positive_feedback": positive_feedback,
            "negative_feedback": negative_feedback,
            "avg_response_time_ms": round(avg_response_time, 2)
        }
        
        return conv
    
    async def search_conversations(
        self,
        query: str,
        site_id: str = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Dict], int]:
        """Search conversations by message content."""
        search_filter = {}
        
        if query:
            escaped_query = re.escape(query)
            search_filter["messages.content"] = {"$regex": escaped_query, "$options": "i"}
        
        if site_id:
            search_filter["site_id"] = site_id
        
        total = await self.db.conversations.count_documents(search_filter)
        
        skip = (page - 1) * limit
        cursor = self.db.conversations.find(
            search_filter,
            {
                "session_id": 1,
                "site_id": 1,
                "created_at": 1,
                "updated_at": 1,
                "messages": 1
            }
        ).sort("updated_at", -1).skip(skip).limit(limit)
        
        conversations = await cursor.to_list(length=limit)
        
        for conv in conversations:
            conv["_id"] = str(conv["_id"])
            messages = conv.get("messages", [])
            conv["message_count"] = len(messages)
            
            matching_snippet = ""
            if query:
                for msg in messages:
                    content = msg.get("content", "")
                    if query.lower() in content.lower():
                        idx = content.lower().find(query.lower())
                        start = max(0, idx - 30)
                        end = min(len(content), idx + len(query) + 30)
                        matching_snippet = "..." + content[start:end] + "..."
                        break
            
            conv["matching_snippet"] = matching_snippet
            conv["first_message"] = messages[0].get("content", "")[:100] if messages else ""
            del conv["messages"]
        
        return conversations, total
    
    async def delete_conversations_bulk(self, session_ids: List[str]) -> int:
        """Delete multiple conversations at once."""
        result = await self.db.conversations.delete_many({
            "session_id": {"$in": session_ids}
        })
        return result.deleted_count
    
    async def get_conversations_for_export(
        self,
        session_ids: List[str] = None,
        site_id: str = None
    ) -> List[Dict]:
        """Get conversations for export."""
        query = {}
        if session_ids:
            query["session_id"] = {"$in": session_ids}
        elif site_id:
            query["site_id"] = site_id
        
        cursor = self.db.conversations.find(query).sort("created_at", -1)
        conversations = await cursor.to_list(length=1000)
        
        for conv in conversations:
            conv["_id"] = str(conv["_id"])
        
        return conversations
    
    # ==================== Pages ====================
    
    async def save_page(
        self,
        url: str,
        title: str,
        content: str,
        chunk_count: int = 0,
        metadata: Dict = None
    ) -> str:
        """Save a crawled page."""
        result = await self.db.pages.update_one(
            {"url": url},
            {
                "$set": {
                    "title": title,
                    "content": content,
                    "chunk_count": chunk_count,
                    "metadata": metadata or {},
                    "last_crawled": datetime.utcnow(),
                    "status": "indexed"
                },
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        return str(result.upserted_id) if result.upserted_id else url
    
    async def get_page(self, url: str) -> Optional[Dict]:
        """Get a page by URL."""
        return await self.db.pages.find_one({"url": url})
    
    async def get_all_pages(self, status: str = None) -> List[Dict]:
        """Get all pages."""
        query = {"status": status} if status else {}
        cursor = self.db.pages.find(query).sort("last_crawled", -1)
        return await cursor.to_list(length=1000)
    
    async def delete_page(self, url: str) -> bool:
        """Delete a page."""
        result = await self.db.pages.delete_one({"url": url})
        return result.deleted_count > 0
    
    async def get_page_count(self) -> int:
        """Get total number of indexed pages."""
        return await self.db.pages.count_documents({"status": "indexed"})
    
    # ==================== Crawl Jobs ====================
    
    async def create_crawl_job(self, target_url: str) -> str:
        """Create a new crawl job."""
        result = await self.db.crawl_jobs.insert_one({
            "target_url": target_url,
            "status": "running",
            "pages_crawled": 0,
            "pages_indexed": 0,
            "errors": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        })
        return str(result.inserted_id)
    
    async def update_crawl_job(
        self,
        job_id: str,
        status: str = None,
        pages_crawled: int = None,
        pages_indexed: int = None,
        error: str = None
    ):
        """Update a crawl job."""
        from bson import ObjectId
        
        update = {"updated_at": datetime.utcnow()}
        if status:
            update["status"] = status
        if pages_crawled is not None:
            update["pages_crawled"] = pages_crawled
        if pages_indexed is not None:
            update["pages_indexed"] = pages_indexed
        
        push_ops = {}
        if error:
            push_ops["errors"] = error
        
        await self.db.crawl_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": update, "$push": push_ops} if push_ops else {"$set": update}
        )
    
    async def get_crawl_job(self, job_id: str) -> Optional[Dict]:
        """Get a crawl job by ID."""
        from bson import ObjectId
        return await self.db.crawl_jobs.find_one({"_id": ObjectId(job_id)})
    
    async def get_latest_crawl_job(self) -> Optional[Dict]:
        """Get the latest crawl job."""
        return await self.db.crawl_jobs.find_one(sort=[("created_at", -1)])
    
    async def get_crawl_job_by_url(self, url: str) -> Optional[Dict]:
        """Get crawl job by target URL."""
        job = await self.db.crawl_jobs.find_one(
            {"target_url": url},
            sort=[("created_at", -1)]
        )
        if job:
            job["_id"] = str(job["_id"])
        return job
    
    # ==================== Long-term Memory ====================
    
    async def save_user_memory(
        self,
        user_id: str,
        key: str,
        value: Any
    ):
        """Save long-term memory for a user."""
        await self.db.long_term_memory.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    f"memory.{key}": value,
                    "updated_at": datetime.utcnow()
                },
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
    
    async def get_user_memory(self, user_id: str) -> Dict:
        """Get all long-term memory for a user."""
        doc = await self.db.long_term_memory.find_one({"user_id": user_id})
        return doc.get("memory", {}) if doc else {}
    
    async def clear_user_memory(self, user_id: str) -> bool:
        """Clear long-term memory for a user."""
        result = await self.db.long_term_memory.delete_one({"user_id": user_id})
        return result.deleted_count > 0
    
    # ==================== User Management ====================
    
    async def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email."""
        user = await self.db.users.find_one({"email": email})
        if user:
            user["_id"] = str(user["_id"])
        return user
    
    async def create_user(self, user_data: Dict) -> str:
        """Create a new user."""
        import uuid
        user_id = str(uuid.uuid4())
        user_data["user_id"] = user_id
        user_data["created_at"] = datetime.utcnow()
        user_data["updated_at"] = datetime.utcnow()
        
        await self.db.users.insert_one(user_data)
        return user_id
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user by ID (searches both user_id field and MongoDB _id)."""
        from bson import ObjectId
        
        # First try by user_id field
        user = await self.db.users.find_one({"user_id": user_id})
        
        # If not found, try by MongoDB _id
        if not user:
            try:
                user = await self.db.users.find_one({"_id": ObjectId(user_id)})
            except Exception:
                pass
        
        if user:
            user["_id"] = str(user["_id"])
        return user
    
    async def update_user(self, user_id: str, updates: Dict) -> bool:
        """Update user fields by user_id field or MongoDB _id."""
        from bson import ObjectId
        
        user = await self.get_user_by_id(user_id)
        if not user:
            return False
        oid = user["_id"]
        try:
            obj = ObjectId(oid)
        except Exception:
            return False
        patch = dict(updates)
        patch["updated_at"] = datetime.utcnow()
        result = await self.db.users.update_one({"_id": obj}, {"$set": patch})
        return result.modified_count > 0 or result.matched_count > 0
    
    async def get_all_users(self) -> List[Dict]:
        """List users (admin tooling)."""
        cursor = self.db.users.find({}).sort("created_at", -1).limit(500)
        users = await cursor.to_list(length=500)
        for u in users:
            u["_id"] = str(u["_id"])
        return users
    
    async def delete_user(self, user_id: str) -> bool:
        """Delete user by logical id."""
        from bson import ObjectId
        
        user = await self.get_user_by_id(user_id)
        if not user:
            return False
        try:
            obj = ObjectId(user["_id"])
        except Exception:
            return False
        result = await self.db.users.delete_one({"_id": obj})
        return result.deleted_count > 0
    
    async def list_users_agents_for_owner(self, owner_id: str) -> List[Dict]:
        """Support agents created by this admin (owner_id)."""
        cursor = self.db.users.find(
            {"role": "agent", "owner_id": owner_id}
        ).sort("created_at", -1)
        users = await cursor.to_list(length=200)
        for u in users:
            u["_id"] = str(u["_id"])
        return users
    
    # ==================== Site Management ====================
    
    async def list_sites(self, user_id: Optional[str] = None) -> List[Dict]:
        """List all sites."""
        query = {}
        if user_id:
            query["user_id"] = user_id
        
        cursor = self.db.sites.find(query).sort("created_at", -1)
        sites = await cursor.to_list(length=100)
        
        for site in sites:
            site["_id"] = str(site["_id"])
        
        return sites
    
    async def list_sites_by_site_ids(self, site_ids: List[str]) -> List[Dict]:
        """List sites whose site_id is in the given list."""
        if not site_ids:
            return []
        cursor = self.db.sites.find({"site_id": {"$in": site_ids}}).sort("created_at", -1)
        sites = await cursor.to_list(length=100)
        for site in sites:
            site["_id"] = str(site["_id"])
        return sites
    
    async def get_site(self, site_id: str) -> Optional[Dict]:
        """Get site by ID."""
        site = await self.db.sites.find_one({"site_id": site_id})
        if site:
            site["_id"] = str(site["_id"])
        return site
    
    async def create_site(self, site_data: Dict) -> str:
        """Create a new site."""
        site_data["created_at"] = datetime.utcnow()
        site_data["updated_at"] = datetime.utcnow()
        await self.db.sites.insert_one(site_data)
        return site_data.get("site_id", "")
    
    async def update_site(self, site_id: str, updates: Dict) -> bool:
        """Update site data."""
        updates["updated_at"] = datetime.utcnow()
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$set": updates}
        )
        return result.modified_count > 0
    
    async def delete_site(self, site_id: str) -> bool:
        """Delete a site."""
        result = await self.db.sites.delete_one({"site_id": site_id})
        return result.deleted_count > 0
    
    # ==================== Proactive Chat Triggers ====================
    
    async def get_site_triggers(self, site_id: str) -> Dict:
        """Get all triggers for a site."""
        site = await self.db.sites.find_one(
            {"site_id": site_id},
            {"triggers": 1, "global_cooldown_ms": 1}
        )
        if not site:
            return {"triggers": [], "global_cooldown_ms": 30000}
        
        return {
            "triggers": site.get("triggers", []),
            "global_cooldown_ms": site.get("global_cooldown_ms", 30000)
        }
    
    async def save_trigger(self, site_id: str, trigger: Dict) -> Dict:
        """Save a new trigger or update existing one."""
        import uuid
        
        now = datetime.utcnow()
        
        if not trigger.get("id"):
            trigger["id"] = str(uuid.uuid4())[:8]
            trigger["created_at"] = now
        
        trigger["updated_at"] = now
        
        existing = await self.db.sites.find_one({
            "site_id": site_id,
            "triggers.id": trigger["id"]
        })
        
        if existing:
            await self.db.sites.update_one(
                {"site_id": site_id, "triggers.id": trigger["id"]},
                {"$set": {"triggers.$": trigger}}
            )
        else:
            await self.db.sites.update_one(
                {"site_id": site_id},
                {"$push": {"triggers": trigger}},
                upsert=True
            )
        
        return trigger
    
    async def update_trigger(self, site_id: str, trigger_id: str, updates: Dict) -> Optional[Dict]:
        """Update specific fields of a trigger."""
        updates["updated_at"] = datetime.utcnow()
        
        set_fields = {f"triggers.$.{k}": v for k, v in updates.items()}
        
        result = await self.db.sites.update_one(
            {"site_id": site_id, "triggers.id": trigger_id},
            {"$set": set_fields}
        )
        
        if result.modified_count == 0:
            return None
        
        site = await self.db.sites.find_one(
            {"site_id": site_id, "triggers.id": trigger_id},
            {"triggers.$": 1}
        )
        
        if site and site.get("triggers"):
            return site["triggers"][0]
        return None
    
    async def delete_trigger(self, site_id: str, trigger_id: str) -> bool:
        """Delete a trigger from a site."""
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$pull": {"triggers": {"id": trigger_id}}}
        )
        return result.modified_count > 0
    
    async def reorder_triggers(self, site_id: str, trigger_ids: List[str]) -> bool:
        """Reorder triggers by setting priority based on list order."""
        site = await self.db.sites.find_one({"site_id": site_id}, {"triggers": 1})
        if not site:
            return False
        
        triggers = site.get("triggers", [])
        trigger_map = {t["id"]: t for t in triggers}
        
        for idx, trigger_id in enumerate(trigger_ids):
            if trigger_id in trigger_map:
                trigger_map[trigger_id]["priority"] = len(trigger_ids) - idx
                trigger_map[trigger_id]["updated_at"] = datetime.utcnow()
        
        reordered = [trigger_map[tid] for tid in trigger_ids if tid in trigger_map]
        remaining = [t for t in triggers if t["id"] not in trigger_ids]
        all_triggers = reordered + remaining
        
        await self.db.sites.update_one(
            {"site_id": site_id},
            {"$set": {"triggers": all_triggers}}
        )
        return True
    
    async def set_global_cooldown(self, site_id: str, cooldown_ms: int) -> bool:
        """Set global cooldown between triggers for a site."""
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$set": {"global_cooldown_ms": cooldown_ms}}
        )
        return result.modified_count > 0
    
    async def log_trigger_event(
        self,
        site_id: str,
        trigger_id: str,
        session_id: str,
        event_type: str,
        metadata: Dict = None
    ) -> str:
        """Log a trigger event for analytics."""
        event = {
            "site_id": site_id,
            "trigger_id": trigger_id,
            "session_id": session_id,
            "event_type": event_type,
            "timestamp": datetime.utcnow(),
            "metadata": metadata or {}
        }
        
        result = await self.db.trigger_events.insert_one(event)
        return str(result.inserted_id)
    
    async def get_trigger_analytics(
        self,
        site_id: str,
        period_days: int = 7
    ) -> List[Dict]:
        """Get trigger analytics for a site."""
        from datetime import timedelta
        
        start_date = datetime.utcnow() - timedelta(days=period_days)
        
        pipeline = [
            {
                "$match": {
                    "site_id": site_id,
                    "timestamp": {"$gte": start_date}
                }
            },
            {
                "$group": {
                    "_id": {
                        "trigger_id": "$trigger_id",
                        "event_type": "$event_type"
                    },
                    "count": {"$sum": 1}
                }
            },
            {
                "$group": {
                    "_id": "$_id.trigger_id",
                    "events": {
                        "$push": {
                            "event_type": "$_id.event_type",
                            "count": "$count"
                        }
                    }
                }
            }
        ]
        
        results = await self.db.trigger_events.aggregate(pipeline).to_list(100)
        
        site = await self.db.sites.find_one({"site_id": site_id}, {"triggers": 1})
        trigger_names = {t["id"]: t["name"] for t in site.get("triggers", [])} if site else {}
        
        analytics = []
        for r in results:
            trigger_id = r["_id"]
            events = {e["event_type"]: e["count"] for e in r["events"]}
            
            shown = events.get("shown", 0)
            clicked = events.get("clicked", 0)
            dismissed = events.get("dismissed", 0)
            converted = events.get("converted", 0)
            
            analytics.append({
                "trigger_id": trigger_id,
                "trigger_name": trigger_names.get(trigger_id, "Unknown"),
                "shown_count": shown,
                "clicked_count": clicked,
                "dismissed_count": dismissed,
                "converted_count": converted,
                "click_rate": round((clicked / shown * 100) if shown > 0 else 0, 1),
                "conversion_rate": round((converted / shown * 100) if shown > 0 else 0, 1)
            })
        
        return analytics
    
    # ==================== Human Handoff ====================
    
    async def create_handoff_session(
        self,
        session_id: str,
        site_id: str,
        reason: str = "user_request",
        visitor_email: str = None,
        visitor_name: str = None,
        ai_conversation: List[Dict] = None,
        ai_summary: str = None
    ) -> Dict:
        """Create a new handoff session."""
        import uuid
        
        handoff_id = str(uuid.uuid4())[:12]
        now = datetime.utcnow()
        
        handoff = {
            "handoff_id": handoff_id,
            "session_id": session_id,
            "site_id": site_id,
            "status": "pending",
            "visitor_email": visitor_email,
            "visitor_name": visitor_name,
            "reason": reason,
            "ai_summary": ai_summary,
            "ai_conversation": ai_conversation or [],
            "messages": [],
            "assigned_agent_id": None,
            "assigned_agent_name": None,
            "created_at": now,
            "updated_at": now,
            "resolved_at": None
        }
        
        await self.db.handoff_sessions.insert_one(handoff)
        return handoff
    
    async def get_handoff_session(self, handoff_id: str) -> Optional[Dict]:
        """Get a handoff session by ID."""
        handoff = await self.db.handoff_sessions.find_one({"handoff_id": handoff_id})
        if handoff:
            handoff["_id"] = str(handoff["_id"])
        return handoff
    
    async def get_handoff_by_session(self, session_id: str, active_only: bool = True) -> Optional[Dict]:
        """Get active handoff for a chat session."""
        query = {"session_id": session_id}
        if active_only:
            query["status"] = {"$in": ["pending", "active"]}
        
        handoff = await self.db.handoff_sessions.find_one(
            query,
            sort=[("created_at", -1)]
        )
        if handoff:
            handoff["_id"] = str(handoff["_id"])
        return handoff
    
    async def get_handoff_queue(
        self,
        site_id: Optional[str] = None,
        site_ids: Optional[List[str]] = None,
        status: List[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Dict], int, int, int]:
        """Get handoff queue with counts. Use site_ids for multiple sites, or site_id for one, or neither for all sites."""
        base: Dict[str, Any] = {}
        if site_ids is not None:
            base["site_id"] = {"$in": site_ids}
        elif site_id:
            base["site_id"] = site_id
        
        query: Dict[str, Any] = dict(base)
        if status:
            query["status"] = {"$in": status}
        else:
            query["status"] = {"$in": ["pending", "active"]}
        
        total = await self.db.handoff_sessions.count_documents(query)
        
        pending_count = await self.db.handoff_sessions.count_documents({**base, "status": "pending"})
        active_count = await self.db.handoff_sessions.count_documents({**base, "status": "active"})
        
        skip = (page - 1) * limit
        cursor = self.db.handoff_sessions.find(query).sort([
            ("status", 1),
            ("created_at", 1)
        ]).skip(skip).limit(limit)
        
        handoffs = await cursor.to_list(length=limit)
        now = datetime.utcnow()
        
        for h in handoffs:
            h["_id"] = str(h["_id"])
            h["message_count"] = len(h.get("messages", []))
            messages = h.get("messages", [])
            if messages:
                h["last_message_preview"] = messages[-1].get("content", "")[:100]
            else:
                h["last_message_preview"] = ""
            
            created = h.get("created_at", now)
            h["wait_time_seconds"] = int((now - created).total_seconds())
            
            del h["messages"]
            del h["ai_conversation"]
        
        return handoffs, total, pending_count, active_count
    
    async def update_handoff_status(
        self,
        handoff_id: str,
        status: str,
        agent_id: str = None,
        agent_name: str = None
    ) -> Optional[Dict]:
        """Update handoff status and optionally assign agent."""
        update = {
            "status": status,
            "updated_at": datetime.utcnow()
        }
        
        if agent_id:
            update["assigned_agent_id"] = agent_id
        if agent_name:
            update["assigned_agent_name"] = agent_name
        if status == "resolved":
            update["resolved_at"] = datetime.utcnow()
        
        result = await self.db.handoff_sessions.update_one(
            {"handoff_id": handoff_id},
            {"$set": update}
        )
        
        if result.modified_count > 0:
            return await self.get_handoff_session(handoff_id)
        return None
    
    async def add_handoff_message(
        self,
        handoff_id: str,
        role: str,
        content: str,
        sender_name: str = None
    ) -> Optional[Dict]:
        """Add a message to a handoff session."""
        import uuid
        
        message = {
            "id": str(uuid.uuid4())[:8],
            "role": role,
            "content": content,
            "sender_name": sender_name,
            "timestamp": datetime.utcnow()
        }
        
        result = await self.db.handoff_sessions.update_one(
            {"handoff_id": handoff_id},
            {
                "$push": {"messages": message},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.modified_count > 0:
            return message
        return None
    
    async def get_handoff_messages(
        self,
        handoff_id: str,
        since: datetime = None
    ) -> List[Dict]:
        """Get messages from a handoff session, optionally filtered by timestamp."""
        handoff = await self.db.handoff_sessions.find_one(
            {"handoff_id": handoff_id},
            {"messages": 1, "status": 1, "assigned_agent_name": 1}
        )
        
        if not handoff:
            return []
        
        messages = handoff.get("messages", [])
        
        if since:
            messages = [m for m in messages if m.get("timestamp", datetime.min) > since]
        
        return {
            "messages": messages,
            "status": handoff.get("status"),
            "agent_name": handoff.get("assigned_agent_name")
        }
    
    # ==================== Business Hours ====================
    
    async def get_site_handoff_config(self, site_id: str) -> Optional[Dict]:
        """Get handoff configuration for a site."""
        site = await self.db.sites.find_one(
            {"site_id": site_id},
            {"handoff_config": 1}
        )
        
        if not site:
            return None
        
        return site.get("handoff_config", {
            "enabled": True,
            "confidence_threshold": 0.3,
            "business_hours": {
                "enabled": False,
                "timezone": "UTC",
                "schedule": {
                    "mon": {"enabled": True, "start": "09:00", "end": "17:00"},
                    "tue": {"enabled": True, "start": "09:00", "end": "17:00"},
                    "wed": {"enabled": True, "start": "09:00", "end": "17:00"},
                    "thu": {"enabled": True, "start": "09:00", "end": "17:00"},
                    "fri": {"enabled": True, "start": "09:00", "end": "17:00"},
                    "sat": {"enabled": False, "start": "09:00", "end": "17:00"},
                    "sun": {"enabled": False, "start": "09:00", "end": "17:00"}
                },
                "offline_message": "We're currently offline. Leave your email and we'll get back to you."
            },
            "auto_suggest_phrases": [
                "I'm not sure",
                "I don't have information",
                "I cannot help with",
                "please contact support"
            ]
        })
    
    async def update_site_handoff_config(self, site_id: str, config: Dict) -> bool:
        """Update handoff configuration for a site."""
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$set": {"handoff_config": config, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    async def check_business_hours(self, site_id: str) -> Dict:
        """Check if site is within business hours."""
        from datetime import timedelta
        import pytz
        
        config = await self.get_site_handoff_config(site_id)
        if not config:
            return {"available": True, "is_within_hours": True}
        
        bh = config.get("business_hours", {})
        if not bh.get("enabled", False):
            return {"available": True, "is_within_hours": True}
        
        tz_name = bh.get("timezone", "UTC")
        try:
            tz = pytz.timezone(tz_name)
        except:
            tz = pytz.UTC
        
        now = datetime.now(tz)
        day_key = now.strftime("%a").lower()[:3]
        
        schedule = bh.get("schedule", {})
        day_schedule = schedule.get(day_key, {"enabled": False})
        
        if not day_schedule.get("enabled", False):
            next_day = self._find_next_working_day(schedule, day_key)
            return {
                "available": False,
                "is_within_hours": False,
                "offline_message": bh.get("offline_message"),
                "next_available": next_day
            }
        
        start_str = day_schedule.get("start", "09:00")
        end_str = day_schedule.get("end", "17:00")
        
        try:
            start_h, start_m = map(int, start_str.split(":"))
            end_h, end_m = map(int, end_str.split(":"))
            
            start_time = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
            end_time = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
            
            if start_time <= now <= end_time:
                return {"available": True, "is_within_hours": True}
            else:
                if now < start_time:
                    next_available = start_time.strftime("%H:%M")
                else:
                    next_day = self._find_next_working_day(schedule, day_key)
                    next_available = next_day
                
                return {
                    "available": False,
                    "is_within_hours": False,
                    "offline_message": bh.get("offline_message"),
                    "next_available": next_available
                }
        except:
            return {"available": True, "is_within_hours": True}
    
    def _find_next_working_day(self, schedule: Dict, current_day: str) -> str:
        """Find the next working day."""
        days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        current_idx = days.index(current_day) if current_day in days else 0
        
        for i in range(1, 8):
            next_idx = (current_idx + i) % 7
            day_key = days[next_idx]
            day_schedule = schedule.get(day_key, {})
            if day_schedule.get("enabled", False):
                day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                start_time = day_schedule.get("start", "09:00")
                return f"{day_names[next_idx]} at {start_time}"
        
        return "Unknown"

    # ==================== Lead Management ====================

    async def save_lead(self, lead_data: Dict) -> Dict:
        """Save a new lead."""
        import uuid
        
        lead_id = str(uuid.uuid4())[:12]
        now = datetime.utcnow()
        
        lead = {
            "lead_id": lead_id,
            "site_id": lead_data.get("site_id"),
            "session_id": lead_data.get("session_id"),
            "email": lead_data.get("email"),
            "name": lead_data.get("name"),
            "source": lead_data.get("source", "chat"),
            "captured_at": now,
            "metadata": lead_data.get("metadata", {})
        }
        
        await self.db.leads.insert_one(lead)
        lead["id"] = lead_id
        return lead

    async def get_leads(
        self,
        site_id: str,
        page: int = 1,
        limit: int = 20,
        search: str = None
    ) -> Tuple[List[Dict], int]:
        """Get paginated leads for a site."""
        query = {"site_id": site_id}
        
        if search:
            escaped_search = re.escape(search)
            query["$or"] = [
                {"email": {"$regex": escaped_search, "$options": "i"}},
                {"name": {"$regex": escaped_search, "$options": "i"}}
            ]
        
        total = await self.db.leads.count_documents(query)
        
        skip = (page - 1) * limit
        cursor = self.db.leads.find(query).sort("captured_at", -1).skip(skip).limit(limit)
        
        leads = await cursor.to_list(length=limit)
        
        for lead in leads:
            lead["_id"] = str(lead["_id"])
            lead["id"] = lead.get("lead_id", str(lead["_id"]))
        
        return leads, total

    async def get_lead_by_id(self, lead_id: str) -> Optional[Dict]:
        """Get a lead by ID."""
        lead = await self.db.leads.find_one({"lead_id": lead_id})
        if lead:
            lead["_id"] = str(lead["_id"])
            lead["id"] = lead["lead_id"]
        return lead

    async def get_lead_by_session(self, site_id: str, session_id: str) -> Optional[Dict]:
        """Get a lead by session ID."""
        lead = await self.db.leads.find_one({
            "site_id": site_id,
            "session_id": session_id
        })
        if lead:
            lead["_id"] = str(lead["_id"])
            lead["id"] = lead.get("lead_id", str(lead["_id"]))
        return lead

    async def delete_lead(self, lead_id: str) -> bool:
        """Delete a lead by ID."""
        result = await self.db.leads.delete_one({"lead_id": lead_id})
        return result.deleted_count > 0

    async def get_all_leads_for_export(self, site_id: str) -> List[Dict]:
        """Get all leads for a site (for CSV export)."""
        cursor = self.db.leads.find({"site_id": site_id}).sort("captured_at", -1)
        leads = await cursor.to_list(length=10000)
        
        for lead in leads:
            lead["_id"] = str(lead["_id"])
            lead["id"] = lead.get("lead_id", str(lead["_id"]))
        
        return leads

    async def get_leads_count(self, site_id: str) -> int:
        """Get total leads count for a site."""
        return await self.db.leads.count_documents({"site_id": site_id})

    # ==================== Scheduled Crawling Methods ====================

    async def get_crawl_schedule(self, site_id: str) -> Optional[Dict]:
        """Get crawl schedule configuration for a site."""
        site = await self.db.sites.find_one(
            {"site_id": site_id},
            {"crawl_schedule": 1}
        )
        if site:
            return site.get("crawl_schedule", {
                "enabled": False,
                "frequency": "weekly",
                "custom_cron": None,
                "max_pages": 50,
                "include_patterns": [],
                "exclude_patterns": [],
                "notify_on_completion": True,
                "last_crawl_at": None,
                "next_crawl_at": None
            })
        return None

    async def update_crawl_schedule(self, site_id: str, schedule_config: Dict) -> bool:
        """Update crawl schedule configuration for a site."""
        schedule_config["updated_at"] = datetime.utcnow()
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$set": {"crawl_schedule": schedule_config, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

    async def get_sites_with_schedules(self) -> List[Dict]:
        """Get all sites that have scheduled crawling enabled."""
        cursor = self.db.sites.find(
            {"crawl_schedule.enabled": True},
            {"site_id": 1, "url": 1, "crawl_schedule": 1}
        )
        sites = await cursor.to_list(length=1000)
        for site in sites:
            site["_id"] = str(site["_id"])
        return sites

    async def get_crawl_history(self, site_id: str, limit: int = 10) -> List[Dict]:
        """Get crawl history for a site."""
        site = await self.db.sites.find_one({"site_id": site_id}, {"url": 1})
        if not site:
            return []
        
        site_url = site.get("url")
        if not site_url:
            return []
        
        cursor = self.db.crawl_jobs.find(
            {"$or": [{"site_id": site_id}, {"target_url": site_url}]}
        ).sort("created_at", -1).limit(limit)
        
        jobs = await cursor.to_list(length=limit)
        history = []
        
        for job in jobs:
            created_at = job.get("created_at")
            completed_at = job.get("completed_at")
            duration = None
            
            if created_at and completed_at:
                duration = int((completed_at - created_at).total_seconds())
            
            history.append({
                "job_id": str(job.get("_id")),
                "status": job.get("status", "unknown"),
                "pages_crawled": job.get("pages_crawled", 0),
                "pages_indexed": job.get("pages_indexed", 0),
                "errors": job.get("errors", []),
                "trigger": job.get("trigger", "manual"),
                "started_at": created_at,
                "completed_at": completed_at,
                "duration_seconds": duration
            })
        
        return history

    async def get_running_crawl_job(self, site_id: str) -> Optional[Dict]:
        """Check if there's a running crawl job for a site."""
        site = await self.db.sites.find_one({"site_id": site_id}, {"url": 1})
        if not site:
            return None
        
        site_url = site.get("url")
        job = await self.db.crawl_jobs.find_one({
            "$or": [{"site_id": site_id}, {"target_url": site_url}],
            "status": "running"
        })
        
        if job:
            job["_id"] = str(job["_id"])
        return job

    async def create_scheduled_crawl_job(
        self,
        site_id: str,
        target_url: str,
        trigger: str = "manual"
    ) -> str:
        """Create a new crawl job with site_id and trigger tracking."""
        result = await self.db.crawl_jobs.insert_one({
            "site_id": site_id,
            "target_url": target_url,
            "status": "running",
            "pages_crawled": 0,
            "pages_indexed": 0,
            "errors": [],
            "trigger": trigger,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        })
        return str(result.inserted_id)

    # ==================== Platform White-label Methods ====================

    async def get_platform_whitelabel(self) -> Optional[Dict]:
        """Get platform white-label configuration."""
        config = await self.db.platform_settings.find_one({"type": "whitelabel"})
        if config:
            config.pop("_id", None)
            config.pop("type", None)
        return config

    async def update_platform_whitelabel(self, config: Dict) -> Dict:
        """Update platform white-label configuration."""
        config["type"] = "whitelabel"
        config["updated_at"] = datetime.utcnow()
        
        await self.db.platform_settings.update_one(
            {"type": "whitelabel"},
            {"$set": config},
            upsert=True
        )
        
        return await self.get_platform_whitelabel()

    # ==================== Q&A Training Methods ====================

    async def create_qa_pair(self, qa_data: Dict) -> Dict:
        """Create a new Q&A pair."""
        import uuid
        
        qa_data["id"] = qa_data.get("id") or str(uuid.uuid4())
        qa_data["created_at"] = datetime.utcnow()
        qa_data["updated_at"] = datetime.utcnow()
        qa_data["enabled"] = qa_data.get("enabled", True)
        qa_data["use_count"] = qa_data.get("use_count", 0)
        
        await self.db.qa_pairs.insert_one(qa_data)
        qa_data.pop("_id", None)
        return qa_data

    async def get_qa_pairs(
        self,
        site_id: str,
        page: int = 1,
        limit: int = 20,
        search: str = None,
        enabled_only: bool = False
    ) -> Tuple[List[Dict], int]:
        """Get paginated Q&A pairs for a site."""
        query = {"site_id": site_id}
        
        if enabled_only:
            query["enabled"] = True
        
        if search:
            escaped_search = re.escape(search)
            query["$or"] = [
                {"question": {"$regex": escaped_search, "$options": "i"}},
                {"answer": {"$regex": escaped_search, "$options": "i"}}
            ]
        
        total = await self.db.qa_pairs.count_documents(query)
        
        skip = (page - 1) * limit
        cursor = self.db.qa_pairs.find(query).sort("created_at", -1).skip(skip).limit(limit)
        
        qa_pairs = await cursor.to_list(length=limit)
        
        for qa in qa_pairs:
            qa.pop("_id", None)
        
        return qa_pairs, total

    async def get_qa_pair(self, qa_id: str) -> Optional[Dict]:
        """Get a single Q&A pair by ID."""
        qa = await self.db.qa_pairs.find_one({"id": qa_id})
        if qa:
            qa.pop("_id", None)
        return qa

    async def update_qa_pair(self, qa_id: str, updates: Dict) -> Optional[Dict]:
        """Update a Q&A pair."""
        updates["updated_at"] = datetime.utcnow()
        
        result = await self.db.qa_pairs.update_one(
            {"id": qa_id},
            {"$set": updates}
        )
        
        if result.modified_count > 0:
            return await self.get_qa_pair(qa_id)
        return None

    async def delete_qa_pair(self, qa_id: str) -> bool:
        """Delete a Q&A pair."""
        result = await self.db.qa_pairs.delete_one({"id": qa_id})
        return result.deleted_count > 0

    async def increment_qa_use_count(self, qa_id: str) -> bool:
        """Increment the use count for a Q&A pair."""
        result = await self.db.qa_pairs.update_one(
            {"id": qa_id},
            {"$inc": {"use_count": 1}}
        )
        return result.modified_count > 0

    async def get_qa_for_rag(self, site_id: str) -> List[Dict]:
        """Get all enabled Q&A pairs for RAG retrieval."""
        cursor = self.db.qa_pairs.find({
            "site_id": site_id,
            "enabled": True
        })
        
        qa_pairs = await cursor.to_list(length=1000)
        
        for qa in qa_pairs:
            qa.pop("_id", None)
        
        return qa_pairs

    async def get_qa_stats(self, site_id: str) -> Dict:
        """Get Q&A statistics for a site."""
        pipeline = [
            {"$match": {"site_id": site_id}},
            {"$group": {
                "_id": None,
                "total_pairs": {"$sum": 1},
                "enabled_pairs": {"$sum": {"$cond": ["$enabled", 1, 0]}},
                "total_uses": {"$sum": "$use_count"}
            }}
        ]
        
        result = await self.db.qa_pairs.aggregate(pipeline).to_list(1)
        
        stats = {
            "total_pairs": 0,
            "enabled_pairs": 0,
            "total_uses": 0,
            "most_used": []
        }
        
        if result:
            stats["total_pairs"] = result[0].get("total_pairs", 0)
            stats["enabled_pairs"] = result[0].get("enabled_pairs", 0)
            stats["total_uses"] = result[0].get("total_uses", 0)
        
        most_used_cursor = self.db.qa_pairs.find(
            {"site_id": site_id, "use_count": {"$gt": 0}}
        ).sort("use_count", -1).limit(5)
        
        most_used = await most_used_cursor.to_list(5)
        for qa in most_used:
            qa.pop("_id", None)
            stats["most_used"].append({
                "id": qa["id"],
                "question": qa["question"][:50] + "..." if len(qa["question"]) > 50 else qa["question"],
                "use_count": qa["use_count"]
            })
        
        return stats

    async def get_message_by_index(self, session_id: str, message_index: int) -> Optional[Dict]:
        """Get a specific message from a conversation by its index."""
        conv = await self.db.conversations.find_one({"session_id": session_id})
        if not conv:
            return None
        
        messages = conv.get("messages", [])
        if message_index < 0 or message_index >= len(messages):
            return None
        
        return messages[message_index]

    async def mark_message_has_qa(self, session_id: str, message_index: int, qa_id: str) -> bool:
        """Mark a message as having a Q&A pair created from it."""
        result = await self.db.conversations.update_one(
            {"session_id": session_id},
            {"$set": {f"messages.{message_index}.qa_pair_id": qa_id}}
        )
        return result.modified_count > 0


# Singleton instance
_mongodb: Optional[MongoDB] = None


async def get_mongodb() -> MongoDB:
    """Get or create MongoDB instance."""
    global _mongodb
    if _mongodb is None:
        _mongodb = MongoDB()
        await _mongodb.connect()
    return _mongodb
