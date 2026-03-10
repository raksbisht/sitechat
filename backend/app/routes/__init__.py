"""
API Routes.
"""
from .chat import router as chat_router
from .crawl import router as crawl_router
from .admin import router as admin_router
from .analytics import router as analytics_router
from .conversations import router as conversations_router
from .triggers import router as triggers_router
from .handoff import router as handoff_router
from .platform import router as platform_router

__all__ = ["chat_router", "crawl_router", "admin_router", "analytics_router", "conversations_router", "triggers_router", "handoff_router", "platform_router"]
