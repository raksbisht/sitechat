"""
Unit tests for security utilities and middleware.
"""
import pytest
from unittest.mock import MagicMock, patch

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import (
    sanitize_html,
    sanitize_input,
    validate_email,
    validate_password,
    generate_secure_token,
    generate_secure_secret,
    generate_sri_hash,
    generate_sri_hash_for_file,
    extract_domain_from_url,
    match_domain_pattern,
    validate_widget_domain,
    check_security_configuration,
)


class TestInputSanitization:
    """Tests for input sanitization functions."""
    
    def test_sanitize_html_escapes_script_tags(self):
        """Test that script tags are HTML-escaped."""
        input_text = '<script>alert("xss")</script>Hello'
        result = sanitize_html(input_text)
        # html.escape converts < to &lt; and > to &gt;
        assert "<script>" not in result
        assert "&lt;script&gt;" in result
        assert "Hello" in result
    
    def test_sanitize_html_escapes_onclick(self):
        """Test that onclick handlers are HTML-escaped."""
        input_text = '<div onclick="malicious()">Click me</div>'
        result = sanitize_html(input_text)
        # The < and > are escaped, making it safe
        assert "<div" not in result
        assert "&lt;div" in result
    
    def test_sanitize_html_preserves_safe_content(self):
        """Test that safe content is preserved."""
        input_text = "Hello, this is safe text!"
        result = sanitize_html(input_text)
        assert result == input_text
    
    def test_sanitize_input_strips_whitespace(self):
        """Test that leading/trailing whitespace is stripped."""
        result = sanitize_input("  hello world  ")
        assert result == "hello world"
    
    def test_sanitize_input_limits_length(self):
        """Test that input is truncated to max length."""
        long_input = "a" * 2000
        result = sanitize_input(long_input, max_length=100)
        assert len(result) == 100
    
    def test_sanitize_input_removes_null_bytes(self):
        """Test that null bytes are removed."""
        result = sanitize_input("hello\x00world")
        assert "\x00" not in result


class TestEmailValidation:
    """Tests for email validation."""
    
    def test_valid_email(self):
        """Test valid email addresses."""
        assert validate_email("user@example.com") == True
        assert validate_email("user.name@example.co.uk") == True
        assert validate_email("user+tag@example.com") == True
    
    def test_invalid_email_no_at(self):
        """Test email without @ symbol."""
        assert validate_email("userexample.com") == False
    
    def test_invalid_email_no_domain(self):
        """Test email without domain."""
        assert validate_email("user@") == False
    
    def test_invalid_email_spaces(self):
        """Test email with spaces."""
        assert validate_email("user @example.com") == False
    
    def test_invalid_email_empty(self):
        """Test empty email."""
        assert validate_email("") == False


class TestPasswordValidation:
    """Tests for password validation."""
    
    def test_valid_password(self):
        """Test valid passwords."""
        is_valid, _ = validate_password("SecurePass123!")
        assert is_valid == True
    
    def test_password_too_short(self):
        """Test password that's too short."""
        is_valid, error = validate_password("Ab1!")
        assert is_valid == False
        assert "8 characters" in error
    
    def test_password_no_uppercase(self):
        """Test password without uppercase."""
        is_valid, error = validate_password("securepass123!")
        assert is_valid == False
        assert "uppercase" in error.lower()
    
    def test_password_no_lowercase(self):
        """Test password without lowercase."""
        is_valid, error = validate_password("SECUREPASS123!")
        assert is_valid == False
        assert "lowercase" in error.lower()
    
    def test_password_no_digit(self):
        """Test password without digit."""
        is_valid, error = validate_password("SecurePass!")
        assert is_valid == False
        assert "digit" in error.lower() or "number" in error.lower()
    
    def test_weak_common_password(self):
        """Test commonly used weak passwords."""
        # "password1" is in the weak_passwords list (check is case-insensitive)
        is_valid, error = validate_password("Password1")
        assert is_valid == False
        assert "common" in error.lower() or "weak" in error.lower()


class TestTokenGeneration:
    """Tests for secure token generation."""
    
    def test_generate_secure_token_length(self):
        """Test that token has correct length."""
        token = generate_secure_token(32)
        # token_urlsafe(n) produces ~4/3 * n characters (base64url encoding)
        # For 32 bytes: ceil(32 * 4/3) = 43 characters
        assert len(token) == 43
    
    def test_generate_secure_token_uniqueness(self):
        """Test that tokens are unique."""
        tokens = [generate_secure_token() for _ in range(100)]
        assert len(set(tokens)) == 100
    
    def test_generate_secure_secret_length(self):
        """Test that secret has correct length."""
        secret = generate_secure_secret(64)
        assert len(secret) >= 64


class TestSRIHash:
    """Tests for Subresource Integrity hash generation."""
    
    def test_generate_sri_hash_sha384(self):
        """Test SRI hash generation with SHA384."""
        content = b"test content for hashing"
        sri_hash = generate_sri_hash(content, "sha384")
        assert sri_hash.startswith("sha384-")
        assert len(sri_hash) > 10
    
    def test_generate_sri_hash_consistency(self):
        """Test that same content produces same hash."""
        content = b"consistent content"
        hash1 = generate_sri_hash(content)
        hash2 = generate_sri_hash(content)
        assert hash1 == hash2
    
    def test_generate_sri_hash_different_content(self):
        """Test that different content produces different hash."""
        hash1 = generate_sri_hash(b"content one")
        hash2 = generate_sri_hash(b"content two")
        assert hash1 != hash2
    
    def test_generate_sri_hash_for_file(self, tmp_path):
        """Test SRI hash generation for a file."""
        test_file = tmp_path / "test.js"
        test_file.write_text("console.log('test');")
        
        sri_hash = generate_sri_hash_for_file(str(test_file))
        assert sri_hash.startswith("sha384-")


class TestDomainValidation:
    """Tests for domain extraction and validation."""
    
    def test_extract_domain_from_url_simple(self):
        """Test domain extraction from simple URL."""
        domain = extract_domain_from_url("https://example.com/page")
        assert domain == "example.com"
    
    def test_extract_domain_from_url_with_port(self):
        """Test domain extraction with port (port is stripped)."""
        domain = extract_domain_from_url("https://example.com:8080/page")
        assert domain == "example.com"
    
    def test_extract_domain_from_url_subdomain(self):
        """Test domain extraction with subdomain."""
        domain = extract_domain_from_url("https://api.example.com/v1")
        assert domain == "api.example.com"
    
    def test_match_domain_pattern_exact(self):
        """Test exact domain matching."""
        assert match_domain_pattern("example.com", "example.com") == True
        assert match_domain_pattern("example.com", "other.com") == False
    
    def test_match_domain_pattern_wildcard(self):
        """Test wildcard domain matching."""
        assert match_domain_pattern("api.example.com", "*.example.com") == True
        # Implementation also matches base domain for wildcards
        assert match_domain_pattern("example.com", "*.example.com") == True
        assert match_domain_pattern("deep.api.example.com", "*.example.com") == True
    
    def test_match_domain_pattern_case_insensitive(self):
        """Test case insensitive matching."""
        assert match_domain_pattern("EXAMPLE.COM", "example.com") == True
        # Implementation matches base domain for wildcards (case insensitive)
        assert match_domain_pattern("Example.Com", "*.example.com") == True
    
    def test_validate_widget_domain_allowed(self):
        """Test domain validation with allowed domains."""
        allowed = ["example.com", "*.trusted.com"]
        
        # Create mock requests with different origins
        mock_request_example = MagicMock()
        mock_request_example.headers = {"origin": "https://example.com"}
        
        mock_request_trusted = MagicMock()
        mock_request_trusted.headers = {"origin": "https://api.trusted.com"}
        
        mock_request_malicious = MagicMock()
        mock_request_malicious.headers = {"origin": "https://malicious.com"}
        
        is_valid, _ = validate_widget_domain(mock_request_example, allowed, enforce_validation=True)
        assert is_valid == True
        
        is_valid, _ = validate_widget_domain(mock_request_trusted, allowed, enforce_validation=True)
        assert is_valid == True
        
        is_valid, _ = validate_widget_domain(mock_request_malicious, allowed, enforce_validation=True)
        assert is_valid == False
    
    def test_validate_widget_domain_empty_list(self):
        """Test that empty allowed list allows all."""
        mock_request = MagicMock()
        mock_request.headers = {"origin": "https://any.domain.com"}
        
        is_valid, _ = validate_widget_domain(mock_request, [])
        assert is_valid == True


class TestSecurityConfiguration:
    """Tests for security configuration checks."""
    
    def test_check_security_insecure_jwt(self):
        """Test detection of insecure JWT secret."""
        with patch("app.core.security.settings") as mock_settings:
            mock_settings.JWT_SECRET = "CHANGE-THIS-SECRET-IN-PRODUCTION"
            mock_settings.DEBUG = False
            mock_settings.ENVIRONMENT = "production"
            mock_settings.CORS_ORIGINS = "https://example.com"
            mock_settings.ADMIN_PASSWORD = "SecurePass123!"
            mock_settings.is_jwt_secret_secure = False
            mock_settings.is_production = True
            
            warnings = check_security_configuration()
            assert any("JWT" in w for w in warnings)
    
    def test_check_security_debug_in_production(self):
        """Test detection of debug mode in production."""
        with patch("app.core.security.settings") as mock_settings:
            mock_settings.JWT_SECRET = "secure-secret-key-here"
            mock_settings.DEBUG = True
            mock_settings.ENVIRONMENT = "production"
            mock_settings.CORS_ORIGINS = "https://example.com"
            mock_settings.ADMIN_PASSWORD = "SecurePass123!"
            mock_settings.is_jwt_secret_secure = True
            mock_settings.is_production = True
            
            warnings = check_security_configuration()
            assert any("DEBUG" in w or "debug" in w for w in warnings)
