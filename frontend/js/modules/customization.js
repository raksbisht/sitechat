// ==================== Customization Panel ====================

let currentSiteConfig = null;

function setupCustomizeTabs() {
    const tabsContainer = document.querySelector('.customize-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.customize-tab');
            if (!tab) return;
            
            document.querySelectorAll('.customize-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.customize-content').forEach(c => c.classList.add('hidden'));
            const contentEl = document.getElementById(`customize-${tabId}`);
            if (contentEl) {
                contentEl.classList.remove('hidden');
            }
        });
    }
    
    // Color input sync with live preview
    const colorInput = document.getElementById('config-color');
    const colorTextInput = document.getElementById('config-color-text');
    
    if (colorInput && colorTextInput) {
        colorInput.addEventListener('input', () => {
            colorTextInput.value = colorInput.value.toUpperCase();
            updateWidgetPreview();
        });
        
        colorTextInput.addEventListener('input', () => {
            const value = colorTextInput.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                colorInput.value = value;
                updateWidgetPreview();
            }
        });
    }
    
    // Title input with live preview
    const titleInput = document.getElementById('config-title');
    if (titleInput) {
        titleInput.addEventListener('input', updateWidgetPreview);
    }
    
    // Welcome message with live preview
    const welcomeInput = document.getElementById('config-welcome');
    if (welcomeInput) {
        welcomeInput.addEventListener('input', updateWidgetPreview);
    }
    
    // White-label fields with live preview
    const hideBrandingCheckbox = document.getElementById('config-hide-branding');
    if (hideBrandingCheckbox) {
        hideBrandingCheckbox.addEventListener('change', updateWidgetPreview);
    }
    
    const customBrandingInput = document.getElementById('config-custom-branding');
    if (customBrandingInput) {
        customBrandingInput.addEventListener('input', updateWidgetPreview);
    }
    
    const customBrandingUrlInput = document.getElementById('config-custom-branding-url');
    if (customBrandingUrlInput) {
        customBrandingUrlInput.addEventListener('input', updateWidgetPreview);
    }
    
    // Temperature slider
    const tempSlider = document.getElementById('config-temperature');
    const tempValue = document.getElementById('temp-value');
    
    if (tempSlider && tempValue) {
        tempSlider.addEventListener('input', () => {
            tempValue.textContent = tempSlider.value;
        });
    }
    
    // Save and Reset buttons
    document.getElementById('save-config')?.addEventListener('click', saveConfig);
    document.getElementById('reset-config')?.addEventListener('click', resetConfig);
    
    // Appearance embed copy button
    document.getElementById('copy-appearance-embed')?.addEventListener('click', copyAppearanceEmbed);
}

function updateWidgetPreview() {
    const color = document.getElementById('config-color')?.value || '#0D9488';
    const title = document.getElementById('config-title')?.value || 'Chat with us';
    const welcome = document.getElementById('config-welcome')?.value || 'Hi! How can I help you today?';
    
    // Helper function to adjust color brightness
    function adjustColor(hex, amount) {
        let c = hex.replace('#', '');
        let num = parseInt(c, 16);
        let r = Math.min(255, Math.max(0, (num >> 16) + amount));
        let g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        let b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    
    const darkColor = adjustColor(color, -20);
    
    // Update preview header
    const previewHeader = document.getElementById('preview-header');
    if (previewHeader) {
        previewHeader.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update preview title
    const previewTitle = document.getElementById('preview-title');
    if (previewTitle) {
        previewTitle.textContent = title;
    }
    
    // Update preview welcome message
    const previewWelcome = document.getElementById('preview-welcome');
    if (previewWelcome) {
        previewWelcome.textContent = welcome;
    }
    
    // Update preview avatar
    const previewAvatar = document.getElementById('preview-avatar');
    if (previewAvatar) {
        previewAvatar.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update preview send button
    const previewSend = document.getElementById('preview-send');
    if (previewSend) {
        previewSend.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update preview branding
    const previewBranding = document.getElementById('preview-branding');
    if (previewBranding) {
        const whiteLabelEnabled = document.getElementById('config-hide-branding')?.checked;
        const customBrandingText = document.getElementById('config-custom-branding')?.value?.trim();
        const customBrandingUrl = document.getElementById('config-custom-branding-url')?.value;
        const link = previewBranding.querySelector('a');
        
        // Toggle white-label fields visibility
        document.querySelectorAll('.whitelabel-fields').forEach(el => {
            el.style.display = whiteLabelEnabled ? 'block' : 'none';
        });
        
        if (whiteLabelEnabled) {
            if (customBrandingText) {
                // Show custom branding
                previewBranding.classList.remove('hidden');
                if (link) {
                    link.innerHTML = customBrandingText;
                    link.href = customBrandingUrl || '#';
                }
            } else {
                // White-label enabled but no text - hide completely
                previewBranding.classList.add('hidden');
            }
        } else {
            // White-label disabled - show default SiteChat branding
            previewBranding.classList.remove('hidden');
            if (link) {
                link.innerHTML = 'Powered by <strong>SiteChat</strong>';
                link.href = window.location.origin;
            }
        }
    }
    
    // Update appearance preview (mini preview in appearance tab)
    updateAppearancePreview(color, darkColor, title, welcome);
}

function updateAppearancePreview(color, darkColor, title, welcome) {
    // Update appearance preview header
    const appearancePreviewHeader = document.getElementById('appearance-preview-header');
    if (appearancePreviewHeader) {
        appearancePreviewHeader.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update appearance preview title
    const appearancePreviewTitle = document.getElementById('appearance-preview-title');
    if (appearancePreviewTitle) {
        appearancePreviewTitle.textContent = title;
    }
    
    // Update appearance preview welcome message
    const appearancePreviewWelcome = document.getElementById('appearance-preview-welcome');
    if (appearancePreviewWelcome) {
        appearancePreviewWelcome.textContent = welcome;
    }
    
    // Update appearance preview avatar
    const appearancePreviewAvatar = document.getElementById('appearance-preview-avatar');
    if (appearancePreviewAvatar) {
        appearancePreviewAvatar.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update appearance preview send button
    const appearancePreviewSend = document.getElementById('appearance-preview-send');
    if (appearancePreviewSend) {
        appearancePreviewSend.style.background = `linear-gradient(135deg, ${color}, ${darkColor})`;
    }
    
    // Update appearance preview branding
    const appearancePreviewBranding = document.getElementById('appearance-preview-branding');
    if (appearancePreviewBranding) {
        const whiteLabelEnabled = document.getElementById('config-hide-branding')?.checked;
        const customBrandingText = document.getElementById('config-custom-branding')?.value?.trim();
        const customBrandingUrl = document.getElementById('config-custom-branding-url')?.value;
        const link = appearancePreviewBranding.querySelector('a');
        
        if (whiteLabelEnabled) {
            if (customBrandingText) {
                appearancePreviewBranding.classList.remove('hidden');
                if (link) {
                    link.innerHTML = customBrandingText;
                    link.href = customBrandingUrl || '#';
                }
            } else {
                appearancePreviewBranding.classList.add('hidden');
            }
        } else {
            appearancePreviewBranding.classList.remove('hidden');
            if (link) {
                link.innerHTML = 'Powered by <strong>SiteChat</strong>';
                link.href = window.location.origin;
            }
        }
    }
}

function updateAppearanceEmbedCode() {
    if (!currentDetailSite) return;
    
    const embedCodeEl = document.getElementById('appearance-embed-code');
    if (!embedCodeEl) return;
    
    const baseUrl = window.location.origin;
    const embedCode = `<script>
(function() {
  var s = document.createElement('script');
  s.src = '${baseUrl}/widget/chatbot.js';
  s.async = true;
  s.dataset.siteId = '${currentDetailSite.site_id}';
  s.dataset.apiUrl = '${baseUrl}';
  document.head.appendChild(s);
})();
<\/script>`;
    
    embedCodeEl.textContent = embedCode;
}

async function copyAppearanceEmbed() {
    const embedCodeEl = document.getElementById('appearance-embed-code');
    const copyBtn = document.getElementById('copy-appearance-embed');
    
    if (!embedCodeEl) return;
    
    try {
        await navigator.clipboard.writeText(embedCodeEl.textContent);
        
        const originalHTML = copyBtn.innerHTML;
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
        `;
        
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = originalHTML;
        }, 2000);
    } catch (error) {
        console.error('Failed to copy embed code:', error);
    }
}

async function loadSiteConfig(siteId) {
    try {
        const response = await fetch(`${API_BASE}/sites/${siteId}/config`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            currentSiteConfig = getDefaultConfig();
        } else {
            currentSiteConfig = await response.json();
        }
        
        populateConfigForm(currentSiteConfig);
        updateWidgetPreview();
    } catch (error) {
        console.error('Failed to load site config:', error);
        currentSiteConfig = getDefaultConfig();
        populateConfigForm(currentSiteConfig);
        updateWidgetPreview();
    }
}

function getDefaultConfig() {
    return {
        appearance: {
            primary_color: '#0D9488',
            chat_title: 'Chat with us',
            welcome_message: 'Hi! How can I help you today?',
            bot_avatar_url: null,
            position: 'bottom-right'
        },
        behavior: {
            system_prompt: 'You are a helpful assistant. Answer questions based on the provided context.',
            temperature: 0.7,
            max_tokens: 500,
            show_sources: true
        },
        lead_capture: {
            collect_email: false,
            email_required: false,
            email_prompt: 'Enter your email to continue'
        }
    };
}

function populateConfigForm(config) {
    const appearance = config.appearance || {};
    const behavior = config.behavior || {};
    
    // Appearance
    const colorInput = document.getElementById('config-color');
    const colorTextInput = document.getElementById('config-color-text');
    if (colorInput) colorInput.value = appearance.primary_color || '#0D9488';
    if (colorTextInput) colorTextInput.value = (appearance.primary_color || '#0D9488').toUpperCase();
    
    const titleInput = document.getElementById('config-title');
    if (titleInput) titleInput.value = appearance.chat_title || 'Chat with us';
    
    const welcomeInput = document.getElementById('config-welcome');
    if (welcomeInput) welcomeInput.value = appearance.welcome_message || 'Hi! How can I help you today?';
    
    const positionSelect = document.getElementById('config-position');
    if (positionSelect) positionSelect.value = appearance.position || 'bottom-right';
    
    // White-label options
    const hideBrandingCheckbox = document.getElementById('config-hide-branding');
    const whiteLabelEnabled = appearance.hide_branding === true;
    if (hideBrandingCheckbox) hideBrandingCheckbox.checked = whiteLabelEnabled;
    
    const customBrandingInput = document.getElementById('config-custom-branding');
    if (customBrandingInput) customBrandingInput.value = appearance.custom_branding_text || '';
    
    const customBrandingUrlInput = document.getElementById('config-custom-branding-url');
    if (customBrandingUrlInput) customBrandingUrlInput.value = appearance.custom_branding_url || '';
    
    // Show/hide white-label fields based on checkbox
    document.querySelectorAll('.whitelabel-fields').forEach(el => {
        el.style.display = whiteLabelEnabled ? 'block' : 'none';
    });
    
    // Behavior
    const promptInput = document.getElementById('config-prompt');
    if (promptInput) promptInput.value = behavior.system_prompt || '';
    
    const tempSlider = document.getElementById('config-temperature');
    const tempValue = document.getElementById('temp-value');
    if (tempSlider) tempSlider.value = behavior.temperature || 0.7;
    if (tempValue) tempValue.textContent = behavior.temperature || 0.7;
    
    const maxTokensInput = document.getElementById('config-max-tokens');
    if (maxTokensInput) maxTokensInput.value = behavior.max_tokens || 500;
    
    const showSourcesCheckbox = document.getElementById('config-show-sources');
    if (showSourcesCheckbox) showSourcesCheckbox.checked = behavior.show_sources !== false;
}

function getConfigFromForm() {
    return {
        appearance: {
            primary_color: document.getElementById('config-color')?.value || '#0D9488',
            chat_title: document.getElementById('config-title')?.value || 'Chat with us',
            welcome_message: document.getElementById('config-welcome')?.value || 'Hi! How can I help you today?',
            bot_avatar_url: null,
            position: document.getElementById('config-position')?.value || 'bottom-right',
            hide_branding: document.getElementById('config-hide-branding')?.checked || false,
            custom_branding_text: document.getElementById('config-custom-branding')?.value || null,
            custom_branding_url: document.getElementById('config-custom-branding-url')?.value || null
        },
        behavior: {
            system_prompt: document.getElementById('config-prompt')?.value || '',
            temperature: parseFloat(document.getElementById('config-temperature')?.value) || 0.7,
            max_tokens: parseInt(document.getElementById('config-max-tokens')?.value) || 500,
            show_sources: document.getElementById('config-show-sources')?.checked ?? true
        }
    };
}

async function saveConfig() {
    if (!currentDetailSite) return;
    
    const saveBtn = document.getElementById('save-config');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        const config = getConfigFromForm();
        
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            currentSiteConfig = await response.json();
            saveBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }, 1500);
        } else {
            throw new Error('Failed to save');
        }
    } catch (error) {
        console.error('Failed to save config:', error);
        alert('Failed to save configuration. Please try again.');
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

async function resetConfig() {
    if (!currentDetailSite) return;
    
    if (!confirm('Are you sure you want to reset the configuration to defaults?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}/config/reset`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            currentSiteConfig = await response.json();
            populateConfigForm(currentSiteConfig);
        } else {
            throw new Error('Failed to reset');
        }
    } catch (error) {
        console.error('Failed to reset config:', error);
        alert('Failed to reset configuration. Please try again.');
    }
}
