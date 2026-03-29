from datetime import datetime, timedelta
from typing import List, Optional
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel, EmailStr, field_validator
from enum import Enum
from loguru import logger

from app.config import settings


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    AGENT = "agent"


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


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        from app.core.security import sanitize_input
        v = sanitize_input(v, max_length=100)
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        from app.core.security import validate_password
        is_valid, error_message = validate_password(v)
        if not is_valid:
            raise ValueError(error_message)
        return v


class AgentCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    assigned_site_ids: List[str] = []

    @field_validator("password")
    @classmethod
    def validate_password_strength_agent(cls, v: str) -> str:
        from app.core.security import validate_password
        is_valid, error_message = validate_password(v)
        if not is_valid:
            raise ValueError(error_message)
        return v


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    assigned_site_ids: Optional[List[str]] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_optional_password(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        from app.core.security import validate_password
        is_valid, error_message = validate_password(v)
        if not is_valid:
            raise ValueError(error_message)
        return v


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    created_at: datetime
    assigned_site_ids: List[str] = []


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

    async def update_profile(self, user_id: str, data: "ProfileUpdate") -> Optional[dict]:
        user = await self._provider.get_user_by_id(user_id)
        if not user:
            return None

        updates: dict = {"updated_at": datetime.utcnow()}

        if data.name:
            updates["name"] = data.name

        if data.new_password:
            if not data.current_password:
                raise ValueError("Current password required to set a new password")
            if not verify_password(data.current_password, user.get("password_hash", "")):
                raise ValueError("Current password is incorrect")
            updates["password_hash"] = get_password_hash(data.new_password)

        if hasattr(self._provider, "update_user"):
            await self._provider.update_user(user_id, updates)

        return await self._provider.get_user_by_id(user_id)
    
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

    async def _sites_belong_to_caller(self, caller: dict, site_ids: List[str]) -> bool:
        """Check all site_ids are accessible by the caller.
        Admins can assign agents to any site. Users can only assign to their own sites."""
        if not site_ids:
            return True
        if caller.get("role") == UserRole.ADMIN.value:
            return True
        caller_id = str(caller["_id"])
        for sid in site_ids:
            if not hasattr(self._provider, "get_site"):
                return False
            site = await self._provider.get_site(sid)
            if not site or site.get("user_id") != caller_id:
                return False
        return True

    async def create_support_agent(self, caller: dict, data: AgentCreate) -> Optional[dict]:
        """Create a handoff agent scoped to the caller (admin or site owner)."""
        caller_id = str(caller["_id"])
        existing = await self._provider.get_user_by_email(data.email)
        if existing:
            return None
        if not await self._sites_belong_to_caller(caller, data.assigned_site_ids):
            raise ValueError("One or more sites are invalid or not owned by you")

        user_doc = {
            "email": data.email,
            "name": data.name,
            "password_hash": get_password_hash(data.password),
            "role": UserRole.AGENT.value,
            "owner_id": caller_id,
            "assigned_site_ids": list(data.assigned_site_ids),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        user_id = await self._provider.create_user(user_doc)
        return await self._provider.get_user_by_id(user_id)

    async def list_support_agents(self, caller: dict) -> list:
        """List agents. Admins see all platform agents; users see only their own."""
        if caller.get("role") == UserRole.ADMIN.value:
            if hasattr(self._provider, "list_all_agents"):
                return await self._provider.list_all_agents()
        caller_id = str(caller["_id"])
        if hasattr(self._provider, "list_users_agents_for_owner"):
            return await self._provider.list_users_agents_for_owner(caller_id)
        return []

    async def update_support_agent(self, caller: dict, agent_id: str, data: AgentUpdate) -> Optional[dict]:
        caller_id = str(caller["_id"])
        agent = await self._provider.get_user_by_id(agent_id)
        if not agent or agent.get("role") != UserRole.AGENT.value:
            return None
        # Admin can update any agent; users can only update agents they own
        if caller.get("role") != UserRole.ADMIN.value and agent.get("owner_id") != caller_id:
            return None

        updates = {}
        if data.name is not None:
            updates["name"] = data.name
        if data.assigned_site_ids is not None:
            if not await self._sites_belong_to_caller(caller, data.assigned_site_ids):
                raise ValueError("One or more sites are invalid or not owned by you")
            updates["assigned_site_ids"] = list(data.assigned_site_ids)
        if data.password:
            updates["password_hash"] = get_password_hash(data.password)

        if not updates:
            return agent

        if hasattr(self._provider, "update_user"):
            await self._provider.update_user(agent_id, updates)
        return await self._provider.get_user_by_id(agent_id)

    async def delete_support_agent(self, caller: dict, agent_id: str) -> bool:
        caller_id = str(caller["_id"])
        agent = await self._provider.get_user_by_id(agent_id)
        if not agent or agent.get("role") != UserRole.AGENT.value:
            return False
        # Admin can delete any agent; users can only delete agents they own
        if caller.get("role") != UserRole.ADMIN.value and agent.get("owner_id") != caller_id:
            return False
        return await self.delete_user(agent_id)

    async def delete_user_with_transfer(self, user_id: str, admin_id: str) -> bool:
        """Delete a user, transferring their sites and agents to the admin."""
        user = await self._provider.get_user_by_id(user_id)
        if not user:
            return False
        if hasattr(self._provider, "transfer_sites_to_user"):
            transferred_sites = await self._provider.transfer_sites_to_user(user_id, admin_id)
            logger.info(f"Transferred {transferred_sites} sites from user {user_id} to admin {admin_id}")
        if hasattr(self._provider, "transfer_agents_to_user"):
            transferred_agents = await self._provider.transfer_agents_to_user(user_id, admin_id)
            logger.info(f"Transferred {transferred_agents} agents from user {user_id} to admin {admin_id}")
        return await self.delete_user(user_id)
    
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
        created_at=user["created_at"],
        assigned_site_ids=list(user.get("assigned_site_ids") or []),
    )
