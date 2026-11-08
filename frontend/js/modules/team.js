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
