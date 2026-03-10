"""
Platform settings API routes for white-labeling and global configuration.
"""
from fastapi import APIRouter, HTTPException, Depends
from loguru import logger

from app.database import get_mongodb
from app.routes.auth import require_admin
from app.models.schemas import PlatformWhiteLabelConfig, PlatformWhiteLabelUpdate

router = APIRouter(prefix="/api/platform", tags=["platform"])


@router.get("/whitelabel", response_model=PlatformWhiteLabelConfig)
async def get_whitelabel_config():
    """
    Get platform white-label configuration.
    This endpoint is public so the dashboard can load branding settings.
    """
    mongodb = await get_mongodb()
    config = await mongodb.get_platform_whitelabel()
    
    if not config:
        return PlatformWhiteLabelConfig()
    
    return PlatformWhiteLabelConfig(**config)


@router.put("/whitelabel", response_model=PlatformWhiteLabelConfig)
async def update_whitelabel_config(
    update: PlatformWhiteLabelUpdate,
    user: dict = Depends(require_admin)
):
    """
    Update platform white-label configuration.
    Only admins can update platform settings.
    """
    mongodb = await get_mongodb()
    
    current_config = await mongodb.get_platform_whitelabel() or {}
    
    update_data = update.model_dump(exclude_unset=True)
    current_config.update(update_data)
    
    updated = await mongodb.update_platform_whitelabel(current_config)
    
    logger.info(f"Platform white-label config updated by user {user.get('email')}")
    
    return PlatformWhiteLabelConfig(**updated) if updated else PlatformWhiteLabelConfig()


@router.post("/whitelabel/reset", response_model=PlatformWhiteLabelConfig)
async def reset_whitelabel_config(user: dict = Depends(require_admin)):
    """
    Reset platform white-label configuration to defaults.
    Only admins can reset platform settings.
    """
    mongodb = await get_mongodb()
    
    default_config = PlatformWhiteLabelConfig().model_dump()
    
    await mongodb.update_platform_whitelabel(default_config)
    
    logger.info(f"Platform white-label config reset by user {user.get('email')}")
    
    return PlatformWhiteLabelConfig()
