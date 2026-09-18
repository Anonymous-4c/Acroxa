// public/acrx/assets/js/profile.js — Client-side rendered profile page
'use strict';

(function ProfileModule() {
  'use strict';

  // ─── API Helper ────────────────────────────────────────────────────
  const API_PREFIX = '/acr/api/user';

  async function apiFetch(path, opts = {}) {
    const res = await fetch(API_PREFIX + path, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      credentials: 'include',
      ...opts
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  }

  // ─── Toast Helper ──────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    let stack = document.getElementById('u-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'u-toast-stack';
      stack.className = 'u-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const t = document.createElement('div');
    t.className = `u-toast u-toast--${type}`;
    t.innerHTML = `<i class="fa-regular fa-${type === 'success' ? 'circle-check' : type === 'error' ? 'circle-xmark' : 'circle-info'}"></i> ${msg}`;
    stack.prepend(t);
    requestAnimationFrame(() => t.classList.add('u-toast--visible'));
    setTimeout(() => {
      t.classList.remove('u-toast--visible');
      t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 3800);
  }

  // ─── Date Helpers ──────────────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return dateStr; }
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    try { return new Date(dateStr).toLocaleDateString('en-US'); } catch { return dateStr; }
  }

  // ─── Load & Render ─────────────────────────────────────────────────
  async function loadProfile() {
    const root = document.getElementById('profile-root');
    if (!root) return;

    root.innerHTML = `<div class="loading-state"><i class="fa-duotone fa-spinner-third fa-spin"></i> Loading profile…</div>`;

    try {
      const data = await apiFetch('/profile');
      renderProfile(data);
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('404')) {
        document.getElementById('profile-root').innerHTML = `<div class="pf-error"><i class="fa-solid fa-user-lock"></i><p>Not logged in. <a href="/acrx/login">Login</a></p></div>`;
      } else {
        document.getElementById('profile-root').innerHTML = `<div class="pf-error"><i class="fa-solid fa-circle-exclamation"></i><p>Failed to load profile: ${err.message}</p></div>`;
      }
    }
  }

  // ─── Render Profile ────────────────────────────────────────────────
  function renderProfile(data) {
    const { el, icon, PageWrapper, MainHeader, PostsMainContent } = window.AcroxaFramework;
    const user = data.user || {};
    const postStats = data.stats?.posts || {};
    const recentPosts = data.recentPosts || [];
    const recentPages = data.recentPages || [];
    const stats = data.stats || {};

    const formattedDate = user.createdAt

    // ─── Post Rows ─────────────────────────────────────────────────
    const postRows = recentPosts.map(post => {
      const statusClass = (post.status || 'draft').toLowerCase();
      const statusText = (post.status || 'Draft').charAt(0).toUpperCase() + (post.status || 'Draft').slice(1);
      const postId = post.id;

      return `
        <div class="ttc-pis">
          <div class="ttc-pi">
            <div class="acrx-itn name name-post">${post.title || 'Untitled'}</div>
            <div class="acrx-itn status status-post" data-status="${statusClass}">${statusText}</div>
            <div class="acrx-itn date date-post">${post.date ? new Date(post.date).toLocaleDateString('en-US') : '—'}</div>
            <div class="acrx-itn actions actions-post">
              <button class="btn-act" data-action="view" data-id="${postId}" title="View Post"><i class="fa-solid fa-eye"></i></button>
              <button class="btn-act" data-action="edit" data-id="${postId}" title="Edit Post"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="btn-act" data-action="delete" data-id="${postId}" title="Delete Post"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // ─── Page Rows ─────────────────────────────────────────────────
    const pageRows = (data.recentPages || []).map(page => {
      const statusClass = (page.status || 'draft').toLowerCase();
      const statusText = (page.status || 'Draft').charAt(0).toUpperCase() + (page.status || 'Draft').slice(1);
      const pageId = page.id;

      return `
        <div class="ttc-pis">
          <div class="ttc-pi">
            <div class="acrx-itn name name-post">${page.title || 'Untitled'}</div>
            <div class="acrx-itn status status-post" data-status="${statusClass}">${statusText}</div>
            <div class="acrx-itn date date-post">${page.date ? new Date(page.date).toLocaleDateString('en-US') : '—'}</div>
            <div class="acrx-itn actions actions-post">
              <button class="btn-act" data-action="view-page" data-id="${pageId}"><i class="fa-solid fa-eye"></i></button>
              <button class="btn-act" data-action="edit-page" data-id="${pageId}"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="btn-act" data-action="delete-page" data-id="${pageId}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // ─── HTML Template ─────────────────────────────────────────────
    const userData = data.user || {};
    const formattedDateStr = formatDate(userData.createdAt);
    const avatarUrl = userData.avatar || '/acrx/assets/images/default-avatar.png';

    const html = `
      <div class="profile-pg-st">
        ${MainHeader({
          title: 'My Profile',
          actions: [
            { class: 'btn ghost', icon: 'pen-to-square', title: 'Edit Profile', dataClick: 'edit-profile' }
          ]
        })}

        <div class="profile-info-card card slide-up">
          <div class="profile-header">
            <div class="profile-avatar">
              <img src="${userData.avatar || '/acrx/assets/images/default-avatar.png'}" alt="${userData.fullName || userData.username}">
            </div>
            <div class="profile-meta">
              <h2>${userData.fullName || userData.username}</h2>
              <p class="username">@${userData.username}</p>
              <p class="role-badge"><span class="role ${userData.role || 'author'}">${userData.role || 'Author'}</span></p>
            </div>
          </div>
          <div class="profile-details">
            <div class="info-grid">
              <div class="info-item"><span class="label">Member Since</span><span class="value">${formattedDateStr}</span></div>
              <div class="info-item"><span class="label">Email</span><span class="value">${userData.email || '—'}</span></div>
              <div class="info-item"><span class="label">Location</span><span class="value">${userData.location || '—'}</span></div>
              <div class="info-item"><span class="label">Job Title</span><span class="value">${userData.jobTitle || '—'}</span></div>
            </div>
          </div>
          ${userData.bio ? `<div class="profile-bio"><h3>Bio</h3><p>${userData.bio}</p></div>` : ''}
        </div>

        <div class="overview-metrics grid slide-up">
          <div class="metric-card"><div class="metric-icon"><i class="fa-duotone fa-file-lines"></i></div><div class="card-content"><h3>Total Posts</h3><p class="metric-value">${stats.posts?.total || 0}</p></div></div>
          <div class="metric-card"><div class="metric-icon"><i class="fa-duotone fa-circle-check"></i></div><div class="card-content"><h3>Published</h3><p class="metric-value">${stats.posts?.published || 0}</p></div></div>
          <div class="metric-card"><div class="metric-icon"><i class="fa-duotone fa-pen-to-square"></i></div><div class="card-content"><h3>Drafts</h3><p class="metric-value">${stats.posts?.draft || 0}</p></div></div>
          <div class="metric-card"><div class="metric-icon"><i class="fa-duotone fa-trash"></i></div><div class="card-content"><h3>Trashed</h3><p class="metric-value">${stats.posts?.trashed || 0}</p></div></div>
        </div>

        <div class="recent-posts-section card slide-up">
          <div class="section-header"><h2><i class="fa-duotone fa-clock-rotate-left"></i> Recent Posts</h2></div>
          <div class="posts-ttc-wrap acrx-ttc-wrap">
            <div class="posts-ttc acrx-ttc">
              <div class="ttc-ph">
                <div class="name">Title</div><sep/>
                <div class="status">Status</div><sep/>
                <div class="dated">Date</div><sep/>
                <div class="actions">Actions</div>
              </div>
              <div class="ttc-pis ttc-pis-wrap">
                ${recentPosts.length > 0 ? recentPosts.map(post => `
                  <div class="ttc-pis">
                    <div class="ttc-pi">
                      <div class="acrx-itn name name-post">${post.title || 'Untitled'}</div>
                      <div class="acrx-itn status status-post" data-status="${(post.status || 'draft').toLowerCase()}">${(post.status || 'Draft').charAt(0).toUpperCase() + (post.status || 'Draft').slice(1)}</div>
                      <div class="acrx-itn date date-post">${post.date ? new Date(post.date).toLocaleDateString('en-US') : '—'}</div>
                      <div class="acrx-itn actions actions-post">
                        <button class="btn-act" data-action="view" data-id="${post.id}" title="View Post"><i class="fa-regular fa-eye"></i></button>
                        <button class="btn-act" data-action="edit" data-id="${post.id}" title="Edit Post"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button class="btn-act" data-action="delete" data-id="${post.id}" title="Delete Post"><i class="fa-regular fa-trash"></i></button>
                      </div>
                    </div>
                  </div>
                `).join('') : '<div class="empty-state"><p>No recent posts yet.</p></div>'
              }
            </div>
          </div>
        </div>

        ${(data.recentPages || []).length > 0 ? `
        <div class="recent-pages-section card slide-up">
          <div class="section-header"><h2><i class="fa-duotone fa-file"></i> Recent Pages</h2></div>
          <div class="posts-ttc-wrap acrx-ttc-wrap">
            <div class="posts-ttc acrx-ttc">
              <div class="ttc-ph">
                <div class="name">Title</div><sep/>
                <div class="status">Status</div><sep/>
                <div class="dated">Date</div><sep/>
                <div class="actions">Actions</div>
              </div>
              <div class="ttc-pis ttc-pis-wrap">
                ${data.recentPages.map(page => `
                  <div class="ttc-pis">
                    <div class="ttc-pi">
                      <div class="acrx-itn name name-post">${page.title || 'Untitled'}</div>
                      <div class="acrx-itn status status-post" data-status="${(page.status || 'draft').toLowerCase()}">${(page.status || 'Draft').charAt(0).toUpperCase() + (page.status || 'Draft').slice(1)}</div>
                      <div class="acrx-itn date date-post">${page.date ? new Date(page.date).toLocaleDateString('en-US') : '—'}</div>
                      <div class="acrx-itn actions actions-post">
                        <button class="btn-act" data-action="view-page" data-id="${page.id}"><i class="fa-regular fa-eye"></i></button>
                        <button class="btn-act" data-action="edit-page" data-id="${page.id}"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button class="btn-act" data-action="delete-page" data-id="${page.id}"><i class="fa-regular fa-trash"></i></button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="profile-actions d-flex flex-row gap-3 mt-4">
          <button class="p-2 button-pst" data-action="change-password"><i class="fa-regular fa-key"></i><span>Change Password</span></button>
          ${userData.role !== 'admin' ? `<button class="p-2 button-pst btn-danger" data-action="delete-account"><i class="fa-regular fa-user-slash"></i><span>Delete Account</span></button>` : ''}
        </div>
    `;

    document.getElementById('profile-root').innerHTML = html;
    wireEvents();
  }

  // ─── Event Handlers ──────────────────────────────────────────────
  function wireEvents() {
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'edit-profile':
          window.location.href = `/acrx/users/${_pstate.sessionUser?.userId}/edit`;
          break;
        case 'logout':
          window.location.href = '/acrx/logout';
          break;
        case 'change-password':
          // TODO: implement change password modal
          break;
        case 'delete-account':
          if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            // TODO: implement delete account
          }
          break;
        case 'view':
        case 'edit':
        case 'delete':
        case 'view-page':
        case 'edit-page':
        case 'delete-page':
          // These are for posts/pages, delegate to posts.js if needed
          break;
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────
  const _pstate = (() => {
    const el = document.getElementById('profile-state');
    try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
  })();

  async function init() {
    wireEvents();
    await loadProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();