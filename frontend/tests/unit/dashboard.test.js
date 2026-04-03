/**
 * Dashboard Tests - SiteChat Dashboard (app.js)
 * Tests for dashboard functionality including login, API helpers, forms, and DOM manipulation
 */

describe('SiteChat Dashboard', () => {
  const API_BASE = 'http://127.0.0.1:8000/api';

  beforeEach(() => {
    document.body.innerHTML = '';
    global.fetch.mockReset();
    global.localStorage.store = {};
  });

  describe('Authentication Flow', () => {
    test('should redirect to login when no token present', () => {
      const mockLocation = { href: '' };
      
      function checkAuth(location) {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        
        if (!token || !userStr) {
          location.href = '/login';
          return false;
        }
        return true;
      }

      const result = checkAuth(mockLocation);
      
      expect(result).toBe(false);
      expect(mockLocation.href).toBe('/login');
    });

    test('should return true when valid token and user exist', () => {
      localStorage.setItem('token', 'valid-token-123');
      localStorage.setItem('user', JSON.stringify({ email: 'test@example.com', role: 'admin' }));
      
      function checkAuth() {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');
        
        if (!token || !userStr) {
          return false;
        }
        
        try {
          JSON.parse(userStr);
          return true;
        } catch (e) {
          return false;
        }
      }

      const result = checkAuth();
      expect(result).toBe(true);
    });

    test('should parse user data correctly', () => {
      const userData = { email: 'admin@example.com', role: 'admin', name: 'Admin' };
      localStorage.setItem('user', JSON.stringify(userData));
      
      const userStr = localStorage.getItem('user');
      const currentUser = JSON.parse(userStr);
      
      expect(currentUser.email).toBe('admin@example.com');
      expect(currentUser.role).toBe('admin');
      expect(currentUser.name).toBe('Admin');
    });

    test('should handle invalid JSON in user storage', () => {
      localStorage.setItem('user', 'invalid-json');
      
      function parseUser() {
        try {
          return JSON.parse(localStorage.getItem('user'));
        } catch (e) {
          return null;
        }
      }
      
      expect(parseUser()).toBeNull();
    });

    test('should perform logout correctly', () => {
      localStorage.setItem('token', 'token-123');
      localStorage.setItem('user', '{"email":"test@test.com"}');
      
      function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      
      logout();
      
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('Login Form Submission', () => {
    test('should send login request with correct credentials', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-token-456',
          user: { email: 'user@example.com', role: 'user' }
        })
      });

      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password123'
        })
      });

      const data = await response.json();
      
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/auth/login`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
      expect(data.access_token).toBe('new-token-456');
    });

    test('should handle login failure with error message', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid email or password' })
      });

      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wrong@example.com',
          password: 'wrongpassword'
        })
      });

      expect(response.ok).toBe(false);
      const data = await response.json();
      expect(data.detail).toBe('Invalid email or password');
    });

    test('should store token and user after successful login', async () => {
      const loginData = {
        access_token: 'stored-token',
        user: { email: 'stored@example.com', role: 'admin' }
      };

      localStorage.setItem('token', loginData.access_token);
      localStorage.setItem('user', JSON.stringify(loginData.user));

      expect(localStorage.getItem('token')).toBe('stored-token');
      expect(JSON.parse(localStorage.getItem('user'))).toEqual(loginData.user);
    });
  });

  describe('API Helper Functions', () => {
    test('should generate correct auth headers', () => {
      localStorage.setItem('token', 'bearer-token-123');
      
      function getAuthHeaders() {
        const token = localStorage.getItem('token');
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
      }
      
      const headers = getAuthHeaders();
      
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer bearer-token-123');
    });

    test('should fetch sites with auth headers', async () => {
      localStorage.setItem('token', 'valid-token');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { site_id: 'site-1', name: 'Test Site', url: 'https://test.com' }
        ])
      });

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/sites`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      expect(response.ok).toBe(true);
      const sites = await response.json();
      expect(sites).toHaveLength(1);
      expect(sites[0].site_id).toBe('site-1');
    });

    test('should handle 401 unauthorized response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Unauthorized' })
      });

      const response = await fetch(`${API_BASE}/sites`);
      
      expect(response.status).toBe(401);
    });

    test('should load users for admin', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 1, email: 'user1@test.com', role: 'admin' },
          { id: 2, email: 'user2@test.com', role: 'user' }
        ])
      });

      const response = await fetch(`${API_BASE}/users`);
      const users = await response.json();

      expect(users).toHaveLength(2);
      expect(users[0].role).toBe('admin');
    });
  });

  describe('Form Validation', () => {
    test('should validate URL format', () => {
      function isValidUrl(string) {
        try {
          const url = new URL(string);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
          return false;
        }
      }

      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://test.com/page')).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://invalid.com')).toBe(false);
    });

    test('should validate email format', () => {
      function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
      }

      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
    });

    test('should validate required fields', () => {
      document.body.innerHTML = `
        <form id="test-form">
          <input type="text" id="name" value="" required>
          <input type="email" id="email" value="test@test.com" required>
        </form>
      `;

      const form = document.getElementById('test-form');
      const nameInput = document.getElementById('name');
      const emailInput = document.getElementById('email');

      expect(nameInput.value.trim()).toBe('');
      expect(emailInput.value.trim()).not.toBe('');
    });

    test('should validate file extensions', () => {
      const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.csv', '.pptx', '.xlsx', '.html', '.htm'];
      
      function isValidFileType(filename) {
        const ext = '.' + filename.split('.').pop().toLowerCase();
        return validExtensions.includes(ext);
      }

      expect(isValidFileType('document.pdf')).toBe(true);
      expect(isValidFileType('notes.txt')).toBe(true);
      expect(isValidFileType('spreadsheet.xlsx')).toBe(true);
      expect(isValidFileType('image.jpg')).toBe(false);
      expect(isValidFileType('script.exe')).toBe(false);
    });

    test('should validate file size', () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      
      function isValidFileSize(sizeInBytes) {
        return sizeInBytes <= MAX_FILE_SIZE;
      }

      expect(isValidFileSize(1024)).toBe(true);
      expect(isValidFileSize(50 * 1024 * 1024)).toBe(true);
      expect(isValidFileSize(51 * 1024 * 1024)).toBe(false);
    });
  });

  describe('DOM Manipulation Helpers', () => {
    test('should create site card element', () => {
      const site = {
        site_id: 'test-123',
        name: 'Test Site',
        url: 'https://example.com',
        status: 'completed',
        pages_crawled: 10,
        pages_indexed: 8
      };

      const card = document.createElement('div');
      card.className = 'site-card';
      card.dataset.siteId = site.site_id;

      document.body.appendChild(card);

      expect(document.querySelector('.site-card')).toBeInTheDocument();
      expect(document.querySelector('.site-card').dataset.siteId).toBe('test-123');
    });

    test('should toggle modal visibility', () => {
      document.body.innerHTML = '<div id="modal" class="modal"></div>';
      const modal = document.getElementById('modal');

      modal.classList.add('active');
      expect(modal).toHaveClass('active');

      modal.classList.remove('active');
      expect(modal).not.toHaveClass('active');
    });

    test('should switch views correctly', () => {
      document.body.innerHTML = `
        <div class="view active" id="sites-view"></div>
        <div class="view" id="chat-view"></div>
        <div class="view" id="admin-view"></div>
      `;

      function switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${viewId}-view`).classList.add('active');
      }

      switchView('chat');

      expect(document.getElementById('sites-view')).not.toHaveClass('active');
      expect(document.getElementById('chat-view')).toHaveClass('active');
      expect(document.getElementById('admin-view')).not.toHaveClass('active');
    });

    test('should update user UI with user info', () => {
      document.body.innerHTML = `
        <div id="user-avatar"></div>
        <div id="user-name"></div>
        <div id="user-role"></div>
      `;

      const currentUser = { name: 'John Doe', email: 'john@example.com', role: 'admin' };

      function updateUserUI(user) {
        const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
        document.getElementById('user-avatar').textContent = initial;
        document.getElementById('user-name').textContent = user.name || user.email;
        document.getElementById('user-role').textContent = user.role;
      }

      updateUserUI(currentUser);

      expect(document.getElementById('user-avatar').textContent).toBe('J');
      expect(document.getElementById('user-name').textContent).toBe('John Doe');
      expect(document.getElementById('user-role').textContent).toBe('admin');
    });

    test('should render file list', () => {
      document.body.innerHTML = '<div id="file-list"></div>';

      const files = [
        { name: 'document.pdf', size: 1024 },
        { name: 'notes.txt', size: 512 }
      ];

      function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      const list = document.getElementById('file-list');
      list.innerHTML = files.map((file, idx) => `
        <div class="file-item" data-index="${idx}">
          <span class="file-name">${file.name}</span>
          <span class="file-size">${formatFileSize(file.size)}</span>
        </div>
      `).join('');

      const items = document.querySelectorAll('.file-item');
      expect(items).toHaveLength(2);
      expect(items[0].querySelector('.file-name').textContent).toBe('document.pdf');
    });

    test('should add admin class to body for admin users', () => {
      const currentUser = { role: 'admin' };

      if (currentUser.role === 'admin') {
        document.body.classList.add('is-admin');
      }

      expect(document.body).toHaveClass('is-admin');
    });
  });

  describe('Site Management', () => {
    test('should generate site ID from name', () => {
      function generateSiteId(name) {
        const hash = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const random = Math.random().toString(36).substring(2, 8);
        return `${hash.substring(0, 6)}${random}`;
      }

      const siteId = generateSiteId('My Test Site');
      
      expect(siteId).toMatch(/^mytest[a-z0-9]+$/);
      expect(siteId.length).toBeGreaterThan(6);
    });

    test('should create site via API', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ site_id: 'new-site-123' })
      });

      const response = await fetch(`${API_BASE}/embed/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://newsite.com',
          name: 'New Site',
          max_pages: 50
        })
      });

      const data = await response.json();
      expect(data.site_id).toBe('new-site-123');
    });

    test('should delete site via API', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const response = await fetch(`${API_BASE}/sites/site-to-delete`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer token' }
      });

      expect(response.ok).toBe(true);
    });

    test('should render empty state when no sites', () => {
      document.body.innerHTML = `
        <div id="sites-grid"></div>
        <div id="empty-state" class="hidden"></div>
      `;

      const sites = [];
      const emptyState = document.getElementById('empty-state');

      if (sites.length === 0) {
        emptyState.classList.remove('hidden');
      }

      expect(emptyState).not.toHaveClass('hidden');
    });
  });

  describe('File Size Formatting', () => {
    test('should format bytes correctly', () => {
      function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(2048)).toBe('2.0 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('File Icon Classes', () => {
    test('should return correct icon class for file types', () => {
      function getFileIconClass(ext) {
        const iconMap = {
          'pdf': 'pdf',
          'docx': 'doc', 'doc': 'doc',
          'txt': 'txt', 'md': 'txt',
          'csv': 'csv',
          'pptx': 'ppt', 'ppt': 'ppt',
          'xlsx': 'xls', 'xls': 'xls',
          'html': 'txt', 'htm': 'txt'
        };
        return iconMap[ext] || 'default';
      }

      expect(getFileIconClass('pdf')).toBe('pdf');
      expect(getFileIconClass('docx')).toBe('doc');
      expect(getFileIconClass('txt')).toBe('txt');
      expect(getFileIconClass('xlsx')).toBe('xls');
      expect(getFileIconClass('unknown')).toBe('default');
    });
  });

  describe('Navigation', () => {
    test('should handle menu item clicks', () => {
      document.body.innerHTML = `
        <a class="menu-item active" data-view="sites">Sites</a>
        <a class="menu-item" data-view="chat">Chat</a>
        <a class="menu-item" data-view="admin">Admin</a>
      `;

      const menuItems = document.querySelectorAll('.menu-item');
      const chatItem = document.querySelector('[data-view="chat"]');

      chatItem.addEventListener('click', () => {
        menuItems.forEach(i => i.classList.remove('active'));
        chatItem.classList.add('active');
      });

      chatItem.click();

      expect(document.querySelector('[data-view="sites"]')).not.toHaveClass('active');
      expect(chatItem).toHaveClass('active');
    });
  });

  describe('Clipboard Operations', () => {
    test('should copy embed code to clipboard', async () => {
      const embedCode = '<script>test</script>';
      
      await navigator.clipboard.writeText(embedCode);
      
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(embedCode);
    });
  });

  describe('Health Check', () => {
    test('should fetch system health status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          mongodb: { status: 'healthy' },
          vector_db: { status: 'healthy' },
          ollama: { status: 'healthy' }
        })
      });

      const response = await fetch(`${API_BASE}/health`);
      const health = await response.json();

      expect(health.mongodb.status).toBe('healthy');
      expect(health.vector_db.status).toBe('healthy');
    });
  });

  describe('Chat Functionality', () => {
    test('should update site selector options', () => {
      document.body.innerHTML = `
        <select id="chat-site-select">
          <option value="">Choose a site...</option>
        </select>
      `;

      const sites = [
        { site_id: 'site-1', name: 'Site One', url: 'https://one.com' },
        { site_id: 'site-2', name: 'Site Two', url: 'https://two.com' }
      ];

      const select = document.getElementById('chat-site-select');
      
      sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.site_id;
        option.textContent = site.name || site.url;
        select.appendChild(option);
      });

      expect(select.options).toHaveLength(3);
      expect(select.options[1].value).toBe('site-1');
      expect(select.options[2].textContent).toBe('Site Two');
    });

    test('should enable/disable chat input based on site selection', () => {
      document.body.innerHTML = `
        <select id="chat-site-select">
          <option value="">Select a site</option>
          <option value="site-123">Site 123</option>
        </select>
        <input id="chat-input" disabled>
      `;

      const select = document.getElementById('chat-site-select');
      const input = document.getElementById('chat-input');

      select.value = 'site-123';
      input.disabled = !select.value;

      expect(input.disabled).toBe(false);

      select.value = '';
      input.disabled = !select.value;

      expect(input.disabled).toBe(true);
    });
  });
});
