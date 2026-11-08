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
