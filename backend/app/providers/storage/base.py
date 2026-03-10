"""
Abstract base class for storage providers.
Handles file storage operations (uploads, downloads, etc.).
"""
from abc import ABC, abstractmethod
from typing import BinaryIO, List, Optional
from dataclasses import dataclass


@dataclass
class StorageFile:
    """Represents a stored file."""
    key: str
    filename: str
    size: int
    content_type: str
    url: Optional[str] = None


class BaseStorageProvider(ABC):
    """
    Abstract base class for file storage operations.
    
    Implementations: LocalStorage, S3, GCS, etc.
    """
    
    @abstractmethod
    async def upload(
        self,
        file: BinaryIO,
        filename: str,
        folder: str = "",
        content_type: str = "application/octet-stream"
    ) -> StorageFile:
        """
        Upload a file to storage.
        
        Args:
            file: File-like object to upload
            filename: Name of the file
            folder: Optional folder/prefix for the file
            content_type: MIME type of the file
            
        Returns:
            StorageFile with details about the uploaded file
        """
        pass
    
    @abstractmethod
    async def download(self, key: str) -> Optional[bytes]:
        """
        Download a file from storage.
        
        Args:
            key: The storage key/path of the file
            
        Returns:
            File contents as bytes, or None if not found
        """
        pass
    
    @abstractmethod
    async def delete(self, key: str) -> bool:
        """
        Delete a file from storage.
        
        Args:
            key: The storage key/path of the file
            
        Returns:
            True if deleted, False otherwise
        """
        pass
    
    @abstractmethod
    async def exists(self, key: str) -> bool:
        """
        Check if a file exists in storage.
        
        Args:
            key: The storage key/path of the file
            
        Returns:
            True if file exists, False otherwise
        """
        pass
    
    @abstractmethod
    async def list_files(self, folder: str = "") -> List[StorageFile]:
        """
        List files in a folder.
        
        Args:
            folder: The folder/prefix to list files from
            
        Returns:
            List of StorageFile objects
        """
        pass
    
    @abstractmethod
    async def get_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        """
        Get a URL to access the file.
        
        Args:
            key: The storage key/path of the file
            expires_in: URL expiration time in seconds (for signed URLs)
            
        Returns:
            URL string or None if not available
        """
        pass
