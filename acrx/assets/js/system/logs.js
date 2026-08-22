'use strict';

document.addEventListener('DOMContentLoaded', () => {

  const viewer   = document.getElementById('log-viewer');
  const search   = document.getElementById('log-search');
  const levelInp = document.getElementById('logLevelFilter');
  const refreshBtn = document.getElementById('refresh-logs');
  const clearBtn   = document.getElementById('clear-logs');

  // ─────────────────────────────
  // STATE
  // ─────────────────────────────

  let allLogs = [];
  let seen = new Set();
  let stream = null;
  let reconnectTimer = null;
  let renderQueued = false;

  const MAX_LOGS = 1000;

  // Ensure wrapper exists
  let wrapper = viewer.querySelector('.log-wrapper');

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'log-wrapper';
    viewer.appendChild(wrapper);
  }

  const LEVEL_MAP = {
    error: 'danger',
    warn: 'warning',
    info: 'info',
    debug: 'neutral',
    log: 'neutral',
    uncaughtexception: 'danger',
    unhandledrejection: 'danger'
  };

  // ─────────────────────────────
  // RENDER QUEUE
  // ─────────────────────────────

  function queueRender() {

    if (renderQueued) return;

    renderQueued = true;

    requestAnimationFrame(() => {
      render();
      renderQueued = false;
    });
  }

  // ─────────────────────────────
  // RENDER LOGS
  // ─────────────────────────────

  function render() {

    const level = levelInp?.value || 'all';
    const query = (search?.value || '').toLowerCase();

    const filtered = allLogs.filter(l => {

      const lvl = (l.level || 'info').toLowerCase();

      const okLevel =
        level === 'all' || lvl === level;

      const okText =
        !query ||
        l.message.toLowerCase().includes(query);

      return okLevel && okText;
    });

    if (!wrapper) return;

    if (!filtered.length) {
      wrapper.innerHTML = `
        <div class="log-placeholder">
          <p class="text-muted">No logs found</p>
        </div>
      `;
      return;
    }

    wrapper.innerHTML = filtered.map(l => {

      const time = l.timestamp
        ? new Date(l.timestamp).toLocaleTimeString()
        : '';

      return `
        <div class="log-entry log-${l.level}">
          <span class="log-ts text-muted">${time}</span>

          <span class="log-level badge badge-${
            LEVEL_MAP[l.level] || 'neutral'
          }">
            ${l.level.toUpperCase()}
          </span>

          <span class="log-msg">
            ${escapeHtml(l.message)}
          </span>
        </div>
      `;

    }).join('');

    // IMPORTANT: scroll INNER wrapper only
    wrapper.scrollTop = wrapper.scrollHeight;
  }

  // ─────────────────────────────
  // NORMALIZE MESSAGE
  // ─────────────────────────────

  function normalize(msg) {

    if (Array.isArray(msg)) {
      return msg.map(v =>
        typeof v === 'object'
          ? JSON.stringify(v)
          : String(v)
      ).join(' ');
    }

    if (typeof msg === 'object' && msg) {
      return JSON.stringify(msg);
    }

    return String(msg ?? '');
  }

  // ─────────────────────────────
  // SSE CONNECTION
  // ─────────────────────────────

  function connect(reset = false) {

    if (stream) {
      stream.close();
      stream = null;
    }

    clearTimeout(reconnectTimer);

    if (reset) {
      allLogs = [];
      seen.clear();
      wrapper.innerHTML = '';
    }

    stream = new EventSource(
      '/acr/api/system/logs/live'
    );

    stream.onmessage = (e) => {

      const log = JSON.parse(e.data);

      const id =
        log.id ||
        `${log.timestamp}-${log.message}`;

      if (seen.has(id)) return;
      seen.add(id);

      const entry = {
        id,
        level: (log.type || log.level || 'info').toLowerCase(),
        timestamp: log.timestamp || Date.now(),
        message: normalize(log.message)
      };

      allLogs.push(entry);

      if (allLogs.length > MAX_LOGS) {
        const removed = allLogs.shift();
        seen.delete(removed.id);
      }

      queueRender();
    };

    stream.onerror = () => {

      stream.close();
      stream = null;

      reconnectTimer = setTimeout(() => {
        connect(false);
      }, 2500);
    };
  }

  // ─────────────────────────────
  // CONTROLS
  // ─────────────────────────────

  refreshBtn?.addEventListener('click', () => {
    connect(true);
  });

  clearBtn?.addEventListener('click', async () => {

    if (!confirm('Clear logs?')) return;

    await fetch('/acr/api/system/logs', {
      method: 'DELETE',
      credentials: 'include'
    });

    allLogs = [];
    seen.clear();

    render();
  });

  search?.addEventListener('input', render);
  levelInp?.addEventListener('change', render);

  // ─────────────────────────────
  // VISIBILITY HANDLING
  // ─────────────────────────────

  document.addEventListener('visibilitychange', () => {

    if (document.hidden) {
      stream?.close();
    } else {
      connect(false);
    }

  });

  window.addEventListener('beforeunload', () => {
    stream?.close();
  });

  // ─────────────────────────────
  // ESCAPE HTML
  // ─────────────────────────────

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#039;'
    }[c]));
  }

  // ─────────────────────────────
  // START STREAM
  // ─────────────────────────────

  connect(false);

});