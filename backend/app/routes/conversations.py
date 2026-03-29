"""
Conversation Management API Routes.
Handles listing, searching, viewing, exporting, and deleting conversations.
"""
from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import StreamingResponse
import json
import csv
import io

from app.database.mongodb import get_mongodb
from app.routes.auth import require_auth, require_admin
from app.core.site_access import is_admin, is_agent, assigned_site_ids, can_view_site
from app.models.schemas import (
    ConversationListResponse,
    ConversationSearchResponse,
    ConversationDetail,
    ConversationListItem,
    ConversationSearchItem,
    ConversationStats,
    ConversationNote,
    MessageDetail,
    BulkDeleteRequest,
    BulkDeleteResponse,
    ExportRequest,
    UpdateStatusRequest,
    UpdatePriorityRequest,
    UpdateTagsRequest,
    AddNoteRequest,
    UpdateNoteRequest,
    UpdateVisitorRequest,
    SetRatingRequest,
    AutoCloseRequest,
    AutoCloseResponse,
)

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


VALID_SORT_FIELDS = {"updated_at", "created_at", "message_count"}


VALID_STATUSES = {"open", "resolved", "closed"}
VALID_PRIORITIES = {"high", "medium", "low"}


def _forbid_agent_export(user: dict) -> None:
    if is_agent(user):
        raise HTTPException(status_code=403, detail="Access denied")


def _forbid_agent_delete(user: dict) -> None:
    if is_agent(user):
        raise HTTPException(status_code=403, detail="Access denied")


async def _resolve_conversation_site_scope(
    user: dict,
    mongodb,
    site_id: Optional[str],
) -> Tuple[Optional[str], Optional[List[str]]]:
    """
    Returns (single_site_id, site_ids) for MongoDB:
    - (None, None): no site filter (admins only).
    - (str, None): single site.
    - (None, list): $in filter (possibly empty).
    """
    if is_admin(user):
        if site_id:
            site = await mongodb.get_site(site_id)
            if not site:
                raise HTTPException(status_code=404, detail="Site not found")
            return site_id, None
        return None, None

    if is_agent(user):
        allowed = assigned_site_ids(user)
        if not allowed:
            return None, []
        if site_id:
            if site_id not in allowed:
                raise HTTPException(status_code=403, detail="Access denied")
            return site_id, None
        return None, allowed

    if site_id:
        site = await mongodb.get_site(site_id)
        if not site or not can_view_site(user, site):
            raise HTTPException(status_code=403, detail="Access denied")
        return site_id, None

    sites = await mongodb.list_sites(user_id=str(user["_id"]))
    sids = [s["site_id"] for s in sites]
    return None, sids if sids else []


async def _ensure_conversation_access(user: dict, mongodb, session_id: str) -> dict:
    conv = await mongodb.get_conversation_full(session_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    sid = conv.get("site_id")
    if not sid:
        if is_admin(user):
            return conv
        raise HTTPException(status_code=403, detail="Access denied")
    site = await mongodb.get_site(sid)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if not can_view_site(user, site):
        raise HTTPException(status_code=403, detail="Access denied")
    return conv


async def _validate_export_access(user: dict, mongodb, request: ExportRequest) -> None:
    _forbid_agent_export(user)
    if is_admin(user):
        return
    if not request.session_ids and not request.site_id:
        raise HTTPException(
            status_code=400,
            detail="Specify session_ids or site_id",
        )
    if request.site_id:
        site = await mongodb.get_site(request.site_id)
        if not site or not can_view_site(user, site):
            raise HTTPException(status_code=403, detail="Access denied")
    if request.session_ids:
        for sid in request.session_ids:
            conv = await mongodb.get_conversation_full(sid)
            if not conv:
                raise HTTPException(status_code=404, detail="Conversation not found")
            csid = conv.get("site_id")
            if not csid:
                raise HTTPException(status_code=403, detail="Access denied")
            site = await mongodb.get_site(csid)
            if not site or not can_view_site(user, site):
                raise HTTPException(status_code=403, detail="Access denied")
            if request.site_id and csid != request.site_id:
                raise HTTPException(
                    status_code=400,
                    detail="Conversation site does not match site_id filter",
                )


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    user: dict = Depends(require_auth),
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("updated_at", description="Sort field"),
    order: str = Query("desc", description="Sort order: asc or desc"),
    date_from: Optional[str] = Query(None, description="Filter from date (ISO format)"),
    date_to: Optional[str] = Query(None, description="Filter to date (ISO format)"),
    status: Optional[str] = Query(None, description="Filter by status: open, resolved, closed"),
    priority: Optional[str] = Query(None, description="Filter by priority: high, medium, low"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
):
    """
    Get paginated list of conversations with optional filters.
    """
    if sort_by not in VALID_SORT_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sort_by value. Must be one of: {', '.join(sorted(VALID_SORT_FIELDS))}"
        )

    if status and status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}"
        )
    if priority and priority not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}"
        )

    mongodb = await get_mongodb()

    sort_order = -1 if order == "desc" else 1

    from_date = None
    to_date = None
    if date_from:
        try:
            from_date = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    if date_to:
        try:
            to_date = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")

    sid, sids = await _resolve_conversation_site_scope(user, mongodb, site_id)

    kw = dict(
        page=page,
        limit=limit,
        sort_by=sort_by,
        order=sort_order,
        date_from=from_date,
        date_to=to_date,
        status=status,
        priority=priority,
        tag=tag,
    )
    if sid:
        conversations, total = await mongodb.get_conversations_paginated(site_id=sid, **kw)
    elif sids is not None:
        conversations, total = await mongodb.get_conversations_paginated(site_ids=sids, **kw)
    else:
        conversations, total = await mongodb.get_conversations_paginated(**kw)

    items = [ConversationListItem(**conv) for conv in conversations]
    total_pages = (total + limit - 1) // limit

    return ConversationListResponse(
        conversations=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get("/search", response_model=ConversationSearchResponse)
async def search_conversations(
    user: dict = Depends(require_auth),
    q: str = Query(..., min_length=1, description="Search query"),
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page")
):
    """
    Search conversations by message content.
    """
    mongodb = await get_mongodb()

    sid, sids = await _resolve_conversation_site_scope(user, mongodb, site_id)

    if sid:
        conversations, total = await mongodb.search_conversations(
            query=q, site_id=sid, page=page, limit=limit
        )
    elif sids is not None:
        conversations, total = await mongodb.search_conversations(
            query=q, site_ids=sids, page=page, limit=limit
        )
    else:
        conversations, total = await mongodb.search_conversations(
            query=q, page=page, limit=limit
        )

    items = [ConversationSearchItem(**conv) for conv in conversations]
    total_pages = (total + limit - 1) // limit

    return ConversationSearchResponse(
        conversations=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        query=q
    )


@router.post("/auto-close", response_model=AutoCloseResponse)
async def auto_close_conversations(
    body: AutoCloseRequest,
    _admin: dict = Depends(require_admin),
):
    """Close conversations that have had no activity for X days."""
    mongodb = await get_mongodb()
    closed_count = await mongodb.auto_close_inactive_conversations(body.days_inactive)
    return AutoCloseResponse(
        closed_count=closed_count,
        message=f"Closed {closed_count} inactive conversation(s) (inactive for {body.days_inactive}+ days)"
    )


@router.patch("/{session_id}/status")
async def update_conversation_status(
    session_id: str,
    request: UpdateStatusRequest,
    user: dict = Depends(require_auth),
):
    """Update conversation status."""
    if request.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}"
        )
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    updated = await mongodb.update_conversation_status(session_id, request.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"session_id": session_id, "status": request.status}


@router.patch("/{session_id}/priority")
async def update_conversation_priority(
    session_id: str,
    request: UpdatePriorityRequest,
    user: dict = Depends(require_auth),
):
    """Update conversation priority."""
    if request.priority not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}"
        )
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    updated = await mongodb.update_conversation_priority(session_id, request.priority)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"session_id": session_id, "priority": request.priority}


@router.patch("/{session_id}/tags")
async def update_conversation_tags(
    session_id: str,
    request: UpdateTagsRequest,
    user: dict = Depends(require_auth),
):
    """Update conversation tags."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    updated = await mongodb.update_conversation_tags(session_id, request.tags)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"session_id": session_id, "tags": request.tags}


@router.post("/{session_id}/notes")
async def add_conversation_note(
    session_id: str,
    request: AddNoteRequest,
    user: dict = Depends(require_auth),
):
    """Add an internal note to a conversation."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    note = await mongodb.add_conversation_note(session_id, request.content)
    return note


@router.put("/{session_id}/notes/{note_id}")
async def update_conversation_note(
    session_id: str,
    note_id: str,
    request: UpdateNoteRequest,
    user: dict = Depends(require_auth),
):
    """Update an internal note."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    updated = await mongodb.update_conversation_note(session_id, note_id, request.content)
    if not updated:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"note_id": note_id, "content": request.content}


@router.delete("/{session_id}/notes/{note_id}")
async def delete_conversation_note(
    session_id: str,
    note_id: str,
    user: dict = Depends(require_auth),
):
    """Delete an internal note."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    deleted = await mongodb.delete_conversation_note(session_id, note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted", "note_id": note_id}


@router.patch("/{session_id}/visitor")
async def update_conversation_visitor(
    session_id: str,
    request: UpdateVisitorRequest,
    user: dict = Depends(require_auth),
):
    """Update visitor identity information."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    updated = await mongodb.update_conversation_visitor(
        session_id,
        visitor_name=request.visitor_name,
        visitor_email=request.visitor_email
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"session_id": session_id, "visitor_name": request.visitor_name, "visitor_email": request.visitor_email}


@router.patch("/{session_id}/read")
async def mark_conversation_read(session_id: str, user: dict = Depends(require_auth)):
    """Mark a conversation as read."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    await mongodb.mark_conversation_read(session_id)
    return {"session_id": session_id, "unread": False}


@router.patch("/{session_id}/rating")
async def set_conversation_rating(
    session_id: str,
    request: SetRatingRequest,
    user: dict = Depends(require_auth),
):
    """Set satisfaction rating for a conversation."""
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)
    updated = await mongodb.set_conversation_rating(session_id, request.rating)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"session_id": session_id, "satisfaction_rating": request.rating}


@router.get("/{session_id}", response_model=ConversationDetail)
async def get_conversation(session_id: str, user: dict = Depends(require_auth)):
    """
    Get full conversation details with all messages and stats.
    """
    mongodb = await get_mongodb()

    conv = await _ensure_conversation_access(user, mongodb, session_id)

    messages = [
        MessageDetail(
            role=msg.get("role", "user"),
            content=msg.get("content", ""),
            sources=msg.get("sources", []),
            timestamp=msg.get("timestamp", datetime.utcnow()),
            feedback=msg.get("feedback"),
            feedback_at=msg.get("feedback_at"),
            response_time_ms=msg.get("response_time_ms")
        )
        for msg in conv.get("messages", [])
    ]

    stats_data = conv.get("stats", {})
    stats = ConversationStats(**stats_data)

    notes = [
        ConversationNote(
            note_id=n.get("note_id", ""),
            content=n.get("content", ""),
            created_at=n.get("created_at", datetime.utcnow()),
            updated_at=n.get("updated_at", datetime.utcnow())
        )
        for n in conv.get("notes", [])
    ]

    return ConversationDetail(
        session_id=conv["session_id"],
        site_id=conv.get("site_id"),
        created_at=conv.get("created_at", datetime.utcnow()),
        updated_at=conv.get("updated_at", datetime.utcnow()),
        messages=messages,
        stats=stats,
        status=conv.get("status", "open"),
        priority=conv.get("priority", "medium"),
        tags=conv.get("tags", []),
        unread=conv.get("unread", True),
        visitor_name=conv.get("visitor_name"),
        visitor_email=conv.get("visitor_email"),
        page_url=conv.get("page_url"),
        notes=notes,
        first_response_at=conv.get("first_response_at"),
        resolved_at=conv.get("resolved_at"),
        satisfaction_rating=conv.get("satisfaction_rating"),
        sentiment=conv.get("sentiment")
    )


@router.delete("/{session_id}")
async def delete_conversation(session_id: str, user: dict = Depends(require_auth)):
    """
    Delete a single conversation.
    """
    _forbid_agent_delete(user)
    mongodb = await get_mongodb()
    await _ensure_conversation_access(user, mongodb, session_id)

    deleted = await mongodb.clear_conversation(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"message": "Conversation deleted", "session_id": session_id}


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_conversations(
    request: BulkDeleteRequest,
    user: dict = Depends(require_auth),
):
    """
    Delete multiple conversations at once.
    """
    _forbid_agent_delete(user)
    mongodb = await get_mongodb()

    for sid in request.session_ids:
        await _ensure_conversation_access(user, mongodb, sid)

    deleted_count = await mongodb.delete_conversations_bulk(request.session_ids)

    return BulkDeleteResponse(
        deleted_count=deleted_count,
        message=f"Successfully deleted {deleted_count} conversation(s)"
    )


@router.post("/export")
async def export_conversations(
    request: ExportRequest,
    user: dict = Depends(require_auth),
):
    """
    Export conversations as JSON or CSV.
    """
    mongodb = await get_mongodb()
    await _validate_export_access(user, mongodb, request)

    conversations = await mongodb.get_conversations_for_export(
        session_ids=request.session_ids,
        site_id=request.site_id
    )

    if not conversations:
        raise HTTPException(status_code=404, detail="No conversations found")

    if request.format == "json":
        def serialize_datetime(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

        json_data = json.dumps(conversations, default=serialize_datetime, indent=2)

        return StreamingResponse(
            iter([json_data]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=conversations_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            }
        )

    elif request.format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "session_id",
            "site_id",
            "created_at",
            "updated_at",
            "message_role",
            "message_content",
            "message_timestamp",
            "feedback"
        ])

        for conv in conversations:
            session_id = conv.get("session_id", "")
            site_id = conv.get("site_id", "")
            created_at = conv.get("created_at", "")
            updated_at = conv.get("updated_at", "")

            messages = conv.get("messages", [])
            if messages:
                for msg in messages:
                    writer.writerow([
                        session_id,
                        site_id,
                        created_at,
                        updated_at,
                        msg.get("role", ""),
                        msg.get("content", ""),
                        msg.get("timestamp", ""),
                        msg.get("feedback", "")
                    ])
            else:
                writer.writerow([session_id, site_id, created_at, updated_at, "", "", "", ""])

        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=conversations_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'json' or 'csv'")
