from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from loguru import logger

from app.database import get_mongodb
from app.services.auth import (
    AuthService, UserCreate, UserLogin, UserResponse, TokenResponse,
    UserRole, create_access_token, decode_token, user_to_response
)

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


async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
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
    
    return user


async def require_admin(user: dict = Depends(require_auth)) -> dict:
    if user.get("role") != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
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
async def login(credentials: UserLogin):
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
    
    success = await auth_service.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}
