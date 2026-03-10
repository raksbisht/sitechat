"""
Unit tests for Crawler service.
Tests URL normalization, robots.txt compliance, patterns, and crawling logic.
"""
import pytest
import re
from unittest.mock import AsyncMock, MagicMock, patch
from aiohttp import ClientResponseError

from app.services.crawler import CrawlerService


# ==================== Fixtures ====================

@pytest.fixture
def crawler():
    """Create a fresh CrawlerService instance."""
    return CrawlerService()


@pytest.fixture
def mock_session():
    """Create a mock aiohttp session."""
    session = MagicMock()
    return session


@pytest.fixture
def sample_html():
    """Sample HTML content for testing."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Page</title>
    </head>
    <body>
        <header>Header content</header>
        <nav>Navigation</nav>
        <main>
            <h1>Main Title</h1>
            <p>This is the main content of the page. It contains important information
            that should be extracted by the crawler.</p>
            <a href="/page1">Link 1</a>
            <a href="/page2">Link 2</a>
            <a href="https://external.com/page">External Link</a>
            <a href="#section">Anchor Link</a>
            <a href="javascript:void(0)">JS Link</a>
            <a href="mailto:test@example.com">Email Link</a>
        </main>
        <footer>Footer content</footer>
        <script>console.log('test');</script>
        <style>.test { color: red; }</style>
    </body>
    </html>
    """


@pytest.fixture
def minimal_html():
    """Minimal HTML with little content."""
    return """
    <html>
    <head><title>Empty</title></head>
    <body><p>Short</p></body>
    </html>
    """


# ==================== _should_crawl Tests ====================

class TestShouldCrawl:
    """Tests for URL filtering based on patterns."""
    
    def test_should_crawl_no_patterns(self, crawler):
        """Should allow all URLs when no patterns specified."""
        result = crawler._should_crawl("https://example.com/any/path")
        assert result is True
    
    def test_should_crawl_exclude_pattern_match(self, crawler):
        """Should reject URLs matching exclude pattern."""
        exclude_regex = [re.compile(r"/admin/")]
        
        result = crawler._should_crawl(
            "https://example.com/admin/dashboard",
            exclude_regex=exclude_regex
        )
        
        assert result is False
    
    def test_should_crawl_exclude_pattern_no_match(self, crawler):
        """Should allow URLs not matching exclude pattern."""
        exclude_regex = [re.compile(r"/admin/")]
        
        result = crawler._should_crawl(
            "https://example.com/public/page",
            exclude_regex=exclude_regex
        )
        
        assert result is True
    
    def test_should_crawl_include_pattern_match(self, crawler):
        """Should allow URLs matching include pattern."""
        include_regex = [re.compile(r"/blog/")]
        
        result = crawler._should_crawl(
            "https://example.com/blog/post-1",
            include_regex=include_regex
        )
        
        assert result is True
    
    def test_should_crawl_include_pattern_no_match(self, crawler):
        """Should reject URLs not matching include pattern."""
        include_regex = [re.compile(r"/blog/")]
        
        result = crawler._should_crawl(
            "https://example.com/about",
            include_regex=include_regex
        )
        
        assert result is False
    
    def test_should_crawl_multiple_exclude_patterns(self, crawler):
        """Should check all exclude patterns."""
        exclude_regex = [
            re.compile(r"/admin/"),
            re.compile(r"/private/"),
            re.compile(r"/internal/"),
        ]
        
        assert crawler._should_crawl("https://example.com/admin/page", exclude_regex=exclude_regex) is False
        assert crawler._should_crawl("https://example.com/private/data", exclude_regex=exclude_regex) is False
        assert crawler._should_crawl("https://example.com/public/page", exclude_regex=exclude_regex) is True
    
    def test_should_crawl_multiple_include_patterns(self, crawler):
        """Should allow if any include pattern matches."""
        include_regex = [
            re.compile(r"/blog/"),
            re.compile(r"/docs/"),
        ]
        
        assert crawler._should_crawl("https://example.com/blog/post", include_regex=include_regex) is True
        assert crawler._should_crawl("https://example.com/docs/api", include_regex=include_regex) is True
        assert crawler._should_crawl("https://example.com/about", include_regex=include_regex) is False
    
    def test_should_crawl_exclude_takes_precedence(self, crawler):
        """Exclude patterns should be checked before include patterns."""
        include_regex = [re.compile(r"/blog/")]
        exclude_regex = [re.compile(r"/blog/drafts/")]
        
        result = crawler._should_crawl(
            "https://example.com/blog/drafts/post",
            include_regex=include_regex,
            exclude_regex=exclude_regex
        )
        
        assert result is False


# ==================== _extract_links Tests ====================

class TestExtractLinks:
    """Tests for link extraction from HTML."""
    
    def test_extract_links_basic(self, crawler, sample_html):
        """Should extract valid links from HTML."""
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(sample_html, base_domain, current_url)
        
        assert "https://example.com/page1" in links
        assert "https://example.com/page2" in links
    
    def test_extract_links_filters_external(self, crawler, sample_html):
        """Should filter out external domain links."""
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(sample_html, base_domain, current_url)
        
        assert "https://external.com/page" not in links
        for link in links:
            assert "external.com" not in link
    
    def test_extract_links_filters_anchors(self, crawler, sample_html):
        """Should filter out anchor-only links."""
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(sample_html, base_domain, current_url)
        
        for link in links:
            assert not link.startswith("#")
    
    def test_extract_links_filters_javascript(self, crawler, sample_html):
        """Should filter out javascript: links."""
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(sample_html, base_domain, current_url)
        
        for link in links:
            assert "javascript:" not in link
    
    def test_extract_links_filters_mailto(self, crawler, sample_html):
        """Should filter out mailto: links."""
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(sample_html, base_domain, current_url)
        
        for link in links:
            assert "mailto:" not in link
    
    def test_extract_links_makes_absolute(self, crawler):
        """Should convert relative URLs to absolute."""
        html = '<html><body><a href="relative/page">Link</a></body></html>'
        base_domain = "https://example.com"
        current_url = "https://example.com/section/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        assert "https://example.com/section/relative/page" in links
    
    def test_extract_links_removes_fragments(self, crawler):
        """Should remove URL fragments."""
        html = '<html><body><a href="/page#section">Link</a></body></html>'
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        for link in links:
            assert "#" not in link
    
    def test_extract_links_preserves_query_params(self, crawler):
        """Should preserve query parameters."""
        html = '<html><body><a href="/search?q=test&page=1">Link</a></body></html>'
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        assert "https://example.com/search?q=test&page=1" in links
    
    def test_extract_links_filters_file_extensions(self, crawler):
        """Should filter out file download links."""
        html = '''
        <html><body>
            <a href="/document.pdf">PDF</a>
            <a href="/image.jpg">Image</a>
            <a href="/archive.zip">Archive</a>
            <a href="/video.mp4">Video</a>
            <a href="/page">Valid</a>
        </body></html>
        '''
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        assert "https://example.com/page" in links
        assert not any(link.endswith((".pdf", ".jpg", ".png", ".gif", ".zip", ".mp4")) for link in links)
    
    def test_extract_links_deduplicates(self, crawler):
        """Should return unique links."""
        html = '''
        <html><body>
            <a href="/page">Link 1</a>
            <a href="/page">Link 2</a>
            <a href="/page">Link 3</a>
        </body></html>
        '''
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        assert len(links) == len(set(links))
    
    def test_extract_links_empty_html(self, crawler):
        """Should handle HTML with no links."""
        html = '<html><body><p>No links here</p></body></html>'
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        assert links == []


# ==================== _fetch_page Tests ====================

class TestFetchPage:
    """Tests for page fetching functionality."""
    
    @pytest.mark.asyncio
    async def test_fetch_page_success(self, crawler, sample_html):
        """Should successfully fetch and parse a page."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html; charset=utf-8"}
        mock_response.text = AsyncMock(return_value=sample_html)
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/page")
        
        assert result is not None
        assert result["url"] == "https://example.com/page"
        assert "Main Title" in result["content"] or "main content" in result["content"].lower()
        assert result["title"] == "Test Page"
    
    @pytest.mark.asyncio
    async def test_fetch_page_403_forbidden(self, crawler):
        """Should handle 403 forbidden responses."""
        mock_response = AsyncMock()
        mock_response.status = 403
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/blocked")
        
        assert result is None
        assert any("forbidden" in err.lower() for err in crawler.errors)
    
    @pytest.mark.asyncio
    async def test_fetch_page_429_rate_limited(self, crawler):
        """Should handle 429 rate limit responses."""
        mock_response = AsyncMock()
        mock_response.status = 429
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/limited")
        
        assert result is None
        assert any("rate" in err.lower() or "bot" in err.lower() for err in crawler.errors)
    
    @pytest.mark.asyncio
    async def test_fetch_page_404_not_found(self, crawler):
        """Should handle 404 responses."""
        mock_response = AsyncMock()
        mock_response.status = 404
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/missing")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_fetch_page_non_html_content(self, crawler):
        """Should skip non-HTML content types."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "application/json"}
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/api/data")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_fetch_page_minimal_content(self, crawler, minimal_html):
        """Should skip pages with minimal content."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=minimal_html)
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/empty")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_fetch_page_extracts_title_from_h1(self, crawler):
        """Should extract title from h1 if title tag missing."""
        html = '<html><body><h1>Page Heading</h1><p>' + 'Content. ' * 50 + '</p></body></html>'
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=html)
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/page")
        
        assert result is not None
        assert result["title"] == "Page Heading"
    
    @pytest.mark.asyncio
    async def test_fetch_page_removes_scripts_and_styles(self, crawler, sample_html):
        """Should remove script and style content from text."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=sample_html)
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/page")
        
        assert result is not None
        assert "console.log" not in result["content"]
        assert "color: red" not in result["content"]
    
    @pytest.mark.asyncio
    async def test_fetch_page_includes_metadata(self, crawler, sample_html):
        """Should include content metadata."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=sample_html)
        
        mock_session = MagicMock()
        mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/page")
        
        assert result is not None
        assert "metadata" in result
        assert "content_length" in result["metadata"]
        assert "word_count" in result["metadata"]


# ==================== Crawl Flow Tests ====================

class TestCrawlFlow:
    """Tests for the main crawl functionality."""
    
    def test_crawler_initial_state(self, crawler):
        """Crawler should start with empty state."""
        assert crawler.visited_urls == set()
        assert crawler.pages == []
        assert crawler.errors == []
        assert crawler.job_id is None
    
    def test_get_stats(self, crawler):
        """Should return correct statistics."""
        crawler.visited_urls = {"url1", "url2", "url3"}
        crawler.pages = [{"url": "url1"}, {"url": "url2"}]
        crawler.errors = ["Error 1", "Error 2"]
        
        stats = crawler.get_stats()
        
        assert stats["pages_crawled"] == 2
        assert stats["urls_visited"] == 3
        assert stats["errors"] == 2
        assert len(stats["error_messages"]) == 2
    
    def test_get_stats_limits_errors(self, crawler):
        """Should limit error messages to first 10."""
        crawler.errors = [f"Error {i}" for i in range(20)]
        
        stats = crawler.get_stats()
        
        assert len(stats["error_messages"]) == 10
    
    @pytest.mark.asyncio
    async def test_crawl_respects_max_pages(self, crawler):
        """Should stop crawling when max_pages reached."""
        pages_html = '''
        <html>
        <head><title>Page</title></head>
        <body>
            <main>
                <p>''' + 'Content here. ' * 50 + '''</p>
                <a href="/page1">Link 1</a>
                <a href="/page2">Link 2</a>
                <a href="/page3">Link 3</a>
                <a href="/page4">Link 4</a>
                <a href="/page5">Link 5</a>
            </main>
        </body>
        </html>
        '''
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=pages_html)
        
        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = MagicMock()
            mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock()
            mock_session_class.return_value = mock_session
            
            with patch("asyncio.sleep", new_callable=AsyncMock):
                result = await crawler.crawl("https://example.com", max_pages=2)
        
        assert len(result) <= 2
    
    @pytest.mark.asyncio
    async def test_crawl_tracks_visited_urls(self, crawler):
        """Should track visited URLs to prevent duplicates."""
        html = '''
        <html>
        <head><title>Page</title></head>
        <body>
            <main>
                <p>''' + 'Content. ' * 50 + '''</p>
                <a href="/">Home</a>
                <a href="/">Home Again</a>
            </main>
        </body>
        </html>
        '''
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=html)
        
        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = MagicMock()
            mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock()
            mock_session_class.return_value = mock_session
            
            with patch("asyncio.sleep", new_callable=AsyncMock):
                await crawler.crawl("https://example.com", max_pages=5)
        
        assert "https://example.com" in crawler.visited_urls
    
    @pytest.mark.asyncio
    async def test_crawl_uses_patterns(self, crawler):
        """Should respect include/exclude patterns during crawl."""
        html = '''
        <html>
        <head><title>Page</title></head>
        <body>
            <main>
                <p>''' + 'Content. ' * 50 + '''</p>
                <a href="/blog/post1">Blog Post</a>
                <a href="/admin/dashboard">Admin</a>
            </main>
        </body>
        </html>
        '''
        
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.headers = {"content-type": "text/html"}
        mock_response.text = AsyncMock(return_value=html)
        
        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = MagicMock()
            mock_session.get = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response)))
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock()
            mock_session_class.return_value = mock_session
            
            with patch("asyncio.sleep", new_callable=AsyncMock):
                await crawler.crawl(
                    "https://example.com",
                    max_pages=10,
                    include_patterns=[r"/blog/"],
                    exclude_patterns=[r"/admin/"]
                )
        
        for url in crawler.visited_urls:
            assert "/admin/" not in url


# ==================== URL Normalization Tests ====================

class TestURLNormalization:
    """Tests for URL handling and normalization."""
    
    def test_extract_links_normalizes_trailing_slash(self, crawler):
        """Should handle URLs with and without trailing slashes consistently."""
        html = '''
        <html><body>
            <a href="/page/">With Slash</a>
            <a href="/page">Without Slash</a>
        </body></html>
        '''
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        # Both should be extracted (deduplication happens at crawl level)
        assert len(links) >= 1
    
    def test_extract_links_handles_protocol_relative(self, crawler):
        """Should handle protocol-relative URLs."""
        html = '<html><body><a href="//example.com/page">Link</a></body></html>'
        base_domain = "https://example.com"
        current_url = "https://example.com/"
        
        links = crawler._extract_links(html, base_domain, current_url)
        
        # Protocol-relative should be converted to absolute
        assert any("example.com/page" in link for link in links)


# ==================== Error Handling Tests ====================

class TestErrorHandling:
    """Tests for error handling in crawler."""
    
    @pytest.mark.asyncio
    async def test_fetch_page_handles_exception(self, crawler):
        """Should handle exceptions gracefully."""
        mock_session = MagicMock()
        mock_session.get = MagicMock(side_effect=Exception("Network error"))
        
        result = await crawler._fetch_page(mock_session, "https://example.com/error")
        
        assert result is None
    
    def test_crawler_tracks_errors(self, crawler):
        """Should track errors during crawl."""
        crawler.errors.append("Test error 1")
        crawler.errors.append("Test error 2")
        
        stats = crawler.get_stats()
        
        assert stats["errors"] == 2
        assert "Test error 1" in stats["error_messages"]
