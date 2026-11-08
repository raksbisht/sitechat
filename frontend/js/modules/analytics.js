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
