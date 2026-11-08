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
