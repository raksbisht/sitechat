"""
Database connections and operations.

This module maintains backward compatibility while supporting the new provider architecture.
For new code, prefer using:
  - app.core.dependencies for FastAPI dependency injection
  - app.providers for direct provider access
"""
from .mongodb import MongoDB, get_mongodb
from .vector_store import VectorStore, get_vector_store

__all__ = ["MongoDB", "get_mongodb", "VectorStore", "get_vector_store"]
