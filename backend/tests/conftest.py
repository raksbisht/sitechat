"""
Pytest configuration and fixtures for SiteChat tests.

This module provides database-agnostic fixtures using the Provider Pattern.
Tests mock at the provider interface level, not the database implementation.
"""
import os
import sys
import asyncio
from datetime import datetime
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import Settings
from app.providers.database import BaseDatabaseProvider, MockDatabaseProvider


# ==================== Fixtures ====================

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_settings() -> Settings:
    """Create test settings with safe defaults."""
    return Settings(
        APP_NAME="SiteChat-Test",
        DEBUG=True,
        ENVIRONMENT="development",
        JWT_SECRET="test-secret-key-for-testing-only",
        ADMIN_EMAIL="test@example.com",
        ADMIN_PASSWORD="TestPass123!",
        MONGODB_URL="mongodb://localhost:27017",
        MONGODB_DB_NAME="sitechat_test",
        CORS_ORIGINS="http://localhost:3000,http://localhost:8000",
    )


@pytest.fixture
def mock_database() -> MockDatabaseProvider:
    """
    Provider-based mock database for testing.
    
    Uses MockDatabaseProvider which implements BaseDatabaseProvider interface.
    Tests against the abstract interface, not MongoDB-specific methods.
    """
    db = MockDatabaseProvider()
    return db


@pytest.fixture
def mock_mongodb(mock_database: MockDatabaseProvider) -> MockDatabaseProvider:
    """Alias for backward compatibility with existing tests."""
    return mock_database


@pytest.fixture
def mock_vector_store():
    """Mock vector store for testing."""
    mock_vs = MagicMock()
    mock_vs.search = AsyncMock(return_value=[])
    mock_vs.add_documents = AsyncMock()
    mock_vs.delete_documents = AsyncMock()
    mock_vs.similarity_search = AsyncMock(return_value=[])
    return mock_vs


@pytest.fixture
async def app(mock_database: MockDatabaseProvider, mock_vector_store) -> AsyncGenerator[FastAPI, None]:
    """Create a test FastAPI application with mocked dependencies."""
    # Create async function that returns mock_database
    async def get_mock_db():
        return mock_database
    
    # Patch database at all import sites including routes
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
        yield fastapi_app


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ==================== Sample Data Fixtures ====================

@pytest.fixture
def sample_user() -> dict:
    """Sample user data for testing."""
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


@pytest.fixture
def sample_admin() -> dict:
    """Sample admin user data for testing."""
    return {
        "_id": "admin_user_id_456",
        "user_id": "admin_user_id_456",
        "email": "admin@example.com",
        "name": "Admin User",
        "role": "admin",
        "password_hash": "$2b$12$test_hash",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }


@pytest.fixture
def sample_site() -> dict:
    """Sample site data for testing."""
    return {
        "site_id": "test_site_123",
        "name": "Test Site",
        "url": "https://example.com",
        "status": "active",
        "user_id": "test_user_id_123",
        "config": {
            "appearance": {
                "theme_color": "#007bff",
                "position": "bottom-right"
            },
            "behavior": {
                "welcome_message": "Hello! How can I help you?"
            }
        },
        "triggers": [],
        "global_cooldown_ms": 30000,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }


@pytest.fixture
def sample_conversation() -> dict:
    """Sample conversation data for testing."""
    return {
        "session_id": "test_session_123",
        "site_id": "test_site_123",
        "messages": [
            {
                "role": "user",
                "content": "Hello, I need help",
                "timestamp": datetime.utcnow(),
                "message_id": "msg_1"
            },
            {
                "role": "assistant",
                "content": "Hi! How can I assist you today?",
                "timestamp": datetime.utcnow(),
                "message_id": "msg_2"
            }
        ],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }


@pytest.fixture
def sample_trigger() -> dict:
    """Sample trigger data for testing."""
    return {
        "id": "trigger_123",
        "name": "Welcome Trigger",
        "type": "time_delay",
        "enabled": True,
        "priority": 10,
        "message": "Welcome! Need any help?",
        "conditions": {
            "delay_seconds": 30,
            "page_match": "*"
        },
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }


@pytest.fixture
def sample_handoff() -> dict:
    """Sample handoff session data for testing."""
    return {
        "handoff_id": "handoff_123",
        "session_id": "test_session_123",
        "site_id": "test_site_123",
        "status": "pending",
        "reason": "user_request",
        "visitor_email": "visitor@example.com",
        "visitor_name": "John Doe",
        "ai_summary": "User asked about pricing",
        "ai_conversation": [],
        "messages": [],
        "assigned_agent_id": None,
        "assigned_agent_name": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "resolved_at": None
    }


# ==================== Auth Fixtures ====================

@pytest.fixture
def auth_headers(sample_user: dict) -> dict:
    """Generate auth headers with a test JWT token."""
    from app.services.auth import create_access_token
    token = create_access_token({"sub": sample_user["email"]})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_auth_headers(sample_admin: dict) -> dict:
    """Generate admin auth headers with a test JWT token."""
    from app.services.auth import create_access_token
    token = create_access_token({"sub": sample_admin["email"]})
    return {"Authorization": f"Bearer {token}"}


# ==================== Seeded Database Fixtures ====================

@pytest.fixture
def seeded_database(mock_database: MockDatabaseProvider, sample_user, sample_admin, sample_site) -> MockDatabaseProvider:
    """
    Database pre-seeded with test data.
    
    Includes:
    - A regular user
    - An admin user
    - A sample site owned by the regular user
    """
    mock_database.seed_user(sample_user)
    mock_database.seed_user(sample_admin)
    mock_database.seed_site(sample_site)
    return mock_database
