// ==================== White-label Settings ====================

let whiteLabelConfig = null;

async function loadWhiteLabelConfig() {
    try {
        const response = await fetch(`${API_BASE}/platform/whitelabel`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load white-label config');
        
        whiteLabelConfig = await response.json();
        populateWhiteLabelForm(whiteLabelConfig);
        applyWhiteLabelBranding(whiteLabelConfig);
        
    } catch (error) {
        console.error('Failed to load white-label config:', error);
    }
}

function populateWhiteLabelForm(config) {
    const fields = {
        'wl-app-name': config.app_name || 'SiteChat',
        'wl-primary-color': config.primary_color || '#0D9488',
        'wl-primary-color-text': config.primary_color || '#0D9488',
        'wl-logo-url': config.logo_url || '',
    };

    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
}

function applyWhiteLabelBranding(config) {
    if (!config) return;
    
    if (config.app_name && config.app_name !== 'SiteChat') {
        document.title = config.app_name;
        const brandName = document.querySelector('.brand-name');
        if (brandName) brandName.textContent = config.app_name;
    }
    
    if (config.primary_color) {
        document.documentElement.style.setProperty('--primary', config.primary_color);
    }
    
    if (config.logo_url) {
        const brandIcon = document.querySelector('.brand-icon');
        if (brandIcon) {
            brandIcon.innerHTML = `<img src="${config.logo_url}" alt="Logo" style="width: 24px; height: 24px; object-fit: contain;">`;
        }
    }
    
    if (config.favicon_url) {
        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'icon';
            document.head.appendChild(favicon);
        }
        favicon.href = config.favicon_url;
    }
}

async function saveWhiteLabelConfig() {
    const btn = document.getElementById('wl-save-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const config = {
            app_name: document.getElementById('wl-app-name')?.value || 'SiteChat',
            primary_color: document.getElementById('wl-primary-color')?.value || '#0D9488',
            logo_url: document.getElementById('wl-logo-url')?.value || null,
        };
        
        const response = await fetch(`${API_BASE}/platform/whitelabel`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (!response.ok) throw new Error('Failed to save config');
        
        whiteLabelConfig = await response.json();
        applyWhiteLabelBranding(whiteLabelConfig);
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save white-label config:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

async function resetWhiteLabelConfig() {
    if (!confirm('Reset all white-label settings to defaults?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/platform/whitelabel/reset`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to reset config');
        
        whiteLabelConfig = await response.json();
        populateWhiteLabelForm(whiteLabelConfig);
        applyWhiteLabelBranding(whiteLabelConfig);
        
        alert('Settings reset to defaults.');
        
    } catch (error) {
        console.error('Failed to reset white-label config:', error);
        alert('Failed to reset settings. Please try again.');
    }
}

function setupWhiteLabelListeners() {
    const form = document.getElementById('whitelabel-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveWhiteLabelConfig();
        });
    }
    
    const resetBtn = document.getElementById('wl-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetWhiteLabelConfig);
    }
    
    const colorInput = document.getElementById('wl-primary-color');
    const colorText = document.getElementById('wl-primary-color-text');
    
    if (colorInput && colorText) {
        colorInput.addEventListener('input', () => {
            colorText.value = colorInput.value;
        });
        
        colorText.addEventListener('input', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(colorText.value)) {
                colorInput.value = colorText.value;
            }
        });
    }
}

function initWhiteLabelSettings() {
    setupWhiteLabelListeners();
    loadWhiteLabelConfig();
}
