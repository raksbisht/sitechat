"""
Abstract base class for cache providers.
Handles caching operations for performance optimization.
"""
from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseCacheProvider(ABC):
    """
    Abstract base class for caching operations.
    
    Implementations: MemoryCache, Redis, Memcached, etc.
    """
    
    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """
        Get a value from cache.
        
        Args:
            key: The cache key
            
        Returns:
            The cached value or None if not found/expired
        """
        pass
    
    @abstractmethod
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """
        Set a value in cache.
        
        Args:
            key: The cache key
            value: The value to cache
            ttl: Time to live in seconds (None for default TTL)
            
        Returns:
            True if successfully cached
        """
        pass
    
    @abstractmethod
    async def delete(self, key: str) -> bool:
        """
        Delete a key from cache.
        
        Args:
            key: The cache key
            
        Returns:
            True if key was deleted, False if not found
        """
        pass
    
    @abstractmethod
    async def exists(self, key: str) -> bool:
        """
        Check if a key exists in cache.
        
        Args:
            key: The cache key
            
        Returns:
            True if key exists and is not expired
        """
        pass
    
    @abstractmethod
    async def clear(self, pattern: Optional[str] = None) -> int:
        """
        Clear cache entries.
        
        Args:
            pattern: Optional pattern to match keys (e.g., "user:*")
                    If None, clears all cache
            
        Returns:
            Number of keys cleared
        """
        pass
    
    @abstractmethod
    async def get_or_set(
        self,
        key: str,
        factory,
        ttl: Optional[int] = None
    ) -> Any:
        """
        Get value from cache or compute and cache it.
        
        Args:
            key: The cache key
            factory: Callable that returns the value to cache (can be async)
            ttl: Time to live in seconds
            
        Returns:
            The cached or computed value
        """
        pass
