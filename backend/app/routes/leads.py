"""
Lead Generation API Routes.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address
import csv
import io

from app.database import get_mongodb
from app.routes.auth import require_auth
from app.models.schemas import (
    LeadCreate, Lead, LeadListItem, LeadListResponse
)
from app.core.security import get_client_ip

limiter = Limiter(key_func=get_client_ip)

router = APIRouter(tags=["leads"])


# ==================== Public Widget Endpoints ====================

@router.post("/api/leads", response_model=dict)
@limiter.limit("5/minute")
async def capture_lead(request: Request, body: LeadCreate):
    """Capture a new lead (called from widget - no auth required)."""
    # Honeypot check — bots fill hidden fields, humans don't
    if body.website:
        logger.warning(f"Honeypot triggered on lead capture from {get_client_ip(request)}")
        return {"success": True, "lead_id": "blocked", "message": "Lead captured successfully"}

    mongodb = await get_mongodb()

    if not body.email and not body.name:
        raise HTTPException(
            status_code=400,
            detail="At least email or name is required"
        )

    existing = await mongodb.get_lead_by_session(body.site_id, body.session_id)
    if existing:
        return {
            "success": True,
            "lead_id": existing["id"],
            "message": "Lead already captured for this session"
        }

    lead_data = {
        "site_id": body.site_id,
        "session_id": body.session_id,
        "email": body.email,
        "name": body.name,
        "source": body.source
    }

    lead = await mongodb.save_lead(lead_data)

    logger.info(f"Captured lead {lead['id']} for site {body.site_id}: {body.email or body.name}")
    
    return {
        "success": True,
        "lead_id": lead["id"],
        "message": "Lead captured successfully"
    }


@router.get("/api/leads/check/{site_id}/{session_id}")
async def check_lead_exists(site_id: str, session_id: str):
    """Check if a lead exists for a session (for widget to avoid re-prompting)."""
    mongodb = await get_mongodb()
    
    lead = await mongodb.get_lead_by_session(site_id, session_id)
    
    return {
        "exists": lead is not None,
        "lead_id": lead["id"] if lead else None
    }


# ==================== Authenticated Dashboard Endpoints ====================

@router.get("/api/sites/{site_id}/leads", response_model=LeadListResponse)
async def get_site_leads(
    site_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    user: dict = Depends(require_auth)
):
    """Get paginated leads for a site."""
    mongodb = await get_mongodb()
    
    leads, total = await mongodb.get_leads(
        site_id=site_id,
        page=page,
        limit=limit,
        search=search
    )
    
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    
    return LeadListResponse(
        leads=[LeadListItem(
            id=lead["id"],
            site_id=lead["site_id"],
            session_id=lead["session_id"],
            email=lead.get("email"),
            name=lead.get("name"),
            captured_at=lead["captured_at"],
            source=lead.get("source", "chat")
        ) for lead in leads],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.get("/api/sites/{site_id}/leads/export")
async def export_leads(
    site_id: str,
    user: dict = Depends(require_auth)
):
    """Export all leads for a site as CSV."""
    mongodb = await get_mongodb()
    
    leads = await mongodb.get_all_leads_for_export(site_id)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["Email", "Name", "Captured At", "Source", "Session ID"])
    
    for lead in leads:
        captured_at = lead.get("captured_at")
        if isinstance(captured_at, datetime):
            captured_at = captured_at.strftime("%Y-%m-%d %H:%M:%S")
        
        writer.writerow([
            lead.get("email", ""),
            lead.get("name", ""),
            captured_at,
            lead.get("source", "chat"),
            lead.get("session_id", "")
        ])
    
    output.seek(0)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"leads_{site_id}_{timestamp}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/api/sites/{site_id}/leads/count")
async def get_leads_count(
    site_id: str,
    user: dict = Depends(require_auth)
):
    """Get total leads count for a site."""
    mongodb = await get_mongodb()
    
    count = await mongodb.get_leads_count(site_id)
    
    return {"count": count}


@router.delete("/api/leads/{lead_id}")
async def delete_lead(
    lead_id: str,
    user: dict = Depends(require_auth)
):
    """Delete a lead by ID."""
    mongodb = await get_mongodb()
    
    lead = await mongodb.get_lead_by_id(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    success = await mongodb.delete_lead(lead_id)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete lead")
    
    logger.info(f"Deleted lead {lead_id} by user {user.get('email')}")
    
    return {"success": True, "message": "Lead deleted successfully"}
