"""
Core module - dependency injection, security, and application setup.
"""
from .dependencies import (
    get_db,
    get_storage,
    get_cache,
    get_llm,
    get_embeddings,
    get_vector_store,
    init_providers,
    shutdown_providers
)

from .security import (
    SecurityHeadersMiddleware,
    RequestValidationMiddleware,
    sanitize_html,
    sanitize_input,
    validate_email,
    validate_password,
    generate_secure_token,
    generate_secure_secret,
    check_security_configuration,
    log_security_warnings,
    get_client_ip,
    # Widget security
    extract_domain_from_url,
    match_domain_pattern,
    validate_widget_domain,
    get_request_origin,
    generate_sri_hash,
    generate_sri_hash_for_file
)

__all__ = [
    # Dependencies
    "get_db",
    "get_storage",
    "get_cache",
    "get_llm",
    "get_embeddings",
    "get_vector_store",
    "init_providers",
    "shutdown_providers",
    # Security
    "SecurityHeadersMiddleware",
    "RequestValidationMiddleware",
    "sanitize_html",
    "sanitize_input",
    "validate_email",
    "validate_password",
    "generate_secure_token",
    "generate_secure_secret",
    "check_security_configuration",
    "log_security_warnings",
    "get_client_ip",
    # Widget security
    "extract_domain_from_url",
    "match_domain_pattern",
    "validate_widget_domain",
    "get_request_origin",
    "generate_sri_hash",
    "generate_sri_hash_for_file"
]
