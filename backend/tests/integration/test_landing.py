"""Marketing landing and dashboard route serving."""

import pytest


@pytest.mark.asyncio
async def test_root_serves_marketing_landing(client):
    r = await client.get("/")
    assert r.status_code == 200
    assert "data-sitechat-landing" in r.text
    assert "landing.css" in r.text


@pytest.mark.asyncio
async def test_app_serves_dashboard(client):
    r = await client.get("/app")
    assert r.status_code == 200
    assert "data-sitechat-dashboard" in r.text
    assert "styles.css" in r.text


@pytest.mark.asyncio
async def test_dashboard_alias_serves_dashboard(client):
    r = await client.get("/dashboard")
    assert r.status_code == 200
    assert "data-sitechat-dashboard" in r.text
