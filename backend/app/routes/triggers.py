"""
API routes for proactive chat triggers management.
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from loguru import logger

from app.database import get_mongodb
from app.models.schemas import (
    ChatTrigger,
    ChatTriggerCreate,
    ChatTriggerUpdate,
    SiteTriggers,
    TriggerReorderRequest,
    TriggerEvent,
    TriggerAnalytics,
    TriggerAnalyticsResponse
)
from app.routes.auth import require_auth


router = APIRouter(prefix="/api", tags=["triggers"])


@router.get("/sites/{site_id}/triggers", response_model=SiteTriggers)
async def get_site_triggers(
    site_id: str,
    current_user: dict = Depends(require_auth)
):
    """Get all triggers for a site."""
    mongodb = await get_mongodb()
    triggers_data = await mongodb.get_site_triggers(site_id)
    return SiteTriggers(**triggers_data)


@router.post("/sites/{site_id}/triggers", response_model=ChatTrigger)
async def create_trigger(
    site_id: str,
    trigger: ChatTriggerCreate,
    current_user: dict = Depends(require_auth)
):
    """Create a new trigger for a site."""
    mongodb = await get_mongodb()
    
    trigger_dict = trigger.model_dump()
    trigger_dict["id"] = None
    
    saved_trigger = await mongodb.save_trigger(site_id, trigger_dict)
    return ChatTrigger(**saved_trigger)


@router.put("/sites/{site_id}/triggers/cooldown")
async def set_global_cooldown(
    site_id: str,
    cooldown_ms: int = Query(..., ge=0, le=300000),
    current_user: dict = Depends(require_auth)
):
    """Set the global cooldown between triggers."""
    mongodb = await get_mongodb()
    
    await mongodb.set_global_cooldown(site_id, cooldown_ms)
    
    return {"message": "Global cooldown updated", "cooldown_ms": cooldown_ms}


@router.put("/sites/{site_id}/triggers/{trigger_id}", response_model=ChatTrigger)
async def update_trigger(
    site_id: str,
    trigger_id: str,
    trigger_update: ChatTriggerUpdate,
    current_user: dict = Depends(require_auth)
):
    """Update an existing trigger."""
    mongodb = await get_mongodb()
    
    updates = {k: v for k, v in trigger_update.model_dump().items() if v is not None}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    if "conditions" in updates:
        updates["conditions"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in updates["conditions"]]
    
    updated_trigger = await mongodb.update_trigger(site_id, trigger_id, updates)
    
    if not updated_trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    
    return ChatTrigger(**updated_trigger)


@router.delete("/sites/{site_id}/triggers/{trigger_id}")
async def delete_trigger(
    site_id: str,
    trigger_id: str,
    current_user: dict = Depends(require_auth)
):
    """Delete a trigger."""
    mongodb = await get_mongodb()
    
    deleted = await mongodb.delete_trigger(site_id, trigger_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Trigger not found")
    
    return {"message": "Trigger deleted successfully"}


@router.post("/sites/{site_id}/triggers/reorder")
async def reorder_triggers(
    site_id: str,
    request: TriggerReorderRequest,
    current_user: dict = Depends(require_auth)
):
    """Reorder triggers by priority."""
    mongodb = await get_mongodb()
    
    success = await mongodb.reorder_triggers(site_id, request.trigger_ids)
    
    if not success:
        raise HTTPException(status_code=404, detail="Site not found")
    
    return {"message": "Triggers reordered successfully"}


@router.get("/widget/{site_id}/triggers", response_model=SiteTriggers)
async def get_widget_triggers(site_id: str):
    """
    Public endpoint for widget to fetch active triggers.
    No authentication required.
    """
    mongodb = await get_mongodb()
    triggers_data = await mongodb.get_site_triggers(site_id)
    
    active_triggers = [t for t in triggers_data.get("triggers", []) if t.get("enabled", True)]
    active_triggers.sort(key=lambda x: x.get("priority", 0), reverse=True)
    
    return SiteTriggers(
        triggers=active_triggers,
        global_cooldown_ms=triggers_data.get("global_cooldown_ms", 30000)
    )


@router.post("/widget/{site_id}/triggers/event")
async def log_trigger_event(
    site_id: str,
    trigger_id: str = Query(...),
    session_id: str = Query(...),
    event_type: str = Query(..., pattern="^(shown|clicked|dismissed|converted)$")
):
    """
    Log a trigger event from the widget.
    No authentication required.
    """
    mongodb = await get_mongodb()
    
    event_id = await mongodb.log_trigger_event(
        site_id=site_id,
        trigger_id=trigger_id,
        session_id=session_id,
        event_type=event_type
    )
    
    return {"success": True, "event_id": event_id}


@router.get("/analytics/triggers/{site_id}", response_model=TriggerAnalyticsResponse)
async def get_trigger_analytics(
    site_id: str,
    period_days: int = Query(default=7, ge=1, le=90),
    current_user: dict = Depends(require_auth)
):
    """Get trigger analytics for a site."""
    mongodb = await get_mongodb()
    
    analytics = await mongodb.get_trigger_analytics(site_id, period_days)
    
    total_shown = sum(a["shown_count"] for a in analytics)
    total_clicked = sum(a["clicked_count"] for a in analytics)
    total_converted = sum(a["converted_count"] for a in analytics)
    
    return TriggerAnalyticsResponse(
        site_id=site_id,
        period_days=period_days,
        triggers=[TriggerAnalytics(**a) for a in analytics],
        total_shown=total_shown,
        total_clicked=total_clicked,
        total_converted=total_converted
    )


@router.post("/sites/{site_id}/triggers/defaults")
async def create_default_triggers(
    site_id: str,
    current_user: dict = Depends(require_auth)
):
    """Create default triggers for a site."""
    mongodb = await get_mongodb()
    
    default_triggers = [
        {
            "id": None,
            "name": "Welcome Message",
            "enabled": True,
            "priority": 10,
            "conditions": [
                {"type": "time", "value": 15, "operator": "gte"}
            ],
            "message": "Hi there! Have any questions? I'm here to help.",
            "delay_after_trigger_ms": 0,
            "show_once_per_session": True,
            "show_once_per_visitor": False
        },
        {
            "id": None,
            "name": "Scroll Engagement",
            "enabled": True,
            "priority": 5,
            "conditions": [
                {"type": "scroll", "value": 75, "operator": "gte"}
            ],
            "message": "Enjoying the content? Ask me anything!",
            "delay_after_trigger_ms": 1000,
            "show_once_per_session": True,
            "show_once_per_visitor": True
        },
        {
            "id": None,
            "name": "Exit Intent",
            "enabled": False,
            "priority": 20,
            "conditions": [
                {"type": "exit_intent", "value": True, "operator": "eq"}
            ],
            "message": "Wait! Before you go, do you have any questions?",
            "delay_after_trigger_ms": 0,
            "show_once_per_session": True,
            "show_once_per_visitor": True
        }
    ]
    
    created_triggers = []
    for trigger in default_triggers:
        saved = await mongodb.save_trigger(site_id, trigger)
        created_triggers.append(saved)
    
    return {"message": f"Created {len(created_triggers)} default triggers", "triggers": created_triggers}
