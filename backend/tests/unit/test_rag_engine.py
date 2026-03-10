"""
Unit tests for RAG Engine service.
Tests query rewriting, document retrieval, grading, and response generation.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.documents import Document

from app.services.rag_engine import RAGEngine, get_rag_engine


# ==================== Fixtures ====================

@pytest.fixture
def mock_ollama_service():
    """Mock Ollama service for LLM operations."""
    mock = MagicMock()
    mock.generate = AsyncMock(return_value="Generated response")
    mock.generate_stream = AsyncMock()
    return mock


@pytest.fixture
def mock_vector_store_rag():
    """Mock vector store for document retrieval."""
    mock = MagicMock()
    mock.similarity_search_with_score = MagicMock(return_value=[])
    return mock


@pytest.fixture
def sample_documents():
    """Sample documents for testing."""
    return [
        (
            Document(
                page_content="This is a sample application for tracking activities.",
                metadata={"url": "https://example.com/about", "title": "About Us"}
            ),
            0.5
        ),
        (
            Document(
                page_content="Track your workouts, PRs, and progress over time.",
                metadata={"url": "https://example.com/features", "title": "Features"}
            ),
            0.8
        ),
        (
            Document(
                page_content="Coaches can program workouts for their athletes.",
                metadata={"url": "https://example.com/coaches", "title": "For Coaches"}
            ),
            1.2
        ),
    ]


@pytest.fixture
def sample_history():
    """Sample conversation history."""
    return [
        {"role": "user", "content": "What does this app do?"},
        {"role": "assistant", "content": "This app helps you track activities."},
    ]


@pytest.fixture
def rag_engine(mock_ollama_service, mock_vector_store_rag):
    """Create RAGEngine instance with mocked dependencies."""
    with patch("app.services.rag_engine.get_ollama_service", return_value=mock_ollama_service), \
         patch("app.services.rag_engine.get_vector_store", return_value=mock_vector_store_rag):
        engine = RAGEngine()
        return engine


# ==================== _rewrite_query Tests ====================

class TestRewriteQuery:
    """Tests for query rewriting functionality."""
    
    @pytest.mark.asyncio
    async def test_rewrite_query_without_history(self, rag_engine):
        """Query should be returned unchanged when no history exists."""
        query = "How do I log a workout?"
        result = await rag_engine._rewrite_query(query, [])
        assert result == query
    
    @pytest.mark.asyncio
    async def test_rewrite_query_with_history(self, rag_engine, sample_history, mock_ollama_service):
        """Query should be rewritten with conversation context."""
        mock_ollama_service.generate.return_value = "How do I log activities in the app?"
        
        query = "How do I log a workout?"
        result = await rag_engine._rewrite_query(query, sample_history)
        
        assert result == "How do I log activities in the app?"
        mock_ollama_service.generate.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_rewrite_query_handles_empty_response(self, rag_engine, sample_history, mock_ollama_service):
        """Original query should be returned if LLM returns empty."""
        mock_ollama_service.generate.return_value = "   "
        
        query = "How do I log a workout?"
        result = await rag_engine._rewrite_query(query, sample_history)
        
        assert result == query
    
    @pytest.mark.asyncio
    async def test_rewrite_query_handles_exception(self, rag_engine, sample_history, mock_ollama_service):
        """Original query should be returned if LLM throws exception."""
        mock_ollama_service.generate.side_effect = Exception("LLM error")
        
        query = "How do I log a workout?"
        result = await rag_engine._rewrite_query(query, sample_history)
        
        assert result == query
    
    @pytest.mark.asyncio
    async def test_rewrite_query_truncates_history(self, rag_engine, mock_ollama_service):
        """Only last 4 messages should be used from history."""
        mock_ollama_service.generate.return_value = "Rewritten query"
        
        long_history = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(10)
        ]
        
        await rag_engine._rewrite_query("test query", long_history)
        
        call_args = mock_ollama_service.generate.call_args
        prompt = call_args[0][0]
        assert "Message 6" in prompt
        assert "Message 9" in prompt
        assert "Message 0" not in prompt


# ==================== _retrieve_documents Tests ====================

class TestRetrieveDocuments:
    """Tests for document retrieval functionality."""
    
    @pytest.mark.asyncio
    async def test_retrieve_documents_basic(self, rag_engine, mock_vector_store_rag, sample_documents):
        """Should retrieve documents from vector store."""
        mock_vector_store_rag.similarity_search_with_score.return_value = sample_documents
        
        result = await rag_engine._retrieve_documents("What does this app do?")
        
        assert len(result) <= 5  # Default k
        mock_vector_store_rag.similarity_search_with_score.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_retrieve_documents_with_site_filter(self, rag_engine, mock_vector_store_rag, sample_documents):
        """Should filter documents by site URL."""
        mock_vector_store_rag.similarity_search_with_score.return_value = sample_documents
        
        result = await rag_engine._retrieve_documents(
            "What does this app do?",
            site_url_filter="https://example.com"
        )
        
        for doc, _ in result:
            assert doc.metadata.get("url", "").startswith("https://example.com")
    
    @pytest.mark.asyncio
    async def test_retrieve_documents_filters_different_site(self, rag_engine, mock_vector_store_rag):
        """Should filter out documents from different sites."""
        mixed_docs = [
            (Document(page_content="Content 1", metadata={"url": "https://site1.com/page1"}), 0.5),
            (Document(page_content="Content 2", metadata={"url": "https://site2.com/page2"}), 0.6),
            (Document(page_content="Content 3", metadata={"url": "https://site1.com/page3"}), 0.7),
        ]
        mock_vector_store_rag.similarity_search_with_score.return_value = mixed_docs
        
        result = await rag_engine._retrieve_documents(
            "test query",
            site_url_filter="https://site1.com"
        )
        
        assert len(result) == 2
        for doc, _ in result:
            assert "site1.com" in doc.metadata.get("url", "")
    
    @pytest.mark.asyncio
    async def test_retrieve_documents_empty_result(self, rag_engine, mock_vector_store_rag):
        """Should handle empty results gracefully."""
        mock_vector_store_rag.similarity_search_with_score.return_value = []
        
        result = await rag_engine._retrieve_documents("obscure query")
        
        assert result == []
    
    @pytest.mark.asyncio
    async def test_retrieve_documents_sorts_by_score(self, rag_engine, mock_vector_store_rag):
        """Results should be sorted by score (lower is better)."""
        unsorted_docs = [
            (Document(page_content="Doc 1", metadata={"url": "http://a.com"}), 1.5),
            (Document(page_content="Doc 2", metadata={"url": "http://b.com"}), 0.3),
            (Document(page_content="Doc 3", metadata={"url": "http://c.com"}), 0.8),
        ]
        mock_vector_store_rag.similarity_search_with_score.return_value = unsorted_docs
        
        result = await rag_engine._retrieve_documents("test query")
        
        scores = [score for _, score in result]
        assert scores == sorted(scores)


# ==================== _grade_documents Tests ====================

class TestGradeDocuments:
    """Tests for document grading functionality."""
    
    @pytest.mark.asyncio
    async def test_grade_documents_empty_list(self, rag_engine):
        """Should handle empty document list."""
        result = await rag_engine._grade_documents("test query", [])
        assert result == []
    
    @pytest.mark.asyncio
    async def test_grade_documents_high_relevance(self, rag_engine):
        """Documents with low score (high relevance) should pass."""
        docs = [
            (Document(page_content="Relevant content"), 0.5),
            (Document(page_content="Also relevant"), 1.0),
        ]
        
        result = await rag_engine._grade_documents("test query", docs)
        
        assert len(result) == 2
    
    @pytest.mark.asyncio
    async def test_grade_documents_filters_low_relevance(self, rag_engine):
        """Documents with high score and no term overlap should be filtered."""
        docs = [
            (Document(page_content="Completely unrelated content about cats"), 2.0),
        ]
        
        result = await rag_engine._grade_documents("workout tracking app", docs)
        
        assert len(result) == 0
    
    @pytest.mark.asyncio
    async def test_grade_documents_term_overlap(self, rag_engine):
        """Documents with sufficient term overlap should pass even with higher score."""
        docs = [
            (Document(page_content="Track your workout progress with our app"), 1.8),
        ]
        
        result = await rag_engine._grade_documents("workout tracking app", docs)
        
        assert len(result) == 1
    
    @pytest.mark.asyncio
    async def test_grade_documents_threshold_boundary(self, rag_engine):
        """Documents at threshold boundary should be included."""
        docs = [
            (Document(page_content="Some content"), 1.4),  # Below threshold
            (Document(page_content="Other content"), 1.5),  # At threshold
            (Document(page_content="More content"), 1.6),  # Above threshold, no overlap
        ]
        
        result = await rag_engine._grade_documents("unrelated query", docs)
        
        assert len(result) == 1  # Only first doc passes


# ==================== _build_context Tests ====================

class TestBuildContext:
    """Tests for context building functionality."""
    
    def test_build_context_empty_docs(self, rag_engine):
        """Should return empty context and sources for no documents."""
        context, sources = rag_engine._build_context([])
        
        assert context == ""
        assert sources == []
    
    def test_build_context_single_document(self, rag_engine):
        """Should build context from single document."""
        docs = [
            (
                Document(
                    page_content="This app is great for tracking activities.",
                    metadata={"url": "https://example.com/about", "title": "About"}
                ),
                0.5
            ),
        ]
        
        context, sources = rag_engine._build_context(docs)
        
        assert "This app is great" in context
        assert "[Source: About]" in context
        assert len(sources) == 1
        assert sources[0].url == "https://example.com/about"
        assert sources[0].title == "About"
    
    def test_build_context_multiple_documents(self, rag_engine, sample_documents):
        """Should build context from multiple documents."""
        context, sources = rag_engine._build_context(sample_documents)
        
        assert "---" in context  # Separator between docs
        assert len(sources) == 3
    
    def test_build_context_deduplicates_urls(self, rag_engine):
        """Should deduplicate sources by URL."""
        docs = [
            (Document(page_content="Content 1", metadata={"url": "https://example.com/page", "title": "Page"}), 0.5),
            (Document(page_content="Content 2", metadata={"url": "https://example.com/page", "title": "Page"}), 0.6),
            (Document(page_content="Content 3", metadata={"url": "https://example.com/other", "title": "Other"}), 0.7),
        ]
        
        context, sources = rag_engine._build_context(docs)
        
        assert len(sources) == 2
        urls = [s.url for s in sources]
        assert len(urls) == len(set(urls))
    
    def test_build_context_handles_missing_title(self, rag_engine):
        """Should use 'Unknown' for missing title."""
        docs = [
            (Document(page_content="Content", metadata={"url": "https://example.com"}), 0.5),
        ]
        
        context, sources = rag_engine._build_context(docs)
        
        assert "[Source: Unknown]" in context
        assert sources[0].title == "Unknown"
    
    def test_build_context_normalizes_scores(self, rag_engine):
        """Relevance scores should be normalized between 0 and 1."""
        docs = [
            (Document(page_content="Content", metadata={"url": "https://example.com", "title": "Test"}), 0.0),
            (Document(page_content="Content 2", metadata={"url": "https://example2.com", "title": "Test 2"}), 2.0),
        ]
        
        _, sources = rag_engine._build_context(docs)
        
        for source in sources:
            assert 0 <= source.relevance_score <= 1
    
    def test_build_context_content_preview_truncation(self, rag_engine):
        """Content preview should be truncated."""
        long_content = "A" * 500
        docs = [
            (Document(page_content=long_content, metadata={"url": "https://example.com", "title": "Test"}), 0.5),
        ]
        
        _, sources = rag_engine._build_context(docs)
        
        assert len(sources[0].content_preview) == 203  # 200 + "..."


# ==================== _calculate_confidence Tests ====================

class TestCalculateConfidence:
    """Tests for confidence calculation."""
    
    def test_calculate_confidence_no_docs(self, rag_engine):
        """Should return low confidence with no documents."""
        confidence = rag_engine._calculate_confidence([])
        assert confidence == 0.3
    
    def test_calculate_confidence_high_relevance(self, rag_engine):
        """Should return high confidence with highly relevant docs."""
        docs = [
            (Document(page_content="Content"), 0.0),  # Best possible score
            (Document(page_content="Content"), 0.2),
        ]
        
        confidence = rag_engine._calculate_confidence(docs)
        
        assert confidence >= 0.8
    
    def test_calculate_confidence_low_relevance(self, rag_engine):
        """Should return lower confidence with less relevant docs."""
        docs = [
            (Document(page_content="Content"), 1.8),
            (Document(page_content="Content"), 1.9),
        ]
        
        confidence = rag_engine._calculate_confidence(docs)
        
        assert confidence < 0.5
    
    def test_calculate_confidence_source_bonus(self, rag_engine):
        """More sources should increase confidence."""
        single_doc = [(Document(page_content="Content"), 0.5)]
        multiple_docs = [
            (Document(page_content="Content"), 0.5),
            (Document(page_content="Content"), 0.5),
            (Document(page_content="Content"), 0.5),
            (Document(page_content="Content"), 0.5),
        ]
        
        single_confidence = rag_engine._calculate_confidence(single_doc)
        multi_confidence = rag_engine._calculate_confidence(multiple_docs)
        
        assert multi_confidence > single_confidence
    
    def test_calculate_confidence_max_cap(self, rag_engine):
        """Confidence should never exceed 0.95."""
        perfect_docs = [
            (Document(page_content="Content"), 0.0)
            for _ in range(10)
        ]
        
        confidence = rag_engine._calculate_confidence(perfect_docs)
        
        assert confidence <= 0.95


# ==================== _generate_follow_ups Tests ====================

class TestGenerateFollowUps:
    """Tests for follow-up question generation."""
    
    @pytest.mark.asyncio
    async def test_generate_follow_ups_basic(self, rag_engine, mock_ollama_service):
        """Should generate follow-up questions."""
        mock_ollama_service.generate.return_value = """
        What other features does this app have?
        Can I track my nutrition?
        How do I connect with my coach?
        """
        
        result = await rag_engine._generate_follow_ups(
            "What does this app do?",
            "This app helps you track activities."
        )
        
        assert len(result) <= 3
        for q in result:
            assert "?" in q
    
    @pytest.mark.asyncio
    async def test_generate_follow_ups_handles_exception(self, rag_engine, mock_ollama_service):
        """Should return empty list on exception."""
        mock_ollama_service.generate.side_effect = Exception("LLM error")
        
        result = await rag_engine._generate_follow_ups("question", "answer")
        
        assert result == []
    
    @pytest.mark.asyncio
    async def test_generate_follow_ups_filters_non_questions(self, rag_engine, mock_ollama_service):
        """Should only include lines with question marks."""
        mock_ollama_service.generate.return_value = """
        This is not a question
        What is a question?
        Another non-question statement
        How does this work?
        """
        
        result = await rag_engine._generate_follow_ups("q", "a")
        
        assert len(result) == 2
        assert all("?" in q for q in result)
    
    @pytest.mark.asyncio
    async def test_generate_follow_ups_strips_prefixes(self, rag_engine, mock_ollama_service):
        """Should strip bullet points and dashes from questions."""
        mock_ollama_service.generate.return_value = """
        - What is the first question?
        • What is the second question?
        """
        
        result = await rag_engine._generate_follow_ups("q", "a")
        
        for q in result:
            assert not q.startswith("-")
            assert not q.startswith("•")
    
    @pytest.mark.asyncio
    async def test_generate_follow_ups_limits_to_three(self, rag_engine, mock_ollama_service):
        """Should return maximum 3 questions."""
        mock_ollama_service.generate.return_value = """
        Question one?
        Question two?
        Question three?
        Question four?
        Question five?
        """
        
        result = await rag_engine._generate_follow_ups("q", "a")
        
        assert len(result) == 3


# ==================== Integration-style Tests ====================

class TestRAGEngineIntegration:
    """Integration-style tests for RAGEngine."""
    
    def test_get_rag_engine_singleton(self, mock_ollama_service, mock_vector_store_rag):
        """get_rag_engine should return singleton instance."""
        with patch("app.services.rag_engine.get_ollama_service", return_value=mock_ollama_service), \
             patch("app.services.rag_engine.get_vector_store", return_value=mock_vector_store_rag), \
             patch("app.services.rag_engine._rag_engine", None):
            
            engine1 = get_rag_engine()
            engine2 = get_rag_engine()
            
            assert engine1 is engine2
    
    def test_get_system_prompt_without_site(self, rag_engine):
        """System prompt should use generic description without site name."""
        prompt = rag_engine._get_system_prompt()
        assert "this website" in prompt
    
    def test_get_system_prompt_with_site(self, rag_engine):
        """System prompt should include site name when provided."""
        prompt = rag_engine._get_system_prompt("TestSite")
        assert "TestSite" in prompt
    
    def test_build_prompt_without_history(self, rag_engine):
        """Prompt should be built correctly without history."""
        prompt = rag_engine._build_prompt(
            question="What is this?",
            context="Some context here",
            history=[]
        )
        
        assert "What is this?" in prompt
        assert "Some context here" in prompt
        assert "Previous conversation" not in prompt
    
    def test_build_prompt_with_history(self, rag_engine, sample_history):
        """Prompt should include conversation history."""
        prompt = rag_engine._build_prompt(
            question="Follow-up question?",
            context="Context text",
            history=sample_history
        )
        
        assert "Previous conversation" in prompt
        assert "What does this app do?" in prompt
