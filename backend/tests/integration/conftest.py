"""
Fixtures specific to integration/API tests.

Integration tests focus on API endpoints using the provider-based mock database.
Global fixtures from the parent conftest.py are automatically available.
"""
import pytest
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.providers.database import MockDatabaseProvider


@pytest.fixture
def api_base_url():
    """Base URL for API testing."""
    return "http://test"


@pytest.fixture
def valid_site_id():
    """A valid site ID for testing API endpoints."""
    return "test_site_123"


@pytest.fixture
def valid_conversation_id():
    """A valid conversation ID for testing."""
    return "conv_test_123"


@pytest.fixture
def mock_user():
    """Mock user returned by auth dependency."""
    return {
        "_id": "test_user_id_123",
        "user_id": "test_user_id_123",
        "email": "user@example.com",
        "name": "Test User",
        "role": "user",
        "created_at": "2024-01-01T00:00:00Z"
    }


@pytest.fixture
def mock_admin_user():
    """Mock admin user returned by auth dependency."""
    return {
        "_id": "admin_user_id_123",
        "user_id": "admin_user_id_123",
        "email": "admin@example.com",
        "name": "Admin User",
        "role": "admin",
        "created_at": "2024-01-01T00:00:00Z"
    }


@pytest.fixture
def sample_triggers_data():
    """Sample triggers data for testing."""
    return {
        "triggers": [
            {"id": "t1", "name": "Welcome", "enabled": True, "priority": 10, "message": "Hello!"},
            {"id": "t2", "name": "Help", "enabled": True, "priority": 5, "message": "Need help?"},
        ],
        "global_cooldown_ms": 30000
    }


@pytest.fixture
async def authenticated_app(
    mock_database: MockDatabaseProvider,
    mock_vector_store,
    mock_user,
    sample_user,
    sample_site
) -> AsyncGenerator[FastAPI, None]:
    """Create a test FastAPI app with auth dependencies overridden."""
    # Seed the database with test data
    mock_database.seed_user(sample_user)
    mock_database.seed_site(sample_site)
    
    # Create async function that returns the mock database
    async def get_mock_db():
        return mock_database
    
    # Patch database at all import sites
    with patch("app.database.get_mongodb", get_mock_db), \
         patch("app.database.mongodb.get_mongodb", get_mock_db), \
         patch("app.routes.sites.get_mongodb", get_mock_db), \
         patch("app.routes.auth.get_mongodb", get_mock_db), \
         patch("app.routes.embed.get_mongodb", get_mock_db), \
         patch("app.routes.chat.get_mongodb", get_mock_db), \
         patch("app.routes.conversations.get_mongodb", get_mock_db), \
         patch("app.routes.handoff.get_mongodb", get_mock_db), \
         patch("app.routes.triggers.get_mongodb", get_mock_db), \
         patch("app.routes.crawl.get_mongodb", get_mock_db), \
         patch("app.routes.analytics.get_mongodb", get_mock_db), \
         patch("app.database.vector_store.get_vector_store", AsyncMock(return_value=mock_vector_store)):
        from app.main import app as fastapi_app
        from app.routes.auth import require_auth, require_admin
        
        # Override auth dependencies to return mock user
        async def mock_require_auth():
            return mock_user
        
        async def mock_require_admin():
            return mock_user
        
        fastapi_app.dependency_overrides[require_auth] = mock_require_auth
        fastapi_app.dependency_overrides[require_admin] = mock_require_admin
        
        yield fastapi_app
        
        # Clean up overrides
        fastapi_app.dependency_overrides.clear()


@pytest.fixture
async def admin_authenticated_app(
    mock_database: MockDatabaseProvider,
    mock_vector_store,
    mock_admin_user,
    sample_admin,
    sample_site
) -> AsyncGenerator[FastAPI, None]:
    """Create a test FastAPI app with admin auth dependencies overridden."""
    # Seed the database with test data
    mock_database.seed_user(sample_admin)
    mock_database.seed_site(sample_site)
    
    # Create async function that returns the mock database
    async def get_mock_db():
        return mock_database
    
    # Patch database at all import sites
    with patch("app.database.get_mongodb", get_mock_db), \
         patch("app.database.mongodb.get_mongodb", get_mock_db), \
         patch("app.routes.sites.get_mongodb", get_mock_db), \
         patch("app.routes.auth.get_mongodb", get_mock_db), \
         patch("app.routes.embed.get_mongodb", get_mock_db), \
         patch("app.routes.chat.get_mongodb", get_mock_db), \
         patch("app.routes.conversations.get_mongodb", get_mock_db), \
         patch("app.routes.handoff.get_mongodb", get_mock_db), \
         patch("app.routes.triggers.get_mongodb", get_mock_db), \
         patch("app.routes.crawl.get_mongodb", get_mock_db), \
         patch("app.routes.analytics.get_mongodb", get_mock_db), \
         patch("app.database.vector_store.get_vector_store", AsyncMock(return_value=mock_vector_store)):
        from app.main import app as fastapi_app
        from app.routes.auth import require_auth, require_admin
        
        # Override auth dependencies to return admin user
        async def mock_require_auth():
            return mock_admin_user
        
        async def mock_require_admin():
            return mock_admin_user
        
        fastapi_app.dependency_overrides[require_auth] = mock_require_auth
        fastapi_app.dependency_overrides[require_admin] = mock_require_admin
        
        yield fastapi_app
        
        # Clean up overrides
        fastapi_app.dependency_overrides.clear()


@pytest.fixture
async def authenticated_client(authenticated_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with mocked authentication."""
    transport = ASGITransport(app=authenticated_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def admin_client(admin_authenticated_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with mocked admin authentication."""
    transport = ASGITransport(app=admin_authenticated_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
