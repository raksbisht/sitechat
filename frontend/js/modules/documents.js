// Document management for the selected site: list, delete, embed copy, recrawl, delete site.
// Extracted from core.js in ROADMAP 4.1 increment 3.
async function loadSiteDocuments(siteId) {
    try {
        const response = await fetch(`${API_BASE}/documents/${siteId}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        renderSiteDocuments(data.documents);
        return data.documents || [];
    } catch (error) {
        console.error('Failed to load documents:', error);
        return [];
    }
}

function renderSiteDocuments(documents) {
    const list = elements.documentsList;
    if (!list) return;
    
    if (!documents || documents.length === 0) {
        list.innerHTML = `
            <div class="empty-docs">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>No documents yet</p>
                <span>Upload PDFs, docs, and more</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = documents.map(doc => {
        const ext = doc.file_type.replace('.', '');
        const iconClass = getFileIconClass(ext);
        const statusIcon = doc.status === 'indexed' 
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
            : (doc.status === 'error' 
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3"><circle cx="12" cy="12" r="1"/></svg>');
        
        return `
            <div class="doc-item">
                <div class="file-icon ${iconClass}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${doc.filename}</div>
                    <div class="file-meta">${doc.word_count?.toLocaleString() || 0} words · ${doc.chunks || 0} chunks</div>
                </div>
                <span class="doc-status">${statusIcon}</span>
                <button type="button" class="doc-delete" onclick="deleteDocument('${doc.id}')" title="Delete document">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

async function deleteDocument(docId) {
    if (!currentDetailSite) return;
    
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/documents/${currentDetailSite.site_id}/${docId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            await loadSiteDocuments(currentDetailSite.site_id);
        } else {
            alert('Failed to delete document');
        }
    } catch (error) {
        console.error('Failed to delete document:', error);
    }
}

window.deleteDocument = deleteDocument;

function closeDetailsModal() {
    closeSidePanel();
}

async function copyDetailEmbed() {
    const code = document.getElementById('detail-embed-code').textContent;
    try {
        await navigator.clipboard.writeText(code);
        const btn = document.getElementById('copy-detail-embed');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied!';
        setTimeout(() => btn.innerHTML = originalHTML, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

async function recrawlSite() {
    if (!currentDetailSite) return;
    
    const btn = document.getElementById('recrawl-site');
    btn.disabled = true;
    btn.textContent = 'Crawling...';
    
    try {
        await fetch(`${API_BASE}/crawl`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url: currentDetailSite.url, max_pages: 50 })
        });
        
        closeDetailsModal();
        await loadSites();
        pollSiteStatus(currentDetailSite.site_id);
    } catch (error) {
        console.error('Failed to recrawl:', error);
        alert('Failed to start crawl. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>Re-crawl';
    }
}

async function deleteSite() {
    if (!currentDetailSite) return;
    
    if (!confirm(`Are you sure you want to delete "${currentDetailSite.name || currentDetailSite.url}"?`)) {
        return;
    }
    
    try {
        await fetch(`${API_BASE}/sites/${currentDetailSite.site_id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        closeDetailsModal();
        await loadSites();
    } catch (error) {
        console.error('Failed to delete:', error);
        alert('Failed to delete site. Please try again.');
    }
}
