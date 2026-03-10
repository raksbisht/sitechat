"""
MongoDB implementation of the database provider.
Wraps the existing MongoDB class to maintain backward compatibility.
"""
from datetime import datetime
from typing import Dict, List, Optional, Any
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from loguru import logger
import re
import uuid

from app.config import settings
from .base import BaseDatabaseProvider


class MongoDBProvider(BaseDatabaseProvider):
    """MongoDB implementation of database provider."""
    
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
    
    # ===========================================
    # Connection Management
    # ===========================================
    
    async def connect(self) -> None:
        """Connect to MongoDB."""
        try:
            self.client = AsyncIOMotorClient(settings.MONGODB_URL)
            self.db = self.client[settings.MONGODB_DB]
            await self.client.admin.command('ping')
            logger.info(f"Connected to MongoDB: {settings.MONGODB_DB}")
            await self._create_indexes()
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
    
    async def disconnect(self) -> None:
        """Close MongoDB connection."""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    async def health_check(self) -> bool:
        """Check if MongoDB is accessible."""
        try:
            await self.client.admin.command('ping')
            return True
        except Exception:
            return False
    
    async def _create_indexes(self):
        """Create necessary indexes for performance."""
        try:
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
            await self.db.users.create_index("email", unique=True)
            await self.db.documents.create_index("site_id")
            logger.info("MongoDB indexes created")
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")
    
    # ===========================================
    # Conversation/Message Operations
    # ===========================================
    
    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        site_id: Optional[str] = None,
        sources: Optional[List[Dict]] = None,
        confidence: Optional[float] = None,
        response_time_ms: Optional[int] = None,
        metadata: Optional[Dict] = None
    ) -> None:
        """Save a message to conversation history."""
        message = {
            "role": role,
            "content": content,
            "sources": sources or [],
            "metadata": metadata or {},
            "timestamp": datetime.utcnow(),
            "message_id": f"{session_id}_{datetime.utcnow().timestamp()}"
        }
        
        if confidence is not None:
            message["confidence"] = confidence
        if response_time_ms is not None:
            message["response_time_ms"] = response_time_ms
        
        update_set = {"updated_at": datetime.utcnow()}
        if site_id:
            update_set["site_id"] = site_id
        
        await self.db.conversations.update_one(
            {"session_id": session_id},
            {
                "$push": {"messages": message},
                "$set": update_set,
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
    
    async def get_conversation_history(
        self,
        session_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """Get recent messages from conversation."""
        doc = await self.db.conversations.find_one({"session_id": session_id})
        if not doc:
            return []
        messages = doc.get("messages", [])
        return messages[-limit:] if limit else messages
    
    async def get_conversations_paginated(
        self,
        site_id: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "updated_at",
        sort_order: int = -1
    ) -> Dict:
        """Get paginated list of conversations."""
        query = {}
        if site_id:
            query["site_id"] = site_id
        if search:
            escaped_query = re.escape(search)
            query["messages.content"] = {"$regex": escaped_query, "$options": "i"}
        
        total = await self.db.conversations.count_documents(query)
        
        cursor = self.db.conversations.find(
            query,
            {
                "session_id": 1,
                "site_id": 1,
                "created_at": 1,
                "updated_at": 1,
                "messages": {"$slice": 1}
            }
        ).sort(sort_by, sort_order).skip(skip).limit(limit)
        
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
        
        return {
            "conversations": conversations,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_conversation_full(self, session_id: str) -> Optional[Dict]:
        """Get full conversation with all messages."""
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
    
    async def delete_conversations_bulk(self, session_ids: List[str]) -> int:
        """Delete multiple conversations."""
        result = await self.db.conversations.delete_many({
            "session_id": {"$in": session_ids}
        })
        return result.deleted_count
    
    # ===========================================
    # Site Operations
    # ===========================================
    
    async def create_site(self, site_data: Dict) -> str:
        """Create a new site."""
        site_id = site_data.get("site_id") or str(uuid.uuid4())[:12]
        site_data["site_id"] = site_id
        site_data["created_at"] = datetime.utcnow()
        site_data["updated_at"] = datetime.utcnow()
        
        await self.db.sites.insert_one(site_data)
        return site_id
    
    async def get_site(self, site_id: str) -> Optional[Dict]:
        """Get site by ID."""
        site = await self.db.sites.find_one({"site_id": site_id})
        if site:
            site["_id"] = str(site["_id"])
        return site
    
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
    
    async def get_site_config(self, site_id: str) -> Optional[Dict]:
        """Get site configuration."""
        site = await self.db.sites.find_one(
            {"site_id": site_id},
            {"config": 1, "appearance": 1, "behavior": 1}
        )
        if site:
            site.pop("_id", None)
        return site
    
    async def update_site_config(self, site_id: str, config: Dict) -> bool:
        """Update site configuration."""
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$set": config, "$currentDate": {"updated_at": True}}
        )
        return result.modified_count > 0
    
    # ===========================================
    # User Operations
    # ===========================================
    
    async def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email."""
        user = await self.db.users.find_one({"email": email})
        if user:
            user["_id"] = str(user["_id"])
        return user
    
    async def create_user(self, user_data: Dict) -> str:
        """Create a new user."""
        user_id = str(uuid.uuid4())
        user_data["user_id"] = user_id
        user_data["created_at"] = datetime.utcnow()
        user_data["updated_at"] = datetime.utcnow()
        
        await self.db.users.insert_one(user_data)
        return user_id
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user by ID."""
        user = await self.db.users.find_one({"user_id": user_id})
        if user:
            user["_id"] = str(user["_id"])
        return user
    
    # ===========================================
    # Crawl Job Operations
    # ===========================================
    
    async def create_crawl_job(self, target_url: str) -> str:
        """Create a crawl job."""
        from bson import ObjectId
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
        status: Optional[str] = None,
        pages_crawled: Optional[int] = None,
        pages_indexed: Optional[int] = None,
        error: Optional[str] = None
    ) -> bool:
        """Update crawl job status."""
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
        
        result = await self.db.crawl_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": update, "$push": push_ops} if push_ops else {"$set": update}
        )
        return result.modified_count > 0
    
    async def get_crawl_job(self, job_id: str) -> Optional[Dict]:
        """Get crawl job by ID."""
        from bson import ObjectId
        job = await self.db.crawl_jobs.find_one({"_id": ObjectId(job_id)})
        if job:
            job["_id"] = str(job["_id"])
        return job
    
    # ===========================================
    # Page Operations
    # ===========================================
    
    async def save_page(
        self,
        url: str,
        title: str,
        content: str,
        chunk_count: int = 0,
        metadata: Optional[Dict] = None
    ) -> None:
        """Save a crawled page."""
        await self.db.pages.update_one(
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
    
    async def get_page(self, url: str) -> Optional[Dict]:
        """Get page by URL."""
        return await self.db.pages.find_one({"url": url})
    
    async def get_all_pages(self, status: Optional[str] = None) -> List[Dict]:
        """Get all pages."""
        query = {"status": status} if status else {}
        cursor = self.db.pages.find(query).sort("last_crawled", -1)
        return await cursor.to_list(length=1000)
    
    # ===========================================
    # Document Operations
    # ===========================================
    
    async def save_document(self, doc_data: Dict) -> str:
        """Save document metadata."""
        doc_id = str(uuid.uuid4())
        doc_data["document_id"] = doc_id
        doc_data["created_at"] = datetime.utcnow()
        doc_data["updated_at"] = datetime.utcnow()
        
        await self.db.documents.insert_one(doc_data)
        return doc_id
    
    async def get_documents(self, site_id: str) -> List[Dict]:
        """Get all documents for a site."""
        cursor = self.db.documents.find({"site_id": site_id}).sort("created_at", -1)
        docs = await cursor.to_list(length=100)
        for doc in docs:
            doc["_id"] = str(doc["_id"])
        return docs
    
    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document."""
        result = await self.db.documents.delete_one({"document_id": doc_id})
        return result.deleted_count > 0
    
    # ===========================================
    # Analytics Operations
    # ===========================================
    
    async def get_analytics_overview(
        self,
        site_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Get analytics overview."""
        query = {}
        if site_id:
            query["site_id"] = site_id
        if start_date or end_date:
            query["created_at"] = {}
            if start_date:
                query["created_at"]["$gte"] = start_date
            if end_date:
                query["created_at"]["$lte"] = end_date
        
        total_conversations = await self.db.conversations.count_documents(query)
        
        pipeline = [
            {"$match": query},
            {"$project": {"message_count": {"$size": {"$ifNull": ["$messages", []]}}}},
            {"$group": {"_id": None, "total_messages": {"$sum": "$message_count"}}}
        ]
        result = await self.db.conversations.aggregate(pipeline).to_list(1)
        total_messages = result[0]["total_messages"] if result else 0
        
        return {
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "site_id": site_id
        }
    
    # ===========================================
    # Trigger Operations
    # ===========================================
    
    async def get_site_triggers(self, site_id: str) -> Dict:
        """Get triggers for a site."""
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
        """Save a new trigger."""
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
        """Update an existing trigger."""
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
        """Delete a trigger."""
        result = await self.db.sites.update_one(
            {"site_id": site_id},
            {"$pull": {"triggers": {"id": trigger_id}}}
        )
        return result.modified_count > 0
    
    # ===========================================
    # Handoff Operations
    # ===========================================
    
    async def create_handoff_session(
        self,
        session_id: str,
        site_id: str,
        reason: str,
        visitor_email: Optional[str] = None,
        visitor_name: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> str:
        """Create a handoff session."""
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
            "ai_conversation": [],
            "messages": [],
            "assigned_agent_id": None,
            "assigned_agent_name": None,
            "created_at": now,
            "updated_at": now,
            "resolved_at": None
        }
        
        await self.db.handoff_sessions.insert_one(handoff)
        return handoff_id
    
    async def get_handoff_session(self, handoff_id: str) -> Optional[Dict]:
        """Get handoff session by ID."""
        handoff = await self.db.handoff_sessions.find_one({"handoff_id": handoff_id})
        if handoff:
            handoff["_id"] = str(handoff["_id"])
        return handoff
    
    async def update_handoff_status(
        self,
        handoff_id: str,
        status: str,
        agent_id: Optional[str] = None,
        agent_name: Optional[str] = None
    ) -> bool:
        """Update handoff status."""
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
        
        return result.modified_count > 0
    
    async def get_handoff_queue(
        self,
        site_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict]:
        """Get handoff queue."""
        query = {}
        if site_id:
            query["site_id"] = site_id
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": ["pending", "active"]}
        
        cursor = self.db.handoff_sessions.find(query).sort([
            ("status", 1),
            ("created_at", 1)
        ]).limit(100)
        
        handoffs = await cursor.to_list(length=100)
        
        for h in handoffs:
            h["_id"] = str(h["_id"])
        
        return handoffs
    
    # ===========================================
    # Platform Settings
    # ===========================================
    
    async def get_platform_whitelabel(self) -> Optional[Dict]:
        """Get platform white-label settings."""
        config = await self.db.platform_settings.find_one({"type": "whitelabel"})
        if config:
            config.pop("_id", None)
            config.pop("type", None)
        return config
    
    async def update_platform_whitelabel(self, config: Dict) -> Dict:
        """Update platform white-label settings."""
        config["type"] = "whitelabel"
        config["updated_at"] = datetime.utcnow()
        
        await self.db.platform_settings.update_one(
            {"type": "whitelabel"},
            {"$set": config},
            upsert=True
        )
        
        return await self.get_platform_whitelabel()
    
    # ===========================================
    # Legacy Methods (for backward compatibility)
    # ===========================================
    
    async def add_message_feedback(
        self,
        session_id: str,
        message_id: str,
        feedback: str
    ) -> bool:
        """Add feedback to a specific message."""
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
