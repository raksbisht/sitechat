"""
Factory functions for LangChain components.
Returns the appropriate LangChain class based on configuration.
"""
import os
from functools import lru_cache
from typing import Optional
from loguru import logger

from app.config import settings


@lru_cache
def get_llm():
    """
    Factory for LLM - returns LangChain chat model based on config.
    
    Supported providers: ollama, openai, anthropic, azure
    """
    provider = settings.LLM_PROVIDER
    logger.info(f"Initializing LLM provider: {provider}")
    
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required for OpenAI provider")
        return ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS
        )
    
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is required for Anthropic provider")
        return ChatAnthropic(
            model=settings.LLM_MODEL,
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS
        )
    
    elif provider == "azure":
        from langchain_openai import AzureChatOpenAI
        if not settings.AZURE_OPENAI_ENDPOINT or not settings.AZURE_OPENAI_API_KEY:
            raise ValueError("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required")
        return AzureChatOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_deployment=settings.AZURE_OPENAI_DEPLOYMENT or settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS
        )
    
    elif provider == "ollama":
        from langchain_community.chat_models import ChatOllama
        return ChatOllama(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=settings.LLM_TEMPERATURE
        )
    
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


@lru_cache
def get_embeddings():
    """
    Factory for embeddings - returns LangChain embeddings based on config.
    
    Supported providers: huggingface, openai, ollama
    """
    provider = settings.EMBEDDINGS_PROVIDER
    logger.info(f"Initializing embeddings provider: {provider}")
    
    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required for OpenAI embeddings")
        return OpenAIEmbeddings(
            model=settings.EMBEDDINGS_MODEL,
            api_key=settings.OPENAI_API_KEY
        )
    
    elif provider == "huggingface":
        from langchain_community.embeddings import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(
            model_name=settings.EMBEDDINGS_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True}
        )
    
    elif provider == "ollama":
        from langchain_community.embeddings import OllamaEmbeddings
        return OllamaEmbeddings(
            model=settings.EMBEDDINGS_MODEL,
            base_url=settings.OLLAMA_BASE_URL
        )
    
    else:
        raise ValueError(f"Unknown embeddings provider: {provider}")


def get_vector_store(embeddings=None, site_id: Optional[str] = None):
    """
    Factory for vector store - returns LangChain vector store based on config.
    
    Supported providers: faiss, chroma, pinecone, qdrant
    
    Args:
        embeddings: Optional embeddings instance. If None, uses get_embeddings()
        site_id: Optional site ID for multi-tenant isolation
    """
    provider = settings.VECTOR_STORE_PROVIDER
    embeddings = embeddings or get_embeddings()
    logger.info(f"Initializing vector store provider: {provider}")
    
    if provider == "faiss":
        from langchain_community.vectorstores import FAISS
        
        index_path = settings.FAISS_INDEX_PATH
        if site_id:
            index_path = os.path.join(index_path, site_id)
        
        if os.path.exists(index_path):
            try:
                return FAISS.load_local(
                    index_path,
                    embeddings,
                    allow_dangerous_deserialization=True
                )
            except Exception as e:
                logger.warning(f"Could not load FAISS index: {e}, creating new one")
        
        return FAISS.from_texts(["initialization"], embeddings)
    
    elif provider == "chroma":
        from langchain_community.vectorstores import Chroma
        
        collection_name = settings.CHROMA_COLLECTION_NAME
        if site_id:
            collection_name = f"{collection_name}_{site_id}"
        
        return Chroma(
            persist_directory=settings.CHROMA_PERSIST_DIR,
            collection_name=collection_name,
            embedding_function=embeddings
        )
    
    elif provider == "pinecone":
        from langchain_pinecone import PineconeVectorStore
        from pinecone import Pinecone
        
        if not settings.PINECONE_API_KEY or not settings.PINECONE_INDEX:
            raise ValueError("PINECONE_API_KEY and PINECONE_INDEX are required")
        
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        index = pc.Index(settings.PINECONE_INDEX)
        
        namespace = site_id or "default"
        
        return PineconeVectorStore(
            index=index,
            embedding=embeddings,
            namespace=namespace
        )
    
    elif provider == "qdrant":
        from langchain_qdrant import QdrantVectorStore
        from qdrant_client import QdrantClient
        
        if not settings.QDRANT_URL:
            raise ValueError("QDRANT_URL is required for Qdrant provider")
        
        client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY
        )
        
        collection_name = settings.QDRANT_COLLECTION
        if site_id:
            collection_name = f"{collection_name}_{site_id}"
        
        return QdrantVectorStore(
            client=client,
            collection_name=collection_name,
            embedding=embeddings
        )
    
    else:
        raise ValueError(f"Unknown vector store provider: {provider}")


def clear_provider_cache():
    """Clear cached provider instances (useful for testing or config changes)."""
    get_llm.cache_clear()
    get_embeddings.cache_clear()
    logger.info("Provider cache cleared")
