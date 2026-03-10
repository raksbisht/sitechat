"""
Vector store operations using FAISS.
"""
import os
import pickle
from typing import List, Dict, Optional
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document
from loguru import logger

from app.config import settings


class VectorStore:
    """FAISS vector store with HuggingFace embeddings."""
    
    def __init__(self):
        self.embeddings = None
        self.vector_store = None
        self._initialized = False
        self.index_path = os.path.join(settings.CHROMA_PERSIST_DIR, "faiss_index")
    
    def initialize(self):
        """Initialize the vector store and embeddings."""
        if self._initialized:
            return
        
        try:
            # Create directories
            os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)
            
            # Initialize embeddings (HuggingFace - runs locally)
            logger.info("Loading embedding model...")
            self.embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2",
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            
            # Try to load existing index
            if os.path.exists(self.index_path):
                logger.info("Loading existing FAISS index...")
                self.vector_store = FAISS.load_local(
                    self.index_path,
                    self.embeddings,
                    allow_dangerous_deserialization=True
                )
            else:
                logger.info("Creating new FAISS index...")
                # Create empty index with a dummy document
                self.vector_store = FAISS.from_texts(
                    ["Initial document"],
                    self.embeddings,
                    metadatas=[{"source": "init"}]
                )
                self._save_index()
            
            self._initialized = True
            logger.info("Vector store initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize vector store: {e}")
            raise
    
    def _save_index(self):
        """Save the FAISS index to disk."""
        if self.vector_store:
            self.vector_store.save_local(self.index_path)
    
    def add_documents(self, documents: List[Document]) -> List[str]:
        """Add documents to the vector store."""
        if not self._initialized:
            self.initialize()
        
        try:
            if not documents:
                return []
            
            # Add documents
            ids = self.vector_store.add_documents(documents)
            
            # Save to disk
            self._save_index()
            
            logger.info(f"Added {len(documents)} documents to vector store")
            return ids
        except Exception as e:
            logger.error(f"Failed to add documents: {e}")
            raise
    
    def similarity_search(
        self,
        query: str,
        k: int = None,
        filter: Dict = None
    ) -> List[Document]:
        """Search for similar documents."""
        if not self._initialized:
            self.initialize()
        
        k = k or settings.RETRIEVAL_K
        
        try:
            # FAISS doesn't support filtering directly, so we fetch more and filter
            results = self.vector_store.similarity_search(query, k=k)
            
            # Apply filter if provided
            if filter:
                results = [
                    doc for doc in results
                    if all(doc.metadata.get(key) == value for key, value in filter.items())
                ]
            
            return results
        except Exception as e:
            logger.error(f"Similarity search failed: {e}")
            return []
    
    def similarity_search_with_score(
        self,
        query: str,
        k: int = None,
        filter: Dict = None
    ) -> List[tuple]:
        """Search for similar documents with relevance scores."""
        if not self._initialized:
            self.initialize()
        
        k = k or settings.RETRIEVAL_K
        
        try:
            results = self.vector_store.similarity_search_with_score(query, k=k)
            
            # Apply filter if provided
            if filter:
                results = [
                    (doc, score) for doc, score in results
                    if all(doc.metadata.get(key) == value for key, value in filter.items())
                ]
            
            return results
        except Exception as e:
            logger.error(f"Similarity search with score failed: {e}")
            return []
    
    def delete_by_metadata(self, filter: Dict) -> bool:
        """Delete documents by metadata filter."""
        if not self._initialized:
            self.initialize()
        
        try:
            # FAISS doesn't have native delete, so we rebuild without matching docs
            # This is a workaround - for production, consider using a different vector store
            logger.warning("FAISS delete_by_metadata is not fully supported, skipping")
            return False
        except Exception as e:
            logger.error(f"Failed to delete documents: {e}")
            return False
    
    def clear_collection(self):
        """Clear all documents from the collection."""
        if not self._initialized:
            self.initialize()
        
        try:
            # Remove the index file and reinitialize
            if os.path.exists(self.index_path):
                import shutil
                shutil.rmtree(self.index_path, ignore_errors=True)
            
            # Reinitialize with empty index
            self.vector_store = FAISS.from_texts(
                ["Initial document"],
                self.embeddings,
                metadatas=[{"source": "init"}]
            )
            self._save_index()
            
            logger.info("Cleared vector store collection")
        except Exception as e:
            logger.error(f"Failed to clear collection: {e}")
            raise
    
    def get_collection_stats(self) -> Dict:
        """Get statistics about the collection."""
        if not self._initialized:
            self.initialize()
        
        try:
            count = self.vector_store.index.ntotal if self.vector_store else 0
            return {
                "name": "faiss_index",
                "count": count
            }
        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return {"name": "faiss_index", "count": 0}


# Singleton instance
_vector_store: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    """Get or create VectorStore instance."""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
        _vector_store.initialize()
    return _vector_store
