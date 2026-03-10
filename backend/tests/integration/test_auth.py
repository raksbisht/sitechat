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
    get_password_hash,
    verify_password,
    create_access_token,
    decode_token,
)


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
