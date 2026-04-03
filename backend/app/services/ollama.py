"""
Ollama LLM service for generating responses.
"""
import httpx
from typing import AsyncGenerator, Optional, Dict, Any
from loguru import logger

from app.config import settings

# Reuse one HTTP client per process (avoids TCP/TLS handshake overhead per chat).
_http_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0),
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
        )
    return _http_client


def _ollama_options(temperature: float, max_tokens: int) -> Dict[str, Any]:
    opts: Dict[str, Any] = {
        "temperature": temperature,
        "num_predict": max_tokens,
    }
    # Smaller context = faster prefill; 0 = omit (use model default)
    nctx = getattr(settings, "OLLAMA_NUM_CTX", 0) or 0
    if nctx > 0:
        opts["num_ctx"] = nctx
    return opts


class OllamaService:
    """Service for interacting with Ollama LLM."""
    
    def __init__(self):
        self.base_url = (settings.OLLAMA_BASE_URL or "").rstrip("/")
        self.model = settings.OLLAMA_MODEL
        self.embedding_model = settings.OLLAMA_EMBEDDING_MODEL

    def _http_error_detail(self, response: httpx.Response, endpoint: str) -> str:
        """Build a clear error when Ollama returns non-200 (404 is usually unknown model)."""
        code = response.status_code
        body = (response.text or "").strip()
        if len(body) > 500:
            body = body[:500] + "…"
        hint = ""
        if code == 404:
            hint = (
                f'Model "{self.model}" was not found at {self.base_url}. '
                f"Install it with: ollama pull {self.model} — then confirm `ollama list` and that "
                f"LLM_MODEL in .env matches the tag exactly. "
            )
        else:
            hint = f"Request: POST {self.base_url}{endpoint}. "
        return f"Ollama returned status {code}. {hint}Response: {body or '(empty)'}"
    
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
            client = _get_http_client()
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                    "options": _ollama_options(temperature, max_tokens),
                },
            )

            if response.status_code != 200:
                detail = self._http_error_detail(response, "/api/chat")
                logger.error(detail)
                raise Exception(detail)

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
            client = _get_http_client()
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                    "options": _ollama_options(temperature, max_tokens),
                },
            ) as response:
                if response.status_code != 200:
                    detail = self._http_error_detail(response, "/api/chat")
                    logger.error(detail)
                    raise Exception(detail)

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
            client = _get_http_client()
            response = await client.get(f"{self.base_url}/api/tags", timeout=5.0)
            return response.status_code == 200
        except Exception:
            return False
    
    async def list_models(self) -> list:
        """List available models."""
        try:
            client = _get_http_client()
            response = await client.get(f"{self.base_url}/api/tags", timeout=10.0)
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
