// acrx/assets/js/api-client.js — Acroxa frontend API client (admin + shared).
// Provides what every component was hand-rolling: dedup, caching, keys,
// invalidation, cancellation, loading/error shape, retry for safe GETs.
// Dependency-free classic script: <script src="/acrx/assets/js/api-client.js"></script>
// exposes window.AcroxaApi. Progressive enhancement — callers must fall back
// to fetch() when absent (SSR/no-JS stays intact).
//
//   const api = window.AcroxaApi;
//   const { data, error } = await api.get('/acr/api/approvals/all', { ttlMs: 15000 });
//   api.invalidate('/acr/api/approvals'); // after a mutation
//
// Cache rules: GET only, in-memory, TTL per call (default 15s). Mutations
// (POST/PUT/PATCH/DELETE) never cached and invalidate related GET keys when
// `invalidatePrefix` is passed. Auth/user data is keyed by URL as-is —
// callers must not share URLs across users (cookies already isolate).

(function ApiClientModule() {
  'use strict';

  var cache = new Map();   // key -> { value, expiresAt }
  var pending = new Map(); // key -> Promise (in-flight dedup)
  var stats = { hits: 0, misses: 0, deduped: 0, requests: 0, errors: 0 };
  var DEFAULT_TTL = 15000;
  var TIMEOUT_MS = 15000;

  function keyFor(method, url, body) {
    var b = '';
    if (body !== undefined && body !== null) {
      try { b = typeof body === 'string' ? body : JSON.stringify(body); }
      catch (_) { b = String(body); }
    }
    return method.toUpperCase() + ' ' + url + (b ? '|' + b.slice(0, 512) : '');
  }

  function isExpired(entry) {
    return !entry || (entry.expiresAt !== 0 && entry.expiresAt <= Date.now());
  }

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  async function request(method, url, opts) {
    opts = opts || {};
    var m = String(method || 'GET').toUpperCase();
    var isGet = m === 'GET';
    var ttlMs = opts.ttlMs !== undefined ? opts.ttlMs : (isGet ? DEFAULT_TTL : 0);
    var useCache = isGet && ttlMs > 0 && !opts.noCache;
    var key = keyFor(m, url, opts.body);

    if (useCache) {
      var hit = cache.get(key);
      if (hit && !isExpired(hit)) {
        stats.hits++;
        return hit.value;
      }
      stats.misses++;
      var inflight = pending.get(key);
      if (inflight) {
        stats.deduped++;
        return inflight;
      }
    }

    stats.requests++;
    emit('acrx:api-request', { method: m, url: url });

    var controller = null;
    var signal = opts.signal || null;
    try {
      if (typeof AbortController !== 'undefined' && !signal) {
        controller = new AbortController();
        signal = controller.signal;
      }
    } catch (_) {}

    var timeoutId = null;
    if (controller && !opts.noTimeout) {
      timeoutId = setTimeout(function () {
        try { controller.abort(); } catch (_) {}
      }, opts.timeoutMs || TIMEOUT_MS);
    }

    var fetchOpts = {
      method: m,
      credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, opts.headers || {}),
      signal: signal || undefined,
    };
    if (opts.body !== undefined) {
      if (typeof opts.body === 'string' || (typeof FormData !== 'undefined' && opts.body instanceof FormData)) {
        fetchOpts.body = opts.body;
      } else {
        fetchOpts.body = JSON.stringify(opts.body);
        if (!fetchOpts.headers['Content-Type']) fetchOpts.headers['Content-Type'] = 'application/json';
      }
    }

    var attempts = opts.retry !== undefined ? opts.retry : (isGet ? 1 : 0);

    function doFetch() {
      return fetch(url, fetchOpts).then(function (res) {
        var ct = '';
        try { ct = res.headers.get('content-type') || ''; } catch (_) {}
        if (ct.indexOf('application/json') !== -1) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        }
        return res.text().then(function (text) {
          return { ok: res.ok, status: res.status, data: text };
        });
      });
    }

    var promise = (async function () {
      var lastErr = null;
      for (var i = 0; i <= attempts; i++) {
        try {
          var out = await doFetch();
          if (timeoutId) clearTimeout(timeoutId);
          if (!out.ok) {
            stats.errors++;
            emit('acrx:api-error', { method: m, url: url, status: out.status });
          } else {
            emit('acrx:api-response', { method: m, url: url, status: out.status });
          }
          if (useCache && out.ok) {
            cache.set(key, { value: out, expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0 });
          }
          // Mutation auto-invalidation when caller passes a prefix.
          if (!isGet && opts.invalidatePrefix) invalidate(opts.invalidatePrefix);
          return out;
        } catch (err) {
          lastErr = err;
          if (err && err.name === 'AbortError') break;
          if (i < attempts) continue;
          break;
        }
      }
      if (timeoutId) clearTimeout(timeoutId);
      stats.errors++;
      emit('acrx:api-error', { method: m, url: url, error: String((lastErr && lastErr.message) || lastErr) });
      return { ok: false, status: 0, data: null, error: lastErr };
    })();

    if (useCache) {
      pending.set(key, promise);
      promise.then(
        function () { pending.delete(key); },
        function () { pending.delete(key); }
      );
    }
    return promise;
  }

  function get(url, opts) {
    return request('GET', url, opts);
  }

  function post(url, body, opts) {
    return request('POST', url, Object.assign({}, opts, { body: body }));
  }

  // Invalidate every cached GET whose key starts with the given prefix.
  // Prefix matches "METHOD URL" form or plain URL substring.
  function invalidate(prefix) {
    if (!prefix) return 0;
    var n = 0;
    var keys = Array.from(cache.keys());
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(prefix) !== -1) {
        cache.delete(keys[i]);
        n++;
      }
    }
    emit('acrx:api-invalidated', { prefix: prefix, count: n });
    return n;
  }

  function clear() {
    var n = cache.size;
    cache.clear();
    pending.clear();
    return n;
  }

  function getStats() {
    return { hits: stats.hits, misses: stats.misses, deduped: stats.deduped, requests: stats.requests, errors: stats.errors, cached: cache.size, inflight: pending.size };
  }

  var api = { request: request, get: get, post: post, invalidate: invalidate, clear: clear, getStats: getStats };
  if (typeof window !== 'undefined') window.AcroxaApi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
