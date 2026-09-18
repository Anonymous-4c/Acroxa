// public/acrx/assets/js/editUser.js — Edit User page client
'use strict';

(function EditUserModule() {

  const _pstate = (() => {
    const el = document.getElementById('edituser-state');
    try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
  })();

  const userId = _pstate.userId;
  const sessionUser = _pstate.sessionUser;

  const API_PREFIX = '/acr/api/users';

  async function apiFetch(path, opts = {}) {
    const res = await fetch(API_PREFIX + path, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  }

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

  async function saveForm() {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;
    
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const form = document.getElementById('editUserForm');
      const formData = new FormData(form);

      // Gather all form data from all forms
      const allForms = document.querySelectorAll('form[id$="Form"]');
      const body = {};

      allForms.forEach(f => {
        const fd = new FormData(f);
        fd.forEach((value, key) => {
          if (!body[key]) body[key] = value;
        });
      });

      body.username = formData.get('username') || '';
      body.email = formData.get('email') || '';
      body.role = formData.get('role') || 'user';
      
      const statusVal = formData.get('accountStatus');
      body.isSuspended = statusVal === 'suspended';
      body.isActive = statusVal === 'active';

      body.fullName = formData.get('fullName') || '';
      body.jobTitle = formData.get('jobTitle') || '';
      body.phone = formData.get('phone') || '';
      body.location = formData.get('location') || '';
      body.department = formData.get('department') || '';
      body.website = formData.get('website') || '';
      body.bio = formData.get('bio') || '';

      const skillsRaw = formData.get('skills') || '';
      body.skills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);

      body.socialLinks = {
        twitter: formData.get('socialTwitter') || '',
        linkedin: formData.get('socialLinkedin') || '',
        github: formData.get('socialGithub') || '',
        website: formData.get('socialWebsite') || ''
      };

      const res = await fetch('/acr/api/users/' + userId, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      
      if (data.success) {
        toast('User updated successfully!', 'success');
        setTimeout(() => { window.location.href = '/acrx/users/' + userId; }, 1200);
      } else {
        toast(data.message || 'Failed to update user', 'error');
      }

    } catch (err) {
      toast('Connection error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  }

  function wireEvents() {
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-click]');
      if (!btn) return;

      const action = btn.dataset.click;

      if (action === 'go-back') {
        window.location.href = '/acrx/users/' + userId;
        return;
      }

      if (action === 'view-profile') {
        window.location.href = '/acrx/users/' + userId;
        return;
      }
    });

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveForm);
    }

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        window.location.href = '/acrx/users/' + userId;
      });
    }
  }

  function init() {
    wireEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();