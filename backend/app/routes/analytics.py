"""
Analytics API routes for dashboard insights.
"""
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from loguru import logger

from app.database import get_mongodb


router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# ==================== Response Models ====================

class AnalyticsOverview(BaseModel):
    """Overview statistics for the dashboard."""
    total_conversations: int = Field(0, description="Total number of conversations")
    total_messages: int = Field(0, description="Total messages sent")
    messages_today: int = Field(0, description="Messages sent today")
    messages_this_week: int = Field(0, description="Messages sent this week")
    avg_messages_per_conversation: float = Field(0.0, description="Average messages per conversation")
    total_feedback: int = Field(0, description="Total feedback received")
    positive_feedback: int = Field(0, description="Positive feedback count")
    satisfaction_rate: float = Field(0.0, description="Satisfaction rate (0-100)")
    active_sites: int = Field(0, description="Number of active sites")


class DailyStats(BaseModel):
    """Daily statistics for charting."""
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    conversations: int = Field(0, description="Number of conversations")
    messages: int = Field(0, description="Number of messages")


class ConversationTrend(BaseModel):
    """Conversation trend data."""
    period: str = Field(..., description="Time period (7d, 30d)")
    data: List[DailyStats] = Field(default_factory=list, description="Daily statistics")
    total_conversations: int = Field(0, description="Total conversations in period")
    total_messages: int = Field(0, description="Total messages in period")
    change_percentage: float = Field(0.0, description="Change from previous period")


class PopularQuestion(BaseModel):
    """Popular question with frequency."""
    question: str = Field(..., description="The question text")
    count: int = Field(0, description="Number of times asked")
    percentage: float = Field(0.0, description="Percentage of total")


class SourceUsage(BaseModel):
    """Source document usage statistics."""
    url: str = Field(..., description="Source URL")
    title: str = Field(..., description="Source title")
    citation_count: int = Field(0, description="Number of times cited")
    percentage: float = Field(0.0, description="Percentage of total citations")


class RecentConversation(BaseModel):
    """Recent conversation summary."""
    session_id: str = Field(..., description="Session ID")
    site_id: Optional[str] = Field(None, description="Site ID")
    message_count: int = Field(0, description="Number of messages")
    first_message: str = Field("", description="First user message")
    last_activity: datetime = Field(..., description="Last activity time")
    has_feedback: bool = Field(False, description="Whether feedback was given")


# ==================== Analytics Endpoints ====================

@router.get("/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(
    site_id: Optional[str] = Query(None, description="Filter by site ID")
):
    """
    Get overview analytics for the dashboard.
    """
    try:
        mongodb = await get_mongodb()
        
        # Build query filter
        query = {}
        if site_id:
            query["site_id"] = site_id
        
        # Get all conversations
        conversations = await mongodb.db.conversations.find(query).to_list(length=10000)
        
        total_conversations = len(conversations)
        total_messages = 0
        messages_today = 0
        messages_this_week = 0
        total_feedback = 0
        positive_feedback = 0
        
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = today - timedelta(days=7)
        
        for conv in conversations:
            messages = conv.get("messages", [])
            total_messages += len(messages)
            
            for msg in messages:
                timestamp = msg.get("timestamp")
                if timestamp:
                    if isinstance(timestamp, str):
                        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    
                    if timestamp >= today:
                        messages_today += 1
                    if timestamp >= week_ago:
                        messages_this_week += 1
                
                # Count feedback
                feedback = msg.get("feedback")
                if feedback:
                    total_feedback += 1
                    if feedback == "positive":
                        positive_feedback += 1
        
        # Calculate averages
        avg_messages = total_messages / total_conversations if total_conversations > 0 else 0
        satisfaction_rate = (positive_feedback / total_feedback * 100) if total_feedback > 0 else 0
        
        # Get active sites count
        sites_count = await mongodb.db.sites.count_documents({"status": "ready"})
        
        return AnalyticsOverview(
            total_conversations=total_conversations,
            total_messages=total_messages,
            messages_today=messages_today,
            messages_this_week=messages_this_week,
            avg_messages_per_conversation=round(avg_messages, 1),
            total_feedback=total_feedback,
            positive_feedback=positive_feedback,
            satisfaction_rate=round(satisfaction_rate, 1),
            active_sites=sites_count
        )
        
    except Exception as e:
        logger.error(f"Analytics overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations", response_model=ConversationTrend)
async def get_conversation_trend(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    period: str = Query("7d", description="Time period: 7d or 30d")
):
    """
    Get conversation trend data for charts.
    """
    try:
        mongodb = await get_mongodb()
        
        # Determine date range
        days = 7 if period == "7d" else 30
        end_date = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
        start_date = (end_date - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        prev_start_date = start_date - timedelta(days=days)
        
        # Build query filter
        query = {}
        if site_id:
            query["site_id"] = site_id
        
        # Get all conversations
        conversations = await mongodb.db.conversations.find(query).to_list(length=10000)
        
        # Initialize daily stats
        daily_data = {}
        for i in range(days):
            date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
            daily_data[date] = {"conversations": set(), "messages": 0}
        
        # Current period stats
        total_conversations = set()
        total_messages = 0
        
        # Previous period stats for comparison
        prev_conversations = set()
        
        for conv in conversations:
            session_id = conv.get("session_id", "")
            messages = conv.get("messages", [])
            
            for msg in messages:
                timestamp = msg.get("timestamp")
                if timestamp:
                    if isinstance(timestamp, str):
                        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    
                    date_str = timestamp.strftime("%Y-%m-%d")
                    
                    # Current period
                    if start_date <= timestamp <= end_date:
                        total_conversations.add(session_id)
                        total_messages += 1
                        
                        if date_str in daily_data:
                            daily_data[date_str]["conversations"].add(session_id)
                            daily_data[date_str]["messages"] += 1
                    
                    # Previous period
                    elif prev_start_date <= timestamp < start_date:
                        prev_conversations.add(session_id)
        
        # Convert to response format
        data = []
        for date_str in sorted(daily_data.keys()):
            data.append(DailyStats(
                date=date_str,
                conversations=len(daily_data[date_str]["conversations"]),
                messages=daily_data[date_str]["messages"]
            ))
        
        # Calculate change percentage
        current_count = len(total_conversations)
        prev_count = len(prev_conversations)
        change_percentage = 0.0
        if prev_count > 0:
            change_percentage = ((current_count - prev_count) / prev_count) * 100
        
        return ConversationTrend(
            period=period,
            data=data,
            total_conversations=current_count,
            total_messages=total_messages,
            change_percentage=round(change_percentage, 1)
        )
        
    except Exception as e:
        logger.error(f"Conversation trend error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/popular-questions", response_model=List[PopularQuestion])
async def get_popular_questions(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    limit: int = Query(10, description="Number of results", ge=1, le=50)
):
    """
    Get the most frequently asked questions.
    """
    try:
        mongodb = await get_mongodb()
        
        # Build query filter
        query = {}
        if site_id:
            query["site_id"] = site_id
        
        # Get all conversations
        conversations = await mongodb.db.conversations.find(query).to_list(length=10000)
        
        # Extract user messages
        questions = {}
        total_questions = 0
        
        for conv in conversations:
            messages = conv.get("messages", [])
            for msg in messages:
                if msg.get("role") == "user":
                    content = msg.get("content", "").strip()
                    if content and len(content) > 5:
                        # Normalize the question
                        normalized = content.lower()[:100]
                        questions[normalized] = questions.get(normalized, {
                            "original": content[:150],
                            "count": 0
                        })
                        questions[normalized]["count"] += 1
                        total_questions += 1
        
        # Sort by count and get top N
        sorted_questions = sorted(
            questions.items(),
            key=lambda x: x[1]["count"],
            reverse=True
        )[:limit]
        
        # Build response
        result = []
        for _, data in sorted_questions:
            percentage = (data["count"] / total_questions * 100) if total_questions > 0 else 0
            result.append(PopularQuestion(
                question=data["original"],
                count=data["count"],
                percentage=round(percentage, 1)
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Popular questions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources-used", response_model=List[SourceUsage])
async def get_sources_used(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    limit: int = Query(10, description="Number of results", ge=1, le=50)
):
    """
    Get the most frequently cited sources.
    """
    try:
        mongodb = await get_mongodb()
        
        # Build query filter
        query = {}
        if site_id:
            query["site_id"] = site_id
        
        # Get all conversations
        conversations = await mongodb.db.conversations.find(query).to_list(length=10000)
        
        # Extract sources from assistant messages
        sources = {}
        total_citations = 0
        
        for conv in conversations:
            messages = conv.get("messages", [])
            for msg in messages:
                if msg.get("role") == "assistant":
                    msg_sources = msg.get("sources", [])
                    for source in msg_sources:
                        url = source.get("url", "")
                        if url:
                            if url not in sources:
                                sources[url] = {
                                    "title": source.get("title", url),
                                    "count": 0
                                }
                            sources[url]["count"] += 1
                            total_citations += 1
        
        # Sort by count and get top N
        sorted_sources = sorted(
            sources.items(),
            key=lambda x: x[1]["count"],
            reverse=True
        )[:limit]
        
        # Build response
        result = []
        for url, data in sorted_sources:
            percentage = (data["count"] / total_citations * 100) if total_citations > 0 else 0
            result.append(SourceUsage(
                url=url,
                title=data["title"],
                citation_count=data["count"],
                percentage=round(percentage, 1)
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Sources used error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent-conversations", response_model=List[RecentConversation])
async def get_recent_conversations(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    limit: int = Query(20, description="Number of results", ge=1, le=100)
):
    """
    Get recent conversations with summaries.
    """
    try:
        mongodb = await get_mongodb()
        
        # Build query filter
        query = {}
        if site_id:
            query["site_id"] = site_id
        
        # Get conversations sorted by updated_at
        cursor = mongodb.db.conversations.find(query).sort("updated_at", -1).limit(limit)
        conversations = await cursor.to_list(length=limit)
        
        result = []
        for conv in conversations:
            messages = conv.get("messages", [])
            
            # Get first user message
            first_message = ""
            for msg in messages:
                if msg.get("role") == "user":
                    first_message = msg.get("content", "")[:100]
                    break
            
            # Check for feedback
            has_feedback = any(msg.get("feedback") for msg in messages)
            
            # Get last activity time
            last_activity = conv.get("updated_at") or conv.get("created_at") or datetime.utcnow()
            
            result.append(RecentConversation(
                session_id=conv.get("session_id", ""),
                site_id=conv.get("site_id"),
                message_count=len(messages),
                first_message=first_message,
                last_activity=last_activity,
                has_feedback=has_feedback
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Recent conversations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
