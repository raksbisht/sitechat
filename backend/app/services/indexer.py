"""
Indexer service for chunking and storing documents.
"""
from typing import List, Dict, Optional
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from loguru import logger

from app.config import settings
from app.database import get_mongodb, get_vector_store


class IndexerService:
    """Service for indexing documents into the vector store."""
    
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len,
            add_start_index=True
        )
    
    async def index_pages(
        self,
        pages: List[Dict],
        job_id: str = None
    ) -> Dict:
        """
        Index a list of crawled pages.
        
        Args:
            pages: List of page dictionaries with url, title, content
            job_id: Crawl job ID for progress tracking
        
        Returns:
            Indexing statistics
        """
        vector_store = get_vector_store()
        mongodb = await get_mongodb()
        
        total_chunks = 0
        indexed_pages = 0
        errors = []
        
        for page in pages:
            try:
                # Create chunks
                chunks = self._create_chunks(page)
                
                if not chunks:
                    continue
                
                # Add to vector store
                vector_store.add_documents(chunks)
                
                # Save page metadata to MongoDB
                await mongodb.save_page(
                    url=page["url"],
                    title=page["title"],
                    content=page["content"][:1000],  # Store preview
                    chunk_count=len(chunks),
                    metadata=page.get("metadata", {})
                )
                
                total_chunks += len(chunks)
                indexed_pages += 1
                
                # Update job progress
                if job_id:
                    await mongodb.update_crawl_job(
                        job_id,
                        pages_indexed=indexed_pages
                    )
                
                logger.info(f"Indexed: {page['url']} ({len(chunks)} chunks)")
                
            except Exception as e:
                error_msg = f"Error indexing {page.get('url', 'unknown')}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)
        
        stats = {
            "total_pages": len(pages),
            "indexed_pages": indexed_pages,
            "total_chunks": total_chunks,
            "errors": errors
        }
        
        logger.info(f"Indexing complete: {stats}")
        return stats
    
    def _create_chunks(self, page: Dict) -> List[Document]:
        """Create document chunks from a page."""
        content = page.get("content", "")
        
        if not content or len(content) < 50:
            return []
        
        # Split content into chunks
        texts = self.text_splitter.split_text(content)
        
        # Create Document objects with metadata
        documents = []
        for i, text in enumerate(texts):
            doc = Document(
                page_content=text,
                metadata={
                    "url": page["url"],
                    "title": page["title"],
                    "chunk_index": i,
                    "total_chunks": len(texts),
                    "source": page["url"],
                    "word_count": len(text.split())
                }
            )
            documents.append(doc)
        
        return documents
    
    async def reindex_all(self) -> Dict:
        """Reindex all pages from MongoDB."""
        mongodb = await get_mongodb()
        vector_store = get_vector_store()
        
        # Clear existing vectors
        vector_store.clear_collection()
        
        # Get all pages from MongoDB
        pages = await mongodb.get_all_pages()
        
        # Re-create page data for indexing
        page_data = [
            {
                "url": p["url"],
                "title": p["title"],
                "content": p.get("content", ""),
                "metadata": p.get("metadata", {})
            }
            for p in pages
        ]
        
        return await self.index_pages(page_data)
    
    async def index_single_page(self, url: str, title: str, content: str) -> int:
        """Index a single page."""
        page = {"url": url, "title": title, "content": content}
        stats = await self.index_pages([page])
        return stats["total_chunks"]
    
    async def delete_page_index(self, url: str) -> bool:
        """Delete a page's index from the vector store."""
        vector_store = get_vector_store()
        mongodb = await get_mongodb()
        
        # Delete from vector store
        vector_store.delete_by_metadata({"url": url})
        
        # Delete from MongoDB
        await mongodb.delete_page(url)
        
        logger.info(f"Deleted index for: {url}")
        return True


# Singleton instance
_indexer_service: Optional[IndexerService] = None


def get_indexer_service() -> IndexerService:
    """Get or create IndexerService instance."""
    global _indexer_service
    if _indexer_service is None:
        _indexer_service = IndexerService()
    return _indexer_service
