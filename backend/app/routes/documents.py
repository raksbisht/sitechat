"""
Document upload and management API routes.
"""
import os
import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from pydantic import BaseModel
from loguru import logger

from app.database import get_mongodb, get_vector_store
from app.services.document_processor import get_document_processor, DocumentProcessor
from app.services.indexer import get_indexer_service
from app.routes.auth import require_auth


router = APIRouter(prefix="/api/documents", tags=["Documents"])


class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    word_count: int
    status: str
    uploaded_at: str


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


@router.get("/supported-types")
async def get_supported_types():
    """Get list of supported document types."""
    processor = get_document_processor()
    return {
        "supported_extensions": processor.get_supported_types(),
        "max_file_size_mb": processor.MAX_FILE_SIZE // (1024 * 1024)
    }


@router.post("/upload/{site_id}")
async def upload_documents(
    site_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user: dict = Depends(require_auth)
):
    """
    Upload documents to a site's knowledge base.
    Supports: PDF, DOCX, TXT, MD, CSV, PPTX, XLSX
    """
    mongodb = await get_mongodb()
    processor = get_document_processor()
    
    # Verify site exists and user has access
    site = await mongodb.db.sites.find_one({"site_id": site_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    user_id = str(user["_id"])
    if site.get("user_id") and site["user_id"] != user_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    results = []
    documents_to_index = []
    
    for file in files:
        # Validate file type
        if not processor.is_supported(file.filename):
            results.append({
                "filename": file.filename,
                "success": False,
                "error": f"Unsupported file type. Supported: {', '.join(processor.get_supported_types())}"
            })
            continue
        
        try:
            # Read file content
            content = await file.read()
            
            # Process document
            result = await processor.process_file(content, file.filename, file.content_type)
            
            if not result['success']:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": result['error']
                })
                continue
            
            # Generate document ID
            doc_id = str(uuid.uuid4())[:12]
            
            # Save document metadata to MongoDB
            doc_record = {
                "doc_id": doc_id,
                "site_id": site_id,
                "filename": file.filename,
                "file_type": result['file_type'],
                "word_count": result['word_count'],
                "char_count": result['char_count'],
                "metadata": result['metadata'],
                "status": "processing",
                "uploaded_at": datetime.utcnow(),
                "uploaded_by": user_id
            }
            
            await mongodb.db.documents.insert_one(doc_record)
            
            # Queue for indexing
            documents_to_index.append({
                "doc_id": doc_id,
                "site_id": site_id,
                "filename": file.filename,
                "text": result['text'],
                "metadata": result['metadata']
            })
            
            results.append({
                "filename": file.filename,
                "success": True,
                "doc_id": doc_id,
                "word_count": result['word_count']
            })
            
        except Exception as e:
            logger.error(f"Error uploading {file.filename}: {e}")
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })
    
    # Index documents in background
    if documents_to_index:
        background_tasks.add_task(index_documents, documents_to_index, site_id)
    
    # Update site to indicate it has documents
    await mongodb.db.sites.update_one(
        {"site_id": site_id},
        {"$set": {"has_documents": True, "updated_at": datetime.utcnow()}}
    )
    
    successful = sum(1 for r in results if r.get('success'))
    
    return {
        "message": f"Uploaded {successful} of {len(files)} documents",
        "results": results,
        "total_uploaded": successful
    }


async def index_documents(documents: List[dict], site_id: str):
    """Index uploaded documents into the vector store."""
    mongodb = await get_mongodb()
    indexer = get_indexer_service()
    vector_store = get_vector_store()
    
    for doc in documents:
        try:
            # Create page-like data for indexer
            pages = [{
                "url": f"doc://{site_id}/{doc['doc_id']}",
                "title": doc['filename'],
                "content": doc['text'],
                "metadata": {
                    **doc['metadata'],
                    "source_type": "document",
                    "doc_id": doc['doc_id'],
                    "site_id": site_id
                }
            }]
            
            # Index the document
            stats = await indexer.index_pages(pages)
            
            # Update document status
            await mongodb.db.documents.update_one(
                {"doc_id": doc['doc_id']},
                {"$set": {
                    "status": "indexed",
                    "chunks_created": stats.get('total_chunks', 0),
                    "indexed_at": datetime.utcnow()
                }}
            )
            
            logger.info(f"Indexed document {doc['filename']} with {stats.get('total_chunks', 0)} chunks")
            
        except Exception as e:
            logger.error(f"Error indexing document {doc['filename']}: {e}")
            await mongodb.db.documents.update_one(
                {"doc_id": doc['doc_id']},
                {"$set": {"status": "error", "error": str(e)}}
            )


@router.get("/{site_id}")
async def list_documents(
    site_id: str,
    user: dict = Depends(require_auth)
):
    """Get all documents for a site."""
    mongodb = await get_mongodb()
    
    # Verify site access
    site = await mongodb.db.sites.find_one({"site_id": site_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    user_id = str(user["_id"])
    if site.get("user_id") and site["user_id"] != user_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get documents
    cursor = mongodb.db.documents.find({"site_id": site_id})
    documents = await cursor.to_list(length=1000)
    
    return {
        "documents": [
            {
                "id": doc["doc_id"],
                "filename": doc["filename"],
                "file_type": doc["file_type"],
                "word_count": doc.get("word_count", 0),
                "chunks": doc.get("chunks_created", 0),
                "status": doc["status"],
                "uploaded_at": doc["uploaded_at"].isoformat() if doc.get("uploaded_at") else None
            }
            for doc in documents
        ],
        "total": len(documents)
    }


@router.delete("/{site_id}/{doc_id}")
async def delete_document(
    site_id: str,
    doc_id: str,
    user: dict = Depends(require_auth)
):
    """Delete a document from a site."""
    mongodb = await get_mongodb()
    vector_store = get_vector_store()
    
    # Verify site access
    site = await mongodb.db.sites.find_one({"site_id": site_id})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    
    user_id = str(user["_id"])
    if site.get("user_id") and site["user_id"] != user_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find document
    doc = await mongodb.db.documents.find_one({"doc_id": doc_id, "site_id": site_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete from vector store
    try:
        doc_url = f"doc://{site_id}/{doc_id}"
        vector_store.delete_by_metadata({"url": doc_url})
    except Exception as e:
        logger.warning(f"Error deleting document vectors: {e}")
    
    # Delete from MongoDB
    await mongodb.db.documents.delete_one({"doc_id": doc_id})
    
    # Check if site still has documents
    remaining = await mongodb.db.documents.count_documents({"site_id": site_id})
    if remaining == 0:
        await mongodb.db.sites.update_one(
            {"site_id": site_id},
            {"$set": {"has_documents": False}}
        )
    
    return {"success": True, "message": "Document deleted"}
