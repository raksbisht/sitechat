"""
Tests for embed API endpoints.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestEmbedScriptEndpoints:
    """Tests for embed script generation endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_embed_script_success(self, client, mock_database, sample_site):
        """Test getting embed script for a site."""
        # Seed the site using provider interface
        mock_database.seed_site(sample_site)
        
        response = await client.get(
            f"/api/embed/script/{sample_site['site_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "embed_script" in data
        assert sample_site["site_id"] in data["embed_script"]
    
    @pytest.mark.asyncio
    async def test_get_embed_script_with_sri(self, client, mock_database, sample_site):
        """Test embed script includes SRI hash when requested."""
        mock_database.seed_site(sample_site)
        
        with patch("app.routes.embed.get_widget_sri_hash", return_value="sha384-testhash123"):
            response = await client.get(
                f"/api/embed/script/{sample_site['site_id']}?include_sri=true"
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "sri_hash" in data
        assert data["sri_hash"] is not None
        assert "integrity" in data["embed_script"]
    
    @pytest.mark.asyncio
    async def test_get_embed_script_without_sri(self, client, mock_database, sample_site):
        """Test embed script without SRI hash."""
        mock_database.seed_site(sample_site)
        
        response = await client.get(
            f"/api/embed/script/{sample_site['site_id']}?include_sri=false"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "integrity" not in data["embed_script"]
    
    @pytest.mark.asyncio
    async def test_get_embed_script_not_found(self, client, mock_database):
        """Test getting embed script for non-existent site."""
        # Don't seed any site
        response = await client.get("/api/embed/script/nonexistent")
        
        assert response.status_code == 404


class TestEmbedSecurityEndpoints:
    """Tests for embed security info endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_security_info_success(self, client, mock_database, sample_site):
        """Test getting security info for a site."""
        mock_database.seed_site(sample_site)
        
        with patch("app.routes.embed.get_widget_sri_hash", return_value="sha384-testhash"):
            response = await client.get(
                f"/api/embed/security/{sample_site['site_id']}"
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "site_id" in data
        assert "sri_hash" in data
        assert "allowed_domains" in data
        assert "widget_url" in data
    
    @pytest.mark.asyncio
    async def test_get_security_info_not_found(self, client, mock_database):
        """Test getting security info for non-existent site."""
        # Don't seed any site
        response = await client.get("/api/embed/security/nonexistent")
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_security_info_includes_domain_config(self, client, mock_database):
        """Test that security info includes domain configuration."""
        site_with_domains = {
            "_id": "site_id",
            "site_id": "test123",
            "name": "Test Site with Domains",
            "url": "https://example.com",
            "config": {
                "security": {
                    "allowed_domains": ["example.com", "*.trusted.org"],
                    "enforce_domain_validation": True
                }
            }
        }
        mock_database.seed_site(site_with_domains)
        
        with patch("app.routes.embed.get_widget_sri_hash", return_value="sha384-hash"):
            response = await client.get("/api/embed/security/test123")
        
        assert response.status_code == 200
        data = response.json()
        assert data["allowed_domains"] == ["example.com", "*.trusted.org"]
        assert data["enforce_domain_validation"] == True


class TestEmbedStatusEndpoints:
    """Tests for embed status endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_site_status_success(self, client, mock_database, sample_site):
        """Test getting site status."""
        mock_database.seed_site(sample_site)
        
        # Create a crawl job using provider interface
        job_id = await mock_database.create_crawl_job(sample_site.get("url", "https://example.com"))
        await mock_database.update_crawl_job(
            job_id,
            status="completed",
            pages_crawled=10,
            pages_indexed=10
        )
        
        response = await client.get(
            f"/api/embed/status/{sample_site['site_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["site_id"] == sample_site["site_id"]
        assert "status" in data
    
    @pytest.mark.asyncio
    async def test_get_site_status_not_found(self, client, mock_database):
        """Test getting status for non-existent site."""
        # Don't seed any site
        response = await client.get("/api/embed/status/nonexistent")
        
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_get_site_status_pending_crawl(self, client, mock_database, sample_site):
        """Test status when crawl is pending."""
        mock_database.seed_site(sample_site)
        # No crawl job created - should be pending
        
        response = await client.get(
            f"/api/embed/status/{sample_site['site_id']}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"


class TestSetupChatbotEndpoint:
    """Tests for chatbot setup endpoint."""
    
    @pytest.mark.asyncio
    async def test_setup_chatbot_success(self, authenticated_client, mock_database):
        """Test successful chatbot setup."""
        # No site exists yet
        with patch("app.routes.embed.crawl_and_index_site", new_callable=AsyncMock):
            response = await authenticated_client.post(
                "/api/embed/setup",
                json={
                    "url": "https://example.com",
                    "name": "My Website",
                    "max_pages": 50
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert "site_id" in data
        assert "embed_script" in data
        assert data["status"] == "crawling"
    
    @pytest.mark.asyncio
    async def test_setup_chatbot_invalid_url(self, authenticated_client):
        """Test setup with invalid URL."""
        response = await authenticated_client.post(
            "/api/embed/setup",
            json={
                "url": "not-a-valid-url",
                "name": "My Website"
            }
        )
        
        assert response.status_code == 422
    
    @pytest.mark.asyncio
    async def test_setup_chatbot_unauthenticated(self, client):
        """Test setup without authentication."""
        response = await client.post(
            "/api/embed/setup",
            json={
                "url": "https://example.com",
                "name": "My Website"
            }
        )
        
        assert response.status_code == 401


class TestSRIHashGeneration:
    """Tests for SRI hash functionality."""
    
    def test_sri_hash_format(self):
        """Test SRI hash format."""
        from app.core.security import generate_sri_hash
        
        content = b"test content"
        sri_hash = generate_sri_hash(content)
        
        assert sri_hash.startswith("sha384-")
        # Base64 encoded SHA384 should be 64 characters
        hash_part = sri_hash.replace("sha384-", "")
        assert len(hash_part) == 64
    
    def test_sri_hash_for_file_creates_valid_hash(self, tmp_path):
        """Test SRI hash generation for files."""
        from app.core.security import generate_sri_hash_for_file
        
        test_file = tmp_path / "test.js"
        test_file.write_text("console.log('test');")
        
        sri_hash = generate_sri_hash_for_file(str(test_file))
        
        assert sri_hash.startswith("sha384-")
    
    def test_sri_hash_consistency_for_same_file(self, tmp_path):
        """Test that same file produces same hash."""
        from app.core.security import generate_sri_hash_for_file
        
        test_file = tmp_path / "test.js"
        test_file.write_text("const x = 1;")
        
        hash1 = generate_sri_hash_for_file(str(test_file))
        hash2 = generate_sri_hash_for_file(str(test_file))
        
        assert hash1 == hash2
