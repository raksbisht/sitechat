"""
Unit tests for Document Processor service.
Tests file type support, text extraction, chunking, and metadata handling.
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from langchain_core.documents import Document

from app.services.document_processor import (
    DocumentProcessor,
    get_document_processor,
)


# ==================== Fixtures ====================

@pytest.fixture
def processor():
    """Create a DocumentProcessor instance."""
    return DocumentProcessor()


@pytest.fixture
def sample_text_content():
    """Sample text file content."""
    return b"This is a sample text document.\nIt has multiple lines.\nAnd some content to process."


@pytest.fixture
def sample_html_content():
    """Sample HTML file content."""
    return b"""
    <!DOCTYPE html>
    <html>
    <head><title>Test Document</title></head>
    <body>
        <h1>Main Heading</h1>
        <p>This is the main content of the HTML document.</p>
        <p>It contains multiple paragraphs with information.</p>
    </body>
    </html>
    """


@pytest.fixture
def sample_markdown_content():
    """Sample Markdown file content."""
    return b"""# Document Title

## Section 1

This is the first section with some content.

## Section 2

This is the second section with more content.

- List item 1
- List item 2
- List item 3
"""


# ==================== File Type Support Tests ====================

class TestFileTypeSupport:
    """Tests for supported file type detection."""
    
    def test_is_supported_pdf(self, processor):
        """PDF files should be supported."""
        assert processor.is_supported("document.pdf") is True
        assert processor.is_supported("DOCUMENT.PDF") is True
    
    def test_is_supported_docx(self, processor):
        """DOCX files should be supported."""
        assert processor.is_supported("document.docx") is True
        assert processor.is_supported("report.DOCX") is True
    
    def test_is_supported_doc(self, processor):
        """DOC files should be supported."""
        assert processor.is_supported("document.doc") is True
    
    def test_is_supported_txt(self, processor):
        """TXT files should be supported."""
        assert processor.is_supported("notes.txt") is True
        assert processor.is_supported("README.TXT") is True
    
    def test_is_supported_markdown(self, processor):
        """Markdown files should be supported."""
        assert processor.is_supported("README.md") is True
        assert processor.is_supported("docs.MD") is True
    
    def test_is_supported_csv(self, processor):
        """CSV files should be supported."""
        assert processor.is_supported("data.csv") is True
    
    def test_is_supported_pptx(self, processor):
        """PPTX files should be supported."""
        assert processor.is_supported("presentation.pptx") is True
    
    def test_is_supported_xlsx(self, processor):
        """XLSX files should be supported."""
        assert processor.is_supported("spreadsheet.xlsx") is True
    
    def test_is_supported_html(self, processor):
        """HTML files should be supported."""
        assert processor.is_supported("page.html") is True
        assert processor.is_supported("page.htm") is True
    
    def test_is_supported_unsupported_type(self, processor):
        """Unsupported file types should return False."""
        assert processor.is_supported("image.png") is False
        assert processor.is_supported("video.mp4") is False
        assert processor.is_supported("archive.zip") is False
        assert processor.is_supported("binary.exe") is False
    
    def test_is_supported_no_extension(self, processor):
        """Files without extension should not be supported."""
        assert processor.is_supported("filename") is False
    
    def test_get_supported_types(self, processor):
        """Should return list of all supported extensions."""
        supported = processor.get_supported_types()
        
        assert ".pdf" in supported
        assert ".docx" in supported
        assert ".txt" in supported
        assert ".md" in supported
        assert ".csv" in supported
        assert ".html" in supported


# ==================== File Size Limit Tests ====================

class TestFileSizeLimits:
    """Tests for file size validation."""
    
    @pytest.mark.asyncio
    async def test_reject_oversized_file(self, processor):
        """Should reject files exceeding size limit."""
        large_content = b"x" * (51 * 1024 * 1024)  # 51MB
        
        result = await processor.process_file(large_content, "large.txt")
        
        assert result["success"] is False
        assert "too large" in result["error"].lower()
    
    @pytest.mark.asyncio
    async def test_accept_file_under_limit(self, processor, sample_text_content):
        """Should accept files under size limit."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_doc = Document(page_content="Test content")
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = [mock_doc]
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file(sample_text_content, "small.txt")
            
            assert result["success"] is True


# ==================== Text Processing Tests ====================

class TestTextProcessing:
    """Tests for text extraction and processing."""
    
    @pytest.mark.asyncio
    async def test_process_text_file(self, processor, sample_text_content):
        """Should successfully process text files."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_doc = Document(
                page_content="This is a sample text document.",
                metadata={"source": "test.txt"}
            )
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = [mock_doc]
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file(sample_text_content, "test.txt")
            
            assert result["success"] is True
            assert "text" in result
            assert result["filename"] == "test.txt"
    
    @pytest.mark.asyncio
    async def test_process_file_includes_word_count(self, processor, sample_text_content):
        """Should include word count in result."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_doc = Document(page_content="One two three four five")
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = [mock_doc]
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file(sample_text_content, "test.txt")
            
            assert result["success"] is True
            assert result["word_count"] == 5
    
    @pytest.mark.asyncio
    async def test_process_file_includes_char_count(self, processor, sample_text_content):
        """Should include character count in result."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_doc = Document(page_content="Hello World")
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = [mock_doc]
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file(sample_text_content, "test.txt")
            
            assert result["success"] is True
            assert result["char_count"] == 11


# ==================== Text Cleaning Tests ====================

class TestTextCleaning:
    """Tests for text cleaning functionality."""
    
    def test_clean_text_removes_excessive_newlines(self, processor):
        """Should reduce multiple newlines to double newlines."""
        text = "Line 1\n\n\n\n\nLine 2"
        
        result = processor._clean_text(text)
        
        assert "\n\n\n" not in result
        assert "Line 1\n\nLine 2" == result
    
    def test_clean_text_removes_excessive_spaces(self, processor):
        """Should reduce multiple spaces to single space."""
        text = "Word1    Word2     Word3"
        
        result = processor._clean_text(text)
        
        assert "  " not in result
        assert "Word1 Word2 Word3" == result
    
    def test_clean_text_removes_tabs(self, processor):
        """Should convert tabs to single space."""
        text = "Word1\t\t\tWord2"
        
        result = processor._clean_text(text)
        
        assert "\t" not in result
        assert "Word1 Word2" == result
    
    def test_clean_text_strips_whitespace(self, processor):
        """Should strip leading and trailing whitespace."""
        text = "   Content here   "
        
        result = processor._clean_text(text)
        
        assert result == "Content here"
    
    def test_clean_text_preserves_content(self, processor):
        """Should preserve actual content."""
        text = "Important content with numbers 123 and symbols !@#"
        
        result = processor._clean_text(text)
        
        assert "Important content" in result
        assert "123" in result
        assert "!@#" in result


# ==================== Document Combination Tests ====================

class TestDocumentCombination:
    """Tests for combining multiple documents."""
    
    def test_combine_single_document(self, processor):
        """Should return content of single document."""
        docs = [Document(page_content="Single document content")]
        
        result = processor._combine_documents(docs)
        
        assert result == "Single document content"
    
    def test_combine_multiple_documents(self, processor):
        """Should combine multiple documents with section markers."""
        docs = [
            Document(page_content="Content of page 1", metadata={"page": 1}),
            Document(page_content="Content of page 2", metadata={"page": 2}),
        ]
        
        result = processor._combine_documents(docs)
        
        assert "[Section 1]" in result
        assert "[Section 2]" in result
        assert "Content of page 1" in result
        assert "Content of page 2" in result
    
    def test_combine_documents_skips_empty(self, processor):
        """Should skip empty document content."""
        docs = [
            Document(page_content="Content"),
            Document(page_content="   "),
            Document(page_content="More content"),
        ]
        
        result = processor._combine_documents(docs)
        
        assert "Content" in result
        assert "More content" in result
    
    def test_combine_documents_separates_with_newlines(self, processor):
        """Should separate sections with double newlines."""
        docs = [
            Document(page_content="Section 1"),
            Document(page_content="Section 2"),
        ]
        
        result = processor._combine_documents(docs)
        
        assert "\n\n" in result


# ==================== Metadata Extraction Tests ====================

class TestMetadataExtraction:
    """Tests for metadata extraction from documents."""
    
    def test_extract_metadata_basic(self, processor):
        """Should extract basic metadata."""
        docs = [Document(page_content="Content", metadata={})]
        
        result = processor._extract_metadata(docs, ".txt")
        
        assert result["page_count"] == 1
        assert result["source_type"] == "TXT"
    
    def test_extract_metadata_from_pdf(self, processor):
        """Should extract PDF-specific metadata."""
        docs = [
            Document(page_content="Page 1", metadata={"total_pages": 5, "author": "John Doe"}),
            Document(page_content="Page 2", metadata={}),
        ]
        
        result = processor._extract_metadata(docs, ".pdf")
        
        assert result["page_count"] == 2
        assert result["total_pages"] == 5
        assert result["author"] == "John Doe"
    
    def test_extract_metadata_includes_title(self, processor):
        """Should include title if present in metadata."""
        docs = [Document(page_content="Content", metadata={"title": "Document Title"})]
        
        result = processor._extract_metadata(docs, ".docx")
        
        assert result["title"] == "Document Title"
    
    def test_extract_metadata_handles_none_values(self, processor):
        """Should skip None metadata values."""
        docs = [Document(page_content="Content", metadata={"author": None, "title": "Title"})]
        
        result = processor._extract_metadata(docs, ".pdf")
        
        assert "author" not in result
        assert result["title"] == "Title"


# ==================== Loader Selection Tests ====================

class TestLoaderSelection:
    """Tests for loader selection based on file type."""
    
    def test_get_loader_pdf(self, processor):
        """Should return PDF loader for .pdf files."""
        with patch("app.services.document_processor.PyPDFLoader") as mock_loader:
            mock_loader.return_value = MagicMock()
            
            loader = processor._get_loader("/tmp/test.pdf", ".pdf")
            
            assert loader is not None
            mock_loader.assert_called_once_with("/tmp/test.pdf")
    
    def test_get_loader_docx(self, processor):
        """Should return Docx2txt loader for .docx files."""
        with patch("app.services.document_processor.Docx2txtLoader") as mock_loader:
            mock_loader.return_value = MagicMock()
            
            loader = processor._get_loader("/tmp/test.docx", ".docx")
            
            assert loader is not None
            mock_loader.assert_called_once_with("/tmp/test.docx")
    
    def test_get_loader_txt(self, processor):
        """Should return Text loader for .txt files."""
        with patch("app.services.document_processor.TextLoader") as mock_loader:
            mock_loader.return_value = MagicMock()
            
            loader = processor._get_loader("/tmp/test.txt", ".txt")
            
            assert loader is not None
            mock_loader.assert_called_once()
    
    def test_get_loader_csv(self, processor):
        """Should return CSV loader for .csv files."""
        with patch("app.services.document_processor.CSVLoader") as mock_loader:
            mock_loader.return_value = MagicMock()
            
            loader = processor._get_loader("/tmp/test.csv", ".csv")
            
            assert loader is not None
            mock_loader.assert_called_once_with("/tmp/test.csv")
    
    def test_get_loader_unsupported(self, processor):
        """Should return None for unsupported file types."""
        loader = processor._get_loader("/tmp/test.xyz", ".xyz")
        
        assert loader is None
    
    def test_get_loader_fallback_to_text(self, processor):
        """Should fallback to TextLoader for text-based formats on error."""
        with patch("app.services.document_processor.UnstructuredMarkdownLoader") as mock_md_loader, \
             patch("app.services.document_processor.TextLoader") as mock_text_loader:
            mock_md_loader.side_effect = Exception("Loader error")
            mock_text_loader.return_value = MagicMock()
            
            loader = processor._get_loader("/tmp/test.md", ".md")
            
            assert loader is not None
            mock_text_loader.assert_called()


# ==================== Error Handling Tests ====================

class TestErrorHandling:
    """Tests for error handling in document processing."""
    
    @pytest.mark.asyncio
    async def test_unsupported_file_type_error(self, processor):
        """Should return error for unsupported file types."""
        result = await processor.process_file(b"content", "file.xyz")
        
        assert result["success"] is False
        assert "unsupported" in result["error"].lower()
        assert result["filename"] == "file.xyz"
    
    @pytest.mark.asyncio
    async def test_no_loader_available_error(self, processor):
        """Should handle missing loader gracefully."""
        with patch.object(processor, "_get_loader", return_value=None):
            result = await processor.process_file(b"content", "test.txt")
            
            assert result["success"] is False
            assert "no loader" in result["error"].lower()
    
    @pytest.mark.asyncio
    async def test_loader_exception_handling(self, processor):
        """Should handle loader exceptions gracefully."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.side_effect = Exception("Parse error")
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file(b"content", "test.txt")
            
            assert result["success"] is False
            assert "parse error" in result["error"].lower()


# ==================== process_file_to_documents Tests ====================

class TestProcessFileToDocuments:
    """Tests for process_file_to_documents method."""
    
    @pytest.mark.asyncio
    async def test_returns_documents(self, processor, sample_text_content):
        """Should return list of Document objects."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_docs = [
                Document(page_content="Content 1", metadata={}),
                Document(page_content="Content 2", metadata={}),
            ]
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = mock_docs
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file_to_documents(sample_text_content, "test.txt")
            
            assert len(result) == 2
            assert all(isinstance(doc, Document) for doc in result)
    
    @pytest.mark.asyncio
    async def test_raises_on_error(self, processor):
        """Should raise ValueError on processing error."""
        with pytest.raises(ValueError) as exc_info:
            await processor.process_file_to_documents(b"content", "file.xyz")
        
        assert "unsupported" in str(exc_info.value).lower()


# ==================== Singleton Tests ====================

class TestSingleton:
    """Tests for singleton pattern."""
    
    def test_get_document_processor_singleton(self):
        """get_document_processor should return singleton."""
        with patch("app.services.document_processor._processor", None):
            processor1 = get_document_processor()
            processor2 = get_document_processor()
            
            assert processor1 is processor2
    
    def test_document_processor_instance_type(self):
        """Singleton should be DocumentProcessor instance."""
        with patch("app.services.document_processor._processor", None):
            processor = get_document_processor()
            
            assert isinstance(processor, DocumentProcessor)


# ==================== Integration-style Tests ====================

class TestDocumentProcessorIntegration:
    """Integration-style tests combining multiple functionalities."""
    
    @pytest.mark.asyncio
    async def test_full_processing_pipeline(self, processor, sample_text_content):
        """Should complete full processing pipeline."""
        with patch.object(processor, "_get_loader") as mock_loader:
            mock_doc = Document(
                page_content="Full document\n\n\ncontent   here",
                metadata={"source": "test.txt", "author": "Test Author"}
            )
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = [mock_doc]
            mock_loader.return_value = mock_loader_instance
            
            result = await processor.process_file(sample_text_content, "test.txt")
            
            assert result["success"] is True
            assert result["filename"] == "test.txt"
            assert result["file_type"] == ".txt"
            assert "processed_at" in result
            assert result["word_count"] > 0
            assert result["char_count"] > 0
            assert "metadata" in result
            # Text should be cleaned
            assert "\n\n\n" not in result["text"]
            assert "  " not in result["text"]
    
    @pytest.mark.asyncio
    async def test_temp_file_cleanup(self, processor, sample_text_content):
        """Should clean up temp file after processing."""
        import os
        temp_paths = []
        
        original_unlink = os.unlink
        
        def track_unlink(path):
            temp_paths.append(path)
            return original_unlink(path)
        
        with patch.object(processor, "_get_loader") as mock_loader, \
             patch("os.unlink", side_effect=track_unlink):
            mock_doc = Document(page_content="Content")
            mock_loader_instance = MagicMock()
            mock_loader_instance.load.return_value = [mock_doc]
            mock_loader.return_value = mock_loader_instance
            
            await processor.process_file(sample_text_content, "test.txt")
            
            # Verify unlink was called (temp file cleanup)
            assert len(temp_paths) > 0
