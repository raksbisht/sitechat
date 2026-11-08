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
    initMobileSidebar();
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

    const mobileAvatar = document.getElementById('mobile-user-avatar');
    if (mobileAvatar) mobileAvatar.textContent = initial;
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

    // Mobile: clear back-nav state when switching top-level views
    mobileNav.pop();
    const sitesLayout = document.querySelector('#sites-view .master-detail-layout');
    if (sitesLayout) sitesLayout.classList.remove('mobile-detail-open');
    const convLayout = document.querySelector('.conversations-layout');
    if (convLayout) convLayout.classList.remove('detail-open');
    const handoffLayout = document.querySelector('.handoffs-layout');
    if (handoffLayout) handoffLayout.classList.remove('detail-open');

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
