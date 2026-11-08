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
