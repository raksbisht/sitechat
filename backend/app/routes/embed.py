"""
Embed API routes for generating embeddable chat widgets.
"""
import os
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from loguru import logger
from datetime import datetime
import hashlib
import json

from app.config import settings
from app.database import get_mongodb
from app.services.crawler import CrawlerService
from app.services.indexer import IndexerService
from app.database.vector_store import get_vector_store
from app.routes.auth import get_current_user, require_auth
from app.services.auth import UserRole
from app.core.security import generate_sri_hash_for_file, validate_widget_domain, get_request_origin

router = APIRouter(prefix="/api/embed", tags=["embed"])

# Cache for SRI hash (regenerate on restart)
_sri_hash_cache = {}


class SetupRequest(BaseModel):
    """Request to set up a new chatbot for a website."""
    url: HttpUrl
    name: Optional[str] = None
    max_pages: Optional[int] = 50


class SetupResponse(BaseModel):
    """Response with embed script and setup info."""
    site_id: str
    embed_script: str
    status: str
    message: str


def generate_site_id(url: str) -> str:
    """Generate a unique site ID from URL."""
    return hashlib.md5(url.encode()).hexdigest()[:12]


def get_widget_sri_hash() -> Optional[str]:
    """Get or generate SRI hash for the widget script."""
    global _sri_hash_cache
    
    if "widget_hash" in _sri_hash_cache:
        return _sri_hash_cache["widget_hash"]
    
    # Find the widget script path
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    project_root = os.path.dirname(backend_dir)
    widget_path = os.path.join(project_root, "frontend", "widget", "chatbot.js")
    
    if not os.path.exists(widget_path):
        logger.warning(f"Widget script not found at: {widget_path}")
        return None
    
    try:
        sri_hash = generate_sri_hash_for_file(widget_path)
        _sri_hash_cache["widget_hash"] = sri_hash
        _sri_hash_cache["widget_mtime"] = os.path.getmtime(widget_path)
        logger.info(f"Generated SRI hash for widget: {sri_hash[:30]}...")
        return sri_hash
    except Exception as e:
        logger.error(f"Failed to generate SRI hash: {e}")
        return None


def get_embed_url(request: Optional[Request] = None) -> str:
    """Get the base URL for embed scripts."""
    # In production, use the configured URL or derive from request
    if request:
        # Use the request's scheme and host
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host", request.url.netloc)
        return f"{scheme}://{host}"
    
    # Fallback for development
    return "http://localhost:8000"


async def crawl_and_index_site(url: str, site_id: str, max_pages: int = 50):
    """Background task to crawl and index a website."""
    mongodb = await get_mongodb()
    job_id = None
    
    try:
        logger.info(f"Starting crawl for site: {url} (max {max_pages} pages)")
        
        crawler = CrawlerService()
        indexer = IndexerService()
        
        job_id = await mongodb.create_crawl_job(url)
        pages = await crawler.crawl(
            start_url=url,
            max_pages=max_pages,
            job_id=job_id
        )
        
        if not pages:
            crawler_errors = crawler.get_stats().get("error_messages", [])
            error_msg = "No pages found"
            if crawler_errors:
                if any("bot protection" in e.lower() or "rate limited" in e.lower() for e in crawler_errors):
                    error_msg = "Site has bot protection - cannot crawl automatically"
                elif any("forbidden" in e.lower() for e in crawler_errors):
                    error_msg = "Site is blocking crawlers (403 Forbidden)"
                else:
                    error_msg = f"No pages found: {crawler_errors[0]}"
            await mongodb.update_crawl_job(job_id, status="failed", error=error_msg)
            logger.warning(f"No pages found for site: {url} - {error_msg}")
            return
        
        stats = await indexer.index_pages(pages, job_id=job_id)
        
        await mongodb.update_crawl_job(
            job_id,
            status="completed",
            pages_crawled=len(pages),
            pages_indexed=stats.get("indexed_pages", len(pages))
        )
        
        logger.info(f"Completed crawl for site: {url}, indexed {stats.get('indexed_pages', 0)} pages")
        
    except Exception as e:
        logger.error(f"Error crawling site {url}: {e}")
        if job_id:
            await mongodb.update_crawl_job(job_id, status="failed", error=str(e))


@router.post("/setup", response_model=SetupResponse)
async def setup_chatbot(
    request: SetupRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_auth)
):
    """
    Set up a new chatbot for a website (requires authentication).
    Returns an embed script that can be added to the website.
    """
    if user.get("role") == UserRole.AGENT.value:
        raise HTTPException(
            status_code=403,
            detail="Support agents cannot create or register sites",
        )

    url = str(request.url).rstrip("/")
    site_id = generate_site_id(url)
    site_name = request.name or url.replace("https://", "").replace("http://", "").split("/")[0]
    user_id = str(user["_id"])
    
    mongodb = await get_mongodb()
    
    # Use provider interface method
    existing = await mongodb.get_site(site_id)
    if existing and existing.get("user_id") != user_id:
        raise HTTPException(status_code=400, detail="This site is already registered by another user")
    
    # Extract domain from URL for auto-whitelisting
    from app.core.security import extract_domain_from_url
    site_domain = extract_domain_from_url(url)
    
    # Use provider interface to create or update site
    if existing:
        await mongodb.update_site(site_id, {
            "url": url,
            "name": site_name,
            "user_id": user_id,
            "status": "crawling"
        })
    else:
        await mongodb.create_site({
            "site_id": site_id,
            "url": url,
            "name": site_name,
            "user_id": user_id,
            "status": "crawling",
            "config": {
                "security": {
                    "allowed_domains": [site_domain, f"*.{site_domain}"] if site_domain else [],
                    "enforce_domain_validation": False,
                    "require_referrer": False,
                    "rate_limit_per_session": 60
                }
            }
        })
    
    background_tasks.add_task(crawl_and_index_site, url, site_id, request.max_pages or 50)
    
    api_url = get_embed_url(http_request)
    sri_hash = get_widget_sri_hash()
    
    # Generate embed script with optional SRI
    if sri_hash:
        embed_script = f'''<!-- SiteChat Widget (Secure) -->
<script>
(function() {{
  var s = document.createElement('script');
  s.src = '{api_url}/widget/chatbot.js';
  s.async = true;
  s.integrity = '{sri_hash}';
  s.crossOrigin = 'anonymous';
  s.dataset.siteId = '{site_id}';
  s.dataset.apiUrl = '{api_url}';
  document.head.appendChild(s);
}})();
</script>'''
    else:
        embed_script = f'''<!-- SiteChat Widget -->
<script>
(function() {{
  var s = document.createElement('script');
  s.src = '{api_url}/widget/chatbot.js';
  s.async = true;
  s.dataset.siteId = '{site_id}';
  s.dataset.apiUrl = '{api_url}';
  document.head.appendChild(s);
}})();
</script>'''
    
    return SetupResponse(
        site_id=site_id,
        embed_script=embed_script,
        status="crawling",
        message=f"Crawling started for {site_name}. The chatbot will be ready once crawling completes."
    )


@router.get("/status/{site_id}")
async def get_site_status(site_id: str):
    """Get the status of a site's chatbot setup (public endpoint for widget)."""
    mongodb = await get_mongodb()
    
    # Use provider interface method
    site = await mongodb.get_site(site_id)
    
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    site_url = site.get("url", "")
    
    # Try to get crawl job using provider interface
    job = await mongodb.get_crawl_job_by_url(site_url) if hasattr(mongodb, 'get_crawl_job_by_url') else None
    
    # If provider doesn't have the method, return pending status
    if job is None and site_url:
        job = {"status": "pending", "pages_crawled": 0, "pages_indexed": 0}
    
    return {
        "site_id": site_id,
        "name": site.get("name"),
        "url": site.get("url"),
        "status": job.get("status") if job else "pending",
        "pages_crawled": job.get("pages_crawled", 0) if job else 0,
        "pages_indexed": job.get("pages_indexed", 0) if job else 0
    }


@router.get("/script/{site_id}")
async def get_embed_script(site_id: str, request: Request, include_sri: bool = True):
    """Get the embed script for a site (public endpoint)."""
    mongodb = await get_mongodb()
    
    # Use provider interface method
    site = await mongodb.get_site(site_id)
    
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    api_url = get_embed_url(request)
    sri_hash = get_widget_sri_hash() if include_sri else None
    
    # Generate embed script with optional SRI
    if sri_hash:
        embed_script = f'''<!-- SiteChat Widget (Secure) -->
<script>
(function() {{
  var s = document.createElement('script');
  s.src = '{api_url}/widget/chatbot.js';
  s.async = true;
  s.integrity = '{sri_hash}';
  s.crossOrigin = 'anonymous';
  s.dataset.siteId = '{site_id}';
  s.dataset.apiUrl = '{api_url}';
  document.head.appendChild(s);
}})();
</script>'''
    else:
        embed_script = f'''<!-- SiteChat Widget -->
<script>
(function() {{
  var s = document.createElement('script');
  s.src = '{api_url}/widget/chatbot.js';
  s.async = true;
  s.dataset.siteId = '{site_id}';
  s.dataset.apiUrl = '{api_url}';
  document.head.appendChild(s);
}})();
</script>'''
    
    return {
        "embed_script": embed_script,
        "sri_hash": sri_hash,
        "api_url": api_url
    }


@router.get("/security/{site_id}")
async def get_widget_security_info(site_id: str, request: Request):
    """Get security information for the widget (SRI hash, allowed domains, etc.)."""
    mongodb = await get_mongodb()
    
    # Use provider interface method
    site = await mongodb.get_site(site_id)
    
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    api_url = get_embed_url(request)
    sri_hash = get_widget_sri_hash()
    
    # Get security config
    config = site.get("config", {})
    security_config = config.get("security", {})
    
    return {
        "site_id": site_id,
        "api_url": api_url,
        "widget_url": f"{api_url}/widget/chatbot.js",
        "sri_hash": sri_hash,
        "allowed_domains": security_config.get("allowed_domains", []),
        "enforce_domain_validation": security_config.get("enforce_domain_validation", False),
        "request_origin": get_request_origin(request)
    }
