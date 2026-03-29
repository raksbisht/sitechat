"""
Pydantic models for API request/response schemas.
"""
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# ==================== Chat Models ====================

class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    message: str = Field(..., description="User's message", min_length=1, max_length=4000)
    session_id: str = Field(..., description="Unique session identifier")
    user_id: Optional[str] = Field(None, description="User ID for long-term memory")
    site_id: Optional[str] = Field(None, description="Site ID to filter responses")
    stream: bool = Field(False, description="Whether to stream the response")


class SourceDocument(BaseModel):
    """Source document information."""
    url: str = Field(..., description="Source URL")
    title: str = Field(..., description="Page title")
    content_preview: str = Field(..., description="Preview of matched content")
    relevance_score: float = Field(..., description="Relevance score 0-1")


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    answer: str = Field(..., description="The chatbot's answer")
    sources: List[SourceDocument] = Field(default_factory=list, description="Source documents")
    confidence: float = Field(..., description="Confidence score 0-1")
    follow_up_questions: List[str] = Field(default_factory=list, description="Suggested follow-up questions")
    session_id: str = Field(..., description="Session ID")
    tokens_used: Optional[int] = Field(None, description="Number of tokens used")
    suggest_handoff: bool = Field(default=False, description="Whether to suggest human handoff")
    handoff_reason: Optional[str] = Field(None, description="Reason for suggesting handoff")


# ==================== Crawl Models ====================

class CrawlRequest(BaseModel):
    """Request model for crawl endpoint."""
    url: str = Field(..., description="Target URL to crawl")
    max_pages: int = Field(100, description="Maximum pages to crawl", ge=1, le=1000)
    include_patterns: List[str] = Field(default_factory=list, description="URL patterns to include")
    exclude_patterns: List[str] = Field(default_factory=list, description="URL patterns to exclude")


class CrawlStatus(BaseModel):
    """Status of a crawl job."""
    job_id: str = Field(..., description="Crawl job ID")
    status: str = Field(..., description="Job status: running, completed, failed")
    pages_crawled: int = Field(0, description="Number of pages crawled")
    pages_indexed: int = Field(0, description="Number of pages indexed")
    errors: List[str] = Field(default_factory=list, description="Error messages")
    started_at: datetime = Field(..., description="Job start time")
    completed_at: Optional[datetime] = Field(None, description="Job completion time")


class CrawlResponse(BaseModel):
    """Response model for crawl endpoint."""
    job_id: str = Field(..., description="Crawl job ID")
    message: str = Field(..., description="Status message")
    status: str = Field(..., description="Job status")


# ==================== Page Models ====================

class PageInfo(BaseModel):
    """Information about an indexed page."""
    url: str = Field(..., description="Page URL")
    title: str = Field(..., description="Page title")
    chunk_count: int = Field(0, description="Number of chunks")
    last_crawled: datetime = Field(..., description="Last crawl time")
    status: str = Field(..., description="Page status")


# ==================== Conversation Models ====================

class Message(BaseModel):
    """A single message in a conversation."""
    role: str = Field(..., description="Message role: user or assistant")
    content: str = Field(..., description="Message content")
    sources: List[SourceDocument] = Field(default_factory=list, description="Source documents")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Message timestamp")


class ConversationHistory(BaseModel):
    """Conversation history for a session."""
    session_id: str = Field(..., description="Session ID")
    messages: List[Message] = Field(default_factory=list, description="Messages in the conversation")
    created_at: datetime = Field(..., description="Conversation start time")
    updated_at: datetime = Field(..., description="Last update time")


# ==================== Stats Models ====================

class SystemStats(BaseModel):
    """System statistics."""
    total_pages: int = Field(0, description="Total indexed pages")
    total_chunks: int = Field(0, description="Total document chunks")
    total_conversations: int = Field(0, description="Total conversations")
    total_messages: int = Field(0, description="Total messages")
    last_crawl: Optional[datetime] = Field(None, description="Last crawl time")


# ==================== Health Models ====================

class HealthCheck(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Service status")
    mongodb: str = Field(..., description="MongoDB connection status")
    vector_store: str = Field(..., description="Vector store status")
    ollama: str = Field(..., description="Ollama status")


# ==================== Site Configuration Models ====================

class SiteAppearanceConfig(BaseModel):
    """Appearance configuration for the chatbot widget."""
    primary_color: str = Field(default="#0D9488", description="Primary color (hex)")
    chat_title: str = Field(default="Chat with us", description="Chat widget title")
    welcome_message: str = Field(default="Hi! How can I help you today?", description="Welcome message")
    bot_avatar_url: Optional[str] = Field(default=None, description="Custom bot avatar URL")
    position: str = Field(default="bottom-right", description="Widget position: bottom-left or bottom-right")
    # White-label options
    hide_branding: bool = Field(default=False, description="Hide 'Powered by SiteChat' branding")
    custom_branding_text: Optional[str] = Field(default=None, description="Custom branding text (replaces 'Powered by SiteChat')")
    custom_branding_url: Optional[str] = Field(default=None, description="URL for custom branding link")


class SiteBehaviorConfig(BaseModel):
    """Behavior configuration for the chatbot."""
    system_prompt: str = Field(
        default="You are a helpful assistant. Answer questions based on the provided context.",
        description="System prompt for the AI"
    )
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="AI temperature (0-2)")
    max_tokens: int = Field(default=500, ge=50, le=4000, description="Maximum tokens in response")
    show_sources: bool = Field(default=True, description="Show source citations")


class SiteLeadCaptureConfig(BaseModel):
    """Lead capture configuration."""
    collect_email: bool = Field(default=False, description="Collect visitor email")
    email_required: bool = Field(default=False, description="Make email required")
    email_prompt: str = Field(default="Enter your email to continue", description="Email prompt text")
    collect_name: bool = Field(default=False, description="Collect visitor name")
    name_required: bool = Field(default=False, description="Make name required")
    capture_timing: str = Field(
        default="before_chat",
        description="When to capture: before_chat, after_messages, on_handoff"
    )
    messages_before_capture: int = Field(
        default=3,
        ge=1,
        le=20,
        description="Number of messages before showing capture form (for after_messages timing)"
    )


class SiteSecurityConfig(BaseModel):
    """Security configuration for the widget."""
    allowed_domains: List[str] = Field(
        default_factory=list,
        description="List of allowed domains (empty = allow all). Supports wildcards like *.example.com"
    )
    enforce_domain_validation: bool = Field(
        default=False,
        description="Whether to enforce domain validation (reject requests from non-whitelisted domains)"
    )
    require_referrer: bool = Field(
        default=False,
        description="Require a valid Referer header for widget API calls"
    )
    rate_limit_per_session: int = Field(
        default=60,
        ge=1,
        le=1000,
        description="Maximum requests per session per minute"
    )


class QuickPrompt(BaseModel):
    """A single quick prompt/FAQ starter."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="Unique prompt ID")
    text: str = Field(..., description="The prompt text displayed to user", max_length=100)
    icon: Optional[str] = Field(default=None, description="Optional emoji or icon")
    enabled: bool = Field(default=True, description="Whether this prompt is active")


class SiteQuickPromptsConfig(BaseModel):
    """Quick prompts/FAQ starters configuration."""
    enabled: bool = Field(default=True, description="Show quick prompts in widget")
    prompts: List[QuickPrompt] = Field(
        default_factory=lambda: [
            QuickPrompt(text="What can you help me with?", icon="💡"),
            QuickPrompt(text="How do I get started?", icon="🚀"),
            QuickPrompt(text="Tell me about pricing", icon="💰")
        ],
        description="List of quick prompts"
    )
    show_after_response: bool = Field(default=False, description="Also show prompts after bot responses")
    max_display: int = Field(default=4, ge=1, le=10, description="Maximum prompts to display")


class SiteConfig(BaseModel):
    """Complete site configuration."""
    appearance: SiteAppearanceConfig = Field(default_factory=SiteAppearanceConfig)
    behavior: SiteBehaviorConfig = Field(default_factory=SiteBehaviorConfig)
    lead_capture: SiteLeadCaptureConfig = Field(default_factory=SiteLeadCaptureConfig)
    security: SiteSecurityConfig = Field(default_factory=SiteSecurityConfig)
    quick_prompts: SiteQuickPromptsConfig = Field(default_factory=SiteQuickPromptsConfig)


class SiteConfigUpdate(BaseModel):
    """Update model for site configuration (all fields optional)."""
    appearance: Optional[SiteAppearanceConfig] = None
    behavior: Optional[SiteBehaviorConfig] = None
    lead_capture: Optional[SiteLeadCaptureConfig] = None
    security: Optional[SiteSecurityConfig] = None
    quick_prompts: Optional[SiteQuickPromptsConfig] = None


# ==================== Lead Models ====================

class Lead(BaseModel):
    """A captured lead from the chat widget."""
    id: Optional[str] = Field(None, description="Unique lead ID")
    site_id: str = Field(..., description="Site ID")
    session_id: str = Field(..., description="Chat session ID")
    email: Optional[str] = Field(None, description="Visitor email")
    name: Optional[str] = Field(None, description="Visitor name")
    captured_at: datetime = Field(default_factory=datetime.utcnow, description="Capture timestamp")
    source: str = Field(default="chat", description="Capture source: chat, handoff, proactive")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class LeadCreate(BaseModel):
    """Request model for capturing a lead."""
    site_id: str = Field(..., description="Site ID")
    session_id: str = Field(..., description="Chat session ID")
    email: Optional[str] = Field(None, description="Visitor email")
    name: Optional[str] = Field(None, description="Visitor name")
    source: str = Field(default="chat", description="Capture source")
    # Honeypot — must be empty; bots tend to fill every field
    website: Optional[str] = Field(None, description="Leave blank")


class LeadListItem(BaseModel):
    """Lead item for list view."""
    id: str = Field(..., description="Lead ID")
    site_id: str = Field(..., description="Site ID")
    session_id: str = Field(..., description="Session ID")
    email: Optional[str] = Field(None)
    name: Optional[str] = Field(None)
    captured_at: datetime = Field(...)
    source: str = Field(...)


class LeadListResponse(BaseModel):
    """Paginated response for leads list."""
    leads: List[LeadListItem] = Field(default_factory=list)
    total: int = Field(0, description="Total count")
    page: int = Field(1, description="Current page")
    limit: int = Field(20, description="Items per page")
    total_pages: int = Field(0, description="Total pages")


# ==================== Conversation Management Models ====================

class ConversationListItem(BaseModel):
    """Summary item for conversation list view."""
    session_id: str = Field(..., description="Session ID")
    site_id: Optional[str] = Field(None, description="Site ID")
    created_at: datetime = Field(..., description="Conversation start time")
    updated_at: datetime = Field(..., description="Last update time")
    message_count: int = Field(0, description="Total messages in conversation")
    first_message: str = Field("", description="Preview of first message")
    status: str = Field("open", description="Status: open, resolved, closed")
    priority: str = Field("medium", description="Priority: high, medium, low")
    tags: List[str] = Field(default_factory=list)
    unread: bool = Field(True)
    visitor_name: Optional[str] = Field(None)
    visitor_email: Optional[str] = Field(None)
    satisfaction_rating: Optional[int] = Field(None)
    sentiment: Optional[float] = Field(None)


class ConversationSearchItem(ConversationListItem):
    """Search result item with matching snippet."""
    matching_snippet: str = Field("", description="Matching text snippet")


class ConversationStats(BaseModel):
    """Statistics for a conversation."""
    message_count: int = Field(0, description="Total messages")
    user_messages: int = Field(0, description="User messages count")
    assistant_messages: int = Field(0, description="Assistant messages count")
    positive_feedback: int = Field(0, description="Positive feedback count")
    negative_feedback: int = Field(0, description="Negative feedback count")
    avg_response_time_ms: float = Field(0, description="Average response time in ms")
    first_response_time_ms: Optional[int] = Field(None)
    resolution_time_ms: Optional[int] = Field(None)


class MessageDetail(BaseModel):
    """Detailed message for transcript view."""
    role: str = Field(..., description="Message role: user or assistant")
    content: str = Field(..., description="Message content")
    sources: List[Dict[str, Any]] = Field(default_factory=list, description="Source documents")
    timestamp: datetime = Field(..., description="Message timestamp")
    feedback: Optional[str] = Field(None, description="User feedback if any")
    feedback_at: Optional[datetime] = Field(None, description="Feedback timestamp")
    response_time_ms: Optional[int] = Field(None, description="Response time in ms")


class ConversationNote(BaseModel):
    """An internal note on a conversation."""
    note_id: str
    content: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(BaseModel):
    """Full conversation detail with all messages."""
    session_id: str = Field(..., description="Session ID")
    site_id: Optional[str] = Field(None, description="Site ID")
    created_at: datetime = Field(..., description="Conversation start time")
    updated_at: datetime = Field(..., description="Last update time")
    messages: List[MessageDetail] = Field(default_factory=list, description="All messages")
    stats: ConversationStats = Field(default_factory=ConversationStats, description="Conversation stats")
    status: str = Field("open")
    priority: str = Field("medium")
    tags: List[str] = Field(default_factory=list)
    unread: bool = Field(True)
    visitor_name: Optional[str] = Field(None)
    visitor_email: Optional[str] = Field(None)
    page_url: Optional[str] = Field(None)
    notes: List[ConversationNote] = Field(default_factory=list)
    first_response_at: Optional[datetime] = Field(None)
    resolved_at: Optional[datetime] = Field(None)
    satisfaction_rating: Optional[int] = Field(None)
    sentiment: Optional[float] = Field(None)


class ConversationListResponse(BaseModel):
    """Paginated response for conversation list."""
    conversations: List[ConversationListItem] = Field(default_factory=list)
    total: int = Field(0, description="Total count")
    page: int = Field(1, description="Current page")
    limit: int = Field(20, description="Items per page")
    total_pages: int = Field(0, description="Total pages")


class ConversationSearchResponse(BaseModel):
    """Search results response."""
    conversations: List[ConversationSearchItem] = Field(default_factory=list)
    total: int = Field(0, description="Total matches")
    page: int = Field(1, description="Current page")
    limit: int = Field(20, description="Items per page")
    total_pages: int = Field(0, description="Total pages")
    query: str = Field("", description="Search query")


class BulkDeleteRequest(BaseModel):
    """Request model for bulk delete."""
    session_ids: List[str] = Field(..., description="Session IDs to delete", min_length=1)


class BulkDeleteResponse(BaseModel):
    """Response model for bulk delete."""
    deleted_count: int = Field(0, description="Number of conversations deleted")
    message: str = Field("", description="Status message")


class ExportRequest(BaseModel):
    """Request model for conversation export."""
    session_ids: Optional[List[str]] = Field(None, description="Specific session IDs to export")
    site_id: Optional[str] = Field(None, description="Export all from site")
    format: str = Field("json", description="Export format: json or csv")


class UpdateStatusRequest(BaseModel):
    status: str = Field(..., description="open, resolved, closed")


class UpdatePriorityRequest(BaseModel):
    priority: str = Field(..., description="high, medium, low")


class UpdateTagsRequest(BaseModel):
    tags: List[str] = Field(default_factory=list)


class AddNoteRequest(BaseModel):
    content: str = Field(..., min_length=1)


class UpdateNoteRequest(BaseModel):
    content: str = Field(..., min_length=1)


class UpdateVisitorRequest(BaseModel):
    visitor_name: Optional[str] = None
    visitor_email: Optional[str] = None


class SetRatingRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)


class AutoCloseRequest(BaseModel):
    days_inactive: int = Field(7, ge=1, description="Close conversations inactive for this many days")


class AutoCloseResponse(BaseModel):
    closed_count: int
    message: str


# ==================== Proactive Chat Trigger Models ====================

class TriggerCondition(BaseModel):
    """A single condition for a proactive chat trigger."""
    type: str = Field(..., description="Condition type: time, scroll, exit_intent, url, visit_count")
    value: Any = Field(..., description="Condition value (seconds, percentage, URL pattern, count)")
    operator: str = Field(default="gte", description="Comparison operator: eq, gte, lte, contains, matches")


class ChatTrigger(BaseModel):
    """A proactive chat trigger configuration."""
    id: str = Field(..., description="Unique trigger ID")
    name: str = Field(..., description="Trigger name for display")
    enabled: bool = Field(default=True, description="Whether trigger is active")
    priority: int = Field(default=0, description="Priority order (higher = check first)")
    conditions: List[TriggerCondition] = Field(default_factory=list, description="Conditions that must all match")
    message: str = Field(..., description="Proactive message to display")
    delay_after_trigger_ms: int = Field(default=0, description="Delay before showing message")
    show_once_per_session: bool = Field(default=True, description="Only show once per session")
    show_once_per_visitor: bool = Field(default=False, description="Only show once per visitor (cookie-based)")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")


class ChatTriggerCreate(BaseModel):
    """Request model for creating a trigger."""
    name: str = Field(..., description="Trigger name", min_length=1, max_length=100)
    enabled: bool = Field(default=True, description="Whether trigger is active")
    priority: int = Field(default=0, description="Priority order")
    conditions: List[TriggerCondition] = Field(..., description="Trigger conditions", min_length=1)
    message: str = Field(..., description="Message to display", min_length=1, max_length=500)
    delay_after_trigger_ms: int = Field(default=0, ge=0, le=60000, description="Delay in ms")
    show_once_per_session: bool = Field(default=True)
    show_once_per_visitor: bool = Field(default=False)


class ChatTriggerUpdate(BaseModel):
    """Request model for updating a trigger (all fields optional)."""
    name: Optional[str] = Field(None, max_length=100)
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    conditions: Optional[List[TriggerCondition]] = None
    message: Optional[str] = Field(None, max_length=500)
    delay_after_trigger_ms: Optional[int] = Field(None, ge=0, le=60000)
    show_once_per_session: Optional[bool] = None
    show_once_per_visitor: Optional[bool] = None


class SiteTriggers(BaseModel):
    """Container for all triggers of a site."""
    triggers: List[ChatTrigger] = Field(default_factory=list, description="List of triggers")
    global_cooldown_ms: int = Field(default=30000, description="Min time between any triggers")


class TriggerReorderRequest(BaseModel):
    """Request model for reordering triggers."""
    trigger_ids: List[str] = Field(..., description="Trigger IDs in desired order")


class TriggerEvent(BaseModel):
    """A trigger event for analytics."""
    site_id: str = Field(..., description="Site ID")
    trigger_id: str = Field(..., description="Trigger ID")
    session_id: str = Field(..., description="Session ID")
    event_type: str = Field(..., description="Event type: shown, clicked, dismissed, converted")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional event data")


class TriggerAnalytics(BaseModel):
    """Analytics summary for a trigger."""
    trigger_id: str = Field(..., description="Trigger ID")
    trigger_name: str = Field(..., description="Trigger name")
    shown_count: int = Field(0, description="Times shown")
    clicked_count: int = Field(0, description="Times clicked to open chat")
    dismissed_count: int = Field(0, description="Times dismissed")
    converted_count: int = Field(0, description="Times led to conversation")
    click_rate: float = Field(0, description="Click rate percentage")
    conversion_rate: float = Field(0, description="Conversion rate percentage")


class TriggerAnalyticsResponse(BaseModel):
    """Response for trigger analytics endpoint."""
    site_id: str = Field(..., description="Site ID")
    period_days: int = Field(7, description="Analytics period in days")
    triggers: List[TriggerAnalytics] = Field(default_factory=list)
    total_shown: int = Field(0)
    total_clicked: int = Field(0)
    total_converted: int = Field(0)


# ==================== Human Handoff Models ====================

class DaySchedule(BaseModel):
    """Business hours for a single day."""
    enabled: bool = Field(default=True, description="Whether this day is a working day")
    start: str = Field(default="09:00", description="Start time (HH:MM)")
    end: str = Field(default="17:00", description="End time (HH:MM)")


class BusinessHoursConfig(BaseModel):
    """Business hours configuration for human handoff."""
    enabled: bool = Field(default=False, description="Whether business hours are enforced")
    timezone: str = Field(default="UTC", description="Timezone for business hours")
    schedule: Dict[str, DaySchedule] = Field(
        default_factory=lambda: {
            "mon": DaySchedule(),
            "tue": DaySchedule(),
            "wed": DaySchedule(),
            "thu": DaySchedule(),
            "fri": DaySchedule(),
            "sat": DaySchedule(enabled=False),
            "sun": DaySchedule(enabled=False),
        },
        description="Weekly schedule"
    )
    offline_message: str = Field(
        default="We're currently offline. Leave your email and we'll get back to you.",
        description="Message shown when outside business hours"
    )


class HandoffConfig(BaseModel):
    """Handoff configuration for a site."""
    enabled: bool = Field(default=True, description="Whether handoff is enabled")
    confidence_threshold: float = Field(
        default=0.3, ge=0.0, le=1.0,
        description="Suggest handoff when AI confidence is below this"
    )
    business_hours: BusinessHoursConfig = Field(default_factory=BusinessHoursConfig)
    auto_suggest_phrases: List[str] = Field(
        default_factory=lambda: [
            "I'm not sure",
            "I don't have information",
            "I cannot help with",
            "please contact support"
        ],
        description="Phrases that trigger handoff suggestion"
    )


class HandoffMessage(BaseModel):
    """A single message in a handoff conversation."""
    id: str = Field(..., description="Unique message ID")
    role: str = Field(..., description="Message role: visitor or agent")
    content: str = Field(..., description="Message content")
    sender_name: Optional[str] = Field(None, description="Sender's display name")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HandoffSession(BaseModel):
    """Full handoff session data."""
    handoff_id: str = Field(..., description="Unique handoff ID")
    session_id: str = Field(..., description="Original chat session ID")
    site_id: str = Field(..., description="Associated site ID")
    status: str = Field(default="pending", description="Status: pending, active, resolved, abandoned")
    visitor_email: Optional[str] = Field(None, description="Visitor's email if provided")
    visitor_name: Optional[str] = Field(None, description="Visitor's name if provided")
    reason: str = Field(default="user_request", description="Handoff reason: user_request, low_confidence, ai_suggested")
    ai_summary: Optional[str] = Field(None, description="AI-generated conversation summary")
    ai_conversation: List[Dict[str, Any]] = Field(default_factory=list, description="Previous AI conversation")
    messages: List[HandoffMessage] = Field(default_factory=list, description="Human agent conversation")
    assigned_agent_id: Optional[str] = Field(None, description="Assigned agent's user ID")
    assigned_agent_name: Optional[str] = Field(None, description="Assigned agent's display name")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = Field(None, description="When the handoff was resolved")


class HandoffRequest(BaseModel):
    """Request model for creating a handoff."""
    session_id: str = Field(..., description="Chat session ID")
    site_id: str = Field(..., description="Site ID")
    reason: str = Field(default="user_request", description="Handoff reason")
    visitor_email: Optional[str] = Field(None, description="Visitor's email")
    visitor_name: Optional[str] = Field(None, description="Visitor's name")
    ai_conversation: List[Dict[str, Any]] = Field(default_factory=list, description="Previous AI conversation")
    # Honeypot — must be empty; bots tend to fill every field
    website: Optional[str] = Field(None, description="Leave blank")


class HandoffMessageRequest(BaseModel):
    """Request model for sending a handoff message."""
    content: str = Field(..., description="Message content", min_length=1, max_length=4000)
    sender_name: Optional[str] = Field(None, description="Sender's display name")


class HandoffAbandonRequest(BaseModel):
    """Visitor abandons handoff (widget); session_id must match the handoff."""
    session_id: str = Field(..., min_length=1, description="Widget session ID that created the handoff")


class HandoffStatusUpdate(BaseModel):
    """Request model for updating handoff status."""
    status: str = Field(..., description="New status: active, resolved, abandoned")
    resolution_note: Optional[str] = Field(None, description="Note about resolution")


class HandoffAssignRequest(BaseModel):
    """Admin assigns a support agent to a handoff (pending or active)."""
    agent_id: str = Field(..., min_length=1, description="User ID of the support agent")


class HandoffListItem(BaseModel):
    """Summary item for handoff queue."""
    handoff_id: str = Field(..., description="Handoff ID")
    session_id: str = Field(..., description="Original session ID")
    site_id: str = Field(..., description="Site ID")
    status: str = Field(..., description="Current status")
    visitor_email: Optional[str] = Field(None)
    visitor_name: Optional[str] = Field(None)
    reason: str = Field(...)
    message_count: int = Field(0, description="Number of messages")
    last_message_preview: str = Field("", description="Preview of last message")
    assigned_agent_id: Optional[str] = Field(
        None,
        description="Admin routing hint while pending; queue still visible to all agents on the site until claimed",
    )
    assigned_agent_name: Optional[str] = Field(None)
    created_at: datetime = Field(...)
    updated_at: datetime = Field(...)
    wait_time_seconds: int = Field(0, description="Time waiting for agent")
    visitor_queue_signals: int = Field(
        0,
        description="Increments when visitor taps connect-again while still pending (dashboard highlight)",
    )


class HandoffQueueResponse(BaseModel):
    """Response for handoff queue endpoint."""
    handoffs: List[HandoffListItem] = Field(default_factory=list)
    total: int = Field(0)
    pending_count: int = Field(0, description="Number of pending handoffs")
    active_count: int = Field(0, description="Number of active handoffs")


class HandoffAvailabilityResponse(BaseModel):
    """Response for availability check."""
    available: bool = Field(..., description="Whether agents are available")
    is_within_hours: bool = Field(..., description="Whether within business hours")
    offline_message: Optional[str] = Field(None, description="Message to show if offline")
    next_available: Optional[str] = Field(None, description="When agents will be available next")


# ==================== Crawl Schedule Models ====================

class CrawlScheduleConfig(BaseModel):
    """Configuration for scheduled re-crawling of a site."""
    enabled: bool = Field(default=False, description="Whether scheduled crawling is enabled")
    frequency: str = Field(
        default="weekly",
        description="Crawl frequency: daily, weekly, monthly, custom"
    )
    custom_cron: Optional[str] = Field(
        default=None,
        description="Custom cron expression (e.g., '0 2 * * 0' for Sundays at 2 AM)"
    )
    max_pages: int = Field(default=50, ge=1, le=1000, description="Maximum pages to crawl")
    include_patterns: List[str] = Field(default_factory=list, description="URL patterns to include")
    exclude_patterns: List[str] = Field(default_factory=list, description="URL patterns to exclude")
    notify_on_completion: bool = Field(default=True, description="Send notification when crawl completes")
    last_crawl_at: Optional[datetime] = Field(default=None, description="Last crawl timestamp")
    next_crawl_at: Optional[datetime] = Field(default=None, description="Next scheduled crawl")


class CrawlScheduleUpdate(BaseModel):
    """Update model for crawl schedule (all fields optional)."""
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    custom_cron: Optional[str] = None
    max_pages: Optional[int] = Field(default=None, ge=1, le=1000)
    include_patterns: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None
    notify_on_completion: Optional[bool] = None


class CrawlHistoryItem(BaseModel):
    """A single crawl history entry."""
    job_id: str = Field(..., description="Crawl job ID")
    status: str = Field(..., description="Job status: running, completed, failed")
    pages_crawled: int = Field(default=0, description="Number of pages crawled")
    pages_indexed: int = Field(default=0, description="Number of pages indexed")
    errors: List[str] = Field(default_factory=list, description="Error messages")
    trigger: str = Field(default="manual", description="Trigger type: manual, scheduled")
    started_at: datetime = Field(..., description="Job start time")
    completed_at: Optional[datetime] = Field(default=None, description="Job completion time")
    duration_seconds: Optional[int] = Field(default=None, description="Job duration in seconds")


class CrawlHistoryResponse(BaseModel):
    """Response for crawl history endpoint."""
    site_id: str = Field(..., description="Site ID")
    history: List[CrawlHistoryItem] = Field(default_factory=list)
    total: int = Field(default=0, description="Total crawl jobs")


class CrawlScheduleResponse(BaseModel):
    """Response for crawl schedule endpoint."""
    site_id: str = Field(..., description="Site ID")
    schedule: CrawlScheduleConfig = Field(default_factory=CrawlScheduleConfig)
    is_crawling: bool = Field(default=False, description="Whether a crawl is currently running")
    last_crawl_status: Optional[str] = Field(default=None, description="Last crawl job status")


# ==================== White-label / Platform Settings Models ====================

class PlatformWhiteLabelConfig(BaseModel):
    """Platform-level white-label configuration for dashboard."""
    app_name: str = Field(default="SiteChat", description="Application name")
    logo_url: Optional[str] = Field(default=None, description="Custom logo URL")
    favicon_url: Optional[str] = Field(default=None, description="Custom favicon URL")
    primary_color: str = Field(default="#0D9488", description="Primary brand color")
    secondary_color: str = Field(default="#16a34a", description="Secondary brand color")
    login_title: str = Field(default="SiteChat", description="Login page title")
    login_subtitle: str = Field(default="AI-Powered Customer Support", description="Login page subtitle")
    footer_text: Optional[str] = Field(default=None, description="Custom footer text")
    support_email: Optional[str] = Field(default=None, description="Support email address")
    hide_sitechat_branding: bool = Field(default=False, description="Hide all SiteChat branding")


class PlatformWhiteLabelUpdate(BaseModel):
    """Update model for platform white-label settings."""
    app_name: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    login_title: Optional[str] = None
    login_subtitle: Optional[str] = None
    footer_text: Optional[str] = None
    support_email: Optional[str] = None
    hide_sitechat_branding: Optional[bool] = None


# ==================== Q&A Training Models ====================

class QAPair(BaseModel):
    """A Q&A pair for training and improving responses."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique Q&A pair ID")
    site_id: str = Field(..., description="Associated site")
    question: str = Field(..., description="The question", min_length=1, max_length=1000)
    answer: str = Field(..., description="The approved answer", min_length=1, max_length=4000)
    source_session_id: Optional[str] = Field(None, description="Session this was created from")
    source_message_index: Optional[int] = Field(None, description="Original message index")
    created_by: str = Field(..., description="User who created this")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    enabled: bool = Field(default=True, description="Whether this Q&A is active")
    use_count: int = Field(default=0, description="Times this Q&A was used in responses")


class QAPairCreate(BaseModel):
    """Request model for creating a Q&A pair."""
    question: str = Field(..., min_length=1, max_length=1000)
    answer: str = Field(..., min_length=1, max_length=4000)
    source_session_id: Optional[str] = None
    source_message_index: Optional[int] = None


class QAPairUpdate(BaseModel):
    """Request model for updating a Q&A pair."""
    question: Optional[str] = Field(None, max_length=1000)
    answer: Optional[str] = Field(None, max_length=4000)
    enabled: Optional[bool] = None


class QAPairFromConversation(BaseModel):
    """Request model for creating a Q&A pair from a conversation message."""
    session_id: str = Field(..., description="The conversation session ID")
    message_index: int = Field(..., description="The index of the assistant message")
    edited_answer: Optional[str] = Field(None, max_length=4000, description="Optional edited answer")


class QAPairListItem(BaseModel):
    """Q&A pair item for list view."""
    id: str = Field(..., description="Q&A pair ID")
    site_id: str = Field(..., description="Site ID")
    question: str = Field(..., description="Question preview")
    answer: str = Field(..., description="Answer preview")
    enabled: bool = Field(default=True)
    use_count: int = Field(default=0)
    created_at: datetime = Field(...)
    updated_at: datetime = Field(...)


class QAPairListResponse(BaseModel):
    """Paginated response for Q&A pairs list."""
    qa_pairs: List[QAPairListItem] = Field(default_factory=list)
    total: int = Field(0, description="Total count")
    page: int = Field(1, description="Current page")
    limit: int = Field(20, description="Items per page")
    total_pages: int = Field(0, description="Total pages")


class QAStats(BaseModel):
    """Statistics for Q&A pairs."""
    total_pairs: int = Field(0, description="Total Q&A pairs")
    enabled_pairs: int = Field(0, description="Enabled Q&A pairs")
    total_uses: int = Field(0, description="Total times Q&A pairs were used")
    most_used: List[Dict[str, Any]] = Field(default_factory=list, description="Most used Q&A pairs")
