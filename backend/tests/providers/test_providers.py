"""
Tests for the provider factory system.
Tests LLM, Embeddings, and VectorStore provider creation and configuration.
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import Settings

# Check for optional package availability
try:
    import langchain_openai
    HAS_LANGCHAIN_OPENAI = True
except ImportError:
    HAS_LANGCHAIN_OPENAI = False

try:
    import langchain_anthropic
    HAS_LANGCHAIN_ANTHROPIC = True
except ImportError:
    HAS_LANGCHAIN_ANTHROPIC = False

try:
    import langchain_pinecone
    HAS_LANGCHAIN_PINECONE = True
except ImportError:
    HAS_LANGCHAIN_PINECONE = False

try:
    import langchain_qdrant
    HAS_LANGCHAIN_QDRANT = True
except ImportError:
    HAS_LANGCHAIN_QDRANT = False

try:
    import pinecone
    HAS_PINECONE = True
except ImportError:
    HAS_PINECONE = False

try:
    import qdrant_client
    HAS_QDRANT_CLIENT = True
except ImportError:
    HAS_QDRANT_CLIENT = False


class TestLLMFactory:
    """Tests for LLM provider factory."""
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_get_llm_openai_provider(self):
        """Test OpenAI LLM provider creation."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "openai"
        mock_settings.OPENAI_API_KEY = "test-api-key"
        mock_settings.LLM_MODEL = "gpt-4"
        mock_settings.LLM_TEMPERATURE = 0.7
        mock_settings.LLM_MAX_TOKENS = 1000
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_openai.ChatOpenAI") as mock_chat:
                from app.providers.factory import get_llm, clear_provider_cache
                clear_provider_cache()
                
                mock_chat.return_value = MagicMock()
                llm = get_llm()
                
                mock_chat.assert_called_once_with(
                    model="gpt-4",
                    api_key="test-api-key",
                    temperature=0.7,
                    max_tokens=1000
                )
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_get_llm_openai_missing_api_key(self):
        """Test OpenAI provider raises error when API key is missing."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "openai"
        mock_settings.OPENAI_API_KEY = None
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_llm, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="OPENAI_API_KEY is required"):
                get_llm()
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_ANTHROPIC, reason="langchain_anthropic not installed")
    def test_get_llm_anthropic_provider(self):
        """Test Anthropic LLM provider creation."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "anthropic"
        mock_settings.ANTHROPIC_API_KEY = "test-anthropic-key"
        mock_settings.LLM_MODEL = "claude-3-opus"
        mock_settings.LLM_TEMPERATURE = 0.5
        mock_settings.LLM_MAX_TOKENS = 2000
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_anthropic.ChatAnthropic") as mock_chat:
                from app.providers.factory import get_llm, clear_provider_cache
                clear_provider_cache()
                
                mock_chat.return_value = MagicMock()
                llm = get_llm()
                
                mock_chat.assert_called_once_with(
                    model="claude-3-opus",
                    api_key="test-anthropic-key",
                    temperature=0.5,
                    max_tokens=2000
                )
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_ANTHROPIC, reason="langchain_anthropic not installed")
    def test_get_llm_anthropic_missing_api_key(self):
        """Test Anthropic provider raises error when API key is missing."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "anthropic"
        mock_settings.ANTHROPIC_API_KEY = None
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_llm, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="ANTHROPIC_API_KEY is required"):
                get_llm()
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_get_llm_azure_provider(self):
        """Test Azure OpenAI LLM provider creation."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "azure"
        mock_settings.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
        mock_settings.AZURE_OPENAI_API_KEY = "test-azure-key"
        mock_settings.AZURE_OPENAI_DEPLOYMENT = "gpt-4-deployment"
        mock_settings.LLM_MODEL = "gpt-4"
        mock_settings.LLM_TEMPERATURE = 0.7
        mock_settings.LLM_MAX_TOKENS = 1000
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_openai.AzureChatOpenAI") as mock_chat:
                from app.providers.factory import get_llm, clear_provider_cache
                clear_provider_cache()
                
                mock_chat.return_value = MagicMock()
                llm = get_llm()
                
                mock_chat.assert_called_once_with(
                    azure_endpoint="https://test.openai.azure.com",
                    api_key="test-azure-key",
                    azure_deployment="gpt-4-deployment",
                    temperature=0.7,
                    max_tokens=1000
                )
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_get_llm_azure_missing_credentials(self):
        """Test Azure provider raises error when credentials are missing."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "azure"
        mock_settings.AZURE_OPENAI_ENDPOINT = None
        mock_settings.AZURE_OPENAI_API_KEY = None
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_llm, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required"):
                get_llm()
    
    def test_get_llm_ollama_provider(self):
        """Test Ollama LLM provider creation (default)."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "ollama"
        mock_settings.LLM_MODEL = "llama3.1:8b"
        mock_settings.OLLAMA_BASE_URL = "http://localhost:11434"
        mock_settings.LLM_TEMPERATURE = 0.7
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.chat_models.ChatOllama") as mock_chat:
                from app.providers.factory import get_llm, clear_provider_cache
                clear_provider_cache()
                
                mock_chat.return_value = MagicMock()
                llm = get_llm()
                
                mock_chat.assert_called_once_with(
                    model="llama3.1:8b",
                    base_url="http://localhost:11434",
                    temperature=0.7
                )
    
    def test_get_llm_invalid_provider(self):
        """Test that invalid provider raises ValueError."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "invalid_provider"
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_llm, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="Unknown LLM provider: invalid_provider"):
                get_llm()
    
    def test_get_llm_caching(self):
        """Test that LLM factory uses caching."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "ollama"
        mock_settings.LLM_MODEL = "llama3.1:8b"
        mock_settings.OLLAMA_BASE_URL = "http://localhost:11434"
        mock_settings.LLM_TEMPERATURE = 0.7
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.chat_models.ChatOllama") as mock_chat:
                from app.providers.factory import get_llm, clear_provider_cache
                clear_provider_cache()
                
                mock_instance = MagicMock()
                mock_chat.return_value = mock_instance
                
                llm1 = get_llm()
                llm2 = get_llm()
                
                assert llm1 is llm2
                mock_chat.assert_called_once()


class TestEmbeddingsFactory:
    """Tests for Embeddings provider factory."""
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_get_embeddings_openai_provider(self):
        """Test OpenAI embeddings provider creation."""
        mock_settings = MagicMock()
        mock_settings.EMBEDDINGS_PROVIDER = "openai"
        mock_settings.OPENAI_API_KEY = "test-api-key"
        mock_settings.EMBEDDINGS_MODEL = "text-embedding-3-small"
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_openai.OpenAIEmbeddings") as mock_embeddings:
                from app.providers.factory import get_embeddings, clear_provider_cache
                clear_provider_cache()
                
                mock_embeddings.return_value = MagicMock()
                embeddings = get_embeddings()
                
                mock_embeddings.assert_called_once_with(
                    model="text-embedding-3-small",
                    api_key="test-api-key"
                )
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_get_embeddings_openai_missing_api_key(self):
        """Test OpenAI embeddings raises error when API key is missing."""
        mock_settings = MagicMock()
        mock_settings.EMBEDDINGS_PROVIDER = "openai"
        mock_settings.OPENAI_API_KEY = None
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_embeddings, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="OPENAI_API_KEY is required for OpenAI embeddings"):
                get_embeddings()
    
    def test_get_embeddings_huggingface_provider(self):
        """Test HuggingFace embeddings provider creation (default)."""
        mock_settings = MagicMock()
        mock_settings.EMBEDDINGS_PROVIDER = "huggingface"
        mock_settings.EMBEDDINGS_MODEL = "all-MiniLM-L6-v2"
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                from app.providers.factory import get_embeddings, clear_provider_cache
                clear_provider_cache()
                
                mock_embeddings.return_value = MagicMock()
                embeddings = get_embeddings()
                
                mock_embeddings.assert_called_once_with(
                    model_name="all-MiniLM-L6-v2",
                    model_kwargs={"device": "cpu"},
                    encode_kwargs={"normalize_embeddings": True}
                )
    
    def test_get_embeddings_ollama_provider(self):
        """Test Ollama embeddings provider creation."""
        mock_settings = MagicMock()
        mock_settings.EMBEDDINGS_PROVIDER = "ollama"
        mock_settings.EMBEDDINGS_MODEL = "nomic-embed-text"
        mock_settings.OLLAMA_BASE_URL = "http://localhost:11434"
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.embeddings.OllamaEmbeddings") as mock_embeddings:
                from app.providers.factory import get_embeddings, clear_provider_cache
                clear_provider_cache()
                
                mock_embeddings.return_value = MagicMock()
                embeddings = get_embeddings()
                
                mock_embeddings.assert_called_once_with(
                    model="nomic-embed-text",
                    base_url="http://localhost:11434"
                )
    
    def test_get_embeddings_invalid_provider(self):
        """Test that invalid embeddings provider raises ValueError."""
        mock_settings = MagicMock()
        mock_settings.EMBEDDINGS_PROVIDER = "invalid_provider"
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_embeddings, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="Unknown embeddings provider: invalid_provider"):
                get_embeddings()
    
    def test_get_embeddings_caching(self):
        """Test that embeddings factory uses caching."""
        mock_settings = MagicMock()
        mock_settings.EMBEDDINGS_PROVIDER = "huggingface"
        mock_settings.EMBEDDINGS_MODEL = "all-MiniLM-L6-v2"
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                from app.providers.factory import get_embeddings, clear_provider_cache
                clear_provider_cache()
                
                mock_instance = MagicMock()
                mock_embeddings.return_value = mock_instance
                
                emb1 = get_embeddings()
                emb2 = get_embeddings()
                
                assert emb1 is emb2
                mock_embeddings.assert_called_once()


class TestVectorStoreFactory:
    """Tests for VectorStore provider factory."""
    
    def test_get_vector_store_faiss_provider_new_index(self):
        """Test FAISS vector store creation with new index."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "faiss"
        mock_settings.FAISS_INDEX_PATH = "/tmp/test_faiss"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("os.path.exists", return_value=False):
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    from app.providers.factory import get_vector_store, clear_provider_cache
                    clear_provider_cache()
                    
                    mock_faiss.from_texts.return_value = MagicMock()
                    
                    vs = get_vector_store(embeddings=mock_embeddings)
                    
                    mock_faiss.from_texts.assert_called_once_with(
                        ["initialization"],
                        mock_embeddings
                    )
    
    def test_get_vector_store_faiss_provider_existing_index(self):
        """Test FAISS vector store loading existing index."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "faiss"
        mock_settings.FAISS_INDEX_PATH = "/tmp/test_faiss"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("os.path.exists", return_value=True):
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    from app.providers.factory import get_vector_store, clear_provider_cache
                    clear_provider_cache()
                    
                    mock_faiss.load_local.return_value = MagicMock()
                    
                    vs = get_vector_store(embeddings=mock_embeddings)
                    
                    mock_faiss.load_local.assert_called_once_with(
                        "/tmp/test_faiss",
                        mock_embeddings,
                        allow_dangerous_deserialization=True
                    )
    
    def test_get_vector_store_faiss_with_site_id(self):
        """Test FAISS vector store with site_id for multi-tenant isolation."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "faiss"
        mock_settings.FAISS_INDEX_PATH = "/tmp/test_faiss"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("os.path.exists", return_value=False):
                with patch("os.path.join", return_value="/tmp/test_faiss/site123") as mock_join:
                    with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                        from app.providers.factory import get_vector_store, clear_provider_cache
                        clear_provider_cache()
                        
                        mock_faiss.from_texts.return_value = MagicMock()
                        
                        vs = get_vector_store(embeddings=mock_embeddings, site_id="site123")
                        
                        mock_join.assert_called_with("/tmp/test_faiss", "site123")
    
    def test_get_vector_store_chroma_provider(self):
        """Test Chroma vector store creation."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "chroma"
        mock_settings.CHROMA_PERSIST_DIR = "/tmp/chroma_db"
        mock_settings.CHROMA_COLLECTION_NAME = "test_collection"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.vectorstores.Chroma") as mock_chroma:
                from app.providers.factory import get_vector_store, clear_provider_cache
                clear_provider_cache()
                
                mock_chroma.return_value = MagicMock()
                
                vs = get_vector_store(embeddings=mock_embeddings)
                
                mock_chroma.assert_called_once_with(
                    persist_directory="/tmp/chroma_db",
                    collection_name="test_collection",
                    embedding_function=mock_embeddings
                )
    
    def test_get_vector_store_chroma_with_site_id(self):
        """Test Chroma vector store with site_id creates unique collection."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "chroma"
        mock_settings.CHROMA_PERSIST_DIR = "/tmp/chroma_db"
        mock_settings.CHROMA_COLLECTION_NAME = "test_collection"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.vectorstores.Chroma") as mock_chroma:
                from app.providers.factory import get_vector_store, clear_provider_cache
                clear_provider_cache()
                
                mock_chroma.return_value = MagicMock()
                
                vs = get_vector_store(embeddings=mock_embeddings, site_id="site456")
                
                mock_chroma.assert_called_once_with(
                    persist_directory="/tmp/chroma_db",
                    collection_name="test_collection_site456",
                    embedding_function=mock_embeddings
                )
    
    @pytest.mark.skipif(not HAS_PINECONE or not HAS_LANGCHAIN_PINECONE, reason="pinecone or langchain_pinecone not installed")
    def test_get_vector_store_pinecone_provider(self):
        """Test Pinecone vector store creation."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "pinecone"
        mock_settings.PINECONE_API_KEY = "test-pinecone-key"
        mock_settings.PINECONE_INDEX = "test-index"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("pinecone.Pinecone") as mock_pc:
                with patch("langchain_pinecone.PineconeVectorStore") as mock_pinecone_vs:
                    from app.providers.factory import get_vector_store, clear_provider_cache
                    clear_provider_cache()
                    
                    mock_index = MagicMock()
                    mock_pc.return_value.Index.return_value = mock_index
                    mock_pinecone_vs.return_value = MagicMock()
                    
                    vs = get_vector_store(embeddings=mock_embeddings)
                    
                    mock_pc.assert_called_once_with(api_key="test-pinecone-key")
                    mock_pinecone_vs.assert_called_once_with(
                        index=mock_index,
                        embedding=mock_embeddings,
                        namespace="default"
                    )
    
    @pytest.mark.skipif(not HAS_PINECONE or not HAS_LANGCHAIN_PINECONE, reason="pinecone or langchain_pinecone not installed")
    def test_get_vector_store_pinecone_missing_credentials(self):
        """Test Pinecone provider raises error when credentials are missing."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "pinecone"
        mock_settings.PINECONE_API_KEY = None
        mock_settings.PINECONE_INDEX = None
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_vector_store, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="PINECONE_API_KEY and PINECONE_INDEX are required"):
                get_vector_store(embeddings=mock_embeddings)
    
    @pytest.mark.skipif(not HAS_QDRANT_CLIENT or not HAS_LANGCHAIN_QDRANT, reason="qdrant_client or langchain_qdrant not installed")
    def test_get_vector_store_qdrant_provider(self):
        """Test Qdrant vector store creation."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "qdrant"
        mock_settings.QDRANT_URL = "http://localhost:6333"
        mock_settings.QDRANT_API_KEY = "test-qdrant-key"
        mock_settings.QDRANT_COLLECTION = "test_collection"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("qdrant_client.QdrantClient") as mock_client:
                with patch("langchain_qdrant.QdrantVectorStore") as mock_qdrant_vs:
                    from app.providers.factory import get_vector_store, clear_provider_cache
                    clear_provider_cache()
                    
                    mock_client_instance = MagicMock()
                    mock_client.return_value = mock_client_instance
                    mock_qdrant_vs.return_value = MagicMock()
                    
                    vs = get_vector_store(embeddings=mock_embeddings)
                    
                    mock_client.assert_called_once_with(
                        url="http://localhost:6333",
                        api_key="test-qdrant-key"
                    )
                    mock_qdrant_vs.assert_called_once_with(
                        client=mock_client_instance,
                        collection_name="test_collection",
                        embedding=mock_embeddings
                    )
    
    @pytest.mark.skipif(not HAS_QDRANT_CLIENT or not HAS_LANGCHAIN_QDRANT, reason="qdrant_client or langchain_qdrant not installed")
    def test_get_vector_store_qdrant_missing_url(self):
        """Test Qdrant provider raises error when URL is missing."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "qdrant"
        mock_settings.QDRANT_URL = None
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_vector_store, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="QDRANT_URL is required for Qdrant provider"):
                get_vector_store(embeddings=mock_embeddings)
    
    def test_get_vector_store_invalid_provider(self):
        """Test that invalid vector store provider raises ValueError."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "invalid_provider"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            from app.providers.factory import get_vector_store, clear_provider_cache
            clear_provider_cache()
            
            with pytest.raises(ValueError, match="Unknown vector store provider: invalid_provider"):
                get_vector_store(embeddings=mock_embeddings)
    
    def test_get_vector_store_uses_default_embeddings(self):
        """Test that vector store uses default embeddings when none provided."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "faiss"
        mock_settings.FAISS_INDEX_PATH = "/tmp/test_faiss"
        mock_settings.EMBEDDINGS_PROVIDER = "huggingface"
        mock_settings.EMBEDDINGS_MODEL = "all-MiniLM-L6-v2"
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("os.path.exists", return_value=False):
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                        from app.providers.factory import get_vector_store, clear_provider_cache
                        clear_provider_cache()
                        
                        mock_emb_instance = MagicMock()
                        mock_embeddings.return_value = mock_emb_instance
                        mock_faiss.from_texts.return_value = MagicMock()
                        
                        vs = get_vector_store()
                        
                        mock_embeddings.assert_called_once()


class TestProviderCacheManagement:
    """Tests for provider cache management."""
    
    def test_clear_provider_cache(self):
        """Test that clear_provider_cache clears LLM and embeddings cache."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "ollama"
        mock_settings.LLM_MODEL = "llama3.1:8b"
        mock_settings.OLLAMA_BASE_URL = "http://localhost:11434"
        mock_settings.LLM_TEMPERATURE = 0.7
        mock_settings.EMBEDDINGS_PROVIDER = "huggingface"
        mock_settings.EMBEDDINGS_MODEL = "all-MiniLM-L6-v2"
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_community.chat_models.ChatOllama") as mock_chat:
                with patch("langchain_community.embeddings.HuggingFaceEmbeddings") as mock_embeddings:
                    from app.providers.factory import get_llm, get_embeddings, clear_provider_cache
                    
                    clear_provider_cache()
                    
                    mock_chat.return_value = MagicMock(name="first_llm")
                    mock_embeddings.return_value = MagicMock(name="first_embeddings")
                    
                    llm1 = get_llm()
                    emb1 = get_embeddings()
                    
                    clear_provider_cache()
                    
                    mock_chat.return_value = MagicMock(name="second_llm")
                    mock_embeddings.return_value = MagicMock(name="second_embeddings")
                    
                    llm2 = get_llm()
                    emb2 = get_embeddings()
                    
                    assert llm1 is not llm2
                    assert emb1 is not emb2


class TestProviderConfiguration:
    """Tests for provider configuration loading."""
    
    def test_settings_default_llm_provider(self):
        """Test default LLM provider is ollama."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.LLM_PROVIDER == "ollama"
    
    def test_settings_default_embeddings_provider(self):
        """Test default embeddings provider is huggingface."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.EMBEDDINGS_PROVIDER == "huggingface"
    
    def test_settings_default_vector_store_provider(self):
        """Test default vector store provider is faiss."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.VECTOR_STORE_PROVIDER == "faiss"
    
    def test_settings_llm_temperature_default(self):
        """Test default LLM temperature."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.LLM_TEMPERATURE == 0.7
    
    def test_settings_llm_max_tokens_default(self):
        """Test default LLM max tokens."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.LLM_MAX_TOKENS == 1000
    
    def test_settings_embeddings_model_default(self):
        """Test default embeddings model."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.EMBEDDINGS_MODEL == "all-MiniLM-L6-v2"
    
    def test_settings_faiss_index_path_default(self):
        """Test default FAISS index path."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.FAISS_INDEX_PATH == "./data/faiss_index"
    
    def test_settings_chroma_collection_name_default(self):
        """Test default Chroma collection name."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.CHROMA_COLLECTION_NAME == "sitechat_docs"
    
    def test_settings_ollama_base_url_default(self):
        """Test default Ollama base URL."""
        settings = Settings(
            JWT_SECRET="test-secret-key-minimum-32-chars-long"
        )
        assert settings.OLLAMA_BASE_URL == "http://localhost:11434"


class TestProviderErrorHandling:
    """Tests for provider error handling scenarios."""
    
    def test_faiss_load_error_creates_new_index(self):
        """Test that FAISS load error falls back to creating new index."""
        mock_settings = MagicMock()
        mock_settings.VECTOR_STORE_PROVIDER = "faiss"
        mock_settings.FAISS_INDEX_PATH = "/tmp/test_faiss"
        
        mock_embeddings = MagicMock()
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("os.path.exists", return_value=True):
                with patch("langchain_community.vectorstores.FAISS") as mock_faiss:
                    from app.providers.factory import get_vector_store, clear_provider_cache
                    clear_provider_cache()
                    
                    mock_faiss.load_local.side_effect = Exception("Corrupted index")
                    mock_faiss.from_texts.return_value = MagicMock()
                    
                    vs = get_vector_store(embeddings=mock_embeddings)
                    
                    mock_faiss.from_texts.assert_called_once()
    
    @pytest.mark.skipif(not HAS_LANGCHAIN_OPENAI, reason="langchain_openai not installed")
    def test_azure_uses_llm_model_as_deployment_fallback(self):
        """Test Azure uses LLM_MODEL as deployment when AZURE_OPENAI_DEPLOYMENT is not set."""
        mock_settings = MagicMock()
        mock_settings.LLM_PROVIDER = "azure"
        mock_settings.AZURE_OPENAI_ENDPOINT = "https://test.openai.azure.com"
        mock_settings.AZURE_OPENAI_API_KEY = "test-azure-key"
        mock_settings.AZURE_OPENAI_DEPLOYMENT = None
        mock_settings.LLM_MODEL = "gpt-4"
        mock_settings.LLM_TEMPERATURE = 0.7
        mock_settings.LLM_MAX_TOKENS = 1000
        
        with patch("app.providers.factory.settings", mock_settings):
            with patch("langchain_openai.AzureChatOpenAI") as mock_chat:
                from app.providers.factory import get_llm, clear_provider_cache
                clear_provider_cache()
                
                mock_chat.return_value = MagicMock()
                llm = get_llm()
                
                mock_chat.assert_called_once()
                call_kwargs = mock_chat.call_args[1]
                assert call_kwargs["azure_deployment"] == "gpt-4"
