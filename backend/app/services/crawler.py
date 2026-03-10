"""
Web crawler service for scraping websites.
"""
import asyncio
import re
from typing import List, Dict, Set, Optional
from urllib.parse import urljoin, urlparse
import aiohttp
from bs4 import BeautifulSoup
from loguru import logger

from app.config import settings
from app.database import get_mongodb


class CrawlerService:
    """Service for crawling websites and extracting content."""
    
    def __init__(self):
        self.visited_urls: Set[str] = set()
        self.pages: List[Dict] = []
        self.errors: List[str] = []
        self.job_id: Optional[str] = None
    
    async def crawl(
        self,
        start_url: str,
        max_pages: int = None,
        include_patterns: List[str] = None,
        exclude_patterns: List[str] = None,
        job_id: str = None
    ) -> List[Dict]:
        """
        Crawl a website starting from the given URL.
        
        Args:
            start_url: The starting URL to crawl
            max_pages: Maximum number of pages to crawl
            include_patterns: URL patterns to include (regex)
            exclude_patterns: URL patterns to exclude (regex)
            job_id: Crawl job ID for progress tracking
        
        Returns:
            List of crawled pages with content
        """
        self.visited_urls = set()
        self.pages = []
        self.errors = []
        self.job_id = job_id
        
        max_pages = max_pages or settings.MAX_PAGES
        include_patterns = include_patterns or []
        exclude_patterns = exclude_patterns or []
        
        # Compile regex patterns
        include_regex = [re.compile(p) for p in include_patterns] if include_patterns else None
        exclude_regex = [re.compile(p) for p in exclude_patterns] if exclude_patterns else None
        
        # Parse base domain
        parsed_start = urlparse(start_url)
        base_domain = f"{parsed_start.scheme}://{parsed_start.netloc}"
        
        # Queue for BFS crawling
        queue = [start_url]
        
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={"User-Agent": "SiteChat-Crawler/1.0"}
        ) as session:
            while queue and len(self.pages) < max_pages:
                # Get next URL
                url = queue.pop(0)
                
                if url in self.visited_urls:
                    continue
                
                # Check patterns
                if not self._should_crawl(url, include_regex, exclude_regex):
                    continue
                
                self.visited_urls.add(url)
                
                try:
                    # Fetch page
                    page_data = await self._fetch_page(session, url)
                    
                    if page_data:
                        self.pages.append(page_data)
                        
                        # Extract links and add to queue
                        links = self._extract_links(page_data["html"], base_domain, url)
                        for link in links:
                            if link not in self.visited_urls:
                                queue.append(link)
                        
                        # Update job progress
                        if self.job_id:
                            mongodb = await get_mongodb()
                            await mongodb.update_crawl_job(
                                self.job_id,
                                pages_crawled=len(self.pages)
                            )
                        
                        logger.info(f"Crawled: {url} ({len(self.pages)}/{max_pages})")
                    
                    # Respect crawl delay
                    await asyncio.sleep(settings.CRAWL_DELAY)
                    
                except Exception as e:
                    error_msg = f"Error crawling {url}: {str(e)}"
                    self.errors.append(error_msg)
                    logger.error(error_msg)
        
        logger.info(f"Crawl complete. Total pages: {len(self.pages)}")
        return self.pages
    
    async def _fetch_page(
        self,
        session: aiohttp.ClientSession,
        url: str
    ) -> Optional[Dict]:
        """Fetch a single page and extract content."""
        try:
            async with session.get(url) as response:
                if response.status == 403:
                    logger.warning(f"Access forbidden (403) for {url} - site may be blocking crawlers")
                    self.errors.append(f"Access forbidden: {url}")
                    return None
                elif response.status == 429:
                    logger.warning(f"Rate limited (429) for {url} - site has bot protection")
                    self.errors.append(f"Bot protection/rate limited: {url}")
                    return None
                elif response.status != 200:
                    logger.debug(f"HTTP {response.status} for {url}")
                    return None
                
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    return None
                
                html = await response.text()
                
                # Parse HTML
                soup = BeautifulSoup(html, "html.parser")
                
                # Remove unwanted elements
                for element in soup.find_all(["script", "style", "nav", "footer", "header", "aside"]):
                    element.decompose()
                
                # Extract title
                title = ""
                if soup.title:
                    title = soup.title.string or ""
                elif soup.find("h1"):
                    title = soup.find("h1").get_text(strip=True)
                
                # Extract main content
                main_content = soup.find("main") or soup.find("article") or soup.find("body")
                
                if main_content:
                    # Get text content
                    text = main_content.get_text(separator="\n", strip=True)
                    # Clean up whitespace
                    text = re.sub(r'\n{3,}', '\n\n', text)
                    text = re.sub(r' {2,}', ' ', text)
                else:
                    text = soup.get_text(separator="\n", strip=True)
                
                # Skip pages with very little content
                if len(text) < 100:
                    return None
                
                return {
                    "url": url,
                    "title": title.strip(),
                    "content": text,
                    "html": html,
                    "metadata": {
                        "content_length": len(text),
                        "word_count": len(text.split())
                    }
                }
                
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None
    
    def _extract_links(self, html: str, base_domain: str, current_url: str) -> List[str]:
        """Extract links from HTML."""
        soup = BeautifulSoup(html, "html.parser")
        links = []
        
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"]
            
            # Skip empty, javascript, and anchor links
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            
            # Make absolute URL
            absolute_url = urljoin(current_url, href)
            parsed = urlparse(absolute_url)
            
            # Only include links from same domain
            if f"{parsed.scheme}://{parsed.netloc}" != base_domain:
                continue
            
            # Remove fragments
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if parsed.query:
                clean_url += f"?{parsed.query}"
            
            # Skip file downloads
            if any(clean_url.lower().endswith(ext) for ext in [".pdf", ".jpg", ".png", ".gif", ".zip", ".mp4"]):
                continue
            
            links.append(clean_url)
        
        return list(set(links))
    
    def _should_crawl(
        self,
        url: str,
        include_regex: List[re.Pattern] = None,
        exclude_regex: List[re.Pattern] = None
    ) -> bool:
        """Check if URL should be crawled based on patterns."""
        # Check exclude patterns first
        if exclude_regex:
            for pattern in exclude_regex:
                if pattern.search(url):
                    return False
        
        # If include patterns specified, URL must match at least one
        if include_regex:
            return any(pattern.search(url) for pattern in include_regex)
        
        return True
    
    def get_stats(self) -> Dict:
        """Get crawl statistics."""
        return {
            "pages_crawled": len(self.pages),
            "urls_visited": len(self.visited_urls),
            "errors": len(self.errors),
            "error_messages": self.errors[:10]  # First 10 errors
        }
