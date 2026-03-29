from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from loguru import logger
from slowapi import Limiter
from pydantic import BaseModel, EmailStr, field_validator

from app.database import get_mongodb
from app.core.security import get_client_ip
from app.services.auth import (
    AuthService, UserCreate, UserLogin, UserResponse, TokenResponse,
    UserRole, create_access_token, decode_token, user_to_response,
    AgentCreate, AgentUpdate, ProfileUpdate, SiteOwnerUpdate,
)

limiter = Limiter(key_func=get_client_ip)

# Admins with must_change_password may only reach GET/PATCH /api/auth/me until they set a new password.
_ADMIN_PASSWORD_RESET_PATH = "/api/auth/me"


class AdminUserCreate(BaseModel):
    """Admin creates a site-owner account."""
    email: EmailStr
    password: str
    name: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        from app.core.security import validate_password
        is_valid, error_message = validate_password(v)
        if not is_valid:
            raise ValueError(error_message)
        return v

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        from app.core.security import sanitize_input
        v = sanitize_input(v, max_length=100)
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    
    token_data = decode_token(credentials.credentials)
    if not token_data or not token_data.user_id:
        return None
    
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    user = await auth_service.get_user_by_id(token_data.user_id)
    return user


async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    token_data = decode_token(credentials.credentials)
    if not token_data or not token_data.user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    user = await auth_service.get_user_by_id(token_data.user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if user.get("role") == UserRole.ADMIN.value and user.get("must_change_password"):
        path = request.url.path.rstrip("/") or "/"
        allowed = path == _ADMIN_PASSWORD_RESET_PATH and request.method in ("GET", "PATCH")
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "must_change_password",
                    "message": "You must set a new password before using the dashboard.",
                },
            )
    
    return user


async def require_admin(user: dict = Depends(require_auth)) -> dict:
    if user.get("role") != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


async def require_admin_or_user(user: dict = Depends(require_auth)) -> dict:
    """Allow admin and site-owner users; block agents from management endpoints."""
    if user.get("role") == UserRole.AGENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    return user


# Signup disabled - admin only mode
# @router.post("/signup", response_model=TokenResponse)
# async def signup(user_data: UserCreate):
#     mongodb = await get_mongodb()
#     auth_service = AuthService(mongodb)
#     
#     user = await auth_service.create_user(user_data)
#     if not user:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="Email already registered"
#         )
#     
#     access_token = create_access_token(data={
#         "sub": str(user["_id"]),
#         "email": user["email"],
#         "role": user["role"]
#     })
#     
#     return TokenResponse(
#         access_token=access_token,
#         user=user_to_response(user)
#     )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    
    user = await auth_service.authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    access_token = create_access_token(data={
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user["role"]
    })
    
    return TokenResponse(
        access_token=access_token,
        user=user_to_response(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(require_auth)):
    return user_to_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(data: ProfileUpdate, user: dict = Depends(require_auth)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    try:
        updated = await auth_service.update_profile(str(user["_id"]), data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_response(updated)


@router.post("/users", response_model=UserResponse)
async def create_user_account(data: AdminUserCreate, admin: dict = Depends(require_admin)):
    """Admin creates a new site-owner (user) account."""
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    try:
        user_data = UserCreate(email=data.email, password=data.password, name=data.name)
        user = await auth_service.create_user(user_data, role=UserRole.USER)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return user_to_response(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user_account(user_id: str, data: SiteOwnerUpdate, _admin: dict = Depends(require_admin)):
    """Admin updates a site-owner (role=user): name and/or password."""
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    try:
        updated = await auth_service.update_site_owner(user_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="User not found or not a site owner")
    return user_to_response(updated)


@router.get("/users", response_model=list[UserResponse])
async def list_users(user: dict = Depends(require_admin)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    users = await auth_service.get_all_users()
    return [user_to_response(u) for u in users]


@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: UserRole, admin: dict = Depends(require_admin)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    
    success = await auth_service.update_user_role(user_id, role)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Role updated successfully"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)

    success = await auth_service.delete_user_with_transfer(user_id, str(admin["_id"]))
    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "User deleted successfully. Sites and agents transferred to admin."}


# ----- Support agents (handoff operators; admin only) -----


@router.post("/agents", response_model=UserResponse)
async def create_agent(data: AgentCreate, caller: dict = Depends(require_admin_or_user)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    try:
        user = await auth_service.create_support_agent(caller, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return user_to_response(user)


@router.get("/agents", response_model=list[UserResponse])
async def list_agents(caller: dict = Depends(require_admin_or_user)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    agents = await auth_service.list_support_agents(caller)
    return [user_to_response(a) for a in agents]


@router.patch("/agents/{agent_id}", response_model=UserResponse)
async def update_agent(agent_id: str, data: AgentUpdate, caller: dict = Depends(require_admin_or_user)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    try:
        updated = await auth_service.update_support_agent(caller, agent_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Agent not found")
    return user_to_response(updated)


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, caller: dict = Depends(require_admin_or_user)):
    mongodb = await get_mongodb()
    auth_service = AuthService(mongodb)
    ok = await auth_service.delete_support_agent(caller, agent_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"message": "Agent deleted"}
