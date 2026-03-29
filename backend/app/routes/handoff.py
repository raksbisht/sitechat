"""
Human Handoff API Routes.
"""
import asyncio
import json
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime
from loguru import logger
from slowapi import Limiter

from app.database import get_mongodb
from app.routes.auth import require_auth, require_admin, require_admin_or_user
from app.core.security import get_client_ip
from app.services.auth import decode_token, AuthService

limiter = Limiter(key_func=get_client_ip)
from app.core.site_access import (
    is_admin,
    is_agent,
    assigned_site_ids,
    can_access_handoff_session,
    can_manage_site,
    can_view_site,
)
from app.services.auth import AuthService, UserRole
from app.models.schemas import (
    HandoffRequest, HandoffSession, HandoffMessage, HandoffMessageRequest,
    HandoffStatusUpdate, HandoffAssignRequest, HandoffListItem, HandoffQueueResponse,
    HandoffAvailabilityResponse, HandoffConfig, BusinessHoursConfig
)

router = APIRouter(tags=["handoff"])


async def _get_user_from_token(token: str) -> Optional[dict]:
    """Validate a bearer token string and return the user, or None."""
    token_data = decode_token(token)
    if not token_data or not token_data.user_id:
        return None
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    return await auth_service.get_user_by_id(token_data.user_id)


def _serialize_datetime(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


# ==================== Public Widget Endpoints ====================

@router.post("/api/handoff", response_model=dict)
@limiter.limit("5/minute")
async def create_handoff(request: Request, body: HandoffRequest):
    """Create a new handoff request (called from widget)."""
    # Honeypot check
    if body.website:
        logger.warning(f"Honeypot triggered on handoff create from {get_client_ip(request)}")
        return {"handoff_id": "blocked", "status": "pending", "message": "Handoff request created. An agent will be with you shortly."}

    mongodb = await get_mongodb()

    existing = await mongodb.get_handoff_by_session(body.session_id, active_only=True)
    if existing:
        return {
            "handoff_id": existing["handoff_id"],
            "status": existing["status"],
            "message": "Handoff already exists for this session"
        }

    ai_summary = None
    if body.ai_conversation:
        messages = body.ai_conversation[-10:]
        summary_parts = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")[:200]
            summary_parts.append(f"{role}: {content}")
        ai_summary = "\n".join(summary_parts)

    handoff = await mongodb.create_handoff_session(
        session_id=body.session_id,
        site_id=body.site_id,
        reason=body.reason,
        visitor_email=body.visitor_email,
        visitor_name=body.visitor_name,
        ai_conversation=body.ai_conversation,
        ai_summary=ai_summary
    )

    logger.info(f"Created handoff {handoff['handoff_id']} for session {body.session_id}")
    
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
@limiter.limit("30/minute")
async def send_visitor_message(
    request: Request,
    handoff_id: str,
    body: HandoffMessageRequest
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
        content=body.content,
        sender_name=body.sender_name or "Visitor"
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
    """Get handoff queue for a site, or all sites (admin / site owners / assigned agents)."""
    mongodb = await get_mongodb()
    
    status_list = [status] if status else None

    if site_id == "all":
        if is_admin(user):
            handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                site_id=None,
                site_ids=None,
                status=status_list,
                page=page,
                limit=limit,
            )
        elif is_agent(user):
            sids = assigned_site_ids(user)
            if not sids:
                return HandoffQueueResponse(
                    handoffs=[],
                    total=0,
                    pending_count=0,
                    active_count=0,
                )
            handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                site_id=None,
                site_ids=sids,
                status=status_list,
                page=page,
                limit=limit,
            )
        else:
            sites = await mongodb.list_sites(user_id=str(user["_id"]))
            sids = [s["site_id"] for s in sites]
            if not sids:
                return HandoffQueueResponse(
                    handoffs=[],
                    total=0,
                    pending_count=0,
                    active_count=0,
                )
            handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                site_id=None,
                site_ids=sids,
                status=status_list,
                page=page,
                limit=limit,
            )
    else:
        site = await mongodb.get_site(site_id)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")
        if not can_view_site(user, site):
            raise HTTPException(status_code=403, detail="Access denied")
        handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
            site_id=site_id,
            site_ids=None,
            status=status_list,
            page=page,
            limit=limit,
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

    site = await mongodb.get_site(handoff["site_id"])
    if not can_access_handoff_session(user, handoff["site_id"], site):
        raise HTTPException(status_code=403, detail="Access denied")

    from datetime import timezone as tz
    created_at = handoff.get("created_at")
    if created_at and isinstance(created_at, datetime):
        now = datetime.now(tz.utc)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=tz.utc)
        handoff["wait_time_seconds"] = int((now - created_at).total_seconds())
    else:
        handoff["wait_time_seconds"] = 0

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

    site = await mongodb.get_site(handoff["site_id"])
    if not can_access_handoff_session(user, handoff["site_id"], site):
        raise HTTPException(status_code=403, detail="Access denied")
    
    agent_id = None
    agent_name = None
    
    if request.status == "active":
        if handoff["status"] == "active":
            raise HTTPException(status_code=409, detail="Handoff already claimed by another agent")
        if handoff["status"] == "pending":
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


@router.put("/api/handoff/{handoff_id}/assign")
async def assign_handoff_to_agent(
    handoff_id: str,
    request: HandoffAssignRequest,
    caller: dict = Depends(require_admin_or_user),
):
    """
    Admin or site owner assigns a support agent to this handoff (queue routing).
    Agent must belong to the caller and be assigned to the handoff's site.
    """
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)

    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")

    if handoff.get("status") == "resolved":
        raise HTTPException(status_code=400, detail="Cannot reassign a resolved handoff")

    site = await mongodb.get_site(handoff["site_id"])
    if not can_manage_site(caller, site):
        raise HTTPException(status_code=403, detail="Access denied")

    agent = await auth_service.get_user_by_id(request.agent_id)
    if not agent or agent.get("role") != UserRole.AGENT.value:
        raise HTTPException(status_code=400, detail="Invalid agent")

    if str(agent.get("owner_id") or "") != str(caller["_id"]):
        raise HTTPException(status_code=403, detail="Agent is not under your account")

    site_id = handoff.get("site_id")
    agent_sites = agent.get("assigned_site_ids") or []
    if site_id not in agent_sites:
        raise HTTPException(status_code=400, detail="Agent is not assigned to this site")

    agent_name = agent.get("name") or agent.get("email", "Agent")
    updated = await mongodb.assign_handoff_agent(
        handoff_id=handoff_id,
        agent_id=str(agent["_id"]),
        agent_name=agent_name,
    )

    if not updated:
        raise HTTPException(status_code=500, detail="Failed to assign agent")

    logger.info(
        f"Handoff {handoff_id} assigned to agent {agent_name} "
        f"({request.agent_id}) by {caller.get('email')}"
    )

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

    site = await mongodb.get_site(handoff["site_id"])
    if not can_access_handoff_session(user, handoff["site_id"], site):
        raise HTTPException(status_code=403, detail="Access denied")
    
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
    
    updated_handoff = await mongodb.get_handoff_session(handoff_id)
    return {
        "success": True,
        "message": message,
        "handoff_status": updated_handoff["status"],
        "assigned_agent_name": updated_handoff.get("assigned_agent_name")
    }


# ==================== Business Hours Configuration ====================

@router.get("/api/sites/{site_id}/handoff/config")
async def get_handoff_config(
    site_id: str,
    user: dict = Depends(require_auth)
):
    """Get handoff configuration for a site."""
    mongodb = await get_mongodb()

    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not can_view_site(user, site):
        raise HTTPException(status_code=403, detail="Access denied")
    
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

    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not can_manage_site(user, site):
        raise HTTPException(status_code=403, detail="Access denied")
    
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


# ==================== SSE Streaming Endpoints ====================

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.get("/api/handoff/queue/stream")
async def stream_handoff_queue(
    request: Request,
    token: str = Query(...),
    site_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, pattern="^(pending|active|resolved|abandoned)$"),
):
    """SSE stream of queue updates for the agent dashboard. Auth via ?token= query param."""
    user = await _get_user_from_token(token)
    if not user:
        async def _unauth():
            yield f"event: error\ndata: {json.dumps({'error': 'Unauthorized'})}\n\n"
        return StreamingResponse(_unauth(), media_type="text/event-stream", status_code=401)

    mongodb = await get_mongodb()
    status_list = [status] if status else None

    async def generator():
        last_hash = None
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    effective_site_id = site_id if (site_id and site_id != "all") else None

                    if effective_site_id:
                        site = await mongodb.get_site(effective_site_id)
                        if not site or not can_view_site(user, site):
                            yield f"event: error\ndata: {json.dumps({'error': 'Access denied'})}\n\n"
                            break
                        handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                            site_id=effective_site_id, site_ids=None, status=status_list, page=1, limit=50
                        )
                    elif is_admin(user):
                        handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                            site_id=None, site_ids=None, status=status_list, page=1, limit=50
                        )
                    elif is_agent(user):
                        sids = assigned_site_ids(user)
                        if not sids:
                            handoffs, total, pending_count, active_count = [], 0, 0, 0
                        else:
                            handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                                site_id=None, site_ids=sids, status=status_list, page=1, limit=50
                            )
                    else:
                        sites_list = await mongodb.list_sites(user_id=str(user["_id"]))
                        sids = [s["site_id"] for s in sites_list]
                        if not sids:
                            handoffs, total, pending_count, active_count = [], 0, 0, 0
                        else:
                            handoffs, total, pending_count, active_count = await mongodb.get_handoff_queue(
                                site_id=None, site_ids=sids, status=status_list, page=1, limit=50
                            )

                    current_hash = f"{pending_count}:{active_count}:{','.join(h.get('handoff_id', '') for h in handoffs)}"
                    if current_hash != last_hash:
                        last_hash = current_hash

                        safe_handoffs = []
                        for h in handoffs:
                            hh = dict(h)
                            for key in ("created_at", "updated_at"):
                                if isinstance(hh.get(key), datetime):
                                    hh[key] = hh[key].isoformat()
                            safe_handoffs.append(hh)

                        yield f"data: {json.dumps({'handoffs': safe_handoffs, 'total': total, 'pending_count': pending_count, 'active_count': active_count})}\n\n"

                except Exception as e:
                    logger.error(f"Queue SSE error: {e}")

                await asyncio.sleep(5)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(generator(), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.get("/api/handoff/{handoff_id}/stream")
async def stream_handoff_messages(
    handoff_id: str,
    request: Request,
):
    """SSE stream of message updates for a specific handoff session."""
    mongodb = await get_mongodb()

    handoff = await mongodb.get_handoff_session(handoff_id)
    if not handoff:
        async def _not_found():
            yield f"event: error\ndata: {json.dumps({'error': 'Handoff not found'})}\n\n"
        return StreamingResponse(_not_found(), media_type="text/event-stream", status_code=404)

    async def generator():
        last_hash = None
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    result = await mongodb.get_handoff_messages(handoff_id)
                    if not result:
                        yield f"event: error\ndata: {json.dumps({'error': 'Handoff not found'})}\n\n"
                        break

                    messages = result.get("messages", [])
                    status = result.get("status")
                    agent_name = result.get("agent_name")

                    safe_messages = []
                    for m in messages:
                        mm = dict(m)
                        ts = mm.get("timestamp")
                        if isinstance(ts, datetime):
                            mm["timestamp"] = ts.isoformat()
                        safe_messages.append(mm)

                    current_hash = f"{status}:{len(safe_messages)}:{safe_messages[-1].get('id') if safe_messages else ''}"
                    if current_hash != last_hash:
                        last_hash = current_hash
                        payload = {
                            "messages": safe_messages,
                            "status": status,
                            "agent_name": agent_name,
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
                except Exception as e:
                    logger.error(f"Handoff message SSE error ({handoff_id}): {e}")

                await asyncio.sleep(2)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(generator(), media_type="text/event-stream", headers=_SSE_HEADERS)
