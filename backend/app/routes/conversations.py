"""
Conversation Management API Routes.
Handles listing, searching, viewing, exporting, and deleting conversations.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
import json
import csv
import io

from app.database.mongodb import get_mongodb
from app.models.schemas import (
    ConversationListResponse,
    ConversationSearchResponse,
    ConversationDetail,
    ConversationListItem,
    ConversationSearchItem,
    ConversationStats,
    MessageDetail,
    BulkDeleteRequest,
    BulkDeleteResponse,
    ExportRequest,
)

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("updated_at", description="Sort field"),
    order: str = Query("desc", description="Sort order: asc or desc"),
    date_from: Optional[str] = Query(None, description="Filter from date (ISO format)"),
    date_to: Optional[str] = Query(None, description="Filter to date (ISO format)")
):
    """
    Get paginated list of conversations with optional filters.
    """
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
    
    conversations, total = await mongodb.get_conversations_paginated(
        site_id=site_id,
        page=page,
        limit=limit,
        sort_by=sort_by,
        order=sort_order,
        date_from=from_date,
        date_to=to_date
    )
    
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
    q: str = Query(..., min_length=1, description="Search query"),
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page")
):
    """
    Search conversations by message content.
    """
    mongodb = await get_mongodb()
    
    conversations, total = await mongodb.search_conversations(
        query=q,
        site_id=site_id,
        page=page,
        limit=limit
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


@router.get("/{session_id}", response_model=ConversationDetail)
async def get_conversation(session_id: str):
    """
    Get full conversation details with all messages and stats.
    """
    mongodb = await get_mongodb()
    
    conv = await mongodb.get_conversation_full(session_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
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
    
    return ConversationDetail(
        session_id=conv["session_id"],
        site_id=conv.get("site_id"),
        created_at=conv.get("created_at", datetime.utcnow()),
        updated_at=conv.get("updated_at", datetime.utcnow()),
        messages=messages,
        stats=stats
    )


@router.delete("/{session_id}")
async def delete_conversation(session_id: str):
    """
    Delete a single conversation.
    """
    mongodb = await get_mongodb()
    
    deleted = await mongodb.clear_conversation(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return {"message": "Conversation deleted", "session_id": session_id}


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_conversations(request: BulkDeleteRequest):
    """
    Delete multiple conversations at once.
    """
    mongodb = await get_mongodb()
    
    deleted_count = await mongodb.delete_conversations_bulk(request.session_ids)
    
    return BulkDeleteResponse(
        deleted_count=deleted_count,
        message=f"Successfully deleted {deleted_count} conversation(s)"
    )


@router.post("/export")
async def export_conversations(request: ExportRequest):
    """
    Export conversations as JSON or CSV.
    """
    mongodb = await get_mongodb()
    
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
