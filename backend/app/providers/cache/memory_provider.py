"""
In-memory cache provider implementation.
Uses a simple dict with TTL support for local caching.
"""
import asyncio
import fnmatch
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, Tuple
from loguru import logger

from app.config import settings


class MemoryCacheProvider:
    """In-memory cache implementation with TTL support."""
    
    def __init__(self, default_ttl: Optional[int] = None):
        self.default_ttl = default_ttl or settings.CACHE_TTL
        self._cache: Dict[str, Tuple[Any, datetime]] = {}
        self._cleanup_interval = 60
        self._cleanup_task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the cache cleanup background task."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Memory cache started")
    
    async def stop(self):
        """Stop the cache cleanup background task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("Memory cache stopped")
    
    async def _cleanup_loop(self):
        """Background task to clean up expired entries."""
        while True:
            try:
                await asyncio.sleep(self._cleanup_interval)
                await self._cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cache cleanup error: {e}")
    
    async def _cleanup_expired(self):
        """Remove expired entries from cache."""
        now = datetime.utcnow()
        expired_keys = [
            key for key, (_, expires_at) in self._cache.items()
            if expires_at and expires_at < now
        ]
        
        for key in expired_keys:
            del self._cache[key]
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")
    
    async def get(self, key: str) -> Optional[Any]:
        """Get a value from cache."""
        if key not in self._cache:
            return None
        
        value, expires_at = self._cache[key]
        
        if expires_at and expires_at < datetime.utcnow():
            del self._cache[key]
            return None
        
        return value
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """Set a value in cache."""
        ttl = ttl if ttl is not None else self.default_ttl
        
        if ttl and ttl > 0:
            expires_at = datetime.utcnow() + timedelta(seconds=ttl)
        else:
            expires_at = None
        
        self._cache[key] = (value, expires_at)
        return True
    
    async def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        if key in self._cache:
            del self._cache[key]
            return True
        return False
    
    async def exists(self, key: str) -> bool:
        """Check if a key exists in cache."""
        if key not in self._cache:
            return False
        
        _, expires_at = self._cache[key]
        
        if expires_at and expires_at < datetime.utcnow():
            del self._cache[key]
            return False
        
        return True
    
    async def clear(self, pattern: Optional[str] = None) -> int:
        """Clear cache entries."""
        if pattern is None:
            count = len(self._cache)
            self._cache.clear()
            return count
        
        matching_keys = [
            key for key in self._cache.keys()
            if fnmatch.fnmatch(key, pattern)
        ]
        
        for key in matching_keys:
            del self._cache[key]
        
        return len(matching_keys)
    
    async def get_or_set(
        self,
        key: str,
        factory,
        ttl: Optional[int] = None
    ) -> Any:
        """Get value from cache or compute and cache it."""
        value = await self.get(key)
        
        if value is not None:
            return value
        
        if asyncio.iscoroutinefunction(factory):
            value = await factory()
        else:
            value = factory()
        
        await self.set(key, value, ttl)
        return value
    
    def size(self) -> int:
        """Get the number of items in cache."""
        return len(self._cache)
