// ==================== Security Settings ====================

let securityAllowedDomains = [];

function initSecuritySettings() {
    const addDomainBtn = document.getElementById('security-add-domain');
    const domainInput = document.getElementById('security-new-domain');
    const saveBtn = document.getElementById('save-security-config');
    const copyBtn = document.getElementById('copy-secure-embed');
    const rateLimitSlider = document.getElementById('security-rate-limit');
    const rateLimitValue = document.getElementById('security-rate-limit-value');
    
    if (addDomainBtn && domainInput) {
        addDomainBtn.addEventListener('click', () => addDomain());
        domainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addDomain();
            }
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSecurityConfig);
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', copySecureEmbedCode);
    }
    
    if (rateLimitSlider && rateLimitValue) {
        rateLimitSlider.addEventListener('input', () => {
            rateLimitValue.textContent = rateLimitSlider.value;
        });
    }
    
    document.querySelectorAll('.customize-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'security' && currentDetailSite) {
                loadSecurityConfig();
            }
        });
    });
}

function addDomain() {
    const input = document.getElementById('security-new-domain');
    const domain = input.value.trim().toLowerCase();
    
    if (!domain) return;
    
    const domainPattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    const localhostPattern = /^localhost(:\d+)?$/;
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/;
    
    if (!domainPattern.test(domain) && !localhostPattern.test(domain) && !ipPattern.test(domain)) {
        alert('Please enter a valid domain (e.g., example.com or *.example.com)');
        return;
    }
    
    if (securityAllowedDomains.includes(domain)) {
        alert('Domain already added');
        return;
    }
    
    securityAllowedDomains.push(domain);
    input.value = '';
    renderDomainList();
}

function removeDomain(domain) {
    securityAllowedDomains = securityAllowedDomains.filter(d => d !== domain);
    renderDomainList();
}

function renderDomainList() {
    const container = document.getElementById('security-domain-list');
    if (!container) return;
    
    container.innerHTML = securityAllowedDomains.map(domain => `
        <span class="domain-tag">
            ${escapeHtml(domain)}
            <button type="button" class="remove-domain" onclick="removeDomain('${domain}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </span>
    `).join('');
}

async function loadSecurityConfig() {
    if (!currentDetailSite) return;
    
    // Initialize handlers for dynamically generated content
    initSecurityTabHandlers();
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return;
        
        const site = await response.json();
        const security = site.config?.security || {};
        
        const enforceEl = document.getElementById('security-enforce-domain');
        const referrerEl = document.getElementById('security-require-referrer');
        const rateLimitEl = document.getElementById('security-rate-limit');
        const rateLimitValue = document.getElementById('security-rate-limit-value');
        
        if (enforceEl) enforceEl.checked = security.enforce_domain_validation === true;
        if (referrerEl) referrerEl.checked = security.require_referrer === true;
        if (rateLimitEl) {
            rateLimitEl.value = security.rate_limit_per_session || 60;
            if (rateLimitValue) rateLimitValue.textContent = rateLimitEl.value;
        }
        
        securityAllowedDomains = security.allowed_domains || [];
        renderDomainList();
        
    } catch (error) {
        console.error('Failed to load security config:', error);
    }
    
    // Always load embed code (doesn't require auth)
    loadSecureEmbedCode();
}

function initSecurityTabHandlers() {
    const addDomainBtn = document.getElementById('security-add-domain');
    const domainInput = document.getElementById('security-new-domain');
    const saveBtn = document.getElementById('save-security-config');
    const copyBtn = document.getElementById('copy-secure-embed');
    const rateLimitSlider = document.getElementById('security-rate-limit');
    const rateLimitValue = document.getElementById('security-rate-limit-value');
    
    if (addDomainBtn && domainInput) {
        addDomainBtn.onclick = () => addDomain();
        domainInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addDomain();
            }
        };
    }
    
    if (saveBtn) {
        saveBtn.onclick = saveSecurityConfig;
    }
    
    if (copyBtn) {
        copyBtn.onclick = copySecureEmbedCode;
    }
    
    if (rateLimitSlider && rateLimitValue) {
        rateLimitSlider.oninput = () => {
            rateLimitValue.textContent = rateLimitSlider.value;
        };
    }
}

async function loadSecureEmbedCode() {
    if (!currentDetailSite) return;
    
    const embedCodeEl = document.getElementById('security-embed-code');
    const sriHashEl = document.getElementById('security-sri-hash');
    
    // Attach copy button handler for embed tab
    const copyBtn = document.getElementById('copy-detail-embed');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyDetailEmbed);
    }
    
    try {
        const response = await fetch(`${API_BASE}/embed/security/${currentDetailSite.site_id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to load security info');
        
        const info = await response.json();
        
        if (sriHashEl) {
            sriHashEl.textContent = info.sri_hash || 'Not available';
        }
        
        if (embedCodeEl) {
            const embedCode = `<script>
(function() {
    var s = document.createElement('script');
    s.src = '${info.widget_url || `${API_BASE.replace('/api', '')}/widget/chatbot.js`}';
    s.async = true;${info.sri_hash ? `
    s.integrity = '${info.sri_hash}';
    s.crossOrigin = 'anonymous';` : ''}
    s.dataset.siteId = '${currentDetailSite.site_id}';
    s.dataset.apiUrl = '${API_BASE.replace('/api', '')}';
    document.head.appendChild(s);
})();
<\/script>`;
            embedCodeEl.textContent = embedCode;
        }
        
    } catch (error) {
        console.error('Failed to load secure embed code:', error);
        if (embedCodeEl) embedCodeEl.textContent = 'Failed to load embed code';
        if (sriHashEl) sriHashEl.textContent = 'Not available';
    }
}

async function copySecureEmbedCode() {
    const embedCodeEl = document.getElementById('security-embed-code');
    const copyBtn = document.getElementById('copy-secure-embed');
    
    if (!embedCodeEl) return;
    
    try {
        await navigator.clipboard.writeText(embedCodeEl.textContent);
        
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

async function saveSecurityConfig() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('save-security-config');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        const securityConfig = {
            enforce_domain_validation: document.getElementById('security-enforce-domain')?.checked || false,
            allowed_domains: securityAllowedDomains,
            require_referrer: document.getElementById('security-require-referrer')?.checked || false,
            rate_limit_per_session: parseInt(document.getElementById('security-rate-limit')?.value || 60)
        };
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ security: securityConfig })
        });
        
        if (!response.ok) throw new Error('Failed to save config');
        
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to save security config:', error);
        alert('Failed to save settings. Please try again.');
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initSecuritySettings();
});
