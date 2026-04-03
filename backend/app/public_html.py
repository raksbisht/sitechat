"""
Inject deployment settings into static HTML placeholders.
Templates use __SITE_URL__, __SITE_HOST__, __ADMIN_EMAIL__, __WIDGET_SRI_JS__ (landing only).
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from app.config import settings


def apply_public_html_placeholders(html: str, *, widget_sri: Optional[str] = None) -> str:
    base = (settings.SITE_URL or "").rstrip("/") or "http://localhost:8000"
    parsed = urlparse(base)
    host = parsed.netloc or "localhost"
    html = html.replace("__SITE_URL__", base)
    html = html.replace("__SITE_HOST__", host)
    html = html.replace("__ADMIN_EMAIL__", settings.ADMIN_EMAIL)
    wjs = ""
    if widget_sri:
        wjs = f"      s.integrity = '{widget_sri}';\n      s.crossOrigin = 'anonymous';\n"
    html = html.replace("__WIDGET_SRI_JS__", wjs)
    return html
