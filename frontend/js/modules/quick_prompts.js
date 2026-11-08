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
