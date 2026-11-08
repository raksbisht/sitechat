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

    // Mobile: full-screen detail
    const layout = document.querySelector('.handoffs-layout');
    if (layout && !layout.classList.contains('detail-open')) {
        layout.classList.add('detail-open');
        mobileNav.push(() => {
            layout.classList.remove('detail-open');
        }, handoff.visitor_name || 'Handoff');
    }

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
