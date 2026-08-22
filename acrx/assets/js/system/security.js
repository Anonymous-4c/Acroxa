/**
 * security.js  —  /acrx/system/security
 * Handles: login limits, 2FA, password policy, IP/CORS, force sign-out
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('security-form');
  const saveBtn = document.getElementById('security-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d  = await System.getSection('security');
    const pp = d.passwordPolicy ?? {};
    System.populateForm(form, {
      loginAttemptsLimit: d.loginAttemptsLimit ?? 5,
      sessionTimeout:     d.sessionTimeout     ?? 3600,
      twoFactorEnabled:   d.twoFactorEnabled   ?? false,
      pwMinLength:        pp.minLength         ?? 8,
      requireNumbers:     pp.requireNumbers    ?? true,
      requireSymbols:     pp.requireSymbols    ?? false,
      requireUppercase:   pp.requireUppercase  ?? true,
      allowedIPs:         (d.allowedIPs  ?? []).join(', '),
      corsOrigins:        (d.corsOrigins ?? ['*']).join(', '),
    });
  } catch (err) {
    System.showToast('Could not load security settings.', 'error');
    console.error('[Security] load:', err);
  }

  // ── Live password strength preview ────────────────────────────────────────
  const policyFields = ['pwMinLength', 'requireNumbers', 'requireSymbols', 'requireUppercase'];
  const strengthBar  = _createStrengthBar(form);

  policyFields.forEach(id => {
    form.querySelector(`#${id}`)?.addEventListener('change', _updateStrength);
  });
  _updateStrength();

  function _updateStrength() {
    const flat  = System.serializeForm(form);
    let score   = 0;
    if (Number(flat.pwMinLength) >= 8)  score++;
    if (Number(flat.pwMinLength) >= 12) score++;
    if (flat.requireNumbers)   score++;
    if (flat.requireSymbols)   score++;
    if (flat.requireUppercase) score++;
    const levels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const pcts   = ['10%', '30%', '55%', '75%', '100%'];
    const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'];
    if (strengthBar) {
      strengthBar.bar.style.width     = pcts[Math.min(score, 4)];
      strengthBar.bar.style.background = colors[Math.min(score, 4)];
      strengthBar.label.textContent   = levels[Math.min(score, 4)];
    }
  }

  function _createStrengthBar(parent) {
    const pwSection = parent.querySelector('#pwMinLength')?.closest('.settings-section');
    if (!pwSection) return null;
    const wrap  = document.createElement('div');
    wrap.className = 'password-strength-wrap';
    wrap.innerHTML = `
      <div class="strength-track"><div class="strength-bar" style="width:10%; background:#e74c3c; transition:all .3s;"></div></div>
      <span class="strength-label field-hint text-muted">Very Weak</span>
    `;
    pwSection.querySelector('.section-body')?.appendChild(wrap);
    return { bar: wrap.querySelector('.strength-bar'), label: wrap.querySelector('.strength-label') };
  }

  // ── Force sign-out all ────────────────────────────────────────────────────
  document.getElementById('force-signout-all')?.addEventListener('click', async () => {
    if (!confirm('Sign out every active user immediately? This cannot be undone.')) return;
    try {
      await System.forceSignOutAll();
      System.showToast('All users have been signed out.');
    } catch (err) {
      System.showToast(err.message, 'error');
    }
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      const allowedIPs  = flat.allowedIPs  ? flat.allowedIPs.split(',').map(s => s.trim()).filter(Boolean)  : [];
      const corsOrigins = flat.corsOrigins ? flat.corsOrigins.split(',').map(s => s.trim()).filter(Boolean) : ['*'];

      await System.updateSection('security', {
        loginAttemptsLimit: Number(flat.loginAttemptsLimit),
        sessionTimeout:     Number(flat.sessionTimeout),
        twoFactorEnabled:   flat.twoFactorEnabled,
        passwordPolicy: {
          minLength:        Number(flat.pwMinLength),
          requireNumbers:   flat.requireNumbers,
          requireSymbols:   flat.requireSymbols,
          requireUppercase: flat.requireUppercase,
        },
        allowedIPs,
        corsOrigins,
      });
      System.showToast('Security settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
});
