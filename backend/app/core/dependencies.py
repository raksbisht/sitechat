"""
Dependency injection configuration for FastAPI.
Provides factory functions for all providers based on configuration.
"""
from typing import Optional
from loguru import logger

from app.config import settings
from app.providers.database.base import BaseDatabaseProvider
from app.providers.storage.base import BaseStorageProvider
from app.providers.cache.base import BaseCacheProvider


# Singleton instances
_db: Optional[BaseDatabaseProvider] = None
_storage: Optional[BaseStorageProvider] = None
_cache: Optional["MemoryCacheProvider"] = None


# ===========================================
# Database Provider
# ===========================================

def _create_database_provider() -> BaseDatabaseProvider:
    """Create database provider based on configuration."""
    provider = settings.DATABASE_PROVIDER
    
    if provider == "mongodb":
        from app.providers.database.mongodb_provider import MongoDBProvider
        return MongoDBProvider()
    elif provider == "postgresql":
        raise NotImplementedError("PostgreSQL provider not yet implemented")
    else:
        raise ValueError(f"Unknown database provider: {provider}")


async def get_db() -> BaseDatabaseProvider:
    """Get database provider instance (FastAPI dependency)."""
    global _db
    if _db is None:
        _db = _create_database_provider()
        await _db.connect()
    return _db


# ===========================================
# Storage Provider
# ===========================================

def _create_storage_provider() -> BaseStorageProvider:
    """Create storage provider based on configuration."""
    provider = settings.STORAGE_PROVIDER
    
    if provider == "local":
        from app.providers.storage.local_provider import LocalStorageProvider
        return LocalStorageProvider()
    elif provider == "s3":
        raise NotImplementedError("S3 storage provider not yet implemented")
    elif provider == "gcs":
        raise NotImplementedError("GCS storage provider not yet implemented")
    else:
        raise ValueError(f"Unknown storage provider: {provider}")


async def get_storage() -> BaseStorageProvider:
    """Get storage provider instance (FastAPI dependency)."""
    global _storage
    if _storage is None:
        _storage = _create_storage_provider()
    return _storage


# ===========================================
# Cache Provider
# ===========================================

def _create_cache_provider():
    """Create cache provider based on configuration."""
    provider = settings.CACHE_PROVIDER
    
    if provider == "memory":
        from app.providers.cache.memory_provider import MemoryCacheProvider
        return MemoryCacheProvider()
    elif provider == "redis":
        raise NotImplementedError("Redis cache provider not yet implemented")
    else:
        raise ValueError(f"Unknown cache provider: {provider}")


async def get_cache():
    """Get cache provider instance (FastAPI dependency)."""
    global _cache
    if _cache is None:
        _cache = _create_cache_provider()
        await _cache.start()
    return _cache


# ===========================================
# LangChain Components (delegated to factory)
# ===========================================

def get_llm():
    """Get LLM instance from factory."""
    from app.providers.factory import get_llm as factory_get_llm
    return factory_get_llm()


def get_embeddings():
    """Get embeddings instance from factory."""
    from app.providers.factory import get_embeddings as factory_get_embeddings
    return factory_get_embeddings()


def get_vector_store(site_id: Optional[str] = None):
    """Get vector store instance from factory."""
    from app.providers.factory import get_vector_store as factory_get_vector_store
    return factory_get_vector_store(site_id=site_id)


# ===========================================
# Lifecycle Management
# ===========================================

async def init_providers():
    """Initialize all providers on application startup."""
    logger.info("Initializing providers...")
    
    await get_db()
    logger.info(f"Database provider initialized: {settings.DATABASE_PROVIDER}")
    
    await get_storage()
    logger.info(f"Storage provider initialized: {settings.STORAGE_PROVIDER}")
    
    await get_cache()
    logger.info(f"Cache provider initialized: {settings.CACHE_PROVIDER}")
    
    get_llm()
    logger.info(f"LLM provider initialized: {settings.LLM_PROVIDER}")
    
    get_embeddings()
    logger.info(f"Embeddings provider initialized: {settings.EMBEDDINGS_PROVIDER}")
    
    logger.info("All providers initialized successfully")


async def shutdown_providers():
    """Shutdown all providers on application shutdown."""
    global _db, _storage, _cache
    
    logger.info("Shutting down providers...")
    
    if _db:
        await _db.disconnect()
        _db = None
    
    if _cache:
        await _cache.stop()
        _cache = None
    
    logger.info("All providers shut down")


# ===========================================
# Backward Compatibility
# ===========================================

async def get_mongodb():
    """
    Backward compatibility function for existing code.
    Returns the database provider (which is MongoDB by default).
    """
    return await get_db()
