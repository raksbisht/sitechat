"""
Abstract base class for database providers.
Defines the interface that all database implementations must follow.
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from datetime import datetime


class BaseDatabaseProvider(ABC):
    """
    Abstract base class for database operations.
    
    All database providers (MongoDB, PostgreSQL, etc.) must implement this interface.
    """
    
    # ===========================================
    # Connection Management
    # ===========================================
    
    @abstractmethod
    async def connect(self) -> None:
        """Establish database connection."""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Close database connection."""
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Check if database is healthy and accessible."""
        pass
    
    # ===========================================
    # Conversation/Message Operations
    # ===========================================
    
    @abstractmethod
    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        site_id: Optional[str] = None,
        sources: Optional[List[Dict]] = None,
        confidence: Optional[float] = None
    ) -> None:
        """Save a chat message to conversation history."""
        pass
    
    @abstractmethod
    async def get_conversation_history(
        self,
        session_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """Get recent messages from a conversation."""
        pass
    
    @abstractmethod
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
        pass
    
    @abstractmethod
    async def get_conversation_full(self, session_id: str) -> Optional[Dict]:
        """Get full conversation with all messages."""
        pass
    
    @abstractmethod
    async def delete_conversations_bulk(self, session_ids: List[str]) -> int:
        """Delete multiple conversations."""
        pass
    
    # ===========================================
    # Site Operations
    # ===========================================
    
    @abstractmethod
    async def create_site(self, site_data: Dict) -> str:
        """Create a new site. Returns site_id."""
        pass
    
    @abstractmethod
    async def get_site(self, site_id: str) -> Optional[Dict]:
        """Get site by ID."""
        pass
    
    @abstractmethod
    async def list_sites(self, user_id: Optional[str] = None) -> List[Dict]:
        """List all sites, optionally filtered by user."""
        pass
    
    @abstractmethod
    async def update_site(self, site_id: str, updates: Dict) -> bool:
        """Update site data."""
        pass
    
    @abstractmethod
    async def delete_site(self, site_id: str) -> bool:
        """Delete a site."""
        pass
    
    @abstractmethod
    async def get_site_config(self, site_id: str) -> Optional[Dict]:
        """Get site configuration."""
        pass
    
    @abstractmethod
    async def update_site_config(self, site_id: str, config: Dict) -> bool:
        """Update site configuration."""
        pass
    
    # ===========================================
    # User Operations
    # ===========================================
    
    @abstractmethod
    async def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email."""
        pass
    
    @abstractmethod
    async def create_user(self, user_data: Dict) -> str:
        """Create a new user. Returns user_id."""
        pass
    
    @abstractmethod
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user by ID."""
        pass
    
    # ===========================================
    # Crawl Job Operations
    # ===========================================
    
    @abstractmethod
    async def create_crawl_job(self, target_url: str) -> str:
        """Create a crawl job. Returns job_id."""
        pass
    
    @abstractmethod
    async def update_crawl_job(
        self,
        job_id: str,
        status: Optional[str] = None,
        pages_crawled: Optional[int] = None,
        pages_indexed: Optional[int] = None,
        error: Optional[str] = None
    ) -> bool:
        """Update crawl job status."""
        pass
    
    @abstractmethod
    async def get_crawl_job(self, job_id: str) -> Optional[Dict]:
        """Get crawl job by ID."""
        pass
    
    # ===========================================
    # Page Operations
    # ===========================================
    
    @abstractmethod
    async def save_page(
        self,
        url: str,
        title: str,
        content: str,
        chunk_count: int = 0,
        metadata: Optional[Dict] = None
    ) -> None:
        """Save a crawled page."""
        pass
    
    @abstractmethod
    async def get_page(self, url: str) -> Optional[Dict]:
        """Get page by URL."""
        pass
    
    @abstractmethod
    async def get_all_pages(self, status: Optional[str] = None) -> List[Dict]:
        """Get all pages, optionally filtered by status."""
        pass
    
    # ===========================================
    # Document Operations
    # ===========================================
    
    @abstractmethod
    async def save_document(self, doc_data: Dict) -> str:
        """Save document metadata. Returns document_id."""
        pass
    
    @abstractmethod
    async def get_documents(self, site_id: str) -> List[Dict]:
        """Get all documents for a site."""
        pass
    
    @abstractmethod
    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document."""
        pass
    
    # ===========================================
    # Analytics Operations
    # ===========================================
    
    @abstractmethod
    async def get_analytics_overview(
        self,
        site_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """Get analytics overview data."""
        pass
    
    # ===========================================
    # Trigger Operations
    # ===========================================
    
    @abstractmethod
    async def get_site_triggers(self, site_id: str) -> Dict:
        """Get triggers for a site."""
        pass
    
    @abstractmethod
    async def save_trigger(self, site_id: str, trigger: Dict) -> Dict:
        """Save a new trigger."""
        pass
    
    @abstractmethod
    async def update_trigger(self, site_id: str, trigger_id: str, updates: Dict) -> Optional[Dict]:
        """Update an existing trigger."""
        pass
    
    @abstractmethod
    async def delete_trigger(self, site_id: str, trigger_id: str) -> bool:
        """Delete a trigger."""
        pass
    
    # ===========================================
    # Handoff Operations
    # ===========================================
    
    @abstractmethod
    async def create_handoff_session(
        self,
        session_id: str,
        site_id: str,
        reason: str,
        visitor_email: Optional[str] = None,
        visitor_name: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> str:
        """Create a handoff session. Returns handoff_id."""
        pass
    
    @abstractmethod
    async def get_handoff_session(self, handoff_id: str) -> Optional[Dict]:
        """Get handoff session by ID."""
        pass
    
    @abstractmethod
    async def update_handoff_status(
        self,
        handoff_id: str,
        status: str,
        agent_id: Optional[str] = None,
        agent_name: Optional[str] = None
    ) -> bool:
        """Update handoff status."""
        pass
    
    @abstractmethod
    async def get_handoff_queue(
        self,
        site_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict]:
        """Get handoff queue."""
        pass
    
    # ===========================================
    # Platform Settings
    # ===========================================
    
    @abstractmethod
    async def get_platform_whitelabel(self) -> Optional[Dict]:
        """Get platform white-label settings."""
        pass
    
    @abstractmethod
    async def update_platform_whitelabel(self, config: Dict) -> Dict:
        """Update platform white-label settings."""
        pass
