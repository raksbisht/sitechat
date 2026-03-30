const API_BASE = window.location.origin + '/api';

let sites = [];
let currentSiteId = null;
let currentUser = null;
let currentAnalyticsSite = '';
let sessionId = 'session-' + Math.random().toString(36).substring(2, 15);

// File upload state
let selectedFiles = [];
let selectedFilesBoth = [];
let selectedFilesExisting = [];
let currentSourceType = null;

const elements = {
    sitesGrid: document.getElementById('sites-grid'),
    sitesList: document.getElementById('sites-list'),
    emptyState: document.getElementById('empty-state'),
    detailContent: document.getElementById('detail-content'),
    detailEmptyState: document.getElementById('detail-empty-state'),
    detailTabContent: document.getElementById('detail-tab-content'),
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    chatSiteSelect: document.getElementById('chat-site-select'),
    newChatBtn: document.getElementById('new-chat-btn'),
    addSiteBtn: document.getElementById('add-site-btn'),
    emptyAddBtn: document.getElementById('empty-add-btn'),
    addSiteModal: document.getElementById('add-site-modal'),
    closeModal: document.getElementById('close-modal'),
    siteDetailsPanel: document.getElementById('site-details-panel'),
    sidePanelOverlay: document.getElementById('side-panel-overlay'),
    closeDetailsPanel: document.getElementById('close-details-panel'),
    statMsgsToday: document.getElementById('stat-msgs-today'),
    statAvgMsgs: document.getElementById('stat-avg-msgs'),
    statSatisfaction: document.getElementById('stat-satisfaction'),
    healthMongodb: document.getElementById('health-mongodb'),
    healthVector: document.getElementById('health-vector'),
    healthOllama: document.getElementById('health-ollama'),
    refreshHealth: document.getElementById('refresh-health'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userRole: document.getElementById('user-role'),
    logoutBtn: document.getElementById('logout-btn'),
    uploadModal: document.getElementById('upload-modal'),
    documentsList: document.getElementById('documents-list')
};

function scheduleInitializeApp() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
    } else {
        queueMicrotask(() => initializeApp());
    }
}
scheduleInitializeApp();

function formatApiErrorDetail(data) {
    if (!data || data.detail == null) return 'Request failed.';
    const d = data.detail;
    if (typeof d === 'string') return d;
    if (d.message) return d.message;
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
    return 'Request failed.';
}

function syncBodyRoleClasses() {
    document.body.classList.remove('is-admin', 'is-user', 'is-agent');
    if (!currentUser?.role) return;
    const r = String(currentUser.role).toLowerCase();
    if (r === 'admin') document.body.classList.add('is-admin');
    else if (r === 'user') document.body.classList.add('is-user');
    else if (r === 'agent') document.body.classList.add('is-agent');
}

/** Prefer getAttribute — dataset.view can be unreliable for data-view in some browsers. */
function navDataView(el) {
    if (!el || !el.getAttribute) return '';
    return String(el.getAttribute('data-view') || '').trim();
}

function isDashboardAgent() {
    return String(currentUser?.role || '').toLowerCase() === 'agent';
}

function syncSidebarActiveNav(viewId) {
    document.querySelectorAll('.menu-item').forEach((i) => {
        i.classList.toggle('active', navDataView(i) === viewId);
    });
    document.querySelectorAll('.sidebar-util-link').forEach((l) => {
        l.classList.toggle('active', navDataView(l) === viewId);
    });
}

async function refreshCurrentUserFromServer() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
        if (res.status === 401) {
            logout();
            return false;
        }
        if (!res.ok) return true;
        const data = await res.json();
        currentUser = {
            ...currentUser,
            id: data.id,
            email: data.email,
            name: data.name,
            role: data.role,
            created_at: data.created_at,
            assigned_site_ids: data.assigned_site_ids || [],
            must_change_password: !!data.must_change_password,
        };
        localStorage.setItem('user', JSON.stringify(currentUser));
        syncBodyRoleClasses();
        return true;
    } catch {
        return true;
    }
}

function runAdminPasswordGate() {
    return new Promise((resolve) => {
        document.body.classList.add('admin-password-gate-active');
        const appRoot = document.querySelector('.app');
        if (appRoot) appRoot.setAttribute('inert', '');

        const el = document.createElement('div');
        el.id = 'admin-password-gate';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'admin-password-gate-title');
        el.innerHTML = `
          <div class="admin-password-gate-card">
            <h1 id="admin-password-gate-title">Set your password</h1>
            <p class="admin-password-gate-hint">For security, choose a new password before using the dashboard.</p>
            <form id="admin-password-gate-form">
              <label class="admin-password-gate-label" for="admin-gate-pw">New password</label>
              <input type="password" id="admin-gate-pw" class="admin-password-gate-input" autocomplete="new-password" required minlength="8" />
              <label class="admin-password-gate-label" for="admin-gate-pw2">Confirm password</label>
              <input type="password" id="admin-gate-pw2" class="admin-password-gate-input" autocomplete="new-password" required minlength="8" />
              <p class="admin-password-gate-error" id="admin-gate-error" role="alert" hidden></p>
              <button type="submit" class="admin-password-gate-submit" id="admin-gate-submit">Save and continue</button>
            </form>
          </div>
        `;
        document.body.appendChild(el);

        const form = el.querySelector('#admin-password-gate-form');
        const errEl = el.querySelector('#admin-gate-error');
        const pw1 = el.querySelector('#admin-gate-pw');
        const pw2 = el.querySelector('#admin-gate-pw2');
        pw1.focus();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errEl.hidden = true;
            const p1 = pw1.value;
            const p2 = pw2.value;
            if (p1 !== p2) {
                errEl.textContent = 'Passwords do not match.';
                errEl.hidden = false;
                return;
            }
            const btn = el.querySelector('#admin-gate-submit');
            btn.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/auth/me`, {
                    method: 'PATCH',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_password: p1 }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    errEl.textContent = formatApiErrorDetail(data);
                    errEl.hidden = false;
                    btn.disabled = false;
                    return;
                }
                currentUser = {
                    ...currentUser,
                    ...data,
                    assigned_site_ids: data.assigned_site_ids || [],
                    must_change_password: !!data.must_change_password,
                };
                localStorage.setItem('user', JSON.stringify(currentUser));
                el.remove();
                document.body.classList.remove('admin-password-gate-active');
                if (appRoot) appRoot.removeAttribute('inert');
                updateUserUI();
                resolve();
            } catch {
                errEl.textContent = 'Network error. Try again.';
                errEl.hidden = false;
                btn.disabled = false;
            }
        });
    });
}

async function initializeApp() {
    if (!checkAuth()) return;
    const sessionOk = await refreshCurrentUserFromServer();
    if (!sessionOk) return;
    if (currentUser.role === 'admin' && currentUser.must_change_password) {
        await runAdminPasswordGate();
    }

    initSidebarCollapse();
    initSiteDetailHashRouting();
    setupNavigation();
    setupEventListeners();
    setupAnalyticsPeriodButtons();
    setupCustomizeTabs();
    updateUserUI();
    if (!isDashboardAgent()) {
        loadWhiteLabelConfig();
    }
    await loadSites();
    if (isDashboardAgent()) {
        switchView('handoffs');
    }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
        window.location.href = '/login';
        return false;
    }
    
    try {
        currentUser = JSON.parse(userStr);
        if (!currentUser.assigned_site_ids) {
            currentUser.assigned_site_ids = [];
        }
        
        syncBodyRoleClasses();
        
        return true;
    } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return false;
    }
}

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function updateUserUI() {
    if (!currentUser) return;
    
    const initial = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';
    elements.userAvatar.textContent = initial;
    elements.userName.textContent = currentUser.name || currentUser.email;
    const roleLabels = { admin: 'Admin', agent: 'Support agent', user: 'User' };
    elements.userRole.textContent = roleLabels[currentUser.role] || currentUser.role;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

function setupNavigation() {
    const sidebar = document.getElementById('dashboard-sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('.menu-item[data-view], .sidebar-util-link[data-view]');
            if (!link || !sidebar.contains(link)) return;
            e.preventDefault();
            switchView(navDataView(link));
        });
    }

    // Keyboard shortcuts (g+s, g+c, g+h, comma)
    let gPressed = false;
    let gTimer = null;
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.key === ',' && !e.metaKey && !e.ctrlKey) {
            switchView('settings');
            return;
        }
        if (e.key === 'g') {
            gPressed = true;
            clearTimeout(gTimer);
            gTimer = setTimeout(() => { gPressed = false; }, 1000);
            return;
        }
        if (gPressed) {
            gPressed = false;
            clearTimeout(gTimer);
            const map = { s: 'sites', c: 'conversations', h: 'handoffs' };
            const view = map[e.key];
            if (view) {
                switchView(view);
            }
        }
    });
}

function switchView(viewId) {
    const id = typeof viewId === 'string' ? viewId.trim() : String(viewId || '').trim();
    viewId = id;
    if (!viewId) {
        return;
    }

    if (isDashboardAgent() && !['handoffs', 'conversations', 'sites', 'settings', 'help'].includes(viewId)) {
        viewId = 'handoffs';
    }
    if (viewId === 'team' && isDashboardAgent()) {
        viewId = 'handoffs';
    }

    const viewEl = document.getElementById(`${viewId}-view`);
    if (!viewEl) {
        console.warn('Unknown view:', viewId);
        return;
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    viewEl.classList.add('active');

    syncSidebarActiveNav(viewId);

    // Close handoff SSE streams when navigating away
    if (viewId !== 'handoffs') {
        stopHandoffQueueStream();
        stopHandoffQueuePoll();
        stopMessageStream();
    }
    
    if (viewId === 'sites') {
        loadSites();
    } else if (viewId === 'chat') {
        updateSiteSelector();
    } else if (viewId === 'admin') {
        loadStats();
        loadAnalytics();
    } else if (viewId === 'conversations') {
        initConversationsView();
    } else if (viewId === 'settings') {
        initSettingsPanels();
        initProfileSettings();
        if (!isDashboardAgent()) {
            initWhiteLabelSettings();
            checkHealth();
        }
    } else if (viewId === 'handoffs') {
        populateHandoffSiteFilter();
        initHandoffsView();
    } else if (viewId === 'team') {
        initTeamView();
    }
}

function setupEventListeners() {
    elements.addSiteBtn?.addEventListener('click', openAddSiteModal);
    elements.emptyAddBtn?.addEventListener('click', openAddSiteModal);
    elements.closeModal?.addEventListener('click', closeAddSiteModal);
    elements.closeDetailsPanel?.addEventListener('click', closeSidePanel);
    elements.sidePanelOverlay?.addEventListener('click', closeSidePanel);
    elements.chatForm?.addEventListener('submit', handleChatSubmit);
    elements.chatInput?.addEventListener('input', updateSendButton);
    elements.chatSiteSelect?.addEventListener('change', handleSiteSelect);
    elements.newChatBtn?.addEventListener('click', startNewChat);
    elements.refreshHealth?.addEventListener('click', checkHealth);
    elements.logoutBtn?.addEventListener('click', logout);
    
    document.getElementById('copy-detail-embed')?.addEventListener('click', copyDetailEmbed);
    document.getElementById('detail-get-embed-btn')?.addEventListener('click', () => switchToDetailTab('embed'));
    document.getElementById('detail-breadcrumb-sites')?.addEventListener('click', navigateDetailBreadcrumbSites);
    document.getElementById('recrawl-site')?.addEventListener('click', recrawlSite);
    document.getElementById('delete-site')?.addEventListener('click', deleteSite);
    
    // Source type selection
    document.querySelectorAll('.source-type-card').forEach(card => {
        card.addEventListener('click', () => handleSourceTypeSelect(card.dataset.type));
    });
    
    // Back buttons
    document.getElementById('back-to-source')?.addEventListener('click', showSourceTypeStep);
    document.getElementById('back-to-source-docs')?.addEventListener('click', showSourceTypeStep);
    document.getElementById('back-to-source-both')?.addEventListener('click', showSourceTypeStep);
    
    // Form submissions
    document.getElementById('website-form')?.addEventListener('submit', handleWebsiteSubmit);
    document.getElementById('documents-form')?.addEventListener('submit', handleDocumentsSubmit);
    document.getElementById('both-form')?.addEventListener('submit', handleBothSubmit);
    // member-form submit is wired in initTeamView
    
    // File upload zones
    setupUploadZone('upload-zone', 'file-input', 'file-list', 'selectedFiles');
    setupUploadZone('upload-zone-both', 'file-input-both', 'file-list-both', 'selectedFilesBoth');
    setupUploadZone('upload-zone-existing', 'file-input-existing', 'file-list-existing', 'selectedFilesExisting');
    
    // Form tabs for "Both" option
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', () => switchFormTab(tab.dataset.tab));
    });
    
    // Upload modal for existing sites
    document.getElementById('add-documents-btn')?.addEventListener('click', openUploadModal);
    document.getElementById('close-upload-modal')?.addEventListener('click', closeUploadModal);
    document.getElementById('cancel-upload-modal')?.addEventListener('click', closeUploadModal);
    document.getElementById('upload-form')?.addEventListener('submit', handleExistingUpload);
    
    // Modal backdrop clicks
    elements.addSiteModal?.addEventListener('click', (e) => {
        if (e.target === elements.addSiteModal) closeAddSiteModal();
    });
    elements.uploadModal?.addEventListener('click', (e) => {
        if (e.target === elements.uploadModal) closeUploadModal();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (elements.siteDetailsPanel?.classList.contains('active')) {
                closeSidePanel();
            } else if (elements.addSiteModal?.classList.contains('active')) {
                closeAddSiteModal();
            } else if (elements.uploadModal?.classList.contains('active')) {
                closeUploadModal();
            }
        }
        const tag = e.target && e.target.tagName;
        const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
        if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !inField) {
            const toggle = document.getElementById('sidebar-toggle');
            if (toggle && window.matchMedia('(min-width: 769px)').matches) {
                e.preventDefault();
                toggle.click();
            }
        }
    });
}

async function loadSites() {
    try {
        const response = await fetch(`${API_BASE}/sites`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        sites = await response.json();
        renderSites();
    } catch (error) {
        console.error('Failed to load sites:', error);
    }
}

function renderSites() {
    const sitesList = elements.sitesList || document.getElementById('sites-list');
    if (!sitesList) return;
    
    const existingItems = sitesList.querySelectorAll('.site-list-item');
    existingItems.forEach(item => item.remove());
    
    if (sites.length === 0) {
        currentDetailSite = null;
        if (elements.emptyState) elements.emptyState.style.display = 'flex';
        showDetailEmptyState();
        clearSiteDetailHash();
    } else {
        if (elements.emptyState) elements.emptyState.style.display = 'none';
        sites.forEach(site => {
            const item = createSiteListItem(site);
            sitesList.appendChild(item);
        });
        
        if (!currentDetailSite && sites.length > 0) {
            selectSite(sites[0]);
        }
    }
}

function createSiteListItem(site) {
    const item = document.createElement('div');
    item.className = 'site-list-item';
    item.dataset.siteId = site.site_id;
    
    if (currentDetailSite && currentDetailSite.site_id === site.site_id) {
        item.classList.add('active');
    }
    
    item.onclick = () => selectSite(site);
    
    const domain = site.url.replace(/https?:\/\//, '').replace(/\/$/, '');
    const initial = domain.charAt(0).toUpperCase();
    const statusClass = site.status === 'completed' ? 'completed' : site.status;
    const statusText = site.status === 'completed' ? 'Ready' : site.status.charAt(0).toUpperCase() + site.status.slice(1);
    
    item.innerHTML = `
        <div class="site-list-icon">${initial}</div>
        <div class="site-list-info">
            <div class="site-list-name">${site.name || domain}</div>
            <div class="site-list-url">${domain}</div>
        </div>
        <span class="site-list-status ${statusClass}">${statusText}</span>
    `;
    
    return item;
}

function selectSite(site) {
    document.querySelectorAll('.site-list-item').forEach(item => item.classList.remove('active'));
    const siteItem = document.querySelector(`.site-list-item[data-site-id="${site.site_id}"]`);
    if (siteItem) siteItem.classList.add('active');
    
    openSiteDetails(site);
}

function showDetailEmptyState() {
    const detailContent = elements.detailContent || document.getElementById('detail-content');
    const detailEmpty = elements.detailEmptyState || document.getElementById('detail-empty-state');
    
    if (detailContent) detailContent.style.display = 'none';
    if (detailEmpty) detailEmpty.style.display = 'flex';
}

function showDetailContent() {
    const detailContent = elements.detailContent || document.getElementById('detail-content');
    const detailEmpty = elements.detailEmptyState || document.getElementById('detail-empty-state');
    
    if (detailContent) detailContent.style.display = 'flex';
    if (detailEmpty) detailEmpty.style.display = 'none';
}

function createSiteCard(site) {
    const card = document.createElement('div');
    card.className = 'site-card';
    card.dataset.siteId = site.site_id;
    card.onclick = () => {
        // Remove active class from all cards
        document.querySelectorAll('.site-card').forEach(c => c.classList.remove('active'));
        // Add active class to clicked card
        card.classList.add('active');
        openSiteDetails(site);
    };
    
    const domain = site.url.replace(/https?:\/\//, '').replace(/\/$/, '');
    const initial = domain.charAt(0).toUpperCase();
    const statusClass = site.status === 'completed' ? 'ready' : site.status;
    const statusText = site.status === 'completed' ? 'Ready' : site.status.charAt(0).toUpperCase() + site.status.slice(1);
    
    card.innerHTML = `
        <div class="site-card-header">
            <div class="site-info">
                <div class="site-favicon">${initial}</div>
                <div>
                    <div class="site-name">${site.name || domain}</div>
                    <div class="site-url">${domain}</div>
                </div>
            </div>
            <span class="status-badge ${statusClass}">
                <span class="dot"></span>
                ${statusText}
            </span>
        </div>
        ${site.status === 'failed' && site.error ? `
            <div class="site-card-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>${site.error}</span>
            </div>
        ` : `
            <div class="site-card-stats">
                <div class="site-stat">
                    <span class="site-stat-value">${site.pages_crawled || 0}</span>
                    <span class="site-stat-label">Pages</span>
                </div>
                <div class="site-stat">
                    <span class="site-stat-value">${site.pages_indexed || 0}</span>
                    <span class="site-stat-label">Indexed</span>
                </div>
            </div>
        `}
    `;
    
    return card;
}

function openAddSiteModal() {
    elements.addSiteModal.classList.add('active');
    showSourceTypeStep();
}

function closeAddSiteModal() {
    elements.addSiteModal.classList.remove('active');
    resetModalState();
}

function resetModalState() {
    currentSourceType = null;
    selectedFiles = [];
    selectedFilesBoth = [];
    
    // Reset forms
    document.getElementById('website-form')?.reset();
    document.getElementById('documents-form')?.reset();
    document.getElementById('both-form')?.reset();
    
    // Clear file lists
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('file-list-both').innerHTML = '';
    
    // Reset submit buttons
    document.getElementById('submit-documents').disabled = true;
    
    // Reset source type selection
    document.querySelectorAll('.source-type-card').forEach(c => c.classList.remove('selected'));
    
    // Show first step
    showSourceTypeStep();
}

function showSourceTypeStep() {
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-source-type').classList.add('active');
    document.getElementById('modal-title').textContent = 'Add Knowledge Source';
}

function handleSourceTypeSelect(type) {
    currentSourceType = type;
    
    // Update visual selection
    document.querySelectorAll('.source-type-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');
    
    // Show appropriate step
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    
    if (type === 'website') {
        document.getElementById('step-website').classList.add('active');
        document.getElementById('modal-title').textContent = 'Crawl Website';
        document.getElementById('site-url').focus();
    } else if (type === 'documents') {
        document.getElementById('step-documents').classList.add('active');
        document.getElementById('modal-title').textContent = 'Upload Documents';
        document.getElementById('doc-site-name').focus();
    } else if (type === 'both') {
        document.getElementById('step-both').classList.add('active');
        document.getElementById('modal-title').textContent = 'Website + Documents';
        document.getElementById('both-site-url').focus();
    }
}

function switchFormTab(tabId) {
    document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// File upload zone setup
function setupUploadZone(zoneId, inputId, listId, filesVar) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    
    if (!zone || !input) return;
    
    // Click to open file picker
    zone.addEventListener('click', () => input.click());
    
    // Drag and drop events
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files, filesVar, listId);
    });
    
    // File input change
    input.addEventListener('change', () => {
        handleFiles(input.files, filesVar, listId);
        input.value = '';
    });
}

function handleFiles(fileList, filesVar, listId) {
    const files = Array.from(fileList);
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.csv', '.pptx', '.xlsx', '.html', '.htm'];
    
    files.forEach(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(ext)) {
            alert(`${file.name} is not a supported file type.`);
            return;
        }
        
        if (file.size > 50 * 1024 * 1024) {
            alert(`${file.name} is too large (max 50MB).`);
            return;
        }
        
        // Add to appropriate array
        if (filesVar === 'selectedFiles') {
            selectedFiles.push(file);
        } else if (filesVar === 'selectedFilesBoth') {
            selectedFilesBoth.push(file);
        } else if (filesVar === 'selectedFilesExisting') {
            selectedFilesExisting.push(file);
        }
    });
    
    // Update file list display
    renderFileList(filesVar, listId);
    
    // Update submit button state
    updateDocumentSubmitButton();
}

function renderFileList(filesVar, listId) {
    const list = document.getElementById(listId);
    let files;
    
    if (filesVar === 'selectedFiles') files = selectedFiles;
    else if (filesVar === 'selectedFilesBoth') files = selectedFilesBoth;
    else if (filesVar === 'selectedFilesExisting') files = selectedFilesExisting;
    
    list.innerHTML = files.map((file, idx) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const iconClass = getFileIconClass(ext);
        const size = formatFileSize(file.size);
        
        return `
            <div class="file-item" data-index="${idx}">
                <div class="file-icon ${iconClass}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${size}</div>
                </div>
                <button type="button" class="file-remove" onclick="removeFile('${filesVar}', ${idx}, '${listId}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

function removeFile(filesVar, index, listId) {
    if (filesVar === 'selectedFiles') {
        selectedFiles.splice(index, 1);
    } else if (filesVar === 'selectedFilesBoth') {
        selectedFilesBoth.splice(index, 1);
    } else if (filesVar === 'selectedFilesExisting') {
        selectedFilesExisting.splice(index, 1);
    }
    renderFileList(filesVar, listId);
    updateDocumentSubmitButton();
}

window.removeFile = removeFile;

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

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateDocumentSubmitButton() {
    const submitDocs = document.getElementById('submit-documents');
    const submitUpload = document.getElementById('submit-upload');
    
    if (submitDocs) {
        submitDocs.disabled = selectedFiles.length === 0;
    }
    if (submitUpload) {
        submitUpload.disabled = selectedFilesExisting.length === 0;
    }
}

// Form submission handlers
async function handleWebsiteSubmit(e) {
    e.preventDefault();
    
    const url = document.getElementById('site-url').value;
    const name = document.getElementById('site-name').value;
    const maxPages = parseInt(document.getElementById('max-pages').value) || 50;
    
    const submitBtn = document.getElementById('submit-website');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        const setupResponse = await fetch(`${API_BASE}/embed/setup`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url, name, max_pages: maxPages })
        });
        
        if (setupResponse.status === 401) {
            logout();
            return;
        }
        
        if (!setupResponse.ok) {
            const err = await setupResponse.json();
            throw new Error(err.detail || 'Failed to setup site');
        }
        
        const setupData = await setupResponse.json();
        
        closeAddSiteModal();
        await loadSites();
        pollSiteStatus(setupData.site_id);
        
    } catch (error) {
        console.error('Failed to add site:', error);
        alert(error.message || 'Failed to add site. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function handleDocumentsSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('doc-site-name').value;
    
    if (selectedFiles.length === 0) {
        alert('Please select at least one file to upload.');
        return;
    }
    
    const submitBtn = document.getElementById('submit-documents');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // First create the site
        const siteId = generateSiteId(name);
        const token = localStorage.getItem('token');
        
        // Create site entry
        const setupResponse = await fetch(`${API_BASE}/embed/setup`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                url: `docs://${siteId}`,
                name: name 
            })
        });
        
        if (!setupResponse.ok) {
            throw new Error('Failed to create knowledge base');
        }
        
        const setupData = await setupResponse.json();
        
        // Upload documents
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('files', file));
        
        const uploadResponse = await fetch(`${API_BASE}/documents/upload/${setupData.site_id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload documents');
        }
        
        const uploadResult = await uploadResponse.json();
        
        closeAddSiteModal();
        await loadSites();
        alert(`Successfully uploaded ${uploadResult.total_uploaded} documents!`);
        
    } catch (error) {
        console.error('Failed to upload documents:', error);
        alert(error.message || 'Failed to upload documents. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function handleBothSubmit(e) {
    e.preventDefault();
    
    const url = document.getElementById('both-site-url').value;
    const name = document.getElementById('both-site-name').value;
    const maxPages = parseInt(document.getElementById('both-max-pages').value) || 50;
    
    const submitBtn = document.getElementById('submit-both');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Setup site and crawl with max_pages
        const setupResponse = await fetch(`${API_BASE}/embed/setup`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url, name, max_pages: maxPages })
        });
        
        if (!setupResponse.ok) {
            throw new Error('Failed to setup site');
        }
        
        const setupData = await setupResponse.json();
        
        // Upload documents if any
        if (selectedFilesBoth.length > 0) {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            selectedFilesBoth.forEach(file => formData.append('files', file));
            
            await fetch(`${API_BASE}/documents/upload/${setupData.site_id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
        }
        
        closeAddSiteModal();
        await loadSites();
        pollSiteStatus(setupData.site_id);
        
    } catch (error) {
        console.error('Failed to create chatbot:', error);
        alert(error.message || 'Failed to create chatbot. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function generateSiteId(name) {
    const hash = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `${hash.substring(0, 6)}${random}`;
}

// Upload modal for existing sites
function openUploadModal() {
    selectedFilesExisting = [];
    document.getElementById('file-list-existing').innerHTML = '';
    document.getElementById('submit-upload').disabled = true;
    elements.uploadModal.classList.add('active');
}

function closeUploadModal() {
    elements.uploadModal.classList.remove('active');
    selectedFilesExisting = [];
}

async function handleExistingUpload(e) {
    e.preventDefault();
    
    if (!currentDetailSite || selectedFilesExisting.length === 0) return;
    
    const submitBtn = document.getElementById('submit-upload');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        selectedFilesExisting.forEach(file => formData.append('files', file));
        
        const response = await fetch(`${API_BASE}/documents/upload/${currentDetailSite.site_id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to upload documents');
        }
        
        const result = await response.json();
        
        closeUploadModal();
        await loadSiteDocuments(currentDetailSite.site_id);
        alert(`Successfully uploaded ${result.total_uploaded} documents!`);
        
    } catch (error) {
        console.error('Failed to upload:', error);
        alert(error.message || 'Failed to upload documents.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function pollSiteStatus(siteId) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/embed/status/${siteId}`);
            const data = await response.json();
            
            if (data.status === 'completed' || data.status === 'failed') {
                clearInterval(interval);
            }
            
            await loadSites();
        } catch (error) {
            console.error('Failed to poll status:', error);
        }
    }, 3000);
}

let currentDetailSite = null;

const VALID_DETAIL_TABS = [
    'appearance', 'embed', 'behavior', 'quick-prompts', 'triggers', 'training',
    'handoff', 'leads', 'security', 'crawling'
];

const DETAIL_TAB_LABELS = {
    appearance: 'Appearance',
    embed: 'Embed',
    behavior: 'Behavior',
    'quick-prompts': 'Quick Prompts',
    triggers: 'Triggers',
    training: 'Training',
    handoff: 'Handoff',
    leads: 'Leads',
    security: 'Security',
    crawling: 'Crawling'
};

const SIDEBAR_COLLAPSED_KEY = 'sitechat-sidebar-collapsed';

function getDetailTabFromHash() {
    const raw = (window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    if (!raw) return 'appearance';
    const tab = raw.split(/[?&]/)[0];
    return VALID_DETAIL_TABS.includes(tab) ? tab : 'appearance';
}

function clearSiteDetailHash() {
    const base = window.location.pathname + window.location.search;
    if (window.location.hash) {
        history.replaceState(null, '', base);
    }
}

function setSiteDetailHash(tabId) {
    if (!currentDetailSite) return;
    const base = window.location.pathname + window.location.search;
    history.replaceState(null, '', `${base}#${tabId}`);
}

function updateDetailBreadcrumbSection(tabId) {
    const sectionEl = document.getElementById('detail-breadcrumb-section');
    if (!sectionEl) return;
    const label = DETAIL_TAB_LABELS[tabId] || tabId;
    sectionEl.textContent = label;
}

function navigateDetailBreadcrumbSites() {
    currentDetailSite = null;
    document.querySelectorAll('.site-card, .site-list-item').forEach(c => c.classList.remove('active'));
    showDetailEmptyState();
    clearSiteDetailHash();
}

/** @param {{ skipHash?: boolean }} [opts] */
function activateDetailTab(tabId, opts = {}) {
    const tabs = document.querySelectorAll('#detail-settings-nav .detail-tab');
    const panel = document.getElementById('detail-tab-content');
    if (!tabs.length) return;

    const valid = VALID_DETAIL_TABS.includes(tabId) ? tabId : 'appearance';

    tabs.forEach(t => {
        const on = t.dataset.tab === valid;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on && panel && t.id) {
            panel.setAttribute('aria-labelledby', t.id);
        }
    });

    loadDetailTabContent(valid);
    if (!opts.skipHash) {
        setSiteDetailHash(valid);
    }
    updateDetailBreadcrumbSection(valid);
}

function initSiteDetailHashRouting() {
    window.addEventListener('hashchange', () => {
        if (!currentDetailSite) return;
        const sitesView = document.getElementById('sites-view');
        if (!sitesView?.classList.contains('active')) return;
        activateDetailTab(getDetailTabFromHash(), { skipHash: true });
        updateAppearanceEmbedCode();
        updateWidgetPreview();
    });
}

function initSidebarCollapse() {
    const btn = document.getElementById('sidebar-toggle');
    const mq = window.matchMedia('(min-width: 769px)');

    function applyCollapsed(collapsed) {
        if (!mq.matches) {
            document.body.classList.remove('sidebar-collapsed');
            if (btn) {
                btn.setAttribute('aria-expanded', 'true');
                btn.title = 'Collapse sidebar';
                btn.setAttribute('aria-label', 'Collapse sidebar');
            }
            return;
        }
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        if (btn) {
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
            btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        }
    }

    applyCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');

    mq.addEventListener('change', () => {
        applyCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    });

    btn?.addEventListener('click', () => {
        if (!mq.matches) return;
        const next = !document.body.classList.contains('sidebar-collapsed');
        applyCollapsed(next);
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    });
}

async function openSiteDetails(site) {
    currentDetailSite = site;
    
    showDetailContent();
    
    const siteName = site.name || site.url;
    const iconLetter = siteName.replace(/https?:\/\//, '').charAt(0).toUpperCase();
    const detailIcon = document.getElementById('detail-icon');
    if (detailIcon) detailIcon.textContent = iconLetter;
    
    const nameEl = document.getElementById('detail-site-name');
    if (nameEl) nameEl.textContent = siteName;
    
    const urlEl = document.getElementById('detail-url-small');
    if (urlEl) {
        urlEl.textContent = site.url.replace(/https?:\/\//, '');
        urlEl.href = site.url;
    }
    
    const statusEl = document.getElementById('detail-status');
    if (statusEl) {
        const statusClass = site.status === 'completed' ? 'ready' : site.status;
        const statusText = site.status === 'completed' ? 'Ready' : site.status.charAt(0).toUpperCase() + site.status.slice(1);
        statusEl.innerHTML = `<span class="status-badge ${statusClass}"><span class="dot"></span>${statusText}</span>`;
    }
    
    const pagesEl = document.getElementById('detail-pages');
    if (pagesEl) pagesEl.textContent = site.pages_crawled || 0;
    
    const indexedEl = document.getElementById('detail-indexed');
    if (indexedEl) indexedEl.textContent = site.pages_indexed || 0;
    
    const docs = await loadSiteDocuments(site.site_id);
    const docsCountEl = document.getElementById('detail-docs-count');
    if (docsCountEl) docsCountEl.textContent = docs?.length || 0;
    
    await loadSiteConfig(site.site_id);

    const breadcrumbSite = document.getElementById('detail-breadcrumb-site-name');
    if (breadcrumbSite) breadcrumbSite.textContent = siteName;

    activateDetailTab(getDetailTabFromHash());

    updateAppearanceEmbedCode();
    updateWidgetPreview();

    setupDetailTabs();
    setupQuickActions();
}

function setupQuickActions() {
    const recrawlBtn = document.getElementById('recrawl-site');
    if (recrawlBtn) {
        recrawlBtn.onclick = recrawlSite;
    }
    
    const addDocsBtn = document.getElementById('add-documents-btn');
    if (addDocsBtn) {
        addDocsBtn.onclick = openUploadModal;
    }
    
    const deleteBtn = document.getElementById('delete-site');
    if (deleteBtn) {
        deleteBtn.onclick = deleteSite;
    }
}

function closeSidePanel() {
    if (elements.siteDetailsPanel) {
        elements.siteDetailsPanel.classList.remove('active');
    }
    if (elements.sidePanelOverlay) {
        elements.sidePanelOverlay.classList.remove('active');
    }
    document.body.style.overflow = '';
    document.querySelectorAll('.site-card, .site-list-item').forEach(c => c.classList.remove('active'));
}

function setupDetailTabs() {
    const tabs = document.querySelectorAll('#detail-settings-nav .detail-tab');

    tabs.forEach(tab => {
        tab.onclick = () => activateDetailTab(tab.dataset.tab);
    });
}

/** Jump to a site-detail tab (e.g. from header "Get code" → Embed). */
function switchToDetailTab(tabId) {
    activateDetailTab(tabId);
}

function loadDetailTabContent(tabId) {
    const tabContentContainer = document.getElementById('detail-tab-content');
    if (!tabContentContainer) return;
    
    let content = '';
    
    switch(tabId) {
        case 'appearance':
            content = getAppearanceTabContent();
            break;
        case 'behavior':
            content = getBehaviorTabContent();
            break;
        case 'quick-prompts':
            content = getQuickPromptsTabContent();
            break;
        case 'triggers':
            content = getTriggersTabContent();
            break;
        case 'training':
            renderTrainingTab();
            return;
        case 'handoff':
            content = getHandoffTabContent();
            break;
        case 'security':
            content = getSecurityTabContent();
            break;
        case 'crawling':
            content = getCrawlingTabContent();
            break;
        case 'embed':
            content = getEmbedTabContent();
            break;
        case 'leads':
            content = getLeadsTabContent();
            break;
        default:
            content = '<p>Tab content not available</p>';
    }
    
    tabContentContainer.innerHTML = content;
    
    initTabHandlers(tabId);
}

function initTabHandlers(tabId) {
    switch(tabId) {
        case 'appearance':
            initAppearanceHandlers();
            loadSecureEmbedCode();
            break;
        case 'quick-prompts':
            initQuickPromptsHandlers();
            loadQuickPrompts();
            break;
        case 'triggers':
            loadTriggers();
            break;
        case 'handoff':
            loadHandoffConfig();
            break;
        case 'security':
            loadSecurityConfig();
            break;
        case 'crawling':
            if (currentDetailSite) loadCrawlSchedule(currentDetailSite.site_id);
            break;
        case 'embed':
            loadSecureEmbedCode();
            break;
        case 'leads':
            initLeadsHandlers();
            loadLeads();
            break;
    }
}

function getAppearanceTabContent() {
    const config = currentSiteConfig || {};
    const appearance = config.appearance || {};
    const primaryColor = appearance.primary_color || '#0D9488';
    const chatTitle = appearance.chat_title || 'Chat with us';
    const welcomeMsg = appearance.welcome_message || 'Hi! How can I help you today?';
    
    return `
        <div class="appearance-layout">
            <div class="tab-form">
                <div class="form-group">
                    <label for="config-color">Primary Color</label>
                    <div class="color-input-wrapper">
                        <input type="color" id="config-color" value="${primaryColor}" class="color-input">
                        <input type="text" id="config-color-text" value="${primaryColor}" class="color-text-input">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="config-title">Chat Title</label>
                    <input type="text" id="config-title" placeholder="Chat with us" value="${appearance.chat_title || ''}" class="form-input">
                </div>
                
                <div class="form-group">
                    <label for="config-welcome">Welcome Message</label>
                    <textarea id="config-welcome" placeholder="Hi! How can I help you today?" class="form-textarea" rows="2">${appearance.welcome_message || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label for="config-position">Widget Position</label>
                    <select id="config-position" class="form-select">
                        <option value="bottom-right" ${appearance.position === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
                        <option value="bottom-left" ${appearance.position === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
                    </select>
                </div>
                
                <div class="form-divider"></div>
                <h4 class="form-section-title">Widget branding</h4>

                <div class="form-group form-checkbox">
                    <input type="checkbox" id="config-hide-branding" ${appearance.hide_branding ? 'checked' : ''}>
                    <label for="config-hide-branding">Customize widget branding</label>
                </div>
                
                <div class="form-group" id="custom-branding-group" style="${appearance.hide_branding ? '' : 'display:none'}">
                    <label for="config-custom-branding">Your Branding Text</label>
                    <input type="text" id="config-custom-branding" placeholder="Powered by Your Company" value="${appearance.custom_branding_text || ''}" class="form-input">
                    <small class="form-help">Leave empty to hide branding completely</small>
                </div>
                
                <div class="form-group" style="${appearance.hide_branding ? '' : 'display:none'}">
                    <label for="config-custom-branding-url">Branding Link URL (optional)</label>
                    <input type="url" id="config-custom-branding-url" placeholder="https://yourcompany.com" value="${appearance.custom_branding_url || ''}" class="form-input">
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary btn-sm" id="reset-config">Reset to Default</button>
                    <button type="button" class="btn btn-primary btn-sm" id="save-config">Save Changes</button>
                </div>
            </div>
            
            <div class="widget-preview-container">
                <div class="preview-header-row">
                    <h4 class="preview-title">Live Preview</h4>
                    <label class="preview-mode-toggle">
                        <input type="checkbox" id="preview-interactive-toggle">
                        <span class="toggle-label">Interactive</span>
                    </label>
                </div>
                <div class="widget-preview-wrapper">
                    <div class="widget-preview" id="widget-preview">
                        <div class="widget-preview-header" id="preview-header" style="background: ${primaryColor}">
                            <span class="widget-preview-title" id="preview-title">${chatTitle}</span>
                            <div class="widget-preview-controls">
                                <span class="preview-minimize">−</span>
                                <span class="preview-close">×</span>
                            </div>
                        </div>
                        <div class="widget-preview-body" id="preview-messages">
                            <div class="widget-preview-message bot">
                                <div class="preview-avatar" id="preview-avatar" style="background: ${primaryColor}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                </div>
                                <div class="preview-bubble" id="preview-welcome">${welcomeMsg}</div>
                            </div>
                        </div>
                        <div class="widget-preview-input">
                            <input type="text" id="preview-input" placeholder="Type a message..." disabled>
                            <button style="background: ${primaryColor}" id="preview-send-btn" disabled>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                            </button>
                        </div>
                        <div class="widget-preview-branding" id="preview-branding" style="${appearance.hide_branding ? 'display:none' : ''}">
                            <span id="preview-branding-text">Powered by SiteChat</span>
                        </div>
                    </div>
                    <div class="widget-preview-fab" id="preview-fab" style="background: ${primaryColor}">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                </div>
            </div>
            
            <div class="embed-section">
                <h4>Embed Code</h4>
                <p>Copy this code and paste it into your website's HTML, just before the closing &lt;/body&gt; tag.</p>
                <div class="embed-code-container">
                    <pre id="security-embed-code" class="embed-code-preview">Loading...</pre>
                    <button type="button" class="btn btn-secondary btn-sm copy-embed-btn" id="copy-secure-embed">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                        Copy
                    </button>
                </div>
                <div class="security-sri-info">
                    <span class="sri-label">SRI Hash:</span>
                    <code id="security-sri-hash">Loading...</code>
                </div>
            </div>
        </div>
    `;
}

function getBehaviorTabContent() {
    const config = currentSiteConfig || {};
    const behavior = config.behavior || {};
    
    return `
        <div class="tab-form">
            <div class="form-group">
                <label for="config-prompt">System Prompt</label>
                <textarea id="config-prompt" placeholder="You are a helpful assistant..." class="form-textarea" rows="4">${behavior.system_prompt || ''}</textarea>
            </div>
            
            <div class="form-group">
                <label for="config-temperature">Temperature: <span id="temp-value">${behavior.temperature || 0.7}</span></label>
                <input type="range" id="config-temperature" min="0" max="2" step="0.1" value="${behavior.temperature || 0.7}" class="form-range">
                <div class="range-labels">
                    <span>Precise</span>
                    <span>Creative</span>
                </div>
            </div>
            
            <div class="form-group">
                <label for="config-max-tokens">Max Response Length</label>
                <input type="number" id="config-max-tokens" value="${behavior.max_tokens || 500}" min="50" max="4000" class="form-input">
            </div>
            
            <div class="form-group form-checkbox">
                <input type="checkbox" id="config-show-sources" ${behavior.show_sources !== false ? 'checked' : ''}>
                <label for="config-show-sources">Show source citations</label>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn btn-primary btn-sm" id="save-config">Save Changes</button>
            </div>
        </div>
    `;
}

function getQuickPromptsTabContent() {
    const config = currentSiteConfig || {};
    const quickPrompts = config.quick_prompts || {};
    const enabled = quickPrompts.enabled !== false;
    const showAfterResponse = quickPrompts.show_after_response === true;
    const maxDisplay = quickPrompts.max_display || 4;
    
    return `
        <div class="tab-form">
            <div class="quick-prompts-header">
                <div>
                    <h4>Quick Prompts / FAQ Starters</h4>
                    <p class="quick-prompts-description">Pre-configured conversation starters shown in the chat widget</p>
                </div>
                <label class="toggle-switch-label">
                    <input type="checkbox" id="quick-prompts-enabled" ${enabled ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    <span>Enable Quick Prompts</span>
                </label>
            </div>
            
            <div class="quick-prompts-content" id="quick-prompts-content" style="${enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                <div class="quick-prompts-list-header">
                    <span>Prompts</span>
                    <button type="button" class="btn btn-sm btn-primary" id="add-quick-prompt-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Prompt
                    </button>
                </div>
                
                <div class="quick-prompts-list" id="quick-prompts-list">
                    <div class="quick-prompts-loading">
                        <div class="spinner-sm"></div>
                        <span>Loading prompts...</span>
                    </div>
                </div>
                
                <div class="quick-prompts-empty hidden" id="quick-prompts-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="8" y1="10" x2="16" y2="10"/>
                    </svg>
                    <p>No quick prompts yet</p>
                    <button type="button" class="btn btn-sm btn-primary" id="add-quick-prompt-empty-btn">Add Your First Prompt</button>
                </div>
                
                <div class="form-divider"></div>
                
                <div class="quick-prompts-settings">
                    <div class="form-group">
                        <label for="quick-prompts-max-display">Maximum prompts to display</label>
                        <select id="quick-prompts-max-display" class="form-select">
                            <option value="2" ${maxDisplay === 2 ? 'selected' : ''}>2 prompts</option>
                            <option value="3" ${maxDisplay === 3 ? 'selected' : ''}>3 prompts</option>
                            <option value="4" ${maxDisplay === 4 ? 'selected' : ''}>4 prompts</option>
                            <option value="5" ${maxDisplay === 5 ? 'selected' : ''}>5 prompts</option>
                            <option value="6" ${maxDisplay === 6 ? 'selected' : ''}>6 prompts</option>
                        </select>
                    </div>
                    
                    <div class="form-group form-checkbox">
                        <input type="checkbox" id="quick-prompts-show-after-response" ${showAfterResponse ? 'checked' : ''}>
                        <label for="quick-prompts-show-after-response">Show quick prompts after bot responses</label>
                    </div>
                </div>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn btn-primary btn-sm" id="save-quick-prompts">Save Changes</button>
            </div>
        </div>
    `;
}

function getTriggersTabContent() {
    return `
        <div class="tab-form">
            <div class="triggers-header">
                <p class="triggers-description">Automatically engage visitors based on their behavior</p>
                <button type="button" class="btn btn-sm btn-primary" id="add-trigger-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Trigger
                </button>
            </div>
            
            <div class="triggers-list" id="triggers-list">
                <div class="triggers-loading">
                    <div class="spinner-sm"></div>
                    <span>Loading triggers...</span>
                </div>
            </div>
            
            <div class="triggers-settings" style="margin-top: 20px;">
                <div class="form-group">
                    <label for="global-cooldown">Cooldown between triggers</label>
                    <select id="global-cooldown" class="form-select">
                        <option value="10000">10 seconds</option>
                        <option value="30000" selected>30 seconds</option>
                        <option value="60000">1 minute</option>
                        <option value="300000">5 minutes</option>
                    </select>
                </div>
            </div>
        </div>
    `;
}

function getHandoffTabContent() {
    return `
        <div class="tab-form">
            <div class="handoff-settings-header">
                <h4>Human Handoff Settings</h4>
                <p>Configure when and how visitors can connect with human agents</p>
            </div>
            
            <div class="form-group">
                <label class="toggle-label">
                    <input type="checkbox" id="handoff-enabled" checked>
                    <span class="toggle-switch"></span>
                    Enable Human Handoff
                </label>
                <span class="form-hint">Allow visitors to request a human agent</span>
            </div>
            
            <div class="form-group">
                <label for="confidence-threshold">AI Confidence Threshold</label>
                <div class="range-wrapper">
                    <input type="range" id="confidence-threshold" min="0" max="100" value="30" class="range-input">
                    <span class="range-value" id="confidence-threshold-value">30%</span>
                </div>
                <span class="form-hint">Suggest handoff when AI confidence is below this level</span>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn btn-primary" id="save-handoff-config">Save Handoff Settings</button>
            </div>
        </div>
    `;
}

function getSecurityTabContent() {
    return `
        <div class="tab-form">
            <div class="security-settings-header">
                <h4>Widget Security Settings</h4>
                <p>Configure domain restrictions and security options for your widget</p>
            </div>
            
            <div class="form-group">
                <label class="toggle-label">
                    <input type="checkbox" id="security-enforce-domain">
                    <span class="toggle-switch"></span>
                    Enforce Domain Validation
                </label>
                <span class="form-hint">Only allow widget to load on whitelisted domains</span>
            </div>
            
            <div class="form-group">
                <label for="security-allowed-domains">Allowed Domains</label>
                <div class="domain-list-container">
                    <div class="domain-input-wrapper">
                        <input type="text" id="security-new-domain" placeholder="example.com or *.example.com" class="form-input">
                        <button type="button" class="btn btn-secondary btn-sm" id="security-add-domain">Add</button>
                    </div>
                    <div class="domain-list" id="security-domain-list"></div>
                </div>
                <span class="form-hint">Use * as wildcard (e.g., *.example.com). Leave empty to allow all domains.</span>
            </div>
            
            <div class="form-divider"></div>
            
            <div class="form-group">
                <label class="toggle-label">
                    <input type="checkbox" id="security-require-referrer">
                    <span class="toggle-switch"></span>
                    Require Referrer Header
                </label>
                <span class="form-hint">Reject API requests without a valid Referer header</span>
            </div>
            
            <div class="form-group">
                <label for="security-rate-limit">Rate Limit (requests/minute)</label>
                <div class="range-wrapper">
                    <input type="range" id="security-rate-limit" min="10" max="200" value="60" class="range-input">
                    <span class="range-value" id="security-rate-limit-value">60</span>
                </div>
                <span class="form-hint">Maximum API requests per session per minute</span>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn btn-primary" id="save-security-config">Save Security Settings</button>
            </div>
        </div>
    `;
}

function getCrawlingTabContent() {
    return `
        <div class="tab-form">
            <div class="crawling-settings-header">
                <h4>Scheduled Re-crawling</h4>
                <p>Configure automatic re-crawling to keep your knowledge base up-to-date</p>
            </div>
            
            <div class="crawl-status-banner" id="crawl-status-banner" style="display: none;">
                <div class="crawl-status-icon">
                    <svg class="spinner" width="20" height="20" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.25"/>
                        <path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="crawl-status-text">
                    <span class="crawl-status-title">Crawling in progress...</span>
                    <span class="crawl-status-detail" id="crawl-status-pages">0 pages crawled</span>
                </div>
            </div>
            
            <div class="crawl-quick-actions">
                <button type="button" class="btn btn-secondary" id="crawl-now-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                    </svg>
                    Crawl Now
                </button>
                <div class="crawl-info">
                    <span class="crawl-info-label">Last Crawl:</span>
                    <span class="crawl-info-value" id="last-crawl-time">Never</span>
                </div>
                <div class="crawl-info">
                    <span class="crawl-info-label">Next Scheduled:</span>
                    <span class="crawl-info-value" id="next-crawl-time">Not scheduled</span>
                </div>
            </div>
            
            <div class="form-section">
                <h5>Schedule Configuration</h5>
                
                <label class="toggle-row">
                    <input type="checkbox" id="crawl-schedule-enabled">
                    <span class="toggle-switch"></span>
                    Enable Scheduled Crawling
                </label>
                <span class="form-hint">Automatically re-crawl your website on a schedule</span>
                
                <div class="crawl-schedule-options" id="crawl-schedule-options">
                    <div class="form-group">
                        <label for="crawl-frequency">Frequency</label>
                        <select id="crawl-frequency" class="form-select">
                            <option value="daily">Daily (at 2:00 AM UTC)</option>
                            <option value="weekly" selected>Weekly (Sundays at 2:00 AM UTC)</option>
                            <option value="monthly">Monthly (1st day at 2:00 AM UTC)</option>
                            <option value="custom">Custom (Cron Expression)</option>
                        </select>
                    </div>
                    
                    <div class="form-group" id="custom-cron-group" style="display: none;">
                        <label for="crawl-custom-cron">Cron Expression</label>
                        <input type="text" id="crawl-custom-cron" placeholder="0 2 * * 0" class="form-input">
                        <span class="form-hint">Standard cron format: minute hour day month weekday</span>
                    </div>
                    
                    <div class="form-group">
                        <label for="crawl-max-pages">Max Pages</label>
                        <input type="number" id="crawl-max-pages" value="50" min="1" max="1000" class="form-input">
                        <span class="form-hint">Maximum pages to crawl (1-1000)</span>
                    </div>
                    
                    <div class="form-group">
                        <label for="crawl-include-patterns">Include URL Patterns</label>
                        <textarea id="crawl-include-patterns" class="form-textarea" rows="2" placeholder="/blog/*&#10;/docs/*"></textarea>
                        <span class="form-hint">One pattern per line. Leave empty to include all.</span>
                    </div>
                    
                    <div class="form-group">
                        <label for="crawl-exclude-patterns">Exclude URL Patterns</label>
                        <textarea id="crawl-exclude-patterns" class="form-textarea" rows="2" placeholder="/admin/*&#10;/private/*"></textarea>
                        <span class="form-hint">One pattern per line. URLs matching these will be skipped.</span>
                    </div>
                    
                    <label class="toggle-row">
                        <input type="checkbox" id="crawl-notify" checked>
                        <span class="toggle-switch"></span>
                        Notify on completion
                    </label>
                </div>
            </div>
            
            <div class="form-section">
                <h5>Crawl History</h5>
                <div class="crawl-history-table" id="crawl-history-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Trigger</th>
                                <th>Pages</th>
                                <th>Status</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody id="crawl-history-tbody">
                            <tr class="empty-row"><td colspan="5">No crawl history available</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="form-actions">
                <button type="button" class="btn btn-primary" id="save-crawl-schedule">Save Crawl Settings</button>
            </div>
        </div>
    `;
}

function getEmbedTabContent() {
    if (!currentDetailSite) return '<p>No site selected</p>';
    
    const baseUrl = window.location.origin;
    const embedCode = `<script>
(function() {
  var s = document.createElement('script');
  s.src = '${baseUrl}/widget/chatbot.js';
  s.async = true;
  s.dataset.siteId = '${currentDetailSite.site_id}';
  s.dataset.apiUrl = '${baseUrl}';
  document.head.appendChild(s);
})();
<\/script>`;
    
    return `
        <div class="tab-form">
            <div class="embed-section-header">
                <h4>Embed Code</h4>
                <p>Add this code to your website before the closing &lt;/body&gt; tag</p>
            </div>
            
            <div class="code-block">
                <pre><code id="detail-embed-code">${escapeHtml(embedCode)}</code></pre>
                <button type="button" class="code-copy" id="copy-detail-embed">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copy
                </button>
            </div>
            
            <div class="security-sri-info" style="margin-top: 16px;">
                <span class="sri-label">SRI Hash:</span>
                <code id="security-sri-hash">Loading...</code>
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initAppearanceHandlers() {
    const colorInput = document.getElementById('config-color');
    const colorText = document.getElementById('config-color-text');
    const tempSlider = document.getElementById('config-temperature');
    const tempValue = document.getElementById('temp-value');
    const hideBranding = document.getElementById('config-hide-branding');
    const brandingGroup = document.getElementById('custom-branding-group');
    const titleInput = document.getElementById('config-title');
    const welcomeInput = document.getElementById('config-welcome');
    const positionSelect = document.getElementById('config-position');
    
    if (colorInput && colorText) {
        colorInput.addEventListener('input', () => {
            colorText.value = colorInput.value;
            updateWidgetPreview();
        });
        colorText.addEventListener('input', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(colorText.value)) {
                colorInput.value = colorText.value;
                updateWidgetPreview();
            }
        });
    }
    
    if (titleInput) {
        titleInput.addEventListener('input', updateWidgetPreview);
    }
    
    if (welcomeInput) {
        welcomeInput.addEventListener('input', updateWidgetPreview);
    }
    
    if (positionSelect) {
        positionSelect.addEventListener('change', updateWidgetPreview);
    }
    
    if (tempSlider && tempValue) {
        tempSlider.addEventListener('input', () => tempValue.textContent = tempSlider.value);
    }
    
    const customBrandingInput = document.getElementById('config-custom-branding');
    const customBrandingUrlGroup = document.querySelector('.form-group[style*="display:none"]') || 
                                    document.querySelectorAll('.form-group')[6];
    
    if (hideBranding && brandingGroup) {
        hideBranding.addEventListener('change', () => {
            brandingGroup.style.display = hideBranding.checked ? '' : 'none';
            if (customBrandingUrlGroup) {
                customBrandingUrlGroup.style.display = hideBranding.checked ? '' : 'none';
            }
            updateWidgetPreview();
        });
    }
    
    if (customBrandingInput) {
        customBrandingInput.addEventListener('input', updateWidgetPreview);
    }
    
    const saveBtn = document.getElementById('save-config');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfig);
    }
    
    const resetBtn = document.getElementById('reset-config');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetConfig);
    }
    
    // Initialize appearance embed code and copy button
    updateAppearanceEmbedCode();
    const copyAppearanceBtn = document.getElementById('copy-appearance-embed');
    if (copyAppearanceBtn) {
        copyAppearanceBtn.addEventListener('click', copyAppearanceEmbed);
    }
    
    // Initialize appearance preview
    updateWidgetPreview();
    
    initInteractivePreview();
}

function initInteractivePreview() {
    const toggle = document.getElementById('preview-interactive-toggle');
    const input = document.getElementById('preview-input');
    const sendBtn = document.getElementById('preview-send-btn');
    const widget = document.getElementById('widget-preview');
    
    if (!toggle || !input || !sendBtn) return;
    
    toggle.addEventListener('change', () => {
        const isInteractive = toggle.checked;
        input.disabled = !isInteractive;
        sendBtn.disabled = !isInteractive;
        widget?.classList.toggle('interactive', isInteractive);
        
        if (isInteractive) {
            input.placeholder = 'Ask a question...';
            input.focus();
        } else {
            input.placeholder = 'Type a message...';
            resetPreviewMessages();
        }
    });
    
    sendBtn.addEventListener('click', sendPreviewMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !input.disabled) {
            sendPreviewMessage();
        }
    });
}

function resetPreviewMessages() {
    const messagesContainer = document.getElementById('preview-messages');
    const welcomeMsg = document.getElementById('config-welcome')?.value || 'Hi! How can I help you today?';
    const color = document.getElementById('config-color')?.value || '#0D9488';
    
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="widget-preview-message bot">
                <div class="preview-avatar" id="preview-avatar" style="background: ${color}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="preview-bubble" id="preview-welcome">${welcomeMsg}</div>
            </div>
        `;
    }
}

async function sendPreviewMessage() {
    const input = document.getElementById('preview-input');
    const messagesContainer = document.getElementById('preview-messages');
    const sendBtn = document.getElementById('preview-send-btn');
    
    if (!input || !messagesContainer || !input.value.trim()) return;
    
    const message = input.value.trim();
    const color = document.getElementById('config-color')?.value || '#0D9488';
    input.value = '';
    sendBtn.disabled = true;
    
    messagesContainer.innerHTML += `
        <div class="widget-preview-message user">
            <div class="preview-avatar" style="background: #6b7280">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </div>
            <div class="preview-bubble" style="background: ${color}">${escapeHtml(message)}</div>
        </div>
    `;
    
    messagesContainer.innerHTML += `
        <div class="widget-preview-message bot" id="typing-message">
            <div class="preview-avatar" style="background: ${color}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <div class="preview-bubble">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    try {
        if (!currentDetailSite) throw new Error('No site selected');
        
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                site_id: currentDetailSite.site_id,
                message: message,
                session_id: `preview-${Date.now()}`
            })
        });
        
        if (!response.ok) throw new Error('Chat request failed');
        
        const data = await response.json();
        const typingMsg = document.getElementById('typing-message');
        
        if (typingMsg) {
            typingMsg.innerHTML = `
                <div class="preview-avatar" style="background: ${color}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="preview-bubble">${escapeHtml(data.answer || 'No response')}</div>
            `;
            typingMsg.removeAttribute('id');
        }
        
    } catch (error) {
        console.error('Preview chat error:', error);
        const typingMsg = document.getElementById('typing-message');
        if (typingMsg) {
            typingMsg.innerHTML = `
                <div class="preview-avatar" style="background: ${color}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="preview-bubble" style="color: #ef4444;">Error: ${error.message || 'Failed to get response'}</div>
            `;
            typingMsg.removeAttribute('id');
        }
    }
    
    sendBtn.disabled = false;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function loadSiteDocuments(siteId) {
    try {
        const response = await fetch(`${API_BASE}/documents/${siteId}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        renderSiteDocuments(data.documents);
        return data.documents || [];
    } catch (error) {
        console.error('Failed to load documents:', error);
        return [];
    }
}

function renderSiteDocuments(documents) {
    const list = elements.documentsList;
    if (!list) return;
    
    if (!documents || documents.length === 0) {
        list.innerHTML = `
            <div class="empty-docs">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>No documents yet</p>
                <span>Upload PDFs, docs, and more</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = documents.map(doc => {
        const ext = doc.file_type.replace('.', '');
        const iconClass = getFileIconClass(ext);
        const statusIcon = doc.status === 'indexed' 
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
            : (doc.status === 'error' 
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3"><circle cx="12" cy="12" r="1"/></svg>');
        
        return `
            <div class="doc-item">
                <div class="file-icon ${iconClass}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${doc.filename}</div>
                    <div class="file-meta">${doc.word_count?.toLocaleString() || 0} words · ${doc.chunks || 0} chunks</div>
                </div>
                <span class="doc-status">${statusIcon}</span>
                <button type="button" class="doc-delete" onclick="deleteDocument('${doc.id}')" title="Delete document">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

async function deleteDocument(docId) {
    if (!currentDetailSite) return;
    
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/documents/${currentDetailSite.site_id}/${docId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            await loadSiteDocuments(currentDetailSite.site_id);
        } else {
            alert('Failed to delete document');
        }
    } catch (error) {
        console.error('Failed to delete document:', error);
    }
}

window.deleteDocument = deleteDocument;

function closeDetailsModal() {
    closeSidePanel();
}

async function copyDetailEmbed() {
    const code = document.getElementById('detail-embed-code').textContent;
    try {
        await navigator.clipboard.writeText(code);
        const btn = document.getElementById('copy-detail-embed');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied!';
        setTimeout(() => btn.innerHTML = originalHTML, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

async function recrawlSite() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('recrawl-site');
    btn.disabled = true;
    btn.textContent = 'Crawling...';
    
    try {
        await fetch(`${API_BASE}/crawl`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url: currentDetailSite.url, max_pages: 50 })
        });
        
        closeDetailsModal();
        await loadSites();
        pollSiteStatus(currentDetailSite.site_id);
    } catch (error) {
        console.error('Failed to recrawl:', error);
        alert('Failed to start crawl. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>Re-crawl';
    }
}

async function deleteSite() {
    if (!currentDetailSite) return;
    
    if (!confirm(`Are you sure you want to delete "${currentDetailSite.name || currentDetailSite.url}"?`)) {
        return;
    }
    
    try {
        await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        closeDetailsModal();
        await loadSites();
    } catch (error) {
        console.error('Failed to delete:', error);
        alert('Failed to delete site. Please try again.');
    }
}

function updateSiteSelector() {
    if (!elements.chatSiteSelect) return;
    
    elements.chatSiteSelect.innerHTML = '<option value="">Choose a site to test...</option>';
    
    sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.site_id;
        option.textContent = site.name || site.url;
        elements.chatSiteSelect.appendChild(option);
    });
}

function handleSiteSelect() {
    currentSiteId = elements.chatSiteSelect.value;
    elements.chatInput.disabled = !currentSiteId;
    updateSendButton();
    
    if (currentSiteId) {
        startNewChat();
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();
    
    const query = elements.chatInput.value.trim();
    if (!query || !currentSiteId) return;
    
    elements.chatInput.value = '';
    updateSendButton();
    
    clearWelcomeMessage();
    addMessage(query, 'user');
    
    const typingEl = showTyping();
    
    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                message: query,
                session_id: sessionId,
                site_id: currentSiteId
            })
        });
        
        if (!response.ok) throw new Error('Chat failed');
        
        const data = await response.json();
        typingEl.remove();
        addMessage(data.answer, 'assistant', data.sources);
        
    } catch (error) {
        console.error('Chat error:', error);
        typingEl.remove();
        addMessage('Sorry, something went wrong. Please try again.', 'assistant');
    }
}

function clearWelcomeMessage() {
    const welcome = elements.chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();
}

function addMessage(content, type, sources = []) {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    
    let html = content;
    
    if (sources && sources.length > 0) {
        html += `
            <div class="message-sources">
                <div class="message-sources-title">Sources</div>
                ${sources.map(s => `<a href="${s.url}" target="_blank" class="source-link">${s.title || s.url}</a>`).join('')}
            </div>
        `;
    }
    
    msg.innerHTML = html;
    elements.chatMessages.appendChild(msg);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    elements.chatMessages.appendChild(typing);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    return typing;
}

function startNewChat() {
    sessionId = 'session-' + Math.random().toString(36).substring(2, 15);
    elements.chatMessages.innerHTML = '';
    
    if (currentSiteId) {
        const site = sites.find(s => s.site_id === currentSiteId);
        elements.chatMessages.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                    </svg>
                </div>
                <h3>Chat with ${site?.name || 'this site'}</h3>
                <p>Ask any question about the website content</p>
            </div>
        `;
    }
}

function updateSendButton() {
    const hasText = elements.chatInput.value.trim().length > 0;
    const hasSite = !!currentSiteId;
    elements.sendBtn.disabled = !hasText || !hasSite;
}

async function loadStats() {
    // System stats no longer displayed in the analytics stat row;
    // engagement metrics are loaded via loadAnalyticsOverview() instead.
}

async function checkHealth() {
    const checks = [
        { id: 'health-mongodb', name: 'mongodb' },
        { id: 'health-vector', name: 'vector_store' },
        { id: 'health-ollama', name: 'ollama' }
    ];
    
    checks.forEach(check => {
        const el = document.getElementById(check.id);
        el.className = 'health-badge loading';
        el.textContent = 'Checking';
    });
    
    try {
        const response = await fetch(`${API_BASE}/admin/health`);
        const health = await response.json();
        
        checks.forEach(check => {
            const el = document.getElementById(check.id);
            const status = health[check.name];
            if (status && (status === 'healthy' || status === true || status.toString().startsWith('healthy'))) {
                el.className = 'health-badge healthy';
                el.textContent = 'Healthy';
            } else {
                el.className = 'health-badge unhealthy';
                el.textContent = 'Unhealthy';
            }
        });
    } catch (error) {
        checks.forEach(check => {
            const el = document.getElementById(check.id);
            el.className = 'health-badge unhealthy';
            el.textContent = 'Error';
        });
    }
}

// ==================== Analytics ====================

let conversationsChart = null;
let currentPeriod = '7d';

function populateAnalyticsSiteFilter() {
    const select = document.getElementById('analytics-site-filter');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">All Sites</option>';
    sites.forEach(site => {
        const opt = document.createElement('option');
        opt.value = site.id;
        opt.textContent = site.name || site.url;
        select.appendChild(opt);
    });
    select.value = current;
    select.onchange = () => {
        currentAnalyticsSite = select.value;
        loadAllAnalytics();
    };
}

async function loadAnalytics() {
    populateAnalyticsSiteFilter();
    const viewAllBtn = document.getElementById('go-to-conversations');
    if (viewAllBtn) {
        viewAllBtn.onclick = () => switchView('conversations');
        viewAllBtn.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') switchView('conversations'); };
    }
    await loadAllAnalytics();
}

async function loadAllAnalytics() {
    await Promise.all([
        loadAnalyticsOverview(),
        loadConversationTrend(),
        loadPopularQuestions(),
        loadSourcesUsed(),
        loadConversationsBySite(),
        loadRecentConversations()
    ]);
}

async function loadAnalyticsOverview() {
    try {
        const params = currentAnalyticsSite ? `?site_id=${encodeURIComponent(currentAnalyticsSite)}` : '';
        const response = await fetch(`${API_BASE}/analytics/overview${params}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) return;

        const data = await response.json();

        document.getElementById('stat-chats').textContent = data.total_conversations || 0;
        if (elements.statMsgsToday) elements.statMsgsToday.textContent = data.messages_today || 0;
        if (elements.statAvgMsgs) elements.statAvgMsgs.textContent = data.avg_messages_per_conversation || 0;
        if (elements.statSatisfaction) {
            elements.statSatisfaction.textContent = data.total_feedback > 0
                ? `${data.satisfaction_rate}%`
                : '—';
        }
        const activeSitesEl = document.getElementById('stat-active-sites');
        if (activeSitesEl) activeSitesEl.textContent = data.active_sites || 0;
        const handoffsEl = document.getElementById('stat-handoffs');
        if (handoffsEl) handoffsEl.textContent = data.total_handoffs || 0;
        const handoffRateEl = document.getElementById('stat-handoff-rate');
        if (handoffRateEl) handoffRateEl.textContent = `${data.handoff_rate || 0}%`;
    } catch (error) {
        console.error('Failed to load analytics overview:', error);
    }
}

async function loadConversationTrend() {
    try {
        const siteParam = currentAnalyticsSite ? `&site_id=${encodeURIComponent(currentAnalyticsSite)}` : '';
        const response = await fetch(`${API_BASE}/analytics/conversations?period=${currentPeriod}${siteParam}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        // Update summary
        document.getElementById('trend-total').textContent = data.total_conversations || 0;
        const trendMsgs = document.getElementById('trend-messages');
        if (trendMsgs) trendMsgs.textContent = data.total_messages || 0;
        const changeEl = document.getElementById('trend-change');
        const change = data.change_percentage || 0;
        if (change >= 0) {
            changeEl.className = 'summary-item trend-up';
            changeEl.textContent = `+${change}% from last period`;
        } else {
            changeEl.className = 'summary-item trend-down';
            changeEl.textContent = `${change}% from last period`;
        }
        
        // Render chart
        renderConversationsChart(data.data);
    } catch (error) {
        console.error('Failed to load conversation trend:', error);
    }
}

function renderConversationsChart(data) {
    const ctx = document.getElementById('conversationsChart');
    if (!ctx) return;
    
    const labels = data.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const conversations = data.map(d => d.conversations);
    const messages = data.map(d => d.messages);
    
    if (conversationsChart) {
        conversationsChart.destroy();
    }
    
    conversationsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Conversations',
                    data: conversations,
                    borderColor: '#0d9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.08)',
                    borderWidth: 2,
                    pointRadius: currentPeriod === '7d' ? 4 : 2,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#0d9488',
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'Messages',
                    data: messages,
                    borderColor: '#14b8a6',
                    backgroundColor: 'rgba(20, 184, 166, 0.04)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: currentPeriod === '7d' ? 4 : 2,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#14b8a6',
                    tension: 0.35,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 10,
                        boxHeight: 2,
                        padding: 16,
                        font: { size: 12 },
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 10,
                    titleFont: { size: 12 },
                    bodyFont: { size: 12 },
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { font: { size: 11 }, color: '#94a3b8' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9', drawBorder: false },
                    border: { display: false },
                    ticks: {
                        font: { size: 11 },
                        color: '#94a3b8',
                        stepSize: 1,
                        padding: 8
                    }
                }
            }
        }
    });
}

async function loadPopularQuestions() {
    try {
        const siteParam = currentAnalyticsSite ? `&site_id=${encodeURIComponent(currentAnalyticsSite)}` : '';
        const response = await fetch(`${API_BASE}/analytics/popular-questions?limit=5${siteParam}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        const container = document.getElementById('popular-questions');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-analytics">No questions yet</div>';
            return;
        }
        
        const maxCount = data[0]?.count || 1;
        container.innerHTML = data.map((q, idx) => `
            <div class="question-item">
                <span class="question-rank">${idx + 1}</span>
                <div class="question-content">
                    <div class="question-text">${escapeHtml(q.question)}</div>
                    <div class="question-bar-wrap">
                        <div class="question-bar-fill" style="width:${Math.round((q.count / maxCount) * 100)}%"></div>
                    </div>
                    <div class="question-count">${q.count} times &middot; ${q.percentage}%</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load popular questions:', error);
    }
}

async function loadSourcesUsed() {
    try {
        const siteParam = currentAnalyticsSite ? `&site_id=${encodeURIComponent(currentAnalyticsSite)}` : '';
        const response = await fetch(`${API_BASE}/analytics/sources-used?limit=6${siteParam}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) return;

        const data = await response.json();

        renderSourcesList(data);
    } catch (error) {
        console.error('Failed to load sources used:', error);
    }
}

function renderSourcesList(data) {
    const container = document.getElementById('sources-list');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-analytics">No source data yet</div>';
        return;
    }

    const maxCount = data[0]?.citation_count || 1;
    container.innerHTML = data.map(d => {
        const title = d.title || d.url;
        const label = title.length > 45 ? title.substring(0, 45) + '…' : title;
        const pct = Math.round((d.citation_count / maxCount) * 100);
        return `
            <div class="source-item">
                <div class="source-item-header">
                    <span class="source-title" title="${escapeHtml(title)}">${escapeHtml(label)}</span>
                    <span class="source-count">${d.citation_count}</span>
                </div>
                <div class="source-bar-wrap">
                    <div class="source-bar-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

async function loadRecentConversations() {
    try {
        const siteParam = currentAnalyticsSite ? `&site_id=${encodeURIComponent(currentAnalyticsSite)}` : '';
        const response = await fetch(`${API_BASE}/analytics/recent-conversations?limit=5${siteParam}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) return;

        const data = await response.json();

        const container = document.getElementById('recent-conversations');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-analytics">No conversations yet</div>';
            return;
        }

        container.innerHTML = data.map(conv => {
            const time = formatTimeAgo(new Date(conv.last_activity));
            return `
                <div class="conversation-item" data-session-id="${escapeHtml(conv.session_id)}" role="button" tabindex="0" title="Open conversation">
                    <div class="conversation-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                        </svg>
                    </div>
                    <div class="conversation-content">
                        <div class="conversation-preview">${escapeHtml(conv.first_message || 'No message')}</div>
                        <div class="conversation-meta">
                            <span>${conv.message_count} msgs</span>
                            <span>·</span>
                            <span>${time}</span>
                            ${conv.has_feedback ? '<span>· <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-1px;color:var(--success)"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/></svg></span>' : ''}
                        </div>
                    </div>
                    <svg class="conv-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.conversation-item[data-session-id]').forEach(item => {
            const open = async () => {
                const sid = item.dataset.sessionId;
                switchView('conversations');
                // Wait for conversations list to load, then select
                await new Promise(r => setTimeout(r, 50));
                selectConversation(sid);
            };
            item.addEventListener('click', open);
            item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
        });
    } catch (error) {
        console.error('Failed to load recent conversations:', error);
    }
}

async function loadConversationsBySite() {
    try {
        const response = await fetch(`${API_BASE}/analytics/conversations-by-site`, {
            headers: getAuthHeaders()
        });

        const container = document.getElementById('conversations-by-site');
        if (!container) return;

        if (!response.ok) {
            container.innerHTML = '<div class="empty-analytics">Unable to load data</div>';
            return;
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-analytics">No data yet</div>';
            return;
        }

        const maxCount = data[0].conversation_count || 1;
        container.innerHTML = data.map(row => {
            const pct = Math.round((row.conversation_count / maxCount) * 100);
            return `
                <div class="site-stat-row">
                    <div class="site-stat-name" title="${escapeHtml(row.site_name)}">${escapeHtml(row.site_name)}</div>
                    <div class="site-stat-bar-wrap">
                        <div class="site-stat-bar" style="width:${pct}%"></div>
                    </div>
                    <div class="site-stat-count">${row.conversation_count} <span class="site-stat-msgs">${row.message_count} msgs</span></div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load conversations by site:', error);
    }
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupAnalyticsPeriodButtons() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            loadConversationTrend();
        });
    });
}

// ==================== Customization Panel ====================

let currentSiteConfig = null;

function setupCustomizeTabs() {
    const tabsContainer = document.querySelector('.customize-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.customize-tab');
            if (!tab) return;
            
            document.querySelectorAll('.customize-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.customize-content').forEach(c => c.classList.add('hidden'));
            const contentEl = document.getElementById(`customize-${tabId}`);
            if (contentEl) {
                contentEl.classList.remove('hidden');
            }
        });
    }
    
    // Color input sync with live preview
    const colorInput = document.getElementById('config-color');
    const colorTextInput = document.getElementById('config-color-text');
    
    if (colorInput && colorTextInput) {
        colorInput.addEventListener('input', () => {
            colorTextInput.value = colorInput.value.toUpperCase();
            updateWidgetPreview();
        });
        
        colorTextInput.addEventListener('input', () => {
            const value = colorTextInput.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                colorInput.value = value;
                updateWidgetPreview();
            }
        });
    }
    
    // Title input with live preview
    const titleInput = document.getElementById('config-title');
    if (titleInput) {
        titleInput.addEventListener('input', updateWidgetPreview);
    }
    
    // Welcome message with live preview
    const welcomeInput = document.getElementById('config-welcome');
    if (welcomeInput) {
        welcomeInput.addEventListener('input', updateWidgetPreview);
    }
    
    // White-label fields with live preview
    const hideBrandingCheckbox = document.getElementById('config-hide-branding');
    if (hideBrandingCheckbox) {
        hideBrandingCheckbox.addEventListener('change', updateWidgetPreview);
    }
    
    const customBrandingInput = document.getElementById('config-custom-branding');
    if (customBrandingInput) {
        customBrandingInput.addEventListener('input', updateWidgetPreview);
    }
    
    const customBrandingUrlInput = document.getElementById('config-custom-branding-url');
    if (customBrandingUrlInput) {
        customBrandingUrlInput.addEventListener('input', updateWidgetPreview);
    }
    
    // Temperature slider
    const tempSlider = document.getElementById('config-temperature');
    const tempValue = document.getElementById('temp-value');
    
    if (tempSlider && tempValue) {
        tempSlider.addEventListener('input', () => {
            tempValue.textContent = tempSlider.value;
        });
    }
    
    // Save and Reset buttons
    document.getElementById('save-config')?.addEventListener('click', saveConfig);
    document.getElementById('reset-config')?.addEventListener('click', resetConfig);
    
    // Appearance embed copy button
    document.getElementById('copy-appearance-embed')?.addEventListener('click', copyAppearanceEmbed);
}

function updateWidgetPreview() {
    const color = document.getElementById('config-color')?.value || '#0D9488';
    const title = document.getElementById('config-title')?.value || 'Chat with us';
    const welcome = document.getElementById('config-welcome')?.value || 'Hi! How can I help you today?';
    
    // Helper function to adjust color brightness
    function adjustColor(hex, amount) {
        let c = hex.replace('#', '');
        let num = parseInt(c, 16);
        let r = Math.min(255, Math.max(0, (num >> 16) + amount));
        let g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        let b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    
    const darkColor = adjustColor(color, -20);
    
    // Update preview header
    const previewHeader = document.getElementById('preview-header');
    if (previewHeader) {
        previewHeader.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update preview title
    const previewTitle = document.getElementById('preview-title');
    if (previewTitle) {
        previewTitle.textContent = title;
    }
    
    // Update preview welcome message
    const previewWelcome = document.getElementById('preview-welcome');
    if (previewWelcome) {
        previewWelcome.textContent = welcome;
    }
    
    // Update preview avatar
    const previewAvatar = document.getElementById('preview-avatar');
    if (previewAvatar) {
        previewAvatar.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update preview send button
    const previewSend = document.getElementById('preview-send');
    if (previewSend) {
        previewSend.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update preview branding
    const previewBranding = document.getElementById('preview-branding');
    if (previewBranding) {
        const whiteLabelEnabled = document.getElementById('config-hide-branding')?.checked;
        const customBrandingText = document.getElementById('config-custom-branding')?.value?.trim();
        const customBrandingUrl = document.getElementById('config-custom-branding-url')?.value;
        const link = previewBranding.querySelector('a');
        
        // Toggle white-label fields visibility
        document.querySelectorAll('.whitelabel-fields').forEach(el => {
            el.style.display = whiteLabelEnabled ? 'block' : 'none';
        });
        
        if (whiteLabelEnabled) {
            if (customBrandingText) {
                // Show custom branding
                previewBranding.classList.remove('hidden');
                if (link) {
                    link.innerHTML = customBrandingText;
                    link.href = customBrandingUrl || '#';
                }
            } else {
                // White-label enabled but no text - hide completely
                previewBranding.classList.add('hidden');
            }
        } else {
            // White-label disabled - show default SiteChat branding
            previewBranding.classList.remove('hidden');
            if (link) {
                link.innerHTML = 'Powered by <strong>SiteChat</strong>';
                link.href = 'https://sitechat.in';
            }
        }
    }
    
    // Update appearance preview (mini preview in appearance tab)
    updateAppearancePreview(color, darkColor, title, welcome);
}

function updateAppearancePreview(color, darkColor, title, welcome) {
    // Update appearance preview header
    const appearancePreviewHeader = document.getElementById('appearance-preview-header');
    if (appearancePreviewHeader) {
        appearancePreviewHeader.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update appearance preview title
    const appearancePreviewTitle = document.getElementById('appearance-preview-title');
    if (appearancePreviewTitle) {
        appearancePreviewTitle.textContent = title;
    }
    
    // Update appearance preview welcome message
    const appearancePreviewWelcome = document.getElementById('appearance-preview-welcome');
    if (appearancePreviewWelcome) {
        appearancePreviewWelcome.textContent = welcome;
    }
    
    // Update appearance preview avatar
    const appearancePreviewAvatar = document.getElementById('appearance-preview-avatar');
    if (appearancePreviewAvatar) {
        appearancePreviewAvatar.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update appearance preview send button
    const appearancePreviewSend = document.getElementById('appearance-preview-send');
    if (appearancePreviewSend) {
        appearancePreviewSend.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update appearance preview branding
    const appearancePreviewBranding = document.getElementById('appearance-preview-branding');
    if (appearancePreviewBranding) {
        const whiteLabelEnabled = document.getElementById('config-hide-branding')?.checked;
        const customBrandingText = document.getElementById('config-custom-branding')?.value?.trim();
        const customBrandingUrl = document.getElementById('config-custom-branding-url')?.value;
        const link = appearancePreviewBranding.querySelector('a');
        
        if (whiteLabelEnabled) {
            if (customBrandingText) {
                appearancePreviewBranding.classList.remove('hidden');
                if (link) {
                    link.innerHTML = customBrandingText;
                    link.href = customBrandingUrl || '#';
                }
            } else {
                appearancePreviewBranding.classList.add('hidden');
            }
        } else {
            appearancePreviewBranding.classList.remove('hidden');
            if (link) {
                link.innerHTML = 'Powered by <strong>SiteChat</strong>';
                link.href = 'https://sitechat.in';
            }
        }
    }
}

function updateAppearanceEmbedCode() {
    if (!currentDetailSite) return;
    
    const embedCodeEl = document.getElementById('appearance-embed-code');
    if (!embedCodeEl) return;
    
    const baseUrl = window.location.origin;
    const embedCode = `<script>
(function() {
  var s = document.createElement('script');
  s.src = '${baseUrl}/widget/chatbot.js';
  s.async = true;
  s.dataset.siteId = '${currentDetailSite.site_id}';
  s.dataset.apiUrl = '${baseUrl}';
  document.head.appendChild(s);
})();
<\/script>`;
    
    embedCodeEl.textContent = embedCode;
}

async function copyAppearanceEmbed() {
    const embedCodeEl = document.getElementById('appearance-embed-code');
    const copyBtn = document.getElementById('copy-appearance-embed');
    
    if (!embedCodeEl) return;
    
    try {
        await navigator.clipboard.writeText(embedCodeEl.textContent);
        
        const originalHTML = copyBtn.innerHTML;
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
        `;
        
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = originalHTML;
        }, 2000);
    } catch (error) {
        console.error('Failed to copy embed code:', error);
    }
}

async function loadSiteConfig(siteId) {
    try {
        const response = await fetch(`${API_BASE}/sites/${siteId}/config`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            currentSiteConfig = getDefaultConfig();
        } else {
            currentSiteConfig = await response.json();
        }
        
        populateConfigForm(currentSiteConfig);
        updateWidgetPreview();
    } catch (error) {
        console.error('Failed to load site config:', error);
        currentSiteConfig = getDefaultConfig();
        populateConfigForm(currentSiteConfig);
        updateWidgetPreview();
    }
}

function getDefaultConfig() {
    return {
        appearance: {
            primary_color: '#0D9488',
            chat_title: 'Chat with us',
            welcome_message: 'Hi! How can I help you today?',
            bot_avatar_url: null,
            position: 'bottom-right'
        },
        behavior: {
            system_prompt: 'You are a helpful assistant. Answer questions based on the provided context.',
            temperature: 0.7,
            max_tokens: 500,
            show_sources: true
        },
        lead_capture: {
            collect_email: false,
            email_required: false,
            email_prompt: 'Enter your email to continue'
        }
    };
}

function populateConfigForm(config) {
    const appearance = config.appearance || {};
    const behavior = config.behavior || {};
    
    // Appearance
    const colorInput = document.getElementById('config-color');
    const colorTextInput = document.getElementById('config-color-text');
    if (colorInput) colorInput.value = appearance.primary_color || '#0D9488';
    if (colorTextInput) colorTextInput.value = (appearance.primary_color || '#0D9488').toUpperCase();
    
    const titleInput = document.getElementById('config-title');
    if (titleInput) titleInput.value = appearance.chat_title || 'Chat with us';
    
    const welcomeInput = document.getElementById('config-welcome');
    if (welcomeInput) welcomeInput.value = appearance.welcome_message || 'Hi! How can I help you today?';
    
    const positionSelect = document.getElementById('config-position');
    if (positionSelect) positionSelect.value = appearance.position || 'bottom-right';
    
    // White-label options
    const hideBrandingCheckbox = document.getElementById('config-hide-branding');
    const whiteLabelEnabled = appearance.hide_branding === true;
    if (hideBrandingCheckbox) hideBrandingCheckbox.checked = whiteLabelEnabled;
    
    const customBrandingInput = document.getElementById('config-custom-branding');
    if (customBrandingInput) customBrandingInput.value = appearance.custom_branding_text || '';
    
    const customBrandingUrlInput = document.getElementById('config-custom-branding-url');
    if (customBrandingUrlInput) customBrandingUrlInput.value = appearance.custom_branding_url || '';
    
    // Show/hide white-label fields based on checkbox
    document.querySelectorAll('.whitelabel-fields').forEach(el => {
        el.style.display = whiteLabelEnabled ? 'block' : 'none';
    });
    
    // Behavior
    const promptInput = document.getElementById('config-prompt');
    if (promptInput) promptInput.value = behavior.system_prompt || '';
    
    const tempSlider = document.getElementById('config-temperature');
    const tempValue = document.getElementById('temp-value');
    if (tempSlider) tempSlider.value = behavior.temperature || 0.7;
    if (tempValue) tempValue.textContent = behavior.temperature || 0.7;
    
    const maxTokensInput = document.getElementById('config-max-tokens');
    if (maxTokensInput) maxTokensInput.value = behavior.max_tokens || 500;
    
    const showSourcesCheckbox = document.getElementById('config-show-sources');
    if (showSourcesCheckbox) showSourcesCheckbox.checked = behavior.show_sources !== false;
}

function getConfigFromForm() {
    return {
        appearance: {
            primary_color: document.getElementById('config-color')?.value || '#0D9488',
            chat_title: document.getElementById('config-title')?.value || 'Chat with us',
            welcome_message: document.getElementById('config-welcome')?.value || 'Hi! How can I help you today?',
            bot_avatar_url: null,
            position: document.getElementById('config-position')?.value || 'bottom-right',
            hide_branding: document.getElementById('config-hide-branding')?.checked || false,
            custom_branding_text: document.getElementById('config-custom-branding')?.value || null,
            custom_branding_url: document.getElementById('config-custom-branding-url')?.value || null
        },
        behavior: {
            system_prompt: document.getElementById('config-prompt')?.value || '',
            temperature: parseFloat(document.getElementById('config-temperature')?.value) || 0.7,
            max_tokens: parseInt(document.getElementById('config-max-tokens')?.value) || 500,
            show_sources: document.getElementById('config-show-sources')?.checked ?? true
        }
    };
}

async function saveConfig() {
    if (!currentDetailSite) return;
    
    const saveBtn = document.getElementById('save-config');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        const config = getConfigFromForm();
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            currentSiteConfig = await response.json();
            saveBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }, 1500);
        } else {
            throw new Error('Failed to save');
        }
    } catch (error) {
        console.error('Failed to save config:', error);
        alert('Failed to save configuration. Please try again.');
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

async function resetConfig() {
    if (!currentDetailSite) return;
    
    if (!confirm('Are you sure you want to reset the configuration to defaults?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config/reset`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            currentSiteConfig = await response.json();
            populateConfigForm(currentSiteConfig);
        } else {
            throw new Error('Failed to reset');
        }
    } catch (error) {
        console.error('Failed to reset config:', error);
        alert('Failed to reset configuration. Please try again.');
    }
}

// ==================== Conversation Management ====================

let conversationsState = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    siteFilter: '',
    sortBy: 'updated_at',
    sortOrder: 'desc',
    searchQuery: '',
    dateFrom: '',
    dateTo: '',
    statusFilter: '',
    priorityFilter: '',
    tagFilter: '',
    selectedIds: new Set(),
    currentConversation: null
};

let searchDebounceTimer = null;

function initConversationsView() {
    setupConversationEventListeners();
    populateConvSiteFilter();
    loadConversations();
}

function setupConversationEventListeners() {
    const searchInput = document.getElementById('conv-search-input');
    if (searchInput && !searchInput._convListenerSet) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                conversationsState.searchQuery = e.target.value;
                conversationsState.page = 1;
                loadConversations();
            }, 300);
        });
        searchInput._convListenerSet = true;
    }
    
    const siteFilter = document.getElementById('conv-site-filter');
    if (siteFilter && !siteFilter._convListenerSet) {
        siteFilter.addEventListener('change', (e) => {
            conversationsState.siteFilter = e.target.value;
            conversationsState.page = 1;
            loadConversations();
        });
        siteFilter._convListenerSet = true;
    }
    
    const sortSelect = document.getElementById('conv-sort-select');
    if (sortSelect && !sortSelect._convListenerSet) {
        sortSelect.addEventListener('change', (e) => {
            const [sortBy, order] = e.target.value.split('-');
            conversationsState.sortBy = sortBy;
            conversationsState.sortOrder = order;
            conversationsState.page = 1;
            loadConversations();
        });
        sortSelect._convListenerSet = true;
    }

    const dateFrom = document.getElementById('conv-date-from');
    if (dateFrom && !dateFrom._convListenerSet) {
        dateFrom.addEventListener('change', (e) => {
            conversationsState.dateFrom = e.target.value;
            conversationsState.page = 1;
            loadConversations();
        });
        dateFrom._convListenerSet = true;
    }

    const dateTo = document.getElementById('conv-date-to');
    if (dateTo && !dateTo._convListenerSet) {
        dateTo.addEventListener('change', (e) => {
            conversationsState.dateTo = e.target.value;
            conversationsState.page = 1;
            loadConversations();
        });
        dateTo._convListenerSet = true;
    }

    const prevBtn = document.getElementById('prev-page');
    if (prevBtn && !prevBtn._convListenerSet) {
        prevBtn.addEventListener('click', () => {
            if (conversationsState.page > 1) {
                conversationsState.page--;
                loadConversations();
            }
        });
        prevBtn._convListenerSet = true;
    }
    
    const nextBtn = document.getElementById('next-page');
    if (nextBtn && !nextBtn._convListenerSet) {
        nextBtn.addEventListener('click', () => {
            if (conversationsState.page < conversationsState.totalPages) {
                conversationsState.page++;
                loadConversations();
            }
        });
        nextBtn._convListenerSet = true;
    }
    
    const statusFilter = document.getElementById('conv-status-filter');
    if (statusFilter && !statusFilter._convListenerSet) {
        statusFilter.addEventListener('change', (e) => {
            conversationsState.statusFilter = e.target.value;
            conversationsState.page = 1;
            loadConversations();
        });
        statusFilter._convListenerSet = true;
    }

    const priorityFilter = document.getElementById('conv-priority-filter');
    if (priorityFilter && !priorityFilter._convListenerSet) {
        priorityFilter.addEventListener('change', (e) => {
            conversationsState.priorityFilter = e.target.value;
            conversationsState.page = 1;
            loadConversations();
        });
        priorityFilter._convListenerSet = true;
    }

    const bulkStatusSelect = document.getElementById('bulk-status-select');
    if (bulkStatusSelect && !bulkStatusSelect._convListenerSet) {
        bulkStatusSelect.addEventListener('change', async (e) => {
            const status = e.target.value;
            if (!status) return;
            await bulkUpdateStatus(status);
            e.target.value = '';
        });
        bulkStatusSelect._convListenerSet = true;
    }

    const selectAllCheckbox = document.getElementById('select-all-convs');
    if (selectAllCheckbox && !selectAllCheckbox._convListenerSet) {
        selectAllCheckbox.addEventListener('change', (e) => {
            toggleSelectAll(e.target.checked);
        });
        selectAllCheckbox._convListenerSet = true;
    }
    
    const exportSelectedBtn = document.getElementById('export-selected');
    if (exportSelectedBtn && !exportSelectedBtn._convListenerSet) {
        exportSelectedBtn.addEventListener('click', () => openExportModal('bulk'));
        exportSelectedBtn._convListenerSet = true;
    }
    
    const deleteSelectedBtn = document.getElementById('delete-selected');
    if (deleteSelectedBtn && !deleteSelectedBtn._convListenerSet) {
        deleteSelectedBtn.addEventListener('click', () => openDeleteModal('bulk'));
        deleteSelectedBtn._convListenerSet = true;
    }
    
    const exportConvBtn = document.getElementById('export-conv');
    if (exportConvBtn && !exportConvBtn._convListenerSet) {
        exportConvBtn.addEventListener('click', () => openExportModal('single'));
        exportConvBtn._convListenerSet = true;
    }
    
    const deleteConvBtn = document.getElementById('delete-conv');
    if (deleteConvBtn && !deleteConvBtn._convListenerSet) {
        deleteConvBtn.addEventListener('click', () => openDeleteModal('single'));
        deleteConvBtn._convListenerSet = true;
    }
    
    // Export modal
    const closeExportModal = document.getElementById('close-export-modal');
    if (closeExportModal && !closeExportModal._convListenerSet) {
        closeExportModal.addEventListener('click', () => {
            document.getElementById('export-modal').classList.remove('active');
        });
        closeExportModal._convListenerSet = true;
    }
    
    document.querySelectorAll('.export-option').forEach(btn => {
        if (!btn._convListenerSet) {
            btn.addEventListener('click', () => handleExport(btn.dataset.format));
            btn._convListenerSet = true;
        }
    });
    
    // Delete modal
    const closeDeleteModal = document.getElementById('close-delete-modal');
    if (closeDeleteModal && !closeDeleteModal._convListenerSet) {
        closeDeleteModal.addEventListener('click', () => {
            document.getElementById('delete-confirm-modal').classList.remove('active');
        });
        closeDeleteModal._convListenerSet = true;
    }
    
    const cancelDelete = document.getElementById('cancel-delete');
    if (cancelDelete && !cancelDelete._convListenerSet) {
        cancelDelete.addEventListener('click', () => {
            document.getElementById('delete-confirm-modal').classList.remove('active');
        });
        cancelDelete._convListenerSet = true;
    }
    
    const confirmDelete = document.getElementById('confirm-delete');
    if (confirmDelete && !confirmDelete._convListenerSet) {
        confirmDelete.addEventListener('click', handleDelete);
        confirmDelete._convListenerSet = true;
    }
}

async function populateConvSiteFilter() {
    const select = document.getElementById('conv-site-filter');
    if (!select) return;
    
    select.innerHTML = '<option value="">All Sites</option>';
    
    if (sites.length === 0) {
        await loadSites();
    }
    
    sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.site_id;
        option.textContent = site.name || site.url;
        select.appendChild(option);
    });
}

async function loadConversations() {
    const listContainer = document.getElementById('conversations-list');
    listContainer.innerHTML = `
        <div class="conversations-loading">
            <div class="spinner"></div>
            <span>Loading conversations...</span>
        </div>
    `;
    
    try {
        let url;
        const params = new URLSearchParams();
        params.append('page', conversationsState.page);
        params.append('limit', conversationsState.limit);
        
        if (conversationsState.searchQuery) {
            url = `${API_BASE}/conversations/search`;
            params.append('q', conversationsState.searchQuery);
            if (conversationsState.siteFilter) {
                params.append('site_id', conversationsState.siteFilter);
            }
        } else {
            url = `${API_BASE}/conversations`;
            params.append('sort_by', conversationsState.sortBy);
            params.append('order', conversationsState.sortOrder);
            if (conversationsState.siteFilter) {
                params.append('site_id', conversationsState.siteFilter);
            }
            if (conversationsState.dateFrom) {
                params.append('date_from', new Date(conversationsState.dateFrom).toISOString());
            }
            if (conversationsState.dateTo) {
                const toDate = new Date(conversationsState.dateTo);
                toDate.setHours(23, 59, 59, 999);
                params.append('date_to', toDate.toISOString());
            }
            if (conversationsState.statusFilter) {
                params.append('status', conversationsState.statusFilter);
            }
            if (conversationsState.priorityFilter) {
                params.append('priority', conversationsState.priorityFilter);
            }
            if (conversationsState.tagFilter) {
                params.append('tag', conversationsState.tagFilter);
            }
        }
        
        const response = await fetch(`${url}?${params.toString()}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load conversations');
        
        const data = await response.json();
        conversationsState.total = data.total;
        conversationsState.totalPages = data.total_pages;
        
        renderConversationsList(data.conversations);
        updatePagination();
        updateConvCount();
        
    } catch (error) {
        console.error('Failed to load conversations:', error);
        listContainer.innerHTML = `
            <div class="conv-list-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h4>Error loading conversations</h4>
                <p>Please try again later</p>
            </div>
        `;
    }
}

function renderConversationsList(conversations) {
    const listContainer = document.getElementById('conversations-list');
    
    if (!conversations || conversations.length === 0) {
        listContainer.innerHTML = `
            <div class="conv-list-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                </svg>
                <h4>No conversations found</h4>
                <p>${conversationsState.searchQuery ? 'Try a different search term' : 'Conversations will appear here'}</p>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = '';
    
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conv-list-item';
        if (conversationsState.selectedIds.has(conv.session_id)) {
            item.classList.add('selected');
        }
        
        const timeAgo = formatTimeAgo(new Date(conv.updated_at));
        const preview = conv.matching_snippet || conv.first_message || 'No message preview';
        const siteName = sites.find(s => s.site_id === conv.site_id)?.name || conv.site_id || 'Unknown';

        const status = conv.status || 'open';
        const priority = conv.priority || 'medium';
        const unreadDot = conv.unread ? '<span class="conv-unread-dot"></span>' : '';
        const statusBadge = `<span class="conv-status-badge status-${status}">${status}</span>`;
        const priorityBadge = priority !== 'medium' ? `<span class="conv-priority-badge priority-${priority}">${priority}</span>` : '';
        const visitorLabel = conv.visitor_name ? `<span class="conv-visitor-name">${escapeHtml(conv.visitor_name)}</span>` : '';

        item.innerHTML = `
            <input type="checkbox" class="conv-checkbox" data-session-id="${conv.session_id}"
                   ${conversationsState.selectedIds.has(conv.session_id) ? 'checked' : ''}>
            ${unreadDot}
            <div class="conv-list-content">
                <div class="conv-list-header">
                    <span class="conv-list-title">${escapeHtml(siteName)}</span>
                    <span class="conv-list-time">${timeAgo}</span>
                </div>
                <div class="conv-list-badges">
                    ${statusBadge}${priorityBadge}${visitorLabel}
                </div>
                <div class="conv-list-preview">${escapeHtml(preview)}</div>
                <div class="conv-list-meta">
                    <span class="conv-meta-tag">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                        </svg>
                        ${conv.message_count} messages
                    </span>
                </div>
            </div>
        `;
        
        const checkbox = item.querySelector('.conv-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleConversationSelection(conv.session_id, e.target.checked);
        });
        
        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                selectConversation(conv.session_id);
            }
        });
        
        listContainer.appendChild(item);
    });
}

function toggleConversationSelection(sessionId, isSelected) {
    if (isSelected) {
        conversationsState.selectedIds.add(sessionId);
    } else {
        conversationsState.selectedIds.delete(sessionId);
    }
    
    updateBulkActionsBar();
    
    const item = document.querySelector(`.conv-checkbox[data-session-id="${sessionId}"]`)?.closest('.conv-list-item');
    if (item) {
        item.classList.toggle('selected', isSelected);
    }
}

function toggleSelectAll(isSelected) {
    const checkboxes = document.querySelectorAll('.conv-checkbox');
    checkboxes.forEach(cb => {
        const sessionId = cb.dataset.sessionId;
        cb.checked = isSelected;
        if (isSelected) {
            conversationsState.selectedIds.add(sessionId);
        } else {
            conversationsState.selectedIds.delete(sessionId);
        }
        cb.closest('.conv-list-item')?.classList.toggle('selected', isSelected);
    });
    
    updateBulkActionsBar();
}

function updateBulkActionsBar() {
    const bulkBar = document.getElementById('bulk-actions-bar');
    const selectedCount = document.getElementById('selected-count');
    
    if (conversationsState.selectedIds.size > 0) {
        bulkBar.style.display = 'flex';
        selectedCount.textContent = `${conversationsState.selectedIds.size} selected`;
    } else {
        bulkBar.style.display = 'none';
    }
}

function updatePagination() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const info = document.getElementById('pagination-info');
    
    prevBtn.disabled = conversationsState.page <= 1;
    nextBtn.disabled = conversationsState.page >= conversationsState.totalPages;
    info.textContent = `Page ${conversationsState.page} of ${conversationsState.totalPages || 1}`;
}

function updateConvCount() {
    const countEl = document.getElementById('conversations-count');
    if (countEl) {
        countEl.textContent = `${conversationsState.total} total`;
    }
}

async function selectConversation(sessionId) {
    conversationsState.currentConversation = sessionId;

    document.querySelectorAll('.conv-list-item').forEach(item => {
        const checkbox = item.querySelector('.conv-checkbox');
        if (checkbox && checkbox.dataset.sessionId === sessionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    await loadConversationDetail(sessionId);

    // Mark as read
    try {
        await fetch(`${API_BASE}/conversations/${sessionId}/read`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        // Remove unread dot in list
        const item = document.querySelector(`.conv-checkbox[data-session-id="${sessionId}"]`)?.closest('.conv-list-item');
        if (item) item.querySelector('.conv-unread-dot')?.remove();
    } catch(e) { /* silent */ }
}

async function loadConversationDetail(sessionId) {
    const emptyState = document.querySelector('.conversation-detail-empty');
    const contentState = document.getElementById('conversation-detail-content');
    
    emptyState.style.display = 'none';
    contentState.style.display = 'flex';
    
    const transcript = document.getElementById('conversation-transcript');
    transcript.innerHTML = `
        <div class="conversations-loading">
            <div class="spinner"></div>
            <span>Loading conversation...</span>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE}/conversations/${sessionId}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load conversation');
        
        const conv = await response.json();
        
        // Update header
        const siteName = sites.find(s => s.site_id === conv.site_id)?.name || conv.site_id || 'Unknown Site';
        document.getElementById('detail-conv-title').textContent = siteName;
        document.getElementById('detail-conv-meta').textContent = 
            `Started ${formatTimeAgo(new Date(conv.created_at))} • Session: ${conv.session_id.substring(0, 12)}...`;
        
        // Store current conv data for visitor modal pre-fill
        window._currentConvData = conv;

        // Update stats
        document.getElementById('stat-messages').textContent = conv.stats.message_count;
        document.getElementById('stat-response-time').textContent =
            conv.stats.avg_response_time_ms > 0 ? `${Math.round(conv.stats.avg_response_time_ms)}ms` : '-';
        document.getElementById('stat-positive').textContent = conv.stats.positive_feedback;
        document.getElementById('stat-negative').textContent = conv.stats.negative_feedback;
        document.getElementById('stat-first-response').textContent =
            conv.stats.first_response_time_ms ? formatDuration(conv.stats.first_response_time_ms) : '-';
        document.getElementById('stat-resolution').textContent =
            conv.stats.resolution_time_ms ? formatDuration(conv.stats.resolution_time_ms) : '-';

        // Status / priority selects
        const statusSelect = document.getElementById('detail-status-select');
        const prioritySelect = document.getElementById('detail-priority-select');
        if (statusSelect) {
            statusSelect.value = conv.status || 'open';
            // Replace element to clear old listeners
            const newStatus = statusSelect.cloneNode(true);
            statusSelect.parentNode.replaceChild(newStatus, statusSelect);
            newStatus.value = conv.status || 'open';
            newStatus.addEventListener('change', async (e) => {
                await updateConvStatus(conv.session_id, e.target.value);
            });
        }
        if (prioritySelect) {
            prioritySelect.value = conv.priority || 'medium';
            const newPriority = prioritySelect.cloneNode(true);
            prioritySelect.parentNode.replaceChild(newPriority, prioritySelect);
            newPriority.value = conv.priority || 'medium';
            newPriority.addEventListener('change', async (e) => {
                await updateConvPriority(conv.session_id, e.target.value);
            });
        }

        // Visitor info
        renderVisitorInfo(conv);

        // Tags
        window._currentTags = conv.tags || [];
        renderConvTags(window._currentTags);

        // Notes
        renderConvNotes(conv.notes || []);

        // Star rating
        renderStarRating(conv.satisfaction_rating);

        // Sentiment
        if (conv.sentiment !== null && conv.sentiment !== undefined) {
            document.getElementById('conv-sentiment-row').style.display = 'flex';
            const label = conv.sentiment > 0.3 ? '\u{1F60A} Positive' : conv.sentiment < -0.3 ? '\u{1F61E} Negative' : '\u{1F610} Neutral';
            document.getElementById('conv-sentiment-label').textContent = label;
        } else {
            document.getElementById('conv-sentiment-row').style.display = 'none';
        }

        // Page URL context
        if (conv.page_url) {
            document.getElementById('conv-context-row').style.display = 'flex';
            const urlEl = document.getElementById('conv-page-url');
            urlEl.href = conv.page_url;
            urlEl.textContent = conv.page_url;
        } else {
            document.getElementById('conv-context-row').style.display = 'none';
        }

        // Render transcript with Q&A support
        renderTranscript(conv.messages, conv.session_id, conv.site_id);
        
    } catch (error) {
        console.error('Failed to load conversation detail:', error);
        transcript.innerHTML = `
            <div class="conv-list-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h4>Error loading conversation</h4>
                <p>Please try again</p>
            </div>
        `;
    }
}

function renderTranscript(messages, sessionId = null, siteId = null) {
    const transcript = document.getElementById('conversation-transcript');
    
    if (!messages || messages.length === 0) {
        transcript.innerHTML = '<p style="text-align: center; color: var(--gray-400);">No messages in this conversation</p>';
        return;
    }
    
    transcript.innerHTML = '';
    
    messages.forEach((msg, index) => {
        const msgEl = document.createElement('div');
        msgEl.className = `transcript-message ${msg.role}`;
        
        const avatar = msg.role === 'assistant' ? 'AI' : 'U';
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let feedbackHtml = '';
        if (msg.feedback) {
            const feedbackClass = msg.feedback === 'positive' ? 'positive' : 'negative';
            const feedbackIcon = msg.feedback === 'positive' 
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>';
            feedbackHtml = `<span class="transcript-feedback ${feedbackClass}">${feedbackIcon}</span>`;
        }
        
        let sourcesHtml = '';
        if (msg.sources && msg.sources.length > 0 && msg.role === 'assistant') {
            const sourcesItems = msg.sources.slice(0, 3).map(s => 
                `<a href="${escapeHtml(s.url || '#')}" target="_blank" class="transcript-source-item">${escapeHtml(s.title || s.url || 'Source')}</a>`
            ).join('');
            sourcesHtml = `
                <div class="transcript-sources">
                    <div class="transcript-sources-label">Sources</div>
                    ${sourcesItems}
                </div>
            `;
        }
        
        // Q&A actions for assistant messages
        let qaActionsHtml = '';
        if (msg.role === 'assistant' && sessionId && siteId && index > 0) {
            const prevMsg = messages[index - 1];
            const question = prevMsg && prevMsg.role === 'user' ? prevMsg.content : '';
            const answer = msg.content;
            
            if (msg.qa_pair_id) {
                qaActionsHtml = `
                    <div class="transcript-bubble-actions">
                        <span class="qa-badge">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Q&A Created
                        </span>
                    </div>
                `;
            } else {
                const escapedQuestion = escapeHtml(question).replace(/'/g, "\\'").replace(/\n/g, "\\n");
                const escapedAnswer = escapeHtml(answer).replace(/'/g, "\\'").replace(/\n/g, "\\n");
                qaActionsHtml = `
                    <div class="transcript-bubble-actions">
                        <button class="create-qa-btn" onclick="openQAFromConversationModal('${sessionId}', ${index}, '${escapedQuestion}', '${escapedAnswer}', '${siteId}')" title="Create Q&A pair from this response">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2v20M2 12h20"/>
                            </svg>
                            Create Q&A
                        </button>
                    </div>
                `;
            }
        }
        
        msgEl.innerHTML = `
            <div class="transcript-avatar">${avatar}</div>
            <div class="transcript-bubble">
                <div class="transcript-bubble-content">${escapeHtml(msg.content)}</div>
                <div class="transcript-bubble-meta">
                    <span>${time}</span>
                    ${msg.response_time_ms ? `<span>${msg.response_time_ms}ms</span>` : ''}
                    ${feedbackHtml}
                </div>
                ${sourcesHtml}
                ${qaActionsHtml}
            </div>
        `;
        
        transcript.appendChild(msgEl);
    });
    
    transcript.scrollTop = transcript.scrollHeight;
}

// ===== Conversation Feature Functions =====

function formatDuration(ms) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
}

async function updateConvStatus(sessionId, status) {
    try {
        const res = await fetch(`${API_BASE}/conversations/${sessionId}/status`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error();
        loadConversations();
    } catch(e) {
        alert('Failed to update status');
    }
}

async function updateConvPriority(sessionId, priority) {
    try {
        const res = await fetch(`${API_BASE}/conversations/${sessionId}/priority`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority })
        });
        if (!res.ok) throw new Error();
        loadConversations();
    } catch(e) {
        alert('Failed to update priority');
    }
}

async function bulkUpdateStatus(status) {
    const sessionIds = Array.from(conversationsState.selectedIds);
    if (!sessionIds.length) return;
    try {
        await Promise.all(sessionIds.map(id =>
            fetch(`${API_BASE}/conversations/${id}/status`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            })
        ));
        conversationsState.selectedIds.clear();
        updateBulkActionsBar();
        loadConversations();
    } catch(e) {
        alert('Failed to update status for some conversations');
    }
}

function renderVisitorInfo(conv) {
    const el = document.getElementById('conv-visitor-info');
    if (!el) return;
    if (conv.visitor_name || conv.visitor_email) {
        el.innerHTML = `
            ${conv.visitor_name ? `<div class="visitor-field"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> ${escapeHtml(conv.visitor_name)}</div>` : ''}
            ${conv.visitor_email ? `<div class="visitor-field"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg> <a href="mailto:${escapeHtml(conv.visitor_email)}">${escapeHtml(conv.visitor_email)}</a></div>` : ''}
        `;
    } else {
        el.innerHTML = '<span class="visitor-empty">No visitor info</span>';
    }
}

function renderConvTags(tags) {
    const list = document.getElementById('conv-tags-list');
    if (!list) return;
    list.innerHTML = tags.map((tag, idx) => `
        <span class="conv-tag-pill">
            ${escapeHtml(tag)}
            <button onclick="removeConvTagByIndex(${idx})" class="tag-remove">&times;</button>
        </span>
    `).join('');
}

window._currentTags = [];

async function addConvTag() {
    const input = document.getElementById('conv-tag-input');
    if (!input) return;
    const tag = input.value.trim();
    if (!tag || window._currentTags.includes(tag)) return;
    window._currentTags = [...window._currentTags, tag];
    input.value = '';
    await saveConvTags();
    renderConvTags(window._currentTags);
}

async function removeConvTagByIndex(idx) {
    window._currentTags = window._currentTags.filter((_, i) => i !== idx);
    await saveConvTags();
    renderConvTags(window._currentTags);
}

async function saveConvTags() {
    const sessionId = conversationsState.currentConversation;
    if (!sessionId) return;
    try {
        await fetch(`${API_BASE}/conversations/${sessionId}/tags`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: window._currentTags })
        });
    } catch(e) { /* silent */ }
}

window._notesStore = {};

function renderConvNotes(notes) {
    const list = document.getElementById('conv-notes-list');
    if (!list) return;
    if (!notes.length) {
        list.innerHTML = '<span class="visitor-empty">No notes yet</span>';
        window._notesStore = {};
        return;
    }
    window._notesStore = {};
    notes.forEach(note => { window._notesStore[note.note_id] = note.content; });
    list.innerHTML = notes.map(note => `
        <div class="conv-note-item" data-note-id="${note.note_id}">
            <div class="conv-note-content">${escapeHtml(note.content)}</div>
            <div class="conv-note-meta">
                <span>${formatTimeAgo(new Date(note.created_at))}</span>
                <div class="conv-note-actions">
                    <button onclick="openEditNoteModal('${note.note_id}')" class="btn-link">Edit</button>
                    <button onclick="deleteNote('${note.note_id}')" class="btn-link danger">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

let _editingNoteId = null;

function openAddNoteModal() {
    _editingNoteId = null;
    const titleEl = document.getElementById('note-modal-title');
    const inputEl = document.getElementById('note-content-input');
    if (titleEl) titleEl.textContent = 'Add Note';
    if (inputEl) inputEl.value = '';
    document.getElementById('note-modal')?.classList.add('active');
}

function openEditNoteModal(noteId) {
    _editingNoteId = noteId;
    const titleEl = document.getElementById('note-modal-title');
    const inputEl = document.getElementById('note-content-input');
    if (titleEl) titleEl.textContent = 'Edit Note';
    if (inputEl) inputEl.value = window._notesStore[noteId] || '';
    document.getElementById('note-modal')?.classList.add('active');
}

async function saveNote() {
    const contentEl = document.getElementById('note-content-input');
    const content = contentEl ? contentEl.value.trim() : '';
    if (!content) return;
    const sessionId = conversationsState.currentConversation;
    document.getElementById('note-modal')?.classList.remove('active');
    try {
        if (_editingNoteId) {
            await fetch(`${API_BASE}/conversations/${sessionId}/notes/${_editingNoteId}`, {
                method: 'PUT',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
        } else {
            await fetch(`${API_BASE}/conversations/${sessionId}/notes`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
        }
        loadConversationDetail(sessionId);
    } catch(e) {
        alert('Failed to save note');
    }
}

async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    const sessionId = conversationsState.currentConversation;
    try {
        await fetch(`${API_BASE}/conversations/${sessionId}/notes/${noteId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        loadConversationDetail(sessionId);
    } catch(e) {
        alert('Failed to delete note');
    }
}

function openEditVisitorModal() {
    const conv = window._currentConvData;
    const nameEl = document.getElementById('visitor-name-input');
    const emailEl = document.getElementById('visitor-email-input');
    if (nameEl) nameEl.value = conv ? (conv.visitor_name || '') : '';
    if (emailEl) emailEl.value = conv ? (conv.visitor_email || '') : '';
    document.getElementById('edit-visitor-modal')?.classList.add('active');
}

async function saveVisitorInfo() {
    const nameEl = document.getElementById('visitor-name-input');
    const emailEl = document.getElementById('visitor-email-input');
    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const sessionId = conversationsState.currentConversation;
    document.getElementById('edit-visitor-modal')?.classList.remove('active');
    try {
        await fetch(`${API_BASE}/conversations/${sessionId}/visitor`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitor_name: name || null, visitor_email: email || null })
        });
        loadConversationDetail(sessionId);
    } catch(e) {
        alert('Failed to save visitor info');
    }
}

function renderStarRating(currentRating) {
    const stars = document.querySelectorAll('#conv-star-rating .star');
    stars.forEach(star => {
        const val = parseInt(star.dataset.value);
        star.classList.toggle('active', !!(currentRating && val <= currentRating));
        star.onclick = () => setConvRating(val);
    });
}

async function setConvRating(rating) {
    const sessionId = conversationsState.currentConversation;
    try {
        await fetch(`${API_BASE}/conversations/${sessionId}/rating`, {
            method: 'PATCH',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating })
        });
        renderStarRating(rating);
    } catch(e) {
        alert('Failed to set rating');
    }
}

// Export functionality
let exportMode = 'single';

function openExportModal(mode) {
    exportMode = mode;
    document.getElementById('export-modal').classList.add('active');
}

async function handleExport(format) {
    document.getElementById('export-modal').classList.remove('active');
    
    const sessionIds = exportMode === 'bulk' 
        ? Array.from(conversationsState.selectedIds)
        : [conversationsState.currentConversation];
    
    if (sessionIds.length === 0 || (sessionIds.length === 1 && !sessionIds[0])) {
        alert('No conversations selected for export');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/conversations/export`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                session_ids: sessionIds,
                format: format
            })
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversations_export.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export conversations. Please try again.');
    }
}

// Delete functionality
let deleteMode = 'single';

function openDeleteModal(mode) {
    deleteMode = mode;
    const messageEl = document.getElementById('delete-confirm-message');
    
    if (mode === 'bulk') {
        const count = conversationsState.selectedIds.size;
        messageEl.textContent = `Are you sure you want to delete ${count} conversation${count > 1 ? 's' : ''}? This action cannot be undone.`;
    } else {
        messageEl.textContent = 'Are you sure you want to delete this conversation? This action cannot be undone.';
    }
    
    document.getElementById('delete-confirm-modal').classList.add('active');
}

async function handleDelete() {
    document.getElementById('delete-confirm-modal').classList.remove('active');
    
    const sessionIds = deleteMode === 'bulk'
        ? Array.from(conversationsState.selectedIds)
        : [conversationsState.currentConversation];
    
    if (sessionIds.length === 0 || (sessionIds.length === 1 && !sessionIds[0])) {
        return;
    }
    
    try {
        if (sessionIds.length === 1) {
            await fetch(`${API_BASE}/conversations/${sessionIds[0]}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
        } else {
            await fetch(`${API_BASE}/conversations/bulk-delete`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ session_ids: sessionIds })
            });
        }
        
        conversationsState.selectedIds.clear();
        conversationsState.currentConversation = null;
        updateBulkActionsBar();
        
        // Hide detail panel
        document.querySelector('.conversation-detail-empty').style.display = 'flex';
        document.getElementById('conversation-detail-content').style.display = 'none';
        
        // Reload list
        await loadConversations();
        
    } catch (error) {
        console.error('Delete failed:', error);
        alert('Failed to delete conversation(s). Please try again.');
    }
}

// ==================== Quick Prompts Management ====================

let quickPromptsState = {
    prompts: [],
    enabled: true,
    showAfterResponse: false,
    maxDisplay: 4
};

function initQuickPromptsHandlers() {
    document.getElementById('add-quick-prompt-btn')?.addEventListener('click', () => addQuickPromptRow());
    document.getElementById('add-quick-prompt-empty-btn')?.addEventListener('click', () => addQuickPromptRow());
    
    document.getElementById('quick-prompts-enabled')?.addEventListener('change', (e) => {
        const content = document.getElementById('quick-prompts-content');
        if (content) {
            content.style.opacity = e.target.checked ? '1' : '0.5';
            content.style.pointerEvents = e.target.checked ? 'auto' : 'none';
        }
        quickPromptsState.enabled = e.target.checked;
    });
    
    document.getElementById('quick-prompts-max-display')?.addEventListener('change', (e) => {
        quickPromptsState.maxDisplay = parseInt(e.target.value);
    });
    
    document.getElementById('quick-prompts-show-after-response')?.addEventListener('change', (e) => {
        quickPromptsState.showAfterResponse = e.target.checked;
    });
    
    document.getElementById('save-quick-prompts')?.addEventListener('click', saveQuickPrompts);
}

async function loadQuickPrompts() {
    if (!currentDetailSite) return;
    
    const listEl = document.getElementById('quick-prompts-list');
    const emptyEl = document.getElementById('quick-prompts-empty');
    
    listEl.innerHTML = `
        <div class="quick-prompts-loading">
            <div class="spinner-sm"></div>
            <span>Loading prompts...</span>
        </div>
    `;
    emptyEl.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/quick-prompts`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load quick prompts');
        
        const data = await response.json();
        quickPromptsState.prompts = data.prompts || [];
        quickPromptsState.enabled = data.enabled !== false;
        quickPromptsState.showAfterResponse = data.show_after_response === true;
        quickPromptsState.maxDisplay = data.max_display || 4;
        
        renderQuickPromptsList();
        
        // Update toggles
        const enabledToggle = document.getElementById('quick-prompts-enabled');
        if (enabledToggle) enabledToggle.checked = quickPromptsState.enabled;
        
        const showAfterToggle = document.getElementById('quick-prompts-show-after-response');
        if (showAfterToggle) showAfterToggle.checked = quickPromptsState.showAfterResponse;
        
        const maxDisplaySelect = document.getElementById('quick-prompts-max-display');
        if (maxDisplaySelect) maxDisplaySelect.value = quickPromptsState.maxDisplay;
        
        const content = document.getElementById('quick-prompts-content');
        if (content) {
            content.style.opacity = quickPromptsState.enabled ? '1' : '0.5';
            content.style.pointerEvents = quickPromptsState.enabled ? 'auto' : 'none';
        }
        
    } catch (error) {
        console.error('Failed to load quick prompts:', error);
        listEl.innerHTML = '<div class="quick-prompts-loading">Error loading prompts</div>';
    }
}

function renderQuickPromptsList() {
    const listEl = document.getElementById('quick-prompts-list');
    const emptyEl = document.getElementById('quick-prompts-empty');
    
    if (quickPromptsState.prompts.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    
    quickPromptsState.prompts.forEach((prompt, index) => {
        const item = document.createElement('div');
        item.className = 'quick-prompt-item';
        item.dataset.id = prompt.id;
        item.innerHTML = `
            <div class="quick-prompt-drag-handle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="8" y1="6" x2="16" y2="6"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                    <line x1="8" y1="18" x2="16" y2="18"/>
                </svg>
            </div>
            <div class="quick-prompt-icon-wrapper">
                <input type="text" class="quick-prompt-icon-input" value="${escapeHtml(prompt.icon || '')}" placeholder="💬" maxlength="4" title="Emoji icon">
            </div>
            <div class="quick-prompt-text-wrapper">
                <input type="text" class="quick-prompt-text-input" value="${escapeHtml(prompt.text)}" placeholder="Enter prompt text..." maxlength="100">
            </div>
            <div class="quick-prompt-actions">
                <label class="quick-prompt-toggle" title="Enable/Disable">
                    <input type="checkbox" class="quick-prompt-enabled" ${prompt.enabled !== false ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <button type="button" class="quick-prompt-move-up" title="Move up" ${index === 0 ? 'disabled' : ''}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="18 15 12 9 6 15"/>
                    </svg>
                </button>
                <button type="button" class="quick-prompt-move-down" title="Move down" ${index === quickPromptsState.prompts.length - 1 ? 'disabled' : ''}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <button type="button" class="quick-prompt-delete" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Event listeners
        item.querySelector('.quick-prompt-icon-input').addEventListener('change', (e) => {
            quickPromptsState.prompts[index].icon = e.target.value;
        });
        
        item.querySelector('.quick-prompt-text-input').addEventListener('change', (e) => {
            quickPromptsState.prompts[index].text = e.target.value;
        });
        
        item.querySelector('.quick-prompt-enabled').addEventListener('change', (e) => {
            quickPromptsState.prompts[index].enabled = e.target.checked;
        });
        
        item.querySelector('.quick-prompt-move-up').addEventListener('click', () => {
            moveQuickPrompt(index, -1);
        });
        
        item.querySelector('.quick-prompt-move-down').addEventListener('click', () => {
            moveQuickPrompt(index, 1);
        });
        
        item.querySelector('.quick-prompt-delete').addEventListener('click', () => {
            deleteQuickPrompt(index);
        });
        
        listEl.appendChild(item);
    });
}

function addQuickPromptRow() {
    const newPrompt = {
        id: Math.random().toString(36).substring(2, 10),
        text: '',
        icon: '',
        enabled: true
    };
    
    quickPromptsState.prompts.push(newPrompt);
    renderQuickPromptsList();
    
    // Focus the new prompt's text input
    const items = document.querySelectorAll('.quick-prompt-item');
    const lastItem = items[items.length - 1];
    if (lastItem) {
        lastItem.querySelector('.quick-prompt-text-input').focus();
    }
}

function moveQuickPrompt(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= quickPromptsState.prompts.length) return;
    
    const temp = quickPromptsState.prompts[index];
    quickPromptsState.prompts[index] = quickPromptsState.prompts[newIndex];
    quickPromptsState.prompts[newIndex] = temp;
    
    renderQuickPromptsList();
}

function deleteQuickPrompt(index) {
    quickPromptsState.prompts.splice(index, 1);
    renderQuickPromptsList();
}

async function saveQuickPrompts() {
    if (!currentDetailSite) return;
    
    // Validate prompts - remove empty ones
    const validPrompts = quickPromptsState.prompts.filter(p => p.text && p.text.trim());
    
    const btn = document.getElementById('save-quick-prompts');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/quick-prompts`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                enabled: quickPromptsState.enabled,
                prompts: validPrompts,
                show_after_response: quickPromptsState.showAfterResponse,
                max_display: quickPromptsState.maxDisplay
            })
        });
        
        if (!response.ok) throw new Error('Failed to save quick prompts');
        
        // Update local state with validated prompts
        quickPromptsState.prompts = validPrompts;
        
        // Also update the site config cache
        if (currentSiteConfig) {
            currentSiteConfig.quick_prompts = {
                enabled: quickPromptsState.enabled,
                prompts: validPrompts,
                show_after_response: quickPromptsState.showAfterResponse,
                max_display: quickPromptsState.maxDisplay
            };
        }
        
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved!';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);
        
        renderQuickPromptsList();
        
    } catch (error) {
        console.error('Failed to save quick prompts:', error);
        btn.innerHTML = 'Error - Try Again';
        btn.disabled = false;
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    }
}

// ==================== Proactive Chat Triggers ====================

let triggersState = {
    triggers: [],
    globalCooldownMs: 30000,
    editingTriggerId: null,
    conditionIndex: 0
};

function setupTriggersEventListeners() {
    // Add trigger buttons
    document.getElementById('add-trigger-btn')?.addEventListener('click', () => openTriggerModal());
    document.getElementById('add-trigger-empty-btn')?.addEventListener('click', () => openTriggerModal());
    
    // Create default triggers
    document.getElementById('create-default-triggers')?.addEventListener('click', createDefaultTriggers);
    
    // Trigger modal
    document.getElementById('close-trigger-modal')?.addEventListener('click', closeTriggerModal);
    document.getElementById('cancel-trigger')?.addEventListener('click', closeTriggerModal);
    document.getElementById('trigger-form')?.addEventListener('submit', saveTrigger);
    
    // Add condition
    document.getElementById('add-condition-btn')?.addEventListener('click', addConditionRow);
    
    // Global cooldown
    document.getElementById('global-cooldown')?.addEventListener('change', async (e) => {
        if (!currentDetailSite) return;
        try {
            await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/cooldown?cooldown_ms=${e.target.value}`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
        } catch (error) {
            console.error('Failed to update cooldown:', error);
        }
    });
}

async function loadTriggers() {
    if (!currentDetailSite) return;
    
    const listEl = document.getElementById('triggers-list');
    const emptyEl = document.getElementById('triggers-empty');
    
    listEl.innerHTML = `
        <div class="triggers-loading">
            <div class="spinner-sm"></div>
            <span>Loading triggers...</span>
        </div>
    `;
    emptyEl.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load triggers');
        
        const data = await response.json();
        triggersState.triggers = data.triggers || [];
        triggersState.globalCooldownMs = data.global_cooldown_ms || 30000;
        
        renderTriggersList();
        
        // Set cooldown select
        const cooldownSelect = document.getElementById('global-cooldown');
        if (cooldownSelect) {
            cooldownSelect.value = triggersState.globalCooldownMs;
        }
        
    } catch (error) {
        console.error('Failed to load triggers:', error);
        listEl.innerHTML = '<div class="triggers-loading">Error loading triggers</div>';
    }
}

function renderTriggersList() {
    const listEl = document.getElementById('triggers-list');
    const emptyEl = document.getElementById('triggers-empty');
    
    if (triggersState.triggers.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    
    triggersState.triggers.forEach(trigger => {
        const summary = summarizeTriggerConditions(trigger.conditions);
        
        const item = document.createElement('div');
        item.className = `trigger-item ${trigger.enabled ? '' : 'disabled'}`;
        item.dataset.triggerId = trigger.id;
        
        item.innerHTML = `
            <div class="trigger-toggle ${trigger.enabled ? 'active' : ''}" data-trigger-id="${trigger.id}"></div>
            <div class="trigger-info">
                <div class="trigger-name">${escapeHtml(trigger.name)}</div>
                <div class="trigger-summary">${escapeHtml(summary)}</div>
            </div>
            <div class="trigger-actions">
                <button class="trigger-action-btn edit" data-trigger-id="${trigger.id}" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="trigger-action-btn delete" data-trigger-id="${trigger.id}" title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Toggle click
        item.querySelector('.trigger-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTriggerEnabled(trigger.id, !trigger.enabled);
        });
        
        // Edit click
        item.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openTriggerModal(trigger);
        });
        
        // Delete click
        item.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTrigger(trigger.id);
        });
        
        listEl.appendChild(item);
    });
}

function summarizeTriggerConditions(conditions) {
    if (!conditions || conditions.length === 0) return 'No conditions';
    
    const summaries = conditions.map(c => {
        switch (c.type) {
            case 'time': return `${c.value}s on page`;
            case 'scroll': return `${c.value}% scroll`;
            case 'exit_intent': return 'Exit intent';
            case 'url': return `URL: ${c.value}`;
            case 'visit_count': return `${c.value} visits`;
            default: return c.type;
        }
    });
    
    return summaries.join(' + ');
}

function openTriggerModal(trigger = null) {
    triggersState.editingTriggerId = trigger?.id || null;
    triggersState.conditionIndex = 0;
    
    const modal = document.getElementById('trigger-editor-modal');
    const title = document.getElementById('trigger-modal-title');
    const form = document.getElementById('trigger-form');
    
    title.textContent = trigger ? 'Edit Trigger' : 'Create Trigger';
    form.reset();
    
    // Clear conditions
    document.getElementById('conditions-list').innerHTML = '';
    
    if (trigger) {
        document.getElementById('trigger-id').value = trigger.id;
        document.getElementById('trigger-name').value = trigger.name || '';
        document.getElementById('trigger-message').value = trigger.message || '';
        document.getElementById('trigger-delay').value = trigger.delay_after_trigger_ms || 0;
        document.getElementById('trigger-priority').value = trigger.priority || 0;
        document.getElementById('trigger-once-session').checked = trigger.show_once_per_session !== false;
        document.getElementById('trigger-once-visitor').checked = trigger.show_once_per_visitor === true;
        document.getElementById('trigger-enabled').checked = trigger.enabled !== false;
        
        // Add condition rows
        if (trigger.conditions) {
            trigger.conditions.forEach(c => addConditionRow(c));
        }
    } else {
        document.getElementById('trigger-enabled').checked = true;
        document.getElementById('trigger-once-session').checked = true;
        addConditionRow();
    }
    
    modal.classList.add('active');
}

function closeTriggerModal() {
    document.getElementById('trigger-editor-modal').classList.remove('active');
    triggersState.editingTriggerId = null;
}

function addConditionRow(existingCondition = null) {
    const template = document.getElementById('condition-template');
    const list = document.getElementById('conditions-list');
    
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.condition-row');
    row.dataset.index = triggersState.conditionIndex++;
    
    if (existingCondition) {
        row.querySelector('.condition-type').value = existingCondition.type || 'time';
        row.querySelector('.condition-operator').value = existingCondition.operator || 'gte';
        row.querySelector('.condition-value').value = existingCondition.value || '';
    }
    
    // Update unit label based on type
    const typeSelect = row.querySelector('.condition-type');
    const unitLabel = row.querySelector('.condition-unit');
    const operatorSelect = row.querySelector('.condition-operator');
    
    updateConditionUI(typeSelect.value, unitLabel, operatorSelect);
    
    typeSelect.addEventListener('change', () => {
        updateConditionUI(typeSelect.value, unitLabel, operatorSelect);
    });
    
    // Remove button
    row.querySelector('.remove-condition').addEventListener('click', () => {
        row.remove();
    });
    
    list.appendChild(row);
}

function updateConditionUI(type, unitLabel, operatorSelect) {
    const numericOperators = ['gte', 'lte', 'eq', 'gt', 'lt'];
    const stringOperators = ['contains', 'matches', 'eq'];
    
    switch (type) {
        case 'time':
            unitLabel.textContent = 'seconds';
            setOperatorOptions(operatorSelect, numericOperators);
            break;
        case 'scroll':
            unitLabel.textContent = '%';
            setOperatorOptions(operatorSelect, numericOperators);
            break;
        case 'exit_intent':
            unitLabel.textContent = '';
            operatorSelect.style.display = 'none';
            break;
        case 'url':
            unitLabel.textContent = '';
            operatorSelect.style.display = 'block';
            setOperatorOptions(operatorSelect, stringOperators);
            break;
        case 'visit_count':
            unitLabel.textContent = 'visits';
            setOperatorOptions(operatorSelect, numericOperators);
            break;
        default:
            unitLabel.textContent = '';
            operatorSelect.style.display = 'block';
    }
}

function setOperatorOptions(select, operators) {
    const allOptions = {
        'gte': '≥ (greater or equal)',
        'lte': '≤ (less or equal)',
        'eq': '= (equals)',
        'gt': '> (greater)',
        'lt': '< (less)',
        'contains': 'contains',
        'matches': 'matches pattern'
    };
    
    const currentValue = select.value;
    select.innerHTML = '';
    
    operators.forEach(op => {
        const option = document.createElement('option');
        option.value = op;
        option.textContent = allOptions[op];
        select.appendChild(option);
    });
    
    if (operators.includes(currentValue)) {
        select.value = currentValue;
    }
}

function getConditionsFromForm() {
    const conditions = [];
    const rows = document.querySelectorAll('#conditions-list .condition-row');
    
    rows.forEach(row => {
        const type = row.querySelector('.condition-type').value;
        const operator = row.querySelector('.condition-operator').value;
        let value = row.querySelector('.condition-value').value;
        
        if (type === 'exit_intent') {
            value = true;
        } else if (['time', 'scroll', 'visit_count'].includes(type)) {
            value = parseInt(value) || 0;
        }
        
        conditions.push({ type, operator, value });
    });
    
    return conditions;
}

async function saveTrigger(e) {
    e.preventDefault();
    
    if (!currentDetailSite) return;
    
    const saveBtn = document.getElementById('save-trigger');
    const btnLabel = saveBtn.querySelector('.btn-label');
    const btnSpinner = saveBtn.querySelector('.btn-spinner');
    
    btnLabel.classList.add('hidden');
    btnSpinner.classList.remove('hidden');
    saveBtn.disabled = true;
    
    const conditions = getConditionsFromForm();
    
    if (conditions.length === 0) {
        alert('Please add at least one condition');
        btnLabel.classList.remove('hidden');
        btnSpinner.classList.add('hidden');
        saveBtn.disabled = false;
        return;
    }
    
    const triggerData = {
        name: document.getElementById('trigger-name').value,
        enabled: document.getElementById('trigger-enabled').checked,
        priority: parseInt(document.getElementById('trigger-priority').value) || 0,
        conditions: conditions,
        message: document.getElementById('trigger-message').value,
        delay_after_trigger_ms: parseInt(document.getElementById('trigger-delay').value) || 0,
        show_once_per_session: document.getElementById('trigger-once-session').checked,
        show_once_per_visitor: document.getElementById('trigger-once-visitor').checked
    };
    
    try {
        let response;
        
        if (triggersState.editingTriggerId) {
            response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/${triggersState.editingTriggerId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(triggerData)
            });
        } else {
            response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(triggerData)
            });
        }
        
        if (!response.ok) throw new Error('Failed to save trigger');
        
        closeTriggerModal();
        await loadTriggers();
        
    } catch (error) {
        console.error('Failed to save trigger:', error);
        alert('Failed to save trigger. Please try again.');
    } finally {
        btnLabel.classList.remove('hidden');
        btnSpinner.classList.add('hidden');
        saveBtn.disabled = false;
    }
}

async function toggleTriggerEnabled(triggerId, enabled) {
    if (!currentDetailSite) return;
    
    try {
        await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/${triggerId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ enabled })
        });
        
        // Update local state
        const trigger = triggersState.triggers.find(t => t.id === triggerId);
        if (trigger) {
            trigger.enabled = enabled;
        }
        
        renderTriggersList();
        
    } catch (error) {
        console.error('Failed to toggle trigger:', error);
    }
}

async function deleteTrigger(triggerId) {
    if (!currentDetailSite) return;
    
    if (!confirm('Are you sure you want to delete this trigger?')) return;
    
    try {
        await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/${triggerId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        await loadTriggers();
        
    } catch (error) {
        console.error('Failed to delete trigger:', error);
        alert('Failed to delete trigger. Please try again.');
    }
}

async function createDefaultTriggers() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('create-default-triggers');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Creating...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/defaults`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to create default triggers');
        
        await loadTriggers();
        
    } catch (error) {
        console.error('Failed to create default triggers:', error);
        alert('Failed to create default triggers. Please try again.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function loadTriggerAnalytics() {
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/analytics/triggers/${currentDetailSite.site_id}?period_days=7`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        renderTriggerAnalytics(data);
        
    } catch (error) {
        console.error('Failed to load trigger analytics:', error);
    }
}

function renderTriggerAnalytics(data) {
    const container = document.getElementById('customize-triggers');
    if (!container) return;
    
    let analyticsCard = container.querySelector('.trigger-analytics-card');
    
    if (data.triggers.length === 0) {
        if (analyticsCard) analyticsCard.remove();
        return;
    }
    
    if (!analyticsCard) {
        analyticsCard = document.createElement('div');
        analyticsCard.className = 'trigger-analytics-card';
        container.appendChild(analyticsCard);
    }
    
    const totalClickRate = data.total_shown > 0 
        ? Math.round((data.total_clicked / data.total_shown) * 100) 
        : 0;
    
    analyticsCard.innerHTML = `
        <div class="trigger-analytics-header">
            <h5>Trigger Performance (Last 7 days)</h5>
        </div>
        <div class="trigger-stats-grid">
            <div class="trigger-stat">
                <span class="trigger-stat-value">${data.total_shown}</span>
                <span class="trigger-stat-label">Shown</span>
            </div>
            <div class="trigger-stat success">
                <span class="trigger-stat-value">${data.total_clicked}</span>
                <span class="trigger-stat-label">Clicked</span>
            </div>
            <div class="trigger-stat">
                <span class="trigger-stat-value">${data.total_converted}</span>
                <span class="trigger-stat-label">Converted</span>
            </div>
            <div class="trigger-stat warning">
                <span class="trigger-stat-value">${totalClickRate}%</span>
                <span class="trigger-stat-label">Click Rate</span>
            </div>
        </div>
        ${data.triggers.length > 0 ? `
            <div style="margin-top: 16px;">
                ${data.triggers.map(t => `
                    <div class="trigger-perf-row">
                        <span class="trigger-perf-name">${escapeHtml(t.trigger_name)}</span>
                        <div class="trigger-perf-bar">
                            <div class="trigger-perf-fill" style="width: ${t.click_rate}%"></div>
                        </div>
                        <span class="trigger-perf-value">${t.click_rate}%</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

// Initialize triggers when triggers tab is clicked
document.addEventListener('DOMContentLoaded', () => {
    setupTriggersEventListeners();
    
    document.querySelectorAll('.customize-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'triggers' && currentDetailSite) {
                loadTriggers();
                loadTriggerAnalytics();
            }
        });
    });
});


// ==================== Human Handoffs ====================

let handoffsState = {
    handoffs: [],
    currentHandoff: null,
    siteFilter: '',
    statusFilter: '',
    queueES: null,
    messageES: null,
    /** Periodic REST refresh while Handoffs is open (backup if SSE is blocked or flaky). */
    queuePollTimer: null,
    lastRenderedMessagesSig: '',
    /** First queue snapshot after opening Handoffs seeds baseline (no flash for items already in view). */
    queueBaselineInitialized: false,
    /** Previous render's handoff_id set — detects re-entries (e.g. visitor cancelled then re-requested). */
    previousQueueSnapshotIds: null,
    /** handoff_id -> last seen updated_at key — detects visitor re-post on same pending row. */
    lastHandoffUpdatedAt: new Map(),
    /** handoff_id -> last visitor_queue_signals from API (int) — reliable reconnect highlight. */
    lastHandoffVisitorSignal: new Map(),
    /** handoff_id -> epoch ms when highlight ends (survives SSE re-renders). */
    handoffHighlightExpiry: new Map(),
    /** Cached GET /api/auth/agents (admin). */
    agentCatalog: null,
};

const HANDOFF_HIGHLIGHT_MS = 3 * 60 * 1000; // 3 minutes — enough to notice and accept

function initHandoffsView() {
    const siteFilterEl = document.getElementById('handoff-site-filter');
    const statusFilterEl = document.getElementById('handoff-status-filter');
    if (siteFilterEl) handoffsState.siteFilter = siteFilterEl.value;
    if (statusFilterEl) handoffsState.statusFilter = statusFilterEl.value;

    handoffsState.queueBaselineInitialized = false;
    handoffsState.previousQueueSnapshotIds = null;
    handoffsState.lastHandoffUpdatedAt = new Map();
    handoffsState.lastHandoffVisitorSignal = new Map();
    handoffsState.handoffHighlightExpiry.clear();
    handoffsState.agentCatalog = null;
    setupHandoffsEventListeners();
    const agentQueueHint = document.getElementById('handoffs-agent-queue-hint');
    if (agentQueueHint) {
        agentQueueHint.classList.toggle('hidden', currentUser?.role !== 'agent');
    }
    startHandoffQueueStream();
    // REST snapshot so the queue shows even if SSE fails (401/CORS/adblock/reconnect issues).
    loadHandoffQueue();
    startHandoffQueuePoll();
}

function stopHandoffQueuePoll() {
    if (handoffsState.queuePollTimer != null) {
        clearInterval(handoffsState.queuePollTimer);
        handoffsState.queuePollTimer = null;
    }
}

function startHandoffQueuePoll() {
    stopHandoffQueuePoll();
    handoffsState.queuePollTimer = setInterval(() => {
        const view = document.getElementById('handoffs-view');
        if (view?.classList.contains('active')) loadHandoffQueue();
    }, 12000);
}

function handoffShouldHighlight(handoffId) {
    const exp = handoffsState.handoffHighlightExpiry.get(handoffId);
    return Boolean(exp && exp > Date.now());
}

function setHandoffPanelSessionActive(active) {
    const panel = document.getElementById('handoff-detail-panel');
    const layout = document.querySelector('#handoffs-view .handoffs-layout');
    if (panel) panel.classList.toggle('handoff-session-active', active);
    if (layout) layout.classList.toggle('handoff-session-active', active);
}

async function ensureHandoffAgentCatalog() {
    if (handoffsState.agentCatalog != null) return handoffsState.agentCatalog;
    if (typeof currentUser === 'undefined' || currentUser?.role !== 'admin') return [];
    try {
        const r = await fetch(`${API_BASE}/auth/agents`, { headers: getAuthHeaders() });
        if (!r.ok) return [];
        handoffsState.agentCatalog = await r.json();
        return handoffsState.agentCatalog;
    } catch (e) {
        console.error('Failed to load agents:', e);
        return [];
    }
}

async function populateHandoffAssignSelect(handoff) {
    const row = document.getElementById('handoff-assign-row');
    const sel = document.getElementById('handoff-assign-select');
    if (!row || !sel) return;
    if (typeof currentUser === 'undefined' || currentUser?.role !== 'admin') {
        row.classList.add('hidden');
        return;
    }
    if (handoff.status === 'resolved') {
        row.classList.add('hidden');
        return;
    }
    row.classList.remove('hidden');
    const agents = await ensureHandoffAgentCatalog();
    const siteId = handoff.site_id;
    const eligible = agents.filter(a => (a.assigned_site_ids || []).includes(siteId));
    const currentId = handoff.assigned_agent_id || '';
    const opts = [
        '<option value="">— Select agent —</option>',
        ...eligible.map(a => {
            const id = a.id;
            const selected = String(id) === String(currentId) ? ' selected' : '';
            return `<option value="${escapeHtml(String(id))}"${selected}>${escapeHtml(a.name || a.email)}</option>`;
        })
    ];
    if (eligible.length === 0) {
        opts.push('<option value="" disabled>No agents configured for this site</option>');
    }
    sel.innerHTML = opts.join('');
}

async function assignHandoffToAgent(agentId) {
    const hid = handoffsState.currentHandoff?.handoff_id;
    if (!hid || !agentId) return;
    try {
        const r = await fetch(`${API_BASE}/handoff/${hid}/assign`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ agent_id: agentId })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            if (r.status === 403) {
                alert('Only admins can assign agents.');
                return;
            }
            const d = data.detail;
            const msg = Array.isArray(d) ? d.map(x => x.msg || x).join(', ') : (d || 'Could not assign agent');
            alert(msg);
            return;
        }
        handoffsState.currentHandoff = data.handoff;
        renderHandoffDetail(data.handoff);
        loadHandoffQueue();
    } catch (e) {
        console.error('assignHandoffToAgent:', e);
        alert('Could not assign agent.');
    }
}

let handoffsListenersInitialized = false;

function setupHandoffsEventListeners() {
    if (handoffsListenersInitialized) return;
    handoffsListenersInitialized = true;

    const siteFilter = document.getElementById('handoff-site-filter');
    const statusFilter = document.getElementById('handoff-status-filter');
    const inputForm = document.getElementById('handoff-input-form');
    const claimBtn = document.getElementById('claim-handoff-btn');
    const resolveBtn = document.getElementById('resolve-handoff-btn');
    
    if (siteFilter) {
        siteFilter.addEventListener('change', () => {
            handoffsState.siteFilter = siteFilter.value;
            startHandoffQueueStream();
            loadHandoffQueue();
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            handoffsState.statusFilter = statusFilter.value;
            startHandoffQueueStream();
            loadHandoffQueue();
        });
    }
    
    if (inputForm) {
        inputForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await sendAgentMessage();
        });
    }

    // Textarea: Enter = send, Shift+Enter = newline, auto-resize
    const textarea = document.getElementById('handoff-input');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAgentMessage();
            }
        });
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        });
    }

    // AI summary toggle
    const summaryToggle = document.getElementById('hd-summary-toggle');
    if (summaryToggle) {
        summaryToggle.addEventListener('click', () => {
            const body = document.querySelector('.hd-summary-body');
            const chevron = summaryToggle.querySelector('.hd-chevron');
            if (body) body.classList.toggle('hidden');
            if (chevron) chevron.classList.toggle('open');
        });
    }

    if (claimBtn) {
        claimBtn.addEventListener('click', () => claimHandoff());
    }

    if (resolveBtn) {
        resolveBtn.addEventListener('click', () => resolveHandoff());
    }

    const assignSel = document.getElementById('handoff-assign-select');
    if (assignSel) {
        assignSel.addEventListener('change', async () => {
            const v = assignSel.value;
            if (!v || !handoffsState.currentHandoff) return;
            await assignHandoffToAgent(v);
        });
    }
}

async function loadHandoffQueue() {
    try {
        let url = `${API_BASE}/sites/${handoffsState.siteFilter || 'all'}/handoff/queue?`;
        if (handoffsState.siteFilter) {
            url = `${API_BASE}/sites/${handoffsState.siteFilter}/handoff/queue?`;
        } else {
            url = `${API_BASE}/sites/all/handoff/queue?`;
        }
        
        if (handoffsState.statusFilter) {
            url += `status=${handoffsState.statusFilter}&`;
        }
        url += 'limit=50';

        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                handoffsState.handoffs = [];
                renderHandoffQueue();
                return;
            }
            throw new Error('Failed to load handoffs');
        }
        
        const data = await response.json();
        handoffsState.handoffs = data.handoffs || [];
        
        document.getElementById('pending-count').textContent = data.pending_count || 0;
        document.getElementById('active-count').textContent = data.active_count || 0;
        
        const badge = document.getElementById('handoff-badge');
        if (badge) {
            const pendingCount = data.pending_count || 0;
            badge.textContent = pendingCount;
            badge.style.display = pendingCount > 0 ? '' : 'none';
        }
        
        renderHandoffQueue();
        
    } catch (error) {
        console.error('Failed to load handoff queue:', error);
    }
}

/** Queue order from the API; open conversation pinned to top for scanning. */
function handoffsDisplayOrder(handoffs) {
    const openId = handoffsState.currentHandoff?.handoff_id;
    if (!openId || !Array.isArray(handoffs) || handoffs.length < 2) {
        return handoffs;
    }
    const idx = handoffs.findIndex(h => h.handoff_id === openId);
    if (idx <= 0) return handoffs;
    const copy = [...handoffs];
    const [open] = copy.splice(idx, 1);
    return [open, ...copy];
}

function renderHandoffQueue() {
    const container = document.getElementById('handoffs-list');
    if (!container) return;
    
    if (handoffsState.handoffs.length === 0) {
        // Queue went empty: clear snapshots so the same handoff id is treated as a re-entry next time.
        handoffsState.previousQueueSnapshotIds = new Set();
        handoffsState.lastHandoffUpdatedAt = new Map();
        handoffsState.lastHandoffVisitorSignal = new Map();

        const agentNoSites =
            typeof currentUser !== 'undefined' &&
            currentUser?.role === 'agent' &&
            (!Array.isArray(sites) || sites.length === 0);
        const agentHint = agentNoSites
            ? `<span class="handoffs-empty-hint">You are not assigned to any sites yet. An admin must assign sites under <strong>Team</strong> before visitor handoffs can appear here.</span>`
            : '';
        container.innerHTML = `
            <div class="handoffs-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <p>No handoff requests</p>
                <span>Handoff requests from visitors will appear here</span>
                ${agentHint}
            </div>
        `;
        return;
    }

    const ids = handoffsState.handoffs.map(h => h.handoff_id);
    const now = Date.now();
    for (const [hid, exp] of handoffsState.handoffHighlightExpiry) {
        if (exp <= now) handoffsState.handoffHighlightExpiry.delete(hid);
    }

    const updatedAtKey = (h) => {
        const u = h.updated_at;
        if (u == null) return '';
        if (typeof u === 'string') return u;
        if (typeof u === 'number' && Number.isFinite(u)) return String(u);
        const s = String(u);
        const parsed = Date.parse(s);
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : s;
    };

    const visitorSignal = (h) => {
        const n = Number(h.visitor_queue_signals);
        return Number.isFinite(n) ? n : 0;
    };

    const bumpHighlight = (handoffId) => {
        handoffsState.handoffHighlightExpiry.set(handoffId, now + HANDOFF_HIGHLIGHT_MS);
    };

    if (!handoffsState.queueBaselineInitialized) {
        handoffsState.previousQueueSnapshotIds = new Set(ids);
        handoffsState.queueBaselineInitialized = true;
        handoffsState.handoffs.forEach((h) => {
            const id = h.handoff_id;
            handoffsState.lastHandoffUpdatedAt.set(id, updatedAtKey(h));
            handoffsState.lastHandoffVisitorSignal.set(id, visitorSignal(h));
        });
    } else {
        const prevSnap = handoffsState.previousQueueSnapshotIds || new Set();
        handoffsState.handoffs.forEach((h) => {
            const id = h.handoff_id;
            const sig = visitorSignal(h);
            if (!prevSnap.has(id)) {
                bumpHighlight(id);
            } else if (h.status === 'pending') {
                const prevSig = handoffsState.lastHandoffVisitorSignal.get(id);
                if (prevSig !== undefined && sig > prevSig) {
                    bumpHighlight(id);
                } else {
                    const prevU = handoffsState.lastHandoffUpdatedAt.get(id);
                    const u = updatedAtKey(h);
                    const prevMs = prevU ? Date.parse(prevU) : NaN;
                    const uMs = u ? Date.parse(u) : NaN;
                    if (
                        prevU != null && prevU !== '' && u !== '' &&
                        Number.isFinite(prevMs) && Number.isFinite(uMs) && uMs > prevMs
                    ) {
                        bumpHighlight(id);
                    }
                }
            }
            handoffsState.lastHandoffUpdatedAt.set(id, updatedAtKey(h));
            handoffsState.lastHandoffVisitorSignal.set(id, sig);
        });
        for (const k of handoffsState.lastHandoffUpdatedAt.keys()) {
            if (!ids.includes(k)) handoffsState.lastHandoffUpdatedAt.delete(k);
        }
        for (const k of handoffsState.lastHandoffVisitorSignal.keys()) {
            if (!ids.includes(k)) handoffsState.lastHandoffVisitorSignal.delete(k);
        }
        handoffsState.previousQueueSnapshotIds = new Set(ids);
    }

    const displayHandoffs = handoffsDisplayOrder(handoffsState.handoffs);

    container.innerHTML = displayHandoffs.map(h => {
        const isOpen = handoffsState.currentHandoff?.handoff_id === h.handoff_id;
        const highlight = handoffShouldHighlight(h.handoff_id) && !isOpen;
        const showAcceptHint = highlight && h.status === 'pending';
        const acceptIcon = `<svg class="handoff-item-accept-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
        const metaRow = h.status === 'pending'
            ? `<div class="handoff-item-meta handoff-item-meta--pending">
                <div class="handoff-item-meta-main">
                    <span class="handoff-item-time">${formatWaitTime(h.wait_time_seconds)}</span>
                    ${h.assigned_agent_name ? `<span class="handoff-item-agent">${escapeHtml(h.assigned_agent_name)}</span>` : ''}
                </div>
                <button type="button" class="handoff-item-accept-btn" data-handoff-id="${h.handoff_id}">
                    ${acceptIcon}
                    <span class="handoff-item-accept-label">Accept</span>
                </button>
            </div>`
            : `<div class="handoff-item-meta">
                <span class="handoff-item-time">${formatWaitTime(h.wait_time_seconds)}</span>
                ${h.assigned_agent_name ? `<span class="handoff-item-agent">${escapeHtml(h.assigned_agent_name)}</span>` : ''}
            </div>`;
        return `
        <div class="handoff-item ${h.status} ${isOpen ? 'selected' : ''} ${highlight ? 'handoff-item-new' : ''}"
             data-handoff-id="${h.handoff_id}"
             ${isOpen ? 'aria-current="true"' : ''}>
            <div class="handoff-item-header">
                <span class="handoff-item-visitor">${escapeHtml(h.visitor_name || h.visitor_email || 'Visitor')}</span>
                <div class="handoff-item-header-end">
                    ${isOpen ? '<span class="handoff-item-open-pill">Open</span>' : ''}
                    <span class="handoff-item-status ${h.status}">${h.status}</span>
                </div>
            </div>
            ${showAcceptHint ? `<div class="handoff-item-accept-hint" role="status">New request — waiting in queue.</div>` : ''}
            <div class="handoff-item-preview">${escapeHtml(h.last_message_preview || 'No messages yet')}</div>
            ${metaRow}
        </div>`;
    }).join('');
    
    container.querySelectorAll('.handoff-item').forEach(item => {
        item.addEventListener('click', () => {
            const handoffId = item.dataset.handoffId;
            selectHandoff(handoffId);
        });
    });

    container.querySelectorAll('.handoff-item-accept-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.handoffId;
            if (id) claimHandoffById(id, btn);
        });
    });
}

function formatWaitTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

async function selectHandoff(handoffId) {
    try {
        const response = await fetch(`${API_BASE}/handoff/${handoffId}/full`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load handoff');
        
        const handoff = await response.json();
        handoffsState.currentHandoff = handoff;
        handoffsState.lastRenderedMessagesSig = '';
        handoffsState.handoffHighlightExpiry.delete(handoffId);

        document.querySelectorAll('.handoff-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.handoffId === handoffId);
        });
        renderHandoffQueue();

        renderHandoffDetail(handoff);
        startMessageStream();
        
    } catch (error) {
        console.error('Failed to select handoff:', error);
    }
}

function renderHandoffDetail(handoff) {
    const emptyEl = document.querySelector('.handoff-detail-empty');
    const contentEl = document.getElementById('handoff-detail-content');

    if (emptyEl) emptyEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    setHandoffPanelSessionActive(true);

    // Visitor name + avatar initials
    const name = handoff.visitor_name || 'Visitor';
    document.getElementById('handoff-visitor-name').textContent = name;
    document.getElementById('handoff-visitor-email').textContent = handoff.visitor_email || '';
    const avatarEl = document.getElementById('hd-avatar');
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

    document.getElementById('handoff-wait-time').textContent =
        formatWaitTime(handoff.wait_time_seconds || 0);

    const siteNameEl = document.getElementById('handoff-site-name');
    if (siteNameEl) {
        const matchedSite = (typeof sites !== 'undefined' ? sites : []).find(s => s.site_id === handoff.site_id);
        siteNameEl.textContent = matchedSite ? (matchedSite.name || matchedSite.url) : (handoff.site_id || 'Site');
    }

    const statusBadge = document.getElementById('handoff-status-badge');
    statusBadge.textContent = handoff.status;
    statusBadge.className = `hd-badge ${handoff.status}`;

    const claimBtn = document.getElementById('claim-handoff-btn');
    const resolveBtn = document.getElementById('resolve-handoff-btn');
    const inputWrapper = document.getElementById('handoff-input-wrapper');

    if (handoff.status === 'pending') {
        claimBtn.classList.remove('hidden');
        resolveBtn.classList.add('hidden');
        inputWrapper.classList.add('hidden');
    } else if (handoff.status === 'active') {
        claimBtn.classList.add('hidden');
        resolveBtn.classList.remove('hidden');
        inputWrapper.classList.remove('hidden');
    } else {
        claimBtn.classList.add('hidden');
        resolveBtn.classList.add('hidden');
        inputWrapper.classList.add('hidden');
    }

    const summaryEl = document.getElementById('handoff-ai-summary');
    if (handoff.ai_summary) {
        summaryEl.classList.remove('hidden');
        const bodyEl = summaryEl.querySelector('.ai-summary-content');
        bodyEl.innerHTML = `<pre>${escapeHtml(handoff.ai_summary)}</pre>`;
    } else {
        summaryEl.classList.add('hidden');
    }

    renderHandoffMessages(handoff.messages || []);
    void populateHandoffAssignSelect(handoff);
}

function renderHandoffMessages(messages) {
    const container = document.getElementById('handoff-messages');
    if (!container) return;

    const currentHandoffId = handoffsState.currentHandoff?.handoff_id || '';
    const normalizedMessages = Array.isArray(messages) ? messages : [];
    const messageSig = `${currentHandoffId}:${normalizedMessages.length}:${normalizedMessages.map(m =>
        `${m.id || ''}:${m.timestamp || ''}:${m.role || ''}:${m.sender_name || ''}:${m.content || ''}`
    ).join('|')}`;
    if (handoffsState.lastRenderedMessagesSig === messageSig) return;
    handoffsState.lastRenderedMessagesSig = messageSig;

    if (normalizedMessages.length === 0) {
        container.innerHTML = `
            <div class="hd-messages-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                </svg>
                No messages yet
            </div>`;
        return;
    }

    let lastDate = null;
    const items = normalizedMessages.map(msg => {
        const ts = new Date(msg.timestamp);
        const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isAgent = msg.role === 'agent';
        const sender = escapeHtml(msg.sender_name || (isAgent ? 'Agent' : 'Visitor'));

        let separator = '';
        if (dateStr !== lastDate) {
            lastDate = dateStr;
            separator = `<div class="hd-date-separator">${dateStr}</div>`;
        }

        return `${separator}
        <div class="hd-msg ${isAgent ? 'agent' : 'visitor'}">
            <div class="hd-msg-meta">
                <span class="hd-msg-sender">${sender}</span>
                <span class="hd-msg-time">${timeStr}</span>
            </div>
            <div class="hd-msg-bubble">${escapeHtml(msg.content)}</div>
        </div>`;
    }).join('');

    container.innerHTML = items;
    container.scrollTop = container.scrollHeight;
}

async function claimHandoffById(handoffId, sourceBtn = null) {
    const labelEl = sourceBtn?.querySelector('.handoff-item-accept-label, .hd-btn-accept-label');
    const iconEl = sourceBtn?.querySelector('.handoff-item-accept-icon, .hd-btn-accept-icon');
    const prevLabel = labelEl ? labelEl.textContent : null;

    const setClaimBusy = (busy) => {
        document.querySelectorAll('.handoff-item-accept-btn').forEach(b => {
            b.disabled = busy;
            b.setAttribute('aria-busy', busy ? 'true' : 'false');
        });
        const detailBtn = document.getElementById('claim-handoff-btn');
        if (detailBtn) {
            detailBtn.disabled = busy;
            detailBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
        }
    };

    setClaimBusy(true);
    if (labelEl) labelEl.textContent = '…';
    if (iconEl) iconEl.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE}/handoff/${handoffId}/status`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: 'active' })
        });

        if (!response.ok) throw new Error('Failed to claim handoff');

        const data = await response.json();
        handoffsState.lastRenderedMessagesSig = '';
        handoffsState.currentHandoff = data.handoff;
        handoffsState.handoffHighlightExpiry.delete(handoffId);

        document.querySelectorAll('.handoff-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.handoffId === handoffId);
        });

        renderHandoffDetail(data.handoff);
        loadHandoffQueue();
        startMessageStream();
    } catch (error) {
        console.error('Failed to claim handoff:', error);
        alert('Failed to claim handoff. Please try again.');
    } finally {
        setClaimBusy(false);
        if (labelEl && prevLabel !== null && document.contains(labelEl)) {
            labelEl.textContent = prevLabel;
        }
        if (iconEl && document.contains(iconEl)) {
            iconEl.classList.remove('hidden');
        }
    }
}

async function claimHandoff() {
    if (!handoffsState.currentHandoff) return;
    await claimHandoffById(handoffsState.currentHandoff.handoff_id, document.getElementById('claim-handoff-btn'));
}

async function resolveHandoff() {
    if (!handoffsState.currentHandoff) return;
    
    if (!confirm('Are you sure you want to resolve this conversation?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/handoff/${handoffsState.currentHandoff.handoff_id}/status`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status: 'resolved' })
        });
        
        if (!response.ok) throw new Error('Failed to resolve handoff');
        
        stopMessageStream();
        handoffsState.currentHandoff = null;
        
        const emptyEl = document.querySelector('.handoff-detail-empty');
        const contentEl = document.getElementById('handoff-detail-content');
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (contentEl) contentEl.classList.add('hidden');
        setHandoffPanelSessionActive(false);
        
        loadHandoffQueue();
        
    } catch (error) {
        console.error('Failed to resolve handoff:', error);
        alert('Failed to resolve handoff. Please try again.');
    }
}

async function sendAgentMessage() {
    if (!handoffsState.currentHandoff) return;
    
    const input = document.getElementById('handoff-input');
    const content = input.value.trim();
    if (!content) return;

    input.value = '';
    input.style.height = 'auto';
    
    try {
        const response = await fetch(`${API_BASE}/handoff/${handoffsState.currentHandoff.handoff_id}/agent-message`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ content })
        });
        
        if (!response.ok) throw new Error('Failed to send message');
        
        const data = await response.json();
        
        if (!handoffsState.currentHandoff.messages) {
            handoffsState.currentHandoff.messages = [];
        }
        handoffsState.currentHandoff.messages.push(data.message);
        renderHandoffMessages(handoffsState.currentHandoff.messages);

        if (data.handoff_status && data.handoff_status !== handoffsState.currentHandoff.status) {
            handoffsState.currentHandoff.status = data.handoff_status;
            handoffsState.currentHandoff.assigned_agent_name = data.assigned_agent_name || handoffsState.currentHandoff.assigned_agent_name;
            renderHandoffDetail(handoffsState.currentHandoff);
        }

    } catch (error) {
        console.error('Failed to send message:', error);
        alert('Failed to send message. Please try again.');
    }
}

function startHandoffQueueStream() {
    stopHandoffQueueStream();
    const token = localStorage.getItem('token');
    if (!token) return;

    let url = `${API_BASE}/handoff/queue/stream?token=${encodeURIComponent(token)}`;
    if (handoffsState.siteFilter) url += `&site_id=${encodeURIComponent(handoffsState.siteFilter)}`;
    if (handoffsState.statusFilter) url += `&status=${encodeURIComponent(handoffsState.statusFilter)}`;

    const es = new EventSource(url);
    handoffsState.queueES = es;

    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            handoffsState.handoffs = data.handoffs || [];

            const pendingEl = document.getElementById('pending-count');
            const activeEl = document.getElementById('active-count');
            if (pendingEl) pendingEl.textContent = data.pending_count || 0;
            if (activeEl) activeEl.textContent = data.active_count || 0;

            const badge = document.getElementById('handoff-badge');
            if (badge) {
                const count = data.pending_count || 0;
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }

            renderHandoffQueue();
        } catch (err) {
            console.error('Queue SSE parse error:', err);
        }
    };

    es.addEventListener('error', (e) => {
        if (e.data) {
            try {
                const err = JSON.parse(e.data);
                console.error('Queue SSE error event:', err.error);
            } catch (_) {}
        }
        // Browser auto-reconnects on connection drops; nothing to do here.
    });
}

function stopHandoffQueueStream() {
    if (handoffsState.queueES) {
        handoffsState.queueES.close();
        handoffsState.queueES = null;
    }
}

function startMessageStream() {
    stopMessageStream();
    if (!handoffsState.currentHandoff) return;

    const url = `${API_BASE}/handoff/${handoffsState.currentHandoff.handoff_id}/stream`;
    const es = new EventSource(url);
    handoffsState.messageES = es;

    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            const incomingMessages = Array.isArray(data.messages) ? data.messages : [];
            const existingMessages = handoffsState.currentHandoff?.messages || [];
            const hasExisting = Array.isArray(existingMessages) && existingMessages.length > 0;
            const shouldSkipTransientEmpty = incomingMessages.length === 0 && hasExisting;

            // Ignore brief empty snapshots from SSE polling to avoid message flicker/reset.
            if (!shouldSkipTransientEmpty) {
                if (handoffsState.currentHandoff) {
                    handoffsState.currentHandoff.messages = incomingMessages;
                }
                renderHandoffMessages(incomingMessages);
            }

            if (data.status && data.status !== handoffsState.currentHandoff.status) {
                handoffsState.currentHandoff.status = data.status;
                handoffsState.currentHandoff.assigned_agent_name = data.agent_name || handoffsState.currentHandoff.assigned_agent_name;
                renderHandoffDetail(handoffsState.currentHandoff);
            }

            if (data.status === 'resolved') {
                stopMessageStream();
                renderHandoffDetail(handoffsState.currentHandoff);
            }
        } catch (err) {
            console.error('Message SSE parse error:', err);
        }
    };

    es.addEventListener('error', (e) => {
        if (e.data) {
            try {
                const err = JSON.parse(e.data);
                if (err.error === 'Handoff not found') stopMessageStream();
            } catch (_) {}
        }
    });
}

function stopMessageStream() {
    if (handoffsState.messageES) {
        handoffsState.messageES.close();
        handoffsState.messageES = null;
    }
}

async function populateHandoffSiteFilter() {
    const select = document.getElementById('handoff-site-filter');
    if (!select) return;
    
    select.innerHTML = '<option value="">All Sites</option>';
    
    sites.forEach(site => {
        const option = document.createElement('option');
        option.value = site.site_id;
        option.textContent = site.name || site.url;
        select.appendChild(option);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupHandoffSettingsListeners();
});

// ==================== Handoff Settings Panel ====================

function setupHandoffSettingsListeners() {
    const confidenceSlider = document.getElementById('confidence-threshold');
    const confidenceValue = document.getElementById('confidence-threshold-value');
    
    if (confidenceSlider && confidenceValue) {
        confidenceSlider.addEventListener('input', () => {
            confidenceValue.textContent = `${confidenceSlider.value}%`;
        });
    }
    
    const businessHoursToggle = document.getElementById('business-hours-enabled');
    const businessHoursConfig = document.getElementById('business-hours-config');
    
    if (businessHoursToggle && businessHoursConfig) {
        businessHoursToggle.addEventListener('change', () => {
            businessHoursConfig.classList.toggle('hidden', !businessHoursToggle.checked);
        });
    }
    
    const scheduleRows = document.querySelectorAll('#business-hours-schedule .schedule-row');
    scheduleRows.forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const startInput = row.querySelector('.schedule-start');
        const endInput = row.querySelector('.schedule-end');
        
        if (checkbox && startInput && endInput) {
            checkbox.addEventListener('change', () => {
                startInput.disabled = !checkbox.checked;
                endInput.disabled = !checkbox.checked;
            });
        }
    });
    
    const saveBtn = document.getElementById('save-handoff-config');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveHandoffConfig);
    }
    
    document.querySelectorAll('.customize-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'handoff' && currentDetailSite) {
                loadHandoffConfig();
            }
        });
    });
}

async function loadHandoffConfig() {
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/handoff/config`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const config = await response.json();
        
        const enabledEl = document.getElementById('handoff-enabled');
        const thresholdEl = document.getElementById('confidence-threshold');
        const thresholdValue = document.getElementById('confidence-threshold-value');
        const businessHoursEnabled = document.getElementById('business-hours-enabled');
        const businessHoursConfig = document.getElementById('business-hours-config');
        const timezoneEl = document.getElementById('business-timezone');
        const offlineMessageEl = document.getElementById('offline-message');
        
        if (enabledEl) enabledEl.checked = config.enabled !== false;
        
        if (thresholdEl && thresholdValue) {
            const threshold = Math.round((config.confidence_threshold || 0.3) * 100);
            thresholdEl.value = threshold;
            thresholdValue.textContent = `${threshold}%`;
        }
        
        const bh = config.business_hours || {};
        if (businessHoursEnabled) {
            businessHoursEnabled.checked = bh.enabled === true;
            businessHoursConfig.classList.toggle('hidden', !bh.enabled);
        }
        
        if (timezoneEl && bh.timezone) {
            timezoneEl.value = bh.timezone;
        }
        
        if (offlineMessageEl && bh.offline_message) {
            offlineMessageEl.value = bh.offline_message;
        }
        
        const schedule = bh.schedule || {};
        Object.keys(schedule).forEach(day => {
            const dayData = schedule[day];
            const checkbox = document.querySelector(`#business-hours-schedule input[data-day="${day}"]`);
            const startInput = document.querySelector(`#business-hours-schedule .schedule-start[data-day="${day}"]`);
            const endInput = document.querySelector(`#business-hours-schedule .schedule-end[data-day="${day}"]`);
            
            if (checkbox) {
                checkbox.checked = dayData.enabled !== false;
            }
            if (startInput) {
                startInput.value = dayData.start || '09:00';
                startInput.disabled = !checkbox?.checked;
            }
            if (endInput) {
                endInput.value = dayData.end || '17:00';
                endInput.disabled = !checkbox?.checked;
            }
        });
        
    } catch (error) {
        console.error('Failed to load handoff config:', error);
    }
}

async function saveHandoffConfig() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('save-handoff-config');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const enabled = document.getElementById('handoff-enabled')?.checked !== false;
        const threshold = (document.getElementById('confidence-threshold')?.value || 30) / 100;
        const businessHoursEnabled = document.getElementById('business-hours-enabled')?.checked || false;
        const timezone = document.getElementById('business-timezone')?.value || 'UTC';
        const offlineMessage = document.getElementById('offline-message')?.value || '';
        
        const schedule = {};
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        days.forEach(day => {
            const checkbox = document.querySelector(`#business-hours-schedule input[data-day="${day}"]`);
            const startInput = document.querySelector(`#business-hours-schedule .schedule-start[data-day="${day}"]`);
            const endInput = document.querySelector(`#business-hours-schedule .schedule-end[data-day="${day}"]`);
            
            schedule[day] = {
                enabled: checkbox?.checked || false,
                start: startInput?.value || '09:00',
                end: endInput?.value || '17:00'
            };
        });
        
        const config = {
            enabled,
            confidence_threshold: threshold,
            business_hours: {
                enabled: businessHoursEnabled,
                timezone,
                schedule,
                offline_message: offlineMessage
            }
        };
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/handoff/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (!response.ok) throw new Error('Failed to save config');
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save handoff config:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

// ==================== Security Settings ====================

let securityAllowedDomains = [];

function initSecuritySettings() {
    const addDomainBtn = document.getElementById('security-add-domain');
    const domainInput = document.getElementById('security-new-domain');
    const saveBtn = document.getElementById('save-security-config');
    const copyBtn = document.getElementById('copy-secure-embed');
    const rateLimitSlider = document.getElementById('security-rate-limit');
    const rateLimitValue = document.getElementById('security-rate-limit-value');
    
    if (addDomainBtn && domainInput) {
        addDomainBtn.addEventListener('click', () => addDomain());
        domainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addDomain();
            }
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSecurityConfig);
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', copySecureEmbedCode);
    }
    
    if (rateLimitSlider && rateLimitValue) {
        rateLimitSlider.addEventListener('input', () => {
            rateLimitValue.textContent = rateLimitSlider.value;
        });
    }
    
    document.querySelectorAll('.customize-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'security' && currentDetailSite) {
                loadSecurityConfig();
            }
        });
    });
}

function addDomain() {
    const input = document.getElementById('security-new-domain');
    const domain = input.value.trim().toLowerCase();
    
    if (!domain) return;
    
    const domainPattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    const localhostPattern = /^localhost(:\d+)?$/;
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/;
    
    if (!domainPattern.test(domain) && !localhostPattern.test(domain) && !ipPattern.test(domain)) {
        alert('Please enter a valid domain (e.g., example.com or *.example.com)');
        return;
    }
    
    if (securityAllowedDomains.includes(domain)) {
        alert('Domain already added');
        return;
    }
    
    securityAllowedDomains.push(domain);
    input.value = '';
    renderDomainList();
}

function removeDomain(domain) {
    securityAllowedDomains = securityAllowedDomains.filter(d => d !== domain);
    renderDomainList();
}

function renderDomainList() {
    const container = document.getElementById('security-domain-list');
    if (!container) return;
    
    container.innerHTML = securityAllowedDomains.map(domain => `
        <span class="domain-tag">
            ${escapeHtml(domain)}
            <button type="button" class="remove-domain" onclick="removeDomain('${domain}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </span>
    `).join('');
}

async function loadSecurityConfig() {
    if (!currentDetailSite) return;
    
    // Initialize handlers for dynamically generated content
    initSecurityTabHandlers();
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const site = await response.json();
        const security = site.config?.security || {};
        
        const enforceEl = document.getElementById('security-enforce-domain');
        const referrerEl = document.getElementById('security-require-referrer');
        const rateLimitEl = document.getElementById('security-rate-limit');
        const rateLimitValue = document.getElementById('security-rate-limit-value');
        
        if (enforceEl) enforceEl.checked = security.enforce_domain_validation === true;
        if (referrerEl) referrerEl.checked = security.require_referrer === true;
        if (rateLimitEl) {
            rateLimitEl.value = security.rate_limit_per_session || 60;
            if (rateLimitValue) rateLimitValue.textContent = rateLimitEl.value;
        }
        
        securityAllowedDomains = security.allowed_domains || [];
        renderDomainList();
        
    } catch (error) {
        console.error('Failed to load security config:', error);
    }
    
    // Always load embed code (doesn't require auth)
    loadSecureEmbedCode();
}

function initSecurityTabHandlers() {
    const addDomainBtn = document.getElementById('security-add-domain');
    const domainInput = document.getElementById('security-new-domain');
    const saveBtn = document.getElementById('save-security-config');
    const copyBtn = document.getElementById('copy-secure-embed');
    const rateLimitSlider = document.getElementById('security-rate-limit');
    const rateLimitValue = document.getElementById('security-rate-limit-value');
    
    if (addDomainBtn && domainInput) {
        addDomainBtn.onclick = () => addDomain();
        domainInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addDomain();
            }
        };
    }
    
    if (saveBtn) {
        saveBtn.onclick = saveSecurityConfig;
    }
    
    if (copyBtn) {
        copyBtn.onclick = copySecureEmbedCode;
    }
    
    if (rateLimitSlider && rateLimitValue) {
        rateLimitSlider.oninput = () => {
            rateLimitValue.textContent = rateLimitSlider.value;
        };
    }
}

async function loadSecureEmbedCode() {
    if (!currentDetailSite) return;
    
    const embedCodeEl = document.getElementById('security-embed-code');
    const sriHashEl = document.getElementById('security-sri-hash');
    
    // Attach copy button handler for embed tab
    const copyBtn = document.getElementById('copy-detail-embed');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyDetailEmbed);
    }
    
    try {
        const response = await fetch(`${API_BASE}/embed/security/${currentDetailSite.site_id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load security info');
        
        const info = await response.json();
        
        if (sriHashEl) {
            sriHashEl.textContent = info.sri_hash || 'Not available';
        }
        
        if (embedCodeEl) {
            const embedCode = `<script>
(function() {
    var s = document.createElement('script');
    s.src = '${info.widget_url || `${API_BASE.replace('/api', '')}/widget/chatbot.js`}';
    s.async = true;${info.sri_hash ? `
    s.integrity = '${info.sri_hash}';
    s.crossOrigin = 'anonymous';` : ''}
    s.dataset.siteId = '${currentDetailSite.site_id}';
    s.dataset.apiUrl = '${API_BASE.replace('/api', '')}';
    document.head.appendChild(s);
})();
<\/script>`;
            embedCodeEl.textContent = embedCode;
        }
        
    } catch (error) {
        console.error('Failed to load secure embed code:', error);
        if (embedCodeEl) embedCodeEl.textContent = 'Failed to load embed code';
        if (sriHashEl) sriHashEl.textContent = 'Not available';
    }
}

async function copySecureEmbedCode() {
    const embedCodeEl = document.getElementById('security-embed-code');
    const copyBtn = document.getElementById('copy-secure-embed');
    
    if (!embedCodeEl) return;
    
    try {
        await navigator.clipboard.writeText(embedCodeEl.textContent);
        
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

async function saveSecurityConfig() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('save-security-config');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const securityConfig = {
            enforce_domain_validation: document.getElementById('security-enforce-domain')?.checked || false,
            allowed_domains: securityAllowedDomains,
            require_referrer: document.getElementById('security-require-referrer')?.checked || false,
            rate_limit_per_session: parseInt(document.getElementById('security-rate-limit')?.value || 60)
        };
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ security: securityConfig })
        });
        
        if (!response.ok) throw new Error('Failed to save config');
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save security config:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initSecuritySettings();
});

// ==================== White-label Settings ====================

let whiteLabelConfig = null;

async function loadWhiteLabelConfig() {
    try {
        const response = await fetch(`${API_BASE}/platform/whitelabel`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load white-label config');
        
        whiteLabelConfig = await response.json();
        populateWhiteLabelForm(whiteLabelConfig);
        applyWhiteLabelBranding(whiteLabelConfig);
        
    } catch (error) {
        console.error('Failed to load white-label config:', error);
    }
}

function populateWhiteLabelForm(config) {
    const fields = {
        'wl-app-name': config.app_name || 'SiteChat',
        'wl-primary-color': config.primary_color || '#0D9488',
        'wl-primary-color-text': config.primary_color || '#0D9488',
        'wl-logo-url': config.logo_url || '',
    };

    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
}

function applyWhiteLabelBranding(config) {
    if (!config) return;
    
    if (config.app_name && config.app_name !== 'SiteChat') {
        document.title = config.app_name;
        const brandName = document.querySelector('.brand-name');
        if (brandName) brandName.textContent = config.app_name;
    }
    
    if (config.primary_color) {
        document.documentElement.style.setProperty('--primary', config.primary_color);
    }
    
    if (config.logo_url) {
        const brandIcon = document.querySelector('.brand-icon');
        if (brandIcon) {
            brandIcon.innerHTML = `<img src="${config.logo_url}" alt="Logo" style="width: 24px; height: 24px; object-fit: contain;">`;
        }
    }
    
    if (config.favicon_url) {
        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            document.head.appendChild(favicon);
        }
        favicon.href = config.favicon_url;
    }
}

async function saveWhiteLabelConfig() {
    const btn = document.getElementById('wl-save-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const config = {
            app_name: document.getElementById('wl-app-name')?.value || 'SiteChat',
            primary_color: document.getElementById('wl-primary-color')?.value || '#0D9488',
            logo_url: document.getElementById('wl-logo-url')?.value || null,
        };
        
        const response = await fetch(`${API_BASE}/platform/whitelabel`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (!response.ok) throw new Error('Failed to save config');
        
        whiteLabelConfig = await response.json();
        applyWhiteLabelBranding(whiteLabelConfig);
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save white-label config:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

async function resetWhiteLabelConfig() {
    if (!confirm('Reset all white-label settings to defaults?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/platform/whitelabel/reset`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to reset config');
        
        whiteLabelConfig = await response.json();
        populateWhiteLabelForm(whiteLabelConfig);
        applyWhiteLabelBranding(whiteLabelConfig);
        
        alert('Settings reset to defaults.');
        
    } catch (error) {
        console.error('Failed to reset white-label config:', error);
        alert('Failed to reset settings. Please try again.');
    }
}

function setupWhiteLabelListeners() {
    const form = document.getElementById('whitelabel-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveWhiteLabelConfig();
        });
    }
    
    const resetBtn = document.getElementById('wl-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetWhiteLabelConfig);
    }
    
    const colorInput = document.getElementById('wl-primary-color');
    const colorText = document.getElementById('wl-primary-color-text');
    
    if (colorInput && colorText) {
        colorInput.addEventListener('input', () => {
            colorText.value = colorInput.value;
        });
        
        colorText.addEventListener('input', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(colorText.value)) {
                colorInput.value = colorText.value;
            }
        });
    }
}

function initWhiteLabelSettings() {
    setupWhiteLabelListeners();
    loadWhiteLabelConfig();
}

// ==================== Settings Panels ====================

let settingsPanelsInit = false;
function initSettingsPanels() {
    if (settingsPanelsInit) return;
    settingsPanelsInit = true;
    document.querySelectorAll('.settings-nav-item[data-panel]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`settings-panel-${item.dataset.panel}`);
            if (panel) panel.classList.add('active');
        });
    });
}

// ==================== Profile Settings ====================

let profileListenerBound = false;
function initProfileSettings() {
    const form = document.getElementById('profile-form');
    if (!form || profileListenerBound) {
        // Still re-fill current values in case user data changed
        const nameEl = document.getElementById('profile-name');
        const emailEl = document.getElementById('profile-email');
        if (nameEl && currentUser?.name) nameEl.value = currentUser.name;
        if (emailEl && currentUser?.email) emailEl.value = currentUser.email;
        return;
    }
    profileListenerBound = true;

    // Pre-fill name and email from currentUser
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    if (nameEl && currentUser?.name) nameEl.value = currentUser.name;
    if (emailEl && currentUser?.email) emailEl.value = currentUser.email;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('profile-error');
        const okEl = document.getElementById('profile-success');
        const saveBtn = document.getElementById('profile-save-btn');
        errEl.style.display = 'none';
        okEl.style.display = 'none';

        const name = nameEl?.value?.trim();
        const currentPw = document.getElementById('profile-current-password')?.value;
        const newPw = document.getElementById('profile-new-password')?.value;

        const body = {};
        if (name && name !== currentUser?.name) body.name = name;
        if (newPw) {
            if (!currentUser?.must_change_password) {
                body.current_password = currentPw;
            }
            body.new_password = newPw;
        }

        if (!Object.keys(body).length) {
            errEl.textContent = 'No changes to save.';
            errEl.style.display = '';
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.detail || 'Failed to save changes.';
                errEl.style.display = '';
                return;
            }
            // Update currentUser in memory and sidebar display
            currentUser = { ...currentUser, ...data };
            if (data.name) {
                document.getElementById('user-name').textContent = data.name;
                document.getElementById('user-avatar').textContent = avatarInitials(data.name);
            }
            // Clear password fields
            document.getElementById('profile-current-password').value = '';
            document.getElementById('profile-new-password').value = '';
            okEl.style.display = '';
            setTimeout(() => { okEl.style.display = 'none'; }, 3000);
        } catch {
            errEl.textContent = 'Network error. Please try again.';
            errEl.style.display = '';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save changes';
        }
    });
}

// ==================== Team Management ====================

let teamListenersBound = false;
let activeTeamTab = 'agents'; // default; admins start on 'owners'

function initTeamView() {
    if (currentUser?.role === 'agent') return;

    // Decide default tab
    if (!teamListenersBound) {
        activeTeamTab = currentUser?.role === 'admin' ? 'owners' : 'agents';
    }

    if (!teamListenersBound) {
        teamListenersBound = true;

        // Tab switching
        document.querySelectorAll('.team-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeTeamTab = tab.dataset.teamTab;
                document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.team-panel').forEach(p => p.classList.add('hidden'));
                document.getElementById(`team-panel-${activeTeamTab}`)?.classList.remove('hidden');
                updateTeamHeader();
                loadActiveTab();
            });
        });

        // Modal controls
        document.getElementById('member-modal-close')?.addEventListener('click', closeMemberModal);
        document.getElementById('member-modal-cancel')?.addEventListener('click', closeMemberModal);
        document.getElementById('member-modal-save')?.addEventListener('click', submitMemberForm);
        document.getElementById('member-modal')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeMemberModal();
        });

        // Select-all toggle for site checkboxes
        document.getElementById('sites-select-all-btn')?.addEventListener('click', () => {
            const boxes = document.querySelectorAll('#member-sites-checkboxes input[name="member-site"]');
            const allChecked = Array.from(boxes).every(b => b.checked);
            boxes.forEach(b => { b.checked = !allChecked; });
            updateSelectAllLabel();
        });
    }

    // Activate correct tab
    document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.team-panel').forEach(p => p.classList.add('hidden'));
    const activeTabEl = document.getElementById(`team-tab-${activeTeamTab}`);
    if (activeTabEl) activeTabEl.classList.add('active');
    document.getElementById(`team-panel-${activeTeamTab}`)?.classList.remove('hidden');

    updateTeamHeader();
    loadActiveTab();
}

function updateTeamHeader() {
    const actions = document.getElementById('team-header-actions');
    const subtitle = document.getElementById('team-subtitle');
    if (!actions) return;
    if (activeTeamTab === 'owners') {
        subtitle.textContent = 'Site owners can create and manage their own sites and support agents.';
        actions.innerHTML = `<button type="button" class="btn btn-primary" id="team-add-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add site owner
        </button>`;
    } else {
        subtitle.textContent = 'Support agents handle live chat handoffs. Each agent only sees the sites you assign.';
        actions.innerHTML = `<button type="button" class="btn btn-primary" id="team-add-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add agent
        </button>`;
    }
    document.getElementById('team-add-btn')?.addEventListener('click', () => openMemberModal(activeTeamTab, null));
}

function loadActiveTab() {
    if (activeTeamTab === 'owners') loadTeamOwners();
    else loadTeamAgents();
}

// ----- Avatar helpers -----
const AVATAR_COLORS = ['#0d9488','#3b82f6','#8b5cf6','#f97316','#10b981','#f59e0b','#ef4444','#06b6d4'];
function avatarColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function avatarInitials(name) {
    const parts = (name || '?').trim().split(/\s+/);
    return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
}

// ----- Site Owners (admin only) -----
async function loadTeamOwners() {
    const list = document.getElementById('owners-list');
    const countEl = document.getElementById('owners-count');
    if (!list) return;
    list.innerHTML = `<div class="members-loading"><svg class="spinner" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.2"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg> Loading…</div>`;
    try {
        const res = await fetch(`${API_BASE}/auth/users`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error();
        const all = await res.json();
        const owners = all.filter(u => u.role !== 'agent');
        if (countEl) countEl.textContent = owners.length;

        // Stats bar
        const statsEl = document.getElementById('owners-stats');
        if (statsEl && owners.length) {
            const adminCount = owners.filter(u => u.role === 'admin').length;
            const userCount = owners.filter(u => u.role === 'user').length;
            statsEl.style.display = '';
            statsEl.innerHTML = `
                <span class="team-panel-stat"><span class="team-panel-stat-num">${owners.length}</span> total</span>
                <span class="team-panel-stat-sep"></span>
                <span class="team-panel-stat"><span class="team-panel-stat-num">${adminCount}</span> admin${adminCount !== 1 ? 's' : ''}</span>
                <span class="team-panel-stat-sep"></span>
                <span class="team-panel-stat"><span class="team-panel-stat-num">${userCount}</span> site owner${userCount !== 1 ? 's' : ''}</span>`;
        } else if (statsEl) {
            statsEl.style.display = 'none';
        }

        if (!owners.length) {
            list.innerHTML = `<div class="members-empty">
                <div class="members-empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
                <p>No site owners yet.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="openMemberModal('owners',null)">Add first site owner</button>
            </div>`;
            return;
        }
        const roleLabels = { admin: 'Admin', user: 'Site Owner' };
        const rolePillClass = { admin: 'role-admin', user: 'role-user' };
        list.innerHTML = owners.map(u => {
            const initials = avatarInitials(u.name);
            const color = avatarColor(u.email);
            const joined = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const canDelete = u.id !== currentUser.id && u.role !== 'admin';
            const canEditOwner = u.role === 'user';
            return `<div class="member-row" data-member-id="${escapeHtml(u.id)}" data-member-type="owner">
                <div class="member-identity">
                    <div class="member-avatar" style="background:${color}">${escapeHtml(initials)}</div>
                    <div class="member-details">
                        <span class="member-name">${escapeHtml(u.name)}</span>
                        <span class="member-email">${escapeHtml(u.email)}</span>
                    </div>
                </div>
                <div><span class="role-badge ${rolePillClass[u.role] || ''}">${escapeHtml(roleLabels[u.role] || u.role)}</span></div>
                <div class="member-date">${joined}</div>
                <div class="member-actions">
                    ${canEditOwner ? `<button type="button" class="btn btn-ghost btn-sm edit-owner-btn" title="Edit site owner">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>` : ''}
                    ${canDelete ? `<button class="btn btn-ghost btn-sm delete-member-btn" title="Delete user">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>` : ''}
                </div>
            </div>`;
        }).join('');
        list.querySelectorAll('.edit-owner-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('[data-member-id]');
                const id = row?.dataset.memberId;
                const owner = owners.find(o => o.id === id);
                if (owner) openMemberModal('owners', owner);
            });
        });
        list.querySelectorAll('.delete-member-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('[data-member-id]');
                const id = row?.dataset.memberId;
                if (!id || !confirm('Delete this user? Their sites and agents will be transferred to you.')) return;
                btn.disabled = true;
                const del = await fetch(`${API_BASE}/auth/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
                if (!del.ok) { alert('Could not delete user'); btn.disabled = false; return; }
                loadTeamOwners();
            });
        });
    } catch {
        list.innerHTML = `<div class="members-empty"><p>Could not load users.</p></div>`;
    }
}

// ----- Support Agents -----
async function loadTeamAgents() {
    const list = document.getElementById('agents-list');
    const countEl = document.getElementById('agents-count');
    if (!list) return;
    list.innerHTML = `<div class="members-loading"><svg class="spinner" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.2"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg> Loading…</div>`;
    try {
        const res = await fetch(`${API_BASE}/auth/agents`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error();
        const agents = await res.json();
        if (countEl) countEl.textContent = agents.length;

        // Stats bar
        const statsEl = document.getElementById('agents-stats');
        if (statsEl && agents.length) {
            const allSiteIds = new Set(agents.flatMap(a => a.assigned_site_ids || []));
            statsEl.style.display = '';
            statsEl.innerHTML = `
                <span class="team-panel-stat"><span class="team-panel-stat-num">${agents.length}</span> agent${agents.length !== 1 ? 's' : ''}</span>
                <span class="team-panel-stat-sep"></span>
                <span class="team-panel-stat"><span class="team-panel-stat-num">${allSiteIds.size}</span> site${allSiteIds.size !== 1 ? 's' : ''} covered</span>`;
        } else if (statsEl) {
            statsEl.style.display = 'none';
        }

        if (!agents.length) {
            list.innerHTML = `<div class="members-empty">
                <div class="members-empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></div>
                <p>No support agents yet.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="openMemberModal('agents',null)">Add first agent</button>
            </div>`;
            return;
        }
        // Build site name lookup
        const siteMap = Object.fromEntries((sites || []).map(s => [s.site_id, s.name || s.url || s.site_id]));
        list.innerHTML = agents.map(a => {
            const initials = avatarInitials(a.name);
            const color = avatarColor(a.email);
            const joined = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const siteIds = a.assigned_site_ids || [];
            const siteBadges = siteIds.length
                ? siteIds.map(id => `<span class="member-site-badge" title="${escapeHtml(siteMap[id] || id)}">${escapeHtml(siteMap[id] || id)}</span>`).join('')
                : '<span class="member-no-sites">No sites assigned</span>';
            return `<div class="member-row member-row--agents" data-member-id="${escapeHtml(a.id)}" data-member-type="agent">
                <div class="member-identity">
                    <div class="member-avatar" style="background:${color}">${escapeHtml(initials)}</div>
                    <div class="member-details">
                        <span class="member-name">${escapeHtml(a.name)}</span>
                        <span class="member-email">${escapeHtml(a.email)}</span>
                    </div>
                </div>
                <div class="member-sites-badges">${siteBadges}</div>
                <div class="member-date">${joined}</div>
                <div class="member-actions">
                    <button class="btn btn-ghost btn-sm edit-member-btn" title="Edit agent">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn btn-ghost btn-sm delete-member-btn" title="Remove agent">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </div>`;
        }).join('');
        list.querySelectorAll('.edit-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('[data-member-id]');
                const id = row?.dataset.memberId;
                const agent = agents.find(a => a.id === id);
                if (agent) openMemberModal('agents', agent);
            });
        });
        list.querySelectorAll('.delete-member-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('[data-member-id]');
                const id = row?.dataset.memberId;
                if (!id || !confirm('Remove this agent? They will no longer be able to log in.')) return;
                btn.disabled = true;
                const del = await fetch(`${API_BASE}/auth/agents/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
                if (!del.ok) { alert('Could not remove agent'); btn.disabled = false; return; }
                loadTeamAgents();
            });
        });
    } catch {
        list.innerHTML = `<div class="members-empty"><p>Could not load agents.</p></div>`;
    }
}

// ----- Add / Edit Modal -----
function openMemberModal(type, member) {
    const modal = document.getElementById('member-modal');
    const badge = document.getElementById('member-modal-badge');
    const title = document.getElementById('member-modal-title');
    const sitesGroup = document.getElementById('member-sites-group');
    const emailEl = document.getElementById('member-email');
    const pwd = document.getElementById('member-password');
    const pwdHint = document.getElementById('member-password-hint');

    document.getElementById('member-edit-id').value = member?.id || '';
    document.getElementById('member-type').value = type;
    document.getElementById('member-name').value = member?.name || '';

    if (type === 'owners') {
        badge.textContent = 'Site Owner';
        badge.style.color = 'var(--blue)';
        title.textContent = member ? 'Edit site owner' : 'Add site owner';
        sitesGroup.style.display = 'none';
    } else {
        badge.textContent = 'Support Agent';
        badge.style.color = 'var(--primary)';
        title.textContent = member ? 'Edit support agent' : 'Add support agent';
        sitesGroup.style.display = '';
        renderMemberSiteCheckboxes(member?.assigned_site_ids || []);
    }

    if (member) {
        emailEl.value = member.email || '';
        emailEl.disabled = true;
        pwd.required = false;
        pwd.value = '';
        pwdHint.textContent = 'Leave blank to keep the current password.';
    } else {
        emailEl.value = '';
        emailEl.disabled = false;
        pwd.required = true;
        pwd.value = '';
        pwdHint.textContent = 'Min. 8 characters.';
    }

    const errEl = document.getElementById('member-modal-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    modal?.classList.add('active');
    document.getElementById('member-name').focus();
}

function closeMemberModal() {
    document.getElementById('member-modal')?.classList.remove('active');
}

function updateSelectAllLabel() {
    const btn = document.getElementById('sites-select-all-btn');
    if (!btn) return;
    const boxes = document.querySelectorAll('#member-sites-checkboxes input[name="member-site"]');
    if (!boxes.length) return;
    const allChecked = Array.from(boxes).every(b => b.checked);
    btn.textContent = allChecked ? 'Deselect all' : 'Select all';
}

function renderMemberSiteCheckboxes(selectedIds) {
    const wrap = document.getElementById('member-sites-checkboxes');
    if (!wrap) return;
    const selected = new Set(selectedIds || []);
    if (!sites.length) {
        wrap.innerHTML = '<p class="form-hint">Add at least one site first.</p>';
        document.getElementById('sites-select-all-btn')?.style && (document.getElementById('sites-select-all-btn').style.display = 'none');
        return;
    }
    const selectAllBtn = document.getElementById('sites-select-all-btn');
    if (selectAllBtn) selectAllBtn.style.display = '';
    wrap.innerHTML = sites.map(s => {
        const checked = selected.has(s.site_id) ? 'checked' : '';
        return `<label class="agent-site-row">
            <input type="checkbox" name="member-site" value="${escapeHtml(s.site_id)}" ${checked}>
            <span>${escapeHtml(s.name || s.url || s.site_id)}</span>
        </label>`;
    }).join('');
    wrap.querySelectorAll('input[name="member-site"]').forEach(cb => {
        cb.addEventListener('change', updateSelectAllLabel);
    });
    updateSelectAllLabel();
}

function formatMemberApiError(data) {
    if (!data) return 'Save failed. Please try again.';
    const d = data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
        return d.map(i => {
            if (typeof i === 'object') return i.msg?.replace(/^Value error, /i, '') || '';
            return String(i);
        }).filter(Boolean).join(' ');
    }
    return data.message || 'Save failed. Please try again.';
}

async function submitMemberForm() {
    const editId = document.getElementById('member-edit-id').value;
    const type = document.getElementById('member-type').value;
    const name = document.getElementById('member-name').value.trim();
    const email = document.getElementById('member-email').value.trim();
    const password = document.getElementById('member-password').value;

    const showModalErr = (msg) => {
        const el = document.getElementById('member-modal-error');
        if (el) { el.textContent = msg; el.style.display = ''; }
    };

    if (!name || (!editId && !email)) { showModalErr('Please fill in all required fields.'); return; }
    if (!editId && !password) { showModalErr('Password is required.'); return; }

    const saveBtn = document.getElementById('member-modal-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
        if (type === 'owners') {
            if (editId) {
                const body = { name };
                if (password) body.password = password;
                const res = await fetch(`${API_BASE}/auth/users/${editId}`, {
                    method: 'PATCH',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error(formatMemberApiError(await res.json().catch(() => ({}))));
            } else {
                const res = await fetch(`${API_BASE}/auth/users`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ name, email, password })
                });
                if (!res.ok) throw new Error(formatMemberApiError(await res.json().catch(() => ({}))));
            }
        } else {
            const boxes = document.querySelectorAll('#member-sites-checkboxes input[name="member-site"]:checked');
            const assigned_site_ids = Array.from(boxes).map(b => b.value);
            if (editId) {
                const body = { name, assigned_site_ids };
                if (password) body.password = password;
                const res = await fetch(`${API_BASE}/auth/agents/${editId}`, {
                    method: 'PATCH',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error(formatMemberApiError(await res.json().catch(() => ({}))));
            } else {
                const res = await fetch(`${API_BASE}/auth/agents`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ name, email, password, assigned_site_ids })
                });
                if (!res.ok) throw new Error(formatMemberApiError(await res.json().catch(() => ({}))));
            }
        }
        closeMemberModal();
        loadActiveTab();
    } catch (err) {
        const msg = err.message || 'Save failed. Please try again.';
        const errEl = document.getElementById('member-modal-error');
        if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
        else alert(msg);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
}

// ==================== Scheduled Crawling ====================

let crawlScheduleConfig = null;
let crawlStatusPollInterval = null;

async function loadCrawlSchedule(siteId) {
    if (!siteId) return;
    
    // Initialize handlers for dynamically generated content
    initCrawlingTabHandlers();
    
    try {
        const response = await fetch(`${API_BASE}/sites/${siteId}/crawl-schedule`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load crawl schedule');
        
        const data = await response.json();
        crawlScheduleConfig = data;
        
        populateCrawlScheduleForm(data);
        updateCrawlStatusBanner(data.is_crawling);
        
        if (data.is_crawling) {
            startCrawlStatusPolling(siteId);
        }
        
        await loadCrawlHistory(siteId);
        
    } catch (error) {
        console.error('Failed to load crawl schedule:', error);
    }
}

function initCrawlingTabHandlers() {
    const enabledToggle = document.getElementById('crawl-schedule-enabled');
    if (enabledToggle) {
        enabledToggle.onchange = () => {
            toggleCrawlScheduleOptions(enabledToggle.checked);
        };
    }
    
    const frequencySelect = document.getElementById('crawl-frequency');
    if (frequencySelect) {
        frequencySelect.onchange = () => {
            toggleCustomCronField(frequencySelect.value === 'custom');
        };
    }
    
    const saveBtn = document.getElementById('save-crawl-schedule');
    if (saveBtn) {
        saveBtn.onclick = saveCrawlSchedule;
    }
    
    const crawlNowBtn = document.getElementById('crawl-now-btn');
    if (crawlNowBtn) {
        crawlNowBtn.onclick = triggerCrawlNow;
    }
}

function populateCrawlScheduleForm(data) {
    const schedule = data.schedule || {};
    
    const enabledEl = document.getElementById('crawl-schedule-enabled');
    if (enabledEl) {
        enabledEl.checked = schedule.enabled || false;
        toggleCrawlScheduleOptions(schedule.enabled);
    }
    
    const frequencyEl = document.getElementById('crawl-frequency');
    if (frequencyEl) {
        frequencyEl.value = schedule.frequency || 'weekly';
        toggleCustomCronField(schedule.frequency === 'custom');
    }
    
    const customCronEl = document.getElementById('crawl-custom-cron');
    if (customCronEl) {
        customCronEl.value = schedule.custom_cron || '';
    }
    
    const maxPagesEl = document.getElementById('crawl-max-pages');
    if (maxPagesEl) {
        maxPagesEl.value = schedule.max_pages || 50;
    }
    
    const includeEl = document.getElementById('crawl-include-patterns');
    if (includeEl) {
        includeEl.value = (schedule.include_patterns || []).join('\n');
    }
    
    const excludeEl = document.getElementById('crawl-exclude-patterns');
    if (excludeEl) {
        excludeEl.value = (schedule.exclude_patterns || []).join('\n');
    }
    
    const notifyEl = document.getElementById('crawl-notify');
    if (notifyEl) {
        notifyEl.checked = schedule.notify_on_completion !== false;
    }
    
    const lastCrawlEl = document.getElementById('last-crawl-time');
    if (lastCrawlEl) {
        if (schedule.last_crawl_at) {
            lastCrawlEl.textContent = formatRelativeTime(new Date(schedule.last_crawl_at));
        } else {
            lastCrawlEl.textContent = 'Never';
        }
    }
    
    const nextCrawlEl = document.getElementById('next-crawl-time');
    if (nextCrawlEl) {
        if (schedule.enabled && schedule.next_crawl_at) {
            nextCrawlEl.textContent = formatDateTime(new Date(schedule.next_crawl_at));
        } else {
            nextCrawlEl.textContent = 'Not scheduled';
        }
    }
}

function toggleCrawlScheduleOptions(enabled) {
    const optionsEl = document.getElementById('crawl-schedule-options');
    if (optionsEl) {
        if (enabled) {
            optionsEl.classList.remove('disabled');
        } else {
            optionsEl.classList.add('disabled');
        }
    }
}

function toggleCustomCronField(show) {
    const customGroup = document.getElementById('custom-cron-group');
    if (customGroup) {
        customGroup.style.display = show ? 'block' : 'none';
    }
}

async function saveCrawlSchedule() {
    if (!currentDetailSite) return;
    
    const siteId = currentDetailSite.site_id;
    
    const btn = document.getElementById('save-crawl-schedule');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const includePatterns = document.getElementById('crawl-include-patterns')?.value
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0) || [];
        
        const excludePatterns = document.getElementById('crawl-exclude-patterns')?.value
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0) || [];
        
        const scheduleConfig = {
            enabled: document.getElementById('crawl-schedule-enabled')?.checked || false,
            frequency: document.getElementById('crawl-frequency')?.value || 'weekly',
            custom_cron: document.getElementById('crawl-custom-cron')?.value || null,
            max_pages: parseInt(document.getElementById('crawl-max-pages')?.value) || 50,
            include_patterns: includePatterns,
            exclude_patterns: excludePatterns,
            notify_on_completion: document.getElementById('crawl-notify')?.checked !== false
        };
        
        const response = await fetch(`${API_BASE}/sites/${siteId}/crawl-schedule`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(scheduleConfig)
        });
        
        if (!response.ok) throw new Error('Failed to save crawl schedule');
        
        const data = await response.json();
        crawlScheduleConfig = data;
        populateCrawlScheduleForm(data);
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save crawl schedule:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

async function triggerCrawlNow() {
    if (!currentDetailSite) return;
    
    const siteId = currentDetailSite.site_id;
    const btn = document.getElementById('crawl-now-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<svg class="spinner" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.25"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg> Starting...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${siteId}/crawl-now`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to start crawl');
        }
        
        const data = await response.json();
        
        updateCrawlStatusBanner(true);
        startCrawlStatusPolling(siteId);
        
        btn.innerHTML = originalHtml;
        
    } catch (error) {
        console.error('Failed to trigger crawl:', error);
        alert(error.message || 'Failed to start crawl. Please try again.');
        btn.innerHTML = originalHtml;
    } finally {
        btn.disabled = false;
    }
}

function updateCrawlStatusBanner(isCrawling, pagesCount = 0) {
    const banner = document.getElementById('crawl-status-banner');
    const pagesEl = document.getElementById('crawl-status-pages');
    const crawlBtn = document.getElementById('crawl-now-btn');
    
    if (banner) {
        banner.style.display = isCrawling ? 'flex' : 'none';
    }
    
    if (pagesEl) {
        pagesEl.textContent = `${pagesCount} pages crawled`;
    }
    
    if (crawlBtn) {
        crawlBtn.disabled = isCrawling;
    }
}

function startCrawlStatusPolling(siteId) {
    if (crawlStatusPollInterval) {
        clearInterval(crawlStatusPollInterval);
    }
    
    crawlStatusPollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/sites/${siteId}/crawl-status`, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            if (data.is_crawling) {
                updateCrawlStatusBanner(true, data.pages_crawled || 0);
            } else {
                updateCrawlStatusBanner(false);
                clearInterval(crawlStatusPollInterval);
                crawlStatusPollInterval = null;
                
                await loadCrawlSchedule(siteId);
            }
            
        } catch (error) {
            console.error('Failed to poll crawl status:', error);
        }
    }, 3000);
}

async function loadCrawlHistory(siteId) {
    if (!siteId) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${siteId}/crawl-history?limit=10`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load crawl history');
        
        const data = await response.json();
        renderCrawlHistory(data.history || []);
        
    } catch (error) {
        console.error('Failed to load crawl history:', error);
    }
}

function renderCrawlHistory(history) {
    const tbody = document.getElementById('crawl-history-tbody');
    if (!tbody) return;
    
    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No crawl history available</td></tr>';
        return;
    }
    
    tbody.innerHTML = history.map(item => {
        const date = item.started_at ? formatDateTime(new Date(item.started_at)) : 'N/A';
        const trigger = item.trigger || 'manual';
        const pages = `${item.pages_crawled || 0} / ${item.pages_indexed || 0}`;
        const status = item.status || 'unknown';
        const duration = item.duration_seconds !== null ? formatDuration(item.duration_seconds) : '-';
        
        return `
            <tr>
                <td>${date}</td>
                <td><span class="crawl-trigger-badge ${trigger}">${trigger}</span></td>
                <td>${pages}</td>
                <td><span class="crawl-status-badge ${status}">${status}</span></td>
                <td>${duration}</td>
            </tr>
        `;
    }).join('');
}

function formatDateTime(date) {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(date) {
    if (!date || isNaN(date.getTime())) return 'Never';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return formatDateTime(date);
}

function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return '-';
    
    if (seconds < 60) return `${seconds}s`;
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins < 60) return `${mins}m ${secs}s`;
    
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
}

function setupCrawlScheduleListeners() {
    const enabledToggle = document.getElementById('crawl-schedule-enabled');
    if (enabledToggle) {
        enabledToggle.addEventListener('change', () => {
            toggleCrawlScheduleOptions(enabledToggle.checked);
        });
    }
    
    const frequencySelect = document.getElementById('crawl-frequency');
    if (frequencySelect) {
        frequencySelect.addEventListener('change', () => {
            toggleCustomCronField(frequencySelect.value === 'custom');
        });
    }
    
    const saveBtn = document.getElementById('save-crawl-schedule');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveCrawlSchedule);
    }
    
    const crawlNowBtn = document.getElementById('crawl-now-btn');
    if (crawlNowBtn) {
        crawlNowBtn.addEventListener('click', triggerCrawlNow);
    }
    
    document.querySelectorAll('.customize-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'crawling' && currentDetailSite) {
                loadCrawlSchedule(currentDetailSite.site_id);
            }
        });
    });
}

function initCrawlScheduleSettings() {
    setupCrawlScheduleListeners();
}

window.loadCrawlSchedule = loadCrawlSchedule;
window.saveCrawlSchedule = saveCrawlSchedule;
window.triggerCrawlNow = triggerCrawlNow;

document.addEventListener('DOMContentLoaded', () => {
    initCrawlScheduleSettings();
});

// ==================== Lead Management ====================

let leadsState = {
    leads: [],
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    search: ''
};

function getLeadsTabContent() {
    const config = currentSiteConfig || {};
    const leadCapture = config.lead_capture || {};
    
    return `
        <div class="leads-tab-content">
            <div class="leads-config-section">
                <h4>Lead Capture Settings</h4>
                <div class="lead-settings-grid">
                    <div class="form-group form-checkbox">
                        <input type="checkbox" id="lead-collect-email" ${leadCapture.collect_email ? 'checked' : ''}>
                        <label for="lead-collect-email">Collect Email</label>
                    </div>
                    <div class="form-group form-checkbox">
                        <input type="checkbox" id="lead-email-required" ${leadCapture.email_required ? 'checked' : ''}>
                        <label for="lead-email-required">Email Required</label>
                    </div>
                    <div class="form-group form-checkbox">
                        <input type="checkbox" id="lead-collect-name" ${leadCapture.collect_name ? 'checked' : ''}>
                        <label for="lead-collect-name">Collect Name</label>
                    </div>
                    <div class="form-group form-checkbox">
                        <input type="checkbox" id="lead-name-required" ${leadCapture.name_required ? 'checked' : ''}>
                        <label for="lead-name-required">Name Required</label>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="lead-prompt">Lead Capture Prompt</label>
                    <input type="text" id="lead-prompt" class="form-input" 
                           value="${leadCapture.email_prompt || 'Enter your email to continue'}" 
                           placeholder="Enter your email to continue">
                </div>
                
                <div class="form-group">
                    <label for="lead-timing">Capture Timing</label>
                    <select id="lead-timing" class="form-select">
                        <option value="before_chat" ${leadCapture.capture_timing === 'before_chat' ? 'selected' : ''}>Before Chat Starts</option>
                        <option value="after_messages" ${leadCapture.capture_timing === 'after_messages' ? 'selected' : ''}>After N Messages</option>
                        <option value="on_handoff" ${leadCapture.capture_timing === 'on_handoff' ? 'selected' : ''}>On Handoff Request</option>
                    </select>
                </div>
                
                <div class="form-group" id="messages-before-capture-group" style="${leadCapture.capture_timing === 'after_messages' ? '' : 'display:none'}">
                    <label for="lead-messages-before">Messages Before Capture</label>
                    <input type="number" id="lead-messages-before" class="form-input" 
                           value="${leadCapture.messages_before_capture || 3}" min="1" max="20">
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-primary btn-sm" id="save-lead-config">Save Settings</button>
                </div>
            </div>
            
            <div class="leads-list-section">
                <div class="leads-header">
                    <h4>Captured Leads</h4>
                    <div class="leads-actions">
                        <div class="search-box search-box-sm">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input type="text" id="leads-search" placeholder="Search leads...">
                        </div>
                        <button class="btn btn-secondary btn-sm" id="export-leads">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Export CSV
                        </button>
                    </div>
                </div>
                
                <div class="leads-table-container">
                    <table class="leads-table">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Name</th>
                                <th>Captured</th>
                                <th>Source</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="leads-tbody">
                            <tr class="leads-loading">
                                <td colspan="5">
                                    <div class="spinner-sm"></div>
                                    <span>Loading leads...</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="leads-pagination" id="leads-pagination">
                    <button class="pagination-btn" id="leads-prev-page" disabled>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                    </button>
                    <span class="pagination-info" id="leads-pagination-info">Page 1 of 1</span>
                    <button class="pagination-btn" id="leads-next-page" disabled>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function initLeadsHandlers() {
    const timingSelect = document.getElementById('lead-timing');
    if (timingSelect) {
        timingSelect.addEventListener('change', () => {
            const messagesGroup = document.getElementById('messages-before-capture-group');
            if (messagesGroup) {
                messagesGroup.style.display = timingSelect.value === 'after_messages' ? '' : 'none';
            }
        });
    }
    
    const saveBtn = document.getElementById('save-lead-config');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveLeadConfig);
    }
    
    const searchInput = document.getElementById('leads-search');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                leadsState.search = searchInput.value;
                leadsState.page = 1;
                loadLeads();
            }, 300);
        });
    }
    
    const exportBtn = document.getElementById('export-leads');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportLeads);
    }
    
    const prevBtn = document.getElementById('leads-prev-page');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (leadsState.page > 1) {
                leadsState.page--;
                loadLeads();
            }
        });
    }
    
    const nextBtn = document.getElementById('leads-next-page');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (leadsState.page < leadsState.totalPages) {
                leadsState.page++;
                loadLeads();
            }
        });
    }
}

async function loadLeads() {
    if (!currentDetailSite) return;
    
    const tbody = document.getElementById('leads-tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr class="leads-loading">
                <td colspan="5">
                    <div class="spinner-sm"></div>
                    <span>Loading leads...</span>
                </td>
            </tr>
        `;
    }
    
    try {
        const params = new URLSearchParams({
            page: leadsState.page,
            limit: leadsState.limit
        });
        
        if (leadsState.search) {
            params.append('search', leadsState.search);
        }
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/leads?${params.toString()}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load leads');
        
        const data = await response.json();
        leadsState.leads = data.leads || [];
        leadsState.total = data.total || 0;
        leadsState.totalPages = data.total_pages || 0;
        
        renderLeadsTable();
        updateLeadsPagination();
        
    } catch (error) {
        console.error('Failed to load leads:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr class="leads-empty">
                    <td colspan="5">Failed to load leads</td>
                </tr>
            `;
        }
    }
}

function renderLeadsTable() {
    const tbody = document.getElementById('leads-tbody');
    if (!tbody) return;
    
    if (!leadsState.leads || leadsState.leads.length === 0) {
        tbody.innerHTML = `
            <tr class="leads-empty">
                <td colspan="5">No leads captured yet</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = leadsState.leads.map(lead => {
        const capturedAt = lead.captured_at ? formatRelativeTime(new Date(lead.captured_at)) : 'Unknown';
        const source = lead.source || 'chat';
        
        return `
            <tr data-lead-id="${lead.id}">
                <td>${lead.email || '<span class="text-muted">—</span>'}</td>
                <td>${lead.name || '<span class="text-muted">—</span>'}</td>
                <td>${capturedAt}</td>
                <td><span class="lead-source-badge ${source}">${source}</span></td>
                <td>
                    <button class="btn btn-icon btn-danger-ghost" onclick="deleteLead('${lead.id}')" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateLeadsPagination() {
    const prevBtn = document.getElementById('leads-prev-page');
    const nextBtn = document.getElementById('leads-next-page');
    const info = document.getElementById('leads-pagination-info');
    
    if (prevBtn) prevBtn.disabled = leadsState.page <= 1;
    if (nextBtn) nextBtn.disabled = leadsState.page >= leadsState.totalPages;
    if (info) info.textContent = `Page ${leadsState.page} of ${leadsState.totalPages || 1}`;
}

async function saveLeadConfig() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('save-lead-config');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const config = {
            lead_capture: {
                collect_email: document.getElementById('lead-collect-email')?.checked || false,
                email_required: document.getElementById('lead-email-required')?.checked || false,
                email_prompt: document.getElementById('lead-prompt')?.value || 'Enter your email to continue',
                collect_name: document.getElementById('lead-collect-name')?.checked || false,
                name_required: document.getElementById('lead-name-required')?.checked || false,
                capture_timing: document.getElementById('lead-timing')?.value || 'before_chat',
                messages_before_capture: parseInt(document.getElementById('lead-messages-before')?.value) || 3
            }
        };
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (!response.ok) throw new Error('Failed to save lead config');
        
        currentSiteConfig = { ...currentSiteConfig, ...config };
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save lead config:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

async function exportLeads() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('export-leads');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<div class="spinner-sm"></div> Exporting...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/leads/export`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to export leads');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_${currentDetailSite.site_id}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
    } catch (error) {
        console.error('Failed to export leads:', error);
        alert('Failed to export leads. Please try again.');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

async function deleteLead(leadId) {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/leads/${leadId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to delete lead');
        
        loadLeads();
        
    } catch (error) {
        console.error('Failed to delete lead:', error);
        alert('Failed to delete lead. Please try again.');
    }
}

window.deleteLead = deleteLead;

// ==================== Q&A Training Functions ====================

let qaState = {
    qaPairs: [],
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    search: '',
    editingId: null
};

function setupQAEventListeners() {
    // Q&A Modal
    document.getElementById('close-qa-modal')?.addEventListener('click', closeQAModal);
    document.getElementById('cancel-qa')?.addEventListener('click', closeQAModal);
    document.getElementById('qa-form')?.addEventListener('submit', handleSaveQA);
    
    // Character count for Q&A
    document.getElementById('qa-question')?.addEventListener('input', (e) => {
        document.getElementById('qa-question-count').textContent = e.target.value.length;
    });
    document.getElementById('qa-answer')?.addEventListener('input', (e) => {
        document.getElementById('qa-answer-count').textContent = e.target.value.length;
    });
    
    // Q&A from conversation modal
    document.getElementById('close-qa-conv-modal')?.addEventListener('click', closeQAConvModal);
    document.getElementById('cancel-qa-conv')?.addEventListener('click', closeQAConvModal);
    document.getElementById('qa-conv-form')?.addEventListener('submit', handleSaveQAFromConversation);
    document.getElementById('qa-conv-edited-answer')?.addEventListener('input', (e) => {
        document.getElementById('qa-conv-answer-count').textContent = e.target.value.length;
    });
    
    // Modal backdrop clicks
    document.getElementById('qa-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'qa-modal') closeQAModal();
    });
    document.getElementById('qa-from-conv-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'qa-from-conv-modal') closeQAConvModal();
    });
}

function renderTrainingTab() {
    const container = document.getElementById('detail-tab-content');
    if (!container || !currentDetailSite) return;
    
    container.innerHTML = `
        <div class="tab-form training-tab">
            <!-- Q&A Stats -->
            <div class="qa-stats-row" id="qa-stats-row">
                <div class="qa-stat-card primary">
                    <div class="qa-stat-value" id="qa-stat-total">0</div>
                    <div class="qa-stat-label">Total Q&A Pairs</div>
                </div>
                <div class="qa-stat-card">
                    <div class="qa-stat-value" id="qa-stat-enabled">0</div>
                    <div class="qa-stat-label">Active</div>
                </div>
                <div class="qa-stat-card">
                    <div class="qa-stat-value" id="qa-stat-uses">0</div>
                    <div class="qa-stat-label">Total Uses</div>
                </div>
            </div>
            
            <!-- Most Used Q&A -->
            <div class="qa-most-used" id="qa-most-used" style="display: none;">
                <div class="qa-most-used-title">Most Used Q&A Pairs</div>
                <div id="qa-most-used-list"></div>
            </div>
            
            <!-- Q&A Header -->
            <div class="qa-header">
                <h4>Q&A Training Pairs</h4>
                <div class="qa-actions">
                    <button class="btn btn-primary btn-sm" id="add-qa-btn" onclick="openQAModal()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Q&A
                    </button>
                </div>
            </div>
            
            <!-- Search -->
            <div class="qa-search-wrapper">
                <input type="text" class="qa-search-input" id="qa-search" placeholder="Search Q&A pairs..." oninput="handleQASearch(this.value)">
            </div>
            
            <!-- Q&A List -->
            <div class="qa-list" id="qa-list">
                <div class="qa-list-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <h4>No Q&A pairs yet</h4>
                    <p>Add Q&A pairs to train your chatbot with approved responses</p>
                    <button class="btn btn-primary" onclick="openQAModal()">Create First Q&A</button>
                </div>
            </div>
            
            <!-- Pagination -->
            <div class="qa-pagination" id="qa-pagination" style="display: none;">
                <button class="qa-pagination-btn" id="qa-prev-page" onclick="changeQAPage(-1)" disabled>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
                <span class="qa-pagination-info" id="qa-pagination-info">Page 1 of 1</span>
                <button class="qa-pagination-btn" id="qa-next-page" onclick="changeQAPage(1)" disabled>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    
    loadQAStats();
    loadQAPairs();
}

async function loadQAStats() {
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa/stats`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load Q&A stats');
        
        const stats = await response.json();
        
        document.getElementById('qa-stat-total').textContent = stats.total_pairs || 0;
        document.getElementById('qa-stat-enabled').textContent = stats.enabled_pairs || 0;
        document.getElementById('qa-stat-uses').textContent = stats.total_uses || 0;
        
        // Render most used
        if (stats.most_used && stats.most_used.length > 0) {
            const mostUsedContainer = document.getElementById('qa-most-used');
            const mostUsedList = document.getElementById('qa-most-used-list');
            
            mostUsedContainer.style.display = 'block';
            mostUsedList.innerHTML = stats.most_used.map((qa, index) => `
                <div class="qa-most-used-item">
                    <span class="qa-most-used-rank">${index + 1}</span>
                    <span class="qa-most-used-text">${escapeHtml(qa.question)}</span>
                    <span class="qa-most-used-count">${qa.use_count} uses</span>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Failed to load Q&A stats:', error);
    }
}

async function loadQAPairs() {
    if (!currentDetailSite) return;
    
    const listContainer = document.getElementById('qa-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--gray-500);">
            <div class="spinner"></div>
            <span>Loading Q&A pairs...</span>
        </div>
    `;
    
    try {
        const params = new URLSearchParams({
            page: qaState.page,
            limit: qaState.limit
        });
        
        if (qaState.search) {
            params.append('search', qaState.search);
        }
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa?${params.toString()}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load Q&A pairs');
        
        const data = await response.json();
        qaState.qaPairs = data.qa_pairs || [];
        qaState.total = data.total || 0;
        qaState.totalPages = data.total_pages || 0;
        
        renderQAPairs();
        updateQAPagination();
        
    } catch (error) {
        console.error('Failed to load Q&A pairs:', error);
        listContainer.innerHTML = `
            <div class="qa-list-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h4>Error loading Q&A pairs</h4>
                <p>Please try again later</p>
            </div>
        `;
    }
}

function renderQAPairs() {
    const listContainer = document.getElementById('qa-list');
    if (!listContainer) return;
    
    if (!qaState.qaPairs || qaState.qaPairs.length === 0) {
        listContainer.innerHTML = `
            <div class="qa-list-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <h4>No Q&A pairs ${qaState.search ? 'found' : 'yet'}</h4>
                <p>${qaState.search ? 'Try a different search term' : 'Add Q&A pairs to train your chatbot with approved responses'}</p>
                ${!qaState.search ? '<button class="btn btn-primary" onclick="openQAModal()">Create First Q&A</button>' : ''}
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = qaState.qaPairs.map(qa => {
        const timeAgo = formatTimeAgo(new Date(qa.updated_at));
        return `
            <div class="qa-item ${qa.enabled ? '' : 'disabled'}" data-qa-id="${qa.id}">
                <div class="qa-item-header">
                    <div class="qa-question">${escapeHtml(qa.question)}</div>
                    <div class="qa-item-actions">
                        <button class="qa-item-btn edit" onclick="editQAPair('${qa.id}')" title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="qa-item-btn" onclick="toggleQAPair('${qa.id}')" title="${qa.enabled ? 'Disable' : 'Enable'}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${qa.enabled ? 
                                    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' :
                                    '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                                }
                            </svg>
                        </button>
                        <button class="qa-item-btn delete" onclick="deleteQAPair('${qa.id}')" title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="qa-answer">${escapeHtml(qa.answer)}</div>
                <div class="qa-item-meta">
                    <span class="qa-meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        ${timeAgo}
                    </span>
                    <span class="qa-meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                        </svg>
                        ${qa.use_count || 0} uses
                    </span>
                    <span class="qa-status-badge ${qa.enabled ? 'enabled' : 'disabled'}">
                        ${qa.enabled ? 'Active' : 'Disabled'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function updateQAPagination() {
    const paginationEl = document.getElementById('qa-pagination');
    const prevBtn = document.getElementById('qa-prev-page');
    const nextBtn = document.getElementById('qa-next-page');
    const infoEl = document.getElementById('qa-pagination-info');
    
    if (qaState.totalPages > 1) {
        paginationEl.style.display = 'flex';
        prevBtn.disabled = qaState.page <= 1;
        nextBtn.disabled = qaState.page >= qaState.totalPages;
        infoEl.textContent = `Page ${qaState.page} of ${qaState.totalPages}`;
    } else {
        paginationEl.style.display = 'none';
    }
}

function changeQAPage(delta) {
    qaState.page += delta;
    loadQAPairs();
}

let qaSearchTimeout = null;
function handleQASearch(value) {
    clearTimeout(qaSearchTimeout);
    qaSearchTimeout = setTimeout(() => {
        qaState.search = value;
        qaState.page = 1;
        loadQAPairs();
    }, 300);
}

function openQAModal(qa = null) {
    const modal = document.getElementById('qa-modal');
    const title = document.getElementById('qa-modal-title');
    const questionInput = document.getElementById('qa-question');
    const answerInput = document.getElementById('qa-answer');
    const idInput = document.getElementById('qa-id');
    
    if (qa) {
        title.textContent = 'Edit Q&A Pair';
        questionInput.value = qa.question || '';
        answerInput.value = qa.answer || '';
        idInput.value = qa.id;
        qaState.editingId = qa.id;
    } else {
        title.textContent = 'Create Q&A Pair';
        questionInput.value = '';
        answerInput.value = '';
        idInput.value = '';
        qaState.editingId = null;
    }
    
    document.getElementById('qa-question-count').textContent = questionInput.value.length;
    document.getElementById('qa-answer-count').textContent = answerInput.value.length;
    
    modal.classList.add('active');
    questionInput.focus();
}

function closeQAModal() {
    document.getElementById('qa-modal').classList.remove('active');
    qaState.editingId = null;
}

async function handleSaveQA(e) {
    e.preventDefault();
    
    if (!currentDetailSite) return;
    
    const question = document.getElementById('qa-question').value.trim();
    const answer = document.getElementById('qa-answer').value.trim();
    const qaId = document.getElementById('qa-id').value;
    
    if (!question || !answer) {
        alert('Please enter both question and answer');
        return;
    }
    
    const saveBtn = document.getElementById('save-qa');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        let response;
        
        if (qaId) {
            // Update existing
            response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa/${qaId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question, answer })
            });
        } else {
            // Create new
            response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question, answer })
            });
        }
        
        if (!response.ok) throw new Error('Failed to save Q&A pair');
        
        closeQAModal();
        loadQAStats();
        loadQAPairs();
        
    } catch (error) {
        console.error('Failed to save Q&A pair:', error);
        alert('Failed to save Q&A pair. Please try again.');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

async function editQAPair(qaId) {
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa/${qaId}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch Q&A pair');
        
        const qa = await response.json();
        openQAModal(qa);
        
    } catch (error) {
        console.error('Failed to load Q&A pair:', error);
        alert('Failed to load Q&A pair. Please try again.');
    }
}

async function toggleQAPair(qaId) {
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa/${qaId}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to toggle Q&A pair');
        
        loadQAStats();
        loadQAPairs();
        
    } catch (error) {
        console.error('Failed to toggle Q&A pair:', error);
        alert('Failed to toggle Q&A pair. Please try again.');
    }
}

async function deleteQAPair(qaId) {
    if (!confirm('Are you sure you want to delete this Q&A pair?')) return;
    
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/qa/${qaId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to delete Q&A pair');
        
        loadQAStats();
        loadQAPairs();
        
    } catch (error) {
        console.error('Failed to delete Q&A pair:', error);
        alert('Failed to delete Q&A pair. Please try again.');
    }
}

// Q&A from Conversation functions
function openQAFromConversationModal(sessionId, messageIndex, question, answer, siteId) {
    const modal = document.getElementById('qa-from-conv-modal');
    
    document.getElementById('qa-conv-question').textContent = question;
    document.getElementById('qa-conv-original-answer').textContent = answer;
    document.getElementById('qa-conv-edited-answer').value = '';
    document.getElementById('qa-conv-session-id').value = sessionId;
    document.getElementById('qa-conv-message-index').value = messageIndex;
    document.getElementById('qa-conv-site-id').value = siteId;
    document.getElementById('qa-conv-answer-count').textContent = '0';
    
    modal.classList.add('active');
}

function closeQAConvModal() {
    document.getElementById('qa-from-conv-modal').classList.remove('active');
}

async function handleSaveQAFromConversation(e) {
    e.preventDefault();
    
    const sessionId = document.getElementById('qa-conv-session-id').value;
    const messageIndex = parseInt(document.getElementById('qa-conv-message-index').value);
    const siteId = document.getElementById('qa-conv-site-id').value;
    const editedAnswer = document.getElementById('qa-conv-edited-answer').value.trim();
    
    if (!sessionId || isNaN(messageIndex) || !siteId) {
        alert('Invalid conversation data');
        return;
    }
    
    const saveBtn = document.getElementById('save-qa-conv');
    const originalHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = '<div class="spinner-sm"></div> Creating...';
    saveBtn.disabled = true;
    
    try {
        const body = {
            session_id: sessionId,
            message_index: messageIndex
        };
        
        if (editedAnswer) {
            body.edited_answer = editedAnswer;
        }
        
        const response = await fetch(`${API_BASE}/sites/${siteId}/qa/from-conversation`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create Q&A pair');
        }
        
        closeQAConvModal();
        alert('Q&A pair created successfully!');
        
        // Refresh conversation view if we're still looking at it
        if (conversationsState.currentConversation === sessionId) {
            loadConversationDetail(sessionId);
        }
        
    } catch (error) {
        console.error('Failed to create Q&A from conversation:', error);
        alert(error.message || 'Failed to create Q&A pair. Please try again.');
    } finally {
        saveBtn.innerHTML = originalHtml;
        saveBtn.disabled = false;
    }
}

// Expose Q&A functions globally
window.openQAModal = openQAModal;
window.editQAPair = editQAPair;
window.toggleQAPair = toggleQAPair;
window.deleteQAPair = deleteQAPair;
window.changeQAPage = changeQAPage;
window.handleQASearch = handleQASearch;
window.openQAFromConversationModal = openQAFromConversationModal;

// Initialize Q&A event listeners
document.addEventListener('DOMContentLoaded', () => {
    setupQAEventListeners();
});
