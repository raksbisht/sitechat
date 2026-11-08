// Site detail panel: tab routing, sidebar (mobile/collapse), quick actions, side panel.
// Extracted from core.js in ROADMAP 4.1 increment 3.
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
    // Mobile: exit full-screen detail mode
    const sitesLayout = document.querySelector('#sites-view .master-detail-layout');
    if (sitesLayout) sitesLayout.classList.remove('mobile-detail-open');
    mobileNav.pop();
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

/** Mobile back-navigation stack */
const mobileNav = {
    _action: null,

    push(action, title) {
        this._action = action;
        document.body.classList.add('mobile-has-back');
        const titleEl = document.getElementById('mobile-topbar-title');
        if (titleEl) titleEl.textContent = title || '';
    },

    pop() {
        this._action = null;
        document.body.classList.remove('mobile-has-back');
        const titleEl = document.getElementById('mobile-topbar-title');
        if (titleEl) titleEl.textContent = '';
    },

    trigger() {
        if (typeof this._action === 'function') {
            this._action();
        }
        this.pop();
    }
};

function initMobileSidebar() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const backBtn = document.getElementById('mobile-back-btn');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const sidebar = document.getElementById('dashboard-sidebar');

    function openSidebar() {
        document.body.classList.add('sidebar-mobile-open');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
        document.body.classList.remove('sidebar-mobile-open');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    }

    menuBtn?.addEventListener('click', () => {
        if (document.body.classList.contains('sidebar-mobile-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    backBtn?.addEventListener('click', () => mobileNav.trigger());

    overlay?.addEventListener('click', closeSidebar);

    // Close on nav item click on mobile
    sidebar?.addEventListener('click', (e) => {
        if (window.matchMedia('(max-width: 768px)').matches) {
            if (e.target.closest('.menu-item, .sidebar-util-link')) {
                closeSidebar();
            }
        }
    });

    // Close on resize back to desktop
    window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
        if (!e.matches) {
            closeSidebar();
            mobileNav.pop();
        }
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

    // Mobile: switch to full-screen detail mode
    const sitesLayout = document.querySelector('#sites-view .master-detail-layout');
    if (sitesLayout) sitesLayout.classList.add('mobile-detail-open');
    const siteName = site.name || site.url;
    mobileNav.push(() => {
        if (sitesLayout) sitesLayout.classList.remove('mobile-detail-open');
    }, siteName.replace(/https?:\/\//, '').replace(/\/$/, ''));

    showDetailContent();

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

