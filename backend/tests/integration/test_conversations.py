"""
Tests for conversations API endpoints.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def sample_conversation():
    """Sample conversation data for testing."""
    return {
        "session_id": "session_123",
        "site_id": "site_abc",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "messages": [
            {
                "role": "user",
                "content": "Hello, I need help",
                "timestamp": datetime.utcnow(),
                "feedback": None
            },
            {
                "role": "assistant",
                "content": "Hi! How can I help you today?",
                "timestamp": datetime.utcnow(),
                "sources": [{"title": "doc1.pdf", "url": "https://example.com/doc1.pdf"}],
                "response_time_ms": 250
            }
        ],
        "stats": {
            "message_count": 2,
            "user_message_count": 1,
            "assistant_message_count": 1,
            "avg_response_time_ms": 250,
            "positive_feedback_count": 0,
            "negative_feedback_count": 0
        }
    }


@pytest.fixture
def sample_conversation_list_item():
    """Sample conversation list item."""
    return {
        "session_id": "session_123",
        "site_id": "site_abc",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "message_count": 5,
        "last_message_preview": "Thanks for your help!"
    }


class TestListConversations:
    """Tests for GET /api/conversations endpoint."""
    
    @pytest.mark.asyncio
    async def test_list_conversations_success(self, authenticated_client, mock_mongodb, sample_conversation_list_item):
        """Test listing conversations."""
        mock_mongodb.get_conversations_paginated = AsyncMock(
            return_value=([sample_conversation_list_item], 1)
        )
        
        response = await authenticated_client.get("/api/conversations")
        
        assert response.status_code == 200
        data = response.json()
        assert "conversations" in data
        assert data["total"] == 1
        assert data["page"] == 1
    
    @pytest.mark.asyncio
    async def test_list_conversations_with_site_filter(self, authenticated_client, mock_mongodb, sample_conversation_list_item):
        """Test listing conversations filtered by site."""
        mock_mongodb.get_conversations_paginated = AsyncMock(
            return_value=([sample_conversation_list_item], 1)
        )
        
        response = await authenticated_client.get("/api/conversations?site_id=site_abc")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["conversations"]) == 1
    
    @pytest.mark.asyncio
    async def test_list_conversations_pagination(self, authenticated_client, mock_mongodb):
        """Test conversation list pagination."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 100))
        
        response = await authenticated_client.get("/api/conversations?page=3&limit=20")
        
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 3
        assert data["limit"] == 20
        assert data["total_pages"] == 5
    
    @pytest.mark.asyncio
    async def test_list_conversations_sorting(self, authenticated_client, mock_mongodb):
        """Test conversation list sorting."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations?sort_by=created_at&order=asc")
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_list_conversations_date_filter(self, authenticated_client, mock_mongodb):
        """Test conversation list with date filters."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        date_from = (datetime.utcnow() - timedelta(days=7)).isoformat()
        date_to = datetime.utcnow().isoformat()
        
        response = await authenticated_client.get(
            f"/api/conversations?date_from={date_from}&date_to={date_to}"
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_list_conversations_invalid_date_from(self, authenticated_client):
        """Test conversation list with invalid date_from."""
        response = await authenticated_client.get("/api/conversations?date_from=invalid-date")
        
        assert response.status_code == 400
        assert "Invalid date_from" in response.json()["detail"]
    
    @pytest.mark.asyncio
    async def test_list_conversations_invalid_date_to(self, authenticated_client):
        """Test conversation list with invalid date_to."""
        response = await authenticated_client.get("/api/conversations?date_to=not-a-date")
        
        assert response.status_code == 400
        assert "Invalid date_to" in response.json()["detail"]
    
    @pytest.mark.asyncio
    async def test_list_conversations_empty(self, authenticated_client, mock_mongodb):
        """Test listing conversations when none exist."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations")
        
        assert response.status_code == 200
        data = response.json()
        assert data["conversations"] == []
        assert data["total"] == 0
    
    @pytest.mark.asyncio
    async def test_list_conversations_limit_bounds(self, authenticated_client):
        """Test conversation list limit parameter bounds."""
        response = await authenticated_client.get("/api/conversations?limit=200")
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_list_conversations_page_bounds(self, authenticated_client):
        """Test conversation list page parameter bounds."""
        response = await authenticated_client.get("/api/conversations?page=0")
        
        assert response.status_code == 422


class TestSearchConversations:
    """Tests for GET /api/conversations/search endpoint."""
    
    @pytest.mark.asyncio
    async def test_search_conversations_success(self, authenticated_client, mock_mongodb):
        """Test searching conversations."""
        search_result = {
            "session_id": "session_123",
            "site_id": "site_abc",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "match_preview": "...billing question...",
            "match_count": 2
        }
        
        mock_mongodb.search_conversations = AsyncMock(return_value=([search_result], 1))
        
        response = await authenticated_client.get("/api/conversations/search?q=billing")
        
        assert response.status_code == 200
        data = response.json()
        assert "conversations" in data
        assert data["query"] == "billing"
        assert data["total"] == 1
    
    @pytest.mark.asyncio
    async def test_search_conversations_with_site_filter(self, authenticated_client, mock_mongodb):
        """Test searching conversations with site filter."""
        mock_mongodb.search_conversations = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations/search?q=help&site_id=site_abc")
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_search_conversations_pagination(self, authenticated_client, mock_mongodb):
        """Test search pagination."""
        mock_mongodb.search_conversations = AsyncMock(return_value=([], 50))
        
        response = await authenticated_client.get("/api/conversations/search?q=help&page=2&limit=10")
        
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2
        assert data["limit"] == 10
        assert data["total_pages"] == 5
    
    @pytest.mark.asyncio
    async def test_search_conversations_no_results(self, authenticated_client, mock_mongodb):
        """Test search with no matching results."""
        mock_mongodb.search_conversations = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations/search?q=nonexistent_term")
        
        assert response.status_code == 200
        data = response.json()
        assert data["conversations"] == []
        assert data["total"] == 0
    
    @pytest.mark.asyncio
    async def test_search_conversations_empty_query(self, authenticated_client):
        """Test search with empty query fails."""
        response = await authenticated_client.get("/api/conversations/search?q=")
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_search_conversations_missing_query(self, authenticated_client):
        """Test search without query parameter fails."""
        response = await authenticated_client.get("/api/conversations/search")
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_search_conversations_special_characters(self, authenticated_client, mock_mongodb):
        """Test search with special characters."""
        mock_mongodb.search_conversations = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations/search?q=user@example.com")
        
        assert response.status_code == 200


class TestGetConversation:
    """Tests for GET /api/conversations/{session_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_conversation_success(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test getting conversation details."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
        
        response = await authenticated_client.get(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == sample_conversation["session_id"]
        assert "messages" in data
        assert "stats" in data
    
    @pytest.mark.asyncio
    async def test_get_conversation_not_found(self, authenticated_client, mock_mongodb):
        """Test getting non-existent conversation."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)
        
        response = await authenticated_client.get("/api/conversations/nonexistent")
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_get_conversation_with_messages(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test conversation detail includes all messages."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
        
        response = await authenticated_client.get(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["messages"]) == 2
        assert data["messages"][0]["role"] == "user"
        assert data["messages"][1]["role"] == "assistant"
    
    @pytest.mark.asyncio
    async def test_get_conversation_with_sources(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test conversation detail includes message sources."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
        
        response = await authenticated_client.get(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assistant_msg = next(m for m in data["messages"] if m["role"] == "assistant")
        assert "sources" in assistant_msg
    
    @pytest.mark.asyncio
    async def test_get_conversation_with_feedback(self, authenticated_client, mock_mongodb):
        """Test conversation detail includes feedback."""
        conversation_with_feedback = {
            "session_id": "session_456",
            "site_id": "site_abc",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [
                {
                    "role": "assistant",
                    "content": "Here's your answer",
                    "timestamp": datetime.utcnow(),
                    "feedback": "positive",
                    "feedback_at": datetime.utcnow()
                }
            ],
            "stats": {}
        }
        
        mock_mongodb.get_conversation_full = AsyncMock(return_value=conversation_with_feedback)
        
        response = await authenticated_client.get("/api/conversations/session_456")
        
        assert response.status_code == 200
        data = response.json()
        assert data["messages"][0]["feedback"] == "positive"


class TestDeleteConversation:
    """Tests for DELETE /api/conversations/{session_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_delete_conversation_success(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test deleting a conversation."""
        mock_mongodb.clear_conversation = AsyncMock(return_value=True)
        
        response = await authenticated_client.delete(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Conversation deleted"
        assert data["session_id"] == sample_conversation["session_id"]
    
    @pytest.mark.asyncio
    async def test_delete_conversation_not_found(self, authenticated_client, mock_mongodb):
        """Test deleting non-existent conversation."""
        mock_mongodb.clear_conversation = AsyncMock(return_value=False)
        
        response = await authenticated_client.delete("/api/conversations/nonexistent")
        
        assert response.status_code == 404


class TestBulkDeleteConversations:
    """Tests for POST /api/conversations/bulk-delete endpoint."""
    
    @pytest.mark.asyncio
    async def test_bulk_delete_success(self, authenticated_client, mock_mongodb):
        """Test bulk deleting conversations."""
        mock_mongodb.delete_conversations_bulk = AsyncMock(return_value=3)
        
        response = await authenticated_client.post(
            "/api/conversations/bulk-delete",
            json={"session_ids": ["session_1", "session_2", "session_3"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 3
        assert "Successfully deleted 3" in data["message"]
    
    @pytest.mark.asyncio
    async def test_bulk_delete_partial(self, authenticated_client, mock_mongodb):
        """Test bulk delete when some conversations don't exist."""
        mock_mongodb.delete_conversations_bulk = AsyncMock(return_value=2)
        
        response = await authenticated_client.post(
            "/api/conversations/bulk-delete",
            json={"session_ids": ["exists_1", "exists_2", "nonexistent"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 2
    
    @pytest.mark.asyncio
    async def test_bulk_delete_none_found(self, authenticated_client, mock_mongodb):
        """Test bulk delete when no conversations found."""
        mock_mongodb.delete_conversations_bulk = AsyncMock(return_value=0)
        
        response = await authenticated_client.post(
            "/api/conversations/bulk-delete",
            json={"session_ids": ["nonexistent_1", "nonexistent_2"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 0
    
    @pytest.mark.asyncio
    async def test_bulk_delete_empty_list(self, authenticated_client, mock_mongodb):
        """Test bulk delete with empty session_ids list returns validation error."""
        response = await authenticated_client.post(
            "/api/conversations/bulk-delete",
            json={"session_ids": []}
        )
        
        # Empty list is not allowed by validation
        assert response.status_code == 422


class TestExportConversations:
    """Tests for POST /api/conversations/export endpoint."""
    
    @pytest.mark.asyncio
    async def test_export_conversations_json(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test exporting conversations as JSON."""
        mock_mongodb.get_conversations_for_export = AsyncMock(return_value=[sample_conversation])
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"session_ids": ["session_123"], "format": "json"}
        )
        
        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]
        assert "attachment" in response.headers["content-disposition"]
    
    @pytest.mark.asyncio
    async def test_export_conversations_csv(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test exporting conversations as CSV."""
        mock_mongodb.get_conversations_for_export = AsyncMock(return_value=[sample_conversation])
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"session_ids": ["session_123"], "format": "csv"}
        )
        
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "attachment" in response.headers["content-disposition"]
    
    @pytest.mark.asyncio
    async def test_export_conversations_by_site(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test exporting all conversations for a site."""
        mock_mongodb.get_conversations_for_export = AsyncMock(return_value=[sample_conversation])
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"site_id": "site_abc", "format": "json"}
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_export_conversations_not_found(self, authenticated_client, mock_mongodb):
        """Test export when no conversations found."""
        mock_mongodb.get_conversations_for_export = AsyncMock(return_value=[])
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"session_ids": ["nonexistent"], "format": "json"}
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_export_conversations_invalid_format(self, authenticated_client, mock_mongodb):
        """Test export with invalid format."""
        mock_mongodb.get_conversations_for_export = AsyncMock(return_value=[{}])
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"session_ids": ["session_123"], "format": "xml"}
        )
        
        assert response.status_code == 400
        assert "Invalid format" in response.json()["detail"]
    
    @pytest.mark.asyncio
    async def test_export_csv_with_messages(self, authenticated_client, mock_mongodb):
        """Test CSV export includes all messages as rows."""
        conversation_with_messages = {
            "session_id": "session_123",
            "site_id": "site_abc",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [
                {"role": "user", "content": "Hello", "timestamp": datetime.utcnow()},
                {"role": "assistant", "content": "Hi!", "timestamp": datetime.utcnow()},
                {"role": "user", "content": "Thanks", "timestamp": datetime.utcnow()}
            ]
        }
        
        mock_mongodb.get_conversations_for_export = AsyncMock(
            return_value=[conversation_with_messages]
        )
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"session_ids": ["session_123"], "format": "csv"}
        )
        
        assert response.status_code == 200
        content = response.content.decode("utf-8")
        lines = content.strip().split("\n")
        assert len(lines) == 4
    
    @pytest.mark.asyncio
    async def test_export_csv_empty_messages(self, authenticated_client, mock_mongodb):
        """Test CSV export with conversation having no messages."""
        conversation_no_messages = {
            "session_id": "session_empty",
            "site_id": "site_abc",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": []
        }
        
        mock_mongodb.get_conversations_for_export = AsyncMock(
            return_value=[conversation_no_messages]
        )
        
        response = await authenticated_client.post(
            "/api/conversations/export",
            json={"session_ids": ["session_empty"], "format": "csv"}
        )
        
        assert response.status_code == 200


class TestConversationStats:
    """Tests for conversation statistics in responses."""
    
    @pytest.mark.asyncio
    async def test_conversation_stats_included(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test conversation detail includes stats."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
        
        response = await authenticated_client.get(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        stats = data["stats"]
        assert "message_count" in stats
        assert "user_messages" in stats
        assert "assistant_messages" in stats
    
    @pytest.mark.asyncio
    async def test_conversation_stats_avg_response_time(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test stats include average response time."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
        
        response = await authenticated_client.get(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "avg_response_time_ms" in data["stats"]
    
    @pytest.mark.asyncio
    async def test_conversation_stats_feedback_counts(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test stats include feedback counts."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
        
        response = await authenticated_client.get(
            f"/api/conversations/{sample_conversation['session_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "positive_feedback" in data["stats"]
        assert "negative_feedback" in data["stats"]
    
    @pytest.mark.asyncio
    async def test_conversation_empty_stats(self, authenticated_client, mock_mongodb):
        """Test conversation with empty stats object."""
        conversation_empty_stats = {
            "session_id": "session_789",
            "site_id": "site_abc",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {}
        }
        
        mock_mongodb.get_conversation_full = AsyncMock(return_value=conversation_empty_stats)
        
        response = await authenticated_client.get("/api/conversations/session_789")
        
        assert response.status_code == 200


class TestConversationFiltering:
    """Tests for advanced filtering capabilities."""
    
    @pytest.mark.asyncio
    async def test_filter_by_date_range(self, authenticated_client, mock_mongodb):
        """Test filtering conversations by date range."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        date_from = "2024-01-01T00:00:00Z"
        date_to = "2024-01-31T23:59:59Z"
        
        response = await authenticated_client.get(
            f"/api/conversations?date_from={date_from}&date_to={date_to}"
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_filter_date_from_only(self, authenticated_client, mock_mongodb):
        """Test filtering with only date_from."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations?date_from=2024-01-01T00:00:00Z")
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_filter_date_to_only(self, authenticated_client, mock_mongodb):
        """Test filtering with only date_to."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get("/api/conversations?date_to=2024-12-31T23:59:59Z")
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_combined_filters(self, authenticated_client, mock_mongodb):
        """Test combining multiple filters."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))
        
        response = await authenticated_client.get(
            "/api/conversations?site_id=site_abc&sort_by=created_at&order=desc&page=1&limit=50"
        )
        
        assert response.status_code == 200
