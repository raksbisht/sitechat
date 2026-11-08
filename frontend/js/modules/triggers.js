// ==================== Proactive Chat Triggers ====================

let triggersState = {
    triggers: [],
    globalCooldownMs: 30000,
    editingTriggerId: null,
    conditionIndex: 0
};

function setupTriggersEventListeners() {
    // Add trigger buttons
    document.getElementById('add-trigger-btn')?.addEventListener('click', () => openTriggerModal());
    document.getElementById('add-trigger-empty-btn')?.addEventListener('click', () => openTriggerModal());
    
    // Create default triggers
    document.getElementById('create-default-triggers')?.addEventListener('click', createDefaultTriggers);
    
    // Trigger modal
    document.getElementById('close-trigger-modal')?.addEventListener('click', closeTriggerModal);
    document.getElementById('cancel-trigger')?.addEventListener('click', closeTriggerModal);
    document.getElementById('trigger-form')?.addEventListener('submit', saveTrigger);
    
    // Add condition
    document.getElementById('add-condition-btn')?.addEventListener('click', addConditionRow);
    
    // Global cooldown
    document.getElementById('global-cooldown')?.addEventListener('change', async (e) => {
        if (!currentDetailSite) return;
        try {
            await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/cooldown?cooldown_ms=${e.target.value}`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
        } catch (error) {
            console.error('Failed to update cooldown:', error);
        }
    });
}

async function loadTriggers() {
    if (!currentDetailSite) return;
    
    const listEl = document.getElementById('triggers-list');
    const emptyEl = document.getElementById('triggers-empty');
    
    listEl.innerHTML = `
        <div class="triggers-loading">
            <div class="spinner-sm"></div>
            <span>Loading triggers...</span>
        </div>
    `;
    emptyEl.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load triggers');
        
        const data = await response.json();
        triggersState.triggers = data.triggers || [];
        triggersState.globalCooldownMs = data.global_cooldown_ms || 30000;
        
        renderTriggersList();
        
        // Set cooldown select
        const cooldownSelect = document.getElementById('global-cooldown');
        if (cooldownSelect) {
            cooldownSelect.value = triggersState.globalCooldownMs;
        }
        
    } catch (error) {
        console.error('Failed to load triggers:', error);
        listEl.innerHTML = '<div class="triggers-loading">Error loading triggers</div>';
    }
}

function renderTriggersList() {
    const listEl = document.getElementById('triggers-list');
    const emptyEl = document.getElementById('triggers-empty');
    
    if (triggersState.triggers.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    
    emptyEl.classList.add('hidden');
    listEl.innerHTML = '';
    
    triggersState.triggers.forEach(trigger => {
        const summary = summarizeTriggerConditions(trigger.conditions);
        
        const item = document.createElement('div');
        item.className = `trigger-item ${trigger.enabled ? '' : 'disabled'}`;
        item.dataset.triggerId = trigger.id;
        
        item.innerHTML = `
            <div class="trigger-toggle ${trigger.enabled ? 'active' : ''}" data-trigger-id="${trigger.id}"></div>
            <div class="trigger-info">
                <div class="trigger-name">${escapeHtml(trigger.name)}</div>
                <div class="trigger-summary">${escapeHtml(summary)}</div>
            </div>
            <div class="trigger-actions">
                <button class="trigger-action-btn edit" data-trigger-id="${trigger.id}" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="trigger-action-btn delete" data-trigger-id="${trigger.id}" title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Toggle click
        item.querySelector('.trigger-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTriggerEnabled(trigger.id, !trigger.enabled);
        });
        
        // Edit click
        item.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openTriggerModal(trigger);
        });
        
        // Delete click
        item.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTrigger(trigger.id);
        });
        
        listEl.appendChild(item);
    });
}

function summarizeTriggerConditions(conditions) {
    if (!conditions || conditions.length === 0) return 'No conditions';
    
    const summaries = conditions.map(c => {
        switch (c.type) {
            case 'time': return `${c.value}s on page`;
            case 'scroll': return `${c.value}% scroll`;
            case 'exit_intent': return 'Exit intent';
            case 'url': return `URL: ${c.value}`;
            case 'visit_count': return `${c.value} visits`;
            default: return c.type;
        }
    });
    
    return summaries.join(' + ');
}

function openTriggerModal(trigger = null) {
    triggersState.editingTriggerId = trigger?.id || null;
    triggersState.conditionIndex = 0;
    
    const modal = document.getElementById('trigger-editor-modal');
    const title = document.getElementById('trigger-modal-title');
    const form = document.getElementById('trigger-form');
    
    title.textContent = trigger ? 'Edit Trigger' : 'Create Trigger';
    form.reset();
    
    // Clear conditions
    document.getElementById('conditions-list').innerHTML = '';
    
    if (trigger) {
        document.getElementById('trigger-id').value = trigger.id;
        document.getElementById('trigger-name').value = trigger.name || '';
        document.getElementById('trigger-message').value = trigger.message || '';
        document.getElementById('trigger-delay').value = trigger.delay_after_trigger_ms || 0;
        document.getElementById('trigger-priority').value = trigger.priority || 0;
        document.getElementById('trigger-once-session').checked = trigger.show_once_per_session !== false;
        document.getElementById('trigger-once-visitor').checked = trigger.show_once_per_visitor === true;
        document.getElementById('trigger-enabled').checked = trigger.enabled !== false;
        
        // Add condition rows
        if (trigger.conditions) {
            trigger.conditions.forEach(c => addConditionRow(c));
        }
    } else {
        document.getElementById('trigger-enabled').checked = true;
        document.getElementById('trigger-once-session').checked = true;
        addConditionRow();
    }
    
    modal.classList.add('active');
}

function closeTriggerModal() {
    document.getElementById('trigger-editor-modal').classList.remove('active');
    triggersState.editingTriggerId = null;
}

function addConditionRow(existingCondition = null) {
    const template = document.getElementById('condition-template');
    const list = document.getElementById('conditions-list');
    
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.condition-row');
    row.dataset.index = triggersState.conditionIndex++;
    
    if (existingCondition) {
        row.querySelector('.condition-type').value = existingCondition.type || 'time';
        row.querySelector('.condition-operator').value = existingCondition.operator || 'gte';
        row.querySelector('.condition-value').value = existingCondition.value || '';
    }
    
    // Update unit label based on type
    const typeSelect = row.querySelector('.condition-type');
    const unitLabel = row.querySelector('.condition-unit');
    const operatorSelect = row.querySelector('.condition-operator');
    
    updateConditionUI(typeSelect.value, unitLabel, operatorSelect);
    
    typeSelect.addEventListener('change', () => {
        updateConditionUI(typeSelect.value, unitLabel, operatorSelect);
    });
    
    // Remove button
    row.querySelector('.remove-condition').addEventListener('click', () => {
        row.remove();
    });
    
    list.appendChild(row);
}

function updateConditionUI(type, unitLabel, operatorSelect) {
    const numericOperators = ['gte', 'lte', 'eq', 'gt', 'lt'];
    const stringOperators = ['contains', 'matches', 'eq'];
    
    switch (type) {
        case 'time':
            unitLabel.textContent = 'seconds';
            setOperatorOptions(operatorSelect, numericOperators);
            break;
        case 'scroll':
            unitLabel.textContent = '%';
            setOperatorOptions(operatorSelect, numericOperators);
            break;
        case 'exit_intent':
            unitLabel.textContent = '';
            operatorSelect.style.display = 'none';
            break;
        case 'url':
            unitLabel.textContent = '';
            operatorSelect.style.display = 'block';
            setOperatorOptions(operatorSelect, stringOperators);
            break;
        case 'visit_count':
            unitLabel.textContent = 'visits';
            setOperatorOptions(operatorSelect, numericOperators);
            break;
        default:
            unitLabel.textContent = '';
            operatorSelect.style.display = 'block';
    }
}

function setOperatorOptions(select, operators) {
    const allOptions = {
        'gte': '≥ (greater or equal)',
        'lte': '≤ (less or equal)',
        'eq': '= (equals)',
        'gt': '> (greater)',
        'lt': '< (less)',
        'contains': 'contains',
        'matches': 'matches pattern'
    };
    
    const currentValue = select.value;
    select.innerHTML = '';
    
    operators.forEach(op => {
        const option = document.createElement('option');
        option.value = op;
        option.textContent = allOptions[op];
        select.appendChild(option);
    });
    
    if (operators.includes(currentValue)) {
        select.value = currentValue;
    }
}

function getConditionsFromForm() {
    const conditions = [];
    const rows = document.querySelectorAll('#conditions-list .condition-row');
    
    rows.forEach(row => {
        const type = row.querySelector('.condition-type').value;
        const operator = row.querySelector('.condition-operator').value;
        let value = row.querySelector('.condition-value').value;
        
        if (type === 'exit_intent') {
            value = true;
        } else if (['time', 'scroll', 'visit_count'].includes(type)) {
            value = parseInt(value) || 0;
        }
        
        conditions.push({ type, operator, value });
    });
    
    return conditions;
}

async function saveTrigger(e) {
    e.preventDefault();
    
    if (!currentDetailSite) return;
    
    const saveBtn = document.getElementById('save-trigger');
    const btnLabel = saveBtn.querySelector('.btn-label');
    const btnSpinner = saveBtn.querySelector('.btn-spinner');
    
    btnLabel.classList.add('hidden');
    btnSpinner.classList.remove('hidden');
    saveBtn.disabled = true;
    
    const conditions = getConditionsFromForm();
    
    if (conditions.length === 0) {
        alert('Please add at least one condition');
        btnLabel.classList.remove('hidden');
        btnSpinner.classList.add('hidden');
        saveBtn.disabled = false;
        return;
    }
    
    const triggerData = {
        name: document.getElementById('trigger-name').value,
        enabled: document.getElementById('trigger-enabled').checked,
        priority: parseInt(document.getElementById('trigger-priority').value) || 0,
        conditions: conditions,
        message: document.getElementById('trigger-message').value,
        delay_after_trigger_ms: parseInt(document.getElementById('trigger-delay').value) || 0,
        show_once_per_session: document.getElementById('trigger-once-session').checked,
        show_once_per_visitor: document.getElementById('trigger-once-visitor').checked
    };
    
    try {
        let response;
        
        if (triggersState.editingTriggerId) {
            response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/${triggersState.editingTriggerId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(triggerData)
            });
        } else {
            response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(triggerData)
            });
        }
        
        if (!response.ok) throw new Error('Failed to save trigger');
        
        closeTriggerModal();
        await loadTriggers();
        
    } catch (error) {
        console.error('Failed to save trigger:', error);
        alert('Failed to save trigger. Please try again.');
    } finally {
        btnLabel.classList.remove('hidden');
        btnSpinner.classList.add('hidden');
        saveBtn.disabled = false;
    }
}

async function toggleTriggerEnabled(triggerId, enabled) {
    if (!currentDetailSite) return;
    
    try {
        await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/${triggerId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ enabled })
        });
        
        // Update local state
        const trigger = triggersState.triggers.find(t => t.id === triggerId);
        if (trigger) {
            trigger.enabled = enabled;
        }
        
        renderTriggersList();
        
    } catch (error) {
        console.error('Failed to toggle trigger:', error);
    }
}

async function deleteTrigger(triggerId) {
    if (!currentDetailSite) return;
    
    if (!confirm('Are you sure you want to delete this trigger?')) return;
    
    try {
        await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/${triggerId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        await loadTriggers();
        
    } catch (error) {
        console.error('Failed to delete trigger:', error);
        alert('Failed to delete trigger. Please try again.');
    }
}

async function createDefaultTriggers() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('create-default-triggers');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Creating...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/triggers/defaults`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to create default triggers');
        
        await loadTriggers();
        
    } catch (error) {
        console.error('Failed to create default triggers:', error);
        alert('Failed to create default triggers. Please try again.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function loadTriggerAnalytics() {
    if (!currentDetailSite) return;
    
    try {
        const response = await fetch(`${API_BASE}/analytics/triggers/${currentDetailSite.site_id}?period_days=7`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        renderTriggerAnalytics(data);
        
    } catch (error) {
        console.error('Failed to load trigger analytics:', error);
    }
}

function renderTriggerAnalytics(data) {
    const container = document.getElementById('customize-triggers');
    if (!container) return;
    
    let analyticsCard = container.querySelector('.trigger-analytics-card');
    
    if (data.triggers.length === 0) {
        if (analyticsCard) analyticsCard.remove();
        return;
    }
    
    if (!analyticsCard) {
        analyticsCard = document.createElement('div');
        analyticsCard.className = 'trigger-analytics-card';
        container.appendChild(analyticsCard);
    }
    
    const totalClickRate = data.total_shown > 0 
        ? Math.round((data.total_clicked / data.total_shown) * 100) 
        : 0;
    
    analyticsCard.innerHTML = `
        <div class="trigger-analytics-header">
            <h5>Trigger Performance (Last 7 days)</h5>
        </div>
        <div class="trigger-stats-grid">
            <div class="trigger-stat">
                <span class="trigger-stat-value">${data.total_shown}</span>
                <span class="trigger-stat-label">Shown</span>
            </div>
            <div class="trigger-stat success">
                <span class="trigger-stat-value">${data.total_clicked}</span>
                <span class="trigger-stat-label">Clicked</span>
            </div>
            <div class="trigger-stat">
                <span class="trigger-stat-value">${data.total_converted}</span>
                <span class="trigger-stat-label">Converted</span>
            </div>
            <div class="trigger-stat warning">
                <span class="trigger-stat-value">${totalClickRate}%</span>
                <span class="trigger-stat-label">Click Rate</span>
            </div>
        </div>
        ${data.triggers.length > 0 ? `
            <div style="margin-top: 16px;">
                ${data.triggers.map(t => `
                    <div class="trigger-perf-row">
                        <span class="trigger-perf-name">${escapeHtml(t.trigger_name)}</span>
                        <div class="trigger-perf-bar">
                            <div class="trigger-perf-fill" style="width: ${t.click_rate}%"></div>
                        </div>
                        <span class="trigger-perf-value">${t.click_rate}%</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

// Initialize triggers when triggers tab is clicked
document.addEventListener('DOMContentLoaded', () => {
    setupTriggersEventListeners();
    
    document.querySelectorAll('.customize-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'triggers' && currentDetailSite) {
                loadTriggers();
                loadTriggerAnalytics();
            }
        });
    });
});

