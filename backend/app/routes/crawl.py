"""
Crawl API routes.
"""
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from loguru import logger

from app.models.schemas import CrawlRequest, CrawlResponse, CrawlStatus, PageInfo
from app.services.crawler import CrawlerService
from app.services.indexer import IndexerService
from app.database import get_mongodb, get_vector_store
from app.config import settings

router = APIRouter(prefix="/api/crawl", tags=["Crawl"])


async def _crawl_and_index(
    job_id: str,
    url: str,
    max_pages: int,
    include_patterns: list,
    exclude_patterns: list
):
    """Background task for crawling and indexing."""
    mongodb = await get_mongodb()
    
    try:
        # Crawl
        crawler = CrawlerService()
        pages = await crawler.crawl(
            start_url=url,
            max_pages=max_pages,
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns,
            job_id=job_id
        )
        
        if not pages:
            await mongodb.update_crawl_job(job_id, status="failed", error="No pages found")
            return
        
        # Index
        indexer = IndexerService()
        stats = await indexer.index_pages(pages, job_id=job_id)
        
        # Update job status
        await mongodb.update_crawl_job(
            job_id,
            status="completed",
            pages_crawled=len(pages),
            pages_indexed=stats["indexed_pages"]
        )
        
        logger.info(f"Crawl job {job_id} completed: {stats}")
        
    except Exception as e:
        logger.error(f"Crawl job {job_id} failed: {e}")
        await mongodb.update_crawl_job(job_id, status="failed", error=str(e))


@router.post("", response_model=CrawlResponse)
async def start_crawl(body: CrawlRequest, background_tasks: BackgroundTasks):
    """
    Start a crawl job to index a website.
    
    - **url**: The URL to start crawling from
    - **max_pages**: Maximum number of pages to crawl
    - **include_patterns**: URL patterns to include (regex)
    - **exclude_patterns**: URL patterns to exclude (regex)
    
    Returns a job ID that can be used to check status.
    """
    try:
        mongodb = await get_mongodb()
        
        # Create job
        job_id = await mongodb.create_crawl_job(body.url)
        
        # Start background crawl
        background_tasks.add_task(
            _crawl_and_index,
            job_id,
            body.url,
            body.max_pages,
            body.include_patterns,
            body.exclude_patterns
        )
        
        return CrawlResponse(
            job_id=job_id,
            message=f"Crawl job started for {body.url}",
            status="running"
        )
        
    except Exception as e:
        logger.error(f"Start crawl error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{job_id}", response_model=CrawlStatus)
async def get_crawl_status(job_id: str):
    """
    Get the status of a crawl job.
    
    - **job_id**: The crawl job ID
    """
    try:
        mongodb = await get_mongodb()
        job = await mongodb.get_crawl_job(job_id)
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return CrawlStatus(
            job_id=job_id,
            status=job["status"],
            pages_crawled=job.get("pages_crawled", 0),
            pages_indexed=job.get("pages_indexed", 0),
            errors=job.get("errors", []),
            started_at=job["created_at"],
            completed_at=job.get("updated_at") if job["status"] == "completed" else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/latest", response_model=CrawlStatus)
async def get_latest_crawl():
    """Get the latest crawl job status."""
    try:
        mongodb = await get_mongodb()
        job = await mongodb.get_latest_crawl_job()
        
        if not job:
            raise HTTPException(status_code=404, detail="No crawl jobs found")
        
        return CrawlStatus(
            job_id=str(job["_id"]),
            status=job["status"],
            pages_crawled=job.get("pages_crawled", 0),
            pages_indexed=job.get("pages_indexed", 0),
            errors=job.get("errors", []),
            started_at=job["created_at"],
            completed_at=job.get("updated_at") if job["status"] == "completed" else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get latest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reindex")
async def reindex_all(background_tasks: BackgroundTasks):
    """
    Re-index all existing pages.
    
    Useful when you want to regenerate embeddings or update chunking.
    """
    try:
        async def _reindex():
            indexer = IndexerService()
            await indexer.reindex_all()
        
        background_tasks.add_task(_reindex)
        
        return {"message": "Reindexing started", "status": "running"}
        
    except Exception as e:
        logger.error(f"Reindex error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pages", response_model=list)
async def get_pages():
    """Get all indexed pages."""
    try:
        mongodb = await get_mongodb()
        pages = await mongodb.get_all_pages(status="indexed")
        
        return [
            PageInfo(
                url=p["url"],
                title=p.get("title", ""),
                chunk_count=p.get("chunk_count", 0),
                last_crawled=p.get("last_crawled"),
                status=p.get("status", "unknown")
            )
            for p in pages
        ]
        
    except Exception as e:
        logger.error(f"Get pages error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/pages/{url:path}")
async def delete_page(url: str):
    """
    Delete a page from the index.
    
    - **url**: The URL of the page to delete
    """
    try:
        indexer = IndexerService()
        result = await indexer.delete_page_index(url)
        
        return {"success": result, "message": f"Page {url} deleted"}
        
    except Exception as e:
        logger.error(f"Delete page error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
