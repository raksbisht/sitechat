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
        "site_id": "test_site_123",
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
        "site_id": "test_site_123",
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
        
        response = await authenticated_client.get("/api/conversations?site_id=test_site_123")
        
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
            "site_id": "test_site_123",
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
        
        response = await authenticated_client.get("/api/conversations/search?q=help&site_id=test_site_123")
        
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
            "site_id": "test_site_123",
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
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
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
        mock_mongodb.get_conversation_full = AsyncMock(
            side_effect=lambda sid: {
                "session_id": sid,
                "site_id": "test_site_123",
                "messages": [],
            }
        )
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
        def _full(sid):
            if sid == "nonexistent":
                return None
            return {"session_id": sid, "site_id": "test_site_123", "messages": []}

        mock_mongodb.get_conversation_full = AsyncMock(side_effect=_full)
        mock_mongodb.delete_conversations_bulk = AsyncMock(return_value=2)
        
        response = await authenticated_client.post(
            "/api/conversations/bulk-delete",
            json={"session_ids": ["exists_1", "exists_2", "nonexistent"]}
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_bulk_delete_none_found(self, authenticated_client, mock_mongodb):
        """Test bulk delete when no conversations found."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)
        mock_mongodb.delete_conversations_bulk = AsyncMock(return_value=0)
        
        response = await authenticated_client.post(
            "/api/conversations/bulk-delete",
            json={"session_ids": ["nonexistent_1", "nonexistent_2"]}
        )
        
        assert response.status_code == 404
    
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
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
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
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
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
            json={"site_id": "test_site_123", "format": "json"}
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
    async def test_export_conversations_invalid_format(self, authenticated_client, mock_mongodb, sample_conversation):
        """Test export with invalid format."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conversation)
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
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [
                {"role": "user", "content": "Hello", "timestamp": datetime.utcnow()},
                {"role": "assistant", "content": "Hi!", "timestamp": datetime.utcnow()},
                {"role": "user", "content": "Thanks", "timestamp": datetime.utcnow()}
            ]
        }
        
        mock_mongodb.get_conversation_full = AsyncMock(return_value=conversation_with_messages)
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
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": []
        }
        
        mock_mongodb.get_conversation_full = AsyncMock(return_value=conversation_no_messages)
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
            "site_id": "test_site_123",
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
            "/api/conversations?site_id=test_site_123&sort_by=created_at&order=desc&page=1&limit=50"
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_filter_by_status(self, authenticated_client, mock_mongodb):
        """Test filtering conversations by status."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))

        response = await authenticated_client.get("/api/conversations?status=open")

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_filter_by_priority(self, authenticated_client, mock_mongodb):
        """Test filtering conversations by priority."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))

        response = await authenticated_client.get("/api/conversations?priority=high")

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_filter_by_tag(self, authenticated_client, mock_mongodb):
        """Test filtering conversations by tag."""
        mock_mongodb.get_conversations_paginated = AsyncMock(return_value=([], 0))

        response = await authenticated_client.get("/api/conversations?tag=billing")

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_filter_invalid_status(self, authenticated_client):
        """Test that invalid status value returns 400."""
        response = await authenticated_client.get("/api/conversations?status=unknown")

        assert response.status_code == 400
        assert "status" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_filter_invalid_priority(self, authenticated_client):
        """Test that invalid priority value returns 400."""
        response = await authenticated_client.get("/api/conversations?priority=critical")

        assert response.status_code == 400
        assert "priority" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_invalid_sort_by(self, authenticated_client):
        """Test that invalid sort_by field returns 400."""
        response = await authenticated_client.get("/api/conversations?sort_by=invalid_field")

        assert response.status_code == 400
        assert "sort_by" in response.json()["detail"].lower()


class TestUpdateConversationStatus:
    """Tests for PATCH /api/conversations/{session_id}/status endpoint."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.mark.asyncio
    async def test_update_status_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating conversation status."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_status = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/status",
            json={"status": "resolved"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "resolved"
        assert data["session_id"] == sample_conv["session_id"]

    @pytest.mark.asyncio
    async def test_update_status_invalid_value(self, authenticated_client, mock_mongodb, sample_conv):
        """Test that invalid status value returns 400."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/status",
            json={"status": "unknown"},
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_update_status_not_found(self, authenticated_client, mock_mongodb):
        """Test updating status when conversation does not exist."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.patch(
            "/api/conversations/nonexistent/status",
            json={"status": "closed"},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_status_all_valid_values(self, authenticated_client, mock_mongodb, sample_conv):
        """Test all valid status values are accepted."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_status = AsyncMock(return_value=True)

        for status in ("open", "resolved", "closed"):
            response = await authenticated_client.patch(
                f"/api/conversations/{sample_conv['session_id']}/status",
                json={"status": status},
            )
            assert response.status_code == 200, f"Expected 200 for status={status}"

    @pytest.mark.asyncio
    async def test_update_status_unauthenticated(self, client):
        """Test status update without authentication fails."""
        response = await client.patch(
            "/api/conversations/session_123/status",
            json={"status": "resolved"},
        )

        assert response.status_code == 401


class TestUpdateConversationPriority:
    """Tests for PATCH /api/conversations/{session_id}/priority endpoint."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.mark.asyncio
    async def test_update_priority_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating conversation priority."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_priority = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/priority",
            json={"priority": "high"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["priority"] == "high"

    @pytest.mark.asyncio
    async def test_update_priority_invalid_value(self, authenticated_client, mock_mongodb, sample_conv):
        """Test that invalid priority value returns 400."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/priority",
            json={"priority": "critical"},
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_update_priority_not_found(self, authenticated_client, mock_mongodb):
        """Test updating priority when conversation does not exist."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.patch(
            "/api/conversations/nonexistent/priority",
            json={"priority": "low"},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_priority_all_valid_values(self, authenticated_client, mock_mongodb, sample_conv):
        """Test all valid priority values are accepted."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_priority = AsyncMock(return_value=True)

        for priority in ("high", "medium", "low"):
            response = await authenticated_client.patch(
                f"/api/conversations/{sample_conv['session_id']}/priority",
                json={"priority": priority},
            )
            assert response.status_code == 200, f"Expected 200 for priority={priority}"


class TestUpdateConversationTags:
    """Tests for PATCH /api/conversations/{session_id}/tags endpoint."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.mark.asyncio
    async def test_update_tags_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating conversation tags."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_tags = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/tags",
            json={"tags": ["billing", "urgent"]},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["tags"] == ["billing", "urgent"]

    @pytest.mark.asyncio
    async def test_update_tags_empty_list(self, authenticated_client, mock_mongodb, sample_conv):
        """Test clearing all tags with an empty list."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_tags = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/tags",
            json={"tags": []},
        )

        assert response.status_code == 200
        assert response.json()["tags"] == []

    @pytest.mark.asyncio
    async def test_update_tags_not_found(self, authenticated_client, mock_mongodb):
        """Test updating tags when conversation does not exist."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.patch(
            "/api/conversations/nonexistent/tags",
            json={"tags": ["billing"]},
        )

        assert response.status_code == 404


class TestConversationNotes:
    """Tests for notes CRUD on conversations."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.fixture
    def sample_note(self):
        return {
            "note_id": "note_001",
            "content": "Follow up needed",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

    @pytest.mark.asyncio
    async def test_add_note_success(self, authenticated_client, mock_mongodb, sample_conv, sample_note):
        """Test adding an internal note to a conversation."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.add_conversation_note = AsyncMock(return_value=sample_note)

        response = await authenticated_client.post(
            f"/api/conversations/{sample_conv['session_id']}/notes",
            json={"content": "Follow up needed"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["note_id"] == "note_001"
        assert data["content"] == "Follow up needed"

    @pytest.mark.asyncio
    async def test_add_note_empty_content_rejected(self, authenticated_client, mock_mongodb, sample_conv):
        """Test that empty note content is rejected."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)

        response = await authenticated_client.post(
            f"/api/conversations/{sample_conv['session_id']}/notes",
            json={"content": ""},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_add_note_conversation_not_found(self, authenticated_client, mock_mongodb):
        """Test adding note when conversation does not exist."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.post(
            "/api/conversations/nonexistent/notes",
            json={"content": "Some note"},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_note_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating an existing note."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_note = AsyncMock(return_value=True)

        response = await authenticated_client.put(
            f"/api/conversations/{sample_conv['session_id']}/notes/note_001",
            json={"content": "Updated note text"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["note_id"] == "note_001"
        assert data["content"] == "Updated note text"

    @pytest.mark.asyncio
    async def test_update_note_not_found(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating a note that does not exist."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_note = AsyncMock(return_value=False)

        response = await authenticated_client.put(
            f"/api/conversations/{sample_conv['session_id']}/notes/nonexistent_note",
            json={"content": "Updated text"},
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_note_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test deleting an existing note."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.delete_conversation_note = AsyncMock(return_value=True)

        response = await authenticated_client.delete(
            f"/api/conversations/{sample_conv['session_id']}/notes/note_001",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["note_id"] == "note_001"
        assert "deleted" in data["message"].lower()

    @pytest.mark.asyncio
    async def test_delete_note_not_found(self, authenticated_client, mock_mongodb, sample_conv):
        """Test deleting a note that does not exist."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.delete_conversation_note = AsyncMock(return_value=False)

        response = await authenticated_client.delete(
            f"/api/conversations/{sample_conv['session_id']}/notes/nonexistent_note",
        )

        assert response.status_code == 404


class TestUpdateConversationVisitor:
    """Tests for PATCH /api/conversations/{session_id}/visitor endpoint."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.mark.asyncio
    async def test_update_visitor_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating visitor name and email."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_visitor = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/visitor",
            json={"visitor_name": "Jane Doe", "visitor_email": "jane@example.com"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["visitor_name"] == "Jane Doe"
        assert data["visitor_email"] == "jane@example.com"

    @pytest.mark.asyncio
    async def test_update_visitor_partial(self, authenticated_client, mock_mongodb, sample_conv):
        """Test updating only visitor name."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.update_conversation_visitor = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/visitor",
            json={"visitor_name": "Jane Doe"},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_update_visitor_not_found(self, authenticated_client, mock_mongodb):
        """Test updating visitor on non-existent conversation."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.patch(
            "/api/conversations/nonexistent/visitor",
            json={"visitor_name": "Jane Doe"},
        )

        assert response.status_code == 404


class TestMarkConversationRead:
    """Tests for PATCH /api/conversations/{session_id}/read endpoint."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.mark.asyncio
    async def test_mark_read_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test marking a conversation as read."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.mark_conversation_read = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/read",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["unread"] is False
        assert data["session_id"] == sample_conv["session_id"]

    @pytest.mark.asyncio
    async def test_mark_read_conversation_not_found(self, authenticated_client, mock_mongodb):
        """Test marking read on non-existent conversation."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.patch("/api/conversations/nonexistent/read")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_read_unauthenticated(self, client):
        """Test mark read without authentication fails."""
        response = await client.patch("/api/conversations/session_123/read")

        assert response.status_code == 401


class TestSetConversationRating:
    """Tests for PATCH /api/conversations/{session_id}/rating endpoint."""

    @pytest.fixture
    def sample_conv(self):
        return {
            "session_id": "session_123",
            "site_id": "test_site_123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "messages": [],
            "stats": {},
        }

    @pytest.mark.asyncio
    async def test_set_rating_success(self, authenticated_client, mock_mongodb, sample_conv):
        """Test setting a satisfaction rating."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.set_conversation_rating = AsyncMock(return_value=True)

        response = await authenticated_client.patch(
            f"/api/conversations/{sample_conv['session_id']}/rating",
            json={"rating": 5},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["satisfaction_rating"] == 5

    @pytest.mark.asyncio
    async def test_set_rating_boundary_values(self, authenticated_client, mock_mongodb, sample_conv):
        """Test that rating 1 and 5 are both accepted."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)
        mock_mongodb.set_conversation_rating = AsyncMock(return_value=True)

        for rating in (1, 5):
            response = await authenticated_client.patch(
                f"/api/conversations/{sample_conv['session_id']}/rating",
                json={"rating": rating},
            )
            assert response.status_code == 200, f"Expected 200 for rating={rating}"

    @pytest.mark.asyncio
    async def test_set_rating_out_of_range(self, authenticated_client, mock_mongodb, sample_conv):
        """Test that rating outside 1-5 is rejected."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=sample_conv)

        for bad_rating in (0, 6):
            response = await authenticated_client.patch(
                f"/api/conversations/{sample_conv['session_id']}/rating",
                json={"rating": bad_rating},
            )
            assert response.status_code == 422, f"Expected 422 for rating={bad_rating}"

    @pytest.mark.asyncio
    async def test_set_rating_not_found(self, authenticated_client, mock_mongodb):
        """Test rating on non-existent conversation."""
        mock_mongodb.get_conversation_full = AsyncMock(return_value=None)

        response = await authenticated_client.patch(
            "/api/conversations/nonexistent/rating",
            json={"rating": 3},
        )

        assert response.status_code == 404


class TestAutoCloseConversations:
    """Tests for POST /api/conversations/auto-close endpoint."""

    @pytest.mark.asyncio
    async def test_auto_close_success(self, admin_client, mock_mongodb):
        """Test auto-closing inactive conversations."""
        mock_mongodb.auto_close_inactive_conversations = AsyncMock(return_value=3)

        response = await admin_client.post(
            "/api/conversations/auto-close",
            json={"days_inactive": 7},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["closed_count"] == 3
        assert "3" in data["message"]

    @pytest.mark.asyncio
    async def test_auto_close_none_closed(self, admin_client, mock_mongodb):
        """Test auto-close when no conversations qualify."""
        mock_mongodb.auto_close_inactive_conversations = AsyncMock(return_value=0)

        response = await admin_client.post(
            "/api/conversations/auto-close",
            json={"days_inactive": 30},
        )

        assert response.status_code == 200
        assert response.json()["closed_count"] == 0

    @pytest.mark.asyncio
    async def test_auto_close_invalid_days(self, admin_client):
        """Test that days_inactive < 1 is rejected."""
        response = await admin_client.post(
            "/api/conversations/auto-close",
            json={"days_inactive": 0},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_auto_close_non_admin_forbidden(self, client, mock_database):
        """Test that non-admin users cannot auto-close conversations."""
        from app.services.auth import get_password_hash, create_access_token
        uid = mock_database.seed_user({
            "user_id": "regular_user_ac",
            "email": "regular_ac@example.com",
            "name": "Regular",
            "password_hash": get_password_hash("Pass123!"),
            "role": "user",
            "created_at": datetime.utcnow(),
        })
        token = create_access_token({"sub": uid, "email": "regular_ac@example.com", "role": "user"})
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.post(
            "/api/conversations/auto-close",
            json={"days_inactive": 7},
            headers=headers,
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_auto_close_unauthenticated(self, client):
        """Test auto-close without authentication fails."""
        response = await client.post(
            "/api/conversations/auto-close",
            json={"days_inactive": 7},
        )

        assert response.status_code == 401
