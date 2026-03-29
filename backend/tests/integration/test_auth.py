"""
Tests for authentication endpoints and services.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.auth import (
    AuthService,
    get_password_hash,
    verify_password,
    create_access_token,
    decode_token,
)
from app.config import settings


class TestPasswordHashing:
    """Tests for password hashing functions."""
    
    def test_get_password_hash_returns_hash(self):
        """Test that password hashing returns a hash."""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        assert hashed != password
        assert len(hashed) > 20
    
    def test_get_password_hash_different_for_same_input(self):
        """Test that same password produces different hashes (salted)."""
        password = "SecurePassword123!"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        
        # bcrypt uses random salt, so hashes should differ
        assert hash1 != hash2
    
    def test_verify_password_correct(self):
        """Test password verification with correct password."""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        assert verify_password(password, hashed) == True
    
    def test_verify_password_incorrect(self):
        """Test password verification with incorrect password."""
        password = "SecurePassword123!"
        hashed = get_password_hash(password)
        
        assert verify_password("WrongPassword!", hashed) == False
    
    def test_verify_password_empty(self):
        """Test password verification with empty password."""
        hashed = get_password_hash("SecurePassword123!")
        
        assert verify_password("", hashed) == False


class TestJWTTokens:
    """Tests for JWT token creation and validation."""
    
    def test_create_access_token(self):
        """Test JWT token creation."""
        data = {"sub": "user@example.com", "user_id": "123"}
        token = create_access_token(data)
        
        assert token is not None
        assert len(token) > 50
        assert token.count(".") == 2  # JWT has 3 parts
    
    def test_decode_token_valid(self):
        """Test decoding a valid JWT token."""
        data = {"sub": "user@example.com", "user_id": "123"}
        token = create_access_token(data)
        
        decoded = decode_token(token)
        
        assert decoded is not None
        assert decoded.user_id == "user@example.com"
    
    def test_decode_token_invalid(self):
        """Test decoding an invalid JWT token."""
        decoded = decode_token("invalid.token.here")
        
        assert decoded is None
    
    def test_decode_token_expired(self):
        """Test decoding an expired JWT token."""
        data = {"sub": "user@example.com"}
        # Create token with negative expiration
        token = create_access_token(data, expires_delta=timedelta(seconds=-10))
        
        decoded = decode_token(token)
        
        assert decoded is None
    
    def test_token_contains_expiration(self):
        """Test that token contains expiration claim."""
        data = {"sub": "user@example.com"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        assert decoded is not None


class TestAuthEndpoints:
    """Tests for authentication API endpoints."""
    
    @pytest.mark.asyncio
    async def test_login_success(self, client, mock_database):
        """Test successful login."""
        # Seed the user using provider interface
        hashed_password = get_password_hash("ValidPass123!")
        mock_database.seed_user({
            "user_id": "user123",
            "email": "user@example.com",
            "name": "Test User",
            "password_hash": hashed_password,
            "role": "user",
            "created_at": datetime.utcnow()
        })
        
        response = await client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "ValidPass123!"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data.get("user", {}).get("must_change_password") is False
    
    @pytest.mark.asyncio
    async def test_login_invalid_email(self, client, mock_database):
        """Test login with non-existent email."""
        # Don't seed any user
        response = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "SomePass123!"}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_login_invalid_password(self, client, mock_database):
        """Test login with wrong password."""
        # Seed user with correct password
        hashed_password = get_password_hash("CorrectPass123!")
        mock_database.seed_user({
            "user_id": "user123",
            "email": "user@example.com",
            "name": "Test User",
            "password_hash": hashed_password,
            "role": "user",
            "created_at": datetime.utcnow()
        })
        
        response = await client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "WrongPass123!"}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_login_missing_fields(self, client):
        """Test login with missing fields."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "user@example.com"}  # Missing password
        )
        
        assert response.status_code == 422  # Validation error
    
    @pytest.mark.asyncio
    async def test_me_endpoint_authenticated(self, authenticated_client, mock_user):
        """Test /me endpoint with valid authentication."""
        response = await authenticated_client.get("/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == mock_user["email"]
    
    @pytest.mark.asyncio
    async def test_me_endpoint_unauthenticated(self, client):
        """Test /me endpoint without authentication."""
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_me_endpoint_invalid_token(self, client):
        """Test /me endpoint with invalid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_admin_must_change_password_allows_me_blocks_sites_until_reset(self, client, mock_database):
        """Bootstrap admin flow: dashboard APIs blocked until PATCH /me sets a new password."""
        hashed_password = get_password_hash("BootstrapPass123!")
        mock_database.seed_user({
            "user_id": "admin_mc_1",
            "email": "admin-mc@example.com",
            "name": "Admin",
            "password_hash": hashed_password,
            "role": "admin",
            "must_change_password": True,
            "created_at": datetime.utcnow(),
        })

        login = await client.post(
            "/api/auth/login",
            json={"email": "admin-mc@example.com", "password": "BootstrapPass123!"},
        )
        assert login.status_code == 200
        body = login.json()
        assert body["user"]["must_change_password"] is True
        token = body["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200

        blocked = await client.get("/api/sites", headers=headers)
        assert blocked.status_code == 403
        assert blocked.json()["detail"]["code"] == "must_change_password"

        patch = await client.patch(
            "/api/auth/me",
            headers={**headers, "Content-Type": "application/json"},
            json={"new_password": "NewPassword123!"},
        )
        assert patch.status_code == 200
        assert patch.json()["must_change_password"] is False

        allowed = await client.get("/api/sites", headers=headers)
        assert allowed.status_code == 200

    @pytest.mark.asyncio
    async def test_ensure_admin_migrates_legacy_admin_must_change_password(self, mock_database):
        """Admins without must_change_password get the flag on startup (first-time setup)."""
        hashed_password = get_password_hash("LegacyPass123!")
        mock_database.seed_user({
            "user_id": "legacy_admin",
            "email": settings.ADMIN_EMAIL,
            "name": "Admin",
            "password_hash": hashed_password,
            "role": "admin",
            "created_at": datetime.utcnow(),
        })
        auth = AuthService(mock_database)
        await auth.ensure_admin_exists()
        u = await mock_database.get_user_by_email(settings.ADMIN_EMAIL)
        assert u.get("must_change_password") is True

    @pytest.mark.asyncio
    async def test_ensure_admin_keeps_explicit_must_change_false(self, mock_database):
        """Do not override admins that already completed setup (must_change_password: false)."""
        hashed_password = get_password_hash("Pass123!")
        mock_database.seed_user({
            "user_id": "admin_ok",
            "email": settings.ADMIN_EMAIL,
            "name": "Admin",
            "password_hash": hashed_password,
            "role": "admin",
            "must_change_password": False,
            "created_at": datetime.utcnow(),
        })
        auth = AuthService(mock_database)
        await auth.ensure_admin_exists()
        u = await mock_database.get_user_by_email(settings.ADMIN_EMAIL)
        assert u.get("must_change_password") is False


class TestAdminCreateUser:
    """Tests for POST /api/auth/users — admin creates a site-owner account."""

    @pytest.mark.asyncio
    async def test_admin_create_user_success(self, admin_client, mock_database):
        """Admin can create a new site-owner account."""
        response = await admin_client.post(
            "/api/auth/users",
            json={"email": "newowner@example.com", "password": "StrongPass123!", "name": "New Owner"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newowner@example.com"
        assert data["role"] == "user"

    @pytest.mark.asyncio
    async def test_admin_create_user_duplicate_email(self, admin_client, mock_database):
        """Creating a user with an already-registered email returns 400."""
        mock_database.seed_user({
            "user_id": "existing_123",
            "email": "duplicate@example.com",
            "name": "Existing",
            "password_hash": get_password_hash("Pass123!"),
            "role": "user",
            "created_at": datetime.utcnow(),
        })

        response = await admin_client.post(
            "/api/auth/users",
            json={"email": "duplicate@example.com", "password": "StrongPass123!", "name": "Dup"},
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_admin_create_user_weak_password(self, admin_client):
        """Creating a user with a weak password returns 422."""
        response = await admin_client.post(
            "/api/auth/users",
            json={"email": "weak@example.com", "password": "short", "name": "Weak"},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_non_admin_create_user_forbidden(self, client, mock_database):
        """Non-admin cannot create user accounts via POST /api/auth/users."""
        uid = mock_database.seed_user({
            "user_id": "regular_nonadmin",
            "email": "nonadmin@example.com",
            "name": "Regular",
            "password_hash": get_password_hash("Pass123!"),
            "role": "user",
            "created_at": datetime.utcnow(),
        })
        token = create_access_token({"sub": uid, "email": "nonadmin@example.com", "role": "user"})
        response = await client.post(
            "/api/auth/users",
            json={"email": "new@example.com", "password": "StrongPass123!", "name": "New"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_unauthenticated_create_user_forbidden(self, client):
        """Unauthenticated request to create user returns 401."""
        response = await client.post(
            "/api/auth/users",
            json={"email": "new@example.com", "password": "StrongPass123!", "name": "New"},
        )

        assert response.status_code == 401


class TestDeleteUserWithTransfer:
    """Tests for DELETE /api/auth/users/{id} — ownership transfer on delete."""

    @pytest.mark.asyncio
    async def test_delete_user_transfers_sites_and_agents(self, admin_client, mock_database, mock_admin_user):
        """Deleting a user transfers their sites and agents to the admin."""
        uid = mock_database.seed_user({
            "user_id": "user_to_delete",
            "email": "tobedeleted@example.com",
            "name": "Delete Me",
            "password_hash": get_password_hash("Pass123!"),
            "role": "user",
            "created_at": datetime.utcnow(),
        })

        response = await admin_client.delete(f"/api/auth/users/{uid}")

        assert response.status_code == 200
        assert "transferred" in response.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_delete_nonexistent_user(self, admin_client):
        """Deleting a user that does not exist returns 404."""
        response = await admin_client.delete("/api/auth/users/nonexistent_id")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_admin_cannot_delete_self(self, admin_client, mock_admin_user):
        """Admin cannot delete their own account."""
        response = await admin_client.delete(f"/api/auth/users/{mock_admin_user['_id']}")

        assert response.status_code == 400


class TestAgentsAccessibleByUser:
    """Tests verifying site-owner (user role) can manage agents."""

    @pytest.mark.asyncio
    async def test_user_can_create_agent(self, authenticated_client, mock_database, mock_user):
        """A site-owner (user role) can create a support agent."""
        response = await authenticated_client.post(
            "/api/auth/agents",
            json={
                "email": "agent@example.com",
                "name": "Support Agent",
                "password": "AgentPass123!",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "agent"

    @pytest.mark.asyncio
    async def test_user_can_list_agents(self, authenticated_client, mock_database, mock_user):
        """A site-owner (user role) can list their agents."""
        response = await authenticated_client.get("/api/auth/agents")

        assert response.status_code == 200
        assert isinstance(response.json(), list)
