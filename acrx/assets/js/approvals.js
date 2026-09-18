// =============================================
// Acroxa CMS - Comprehensive Approvals Page JS (UPDATED)
// =============================================

let allApprovals = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    console.log('%c[Approvals] Full JS loaded', 'color: #10b981; font-weight: bold');

    const tbody = document.getElementById('approvals-tbody');
    const searchInput = document.getElementById('search-approval');
    const refreshBtn = document.querySelector('.refresh-btn');
    const statusTabs = document.querySelectorAll('.pages');

    // ====================== LOAD APPROVALS ======================
    async function loadApprovals() {
        if (!tbody) return;

        tbody.innerHTML = `
            <div class="ttc-pi">
                <div class="box-cbx"><div class="cbx"><i class="fa-solid fa-spinner fa-spin"></i></div></div>
                <div class="acrx-itn name name-post text-center" style="width:100%">Loading approval requests...</div>
            </div>
        `;

        try {
            const url = currentFilter === 'all'
                    ? '/acr/api/approvals/all'
                    : `/acr/api/approvals/${currentFilter}`;

            // Prefer shared API client (dedup + cache) when present; fall back to fetch.
            let data;
            if (window.AcroxaApi && typeof window.AcroxaApi.get === 'function') {
                const out = await window.AcroxaApi.get(url, { ttlMs: 10000 });
                if (!out.ok) throw new Error((out.data && out.data.message) || 'Failed to load');
                data = out.data;
            } else {
                const res = await fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });
                data = await res.json();
            }

            if (data.success) {
                allApprovals = data.approvals || [];
                updateStats(allApprovals);
                filterApprovals();
            } else {
                throw new Error(data.message || 'Failed to load');
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = `
                <div class="ttc-pi">
                    <div class="acrx-itn name name-post text-center text-danger" style="width:100%">
                        Failed to load approvals. Please try again.
                    </div>
                </div>
            `;
        }
    }

    // ====================== RENDER APPROVALS ======================
    function renderApprovals(approvals) {
        if (!tbody) return;

        if (approvals.length === 0) {
            tbody.innerHTML = `
                <div class="ttc-pi">
                    <div class="acrx-itn name name-post text-center text-muted" style="width:100%; padding: 40px 20px;">
                        <i class="fa-duotone fa-inbox fa-3x mb-3"></i><br>
                        No ${currentFilter === 'all' ? '' : currentFilter + ' '}approval requests found.
                    </div>
                </div>
            `;
            return;
        }

        tbody.innerHTML = approvals.map(approval => {
            const isPending = approval.status === 'pending';
            const id = approval.id || approval._id;

            return `
                <div class="ttc-pi" data-id="${id}">
                    <div class="box-cbx">
                        <div class="cbx">${icon('check')}</div>
                    </div>
                    <div class="acrx-itn name name-post">
                        <strong>${approval.type.toUpperCase()}</strong>
                    </div>
                    <div class="acrx-itn name name-file">
                        ${escapeHtml(approval.fileName)}
                    </div>
                    <div class="acrx-itn taxonomies taxonomies-post">
                        ${approval.oldName 
                            ? `${escapeHtml(approval.oldName)} → ${escapeHtml(approval.newName)}` 
                            : '—'}
                    </div>
                    <div class="acrx-itn date date-post">
                        ${escapeHtml(approval.requestedBy?.username || approval.requestedBy || 'Unknown')}
                        <br>
                        <small>${approval.createdAt ? new Date(approval.createdAt).toLocaleDateString() : ''}</small>
                    </div>
                    <div class="acrx-itn status status-post" data-="${getStatusColor(approval.status)}">
                        ${getStatusText(approval.status)}
                    </div>
                    <div class="acrx-itn actions actions-post">
                        ${isPending ? `
                            <button class="btn-act approve-btn" data-id="${id}" title="Approve">
                                ${icon('check')}
                            </button>
                            <button class="btn-act reject-btn" data-id="${id}" title="Reject">
                                ${icon('xmark')}
                            </button>
                        ` : `
                            <span class="text-muted small">Processed</span>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    // ====================== INCREMENTAL ROW PATCH ======================
    // Update exactly one row in place (status + actions cells only) so search
    // focus, scroll and unrelated rows stay untouched. Falls back to full
    // render when the row is absent (e.g. filtered out).
    function patchRowInPlace(approvalId, nextStatus) {
        if (!tbody) return false;
        const row = tbody.querySelector(`.ttc-pi[data-id="${CSS.escape(String(approvalId))}"]`);
        if (!row) return false;
        try {
            const statusCell = row.querySelector('.status-post, .status');
            if (statusCell) {
                statusCell.setAttribute('data-', getStatusColor(nextStatus));
                statusCell.textContent = getStatusText(nextStatus);
            }
            const actionsCell = row.querySelector('.actions-post, .actions');
            if (actionsCell) {
                actionsCell.innerHTML = '<span class="text-muted small">Processed</span>';
            }
            // Keep local store consistent without refetch.
            const idx = allApprovals.findIndex(a => String(a.id || a._id) === String(approvalId));
            if (idx !== -1) allApprovals[idx] = { ...allApprovals[idx], status: nextStatus };
            updateStats(allApprovals);
            return true;
        } catch (_) {
            return false;
        }
    }

    // ====================== FILTER & SEARCH ======================
    function filterApprovals() {
        let filtered = allApprovals;

        // Preserve search focus/selection across re-render (editor-grade UX).
        const hadFocus = searchInput && document.activeElement === searchInput;
        const selStart = hadFocus ? searchInput.selectionStart : null;
        const selEnd = hadFocus ? searchInput.selectionEnd : null;
        const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

        if (term) {
            filtered = filtered.filter(a =>
                (a.fileName || '').toLowerCase().includes(term) ||
                (a.requestedBy?.username || '').toLowerCase().includes(term)
            );
        }

        renderApprovals(filtered);

        if (hadFocus && searchInput) {
            try {
                searchInput.focus({ preventScroll: true });
                if (selStart !== null && typeof searchInput.setSelectionRange === 'function') {
                    searchInput.setSelectionRange(selStart, selEnd);
                }
            } catch (_) {}
        }
    }

    // ====================== UPDATE STATS ======================
    function updateStats(data) {
        const stats = {
            all: data.length,
            pending: data.filter(a => a.status === 'pending').length,
            approved: data.filter(a => a.status === 'approved').length,
            rejected: data.filter(a => a.status === 'rejected').length
        };

        statusTabs.forEach(tab => {
            const filter = tab.getAttribute('data-filter');
            if (stats[filter] !== undefined) {
                tab.setAttribute('data-count', stats[filter]);
            }
        });
    }

    // ====================== APPROVE / REJECT ======================
    async function handleAction(approvalId, action) {
        const isApprove = action === 'approve';
        const msg = isApprove 
            ? "Approve this request? The file will be renamed or deleted."
            : "Reject this request? No changes will be made to the file.";

        if (!confirm(msg)) return;

        const buttons = document.querySelectorAll(`.btn-act[data-id="${approvalId}"]`);
        buttons.forEach(btn => btn.disabled = true);

        try {
            const res = await fetch('/acr/api/approvals/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    approvalId,
                    action,
                    reviewNote: isApprove ? 'Approved by admin' : 'Rejected by admin'
                })
            });

            const data = await res.json();

            if (data.success) {
                showToast(isApprove ? '✅ Request Approved' : '❌ Request Rejected',
                          isApprove ? 'success' : 'error');

                // Invalidate shared GET cache so next list load is fresh.
                try { window.AcroxaApi && window.AcroxaApi.invalidate('/acr/api/approvals'); } catch (_) {}

                if (isApprove && data.actionApi) {
                    await executeMediaAction(data.actionApi, data.fileName, data);
                } else if (!patchRowInPlace(approvalId, isApprove ? 'approved' : 'rejected')) {
                    loadApprovals();
                }
            } else {
                showToast(data.message || 'Operation failed', 'error');
                loadApprovals();
            }
        } catch (err) {
            console.error(err);
            showToast('Network error. Please try again.', 'error');
            loadApprovals();
        }
    }

    async function executeMediaAction(actionApi, fileName, data) {
        try {
            const body = actionApi.includes('delete-file') 
                ? { filename: fileName }
                : { oldName: data.oldName, newName: data.newName };

            const res = await fetch(actionApi, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const result = await res.json();

            if (result.success) {
                showToast('File operation completed successfully!', 'success');
            }
        } catch (e) {
            console.error(e);
            showToast('File action failed', 'warning');
        } finally {
            try { window.AcroxaApi && window.AcroxaApi.invalidate('/acr/api/approvals'); } catch (_) {}
            // Incremental: media action implies approval completed; avoid full reload.
            loadApprovals();
        }
    }

    // ====================== HELPERS ======================
    function getStatusColor(status) {
        return status === 'approved' ? 'green' : 
               status === 'rejected' ? 'red' : 'orange';
    }

    function getStatusText(status) {
        return status === 'approved' ? 'Approved' :
               status === 'rejected' ? 'Rejected' : 'Pending';
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
    }

    function icon(name) {
        return `<i class="fa-solid fa-${name}"></i>`;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message;
        toast.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; 
            padding: 14px 24px; border-radius: 12px; 
            color: white; z-index: 9999; font-weight: 500;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.2);
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ====================== EVENT LISTENERS ======================
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const approveBtn = e.target.closest('.approve-btn');
            const rejectBtn = e.target.closest('.reject-btn');

            if (approveBtn) handleAction(approveBtn.dataset.id, 'approve');
            if (rejectBtn) handleAction(rejectBtn.dataset.id, 'reject');
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterApprovals();
        }, 300));
    }

    if (statusTabs.length > 0) {
        statusTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                statusTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                currentFilter = tab.getAttribute('data-filter') || 'all';
                loadApprovals();
            });
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.style.transform = 'rotate(180deg)';
            setTimeout(() => refreshBtn.style.transform = '', 600);
            loadApprovals();
        });
    }

    loadApprovals();

    console.log('%c[Approvals] All features initialized', 'color: #10b981');
});

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}
