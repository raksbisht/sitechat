"""
Admin API routes.
"""
from fastapi import APIRouter, HTTPException
from loguru import logger

from app.models.schemas import HealthCheck, SystemStats
from app.database import get_mongodb, get_vector_store
from app.services.ollama import get_ollama_service
from app.config import settings

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/health", response_model=HealthCheck)
async def health_check():
    """
    Check the health of all services.
    """
    mongodb_status = "unknown"
    vector_store_status = "unknown"
    ollama_status = "unknown"
    
    try:
        # Check MongoDB
        try:
            mongodb = await get_mongodb()
            await mongodb.db.command("ping")
            mongodb_status = "healthy"
        except Exception as e:
            mongodb_status = f"unhealthy: {str(e)}"
        
        # Check Vector Store
        try:
            vector_store = get_vector_store()
            stats = vector_store.get_collection_stats()
            vector_store_status = f"healthy ({stats['count']} documents)"
        except Exception as e:
            vector_store_status = f"unhealthy: {str(e)}"
        
        # Check Ollama
        try:
            ollama = get_ollama_service()
            if await ollama.check_health():
                models = await ollama.list_models()
                ollama_status = f"healthy ({len(models)} models)"
            else:
                ollama_status = "unhealthy: not responding"
        except Exception as e:
            ollama_status = f"unhealthy: {str(e)}"
        
        overall = "healthy" if all(
            s.startswith("healthy")
            for s in [mongodb_status, vector_store_status, ollama_status]
        ) else "degraded"
        
        return HealthCheck(
            status=overall,
            mongodb=mongodb_status,
            vector_store=vector_store_status,
            ollama=ollama_status
        )
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return HealthCheck(
            status="unhealthy",
            mongodb=mongodb_status,
            vector_store=vector_store_status,
            ollama=ollama_status
        )


@router.get("/stats", response_model=SystemStats)
async def get_stats():
    """
    Get system statistics.
    """
    try:
        mongodb = await get_mongodb()
        vector_store = get_vector_store()
        
        # Get counts
        page_count = await mongodb.get_page_count()
        vector_stats = vector_store.get_collection_stats()
        
        # Get conversation stats
        conversations = await mongodb.get_all_sessions(limit=1000)
        total_conversations = len(conversations)
        
        # Get latest crawl
        latest_job = await mongodb.get_latest_crawl_job()
        last_crawl = latest_job.get("created_at") if latest_job else None
        
        return SystemStats(
            total_pages=page_count,
            total_chunks=vector_stats.get("count", 0),
            total_conversations=total_conversations,
            total_messages=0,  # Would need to aggregate
            last_crawl=last_crawl
        )
        
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config")
async def get_config():
    """
    Get current configuration (non-sensitive).
    """
    return {
        "app_name": settings.APP_NAME,
        "ollama_model": settings.OLLAMA_MODEL,
        "chunk_size": settings.CHUNK_SIZE,
        "chunk_overlap": settings.CHUNK_OVERLAP,
        "retrieval_k": settings.RETRIEVAL_K,
        "conversation_window": settings.CONVERSATION_WINDOW_SIZE,
        "rate_limit": f"{settings.RATE_LIMIT_REQUESTS}/{settings.RATE_LIMIT_WINDOW}s"
    }


@router.post("/clear-cache")
async def clear_cache():
    """
    Clear all caches.
    """
    try:
        import shutil
        import os
        
        # Clear LLM cache
        if os.path.exists(settings.LLM_CACHE_DIR):
            os.remove(settings.LLM_CACHE_DIR)
        
        # Clear embedding cache
        if os.path.exists(settings.EMBEDDING_CACHE_DIR):
            shutil.rmtree(settings.EMBEDDING_CACHE_DIR)
            os.makedirs(settings.EMBEDDING_CACHE_DIR)
        
        return {"success": True, "message": "Caches cleared"}
        
    except Exception as e:
        logger.error(f"Clear cache error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear-all")
async def clear_all_data():
    """
    Clear all data (conversations, pages, vectors).
    
    WARNING: This is destructive and cannot be undone!
    """
    try:
        mongodb = await get_mongodb()
        vector_store = get_vector_store()
        
        # Clear collections
        await mongodb.db.conversations.delete_many({})
        await mongodb.db.pages.delete_many({})
        await mongodb.db.crawl_jobs.delete_many({})
        await mongodb.db.long_term_memory.delete_many({})
        
        # Clear vector store
        vector_store.clear_collection()
        
        return {"success": True, "message": "All data cleared"}
        
    except Exception as e:
        logger.error(f"Clear all error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
