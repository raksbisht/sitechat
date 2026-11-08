// ==================== Settings Panels ====================

let settingsPanelsInit = false;
function initSettingsPanels() {
    if (settingsPanelsInit) return;
    settingsPanelsInit = true;
    document.querySelectorAll('.settings-nav-item[data-panel]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`settings-panel-${item.dataset.panel}`);
            if (panel) panel.classList.add('active');
        });
    });
}

// ==================== Profile Settings ====================

let profileListenerBound = false;
function initProfileSettings() {
    const form = document.getElementById('profile-form');
    if (!form || profileListenerBound) {
        // Still re-fill current values in case user data changed
        const nameEl = document.getElementById('profile-name');
        const emailEl = document.getElementById('profile-email');
        if (nameEl && currentUser?.name) nameEl.value = currentUser.name;
        if (emailEl && currentUser?.email) emailEl.value = currentUser.email;
        return;
    }
    profileListenerBound = true;

    // Pre-fill name and email from currentUser
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    if (nameEl && currentUser?.name) nameEl.value = currentUser.name;
    if (emailEl && currentUser?.email) emailEl.value = currentUser.email;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('profile-error');
        const okEl = document.getElementById('profile-success');
        const saveBtn = document.getElementById('profile-save-btn');
        errEl.style.display = 'none';
        okEl.style.display = 'none';

        const name = nameEl?.value?.trim();
        const currentPw = document.getElementById('profile-current-password')?.value;
        const newPw = document.getElementById('profile-new-password')?.value;

        const body = {};
        if (name && name !== currentUser?.name) body.name = name;
        if (newPw) {
            if (!currentUser?.must_change_password) {
                body.current_password = currentPw;
            }
            body.new_password = newPw;
        }

        if (!Object.keys(body).length) {
            errEl.textContent = 'No changes to save.';
            errEl.style.display = '';
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
            const res = await fetch(`${API_BASE}/auth/me`, {
                method: 'PATCH',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.detail || 'Failed to save changes.';
                errEl.style.display = '';
                return;
            }
            // Update currentUser in memory and sidebar display
            currentUser = { ...currentUser, ...data };
            if (data.name) {
                document.getElementById('user-name').textContent = data.name;
                document.getElementById('user-avatar').textContent = avatarInitials(data.name);
            }
            // Clear password fields
            document.getElementById('profile-current-password').value = '';
            document.getElementById('profile-new-password').value = '';
            okEl.style.display = '';
            setTimeout(() => { okEl.style.display = 'none'; }, 3000);
        } catch {
            errEl.textContent = 'Network error. Please try again.';
            errEl.style.display = '';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save changes';
        }
    });
}
