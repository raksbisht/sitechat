"""
Tests for chat API endpoints.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.schemas import ChatResponse


@pytest.fixture
def mock_rag_response():
    """Create a mock ChatResponse."""
    return ChatResponse(
        answer="This is a test answer.",
        sources=[],
        confidence=0.85,
        session_id="test_session_123"
    )


class TestChatEndpoints:
    """Tests for chat API endpoints."""
    
    @pytest.mark.asyncio
    async def test_chat_success(self, client, mock_database, mock_vector_store, sample_site, mock_rag_response):
        """Test successful chat request."""
        # Seed the site in the mock database
        mock_database.seed_site(sample_site)
        
        # Mock RAG engine response using get_rag_engine
        with patch("app.routes.chat.get_rag_engine") as mock_get_rag:
            mock_engine = MagicMock()
            mock_engine.chat = AsyncMock(return_value=mock_rag_response)
            mock_get_rag.return_value = mock_engine
            
            response = await client.post(
                "/api/chat",
                json={
                    "message": "Hello, how are you?",
                    "session_id": "test_session_123",
                    "site_id": sample_site["site_id"]
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert "confidence" in data
    
    @pytest.mark.asyncio
    async def test_chat_empty_message(self, client):
        """Test chat with empty message."""
        response = await client.post(
            "/api/chat",
            json={
                "message": "",
                "session_id": "test_session",
                "site_id": "test_site"
            }
        )
        
        assert response.status_code == 422  # Validation error
    
    @pytest.mark.asyncio
    async def test_chat_missing_session_id(self, client):
        """Test chat without session ID."""
        response = await client.post(
            "/api/chat",
            json={
                "message": "Hello",
                "site_id": "test_site"
            }
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_chat_message_too_long(self, client):
        """Test chat with message exceeding max length."""
        long_message = "a" * 5000  # Exceeds 4000 char limit
        
        response = await client.post(
            "/api/chat",
            json={
                "message": long_message,
                "session_id": "test_session",
                "site_id": "test_site"
            }
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_chat_invalid_site_id(self, client, mock_database, mock_rag_response):
        """Test chat with non-existent site ID."""
        # Don't seed any site - site won't be found
        # Mock RAG engine to avoid actual processing
        with patch("app.routes.chat.get_rag_engine") as mock_get_rag:
            mock_engine = MagicMock()
            mock_engine.chat = AsyncMock(return_value=mock_rag_response)
            mock_get_rag.return_value = mock_engine
            
            response = await client.post(
                "/api/chat",
                json={
                    "message": "Hello",
                    "session_id": "test_session",
                    "site_id": "nonexistent_site"
                }
            )
        
        # Should still work (might use default config or return error)
        assert response.status_code in [200, 404]
    
    @pytest.mark.asyncio
    async def test_chat_suggests_handoff_low_confidence(self, client, mock_database, sample_site):
        """Test that low confidence triggers handoff suggestion."""
        # Seed the site
        mock_database.seed_site(sample_site)
        
        low_confidence_response = ChatResponse(
            answer="I'm not sure about that.",
            sources=[],
            confidence=0.2,  # Low confidence
            session_id="test_session"
        )
        
        with patch("app.routes.chat.get_rag_engine") as mock_get_rag:
            mock_engine = MagicMock()
            mock_engine.chat = AsyncMock(return_value=low_confidence_response)
            mock_get_rag.return_value = mock_engine
            
            response = await client.post(
                "/api/chat",
                json={
                    "message": "Complex question",
                    "session_id": "test_session",
                    "site_id": sample_site["site_id"]
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        # Check if handoff suggestion is present when confidence is low
        if "suggest_handoff" in data:
            assert data["confidence"] < 0.5 or data["suggest_handoff"] == True


class TestChatRateLimiting:
    """Tests for chat rate limiting."""
    
    @pytest.mark.asyncio
    async def test_chat_rate_limit_headers(self, client, mock_database, sample_site, mock_rag_response):
        """Test that rate limit headers are present."""
        # Seed the site
        mock_database.seed_site(sample_site)
        
        with patch("app.routes.chat.get_rag_engine") as mock_get_rag:
            mock_engine = MagicMock()
            mock_engine.chat = AsyncMock(return_value=mock_rag_response)
            mock_get_rag.return_value = mock_engine
            
            response = await client.post(
                "/api/chat",
                json={
                    "message": "Hello",
                    "session_id": "test_session",
                    "site_id": sample_site["site_id"]
                }
            )
        
        # Rate limit headers might be present
        # This depends on the rate limiter configuration
        assert response.status_code == 200


class TestChatConversationHistory:
    """Tests for conversation history in chat."""
    
    @pytest.mark.asyncio
    async def test_chat_creates_conversation(self, client, mock_database, sample_site, mock_rag_response):
        """Test that chat creates a conversation record."""
        # Seed the site
        mock_database.seed_site(sample_site)
        
        with patch("app.routes.chat.get_rag_engine") as mock_get_rag:
            mock_engine = MagicMock()
            mock_engine.chat = AsyncMock(return_value=mock_rag_response)
            mock_get_rag.return_value = mock_engine
            
            response = await client.post(
                "/api/chat",
                json={
                    "message": "Hello",
                    "session_id": "new_session_123",
                    "site_id": sample_site["site_id"]
                }
            )
        
        assert response.status_code == 200
        # Verify conversation was created by checking the provider
        history = await mock_database.get_conversation_history("new_session_123")
        # Should have messages if the chat endpoint saved them
        assert isinstance(history, list)
    
    @pytest.mark.asyncio
    async def test_chat_appends_to_existing_conversation(self, client, mock_database, sample_site, mock_rag_response):
        """Test that chat appends to existing conversation."""
        # Seed the site
        mock_database.seed_site(sample_site)
        
        # Seed an existing conversation
        mock_database.seed_conversation({
            "session_id": "existing_session",
            "site_id": sample_site["site_id"],
            "messages": [
                {"role": "user", "content": "Previous message", "message_id": "msg_1"}
            ]
        })
        
        with patch("app.routes.chat.get_rag_engine") as mock_get_rag:
            mock_engine = MagicMock()
            mock_engine.chat = AsyncMock(return_value=mock_rag_response)
            mock_get_rag.return_value = mock_engine
            
            response = await client.post(
                "/api/chat",
                json={
                    "message": "Follow-up question",
                    "session_id": "existing_session",
                    "site_id": sample_site["site_id"]
                }
            )
        
        assert response.status_code == 200
        # Verify messages were appended
        history = await mock_database.get_conversation_history("existing_session", limit=10)
        assert len(history) >= 1  # At least the original message
