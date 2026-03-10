"""
Human Handoff API Routes.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime
from loguru import logger

from app.database import get_mongodb
from app.routes.auth import require_auth, get_current_user
from app.models.schemas import (
    HandoffRequest, HandoffSession, HandoffMessage, HandoffMessageRequest,
    HandoffStatusUpdate, HandoffListItem, HandoffQueueResponse,
    HandoffAvailabilityResponse, HandoffConfig, BusinessHoursConfig
)

router = APIRouter(tags=["handoff"])


# ==================== Public Widget Endpoints ====================

@router.post("/api/handoff", response_model=dict)
async def create_handoff(request: HandoffRequest):
    """Create a new handoff request (called from widget)."""
    mongodb = await get_mongodb()
    
    existing = await mongodb.get_handoff_by_session(request.session_id, active_only=True)
    if existing:
        return {
            "handoff_id": existing["handoff_id"],
            "status": existing["status"],
            "message": "Handoff already exists for this session"
        }
    
    ai_summary = None
    if request.ai_conversation:
        messages = request.ai_conversation[-10:]
        summary_parts = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")[:200]
            summary_parts.append(f"{role}: {content}")
        ai_summary = "\n".join(summary_parts)
    
    handoff = await mongodb.create_handoff_session(
        session_id=request.session_id,
        site_id=request.site_id,
        reason=request.reason,
        visitor_email=request.visitor_email,
        visitor_name=request.visitor_name,
        ai_conversation=request.ai_conversation,
        ai_summary=ai_summary
    )
    
    logger.info(f"Created handoff {handoff['handoff_id']} for session {request.session_id}")
    
    return {
        "handoff_id": handoff["handoff_id"],
        "status": "pending",
        "message": "Handoff request created. An agent will be with you shortly."
    }


@router.get("/api/handoff/{handoff_id}")
async def get_handoff(handoff_id: str):
    """Get handoff session details (public for widget polling)."""
    mongodb = await get_mongodb()
    
    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    
    return {
        "handoff_id": handoff["handoff_id"],
        "status": handoff["status"],
        "assigned_agent_name": handoff.get("assigned_agent_name"),
        "created_at": handoff["created_at"],
        "updated_at": handoff["updated_at"]
    }


@router.get("/api/handoff/{handoff_id}/messages")
async def get_handoff_messages(
    handoff_id: str,
    since: Optional[datetime] = None
):
    """Poll for new messages in a handoff session (public for widget)."""
    mongodb = await get_mongodb()
    
    result = await mongodb.get_handoff_messages(handoff_id, since)
    if not result:
        raise HTTPException(status_code=404, detail="Handoff not found")
    
    return result


@router.post("/api/handoff/{handoff_id}/messages")
async def send_visitor_message(
    handoff_id: str,
    request: HandoffMessageRequest
):
    """Send a message as the visitor (public for widget)."""
    mongodb = await get_mongodb()
    
    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    
    if handoff["status"] == "resolved":
        raise HTTPException(status_code=400, detail="This conversation has been resolved")
    
    message = await mongodb.add_handoff_message(
        handoff_id=handoff_id,
        role="visitor",
        content=request.content,
        sender_name=request.sender_name or "Visitor"
    )
    
    return {"success": True, "message": message}


@router.get("/api/sites/{site_id}/handoff/availability", response_model=HandoffAvailabilityResponse)
async def check_availability(site_id: str):
    """Check if human agents are available (public for widget)."""
    mongodb = await get_mongodb()
    
    result = await mongodb.check_business_hours(site_id)
    
    return HandoffAvailabilityResponse(
        available=result.get("available", True),
        is_within_hours=result.get("is_within_hours", True),
        offline_message=result.get("offline_message"),
        next_available=result.get("next_available")
    )


# ==================== Authenticated Dashboard Endpoints ====================

@router.get("/api/sites/{site_id}/handoff/queue", response_model=HandoffQueueResponse)
async def get_handoff_queue(
    site_id: str,
    status: Optional[str] = Query(None, pattern="^(pending|active|resolved|abandoned)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_auth)
):
    """Get handoff queue for a site."""
    mongodb = await get_mongodb()
    
    status_list = [status] if status else None
    handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
        site_id=site_id,
        status=status_list,
        page=page,
        limit=limit
    )
    
    return HandoffQueueResponse(
        handoffs=[HandoffListItem(**h) for h in handoffs],
        total=total,
        pending_count=pending_count,
        active_count=active_count
    )


@router.get("/api/handoff/{handoff_id}/full")
async def get_handoff_full(
    handoff_id: str,
    user: dict = Depends(require_auth)
):
    """Get full handoff details including conversation history."""
    mongodb = await get_mongodb()
    
    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    
    return handoff


@router.put("/api/handoff/{handoff_id}/status")
async def update_handoff_status(
    handoff_id: str,
    request: HandoffStatusUpdate,
    user: dict = Depends(require_auth)
):
    """Update handoff status (claim, resolve, abandon)."""
    mongodb = await get_mongodb()
    
    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    
    agent_id = None
    agent_name = None
    
    if request.status == "active" and handoff["status"] == "pending":
        agent_id = str(user["_id"])
        agent_name = user.get("name") or user.get("email", "Agent")
    
    updated = await mongodb.update_handoff_status(
        handoff_id=handoff_id,
        status=request.status,
        agent_id=agent_id,
        agent_name=agent_name
    )
    
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update status")
    
    logger.info(f"Handoff {handoff_id} status updated to {request.status} by {user.get('email')}")
    
    return {"success": True, "handoff": updated}


@router.post("/api/handoff/{handoff_id}/agent-message")
async def send_agent_message(
    handoff_id: str,
    request: HandoffMessageRequest,
    user: dict = Depends(require_auth)
):
    """Send a message as the agent."""
    mongodb = await get_mongodb()
    
    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    
    if handoff["status"] == "resolved":
        raise HTTPException(status_code=400, detail="Cannot message a resolved handoff")
    
    if handoff["status"] == "pending":
        await mongodb.update_handoff_status(
            handoff_id=handoff_id,
            status="active",
            agent_id=str(user["_id"]),
            agent_name=user.get("name") or user.get("email", "Agent")
        )
    
    sender_name = request.sender_name or user.get("name") or user.get("email", "Agent")
    
    message = await mongodb.add_handoff_message(
        handoff_id=handoff_id,
        role="agent",
        content=request.content,
        sender_name=sender_name
    )
    
    return {"success": True, "message": message}


# ==================== Business Hours Configuration ====================

@router.get("/api/sites/{site_id}/handoff/config")
async def get_handoff_config(
    site_id: str,
    user: dict = Depends(require_auth)
):
    """Get handoff configuration for a site."""
    mongodb = await get_mongodb()
    
    config = await mongodb.get_site_handoff_config(site_id)
    return config or {}


@router.put("/api/sites/{site_id}/handoff/config")
async def update_handoff_config(
    site_id: str,
    config: HandoffConfig,
    user: dict = Depends(require_auth)
):
    """Update handoff configuration for a site."""
    mongodb = await get_mongodb()
    
    config_dict = config.model_dump()
    if config.business_hours:
        config_dict["business_hours"] = config.business_hours.model_dump()
    
    success = await mongodb.update_site_handoff_config(site_id, config_dict)
    
    if not success:
        raise HTTPException(status_code=404, detail="Site not found")
    
    return {"success": True, "config": config_dict}


@router.get("/api/sites/{site_id}/business-hours")
async def get_business_hours(site_id: str):
    """Get business hours for a site (public for widget)."""
    mongodb = await get_mongodb()
    
    config = await mongodb.get_site_handoff_config(site_id)
    if not config:
        return BusinessHoursConfig().model_dump()
    
    return config.get("business_hours", BusinessHoursConfig().model_dump())
