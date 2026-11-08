// Site management: list, create (website/documents/both), upload modal, status polling.
// Extracted from core.js in ROADMAP 4.1 increment 3 (sites CRUD).
async function loadSites() {
    try {
        const response = await fetch(`${API_BASE}/sites`, {
            headers: getAuthHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        sites = await response.json();
        renderSites();
    } catch (error) {
        console.error('Failed to load sites:', error);
    }
}

function renderSites() {
    const sitesList = elements.sitesList || document.getElementById('sites-list');
    if (!sitesList) return;
    
    const existingItems = sitesList.querySelectorAll('.site-list-item');
    existingItems.forEach(item => item.remove());
    
    if (sites.length === 0) {
        currentDetailSite = null;
        if (elements.emptyState) elements.emptyState.style.display = 'flex';
        showDetailEmptyState();
        clearSiteDetailHash();
    } else {
        if (elements.emptyState) elements.emptyState.style.display = 'none';
        sites.forEach(site => {
            const item = createSiteListItem(site);
            sitesList.appendChild(item);
        });
        
        if (!currentDetailSite && sites.length > 0) {
            selectSite(sites[0]);
        }
    }
}

function createSiteListItem(site) {
    const item = document.createElement('div');
    item.className = 'site-list-item';
    item.dataset.siteId = site.site_id;
    
    if (currentDetailSite && currentDetailSite.site_id === site.site_id) {
        item.classList.add('active');
    }
    
    item.onclick = () => selectSite(site);
    
    const domain = site.url.replace(/https?:\/\//, '').replace(/\/$/, '');
    const initial = domain.charAt(0).toUpperCase();
    const statusClass = site.status === 'completed' ? 'completed' : site.status;
    const statusText = site.status === 'completed' ? 'Ready' : site.status.charAt(0).toUpperCase() + site.status.slice(1);
    
    item.innerHTML = `
        <div class="site-list-icon">${initial}</div>
        <div class="site-list-info">
            <div class="site-list-name">${site.name || domain}</div>
            <div class="site-list-url">${domain}</div>
        </div>
        <span class="site-list-status ${statusClass}">${statusText}</span>
    `;
    
    return item;
}

function selectSite(site) {
    document.querySelectorAll('.site-list-item').forEach(item => item.classList.remove('active'));
    const siteItem = document.querySelector(`.site-list-item[data-site-id="${site.site_id}"]`);
    if (siteItem) siteItem.classList.add('active');
    
    openSiteDetails(site);
}

function showDetailEmptyState() {
    const detailContent = elements.detailContent || document.getElementById('detail-content');
    const detailEmpty = elements.detailEmptyState || document.getElementById('detail-empty-state');
    
    if (detailContent) detailContent.style.display = 'none';
    if (detailEmpty) detailEmpty.style.display = 'flex';
}

function showDetailContent() {
    const detailContent = elements.detailContent || document.getElementById('detail-content');
    const detailEmpty = elements.detailEmptyState || document.getElementById('detail-empty-state');
    
    if (detailContent) detailContent.style.display = 'flex';
    if (detailEmpty) detailEmpty.style.display = 'none';
}

function createSiteCard(site) {
    const card = document.createElement('div');
    card.className = 'site-card';
    card.dataset.siteId = site.site_id;
    card.onclick = () => {
        // Remove active class from all cards
        document.querySelectorAll('.site-card').forEach(c => c.classList.remove('active'));
        // Add active class to clicked card
        card.classList.add('active');
        openSiteDetails(site);
    };
    
    const domain = site.url.replace(/https?:\/\//, '').replace(/\/$/, '');
    const initial = domain.charAt(0).toUpperCase();
    const statusClass = site.status === 'completed' ? 'ready' : site.status;
    const statusText = site.status === 'completed' ? 'Ready' : site.status.charAt(0).toUpperCase() + site.status.slice(1);
    
    card.innerHTML = `
        <div class="site-card-header">
            <div class="site-info">
                <div class="site-favicon">${initial}</div>
                <div>
                    <div class="site-name">${site.name || domain}</div>
                    <div class="site-url">${domain}</div>
                </div>
            </div>
            <span class="status-badge ${statusClass}">
                <span class="dot"></span>
                ${statusText}
            </span>
        </div>
        ${site.status === 'failed' && site.error ? `
            <div class="site-card-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>${site.error}</span>
            </div>
        ` : `
            <div class="site-card-stats">
                <div class="site-stat">
                    <span class="site-stat-value">${site.pages_crawled || 0}</span>
                    <span class="site-stat-label">Pages</span>
                </div>
                <div class="site-stat">
                    <span class="site-stat-value">${site.pages_indexed || 0}</span>
                    <span class="site-stat-label">Indexed</span>
                </div>
            </div>
        `}
    `;
    
    return card;
}

function openAddSiteModal() {
    elements.addSiteModal.classList.add('active');
    showSourceTypeStep();
}

function closeAddSiteModal() {
    elements.addSiteModal.classList.remove('active');
    resetModalState();
}

function resetModalState() {
    currentSourceType = null;
    selectedFiles = [];
    selectedFilesBoth = [];
    
    // Reset forms
    document.getElementById('website-form')?.reset();
    document.getElementById('documents-form')?.reset();
    document.getElementById('both-form')?.reset();
    
    // Clear file lists
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('file-list-both').innerHTML = '';
    
    // Reset submit buttons
    document.getElementById('submit-documents').disabled = true;
    
    // Reset source type selection
    document.querySelectorAll('.source-type-card').forEach(c => c.classList.remove('selected'));
    
    // Show first step
    showSourceTypeStep();
}

function showSourceTypeStep() {
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-source-type').classList.add('active');
    document.getElementById('modal-title').textContent = 'Add Knowledge Source';
}

function handleSourceTypeSelect(type) {
    currentSourceType = type;
    
    // Update visual selection
    document.querySelectorAll('.source-type-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');
    
    // Show appropriate step
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    
    if (type === 'website') {
        document.getElementById('step-website').classList.add('active');
        document.getElementById('modal-title').textContent = 'Crawl Website';
        document.getElementById('site-url').focus();
    } else if (type === 'documents') {
        document.getElementById('step-documents').classList.add('active');
        document.getElementById('modal-title').textContent = 'Upload Documents';
        document.getElementById('doc-site-name').focus();
    } else if (type === 'both') {
        document.getElementById('step-both').classList.add('active');
        document.getElementById('modal-title').textContent = 'Website + Documents';
        document.getElementById('both-site-url').focus();
    }
}

function switchFormTab(tabId) {
    document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// File upload zone setup
function setupUploadZone(zoneId, inputId, listId, filesVar) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    
    if (!zone || !input) return;
    
    // Click to open file picker
    zone.addEventListener('click', () => input.click());
    
    // Drag and drop events
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files, filesVar, listId);
    });
    
    // File input change
    input.addEventListener('change', () => {
        handleFiles(input.files, filesVar, listId);
        input.value = '';
    });
}

function handleFiles(fileList, filesVar, listId) {
    const files = Array.from(fileList);
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.csv', '.pptx', '.xlsx', '.html', '.htm'];
    
    files.forEach(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(ext)) {
            alert(`${file.name} is not a supported file type.`);
            return;
        }
        
        if (file.size > 50 * 1024 * 1024) {
            alert(`${file.name} is too large (max 50MB).`);
            return;
        }
        
        // Add to appropriate array
        if (filesVar === 'selectedFiles') {
            selectedFiles.push(file);
        } else if (filesVar === 'selectedFilesBoth') {
            selectedFilesBoth.push(file);
        } else if (filesVar === 'selectedFilesExisting') {
            selectedFilesExisting.push(file);
        }
    });
    
    // Update file list display
    renderFileList(filesVar, listId);
    
    // Update submit button state
    updateDocumentSubmitButton();
}

function renderFileList(filesVar, listId) {
    const list = document.getElementById(listId);
    let files;
    
    if (filesVar === 'selectedFiles') files = selectedFiles;
    else if (filesVar === 'selectedFilesBoth') files = selectedFilesBoth;
    else if (filesVar === 'selectedFilesExisting') files = selectedFilesExisting;
    
    list.innerHTML = files.map((file, idx) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const iconClass = getFileIconClass(ext);
        const size = formatFileSize(file.size);
        
        return `
            <div class="file-item" data-index="${idx}">
                <div class="file-icon ${iconClass}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${size}</div>
                </div>
                <button type="button" class="file-remove" onclick="removeFile('${filesVar}', ${idx}, '${listId}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

function removeFile(filesVar, index, listId) {
    if (filesVar === 'selectedFiles') {
        selectedFiles.splice(index, 1);
    } else if (filesVar === 'selectedFilesBoth') {
        selectedFilesBoth.splice(index, 1);
    } else if (filesVar === 'selectedFilesExisting') {
        selectedFilesExisting.splice(index, 1);
    }
    renderFileList(filesVar, listId);
    updateDocumentSubmitButton();
}

window.removeFile = removeFile;

function getFileIconClass(ext) {
    const iconMap = {
        'pdf': 'pdf',
        'docx': 'doc', 'doc': 'doc',
        'txt': 'txt', 'md': 'txt',
        'csv': 'csv',
        'pptx': 'ppt', 'ppt': 'ppt',
        'xlsx': 'xls', 'xls': 'xls',
        'html': 'txt', 'htm': 'txt'
    };
    return iconMap[ext] || 'default';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateDocumentSubmitButton() {
    const submitDocs = document.getElementById('submit-documents');
    const submitUpload = document.getElementById('submit-upload');
    
    if (submitDocs) {
        submitDocs.disabled = selectedFiles.length === 0;
    }
    if (submitUpload) {
        submitUpload.disabled = selectedFilesExisting.length === 0;
    }
}

// Form submission handlers
async function handleWebsiteSubmit(e) {
    e.preventDefault();
    
    const url = document.getElementById('site-url').value;
    const name = document.getElementById('site-name').value;
    const maxPages = parseInt(document.getElementById('max-pages').value) || 50;
    
    const submitBtn = document.getElementById('submit-website');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        const setupResponse = await fetch(`${API_BASE}/embed/setup`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url, name, max_pages: maxPages })
        });
        
        if (setupResponse.status === 401) {
            logout();
            return;
        }
        
        if (!setupResponse.ok) {
            const err = await setupResponse.json();
            throw new Error(err.detail || 'Failed to setup site');
        }
        
        const setupData = await setupResponse.json();
        
        closeAddSiteModal();
        await loadSites();
        pollSiteStatus(setupData.site_id);
        
    } catch (error) {
        console.error('Failed to add site:', error);
        alert(error.message || 'Failed to add site. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function handleDocumentsSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('doc-site-name').value;
    
    if (selectedFiles.length === 0) {
        alert('Please select at least one file to upload.');
        return;
    }
    
    const submitBtn = document.getElementById('submit-documents');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // First create the site
        const siteId = generateSiteId(name);
        const token = localStorage.getItem('token');
        
        // Create site entry
        const setupResponse = await fetch(`${API_BASE}/embed/setup`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                url: `docs://${siteId}`,
                name: name 
            })
        });
        
        if (!setupResponse.ok) {
            throw new Error('Failed to create knowledge base');
        }
        
        const setupData = await setupResponse.json();
        
        // Upload documents
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('files', file));
        
        const uploadResponse = await fetch(`${API_BASE}/documents/upload/${setupData.site_id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload documents');
        }
        
        const uploadResult = await uploadResponse.json();
        
        closeAddSiteModal();
        await loadSites();
        alert(`Successfully uploaded ${uploadResult.total_uploaded} documents!`);
        
    } catch (error) {
        console.error('Failed to upload documents:', error);
        alert(error.message || 'Failed to upload documents. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function handleBothSubmit(e) {
    e.preventDefault();
    
    const url = document.getElementById('both-site-url').value;
    const name = document.getElementById('both-site-name').value;
    const maxPages = parseInt(document.getElementById('both-max-pages').value) || 50;
    
    const submitBtn = document.getElementById('submit-both');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Setup site and crawl with max_pages
        const setupResponse = await fetch(`${API_BASE}/embed/setup`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url, name, max_pages: maxPages })
        });
        
        if (!setupResponse.ok) {
            throw new Error('Failed to setup site');
        }
        
        const setupData = await setupResponse.json();
        
        // Upload documents if any
        if (selectedFilesBoth.length > 0) {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            selectedFilesBoth.forEach(file => formData.append('files', file));
            
            await fetch(`${API_BASE}/documents/upload/${setupData.site_id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
        }
        
        closeAddSiteModal();
        await loadSites();
        pollSiteStatus(setupData.site_id);
        
    } catch (error) {
        console.error('Failed to create chatbot:', error);
        alert(error.message || 'Failed to create chatbot. Please try again.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function generateSiteId(name) {
    const hash = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `${hash.substring(0, 6)}${random}`;
}

// Upload modal for existing sites
function openUploadModal() {
    selectedFilesExisting = [];
    document.getElementById('file-list-existing').innerHTML = '';
    document.getElementById('submit-upload').disabled = true;
    elements.uploadModal.classList.add('active');
}

function closeUploadModal() {
    elements.uploadModal.classList.remove('active');
    selectedFilesExisting = [];
}

async function handleExistingUpload(e) {
    e.preventDefault();
    
    if (!currentDetailSite || selectedFilesExisting.length === 0) return;
    
    const submitBtn = document.getElementById('submit-upload');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        selectedFilesExisting.forEach(file => formData.append('files', file));
        
        const response = await fetch(`${API_BASE}/documents/upload/${currentDetailSite.site_id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to upload documents');
        }
        
        const result = await response.json();
        
        closeUploadModal();
        await loadSiteDocuments(currentDetailSite.site_id);
        alert(`Successfully uploaded ${result.total_uploaded} documents!`);
        
    } catch (error) {
        console.error('Failed to upload:', error);
        alert(error.message || 'Failed to upload documents.');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function pollSiteStatus(siteId) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/embed/status/${siteId}`);
            const data = await response.json();
            
            if (data.status === 'completed' || data.status === 'failed') {
                clearInterval(interval);
            }
            
            await loadSites();
        } catch (error) {
            console.error('Failed to poll status:', error);
        }
    }, 3000);
}

let currentDetailSite = null;

const VALID_DETAIL_TABS = [
    'appearance', 'embed', 'behavior', 'quick-prompts', 'triggers', 'training',
    'handoff', 'leads', 'security', 'crawling'
];

const DETAIL_TAB_LABELS = {
    appearance: 'Appearance',
    embed: 'Embed',
    behavior: 'Behavior',
    'quick-prompts': 'Quick Prompts',
    triggers: 'Triggers',
    training: 'Training',
    handoff: 'Handoff',
    leads: 'Leads',
    security: 'Security',
    crawling: 'Crawling'
};

const SIDEBAR_COLLAPSED_KEY = 'sitechat-sidebar-collapsed';
