"""
Tests for sites API endpoints.
"""
import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSitesEndpoints:
    """Tests for sites API endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_sites_authenticated(self, authenticated_client, mock_database, sample_site):
        """Test listing sites for authenticated user."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.get("/api/sites")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    @pytest.mark.asyncio
    async def test_list_sites_unauthenticated(self, client):
        """Test listing sites without authentication."""
        response = await client.get("/api/sites")
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_site_by_id(self, authenticated_client, mock_database, sample_site):
        """Test getting a specific site by ID."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.get(
            f"/api/sites/{sample_site['site_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["site_id"] == sample_site["site_id"]
    
    @pytest.mark.asyncio
    async def test_get_site_not_found(self, authenticated_client, mock_database):
        """Test getting a non-existent site."""
        response = await authenticated_client.get(
            "/api/sites/nonexistent_site"
        )
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_get_site_access_denied(self, authenticated_client, mock_database):
        """Test accessing another user's site."""
        other_user_site = {
            "_id": "other_site",
            "site_id": "other123",
            "user_id": "different_user_id",
            "name": "Other Site",
            "url": "https://other.com"
        }
        mock_database.seed_site(other_user_site)
        
        response = await authenticated_client.get(
            "/api/sites/other123"
        )
        
        assert response.status_code == 403
    
    @pytest.mark.asyncio
    async def test_admin_can_access_any_site(self, admin_client, mock_database):
        """Test that admin can access any site."""
        other_user_site = {
            "_id": "other_site",
            "site_id": "other123",
            "user_id": "different_user_id",
            "name": "Other Site",
            "url": "https://other.com"
        }
        mock_database.seed_site(other_user_site)
        
        response = await admin_client.get(
            "/api/sites/other123"
        )
        
        assert response.status_code == 200


class TestSiteConfigEndpoints:
    """Tests for site configuration endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_site_config_public(self, client, mock_database, sample_site):
        """Test getting site config (public endpoint)."""
        mock_database.seed_site(sample_site)
        
        response = await client.get(f"/api/sites/{sample_site['site_id']}/config")
        
        assert response.status_code == 200
        data = response.json()
        assert "appearance" in data
        assert "behavior" in data
        assert "security" in data
    
    @pytest.mark.asyncio
    async def test_get_site_config_not_found(self, client, mock_database):
        """Test getting config for non-existent site."""
        response = await client.get("/api/sites/nonexistent/config")
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_update_site_config_appearance(self, authenticated_client, mock_database, sample_site):
        """Test updating site appearance config."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/config",
            json={
                "appearance": {
                    "primary_color": "#FF0000",
                    "chat_title": "New Title",
                    "welcome_message": "Welcome!",
                    "position": "bottom-left"
                }
            }
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_update_site_config_security(self, authenticated_client, mock_database, sample_site):
        """Test updating site security config."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/config",
            json={
                "security": {
                    "allowed_domains": ["example.com", "*.trusted.com"],
                    "enforce_domain_validation": True,
                    "require_referrer": True,
                    "rate_limit_per_session": 100
                }
            }
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_update_site_config_unauthenticated(self, client, sample_site):
        """Test updating config without authentication."""
        response = await client.put(
            f"/api/sites/{sample_site['site_id']}/config",
            json={"appearance": {"primary_color": "#FF0000"}}
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_reset_site_config(self, authenticated_client, mock_database, sample_site):
        """Test resetting site config to defaults."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.post(
            f"/api/sites/{sample_site['site_id']}/config/reset"
        )
        
        assert response.status_code == 200
        data = response.json()
        # Should return default config
        assert data["appearance"]["primary_color"] == "#0D9488"


class TestSiteSecurityConfig:
    """Tests specifically for security configuration."""
    
    @pytest.mark.asyncio
    async def test_security_config_domain_validation(self, authenticated_client, mock_database, sample_site):
        """Test domain whitelist configuration."""
        mock_database.seed_site(sample_site)
        
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/config",
            json={
                "security": {
                    "allowed_domains": ["example.com", "*.example.org"],
                    "enforce_domain_validation": True
                }
            }
        )
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_security_config_rate_limit_bounds(self, authenticated_client, mock_database, sample_site):
        """Test rate limit configuration with valid bounds."""
        mock_database.seed_site(sample_site)
        
        # Test minimum value
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/config",
            json={
                "security": {
                    "rate_limit_per_session": 1
                }
            }
        )
        assert response.status_code == 200
        
        # Test maximum value
        response = await authenticated_client.put(
            f"/api/sites/{sample_site['site_id']}/config",
            json={
                "security": {
                    "rate_limit_per_session": 1000
                }
            }
        )
        assert response.status_code == 200
