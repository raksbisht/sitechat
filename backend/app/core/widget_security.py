"""
Shared origin-domain validation for public widget endpoints.

Widget endpoints (chat, leads capture, trigger events) are unauthenticated,
so they can be abused from arbitrary origins. This helper enforces the
per-site domain whitelist stored in ``site.config.security.allowed_domains``
when ``enforce_domain_validation`` is enabled for the site.

Behaviour:
- Unknown site_id -> 404 (same as existing embed endpoints).
- Enforcement disabled or no allowed domains configured -> request allowed.
- Origin/Referer does not match the whitelist -> 403.
"""

from typing import List, Optional

from fastapi import HTTPException, Request
from loguru import logger

from app.core.security import extract_domain_from_url, match_domain_pattern


def _origin_matches(request_origin: str, allowed_domains: List[str]) -> bool:
    """Match request origin against allowed patterns; tolerate http(s):// prefixes."""
    candidates = {request_origin.lower()}
    if "://" in request_origin:
        candidates.add(request_origin.split("://", 1)[1].lower())
    else:
        candidates.add(f"//{request_origin}".split("//", 1)[1].lower())
    return any(match_domain_pattern(origin, pattern) for origin in candidates for pattern in allowed_domains)


async def enforce_site_origin(site_id: Optional[str], request: Request, mongodb) -> None:
    """Raise HTTPException(403) if the request origin violates the site's domain policy."""
    if not site_id:
        return  # global chat requests have no per-site policy to enforce

    site = await mongodb.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    security_config = (site.get("config") or {}).get("security") or {}
    allowed_domains = security_config.get("allowed_domains") or []
    enforce = security_config.get("enforce_domain_validation", False)

    if not enforce or not allowed_domains:
        return

    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    request_domain = extract_domain_from_url(origin)

    if not request_domain:
        # Non-browser clients (health checks, scripts) send no Origin header.
        # The whitelist only protects browser-based cross-origin abuse.
        return

    if not _origin_matches(request_domain, allowed_domains):
        logger.warning(f"Blocked widget request for site {site_id} from unauthorized domain: {request_domain}")
        raise HTTPException(status_code=403, detail="Origin not allowed for this site")
