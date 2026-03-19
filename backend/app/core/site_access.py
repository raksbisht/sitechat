"""
Site access helpers: admin, site owner, and support agents (handoff).
"""
from typing import Any, Dict, List, Optional

from app.services.auth import UserRole


def is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == UserRole.ADMIN.value


def is_agent(user: Dict[str, Any]) -> bool:
    return user.get("role") == UserRole.AGENT.value


def assigned_site_ids(user: Dict[str, Any]) -> List[str]:
    raw = user.get("assigned_site_ids")
    if not raw:
        return []
    return list(raw) if isinstance(raw, list) else []


def can_manage_site(user: Dict[str, Any], site: Dict[str, Any]) -> bool:
    """Full site management (config, crawl, delete, etc.)."""
    if is_admin(user):
        return True
    if is_agent(user):
        return False
    return site.get("user_id") == str(user.get("_id"))


def can_view_site(user: Dict[str, Any], site: Dict[str, Any]) -> bool:
    """Read site in dashboard (list/detail, handoff queue for that site)."""
    if can_manage_site(user, site):
        return True
    if is_agent(user):
        return site.get("site_id") in assigned_site_ids(user)
    return site.get("user_id") == str(user.get("_id"))


def can_access_handoff_session(user: Dict[str, Any], site_id: str, site: Optional[Dict[str, Any]]) -> bool:
    """Claim/reply to handoffs for this site."""
    if not site:
        return False
    if is_admin(user):
        return True
    if is_agent(user):
        return site_id in assigned_site_ids(user)
    return site.get("user_id") == str(user.get("_id"))
