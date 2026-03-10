"""
Ollama LLM service for generating responses.
"""
import httpx
from typing import AsyncGenerator, Optional, Dict, Any
from loguru import logger

from app.config import settings


class OllamaService:
    """Service for interacting with Ollama LLM."""
    
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL
        self.embedding_model = settings.OLLAMA_EMBEDDING_MODEL
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        """
        Generate a response from the LLM.
        
        Args:
            prompt: The user prompt
            system_prompt: Optional system prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
        
        Returns:
            The generated response text
        """
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens
                        }
                    }
                )
                
                if response.status_code != 200:
                    logger.error(f"Ollama error: {response.status_code} - {response.text}")
                    raise Exception(f"Ollama returned status {response.status_code}")
                
                data = response.json()
                return data.get("message", {}).get("content", "")
                
        except httpx.TimeoutException:
            logger.error("Ollama request timed out")
            raise Exception("LLM request timed out. Please try again.")
        except Exception as e:
            logger.error(f"Ollama error: {e}")
            raise
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """
        Stream a response from the LLM.
        
        Yields:
            Chunks of the generated response
        """
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": True,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens
                        }
                    }
                ) as response:
                    if response.status_code != 200:
                        raise Exception(f"Ollama returned status {response.status_code}")
                    
                    async for line in response.aiter_lines():
                        if line:
                            import json
                            try:
                                data = json.loads(line)
                                content = data.get("message", {}).get("content", "")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                continue
                                
        except Exception as e:
            logger.error(f"Ollama streaming error: {e}")
            raise
    
    async def check_health(self) -> bool:
        """Check if Ollama is available."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False
    
    async def list_models(self) -> list:
        """List available models."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    return [m["name"] for m in data.get("models", [])]
                return []
        except Exception as e:
            logger.error(f"Error listing models: {e}")
            return []


# Singleton instance
_ollama_service: Optional[OllamaService] = None


def get_ollama_service() -> OllamaService:
    """Get or create OllamaService instance."""
    global _ollama_service
    if _ollama_service is None:
        _ollama_service = OllamaService()
    return _ollama_service
