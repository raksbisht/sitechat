"""
Mock implementation of the database provider for testing.
Stores data in memory, implements the same interface as real providers.
"""
from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
import re

from .base import BaseDatabaseProvider


class MockDatabaseProvider(BaseDatabaseProvider):
    """
    In-memory mock database provider for testing.
    
    Implements the same interface as MongoDBProvider but stores
    data in memory dictionaries. Useful for unit and integration tests.
    """
    
    def __init__(self):
        self.reset()
    
    def reset(self):
        """Reset all data stores to empty state."""
        self._users: Dict[str, Dict] = {}
        self._sites: Dict[str, Dict] = {}
        self._conversations: Dict[str, Dict] = {}
        self._crawl_jobs: Dict[str, Dict] = {}
        self._pages: Dict[str, Dict] = {}
        self._documents: Dict[str, Dict] = {}
        self._handoffs: Dict[str, Dict] = {}
        self._trigger_events: List[Dict] = []
        self._platform_settings: Dict[str, Dict] = {}
        self._connected = False
    
    # ===========================================
    # Connection Management
    # ===========================================
    
    async def connect(self) -> None:
        """Simulate database connection."""
        self._connected = True
    
    async def disconnect(self) -> None:
        """Simulate database disconnection."""
        self._connected = False
    
    async def health_check(self) -> bool:
        """Return connection status."""
        return self._connected
    
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
        now = datetime.utcnow()
        message = {
            "role": role,
            "content": content,
            "sources": sources or [],
            "metadata": metadata or {},
            "timestamp": now,
            "message_id": f"{session_id}_{now.timestamp()}"
        }
        
        if confidence is not None:
            message["confidence"] = confidence
        if response_time_ms is not None:
            message["response_time_ms"] = response_time_ms
        
        if session_id not in self._conversations:
            self._conversations[session_id] = {
                "session_id": session_id,
                "site_id": site_id,
                "messages": [],
                "created_at": now,
                "updated_at": now
            }
        
        self._conversations[session_id]["messages"].append(message)
        self._conversations[session_id]["updated_at"] = now
        if site_id:
            self._conversations[session_id]["site_id"] = site_id
    
    async def get_conversation_history(
        self,
        session_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """Get recent messages from conversation."""
        conv = self._conversations.get(session_id)
        if not conv:
            return []
        messages = conv.get("messages", [])
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
        conversations = list(self._conversations.values())
        
        if site_id:
            conversations = [c for c in conversations if c.get("site_id") == site_id]
        
        if search:
            pattern = re.compile(re.escape(search), re.IGNORECASE)
            conversations = [
                c for c in conversations
                if any(pattern.search(m.get("content", "")) for m in c.get("messages", []))
            ]
        
        reverse = sort_order == -1
        conversations.sort(key=lambda x: x.get(sort_by, datetime.min), reverse=reverse)
        
        total = len(conversations)
        conversations = conversations[skip:skip + limit]
        
        result = []
        for conv in conversations:
            conv_copy = {
                "session_id": conv["session_id"],
                "site_id": conv.get("site_id"),
                "created_at": conv.get("created_at"),
                "updated_at": conv.get("updated_at"),
                "message_count": len(conv.get("messages", [])),
                "first_message": conv.get("messages", [{}])[0].get("content", "")[:100] if conv.get("messages") else ""
            }
            result.append(conv_copy)
        
        return {
            "conversations": result,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_conversation_full(self, session_id: str) -> Optional[Dict]:
        """Get full conversation with all messages."""
        conv = self._conversations.get(session_id)
        if not conv:
            return None
        
        messages = conv.get("messages", [])
        positive_feedback = sum(1 for m in messages if m.get("feedback") == "positive")
        negative_feedback = sum(1 for m in messages if m.get("feedback") == "negative")
        response_times = [m.get("response_time_ms") for m in messages if m.get("response_time_ms")]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        return {
            **conv,
            "_id": conv["session_id"],
            "stats": {
                "message_count": len(messages),
                "user_messages": sum(1 for m in messages if m.get("role") == "user"),
                "assistant_messages": sum(1 for m in messages if m.get("role") == "assistant"),
                "positive_feedback": positive_feedback,
                "negative_feedback": negative_feedback,
                "avg_response_time_ms": round(avg_response_time, 2)
            }
        }
    
    async def delete_conversations_bulk(self, session_ids: List[str]) -> int:
        """Delete multiple conversations."""
        count = 0
        for sid in session_ids:
            if sid in self._conversations:
                del self._conversations[sid]
                count += 1
        return count
    
    # ===========================================
    # Site Operations
    # ===========================================
    
    async def create_site(self, site_data: Dict) -> str:
        """Create a new site."""
        site_id = site_data.get("site_id") or str(uuid.uuid4())[:12]
        now = datetime.utcnow()
        
        site = {
            **site_data,
            "site_id": site_id,
            "created_at": now,
            "updated_at": now
        }
        
        self._sites[site_id] = site
        return site_id
    
    async def get_site(self, site_id: str) -> Optional[Dict]:
        """Get site by ID."""
        site = self._sites.get(site_id)
        if site:
            return {**site, "_id": site_id}
        return None
    
    async def list_sites(self, user_id: Optional[str] = None) -> List[Dict]:
        """List all sites."""
        sites = list(self._sites.values())
        
        if user_id:
            sites = [s for s in sites if s.get("user_id") == user_id]
        
        sites.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
        
        return [{**s, "_id": s["site_id"]} for s in sites]
    
    async def update_site(self, site_id: str, updates: Dict) -> bool:
        """Update site data."""
        if site_id not in self._sites:
            return False
        
        self._sites[site_id].update(updates)
        self._sites[site_id]["updated_at"] = datetime.utcnow()
        return True
    
    async def delete_site(self, site_id: str) -> bool:
        """Delete a site."""
        if site_id in self._sites:
            del self._sites[site_id]
            return True
        return False
    
    async def get_site_config(self, site_id: str) -> Optional[Dict]:
        """Get site configuration."""
        site = self._sites.get(site_id)
        if not site:
            return None
        return {
            "config": site.get("config", {}),
            "appearance": site.get("appearance", {}),
            "behavior": site.get("behavior", {})
        }
    
    async def update_site_config(self, site_id: str, config: Dict) -> bool:
        """Update site configuration."""
        if site_id not in self._sites:
            return False
        
        self._sites[site_id].update(config)
        self._sites[site_id]["updated_at"] = datetime.utcnow()
        return True
    
    # ===========================================
    # User Operations
    # ===========================================
    
    async def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email."""
        for user in self._users.values():
            if user.get("email") == email:
                return {**user, "_id": user["user_id"]}
        return None
    
    async def create_user(self, user_data: Dict) -> str:
        """Create a new user."""
        user_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        user = {
            **user_data,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now
        }
        
        self._users[user_id] = user
        return user_id
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user by ID."""
        user = self._users.get(user_id)
        if user:
            return {**user, "_id": user_id}
        return None
    
    # ===========================================
    # Crawl Job Operations
    # ===========================================
    
    async def create_crawl_job(self, target_url: str) -> str:
        """Create a crawl job."""
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        job = {
            "_id": job_id,
            "target_url": target_url,
            "status": "running",
            "pages_crawled": 0,
            "pages_indexed": 0,
            "errors": [],
            "created_at": now,
            "updated_at": now
        }
        
        self._crawl_jobs[job_id] = job
        return job_id
    
    async def update_crawl_job(
        self,
        job_id: str,
        status: Optional[str] = None,
        pages_crawled: Optional[int] = None,
        pages_indexed: Optional[int] = None,
        error: Optional[str] = None
    ) -> bool:
        """Update crawl job status."""
        if job_id not in self._crawl_jobs:
            return False
        
        job = self._crawl_jobs[job_id]
        job["updated_at"] = datetime.utcnow()
        
        if status:
            job["status"] = status
        if pages_crawled is not None:
            job["pages_crawled"] = pages_crawled
        if pages_indexed is not None:
            job["pages_indexed"] = pages_indexed
        if error:
            job["errors"].append(error)
        
        return True
    
    async def get_crawl_job(self, job_id: str) -> Optional[Dict]:
        """Get crawl job by ID."""
        return self._crawl_jobs.get(job_id)
    
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
        now = datetime.utcnow()
        
        if url in self._pages:
            self._pages[url].update({
                "title": title,
                "content": content,
                "chunk_count": chunk_count,
                "metadata": metadata or {},
                "last_crawled": now,
                "status": "indexed"
            })
        else:
            self._pages[url] = {
                "url": url,
                "title": title,
                "content": content,
                "chunk_count": chunk_count,
                "metadata": metadata or {},
                "created_at": now,
                "last_crawled": now,
                "status": "indexed"
            }
    
    async def get_page(self, url: str) -> Optional[Dict]:
        """Get page by URL."""
        return self._pages.get(url)
    
    async def get_all_pages(self, status: Optional[str] = None) -> List[Dict]:
        """Get all pages."""
        pages = list(self._pages.values())
        if status:
            pages = [p for p in pages if p.get("status") == status]
        pages.sort(key=lambda x: x.get("last_crawled", datetime.min), reverse=True)
        return pages
    
    # ===========================================
    # Document Operations
    # ===========================================
    
    async def save_document(self, doc_data: Dict) -> str:
        """Save document metadata."""
        doc_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        doc = {
            **doc_data,
            "document_id": doc_id,
            "created_at": now,
            "updated_at": now
        }
        
        self._documents[doc_id] = doc
        return doc_id
    
    async def get_documents(self, site_id: str) -> List[Dict]:
        """Get all documents for a site."""
        docs = [d for d in self._documents.values() if d.get("site_id") == site_id]
        docs.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
        return [{**d, "_id": d["document_id"]} for d in docs]
    
    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document."""
        if doc_id in self._documents:
            del self._documents[doc_id]
            return True
        return False
    
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
        conversations = list(self._conversations.values())
        
        if site_id:
            conversations = [c for c in conversations if c.get("site_id") == site_id]
        
        if start_date:
            conversations = [c for c in conversations if c.get("created_at", datetime.min) >= start_date]
        
        if end_date:
            conversations = [c for c in conversations if c.get("created_at", datetime.max) <= end_date]
        
        total_messages = sum(len(c.get("messages", [])) for c in conversations)
        
        return {
            "total_conversations": len(conversations),
            "total_messages": total_messages,
            "site_id": site_id
        }
    
    # ===========================================
    # Trigger Operations
    # ===========================================
    
    async def get_site_triggers(self, site_id: str) -> Dict:
        """Get triggers for a site."""
        site = self._sites.get(site_id)
        if not site:
            return {"triggers": [], "global_cooldown_ms": 30000}
        
        return {
            "triggers": site.get("triggers", []),
            "global_cooldown_ms": site.get("global_cooldown_ms", 30000)
        }
    
    async def save_trigger(self, site_id: str, trigger: Dict) -> Dict:
        """Save a new trigger."""
        now = datetime.utcnow()
        
        if site_id not in self._sites:
            self._sites[site_id] = {"site_id": site_id, "triggers": []}
        
        site = self._sites[site_id]
        
        if not trigger.get("id"):
            trigger["id"] = str(uuid.uuid4())[:8]
            trigger["created_at"] = now
        
        trigger["updated_at"] = now
        
        existing_idx = None
        for idx, t in enumerate(site.get("triggers", [])):
            if t["id"] == trigger["id"]:
                existing_idx = idx
                break
        
        if existing_idx is not None:
            site["triggers"][existing_idx] = trigger
        else:
            if "triggers" not in site:
                site["triggers"] = []
            site["triggers"].append(trigger)
        
        return trigger
    
    async def update_trigger(self, site_id: str, trigger_id: str, updates: Dict) -> Optional[Dict]:
        """Update an existing trigger."""
        site = self._sites.get(site_id)
        if not site:
            return None
        
        triggers = site.get("triggers", [])
        for trigger in triggers:
            if trigger["id"] == trigger_id:
                trigger.update(updates)
                trigger["updated_at"] = datetime.utcnow()
                return trigger
        
        return None
    
    async def delete_trigger(self, site_id: str, trigger_id: str) -> bool:
        """Delete a trigger."""
        site = self._sites.get(site_id)
        if not site:
            return False
        
        triggers = site.get("triggers", [])
        original_len = len(triggers)
        site["triggers"] = [t for t in triggers if t["id"] != trigger_id]
        
        return len(site["triggers"]) < original_len
    
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
        
        self._handoffs[handoff_id] = handoff
        return handoff_id
    
    async def get_handoff_session(self, handoff_id: str) -> Optional[Dict]:
        """Get handoff session by ID."""
        handoff = self._handoffs.get(handoff_id)
        if handoff:
            return {**handoff, "_id": handoff_id}
        return None
    
    async def update_handoff_status(
        self,
        handoff_id: str,
        status: str,
        agent_id: Optional[str] = None,
        agent_name: Optional[str] = None
    ) -> bool:
        """Update handoff status."""
        if handoff_id not in self._handoffs:
            return False
        
        handoff = self._handoffs[handoff_id]
        handoff["status"] = status
        handoff["updated_at"] = datetime.utcnow()
        
        if agent_id:
            handoff["assigned_agent_id"] = agent_id
        if agent_name:
            handoff["assigned_agent_name"] = agent_name
        if status == "resolved":
            handoff["resolved_at"] = datetime.utcnow()
        
        return True
    
    async def get_handoff_queue(
        self,
        site_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict]:
        """Get handoff queue."""
        handoffs = list(self._handoffs.values())
        
        if site_id:
            handoffs = [h for h in handoffs if h.get("site_id") == site_id]
        
        if status:
            handoffs = [h for h in handoffs if h.get("status") == status]
        else:
            handoffs = [h for h in handoffs if h.get("status") in ["pending", "active"]]
        
        handoffs.sort(key=lambda x: (x.get("status", ""), x.get("created_at", datetime.min)))
        
        return [{**h, "_id": h["handoff_id"]} for h in handoffs[:100]]
    
    # ===========================================
    # Platform Settings
    # ===========================================
    
    async def get_platform_whitelabel(self) -> Optional[Dict]:
        """Get platform white-label settings."""
        config = self._platform_settings.get("whitelabel")
        if config:
            return {k: v for k, v in config.items() if k not in ["_id", "type"]}
        return None
    
    async def update_platform_whitelabel(self, config: Dict) -> Dict:
        """Update platform white-label settings."""
        config["type"] = "whitelabel"
        config["updated_at"] = datetime.utcnow()
        
        self._platform_settings["whitelabel"] = config
        return await self.get_platform_whitelabel()
    
    # ===========================================
    # Test Helper Methods
    # ===========================================
    
    def seed_user(self, user_data: Dict) -> str:
        """Seed a user directly (for test setup)."""
        user_id = user_data.get("user_id") or str(uuid.uuid4())
        user_data["user_id"] = user_id
        self._users[user_id] = user_data
        return user_id
    
    def seed_site(self, site_data: Dict) -> str:
        """Seed a site directly (for test setup)."""
        site_id = site_data.get("site_id") or str(uuid.uuid4())[:12]
        site_data["site_id"] = site_id
        self._sites[site_id] = site_data
        return site_id
    
    def seed_conversation(self, conv_data: Dict) -> str:
        """Seed a conversation directly (for test setup)."""
        session_id = conv_data.get("session_id") or str(uuid.uuid4())
        conv_data["session_id"] = session_id
        self._conversations[session_id] = conv_data
        return session_id
    
    # ===========================================
    # Extended Methods (Legacy MongoDB compatibility)
    # ===========================================
    
    async def get_site_handoff_config(self, site_id: str) -> Optional[Dict]:
        """Get handoff configuration for a site."""
        site = self._sites.get(site_id)
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
                "offline_message": "We're currently offline."
            },
            "auto_suggest_phrases": []
        })
    
    async def update_site_handoff_config(self, site_id: str, config: Dict) -> bool:
        """Update handoff configuration for a site."""
        if site_id not in self._sites:
            return False
        
        self._sites[site_id]["handoff_config"] = config
        self._sites[site_id]["updated_at"] = datetime.utcnow()
        return True
    
    async def log_trigger_event(
        self,
        site_id: str,
        trigger_id: str,
        session_id: str,
        event_type: str,
        metadata: Optional[Dict] = None
    ) -> str:
        """Log a trigger event for analytics."""
        event_id = str(uuid.uuid4())
        event = {
            "id": event_id,
            "site_id": site_id,
            "trigger_id": trigger_id,
            "session_id": session_id,
            "event_type": event_type,
            "timestamp": datetime.utcnow(),
            "metadata": metadata or {}
        }
        self._trigger_events.append(event)
        return event_id
    
    async def get_trigger_analytics(
        self,
        site_id: str,
        period_days: int = 7
    ) -> List[Dict]:
        """Get trigger analytics for a site."""
        from datetime import timedelta
        
        start_date = datetime.utcnow() - timedelta(days=period_days)
        
        events = [e for e in self._trigger_events 
                  if e.get("site_id") == site_id and e.get("timestamp", datetime.min) >= start_date]
        
        trigger_stats = {}
        for event in events:
            tid = event.get("trigger_id")
            if tid not in trigger_stats:
                trigger_stats[tid] = {"shown": 0, "clicked": 0, "dismissed": 0, "converted": 0}
            
            event_type = event.get("event_type", "")
            if event_type in trigger_stats[tid]:
                trigger_stats[tid][event_type] += 1
        
        site = self._sites.get(site_id)
        trigger_names = {t["id"]: t.get("name", "Unknown") for t in site.get("triggers", [])} if site else {}
        
        analytics = []
        for tid, stats in trigger_stats.items():
            shown = stats["shown"]
            clicked = stats["clicked"]
            converted = stats["converted"]
            
            analytics.append({
                "trigger_id": tid,
                "trigger_name": trigger_names.get(tid, "Unknown"),
                "shown_count": shown,
                "clicked_count": clicked,
                "dismissed_count": stats["dismissed"],
                "converted_count": converted,
                "click_rate": round((clicked / shown * 100) if shown > 0 else 0, 1),
                "conversion_rate": round((converted / shown * 100) if shown > 0 else 0, 1)
            })
        
        return analytics
    
    async def reorder_triggers(self, site_id: str, trigger_ids: List[str]) -> bool:
        """Reorder triggers by setting priority based on list order."""
        site = self._sites.get(site_id)
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
        site["triggers"] = reordered + remaining
        
        return True
    
    async def set_global_cooldown(self, site_id: str, cooldown_ms: int) -> bool:
        """Set global cooldown between triggers for a site."""
        if site_id not in self._sites:
            return False
        
        self._sites[site_id]["global_cooldown_ms"] = cooldown_ms
        return True
    
    async def add_handoff_message(
        self,
        handoff_id: str,
        role: str,
        content: str,
        sender_name: Optional[str] = None
    ) -> Optional[Dict]:
        """Add a message to a handoff session."""
        if handoff_id not in self._handoffs:
            return None
        
        message = {
            "id": str(uuid.uuid4())[:8],
            "role": role,
            "content": content,
            "sender_name": sender_name,
            "timestamp": datetime.utcnow()
        }
        
        self._handoffs[handoff_id]["messages"].append(message)
        self._handoffs[handoff_id]["updated_at"] = datetime.utcnow()
        
        return message
    
    async def get_handoff_messages(
        self,
        handoff_id: str,
        since: Optional[datetime] = None
    ) -> Dict:
        """Get messages from a handoff session."""
        handoff = self._handoffs.get(handoff_id)
        if not handoff:
            return {"messages": [], "status": None, "agent_name": None}
        
        messages = handoff.get("messages", [])
        
        if since:
            messages = [m for m in messages if m.get("timestamp", datetime.min) > since]
        
        return {
            "messages": messages,
            "status": handoff.get("status"),
            "agent_name": handoff.get("assigned_agent_name")
        }
    
    async def get_handoff_by_session(self, session_id: str, active_only: bool = True) -> Optional[Dict]:
        """Get active handoff for a chat session."""
        for handoff in self._handoffs.values():
            if handoff.get("session_id") == session_id:
                if active_only and handoff.get("status") not in ["pending", "active"]:
                    continue
                return {**handoff, "_id": handoff["handoff_id"]}
        return None
    
    async def check_business_hours(self, site_id: str) -> Dict:
        """Check if site is within business hours."""
        return {"available": True, "is_within_hours": True}
    
    async def add_message_feedback(
        self,
        session_id: str,
        message_id: str,
        feedback: str
    ) -> bool:
        """Add feedback to a specific message."""
        conv = self._conversations.get(session_id)
        if not conv:
            return False
        
        for message in conv.get("messages", []):
            if message.get("message_id") == message_id:
                message["feedback"] = feedback
                message["feedback_at"] = datetime.utcnow()
                return True
        return False
