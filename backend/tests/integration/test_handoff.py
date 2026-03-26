"""
Tests for handoff API endpoints.
"""
import pytest
from unittest.mock import AsyncMock
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def sample_handoff_data():
    """Sample handoff data for testing."""
    return {
        "handoff_id": "handoff_001",
        "session_id": "session_123",
        "site_id": "test_site_123",
        "status": "pending",
        "reason": "Need help with billing",
        "visitor_email": "visitor@example.com",
        "visitor_name": "John Doe",
        "ai_conversation": [
            {"role": "user", "content": "I have a billing question"},
            {"role": "assistant", "content": "I'd be happy to help!"}
        ],
        "ai_summary": "User has billing question",
        "assigned_agent_id": None,
        "assigned_agent_name": None,
        "messages": [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }


@pytest.fixture
def sample_handoff_config():
    """Sample handoff configuration."""
    return {
        "enabled": True,
        "auto_escalation": True,
        "escalation_keywords": ["urgent", "help", "human"],
        "business_hours": {
            "enabled": True,
            "timezone": "America/New_York",
            "schedule": {
                "monday": {"start": "09:00", "end": "17:00"},
                "tuesday": {"start": "09:00", "end": "17:00"},
                "wednesday": {"start": "09:00", "end": "17:00"},
                "thursday": {"start": "09:00", "end": "17:00"},
                "friday": {"start": "09:00", "end": "17:00"}
            },
            "offline_message": "We're currently offline. Please leave a message."
        }
    }


class TestCreateHandoff:
    """Tests for POST /api/handoff endpoint (public)."""
    
    @pytest.mark.asyncio
    async def test_create_handoff_success(self, client, mock_mongodb, sample_site, sample_handoff_data):
        """Test creating a new handoff request."""
        mock_mongodb.get_handoff_by_session = AsyncMock(return_value=None)
        mock_mongodb.create_handoff_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.seed_site(sample_site)
        
        request_data = {
            "session_id": "session_123",
            "site_id": sample_site["site_id"],
            "reason": "Need help with billing",
            "visitor_email": "visitor@example.com",
            "visitor_name": "John Doe",
            "ai_conversation": [
                {"role": "user", "content": "I have a billing question"},
                {"role": "assistant", "content": "I'd be happy to help!"}
            ]
        }
        
        response = await client.post("/api/handoff", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["handoff_id"] == "handoff_001"
        assert data["status"] == "pending"
    
    @pytest.mark.asyncio
    async def test_create_handoff_existing_session(self, client, mock_mongodb, sample_site, sample_handoff_data):
        """Test creating handoff when one already exists for session."""
        mock_mongodb.get_handoff_by_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.seed_site(sample_site)
        
        request_data = {
            "session_id": "session_123",
            "site_id": sample_site["site_id"],
            "reason": "Need help"
        }
        
        response = await client.post("/api/handoff", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "already exists" in data.get("message", "") or data.get("handoff_id")
    
    @pytest.mark.asyncio
    async def test_create_handoff_minimal_data(self, client, mock_mongodb, sample_site, sample_handoff_data):
        """Test creating handoff with minimal required data."""
        mock_mongodb.get_handoff_by_session = AsyncMock(return_value=None)
        mock_mongodb.create_handoff_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.seed_site(sample_site)
        
        request_data = {
            "session_id": "session_123",
            "site_id": sample_site["site_id"]
        }
        
        response = await client.post("/api/handoff", json=request_data)
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_create_handoff_with_long_conversation(self, client, mock_mongodb, sample_site, sample_handoff_data):
        """Test creating handoff with long AI conversation (should truncate)."""
        long_conversation = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"Message {i}"}
            for i in range(20)
        ]
        
        mock_mongodb.get_handoff_by_session = AsyncMock(return_value=None)
        mock_mongodb.create_handoff_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.seed_site(sample_site)
        
        request_data = {
            "session_id": "session_123",
            "site_id": sample_site["site_id"],
            "ai_conversation": long_conversation
        }
        
        response = await client.post("/api/handoff", json=request_data)
        
        assert response.status_code == 200


class TestGetHandoff:
    """Tests for GET /api/handoff/{handoff_id} endpoint (public)."""
    
    @pytest.mark.asyncio
    async def test_get_handoff_success(self, client, mock_mongodb, sample_handoff_data):
        """Test getting handoff details."""
        mock_mongodb.get_handoff_session = AsyncMock(return_value=sample_handoff_data)
        
        response = await client.get(f"/api/handoff/{sample_handoff_data['handoff_id']}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["handoff_id"] == sample_handoff_data["handoff_id"]
        assert data["status"] == "pending"
    
    @pytest.mark.asyncio
    async def test_get_handoff_not_found(self, client, mock_mongodb):
        """Test getting non-existent handoff."""
        mock_mongodb.get_handoff_session = AsyncMock(return_value=None)
        
        response = await client.get("/api/handoff/nonexistent")
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_get_handoff_with_agent_assigned(self, client, mock_mongodb, sample_handoff_data):
        """Test getting handoff with assigned agent."""
        handoff_with_agent = {
            **sample_handoff_data,
            "status": "active",
            "assigned_agent_id": "agent_001",
            "assigned_agent_name": "Support Agent"
        }
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=handoff_with_agent)
        
        response = await client.get(f"/api/handoff/{sample_handoff_data['handoff_id']}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["assigned_agent_name"] == "Support Agent"


class TestHandoffMessages:
    """Tests for handoff messaging endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_handoff_messages(self, client, mock_mongodb, sample_handoff_data):
        """Test getting handoff messages."""
        messages_response = {
            "messages": [
                {"role": "visitor", "content": "Hello", "timestamp": datetime.utcnow().isoformat()},
                {"role": "agent", "content": "Hi there!", "timestamp": datetime.utcnow().isoformat()}
            ],
            "status": "active",
            "agent_name": None
        }
        
        mock_mongodb.get_handoff_messages = AsyncMock(return_value=messages_response)
        
        response = await client.get(f"/api/handoff/{sample_handoff_data['handoff_id']}/messages")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["messages"]) == 2
    
    @pytest.mark.asyncio
    async def test_get_handoff_messages_with_since(self, client, mock_mongodb, sample_handoff_data):
        """Test getting handoff messages with since filter."""
        messages_response = {
            "messages": [
                {"role": "agent", "content": "New message", "timestamp": datetime.utcnow().isoformat()}
            ],
            "status": "active",
            "agent_name": None
        }
        
        mock_mongodb.get_handoff_messages = AsyncMock(return_value=messages_response)
        
        since = (datetime.utcnow() - timedelta(minutes=5)).isoformat()
        response = await client.get(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/messages?since={since}"
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_get_handoff_messages_not_found(self, client, mock_mongodb):
        """Test getting messages for non-existent handoff."""
        # Route expects None for not found (falsy triggers 404)
        mock_mongodb.get_handoff_messages = AsyncMock(return_value=None)
        
        response = await client.get("/api/handoff/nonexistent/messages")
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_send_visitor_message(self, client, mock_mongodb, sample_handoff_data):
        """Test sending message as visitor."""
        active_handoff = {**sample_handoff_data, "status": "active"}
        message = {
            "id": "msg_001",
            "role": "visitor",
            "content": "Hello, I need help",
            "sender_name": "John Doe",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=active_handoff)
        mock_mongodb.add_handoff_message = AsyncMock(return_value=message)
        
        response = await client.post(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/messages",
            json={"content": "Hello, I need help", "sender_name": "John Doe"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_send_visitor_message_resolved_handoff(self, client, mock_mongodb, sample_handoff_data):
        """Test sending message to resolved handoff fails."""
        resolved_handoff = {**sample_handoff_data, "status": "resolved"}
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=resolved_handoff)
        
        response = await client.post(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/messages",
            json={"content": "Hello"}
        )
        
        assert response.status_code == 400
        assert "resolved" in response.json()["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_send_agent_message(self, authenticated_client, mock_mongodb, sample_handoff_data):
        """Test sending message as agent."""
        active_handoff = {**sample_handoff_data, "status": "active"}
        message = {
            "id": "msg_001",
            "role": "agent",
            "content": "How can I help?",
            "sender_name": "Agent",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=active_handoff)
        mock_mongodb.add_handoff_message = AsyncMock(return_value=message)
        
        response = await authenticated_client.post(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/agent-message",
            json={"content": "How can I help?"}
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_send_agent_message_claims_pending(self, authenticated_client, mock_mongodb, sample_handoff_data):
        """Test agent message on pending handoff claims it."""
        pending_handoff = {**sample_handoff_data, "status": "pending"}
        message = {
            "id": "msg_001",
            "role": "agent",
            "content": "I'll help you",
            "sender_name": "Agent",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=pending_handoff)
        mock_mongodb.update_handoff_status = AsyncMock(return_value=True)
        mock_mongodb.add_handoff_message = AsyncMock(return_value=message)
        
        response = await authenticated_client.post(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/agent-message",
            json={"content": "I'll help you"}
        )
        
        assert response.status_code == 200
        mock_mongodb.update_handoff_status.assert_called_once()


class TestUpdateHandoffStatus:
    """Tests for PUT /api/handoff/{handoff_id}/status endpoint."""
    
    @pytest.mark.asyncio
    async def test_update_status_to_active(self, authenticated_client, mock_mongodb, sample_handoff_data, mock_user):
        """Test claiming a handoff (pending -> active)."""
        updated_handoff = {
            **sample_handoff_data,
            "status": "active",
            "assigned_agent_id": str(mock_user["_id"]),
            "assigned_agent_name": mock_user["name"]
        }
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.update_handoff_status = AsyncMock(return_value=True)
        
        response = await authenticated_client.put(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/status",
            json={"status": "active"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_update_status_to_resolved(self, authenticated_client, mock_mongodb, sample_handoff_data):
        """Test resolving a handoff."""
        active_handoff = {**sample_handoff_data, "status": "active"}
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=active_handoff)
        mock_mongodb.update_handoff_status = AsyncMock(return_value=True)
        
        response = await authenticated_client.put(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/status",
            json={"status": "resolved"}
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_update_status_to_abandoned(self, authenticated_client, mock_mongodb, sample_handoff_data):
        """Test marking handoff as abandoned."""
        mock_mongodb.get_handoff_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.update_handoff_status = AsyncMock(return_value=True)
        
        response = await authenticated_client.put(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/status",
            json={"status": "abandoned"}
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_update_status_not_found(self, authenticated_client, mock_mongodb):
        """Test updating status of non-existent handoff."""
        mock_mongodb.get_handoff_session = AsyncMock(return_value=None)
        
        response = await authenticated_client.put(
            "/api/handoff/nonexistent/status",
            json={"status": "active"}
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_update_status_unauthenticated(self, client, sample_handoff_data):
        """Test updating status without authentication fails."""
        response = await client.put(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/status",
            json={"status": "active"}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_update_status_update_failed(self, authenticated_client, mock_mongodb, sample_handoff_data):
        """Test handling update failure."""
        mock_mongodb.get_handoff_session = AsyncMock(return_value=sample_handoff_data)
        mock_mongodb.update_handoff_status = AsyncMock(return_value=False)
        
        response = await authenticated_client.put(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/status",
            json={"status": "active"}
        )
        
        assert response.status_code == 500


class TestHandoffQueue:
    """Tests for GET /api/sites/{site_id}/handoff/queue endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_handoff_queue(self, authenticated_client, mock_mongodb, sample_site, sample_handoff_data):
        """Test getting handoff queue."""
        # Route expects tuple: (handoffs, total, pending_count, active_count)
        queue_data = ([sample_handoff_data], 1, 1, 0)
        
        mock_mongodb.get_handoff_queue = AsyncMock(return_value=queue_data)
        mock_mongodb.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/queue"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "handoffs" in data
        assert data["total"] == 1
        assert data["pending_count"] == 1
    
    @pytest.mark.asyncio
    async def test_get_handoff_queue_with_status_filter(self, authenticated_client, mock_mongodb, sample_site):
        """Test getting handoff queue with status filter."""
        # Route expects tuple: (handoffs, total, pending_count, active_count)
        mock_mongodb.get_handoff_queue = AsyncMock(return_value=([], 0, 0, 0))
        mock_mongodb.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/queue?status=pending"
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_get_handoff_queue_pagination(self, authenticated_client, mock_mongodb, sample_site):
        """Test handoff queue pagination."""
        # Route expects tuple: (handoffs, total, pending_count, active_count)
        mock_mongodb.get_handoff_queue = AsyncMock(return_value=([], 50, 10, 5))
        mock_mongodb.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/queue?page=2&limit=10"
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_get_handoff_queue_invalid_status(self, authenticated_client, mock_mongodb, sample_site):
        """Test handoff queue with invalid status filter."""
        mock_mongodb.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/queue?status=invalid"
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_get_handoff_queue_unauthenticated(self, client, sample_site):
        """Test getting handoff queue without authentication fails."""
        response = await client.get(f"/api/sites/{sample_site['site_id']}/handoff/queue")
        
        assert response.status_code == 401


class TestHandoffFullDetails:
    """Tests for GET /api/handoff/{handoff_id}/full endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_handoff_full_details(self, authenticated_client, mock_mongodb, sample_handoff_data):
        """Test getting full handoff details."""
        full_handoff = {
            **sample_handoff_data,
            "messages": [
                {"role": "visitor", "content": "Hello"},
                {"role": "agent", "content": "Hi there!"}
            ]
        }
        
        mock_mongodb.get_handoff_session = AsyncMock(return_value=full_handoff)
        
        response = await authenticated_client.get(
            f"/api/handoff/{sample_handoff_data['handoff_id']}/full"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "messages" in data
    
    @pytest.mark.asyncio
    async def test_get_handoff_full_not_found(self, authenticated_client, mock_mongodb):
        """Test getting full details for non-existent handoff."""
        mock_mongodb.get_handoff_session = AsyncMock(return_value=None)
        
        response = await authenticated_client.get(
            "/api/handoff/nonexistent/full"
        )
        
        assert response.status_code == 404


class TestHandoffAvailability:
    """Tests for GET /api/sites/{site_id}/handoff/availability endpoint (public)."""
    
    @pytest.mark.asyncio
    async def test_check_availability_available(self, client, mock_mongodb, sample_site):
        """Test checking availability when available."""
        mock_mongodb.check_business_hours = AsyncMock(return_value={
            "available": True,
            "is_within_hours": True
        })
        mock_mongodb.seed_site(sample_site)
        
        response = await client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/availability"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is True
        assert data["is_within_hours"] is True
    
    @pytest.mark.asyncio
    async def test_check_availability_offline(self, client, mock_mongodb, sample_site):
        """Test checking availability when offline."""
        mock_mongodb.check_business_hours = AsyncMock(return_value={
            "available": False,
            "is_within_hours": False,
            "offline_message": "We're closed. Back Monday at 9 AM.",
            "next_available": "2024-01-08T09:00:00Z"
        })
        mock_mongodb.seed_site(sample_site)
        
        response = await client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/availability"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        assert data["offline_message"] == "We're closed. Back Monday at 9 AM."


class TestHandoffConfig:
    """Tests for handoff configuration endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_handoff_config(self, authenticated_client, mock_mongodb, sample_site, sample_handoff_config):
        """Test getting handoff configuration."""
        mock_mongodb.get_site_handoff_config = AsyncMock(return_value=sample_handoff_config)
        mock_mongodb.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/config"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is True
    
    @pytest.mark.asyncio
    async def test_get_handoff_config_empty(self, authenticated_client, mock_mongodb, sample_site):
        """Test getting handoff config when none exists."""
        mock_mongodb.get_site_handoff_config = AsyncMock(return_value=None)
        mock_mongodb.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/handoff/config"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data == {}
    
    @pytest.mark.asyncio
    async def test_update_handoff_config(self, authenticated_client, mock_mongodb, sample_site):
        """Test updating handoff configuration."""
        mock_mongodb.update_site_handoff_config = AsyncMock(return_value=True)
        mock_mongodb.seed_site(sample_site)
        
        config_update = {
            "enabled": True,
            "auto_escalation": False
        }
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/handoff/config",
            json=config_update
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_update_handoff_config_with_business_hours(self, authenticated_client, mock_mongodb, sample_site):
        """Test updating handoff config with business hours."""
        mock_mongodb.update_site_handoff_config = AsyncMock(return_value=True)
        mock_mongodb.seed_site(sample_site)
        
        config_update = {
            "enabled": True,
            "business_hours": {
                "enabled": True,
                "timezone": "America/New_York",
                "schedule": {
                    "monday": {"start": "08:00", "end": "18:00"}
                }
            }
        }
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/handoff/config",
            json=config_update
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_update_handoff_config_site_not_found(self, authenticated_client, mock_mongodb, sample_site):
        """Test updating config for non-existent site."""
        mock_mongodb.update_site_handoff_config = AsyncMock(return_value=False)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/handoff/config",
            json={"enabled": True}
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_update_handoff_config_unauthenticated(self, client, sample_site):
        """Test updating config without authentication fails."""
        response = await client.put(
            f"/api/sites/{sample_site['site_id']}/handoff/config",
            json={"enabled": True}
        )
        
        assert response.status_code == 401


class TestBusinessHours:
    """Tests for GET /api/sites/{site_id}/business-hours endpoint (public)."""
    
    @pytest.mark.asyncio
    async def test_get_business_hours(self, client, mock_mongodb, sample_site, sample_handoff_config):
        """Test getting business hours."""
        mock_mongodb.get_site_handoff_config = AsyncMock(return_value=sample_handoff_config)
        mock_mongodb.seed_site(sample_site)
        
        response = await client.get(f"/api/sites/{sample_site['site_id']}/business-hours")
        
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is True
        assert data["timezone"] == "America/New_York"
    
    @pytest.mark.asyncio
    async def test_get_business_hours_no_config(self, client, mock_mongodb, sample_site):
        """Test getting business hours when no config exists."""
        mock_mongodb.get_site_handoff_config = AsyncMock(return_value=None)
        mock_mongodb.seed_site(sample_site)
        
        response = await client.get(f"/api/sites/{sample_site['site_id']}/business-hours")
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_get_business_hours_no_hours_in_config(self, client, mock_mongodb, sample_site):
        """Test getting business hours when config has no hours."""
        mock_mongodb.get_site_handoff_config = AsyncMock(return_value={"enabled": True})
        mock_mongodb.seed_site(sample_site)
        
        response = await client.get(f"/api/sites/{sample_site['site_id']}/business-hours")
        
        assert response.status_code == 200
