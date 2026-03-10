"""
Tests for database providers and operations.
Tests MongoDB connection, CRUD operations for sites, users, conversations, and vector store.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Check for optional packages that may cause import issues
try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


class TestMongoDBConnection:
    """Tests for MongoDB connection management."""
    
    @pytest.mark.asyncio
    async def test_mongodb_connect_success(self):
        """Test successful MongoDB connection."""
        with patch("app.database.mongodb.AsyncIOMotorClient") as mock_client:
            mock_instance = MagicMock()
            mock_instance.admin.command = AsyncMock(return_value={"ok": 1})
            mock_instance.__getitem__ = MagicMock(return_value=MagicMock())
            mock_client.return_value = mock_instance
            
            from app.database.mongodb import MongoDB
            
            db = MongoDB()
            db._create_indexes = AsyncMock()
            
            await db.connect()
            
            assert db.client is not None
            assert db.db is not None
            mock_instance.admin.command.assert_called_once_with('ping')
    
    @pytest.mark.asyncio
    async def test_mongodb_connect_failure(self):
        """Test MongoDB connection failure handling."""
        with patch("app.database.mongodb.AsyncIOMotorClient") as mock_client:
            mock_instance = MagicMock()
            mock_instance.admin.command = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client.return_value = mock_instance
            
            from app.database.mongodb import MongoDB
            
            db = MongoDB()
            
            with pytest.raises(Exception):
                await db.connect()
    
    @pytest.mark.asyncio
    async def test_mongodb_disconnect(self):
        """Test MongoDB disconnection."""
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.client = MagicMock()
        
        await db.disconnect()
        
        db.client.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_mongodb_disconnect_no_client(self):
        """Test MongoDB disconnection when no client exists."""
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.client = None
        
        await db.disconnect()


class TestMongoDBProviderConnection:
    """Tests for MongoDBProvider connection management."""
    
    @pytest.mark.asyncio
    async def test_provider_connect_success(self):
        """Test successful provider connection."""
        with patch("motor.motor_asyncio.AsyncIOMotorClient") as mock_client:
            mock_instance = MagicMock()
            mock_instance.admin.command = AsyncMock(return_value={"ok": 1})
            mock_instance.__getitem__ = MagicMock(return_value=MagicMock())
            mock_client.return_value = mock_instance
            
            from app.providers.database.mongodb_provider import MongoDBProvider
            
            provider = MongoDBProvider()
            provider._create_indexes = AsyncMock()
            
            await provider.connect()
            
            assert provider.client is not None
            assert provider.db is not None
    
    @pytest.mark.asyncio
    async def test_provider_health_check_success(self):
        """Test health check returns True when connected."""
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.client = MagicMock()
        provider.client.admin.command = AsyncMock(return_value={"ok": 1})
        
        result = await provider.health_check()
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_provider_health_check_failure(self):
        """Test health check returns False when disconnected."""
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.client = MagicMock()
        provider.client.admin.command = AsyncMock(side_effect=Exception("Connection lost"))
        
        result = await provider.health_check()
        
        assert result is False


class TestConversationOperations:
    """Tests for conversation CRUD operations."""
    
    @pytest.mark.asyncio
    async def test_save_message(self, mock_mongodb):
        """Test saving a message to conversation."""
        mock_mongodb.db.conversations.update_one = AsyncMock()
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        message_id = await db.save_message(
            session_id="session123",
            role="user",
            content="Hello, how are you?",
            site_id="site456"
        )
        
        assert message_id is not None
        mock_mongodb.db.conversations.update_one.assert_called_once()
        
        call_args = mock_mongodb.db.conversations.update_one.call_args
        assert call_args[0][0] == {"session_id": "session123"}
        assert "$push" in call_args[0][1]
        assert "$set" in call_args[0][1]
    
    @pytest.mark.asyncio
    async def test_save_message_with_sources(self, mock_mongodb):
        """Test saving a message with sources."""
        mock_mongodb.db.conversations.update_one = AsyncMock()
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        sources = [
            {"url": "https://example.com/page1", "title": "Page 1"},
            {"url": "https://example.com/page2", "title": "Page 2"}
        ]
        
        await db.save_message(
            session_id="session123",
            role="assistant",
            content="Here is some info",
            sources=sources,
            response_time_ms=150
        )
        
        mock_mongodb.db.conversations.update_one.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_conversation_history(self, mock_mongodb):
        """Test retrieving conversation history."""
        mock_messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"}
        ]
        
        mock_mongodb.db.conversations.find_one = AsyncMock(return_value={
            "session_id": "session123",
            "messages": mock_messages
        })
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        history = await db.get_conversation_history("session123", limit=10)
        
        assert len(history) == 3
        assert history[0]["role"] == "user"
    
    @pytest.mark.asyncio
    async def test_get_conversation_history_empty(self, mock_mongodb):
        """Test retrieving empty conversation history."""
        mock_mongodb.db.conversations.find_one = AsyncMock(return_value=None)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        history = await db.get_conversation_history("nonexistent_session")
        
        assert history == []
    
    @pytest.mark.asyncio
    async def test_get_conversation_history_with_limit(self, mock_mongodb):
        """Test conversation history respects limit."""
        mock_messages = [
            {"role": "user", "content": f"Message {i}"} for i in range(20)
        ]
        
        mock_mongodb.db.conversations.find_one = AsyncMock(return_value={
            "session_id": "session123",
            "messages": mock_messages
        })
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        history = await db.get_conversation_history("session123", limit=5)
        
        assert len(history) == 5
        assert history[0]["content"] == "Message 15"
    
    @pytest.mark.asyncio
    async def test_clear_conversation(self, mock_mongodb):
        """Test clearing a conversation."""
        mock_mongodb.db.conversations.delete_one = AsyncMock(
            return_value=MagicMock(deleted_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.clear_conversation("session123")
        
        assert result is True
        mock_mongodb.db.conversations.delete_one.assert_called_once_with(
            {"session_id": "session123"}
        )
    
    @pytest.mark.asyncio
    async def test_clear_nonexistent_conversation(self, mock_mongodb):
        """Test clearing a nonexistent conversation."""
        mock_mongodb.db.conversations.delete_one = AsyncMock(
            return_value=MagicMock(deleted_count=0)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.clear_conversation("nonexistent")
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_add_message_feedback(self, mock_mongodb):
        """Test adding feedback to a message."""
        mock_mongodb.db.conversations.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.add_message_feedback(
            session_id="session123",
            message_id="msg_123",
            feedback="positive"
        )
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_delete_conversations_bulk(self, mock_mongodb):
        """Test bulk deletion of conversations."""
        mock_mongodb.db.conversations.delete_many = AsyncMock(
            return_value=MagicMock(deleted_count=5)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        session_ids = ["session1", "session2", "session3", "session4", "session5"]
        count = await db.delete_conversations_bulk(session_ids)
        
        assert count == 5


class TestSiteOperations:
    """Tests for site CRUD operations."""
    
    @pytest.mark.asyncio
    async def test_create_site(self, mock_mongodb):
        """Test creating a new site."""
        mock_mongodb.db.sites.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id="site_object_id")
        )
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        site_data = {
            "name": "Test Site",
            "url": "https://example.com",
            "user_id": "user123"
        }
        
        site_id = await provider.create_site(site_data)
        
        assert site_id is not None
        mock_mongodb.db.sites.insert_one.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_site(self, mock_mongodb):
        """Test retrieving a site by ID."""
        mock_site = {
            "_id": "object_id",
            "site_id": "site123",
            "name": "Test Site",
            "url": "https://example.com"
        }
        
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=mock_site)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        site = await provider.get_site("site123")
        
        assert site is not None
        assert site["site_id"] == "site123"
        assert site["_id"] == "object_id"
    
    @pytest.mark.asyncio
    async def test_get_site_not_found(self, mock_mongodb):
        """Test retrieving a nonexistent site."""
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=None)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        site = await provider.get_site("nonexistent")
        
        assert site is None
    
    @pytest.mark.asyncio
    async def test_list_sites(self, mock_mongodb):
        """Test listing all sites."""
        mock_sites = [
            {"_id": "id1", "site_id": "site1", "name": "Site 1"},
            {"_id": "id2", "site_id": "site2", "name": "Site 2"}
        ]
        
        mock_cursor = MagicMock()
        mock_cursor.sort = MagicMock(return_value=mock_cursor)
        mock_cursor.to_list = AsyncMock(return_value=mock_sites)
        mock_mongodb.db.sites.find = MagicMock(return_value=mock_cursor)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        sites = await provider.list_sites()
        
        assert len(sites) == 2
        assert sites[0]["_id"] == "id1"
    
    @pytest.mark.asyncio
    async def test_list_sites_by_user(self, mock_mongodb):
        """Test listing sites for a specific user."""
        mock_sites = [
            {"_id": "id1", "site_id": "site1", "name": "Site 1", "user_id": "user123"}
        ]
        
        mock_cursor = MagicMock()
        mock_cursor.sort = MagicMock(return_value=mock_cursor)
        mock_cursor.to_list = AsyncMock(return_value=mock_sites)
        mock_mongodb.db.sites.find = MagicMock(return_value=mock_cursor)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        sites = await provider.list_sites(user_id="user123")
        
        mock_mongodb.db.sites.find.assert_called_once_with({"user_id": "user123"})
    
    @pytest.mark.asyncio
    async def test_update_site(self, mock_mongodb):
        """Test updating a site."""
        mock_mongodb.db.sites.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        result = await provider.update_site("site123", {"name": "Updated Site"})
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_delete_site(self, mock_mongodb):
        """Test deleting a site."""
        mock_mongodb.db.sites.delete_one = AsyncMock(
            return_value=MagicMock(deleted_count=1)
        )
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        result = await provider.delete_site("site123")
        
        assert result is True
        mock_mongodb.db.sites.delete_one.assert_called_once_with({"site_id": "site123"})


class TestUserOperations:
    """Tests for user CRUD operations."""
    
    @pytest.mark.asyncio
    async def test_create_user(self, mock_mongodb):
        """Test creating a new user."""
        mock_mongodb.db.users.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id="user_object_id")
        )
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        user_data = {
            "email": "user@example.com",
            "name": "Test User",
            "password": "hashed_password"
        }
        
        user_id = await provider.create_user(user_data)
        
        assert user_id is not None
        mock_mongodb.db.users.insert_one.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_user_by_email(self, mock_mongodb):
        """Test retrieving a user by email."""
        mock_user = {
            "_id": "object_id",
            "user_id": "user123",
            "email": "user@example.com",
            "name": "Test User"
        }
        
        mock_mongodb.db.users.find_one = AsyncMock(return_value=mock_user)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        user = await provider.get_user_by_email("user@example.com")
        
        assert user is not None
        assert user["email"] == "user@example.com"
    
    @pytest.mark.asyncio
    async def test_get_user_by_email_not_found(self, mock_mongodb):
        """Test retrieving a nonexistent user by email."""
        mock_mongodb.db.users.find_one = AsyncMock(return_value=None)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        user = await provider.get_user_by_email("nonexistent@example.com")
        
        assert user is None
    
    @pytest.mark.asyncio
    async def test_get_user_by_id(self, mock_mongodb):
        """Test retrieving a user by ID."""
        mock_user = {
            "_id": "object_id",
            "user_id": "user123",
            "email": "user@example.com"
        }
        
        mock_mongodb.db.users.find_one = AsyncMock(return_value=mock_user)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        user = await provider.get_user_by_id("user123")
        
        assert user is not None
        assert user["user_id"] == "user123"


class TestCrawlJobOperations:
    """Tests for crawl job operations."""
    
    @pytest.mark.asyncio
    async def test_create_crawl_job(self, mock_mongodb):
        """Test creating a crawl job."""
        mock_mongodb.db.crawl_jobs.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id="job_object_id")
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        job_id = await db.create_crawl_job("https://example.com")
        
        assert job_id is not None
        mock_mongodb.db.crawl_jobs.insert_one.assert_called_once()
        
        call_args = mock_mongodb.db.crawl_jobs.insert_one.call_args[0][0]
        assert call_args["target_url"] == "https://example.com"
        assert call_args["status"] == "running"
        assert call_args["pages_crawled"] == 0
    
    @pytest.mark.asyncio
    async def test_update_crawl_job(self, mock_mongodb):
        """Test updating a crawl job."""
        mock_mongodb.db.crawl_jobs.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        result = await provider.update_crawl_job(
            job_id="507f1f77bcf86cd799439011",
            status="completed",
            pages_crawled=50,
            pages_indexed=48
        )
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_update_crawl_job_with_error(self, mock_mongodb):
        """Test updating a crawl job with error."""
        mock_mongodb.db.crawl_jobs.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        result = await provider.update_crawl_job(
            job_id="507f1f77bcf86cd799439011",
            error="Failed to crawl page"
        )
        
        assert result is True


class TestPageOperations:
    """Tests for page operations."""
    
    @pytest.mark.asyncio
    async def test_save_page(self, mock_mongodb):
        """Test saving a crawled page."""
        mock_mongodb.db.pages.update_one = AsyncMock(
            return_value=MagicMock(upserted_id="page_id")
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        page_id = await db.save_page(
            url="https://example.com/page1",
            title="Page 1",
            content="Page content here",
            chunk_count=5
        )
        
        assert page_id is not None
        mock_mongodb.db.pages.update_one.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_page(self, mock_mongodb):
        """Test retrieving a page by URL."""
        mock_page = {
            "url": "https://example.com/page1",
            "title": "Page 1",
            "content": "Page content"
        }
        
        mock_mongodb.db.pages.find_one = AsyncMock(return_value=mock_page)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        page = await db.get_page("https://example.com/page1")
        
        assert page is not None
        assert page["title"] == "Page 1"
    
    @pytest.mark.asyncio
    async def test_get_all_pages(self, mock_mongodb):
        """Test retrieving all pages."""
        mock_pages = [
            {"url": "https://example.com/page1", "status": "indexed"},
            {"url": "https://example.com/page2", "status": "indexed"}
        ]
        
        mock_cursor = MagicMock()
        mock_cursor.sort = MagicMock(return_value=mock_cursor)
        mock_cursor.to_list = AsyncMock(return_value=mock_pages)
        mock_mongodb.db.pages.find = MagicMock(return_value=mock_cursor)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        pages = await db.get_all_pages()
        
        assert len(pages) == 2
    
    @pytest.mark.asyncio
    async def test_delete_page(self, mock_mongodb):
        """Test deleting a page."""
        mock_mongodb.db.pages.delete_one = AsyncMock(
            return_value=MagicMock(deleted_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.delete_page("https://example.com/page1")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_get_page_count(self, mock_mongodb):
        """Test getting page count."""
        mock_mongodb.db.pages.count_documents = AsyncMock(return_value=42)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        count = await db.get_page_count()
        
        assert count == 42
        mock_mongodb.db.pages.count_documents.assert_called_once_with({"status": "indexed"})


class TestTriggerOperations:
    """Tests for proactive chat trigger operations."""
    
    @pytest.mark.asyncio
    async def test_get_site_triggers(self, mock_mongodb):
        """Test retrieving triggers for a site."""
        mock_site = {
            "site_id": "site123",
            "triggers": [
                {"id": "t1", "name": "Welcome Trigger", "enabled": True}
            ],
            "global_cooldown_ms": 30000
        }
        
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=mock_site)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.get_site_triggers("site123")
        
        assert len(result["triggers"]) == 1
        assert result["global_cooldown_ms"] == 30000
    
    @pytest.mark.asyncio
    async def test_get_site_triggers_not_found(self, mock_mongodb):
        """Test retrieving triggers for nonexistent site."""
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=None)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.get_site_triggers("nonexistent")
        
        assert result["triggers"] == []
        assert result["global_cooldown_ms"] == 30000
    
    @pytest.mark.asyncio
    async def test_save_trigger_new(self, mock_mongodb):
        """Test saving a new trigger."""
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=None)
        mock_mongodb.db.sites.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        trigger = {
            "name": "New Trigger",
            "enabled": True,
            "conditions": []
        }
        
        result = await db.save_trigger("site123", trigger)
        
        assert "id" in result
        assert result["name"] == "New Trigger"
    
    @pytest.mark.asyncio
    async def test_delete_trigger(self, mock_mongodb):
        """Test deleting a trigger."""
        mock_mongodb.db.sites.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.delete_trigger("site123", "trigger_id")
        
        assert result is True


class TestHandoffOperations:
    """Tests for human handoff operations."""
    
    @pytest.mark.asyncio
    async def test_create_handoff_session(self, mock_mongodb):
        """Test creating a handoff session."""
        mock_mongodb.db.handoff_sessions.insert_one = AsyncMock()
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        handoff = await db.create_handoff_session(
            session_id="session123",
            site_id="site456",
            reason="user_request",
            visitor_email="visitor@example.com"
        )
        
        assert handoff is not None
        assert "handoff_id" in handoff
        assert handoff["status"] == "pending"
    
    @pytest.mark.asyncio
    async def test_get_handoff_session(self, mock_mongodb):
        """Test retrieving a handoff session."""
        mock_handoff = {
            "_id": "object_id",
            "handoff_id": "handoff123",
            "session_id": "session123",
            "status": "pending"
        }
        
        mock_mongodb.db.handoff_sessions.find_one = AsyncMock(return_value=mock_handoff)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        handoff = await db.get_handoff_session("handoff123")
        
        assert handoff is not None
        assert handoff["handoff_id"] == "handoff123"
    
    @pytest.mark.asyncio
    async def test_update_handoff_status(self, mock_mongodb):
        """Test updating handoff status."""
        mock_handoff = {
            "_id": "object_id",
            "handoff_id": "handoff123",
            "status": "active"
        }
        
        mock_mongodb.db.handoff_sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_mongodb.db.handoff_sessions.find_one = AsyncMock(return_value=mock_handoff)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.update_handoff_status(
            handoff_id="handoff123",
            status="active",
            agent_id="agent456",
            agent_name="Support Agent"
        )
        
        assert result is not None
        assert result["status"] == "active"
    
    @pytest.mark.asyncio
    async def test_add_handoff_message(self, mock_mongodb):
        """Test adding a message to handoff session."""
        mock_mongodb.db.handoff_sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        message = await db.add_handoff_message(
            handoff_id="handoff123",
            role="agent",
            content="Hello, how can I help?",
            sender_name="Support Agent"
        )
        
        assert message is not None
        assert "id" in message
        assert message["content"] == "Hello, how can I help?"


class TestVectorStoreOperations:
    """Tests for vector store operations."""
    
    @pytest.fixture(autouse=True)
    def mock_torch_multiprocessing(self):
        """Mock torch multiprocessing to avoid torch_shm_manager errors."""
        with patch.dict('sys.modules', {
            'torch': MagicMock(),
            'torch.multiprocessing': MagicMock(),
            'torch.multiprocessing.reductions': MagicMock(),
        }):
            yield
    
    def test_vector_store_initialize(self, mock_torch_multiprocessing):
        """Test vector store initialization."""
        with patch.dict('sys.modules', {
            'langchain_community.embeddings': MagicMock(),
            'sentence_transformers': MagicMock(),
        }):
            with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    with patch("os.path.exists", return_value=False):
                        with patch("os.makedirs"):
                            mock_embeddings.return_value = MagicMock()
                            mock_faiss.from_texts.return_value = MagicMock()
                            
                            from app.database.vector_store import VectorStore
                            
                            vs = VectorStore()
                            vs.embeddings = mock_embeddings.return_value
                            vs.vector_store = mock_faiss.from_texts.return_value
                            vs._initialized = True
                            
                            assert vs._initialized is True
    
    def test_vector_store_add_documents(self, mock_torch_multiprocessing):
        """Test adding documents to vector store."""
        with patch.dict('sys.modules', {
            'langchain_community.embeddings': MagicMock(),
            'sentence_transformers': MagicMock(),
        }):
            with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    with patch("os.path.exists", return_value=False):
                        with patch("os.makedirs"):
                            mock_vs_instance = MagicMock()
                            mock_vs_instance.add_documents.return_value = ["id1", "id2"]
                            mock_faiss.from_texts.return_value = mock_vs_instance
                            mock_embeddings.return_value = MagicMock()
                            
                            from app.database.vector_store import VectorStore
                            
                            vs = VectorStore()
                            vs.embeddings = mock_embeddings.return_value
                            vs.vector_store = mock_vs_instance
                            vs._initialized = True
                            
                            mock_doc1 = MagicMock()
                            mock_doc1.page_content = "Doc 1"
                            mock_doc1.metadata = {"source": "test"}
                            mock_doc2 = MagicMock()
                            mock_doc2.page_content = "Doc 2"
                            mock_doc2.metadata = {"source": "test"}
                            
                            ids = vs.add_documents([mock_doc1, mock_doc2])
                            
                            assert ids == ["id1", "id2"]
    
    def test_vector_store_similarity_search(self, mock_torch_multiprocessing):
        """Test similarity search."""
        with patch.dict('sys.modules', {
            'langchain_community.embeddings': MagicMock(),
            'sentence_transformers': MagicMock(),
        }):
            with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    with patch("os.path.exists", return_value=False):
                        with patch("os.makedirs"):
                            mock_doc1 = MagicMock()
                            mock_doc1.page_content = "Result 1"
                            mock_doc1.metadata = {}
                            mock_doc2 = MagicMock()
                            mock_doc2.page_content = "Result 2"
                            mock_doc2.metadata = {}
                            
                            mock_vs_instance = MagicMock()
                            mock_vs_instance.similarity_search.return_value = [mock_doc1, mock_doc2]
                            mock_faiss.from_texts.return_value = mock_vs_instance
                            mock_embeddings.return_value = MagicMock()
                            
                            from app.database.vector_store import VectorStore
                            
                            vs = VectorStore()
                            vs.embeddings = mock_embeddings.return_value
                            vs.vector_store = mock_vs_instance
                            vs._initialized = True
                            
                            results = vs.similarity_search("test query", k=2)
                            
                            assert len(results) == 2
                            mock_vs_instance.similarity_search.assert_called_once_with("test query", k=2)
    
    def test_vector_store_get_collection_stats(self, mock_torch_multiprocessing):
        """Test getting collection stats."""
        with patch.dict('sys.modules', {
            'langchain_community.embeddings': MagicMock(),
            'sentence_transformers': MagicMock(),
        }):
            with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    with patch("os.path.exists", return_value=False):
                        with patch("os.makedirs"):
                            mock_vs_instance = MagicMock()
                            mock_vs_instance.index.ntotal = 100
                            mock_faiss.from_texts.return_value = mock_vs_instance
                            mock_embeddings.return_value = MagicMock()
                            
                            from app.database.vector_store import VectorStore
                            
                            vs = VectorStore()
                            vs.embeddings = mock_embeddings.return_value
                            vs.vector_store = mock_vs_instance
                            vs._initialized = True
                            vs.index_path = "faiss_index"
                            
                            stats = vs.get_collection_stats()
                            
                            assert stats["name"] == "faiss_index"
                            assert stats["count"] == 100


class TestAnalyticsOperations:
    """Tests for analytics operations."""
    
    @pytest.mark.asyncio
    async def test_get_analytics_overview(self, mock_mongodb):
        """Test getting analytics overview."""
        mock_mongodb.db.conversations.count_documents = AsyncMock(return_value=50)
        
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[{"total_messages": 500}])
        mock_mongodb.db.conversations.aggregate = MagicMock(return_value=mock_cursor)
        
        from app.providers.database.mongodb_provider import MongoDBProvider
        
        provider = MongoDBProvider()
        provider.db = mock_mongodb.db
        
        overview = await provider.get_analytics_overview(site_id="site123")
        
        assert overview["total_conversations"] == 50
        assert overview["total_messages"] == 500
        assert overview["site_id"] == "site123"
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics(self, mock_mongodb):
        """Test getting trigger analytics."""
        mock_results = [
            {
                "_id": "trigger1",
                "events": [
                    {"event_type": "shown", "count": 100},
                    {"event_type": "clicked", "count": 25}
                ]
            }
        ]
        
        mock_site = {
            "triggers": [{"id": "trigger1", "name": "Welcome Trigger"}]
        }
        
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=mock_results)
        mock_mongodb.db.trigger_events.aggregate = MagicMock(return_value=mock_cursor)
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=mock_site)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        analytics = await db.get_trigger_analytics("site123", period_days=7)
        
        assert len(analytics) == 1
        assert analytics[0]["trigger_id"] == "trigger1"
        assert analytics[0]["shown_count"] == 100
        assert analytics[0]["clicked_count"] == 25


class TestPlatformSettings:
    """Tests for platform-wide settings operations."""
    
    @pytest.mark.asyncio
    async def test_get_platform_whitelabel(self, mock_mongodb):
        """Test getting platform whitelabel settings."""
        mock_config = {
            "_id": "object_id",
            "type": "whitelabel",
            "brand_name": "SiteChat",
            "logo_url": "https://example.com/logo.png"
        }
        
        mock_mongodb.db.platform_settings.find_one = AsyncMock(return_value=mock_config)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        config = await db.get_platform_whitelabel()
        
        assert config is not None
        assert "brand_name" in config
        assert "_id" not in config
        assert "type" not in config
    
    @pytest.mark.asyncio
    async def test_update_platform_whitelabel(self, mock_mongodb):
        """Test updating platform whitelabel settings."""
        mock_mongodb.db.platform_settings.update_one = AsyncMock()
        mock_mongodb.db.platform_settings.find_one = AsyncMock(return_value={
            "brand_name": "NewBrand"
        })
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.update_platform_whitelabel({
            "brand_name": "NewBrand",
            "primary_color": "#FF0000"
        })
        
        assert result is not None
        mock_mongodb.db.platform_settings.update_one.assert_called_once()


class TestLongTermMemory:
    """Tests for user long-term memory operations."""
    
    @pytest.mark.asyncio
    async def test_save_user_memory(self, mock_mongodb):
        """Test saving user memory."""
        mock_mongodb.db.long_term_memory.update_one = AsyncMock()
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        await db.save_user_memory("user123", "preferences", {"theme": "dark"})
        
        mock_mongodb.db.long_term_memory.update_one.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_user_memory(self, mock_mongodb):
        """Test retrieving user memory."""
        mock_memory = {
            "user_id": "user123",
            "memory": {"preferences": {"theme": "dark"}, "name": "John"}
        }
        
        mock_mongodb.db.long_term_memory.find_one = AsyncMock(return_value=mock_memory)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        memory = await db.get_user_memory("user123")
        
        assert memory["preferences"]["theme"] == "dark"
        assert memory["name"] == "John"
    
    @pytest.mark.asyncio
    async def test_get_user_memory_empty(self, mock_mongodb):
        """Test retrieving empty user memory."""
        mock_mongodb.db.long_term_memory.find_one = AsyncMock(return_value=None)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        memory = await db.get_user_memory("user123")
        
        assert memory == {}
    
    @pytest.mark.asyncio
    async def test_clear_user_memory(self, mock_mongodb):
        """Test clearing user memory."""
        mock_mongodb.db.long_term_memory.delete_one = AsyncMock(
            return_value=MagicMock(deleted_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.clear_user_memory("user123")
        
        assert result is True


class TestBusinessHours:
    """Tests for business hours operations."""
    
    @pytest.mark.asyncio
    async def test_get_site_handoff_config(self, mock_mongodb):
        """Test getting handoff config for a site."""
        mock_site = {
            "site_id": "site123",
            "handoff_config": {
                "enabled": True,
                "confidence_threshold": 0.5
            }
        }
        
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=mock_site)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        config = await db.get_site_handoff_config("site123")
        
        assert config is not None
        assert config["enabled"] is True
    
    @pytest.mark.asyncio
    async def test_get_site_handoff_config_default(self, mock_mongodb):
        """Test getting default handoff config when not configured."""
        mock_site = {"site_id": "site123"}
        
        mock_mongodb.db.sites.find_one = AsyncMock(return_value=mock_site)
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        config = await db.get_site_handoff_config("site123")
        
        assert config is not None
        assert "enabled" in config
        assert "business_hours" in config
    
    @pytest.mark.asyncio
    async def test_update_site_handoff_config(self, mock_mongodb):
        """Test updating handoff config."""
        mock_mongodb.db.sites.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        
        from app.database.mongodb import MongoDB
        
        db = MongoDB()
        db.db = mock_mongodb.db
        
        result = await db.update_site_handoff_config(
            "site123",
            {"enabled": True, "confidence_threshold": 0.7}
        )
        
        assert result is True
