// layouts.js
class LayoutManager {
  constructor() {
    this.currentId = null;
    this.init();
  }

  init() {
    this.attachCardListeners();
    this.attachHeaderButtons();
    this.refreshLayouts(); // initial load with animation
  }

  // ====================== API HELPER ======================
  async api(method, url, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  // ====================== MODAL (Info Popup) ======================
  async showLayoutModal(id) {
    this.currentId = id;

    const layout = await this.api('GET', `/acr/api/layouts/${id}`);
    const active = await this.api('GET', '/acr/api/layouts/get/active');

    const isActive = active.id === id;

    const modalHTML = `
      <div class="modal-overlay" id="layout-modal">
        <div class="layout-detail-modal">
          <div class="modal-header">
            <h2>${layout.name}</h2>
            <button class="modal-close" id="modal-close">✕</button>
          </div>

          <div class="modal-body">
            <!-- LEFT: Image -->
            <div class="modal-left">
              <img src="/layouts/${id}${layout.preview}" alt="${layout.name}">
              <div class="detail-group">
                <label>ID</label>
                <p><code>${id}</code></p>
              </div>
              <div class="detail-group">
                <label>Version</label>
                <p>v${layout.version}</p>
              </div>
            </div>

            <!-- RIGHT: Details -->
            <div class="modal-right">

              <div class="detail-group">
                <label>Author</label>
                <p><a href="${layout.author?.url || '#'}" target="_blank">${layout.author?.name || 'Unknown'}</a></p>
              </div>
              <div class="detail-group">
                <label>Description</label>
                <p>${layout.description || 'No description.'}</p>
              </div>

              ${layout.features?.length ? `
              <div class="detail-group">
                <label>Features</label>
                <ul class="features-list">${layout.features.map(f => `<li>${f}</li>`).join('')}</ul>
              </div>` : ''}

              ${layout.color_scheme ? `
              <div class="detail-group">
                <label>Color Scheme</label>
                <div class="color-swatches">
                  ${Object.entries(layout.color_scheme).map(([k, v]) => `
                    <div class="swatch">
                      <span class="swatch-color" style="background:${v}"></span>
                      <span class="swatch-name">${k}</span>
                    </div>`).join('')}
                </div>
                
              </div>` : ''}
                        <div class="modal-footer">
            <button class="btn ghost" id="modal-preview">
              <i class="fa-duotone fa-eye"></i> Preview
            </button>
            <button class="btn ghost" id="modal-edit-files">
              <i class="fa-duotone fa-folder"></i> Edit Files
            </button>
            <button class="btn accent" id="modal-edit-colors">
              <i class="fa-duotone fa-palette"></i> Edit Color Scheme
            </button>
            <button class="btn ${isActive ? 'disabled' : 'accent'}" id="modal-activate" ${isActive ? 'disabled' : ''}>
              ${isActive ? '<i class="fa-duotone fa-circle-check"></i> Active' : '<i class="fa-duotone fa-toggle-large-off"></i> Activate'}
            </button>
          </div>
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.attachModalListeners();
  }

  attachModalListeners() {
    const modal = document.getElementById('layout-modal');
    if (!modal) return;

    modal.querySelector('#modal-close').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };

    // Preview
    modal.querySelector('#modal-preview').onclick = () => {
      window.open(`/acrx/layouts/customize?layout=${this.currentId}`, '_blank');
    };

    // Edit Files
    modal.querySelector('#modal-edit-files').onclick = () => {
      window.open(`/acrx/layouts/edit?id=${this.currentId}`, '_blank');
    };

    // Edit Colors
    modal.querySelector('#modal-edit-colors').onclick = () => this.openColorEditor();

    // Activate
    const activateBtn = modal.querySelector('#modal-activate');
    if (activateBtn && !activateBtn.disabled) {
      activateBtn.onclick = () => this.activateLayout(this.currentId);
    }
  }

  // ====================== COLOR SCHEME EDITOR ======================
  async openColorEditor() {
    const layout = await this.api('GET', `/acr/api/layouts/${this.currentId}`);
    const colors = layout.color_scheme || {
      primary: "#00f0ff",
      secondary: "#7c3aed",
      accent: "#ec4899",
      background: "rgba(10,10,20,0.95)"
    };

    const editorHTML = `
      <div class="modal-overlay" id="color-editor-modal">
        <div class="color-editor-modal">
          <div class="modal-header">
            <h2>Edit ${layout.name} Colors</h2>
            <button class="modal-close" id="color-close">✕</button>
          </div>
          <div class="color-fields">
            ${Object.entries(colors).map(([key, value]) => `
              <div class="color-field">
                <label>${key}</label>
                <div class="color-inputs">
                  <input type="color" value="${value.startsWith('#') ? value : '#00f0ff'}" data-key="${key}">
                  <input type="text" value="${value}" class="color-text" data-key="${key}">
                </div>
              </div>
            `).join('')}
          </div>
          <div class="modal-footer">
            <button class="btn ghost" id="color-cancel">Cancel</button>
            <button class="btn accent" id="color-save">Save Changes</button>
          </div>
        </div>
      </div>`;

    document.getElementById('layout-modal').remove();
    document.body.insertAdjacentHTML('beforeend', editorHTML);

    const editor = document.getElementById('color-editor-modal');

    editor.querySelector('#color-close').onclick = () => editor.remove();
    editor.querySelector('#color-cancel').onclick = () => editor.remove();

    editor.querySelector('#color-save').onclick = async () => {
      const newColors = {};
      editor.querySelectorAll('.color-field input[type="text"]').forEach(inp => {
        newColors[inp.dataset.key] = inp.value;
      });

      const updatedMeta = { ...layout, color_scheme: newColors };

      try {
        await this.api('PUT', `/acr/api/layouts/${this.currentId}`, updatedMeta);
        this.showToast('✅ Color scheme updated!', 'success');
        editor.remove();
        this.refreshLayouts();
      } catch (e) {
        this.showToast('❌ Failed to save colors', 'error');
      }
    };
  }

  // ====================== ACTIVATE LAYOUT ======================
  async activateLayout(id) {
    try {
      await this.api('POST', '/acr/api/layouts/get/active', { id });
      this.showToast(`✅ ${id} is now the active layout!`, 'success');
      document.getElementById('layout-modal')?.remove();
      this.refreshLayouts();
    } catch (e) {
      this.showToast('❌ Could not activate layout', 'error');
    }
  }

  // ====================== IMPORT LAYOUT (ZIP) ======================
  async importLayout(file) {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      this.showToast('Uploading layout...', 'info');

      const res = await fetch('/acr/api/layouts/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');

      const result = await res.json();
      this.showToast(`✅ Layout "${result.name || 'New'}" imported successfully!`, 'success');
      this.refreshLayouts();
    } catch (e) {
      console.error(e);
      this.showToast('❌ Failed to import layout', 'error');
    }
  }

  // ====================== REFRESH GRID ======================
  async refreshLayouts() {
    const grid = document.querySelector('.layout-grid');
    if (!grid) return;

    grid.style.opacity = '0.4';
    grid.style.transition = 'opacity 0.3s ease';

    try {
      const [layouts, activeData] = await Promise.all([
        this.api('GET', '/acr/api/layouts'),
        this.api('GET', '/acr/api/layouts/get/active')
      ]);

      const activeId = activeData.id;

      grid.innerHTML = layouts.map(l => `
        <div class="layout-card ${l.id === activeId ? 'active' : ''}" data-id="${l.id}">
          <div class="layout-image">
            <img src="${l.preview}" alt="${l.name}">
          </div>
          <div class="layout-details">
            <div class="layout-info">
              <div class="layout-title">
                <h3>${l.name}</h3>
                ${l.id === activeId ? '<span class="badge active">Active</span>' : ''}
              </div>
              <p class="layout-desc">${l.description || ''}</p>
              <div class="layout-meta">
                <span>v${l.version}</span>
                <span>${l.author?.name || l.author || ''}</span>
              </div>
            </div>
            <div class="layout-actions">
              <button class="btn ghost" data-preview="${l.id}"><i class="fa-duotone fa-eye"></i>  <span class="label"> Preview </span></button>
              <button class="btn ghost" data-info="${l.id}"><i class="fa-duotone fa-circle-info"></i></button>
              <button class="${l.id === activeId ? 'btn disabled' : 'btn accent'}" 
                      data-activate="${l.id}" ${l.id === activeId ? 'disabled' : ''}>
                ${l.id === activeId ? '<i class="fa-duotone fa-toggle-large-on"></i> <span class="label"> Active </span>' : '<i class="fa-duotone fa-toggle-large-off"></i>  <span class="label"> Active</span>'}
              </button>
            </div>
          </div>
        </div>
      `).join('');

      this.attachCardListeners();

      setTimeout(() => {
        grid.style.opacity = '1';
      }, 50);
    } catch (err) {
      console.error(err);
      this.showToast('Failed to refresh layouts', 'error');
    }
  }

  // ====================== CARD LISTENERS ======================
  attachCardListeners() {
    // Info button
    document.querySelectorAll('[data-info]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopImmediatePropagation();
        this.showLayoutModal(e.currentTarget.dataset.info);
      };
    });

    // Preview button
    document.querySelectorAll('[data-preview]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopImmediatePropagation();
        window.open(`/acrx/layouts/customize?layout=${e.currentTarget.dataset.preview}`, '_blank');
      };
    });

    // Activate button
    document.querySelectorAll('[data-activate]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopImmediatePropagation();
        if (confirm('Activate this layout?')) {
          this.activateLayout(e.currentTarget.dataset.activate);
        }
      };
    });
  }

  // ====================== HEADER BUTTONS ======================
  attachHeaderButtons() {
    // Refresh Button (in header-actions)
    document.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
      this.refreshLayouts();
    });

    // Import Button (in header-actions)
    const importBtn = document.querySelector('[data-action="import"]');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = (e) => {
          if (e.target.files.length > 0) {
            this.importLayout(e.target.files[0]);
          }
        };
        input.click();
      });
    }

    // alb-right buttons
    document.querySelector('[data-action="preview-active"]')?.addEventListener('click', () => {
      const activeBadge = document.querySelector('.badge.active');
      if (activeBadge) {
        const card = activeBadge.closest('.layout-card');
        const activeId = card?.dataset.id;
        if (activeId) {
          window.open(`/acrx/layouts/${activeId}/preview`, '_blank');
        }
      } else {
        this.showToast('No active layout found', 'info');
      }
    });

    document.querySelector('[data-action="reload-active"]')?.addEventListener('click', () => {
      this.refreshLayouts();
    });
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.layoutManager = new LayoutManager();
});