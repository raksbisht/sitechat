"""
Q&A Training API Routes.
Handles Q&A pair creation, management, and retrieval for training the chatbot.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends

from app.database.mongodb import get_mongodb
from app.routes.auth import get_current_user
from app.services.rag_engine import get_rag_engine
from app.models.schemas import (
    QAPair,
    QAPairCreate,
    QAPairUpdate,
    QAPairFromConversation,
    QAPairListItem,
    QAPairListResponse,
    QAStats,
)

router = APIRouter(prefix="/api/sites/{site_id}/qa", tags=["Q&A Training"])


@router.post("", response_model=QAPair)
async def create_qa_pair(
    site_id: str,
    qa_create: QAPairCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new Q&A pair for a site."""
    mongodb = await get_mongodb()
    
    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    qa_data = {
        "site_id": site_id,
        "question": qa_create.question,
        "answer": qa_create.answer,
        "source_session_id": qa_create.source_session_id,
        "source_message_index": qa_create.source_message_index,
        "created_by": current_user.get("user_id") or current_user.get("email", "unknown")
    }
    
    qa_pair = await mongodb.create_qa_pair(qa_data)
    
    # Invalidate RAG cache
    rag_engine = get_rag_engine()
    rag_engine.invalidate_qa_cache(site_id)
    
    return qa_pair


@router.get("", response_model=QAPairListResponse)
async def list_qa_pairs(
    site_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in question/answer"),
    enabled_only: bool = Query(False, description="Only return enabled Q&A pairs"),
    current_user: dict = Depends(get_current_user)
):
    """Get paginated list of Q&A pairs for a site."""
    mongodb = await get_mongodb()
    
    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    qa_pairs, total = await mongodb.get_qa_pairs(
        site_id=site_id,
        page=page,
        limit=limit,
        search=search,
        enabled_only=enabled_only
    )
    
    items = [QAPairListItem(**qa) for qa in qa_pairs]
    total_pages = (total + limit - 1) // limit
    
    return QAPairListResponse(
        qa_pairs=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get("/stats", response_model=QAStats)
async def get_qa_stats(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get Q&A statistics for a site."""
    mongodb = await get_mongodb()
    
    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    stats = await mongodb.get_qa_stats(site_id)
    return QAStats(**stats)


@router.get("/{qa_id}", response_model=QAPair)
async def get_qa_pair(
    site_id: str,
    qa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single Q&A pair."""
    mongodb = await get_mongodb()
    
    qa = await mongodb.get_qa_pair(qa_id)
    if not qa:
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    if qa.get("site_id") != site_id:
        raise HTTPException(status_code=404, detail="Q&A pair not found for this site")
    
    return qa


@router.put("/{qa_id}", response_model=QAPair)
async def update_qa_pair(
    site_id: str,
    qa_id: str,
    qa_update: QAPairUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a Q&A pair."""
    mongodb = await get_mongodb()
    
    qa = await mongodb.get_qa_pair(qa_id)
    if not qa:
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    if qa.get("site_id") != site_id:
        raise HTTPException(status_code=404, detail="Q&A pair not found for this site")
    
    updates = qa_update.dict(exclude_unset=True)
    if not updates:
        return qa
    
    updated_qa = await mongodb.update_qa_pair(qa_id, updates)
    if not updated_qa:
        raise HTTPException(status_code=500, detail="Failed to update Q&A pair")
    
    # Invalidate RAG cache
    rag_engine = get_rag_engine()
    rag_engine.invalidate_qa_cache(site_id)
    
    return updated_qa


@router.delete("/{qa_id}")
async def delete_qa_pair(
    site_id: str,
    qa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a Q&A pair."""
    mongodb = await get_mongodb()
    
    qa = await mongodb.get_qa_pair(qa_id)
    if not qa:
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    if qa.get("site_id") != site_id:
        raise HTTPException(status_code=404, detail="Q&A pair not found for this site")
    
    deleted = await mongodb.delete_qa_pair(qa_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete Q&A pair")
    
    # Invalidate RAG cache
    rag_engine = get_rag_engine()
    rag_engine.invalidate_qa_cache(site_id)
    
    return {"message": "Q&A pair deleted", "qa_id": qa_id}


@router.post("/from-conversation", response_model=QAPair)
async def create_qa_from_conversation(
    site_id: str,
    request: QAPairFromConversation,
    current_user: dict = Depends(get_current_user)
):
    """Create a Q&A pair from an existing conversation message."""
    mongodb = await get_mongodb()
    
    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    conv = await mongodb.get_conversation_full(request.session_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    messages = conv.get("messages", [])
    
    if request.message_index < 0 or request.message_index >= len(messages):
        raise HTTPException(status_code=400, detail="Invalid message index")
    
    target_message = messages[request.message_index]
    
    if target_message.get("role") != "assistant":
        raise HTTPException(status_code=400, detail="Can only create Q&A from assistant messages")
    
    if request.message_index == 0:
        raise HTTPException(status_code=400, detail="Cannot create Q&A - no preceding user message")
    
    user_message = messages[request.message_index - 1]
    if user_message.get("role") != "user":
        for i in range(request.message_index - 1, -1, -1):
            if messages[i].get("role") == "user":
                user_message = messages[i]
                break
        else:
            raise HTTPException(status_code=400, detail="No user message found before this assistant message")
    
    question = user_message.get("content", "")
    answer = request.edited_answer if request.edited_answer else target_message.get("content", "")
    
    qa_data = {
        "site_id": site_id,
        "question": question,
        "answer": answer,
        "source_session_id": request.session_id,
        "source_message_index": request.message_index,
        "created_by": current_user.get("user_id") or current_user.get("email", "unknown")
    }
    
    qa_pair = await mongodb.create_qa_pair(qa_data)
    
    await mongodb.mark_message_has_qa(request.session_id, request.message_index, qa_pair["id"])
    
    # Invalidate RAG cache
    rag_engine = get_rag_engine()
    rag_engine.invalidate_qa_cache(site_id)
    
    return qa_pair


@router.post("/{qa_id}/toggle", response_model=QAPair)
async def toggle_qa_pair(
    site_id: str,
    qa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Toggle a Q&A pair's enabled status."""
    mongodb = await get_mongodb()
    
    qa = await mongodb.get_qa_pair(qa_id)
    if not qa:
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    if qa.get("site_id") != site_id:
        raise HTTPException(status_code=404, detail="Q&A pair not found for this site")
    
    new_enabled = not qa.get("enabled", True)
    updated_qa = await mongodb.update_qa_pair(qa_id, {"enabled": new_enabled})
    
    if not updated_qa:
        raise HTTPException(status_code=500, detail="Failed to toggle Q&A pair")
    
    # Invalidate RAG cache
    rag_engine = get_rag_engine()
    rag_engine.invalidate_qa_cache(site_id)
    
    return updated_qa
