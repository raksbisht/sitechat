"""
Document processing service using LangChain document loaders.
Supports: PDF, DOCX, TXT, Markdown, CSV, PPTX, XLSX, HTML
"""
import os
import re
import tempfile
from typing import Dict, Optional, List
from datetime import datetime
from loguru import logger

from langchain_core.documents import Document
from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    TextLoader,
    CSVLoader,
    UnstructuredMarkdownLoader,
    UnstructuredHTMLLoader,
    UnstructuredPowerPointLoader,
    UnstructuredExcelLoader,
)


class DocumentProcessor:
    """Process various document types using LangChain loaders."""
    
    SUPPORTED_EXTENSIONS = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.csv': 'text/csv',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.html': 'text/html',
        '.htm': 'text/html',
    }
    
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    
    def __init__(self):
        pass
    
    @classmethod
    def is_supported(cls, filename: str) -> bool:
        """Check if file type is supported."""
        ext = os.path.splitext(filename.lower())[1]
        return ext in cls.SUPPORTED_EXTENSIONS
    
    @classmethod
    def get_supported_types(cls) -> List[str]:
        """Get list of supported file extensions."""
        return list(cls.SUPPORTED_EXTENSIONS.keys())
    
    async def process_file(
        self,
        file_content: bytes,
        filename: str,
        mime_type: Optional[str] = None
    ) -> Dict:
        """
        Process a file and extract text content using LangChain loaders.
        
        Args:
            file_content: Raw file bytes
            filename: Original filename
            mime_type: MIME type (optional)
        
        Returns:
            Dict with extracted text, metadata, and status
        """
        ext = os.path.splitext(filename.lower())[1]
        
        if not self.is_supported(filename):
            return {
                'success': False,
                'error': f'Unsupported file type: {ext}',
                'filename': filename
            }
        
        if len(file_content) > self.MAX_FILE_SIZE:
            return {
                'success': False,
                'error': f'File too large. Maximum size is {self.MAX_FILE_SIZE // (1024*1024)}MB',
                'filename': filename
            }
        
        # Create temp file for LangChain loaders (they need file paths)
        temp_file = None
        try:
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            temp_file.write(file_content)
            temp_file.close()
            
            # Get appropriate loader
            loader = self._get_loader(temp_file.name, ext)
            
            if loader is None:
                return {
                    'success': False,
                    'error': f'No loader available for {ext}',
                    'filename': filename
                }
            
            # Load documents
            documents = loader.load()
            
            # Combine all document content
            text = self._combine_documents(documents)
            text = self._clean_text(text)
            
            # Extract metadata
            metadata = self._extract_metadata(documents, ext)
            
            return {
                'success': True,
                'filename': filename,
                'text': text,
                'word_count': len(text.split()),
                'char_count': len(text),
                'metadata': metadata,
                'file_type': ext,
                'processed_at': datetime.utcnow().isoformat(),
                'documents': documents  # Include LangChain documents for direct use
            }
            
        except Exception as e:
            logger.error(f"Error processing {filename}: {e}")
            return {
                'success': False,
                'error': str(e),
                'filename': filename
            }
        finally:
            # Clean up temp file
            if temp_file and os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except Exception:
                    pass
    
    def _get_loader(self, file_path: str, ext: str):
        """Get the appropriate LangChain loader for the file type."""
        loaders = {
            '.pdf': lambda: PyPDFLoader(file_path),
            '.docx': lambda: Docx2txtLoader(file_path),
            '.doc': lambda: Docx2txtLoader(file_path),
            '.txt': lambda: TextLoader(file_path, autodetect_encoding=True),
            '.md': lambda: UnstructuredMarkdownLoader(file_path),
            '.csv': lambda: CSVLoader(file_path),
            '.pptx': lambda: UnstructuredPowerPointLoader(file_path),
            '.xlsx': lambda: UnstructuredExcelLoader(file_path),
            '.html': lambda: UnstructuredHTMLLoader(file_path),
            '.htm': lambda: UnstructuredHTMLLoader(file_path),
        }
        
        loader_factory = loaders.get(ext)
        if loader_factory:
            try:
                return loader_factory()
            except Exception as e:
                logger.warning(f"Failed to create loader for {ext}: {e}")
                # Fallback to TextLoader for text-based formats
                if ext in ['.md', '.html', '.htm']:
                    return TextLoader(file_path, autodetect_encoding=True)
                return None
        return None
    
    def _combine_documents(self, documents: List[Document]) -> str:
        """Combine multiple LangChain documents into single text."""
        text_parts = []
        
        for i, doc in enumerate(documents):
            content = doc.page_content.strip()
            if content:
                # Add page/section marker if multiple documents
                if len(documents) > 1:
                    source = doc.metadata.get('source', '')
                    page = doc.metadata.get('page', i + 1)
                    text_parts.append(f"[Section {page}]\n{content}")
                else:
                    text_parts.append(content)
        
        return "\n\n".join(text_parts)
    
    def _extract_metadata(self, documents: List[Document], ext: str) -> Dict:
        """Extract metadata from loaded documents."""
        metadata = {
            'page_count': len(documents),
            'source_type': ext.replace('.', '').upper()
        }
        
        # Collect unique metadata from all documents
        all_meta = {}
        for doc in documents:
            for key, value in doc.metadata.items():
                if key not in all_meta and value is not None:
                    all_meta[key] = value
        
        # Add relevant metadata
        if 'total_pages' in all_meta:
            metadata['total_pages'] = all_meta['total_pages']
        if 'author' in all_meta:
            metadata['author'] = all_meta['author']
        if 'title' in all_meta:
            metadata['title'] = all_meta['title']
        
        return metadata
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize extracted text."""
        # Remove excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        text = re.sub(r'\t+', ' ', text)
        text = text.strip()
        return text
    
    async def process_file_to_documents(
        self,
        file_content: bytes,
        filename: str
    ) -> List[Document]:
        """
        Process a file and return LangChain Document objects directly.
        Useful for direct integration with LangChain pipelines.
        """
        result = await self.process_file(file_content, filename)
        
        if not result['success']:
            raise ValueError(result['error'])
        
        # Return the documents if available, otherwise create one
        if 'documents' in result:
            return result['documents']
        
        # Fallback: create a single document from text
        return [Document(
            page_content=result['text'],
            metadata={
                'source': filename,
                'file_type': result['file_type']
            }
        )]


# Singleton instance
_processor: Optional[DocumentProcessor] = None


def get_document_processor() -> DocumentProcessor:
    """Get or create DocumentProcessor instance."""
    global _processor
    if _processor is None:
        _processor = DocumentProcessor()
    return _processor
