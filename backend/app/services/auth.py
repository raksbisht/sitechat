from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel, EmailStr, field_validator
from enum import Enum
from loguru import logger

from app.config import settings


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    
    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
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


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None


SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        if user_id is None:
            return None
        return TokenData(user_id=user_id, email=email, role=UserRole(role) if role else None)
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        return None


class AuthService:
    def __init__(self, mongodb):
        # Use provider interface - mongodb is a database provider instance
        self._provider = mongodb
    
    async def create_user(self, user_data: UserCreate, role: UserRole = UserRole.USER) -> Optional[dict]:
        # Use provider interface
        existing = await self._provider.get_user_by_email(user_data.email)
        if existing:
            return None
        
        user_doc = {
            "email": user_data.email,
            "name": user_data.name,
            "password_hash": get_password_hash(user_data.password),
            "role": role.value,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        user_id = await self._provider.create_user(user_doc)
        user_doc["_id"] = user_id
        user_doc["user_id"] = user_id
        return user_doc
    
    async def authenticate_user(self, email: str, password: str) -> Optional[dict]:
        # Use provider interface
        user = await self._provider.get_user_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.get("password_hash", "")):
            return None
        return user
    
    async def get_user_by_id(self, user_id: str) -> Optional[dict]:
        # Use provider interface
        return await self._provider.get_user_by_id(user_id)
    
    async def get_user_by_email(self, email: str) -> Optional[dict]:
        # Use provider interface
        return await self._provider.get_user_by_email(email)
    
    async def get_all_users(self) -> list:
        # Use provider interface if available, otherwise return empty list
        if hasattr(self._provider, 'get_all_users'):
            return await self._provider.get_all_users()
        return []
    
    async def update_user_role(self, user_id: str, role: UserRole) -> bool:
        # Use provider interface if available
        if hasattr(self._provider, 'update_user'):
            return await self._provider.update_user(user_id, {"role": role.value})
        return False
    
    async def delete_user(self, user_id: str) -> bool:
        # Use provider interface if available
        if hasattr(self._provider, 'delete_user'):
            return await self._provider.delete_user(user_id)
        return False
    
    async def ensure_admin_exists(self):
        """
        Create initial admin user if no admin exists.
        Uses credentials from environment variables.
        Set ADMIN_PASSWORD to empty string to disable auto-creation.
        """
        # Check if admin exists using provider interface
        admin = await self._provider.get_user_by_email(settings.ADMIN_EMAIL) if settings.ADMIN_EMAIL else None
        
        # Also check by role if we have that method
        if not admin and hasattr(self._provider, 'get_user_by_role'):
            admin = await self._provider.get_user_by_role("admin")
        
        if admin and admin.get("role") == "admin":
            logger.info(f"Admin user exists: {admin.get('email')}")
            return
        
        # Check if admin auto-creation is disabled
        if not settings.ADMIN_PASSWORD:
            logger.info("Admin auto-creation disabled (ADMIN_PASSWORD is empty)")
            logger.info("Create an admin user via API or set ADMIN_PASSWORD in .env")
            return
        
        # Validate admin password meets requirements
        from app.core.security import validate_password
        is_valid, error_message = validate_password(settings.ADMIN_PASSWORD)
        
        if not is_valid:
            logger.warning(f"Cannot create admin: {error_message}")
            logger.warning("Set a strong ADMIN_PASSWORD in .env or create admin via API")
            return
        
        try:
            logger.info("Creating initial admin user...")
            admin_doc = {
                "email": settings.ADMIN_EMAIL,
                "name": "Administrator",
                "password_hash": get_password_hash(settings.ADMIN_PASSWORD),
                "role": UserRole.ADMIN.value,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await self._provider.create_user(admin_doc)
            logger.info(f"Admin user created: {settings.ADMIN_EMAIL}")
            
            # Security warning for default email
            if settings.ADMIN_EMAIL == "admin@sitechat.com":
                logger.warning("SECURITY: Using default admin email. Consider changing ADMIN_EMAIL")
                
        except Exception as e:
            logger.error(f"Failed to create admin user: {e}")


def user_to_response(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        role=UserRole(user["role"]),
        created_at=user["created_at"]
    )
