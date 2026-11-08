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

    // Mobile: full-screen detail
    const layout = document.querySelector('.conversations-layout');
    if (layout && !layout.classList.contains('detail-open')) {
        layout.classList.add('detail-open');
        mobileNav.push(() => {
            if (layout) layout.classList.remove('detail-open');
            if (emptyState) emptyState.style.display = 'flex';
            if (contentState) contentState.style.display = 'none';
        }, 'Conversation');
    }
    
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
