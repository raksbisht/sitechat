"""
API routes for scheduled crawling management.
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from loguru import logger

from app.database import get_mongodb
from app.routes.auth import get_current_user
from app.services.crawler import CrawlerService
from app.services.indexer import IndexerService
from app.services.scheduler import get_scheduler
from app.models.schemas import (
    CrawlScheduleConfig,
    CrawlScheduleUpdate,
    CrawlScheduleResponse,
    CrawlHistoryResponse,
    CrawlHistoryItem
)

router = APIRouter(tags=["Schedule"])


async def _execute_crawl_job(
    site_url: str,
    site_id: str,
    max_pages: int,
    include_patterns: list,
    exclude_patterns: list,
    trigger: str = "manual"
) -> str:
    """Execute a crawl job and return job_id."""
    db = await get_mongodb()
    
    job_id = await db.create_scheduled_crawl_job(
        site_id=site_id,
        target_url=site_url,
        trigger=trigger
    )
    
    crawler = CrawlerService()
    crawler.job_id = job_id
    
    try:
        pages = await crawler.crawl(
            url=site_url,
            max_pages=max_pages,
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns
        )
        
        if pages:
            indexer = IndexerService()
            indexed_count = await indexer.index_pages(pages, site_id=site_id)
            
            await db.update_crawl_job(
                job_id=job_id,
                status="completed",
                pages_crawled=len(pages),
                pages_indexed=indexed_count
            )
            
            await db.db.crawl_jobs.update_one(
                {"_id": db.db.crawl_jobs.find_one({"_id": job_id})},
                {"$set": {"completed_at": datetime.utcnow()}}
            )
        else:
            await db.update_crawl_job(
                job_id=job_id,
                status="completed",
                pages_crawled=0,
                pages_indexed=0
            )
        
        logger.info(f"Crawl job {job_id} completed for site {site_id}")
        
    except Exception as e:
        logger.error(f"Crawl job {job_id} failed: {e}")
        await db.update_crawl_job(
            job_id=job_id,
            status="failed",
            error=str(e)
        )
    
    return job_id


@router.get("/api/sites/{site_id}/crawl-schedule", response_model=CrawlScheduleResponse)
async def get_crawl_schedule(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get crawl schedule configuration for a site."""
    db = await get_mongodb()
    
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    schedule_config = await db.get_crawl_schedule(site_id)
    running_job = await db.get_running_crawl_job(site_id)
    
    history = await db.get_crawl_history(site_id, limit=1)
    last_status = history[0]["status"] if history else None
    
    scheduler = get_scheduler()
    next_run = scheduler.get_next_run(site_id)
    
    if schedule_config and next_run:
        schedule_config["next_crawl_at"] = next_run
    
    return CrawlScheduleResponse(
        site_id=site_id,
        schedule=CrawlScheduleConfig(**schedule_config) if schedule_config else CrawlScheduleConfig(),
        is_crawling=running_job is not None,
        last_crawl_status=last_status
    )


@router.put("/api/sites/{site_id}/crawl-schedule", response_model=CrawlScheduleResponse)
async def update_crawl_schedule(
    site_id: str,
    update: CrawlScheduleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update crawl schedule configuration for a site."""
    db = await get_mongodb()
    
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    current_schedule = await db.get_crawl_schedule(site_id) or {}
    
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        current_schedule[key] = value
    
    if update.frequency == "custom" and not update.custom_cron:
        if not current_schedule.get("custom_cron"):
            raise HTTPException(
                status_code=400,
                detail="Custom cron expression required for custom frequency"
            )
    
    await db.update_crawl_schedule(site_id, current_schedule)
    
    scheduler = get_scheduler()
    site_url = site.get("url")
    
    if current_schedule.get("enabled"):
        next_run = await scheduler.add_crawl_schedule(site_id, current_schedule, site_url)
        current_schedule["next_crawl_at"] = next_run
        await db.update_crawl_schedule(site_id, current_schedule)
    else:
        scheduler.remove_crawl_schedule(site_id)
        current_schedule["next_crawl_at"] = None
        await db.update_crawl_schedule(site_id, current_schedule)
    
    running_job = await db.get_running_crawl_job(site_id)
    history = await db.get_crawl_history(site_id, limit=1)
    last_status = history[0]["status"] if history else None
    
    return CrawlScheduleResponse(
        site_id=site_id,
        schedule=CrawlScheduleConfig(**current_schedule),
        is_crawling=running_job is not None,
        last_crawl_status=last_status
    )


@router.post("/api/sites/{site_id}/crawl-now")
async def trigger_crawl_now(
    site_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Trigger an immediate crawl for a site."""
    db = await get_mongodb()
    
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    running_job = await db.get_running_crawl_job(site_id)
    if running_job:
        raise HTTPException(
            status_code=409,
            detail="A crawl is already running for this site"
        )
    
    site_url = site.get("url")
    schedule_config = await db.get_crawl_schedule(site_id) or {}
    
    max_pages = schedule_config.get("max_pages", 50)
    include_patterns = schedule_config.get("include_patterns", [])
    exclude_patterns = schedule_config.get("exclude_patterns", [])
    
    job_id = await db.create_scheduled_crawl_job(
        site_id=site_id,
        target_url=site_url,
        trigger="manual"
    )
    
    background_tasks.add_task(
        _run_crawl_background,
        job_id=job_id,
        site_url=site_url,
        site_id=site_id,
        max_pages=max_pages,
        include_patterns=include_patterns,
        exclude_patterns=exclude_patterns
    )
    
    return {
        "success": True,
        "job_id": job_id,
        "message": "Crawl started"
    }


async def _run_crawl_background(
    job_id: str,
    site_url: str,
    site_id: str,
    max_pages: int,
    include_patterns: list,
    exclude_patterns: list
):
    """Background task to run the crawl."""
    from bson import ObjectId
    
    db = await get_mongodb()
    crawler = CrawlerService()
    crawler.job_id = job_id
    
    try:
        pages = await crawler.crawl(
            url=site_url,
            max_pages=max_pages,
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns
        )
        
        indexed_count = 0
        if pages:
            indexer = IndexerService()
            indexed_count = await indexer.index_pages(pages, site_id=site_id)
        
        await db.update_crawl_job(
            job_id=job_id,
            status="completed",
            pages_crawled=len(pages) if pages else 0,
            pages_indexed=indexed_count
        )
        
        await db.db.crawl_jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {"completed_at": datetime.utcnow()}}
        )
        
        logger.info(f"Manual crawl job {job_id} completed for site {site_id}")
        
    except Exception as e:
        logger.error(f"Manual crawl job {job_id} failed: {e}")
        await db.update_crawl_job(
            job_id=job_id,
            status="failed",
            error=str(e)
        )


@router.get("/api/sites/{site_id}/crawl-history", response_model=CrawlHistoryResponse)
async def get_crawl_history(
    site_id: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Get crawl history for a site."""
    db = await get_mongodb()
    
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    history = await db.get_crawl_history(site_id, limit=limit)
    
    history_items = [CrawlHistoryItem(**item) for item in history]
    
    return CrawlHistoryResponse(
        site_id=site_id,
        history=history_items,
        total=len(history_items)
    )


@router.get("/api/sites/{site_id}/crawl-status")
async def get_crawl_status(
    site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get current crawl status for a site."""
    db = await get_mongodb()
    
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    running_job = await db.get_running_crawl_job(site_id)
    
    if running_job:
        return {
            "is_crawling": True,
            "job_id": running_job.get("_id"),
            "status": running_job.get("status"),
            "pages_crawled": running_job.get("pages_crawled", 0),
            "started_at": running_job.get("created_at")
        }
    
    history = await db.get_crawl_history(site_id, limit=1)
    last_job = history[0] if history else None
    
    return {
        "is_crawling": False,
        "last_crawl": last_job
    }
