/**
 * email.js  —  /acrx/system/email
 * Handles: SMTP configuration, sender info, connection test, test email
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form    = document.getElementById('email-form');
  const saveBtn = document.getElementById('email-save-btn');

  if (!form) return;

  // ── Load ─────────────────────────────────────────────────────────────────
  try {
    const d = await System.getSection('email');
    System.populateForm(form, {
      emailEnabled:       d.enabled       ?? false,
      emailHost:          d.host          ?? '',
      emailPort:          d.port          ?? 587,
      emailUsername:      d.username      ?? '',
      emailPassword:      d.password      ?? '',
      emailEncryption:    d.encryption    ?? 'starttls',
      emailSenderName:    d.senderName    ?? '',
      emailSenderAddress: d.senderAddress ?? '',
    });
  } catch (err) {
    System.showToast('Could not load email settings.', 'error');
    console.error('[Email] load:', err);
  }

  // ── Test SMTP Connection ─────────────────────────────────────────────────
  document.getElementById('test-email-connection')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-email-connection');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="icon icon-duotone"><i class="fa-duotone fa-spinner fa-spin"></i></span> <span>Testing…</span>';

    try {
      const res = await fetch(System.SETTINGS_BASE + '/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        System.showToast('SMTP connection successful!', 'success');
      } else {
        System.showToast(data.message || 'SMTP connection failed', 'error');
      }
    } catch (err) {
      System.showToast('Connection test failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });

  // ── Send Test Email ──────────────────────────────────────────────────────
  document.getElementById('test-email-send')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-email-send');
    const toInput = document.getElementById('emailTestAddress');
    const to = toInput?.value?.trim();

    if (!to || !to.includes('@')) {
      System.showToast('Enter a valid email address for the test.', 'warning');
      toInput?.focus();
      return;
    }

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="icon icon-duotone"><i class="fa-duotone fa-spinner fa-spin"></i></span> <span>Sending…</span>';

    try {
      const res = await fetch(System.SETTINGS_BASE + '/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      if (data.success) {
        System.showToast('Test email sent successfully!', 'success');
      } else {
        System.showToast(data.message || 'Failed to send test email', 'error');
      }
    } catch (err) {
      System.showToast('Send test failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  saveBtn?.addEventListener('click', async () => {
    System.setSaving(saveBtn, true);
    try {
      const flat = System.serializeForm(form);
      await System.updateSection('email', {
        enabled:       flat.emailEnabled,
        host:          flat.emailHost,
        port:          Number(flat.emailPort) || 587,
        username:      flat.emailUsername,
        password:      flat.emailPassword,
        encryption:    flat.emailEncryption,
        senderName:    flat.emailSenderName,
        senderAddress: flat.emailSenderAddress,
      });
      System.showToast('Email settings saved.');
    } catch (err) {
      System.showToast(err.message, 'error');
    } finally {
      System.setSaving(saveBtn, false);
    }
  });
});
