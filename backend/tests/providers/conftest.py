"""
Fixtures specific to provider and database tests.

Provider tests focus on storage, vector, and database providers.
Global fixtures from the parent conftest.py are automatically available.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime


@pytest.fixture
def mock_connection_string():
    """Mock database connection string."""
    return "mongodb://localhost:27017/test_db"


@pytest.fixture
def mock_storage_provider():
    """Mock storage provider for testing."""
    mock = MagicMock()
    mock.upload = AsyncMock(return_value="https://storage.example.com/file.pdf")
    mock.download = AsyncMock(return_value=b"file content")
    mock.delete = AsyncMock(return_value=True)
    return mock


@pytest.fixture
def mock_mongodb():
    """
    Override parent mock_mongodb for provider tests.
    
    Provider tests need MagicMock with db attribute for testing
    MongoDB-specific functionality like collections.
    """
    mock_db = MagicMock()
    mock_db.db = MagicMock()
    
    # Mock collections with AsyncMock for async methods
    for collection_name in ['users', 'sites', 'conversations', 'crawl_jobs', 
                            'triggers', 'handoffs', 'handoff_sessions', 
                            'platform_settings', 'pages', 'documents',
                            'long_term_memory', 'trigger_events']:
        collection = MagicMock()
        collection.find_one = AsyncMock(return_value=None)
        collection.find = MagicMock()
        collection.find.return_value.to_list = AsyncMock(return_value=[])
        collection.find.return_value.sort = MagicMock(return_value=collection.find.return_value)
        collection.find.return_value.skip = MagicMock(return_value=collection.find.return_value)
        collection.find.return_value.limit = MagicMock(return_value=collection.find.return_value)
        collection.insert_one = AsyncMock()
        collection.update_one = AsyncMock()
        collection.delete_one = AsyncMock()
        collection.delete_many = AsyncMock()
        collection.count_documents = AsyncMock(return_value=0)
        collection.aggregate = MagicMock()
        collection.aggregate.return_value.to_list = AsyncMock(return_value=[])
        setattr(mock_db.db, collection_name, collection)
    
    return mock_db


@pytest.fixture
def sample_site():
    """Sample site data for provider tests."""
    return {
        "site_id": "test_site_123",
        "name": "Test Site",
        "url": "https://example.com",
        "status": "active",
        "user_id": "test_user_id_123",
        "config": {},
        "triggers": [],
        "global_cooldown_ms": 30000,
        "handoff_config": {
            "enabled": True,
            "confidence_threshold": 0.3,
            "business_hours": {
                "enabled": False,
                "timezone": "UTC"
            }
        },
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }


@pytest.fixture
def sample_user():
    """Sample user data for provider tests."""
    return {
        "_id": "test_user_id_123",
        "user_id": "test_user_id_123",
        "email": "user@example.com",
        "name": "Test User",
        "role": "user",
        "password_hash": "$2b$12$test_hash",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
