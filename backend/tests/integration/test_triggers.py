"""
Tests for triggers API endpoints.

Uses provider-based mocking via MockDatabaseProvider.
"""
import pytest
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def sample_trigger():
    """Sample trigger data for testing."""
    return {
        "id": "trigger_001",
        "name": "Welcome Message",
        "enabled": True,
        "priority": 10,
        "conditions": [
            {"type": "time", "value": 15, "operator": "gte"}
        ],
        "message": "Hi there! Have any questions?",
        "delay_after_trigger_ms": 0,
        "show_once_per_session": True,
        "show_once_per_visitor": False
    }


@pytest.fixture
def sample_triggers_data(sample_trigger):
    """Sample site triggers response."""
    return {
        "triggers": [sample_trigger],
        "global_cooldown_ms": 30000
    }


class TestGetSiteTriggers:
    """Tests for GET /api/sites/{site_id}/triggers endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_triggers_authenticated(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test getting triggers for authenticated user."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/triggers"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "triggers" in data
        assert "global_cooldown_ms" in data
        assert len(data["triggers"]) == 1
    
    @pytest.mark.asyncio
    async def test_get_triggers_unauthenticated(self, client, sample_site):
        """Test getting triggers without authentication fails."""
        response = await client.get(f"/api/sites/{sample_site['site_id']}/triggers")
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_triggers_empty(self, authenticated_client, mock_database, sample_site):
        """Test getting triggers when none exist."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}/triggers"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["triggers"] == []


class TestCreateTrigger:
    """Tests for POST /api/sites/{site_id}/triggers endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_trigger_success(self, authenticated_client, mock_database, sample_site):
        """Test creating a new trigger."""
        mock_database.seed_site(sample_site)
        
        trigger_create = {
            "name": "Welcome Message",
            "enabled": True,
            "priority": 10,
            "conditions": [{"type": "time", "value": 15, "operator": "gte"}],
            "message": "Hi there! Have any questions?",
            "delay_after_trigger_ms": 0,
            "show_once_per_session": True,
            "show_once_per_visitor": False
        }
        
        response = await authenticated_client.post(
            f"/api/sites/{sample_site['site_id']}/triggers",
            json=trigger_create
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Welcome Message"
        assert data["enabled"] is True
    
    @pytest.mark.asyncio
    async def test_create_trigger_with_scroll_condition(self, authenticated_client, mock_database, sample_site):
        """Test creating trigger with scroll condition."""
        mock_database.seed_site(sample_site)
        
        trigger_create = {
            "name": "Scroll Engagement",
            "enabled": True,
            "priority": 5,
            "conditions": [{"type": "scroll", "value": 75, "operator": "gte"}],
            "message": "Enjoying the content?",
            "delay_after_trigger_ms": 1000,
            "show_once_per_session": True,
            "show_once_per_visitor": True
        }
        
        response = await authenticated_client.post(
            f"/api/sites/{sample_site['site_id']}/triggers",
            json=trigger_create
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["conditions"][0]["type"] == "scroll"
    
    @pytest.mark.asyncio
    async def test_create_trigger_with_exit_intent(self, authenticated_client, mock_database, sample_site):
        """Test creating trigger with exit intent condition."""
        mock_database.seed_site(sample_site)
        
        trigger_create = {
            "name": "Exit Intent",
            "enabled": False,
            "priority": 20,
            "conditions": [{"type": "exit_intent", "value": True, "operator": "eq"}],
            "message": "Wait! Before you go...",
            "delay_after_trigger_ms": 0,
            "show_once_per_session": True,
            "show_once_per_visitor": True
        }
        
        response = await authenticated_client.post(
            f"/api/sites/{sample_site['site_id']}/triggers",
            json=trigger_create
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["conditions"][0]["type"] == "exit_intent"
    
    @pytest.mark.asyncio
    async def test_create_trigger_unauthenticated(self, client, sample_site):
        """Test creating trigger without authentication fails."""
        response = await client.post(
            f"/api/sites/{sample_site['site_id']}/triggers",
            json={"name": "Test", "message": "Hello"}
        )
        
        assert response.status_code == 401


class TestUpdateTrigger:
    """Tests for PUT /api/sites/{site_id}/triggers/{trigger_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_update_trigger_success(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test updating an existing trigger."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}",
            json={"name": "Updated Welcome"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Welcome"
    
    @pytest.mark.asyncio
    async def test_update_trigger_toggle_enabled(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test toggling trigger enabled state."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}",
            json={"enabled": False}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is False
    
    @pytest.mark.asyncio
    async def test_update_trigger_change_priority(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test changing trigger priority."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}",
            json={"priority": 50}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["priority"] == 50
    
    @pytest.mark.asyncio
    async def test_update_trigger_change_conditions(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test updating trigger conditions."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        new_conditions = [
            {"type": "time", "value": 30, "operator": "gte"},
            {"type": "scroll", "value": 50, "operator": "gte"}
        ]
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}",
            json={"conditions": new_conditions}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["conditions"]) == 2
    
    @pytest.mark.asyncio
    async def test_update_trigger_not_found(self, authenticated_client, mock_database, sample_site):
        """Test updating non-existent trigger."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/nonexistent",
            json={"name": "Updated"}
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_update_trigger_no_updates(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test updating trigger with no changes fails."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}",
            json={}
        )
        
        assert response.status_code == 400


class TestDeleteTrigger:
    """Tests for DELETE /api/sites/{site_id}/triggers/{trigger_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_delete_trigger_success(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test deleting a trigger."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await authenticated_client.delete(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Trigger deleted successfully"
    
    @pytest.mark.asyncio
    async def test_delete_trigger_not_found(self, authenticated_client, mock_database, sample_site):
        """Test deleting non-existent trigger."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.delete(
            f"/api/sites/{sample_site['site_id']}/triggers/nonexistent"
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_delete_trigger_unauthenticated(self, client, sample_site, sample_trigger):
        """Test deleting trigger without authentication fails."""
        response = await client.delete(
            f"/api/sites/{sample_site['site_id']}/triggers/{sample_trigger['id']}"
        )
        
        assert response.status_code == 401


class TestReorderTriggers:
    """Tests for POST /api/sites/{site_id}/triggers/reorder endpoint."""
    
    @pytest.mark.asyncio
    async def test_reorder_triggers_success(self, authenticated_client, mock_database, sample_site):
        """Test reordering triggers."""
        mock_database.seed_site(sample_site)
        
        await mock_database.save_trigger(sample_site["site_id"], {"id": "trigger_001", "name": "T1", "priority": 1})
        await mock_database.save_trigger(sample_site["site_id"], {"id": "trigger_002", "name": "T2", "priority": 2})
        await mock_database.save_trigger(sample_site["site_id"], {"id": "trigger_003", "name": "T3", "priority": 3})
        
        response = await authenticated_client.post(
            f"/api/sites/{sample_site['site_id']}/triggers/reorder",
            json={"trigger_ids": ["trigger_003", "trigger_001", "trigger_002"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Triggers reordered successfully"
    
    @pytest.mark.asyncio
    async def test_reorder_triggers_site_not_found(self, authenticated_client, mock_database):
        """Test reordering triggers for non-existent site."""
        response = await authenticated_client.post(
            "/api/sites/nonexistent_site/triggers/reorder",
            json={"trigger_ids": ["trigger_001"]}
        )
        
        assert response.status_code == 404


class TestGlobalCooldown:
    """Tests for PUT /api/sites/{site_id}/triggers/cooldown endpoint."""
    
    @pytest.mark.asyncio
    async def test_set_global_cooldown_success(self, authenticated_client, mock_database, sample_site):
        """Test setting global cooldown."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/cooldown?cooldown_ms=60000"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["cooldown_ms"] == 60000
    
    @pytest.mark.asyncio
    async def test_set_global_cooldown_min_value(self, authenticated_client, mock_database, sample_site):
        """Test setting global cooldown to minimum value."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/cooldown?cooldown_ms=0"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["cooldown_ms"] == 0
    
    @pytest.mark.asyncio
    async def test_set_global_cooldown_max_value(self, authenticated_client, mock_database, sample_site):
        """Test setting global cooldown to maximum value."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/cooldown?cooldown_ms=300000"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["cooldown_ms"] == 300000
    
    @pytest.mark.asyncio
    async def test_set_global_cooldown_exceeds_max(self, authenticated_client, sample_site):
        """Test setting global cooldown beyond maximum fails."""
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/triggers/cooldown?cooldown_ms=500000"
        )
        
        assert response.status_code == 422


class TestWidgetTriggers:
    """Tests for GET /api/widget/{site_id}/triggers endpoint (public)."""
    
    @pytest.mark.asyncio
    async def test_get_widget_triggers_success(self, client, mock_database, sample_site, sample_trigger):
        """Test getting widget triggers (public endpoint)."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await client.get(f"/api/widget/{sample_site['site_id']}/triggers")
        
        assert response.status_code == 200
        data = response.json()
        assert "triggers" in data
        assert "global_cooldown_ms" in data
    
    @pytest.mark.asyncio
    async def test_get_widget_triggers_filters_disabled(self, client, mock_database, sample_site):
        """Test widget triggers filters out disabled triggers."""
        fresh_site = {**sample_site, "triggers": []}
        mock_database.seed_site(fresh_site)
        
        await mock_database.save_trigger(fresh_site["site_id"], {"id": "1", "name": "Active", "enabled": True, "priority": 10, "message": "Active", "conditions": []})
        await mock_database.save_trigger(fresh_site["site_id"], {"id": "2", "name": "Disabled", "enabled": False, "priority": 20, "message": "Disabled", "conditions": []})
        await mock_database.save_trigger(fresh_site["site_id"], {"id": "3", "name": "Also Active", "enabled": True, "priority": 5, "message": "Also Active", "conditions": []})
        
        response = await client.get(f"/api/widget/{fresh_site['site_id']}/triggers")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["triggers"]) == 2
        assert all(t["enabled"] for t in data["triggers"])
    
    @pytest.mark.asyncio
    async def test_get_widget_triggers_sorted_by_priority(self, client, mock_database, sample_site):
        """Test widget triggers are sorted by priority (highest first)."""
        fresh_site = {**sample_site, "triggers": []}
        mock_database.seed_site(fresh_site)
        
        await mock_database.save_trigger(fresh_site["site_id"], {"id": "1", "name": "Low", "enabled": True, "priority": 5, "message": "Low", "conditions": []})
        await mock_database.save_trigger(fresh_site["site_id"], {"id": "2", "name": "High", "enabled": True, "priority": 20, "message": "High", "conditions": []})
        await mock_database.save_trigger(fresh_site["site_id"], {"id": "3", "name": "Medium", "enabled": True, "priority": 10, "message": "Medium", "conditions": []})
        
        response = await client.get(f"/api/widget/{fresh_site['site_id']}/triggers")
        
        assert response.status_code == 200
        data = response.json()
        priorities = [t["priority"] for t in data["triggers"]]
        assert priorities == sorted(priorities, reverse=True)


class TestTriggerEvents:
    """Tests for POST /api/widget/{site_id}/triggers/event endpoint (public)."""
    
    @pytest.mark.asyncio
    async def test_log_trigger_event_shown(self, client, mock_database, sample_site, sample_trigger):
        """Test logging trigger shown event."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await client.post(
            f"/api/widget/{sample_site['site_id']}/triggers/event",
            params={
                "trigger_id": sample_trigger["id"],
                "session_id": "session_123",
                "event_type": "shown"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "event_id" in data
    
    @pytest.mark.asyncio
    async def test_log_trigger_event_clicked(self, client, mock_database, sample_site, sample_trigger):
        """Test logging trigger clicked event."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await client.post(
            f"/api/widget/{sample_site['site_id']}/triggers/event",
            params={
                "trigger_id": sample_trigger["id"],
                "session_id": "session_123",
                "event_type": "clicked"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_log_trigger_event_dismissed(self, client, mock_database, sample_site, sample_trigger):
        """Test logging trigger dismissed event."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await client.post(
            f"/api/widget/{sample_site['site_id']}/triggers/event",
            params={
                "trigger_id": sample_trigger["id"],
                "session_id": "session_123",
                "event_type": "dismissed"
            }
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_log_trigger_event_converted(self, client, mock_database, sample_site, sample_trigger):
        """Test logging trigger converted event."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        response = await client.post(
            f"/api/widget/{sample_site['site_id']}/triggers/event",
            params={
                "trigger_id": sample_trigger["id"],
                "session_id": "session_123",
                "event_type": "converted"
            }
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_log_trigger_event_invalid_type(self, client, sample_site, sample_trigger):
        """Test logging trigger event with invalid type fails."""
        response = await client.post(
            f"/api/widget/{sample_site['site_id']}/triggers/event",
            params={
                "trigger_id": sample_trigger["id"],
                "session_id": "session_123",
                "event_type": "invalid_type"
            }
        )
        
        assert response.status_code == 422


class TestTriggerAnalytics:
    """Tests for GET /api/analytics/triggers/{site_id} endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics_success(self, authenticated_client, mock_database, sample_site, sample_trigger):
        """Test getting trigger analytics."""
        mock_database.seed_site(sample_site)
        await mock_database.save_trigger(sample_site["site_id"], sample_trigger)
        
        for _ in range(100):
            await mock_database.log_trigger_event(sample_site["site_id"], sample_trigger["id"], "session_1", "shown")
        for _ in range(25):
            await mock_database.log_trigger_event(sample_site["site_id"], sample_trigger["id"], "session_1", "clicked")
        for _ in range(50):
            await mock_database.log_trigger_event(sample_site["site_id"], sample_trigger["id"], "session_1", "dismissed")
        for _ in range(10):
            await mock_database.log_trigger_event(sample_site["site_id"], sample_trigger["id"], "session_1", "converted")
        
        response = await authenticated_client.get(
            f"/api/analytics/triggers/{sample_site['site_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["site_id"] == sample_site["site_id"]
        assert data["period_days"] == 7
        assert data["total_shown"] == 100
        assert data["total_clicked"] == 25
        assert data["total_converted"] == 10
        assert len(data["triggers"]) == 1
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics_custom_period(self, authenticated_client, mock_database, sample_site):
        """Test getting trigger analytics with custom period."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/analytics/triggers/{sample_site['site_id']}?period_days=30"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["period_days"] == 30
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics_max_period(self, authenticated_client, mock_database, sample_site):
        """Test getting trigger analytics with maximum period."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/analytics/triggers/{sample_site['site_id']}?period_days=90"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["period_days"] == 90
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics_period_exceeds_max(self, authenticated_client, sample_site):
        """Test getting trigger analytics with period exceeding maximum."""
        response = await authenticated_client.get(
            f"/api/analytics/triggers/{sample_site['site_id']}?period_days=100"
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics_unauthenticated(self, client, sample_site):
        """Test getting trigger analytics without authentication fails."""
        response = await client.get(f"/api/analytics/triggers/{sample_site['site_id']}")
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_trigger_analytics_multiple_triggers(self, authenticated_client, mock_database, sample_site):
        """Test analytics with multiple triggers."""
        mock_database.seed_site(sample_site)
        
        trigger1 = {"id": "trigger_001", "name": "Welcome", "enabled": True}
        trigger2 = {"id": "trigger_002", "name": "Scroll", "enabled": True}
        await mock_database.save_trigger(sample_site["site_id"], trigger1)
        await mock_database.save_trigger(sample_site["site_id"], trigger2)
        
        for _ in range(100):
            await mock_database.log_trigger_event(sample_site["site_id"], "trigger_001", "session_1", "shown")
        for _ in range(25):
            await mock_database.log_trigger_event(sample_site["site_id"], "trigger_001", "session_1", "clicked")
        for _ in range(10):
            await mock_database.log_trigger_event(sample_site["site_id"], "trigger_001", "session_1", "converted")
        
        for _ in range(50):
            await mock_database.log_trigger_event(sample_site["site_id"], "trigger_002", "session_1", "shown")
        for _ in range(15):
            await mock_database.log_trigger_event(sample_site["site_id"], "trigger_002", "session_1", "clicked")
        for _ in range(5):
            await mock_database.log_trigger_event(sample_site["site_id"], "trigger_002", "session_1", "converted")
        
        response = await authenticated_client.get(
            f"/api/analytics/triggers/{sample_site['site_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_shown"] == 150
        assert data["total_clicked"] == 40
        assert data["total_converted"] == 15
        assert len(data["triggers"]) == 2


class TestDefaultTriggers:
    """Tests for POST /api/sites/{site_id}/triggers/defaults endpoint."""
    
    @pytest.mark.asyncio
    async def test_create_default_triggers_success(self, authenticated_client, mock_database, sample_site):
        """Test creating default triggers for a site."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.post(
            f"/api/sites/{sample_site['site_id']}/triggers/defaults"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "Created 3 default triggers" in data["message"]
        assert len(data["triggers"]) == 3
    
    @pytest.mark.asyncio
    async def test_create_default_triggers_unauthenticated(self, client, sample_site):
        """Test creating default triggers without authentication fails."""
        response = await client.post(f"/api/sites/{sample_site['site_id']}/triggers/defaults")
        
        assert response.status_code == 401
