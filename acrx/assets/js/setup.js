/* ../acrx/assets/js/setup.js */
'use strict';

let step = 1;
const total = 5;
const data = {};
const STORE = 'cms_setup_data';

document.addEventListener('DOMContentLoaded', () => {
  load();
  wireInputs();
  wireRadios();
  wireNav();
  wirePasswordStrength();
  syncDropdowns();
  show();
  if (Object.keys(data).length > 1 && !data._noRestore) showRestore();
});

/* ── Storage ──────────────────────────────────────────────────────────────── */
function save() { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch(e) {} }
function load() { try { const s = localStorage.getItem(STORE); if (s) Object.assign(data, JSON.parse(s)); } catch(e) {} }
function clear() { try { localStorage.removeItem(STORE); } catch(e) {} }

/* ── Dropdown Sync ────────────────────────────────────────────────────────── */
function syncDropdowns() {
  document.addEventListener('click', function(e) {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const wrap = item.closest('.dropdown-field-wrap, .dropdown');
    if (!wrap) return;
    const hidden = wrap.querySelector('.dropdown-hidden-input');
    if (!hidden) return;
    data[hidden.id] = hidden.value;
    save();
  });
}

/* ── Inputs ───────────────────────────────────────────────────────────────── */
function wireInputs() {
  document.querySelectorAll('.setup-input').forEach(function(el) {
    if (data[el.id]) el.value = data[el.id];
    el.addEventListener('input', function() {
      data[this.id] = this.value;
      save();
    });
  });
}

/* ── Radio Cards (DB Type) ────────────────────────────────────────────────── */
function wireRadios() {
  document.querySelectorAll('.radio-card').forEach(function(card) {
    card.addEventListener('click', function() {
      const group = this.closest('.radio-group');
      group.querySelectorAll('.radio-card').forEach(function(c) { c.classList.remove('selected'); });
      this.classList.add('selected');
      data.dbType = this.dataset.value;
      handleDbFields(data.dbType);
      save();
    });
  });
  if (data.dbType) {
    const card = document.querySelector('.radio-card[data-value="' + data.dbType + '"]');
    if (card) {
      card.classList.add('selected');
      handleDbFields(data.dbType);
    }
  }
}

function handleDbFields(type) {
  var c = document.getElementById('dbFieldsContainer');
  if (!c) return;
  if (type === 'sqlite') {
    c.classList.remove('visible');
  } else {
    c.classList.add('visible');
    var ports = { mongodb: '27017', mysql: '3306', postgresql: '5432' };
    var p = document.getElementById('dbPort');
    if (p && !data.dbPort) {
      p.value = ports[type] || '';
      data.dbPort = p.value;
      save();
    }
  }
}

/* ── Navigation ───────────────────────────────────────────────────────────── */
function wireNav() {
  document.getElementById('nextBtn').addEventListener('click', function() {
    if (!validate()) return;
    if (step < total) {
      step++;
      data._step = step;
      save();
      if (step === total) buildReview();
      show();
    }
  });

  document.getElementById('prevBtn').addEventListener('click', function() {
    if (step > 1) { step--; data._step = step; save(); show(); }
  });

  document.getElementById('completeBtn').addEventListener('click', function() { submit(this); });

  document.querySelectorAll('.setup-nav-step').forEach(function(s) {
    s.addEventListener('click', function() {
      var t = parseInt(this.dataset.step);
      if (t <= step) { step = t; data._step = step; save(); show(); }
    });
  });
}

function show() {
  document.querySelectorAll('.setup-step').forEach(function(s, i) {
    s.classList.toggle('active', i + 1 === step);
  });
  document.querySelectorAll('.setup-nav-step').forEach(function(s, i) {
    s.classList.remove('active', 'done');
    if (i + 1 === step) s.classList.add('active');
    else if (i + 1 < step) s.classList.add('done');
  });
  document.getElementById('prevBtn').style.display = step > 1 ? 'inline-flex' : 'none';
  document.getElementById('nextBtn').style.display = step < total ? 'inline-flex' : 'none';
  document.getElementById('completeBtn').style.display = step === total ? 'inline-flex' : 'none';
}

/* ── Validation ───────────────────────────────────────────────────────────── */
function validate() {
  var errs = [];
  if (step === 1) {
    if (!data.username) errs.push('Username is required');
    if (!data.email) errs.push('Email is required');
    if (!data.password) errs.push('Password is required');
    if (!data.confirmPassword) errs.push('Confirm password is required');
    if (data.password !== data.confirmPassword) errs.push('Passwords do not match');
    if (data.password && meets(data.password) < 4) errs.push('Password needs at least 4 security requirements');
  } else if (step === 2) {
    if (!data.fullName) errs.push('Full name is required');
  } else if (step === 3) {
    if (!data.siteName) errs.push('Site name is required');
    if (!data.siteDescription) errs.push('Site description is required');
  } else if (step === 4) {
    if (!data.dbType) errs.push('Database type is required');
    if (data.dbType !== 'sqlite') {
      if (!data.dbHost) errs.push('Database host is required');
      if (!data.dbPort) errs.push('Database port is required');
      if (!data.dbName) errs.push('Database name is required');
    }
  }
  if (errs.length) { toast('Please fix:\n' + errs.join('\n'), 'error'); return false; }
  return true;
}

/* ── Password Strength ────────────────────────────────────────────────────── */
function wirePasswordStrength() {
  var pw = document.getElementById('password');
  if (!pw) return;
  pw.addEventListener('input', function() { checkPw(this.value); });
}

function meets(pw) {
  return [pw.length >= 8, /[A-Z]/.test(pw), /[a-z]/.test(pw), /[0-9]/.test(pw), /[!@#$%^&*(),.?":{}|<>]/.test(pw)].filter(Boolean).length;
}

function checkPw(pw) {
  var fill = document.getElementById('pwFill');
  var text = document.getElementById('pwText');
  var reqs = document.getElementById('pwReqs');
  if (!fill || !text || !reqs) return;
  if (!pw) { fill.className = 'strength-fill'; text.textContent = 'Enter a password'; text.className = 'strength-text'; reqs.querySelectorAll('.req').forEach(function(r) { r.classList.remove('met'); }); return; }
  var n = meets(pw);
  var lvl = n === 5 ? 'strong' : n >= 4 ? 'good' : n >= 3 ? 'fair' : 'weak';
  fill.className = 'strength-fill ' + lvl;
  text.textContent = { weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong' }[lvl];
  text.className = 'strength-text ' + lvl;
  var checks = { length: pw.length >= 8, upper: /[A-Z]/.test(pw), lower: /[a-z]/.test(pw), number: /[0-9]/.test(pw), special: /[!@#$%^&*(),.?":{}|<>]/.test(pw) };
  var map = { length: 'length', upper: 'upper', lower: 'lower', number: 'number', special: 'special' };
  reqs.querySelectorAll('.req').forEach(function(r) {
    var key = map[r.dataset.check];
    if (key) r.classList.toggle('met', checks[key]);
  });
}

/* ── Review ───────────────────────────────────────────────────────────────── */
function buildReview() {
  var c = document.getElementById('reviewContent');
  if (!c) return;
  var sections = [
    { title: 'Admin Account', icon: 'fa-user-shield', rows: [
      ['Username', data.username], ['Email', data.email], ['Full Name', data.fullName || '']
    ]},
    { title: 'Website', icon: 'fa-globe', rows: [
      ['Site Name', data.siteName], ['Tagline', data.siteTagline || ''], ['Type', data.siteType || ''], ['Language', data.siteLanguage || '']
    ]},
    { title: 'Database', icon: 'fa-database', rows: [
      ['Type', data.dbType || ''], ['Host', data.dbHost || 'N/A'], ['Port', data.dbPort || 'N/A'], ['Name', data.dbName || 'N/A']
    ]},
    { title: 'Features', icon: 'fa-sliders', rows: [
      ['Comments', data.enableComments === false ? 'Off' : 'On'],
      ['Categories', data.enableCategories === false ? 'Off' : 'On'],
      ['Media Library', data.enableMedia === false ? 'Off' : 'On'],
      ['SEO Tools', data.enableSEO === false ? 'Off' : 'On'],
      ['2FA', data.enable2FA ? 'On' : 'Off'],
      ['Backups', data.enableBackups ? 'On' : 'Off']
    ]}
  ];
  var html = '';
  sections.forEach(function(s) {
    html += '<div class="review-section"><h4><i class="fa-solid ' + s.icon + '"></i> ' + s.title + '</h4>';
    s.rows.forEach(function(r) {
      html += '<div class="review-row"><span class="rev-label">' + r[0] + '</span><span class="rev-value">' + (r[1] || '—') + '</span></div>';
    });
    html += '</div>';
  });
  c.innerHTML = html;
}

/* ── Submit ───────────────────────────────────────────────────────────────── */
async function submit(btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Setting up...';
  try {
    var fd = new FormData();
    Object.keys(data).forEach(function(k) {
      if (k.startsWith('_')) return;
      fd.append(k, data[k]);
    });
    var res = await fetch('/acr/api/firstuser-setup', { method: 'POST', body: fd });
    var r = await res.json();
    if (r.success) {
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restarting server...';
      clear();
      var redirectUrl = r.controlUrl || '/acroxa/login';
      // Wait for server restart (config saved → restart triggered)
      setTimeout(function() {
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Done!';
        // Keep polling until server is back up
        var retries = 0;
        var poll = setInterval(function() {
          retries++;
          fetch('/acr/api/verify', { credentials: 'include' }).then(function() {
            clearInterval(poll);
            window.location.href = redirectUrl;
          }).catch(function() {
            if (retries > 20) {
              clearInterval(poll);
              window.location.href = redirectUrl;
            }
          });
        }, 1000);
      }, 3000);
    } else {
      throw new Error(r.message || 'Setup failed');
    }
  } catch (e) {
    toast('Setup failed: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Complete Setup';
  }
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
function toast(msg, type) {
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  var t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + ' toast-icon"></i><div class="toast-body">' + msg.replace(/\n/g, '<br>') + '</div><button class="toast-close">&times;</button>';
  t.querySelector('.toast-close').addEventListener('click', function() { t.remove(); });
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 5000);
}

/* ── Restore Popup ────────────────────────────────────────────────────────── */
function showRestore() {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:99999;';
  ov.innerHTML = '<div style="background:var(--color-primary-100);border-radius:20px;padding:35px;max-width:420px;width:90%;text-align:center;border:1px solid var(--color-primary-300);box-shadow:0 20px 50px rgba(0,0,0,0.2);"><div style="width:60px;height:60px;margin:0 auto 16px;background:var(--accent-500);border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-clock-rotate-left" style="font-size:24px;color:#fff;"></i></div><h3 style="margin-bottom:8px;color:var(--color-primary-700);">Continue Setup?</h3><p style="font-size:14px;color:var(--gray-600);margin-bottom:20px;">We found your previous progress.</p><div style="display:flex;gap:10px;"><button id="restoreYes" class="setup-btn setup-btn-primary" style="flex:1;justify-content:center;"><i class="fa-solid fa-check"></i> Continue</button><button id="restoreNo" class="setup-btn" style="flex:1;justify-content:center;"><i class="fa-solid fa-xmark"></i> Start Fresh</button></div></div>';
  document.body.appendChild(ov);
  document.getElementById('restoreYes').addEventListener('click', function() {
    if (data._step) { step = data._step; show(); }
    ov.remove();
    restoreFields();
  });
  document.getElementById('restoreNo').addEventListener('click', function() { clear(); ov.remove(); });
}

function restoreFields() {
  document.querySelectorAll('.setup-input').forEach(function(f) {
    if (data[f.id]) f.value = data[f.id];
  });
  if (data.dbType) {
    var card = document.querySelector('.radio-card[data-value="' + data.dbType + '"]');
    if (card) { card.classList.add('selected'); handleDbFields(data.dbType); }
  }
}
