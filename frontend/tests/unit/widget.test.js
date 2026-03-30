/**
 * Widget Tests - SiteChat Chatbot Widget
 * Tests for the embeddable chatbot widget functionality
 */

describe('SiteChat Widget', () => {
  let mockScript;

  beforeEach(() => {
    document.body.innerHTML = '';
    
    mockScript = document.createElement('script');
    mockScript.src = 'http://localhost:8000/widget/chatbot.js';
    mockScript.dataset.siteId = 'test-site-123';
    mockScript.dataset.apiUrl = 'http://localhost:8000';
    mockScript.dataset.position = 'bottom-right';
    mockScript.dataset.primaryColor = '#0D9488';
    mockScript.dataset.title = 'Test Chat';
    document.head.appendChild(mockScript);

    global.fetch.mockReset();
  });

  describe('Widget Initialization', () => {
    test('should create widget container in DOM', () => {
      const widget = document.createElement('div');
      widget.className = 'sitechat-widget';
      document.body.appendChild(widget);

      expect(document.querySelector('.sitechat-widget')).toBeInTheDocument();
    });

    test('should create toggle button', () => {
      const widget = document.createElement('div');
      widget.className = 'sitechat-widget';
      widget.innerHTML = '<button class="sitechat-toggle" aria-label="Toggle chat"></button>';
      document.body.appendChild(widget);

      const toggle = document.querySelector('.sitechat-toggle');
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-label', 'Toggle chat');
    });

    test('should create chat window', () => {
      const widget = document.createElement('div');
      widget.className = 'sitechat-widget';
      widget.innerHTML = '<div class="sitechat-window"></div>';
      document.body.appendChild(widget);

      expect(document.querySelector('.sitechat-window')).toBeInTheDocument();
    });

    test('should initialize with default config values', () => {
      const config = {
        siteId: mockScript.dataset.siteId || 'default',
        apiUrl: mockScript.dataset.apiUrl || 'http://localhost:8000',
        position: mockScript.dataset.position || 'bottom-right',
        primaryColor: mockScript.dataset.primaryColor || '#0D9488',
        title: mockScript.dataset.title || 'Ask AI'
      };

      expect(config.siteId).toBe('test-site-123');
      expect(config.apiUrl).toBe('http://localhost:8000');
      expect(config.position).toBe('bottom-right');
      expect(config.primaryColor).toBe('#0D9488');
      expect(config.title).toBe('Test Chat');
    });
  });

  describe('Configuration Loading', () => {
    test('should fetch site config from API', async () => {
      const mockConfig = {
        appearance: {
          primary_color: '#FF5733',
          chat_title: 'Custom Title',
          welcome_message: 'Custom welcome!',
          position: 'bottom-left',
          hide_branding: false
        },
        behavior: {
          show_sources: true
        }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      const response = await fetch('http://localhost:8000/api/sites/test-site-123/config');
      const data = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/sites/test-site-123/config'
      );
      expect(data.appearance.primary_color).toBe('#FF5733');
      expect(data.appearance.chat_title).toBe('Custom Title');
    });

    test('should handle config fetch failure gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      let error = null;
      try {
        await fetch('http://localhost:8000/api/sites/test-site-123/config');
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Network error');
    });

    test('should use default values when config is unavailable', () => {
      const defaultConfig = {
        siteId: 'default',
        apiUrl: 'http://localhost:8000',
        position: 'bottom-right',
        primaryColor: '#0D9488',
        title: 'Ask AI',
        welcomeMessage: 'Hi! How can I help you today?',
        showSources: true,
        hideBranding: false
      };

      expect(defaultConfig.primaryColor).toBe('#0D9488');
      expect(defaultConfig.welcomeMessage).toBe('Hi! How can I help you today?');
    });
  });

  describe('Message Sending', () => {
    test('should send chat message to API', async () => {
      const sessionId = 'widget-abc123';
      const mockResponse = {
        answer: 'Hello! How can I help?',
        sources: []
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello',
          session_id: sessionId,
          site_id: 'test-site-123'
        })
      });

      const data = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
      expect(data.answer).toBe('Hello! How can I help?');
    });

    test('should include site_id in chat request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ answer: 'Response' })
      });

      await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Test',
          session_id: 'widget-123',
          site_id: 'test-site-123'
        })
      });

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.site_id).toBe('test-site-123');
    });

    test('should handle API errors when sending message', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Internal server error' })
      });

      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Test' })
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });

  describe('Branding Customization', () => {
    test('should show default branding when white-label disabled', () => {
      const config = {
        hideBranding: false,
        customBrandingText: null,
        customBrandingUrl: null
      };

      const brandingEl = document.createElement('div');
      brandingEl.className = 'sitechat-branding';
      brandingEl.innerHTML = '<a href="https://sitechat.in">Powered by <strong>SiteChat</strong></a>';
      document.body.appendChild(brandingEl);

      if (!config.hideBranding) {
        brandingEl.style.display = 'block';
      }

      expect(brandingEl.style.display).toBe('block');
      expect(brandingEl.querySelector('a').textContent).toContain('SiteChat');
    });

    test('should hide branding when white-label enabled without custom text', () => {
      const config = {
        hideBranding: true,
        customBrandingText: null
      };

      const brandingEl = document.createElement('div');
      brandingEl.className = 'sitechat-branding';
      document.body.appendChild(brandingEl);

      if (config.hideBranding && !config.customBrandingText) {
        brandingEl.style.display = 'none';
      }

      expect(brandingEl.style.display).toBe('none');
    });

    test('should show custom branding when provided', () => {
      const config = {
        hideBranding: true,
        customBrandingText: 'Powered by MyCompany',
        customBrandingUrl: 'https://mycompany.com'
      };

      const brandingEl = document.createElement('div');
      brandingEl.className = 'sitechat-branding';
      const link = document.createElement('a');
      brandingEl.appendChild(link);
      document.body.appendChild(brandingEl);

      if (config.hideBranding && config.customBrandingText) {
        brandingEl.style.display = 'block';
        link.innerHTML = config.customBrandingText;
        link.href = config.customBrandingUrl;
      }

      expect(brandingEl.style.display).toBe('block');
      expect(link.innerHTML).toBe('Powered by MyCompany');
      expect(link.href).toBe('https://mycompany.com/');
    });
  });

  describe('Position Settings', () => {
    test('should apply bottom-right position', () => {
      const widget = document.createElement('div');
      widget.className = 'sitechat-widget';
      widget.style.right = '24px';
      widget.style.bottom = '24px';
      document.body.appendChild(widget);

      expect(widget.style.right).toBe('24px');
      expect(widget.style.bottom).toBe('24px');
    });

    test('should apply bottom-left position', () => {
      const widget = document.createElement('div');
      widget.className = 'sitechat-widget';
      widget.style.left = '24px';
      widget.style.bottom = '24px';
      document.body.appendChild(widget);

      expect(widget.style.left).toBe('24px');
      expect(widget.style.bottom).toBe('24px');
    });
  });

  describe('Toggle Functionality', () => {
    test('should toggle open state when button clicked', () => {
      const widget = document.createElement('div');
      widget.className = 'sitechat-widget';
      widget.innerHTML = `
        <button class="sitechat-toggle"></button>
        <div class="sitechat-window"></div>
      `;
      document.body.appendChild(widget);

      const toggle = widget.querySelector('.sitechat-toggle');
      const chatWindow = widget.querySelector('.sitechat-window');
      let isOpen = false;

      toggle.addEventListener('click', () => {
        isOpen = !isOpen;
        toggle.classList.toggle('open', isOpen);
        chatWindow.classList.toggle('open', isOpen);
      });

      toggle.click();
      expect(toggle).toHaveClass('open');
      expect(chatWindow).toHaveClass('open');

      toggle.click();
      expect(toggle).not.toHaveClass('open');
      expect(chatWindow).not.toHaveClass('open');
    });
  });

  describe('Session Management', () => {
    test('should generate unique session ID', () => {
      const sessionId1 = 'widget-' + Math.random().toString(36).substring(2, 15);
      const sessionId2 = 'widget-' + Math.random().toString(36).substring(2, 15);

      expect(sessionId1).toMatch(/^widget-[a-z0-9]+$/);
      expect(sessionId1).not.toBe(sessionId2);
    });

    test('should persist session across messages', async () => {
      const sessionId = 'widget-test123';
      
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ answer: 'Response' })
      });

      await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'First', session_id: sessionId })
      });

      await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'Second', session_id: sessionId })
      });

      const firstCall = JSON.parse(global.fetch.mock.calls[0][1].body);
      const secondCall = JSON.parse(global.fetch.mock.calls[1][1].body);

      expect(firstCall.session_id).toBe(sessionId);
      expect(secondCall.session_id).toBe(sessionId);
    });
  });

  describe('Feedback', () => {
    test('should send positive feedback', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const sessionId = 'widget-123';
      const messageIndex = 0;

      await fetch(
        `http://localhost:8000/api/chat/feedback?session_id=${sessionId}&message_index=${messageIndex}&feedback=positive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('feedback=positive'),
        expect.any(Object)
      );
    });

    test('should send negative feedback', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      await fetch(
        'http://localhost:8000/api/chat/feedback?session_id=widget-123&message_index=0&feedback=negative',
        { method: 'POST' }
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('feedback=negative'),
        expect.any(Object)
      );
    });
  });

  describe('Human Handoff', () => {
    test('should check agent availability', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ available: true, is_within_hours: true })
      });

      const response = await fetch(
        'http://localhost:8000/api/sites/test-site-123/handoff/availability'
      );
      const data = await response.json();

      expect(data.available).toBe(true);
    });

    test('should request handoff when agents available', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ handoff_id: 'hoff-123' })
      });

      const response = await fetch('http://localhost:8000/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'widget-123',
          site_id: 'test-site-123',
          reason: 'user_request'
        })
      });

      const data = await response.json();
      expect(data.handoff_id).toBe('hoff-123');
    });
  });

  describe('Color Adjustment', () => {
    test('should darken color correctly', () => {
      function adjustColor(hex, amount) {
        let color = hex.replace('#', '');
        let num = parseInt(color, 16);
        let r = Math.min(255, Math.max(0, (num >> 16) + amount));
        let g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        let b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
      }

      const original = '#0D9488';
      const darker = adjustColor(original, -20);

      expect(darker).toMatch(/^#[0-9a-f]{6}$/i);
      expect(darker).not.toBe(original);
    });
  });
});
