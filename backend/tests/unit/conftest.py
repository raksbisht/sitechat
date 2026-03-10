"""
Fixtures specific to unit tests.

Unit tests focus on isolated business logic without external dependencies.
Global fixtures from the parent conftest.py are automatically available.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock


@pytest.fixture
def mock_embeddings():
    """Mock embeddings generator for unit tests."""
    mock = MagicMock()
    mock.embed_documents = AsyncMock(return_value=[[0.1] * 384])
    mock.embed_query = AsyncMock(return_value=[0.1] * 384)
    return mock


@pytest.fixture
def sample_document():
    """Sample document for document processing tests."""
    return {
        "content": "This is sample content for testing.",
        "metadata": {
            "source": "https://example.com/page",
            "title": "Test Page",
            "site_id": "test_site_123"
        }
    }
