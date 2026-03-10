"""
Local filesystem storage provider implementation.
"""
import os
import aiofiles
from pathlib import Path
from typing import BinaryIO, List, Optional
from loguru import logger

from app.config import settings
from .base import BaseStorageProvider, StorageFile


class LocalStorageProvider(BaseStorageProvider):
    """Local filesystem storage implementation."""
    
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or settings.LOCAL_STORAGE_PATH)
        self._ensure_base_path()
    
    def _ensure_base_path(self):
        """Ensure the base storage path exists."""
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def _get_full_path(self, key: str) -> Path:
        """Get the full filesystem path for a key."""
        return self.base_path / key
    
    async def upload(
        self,
        file: BinaryIO,
        filename: str,
        folder: str = "",
        content_type: str = "application/octet-stream"
    ) -> StorageFile:
        """Upload a file to local storage."""
        if folder:
            folder_path = self.base_path / folder
            folder_path.mkdir(parents=True, exist_ok=True)
            key = f"{folder}/{filename}"
        else:
            key = filename
        
        full_path = self._get_full_path(key)
        
        content = file.read() if hasattr(file, 'read') else file
        if isinstance(content, str):
            content = content.encode()
        
        async with aiofiles.open(full_path, 'wb') as f:
            await f.write(content)
        
        size = full_path.stat().st_size
        
        logger.info(f"Uploaded file to local storage: {key}")
        
        return StorageFile(
            key=key,
            filename=filename,
            size=size,
            content_type=content_type,
            url=f"/storage/{key}"
        )
    
    async def download(self, key: str) -> Optional[bytes]:
        """Download a file from local storage."""
        full_path = self._get_full_path(key)
        
        if not full_path.exists():
            logger.warning(f"File not found: {key}")
            return None
        
        async with aiofiles.open(full_path, 'rb') as f:
            return await f.read()
    
    async def delete(self, key: str) -> bool:
        """Delete a file from local storage."""
        full_path = self._get_full_path(key)
        
        if not full_path.exists():
            return False
        
        try:
            full_path.unlink()
            logger.info(f"Deleted file from local storage: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete file {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if a file exists in local storage."""
        return self._get_full_path(key).exists()
    
    async def list_files(self, folder: str = "") -> List[StorageFile]:
        """List files in a folder."""
        folder_path = self.base_path / folder if folder else self.base_path
        
        if not folder_path.exists():
            return []
        
        files = []
        for path in folder_path.iterdir():
            if path.is_file():
                key = str(path.relative_to(self.base_path))
                files.append(StorageFile(
                    key=key,
                    filename=path.name,
                    size=path.stat().st_size,
                    content_type="application/octet-stream",
                    url=f"/storage/{key}"
                ))
        
        return files
    
    async def get_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        """Get URL for a file (local URLs don't expire)."""
        full_path = self._get_full_path(key)
        
        if not full_path.exists():
            return None
        
        return f"/storage/{key}"
