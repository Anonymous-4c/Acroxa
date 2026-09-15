const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { connectDB } = require("./core/connect-db.js");
const Layout = require('./core/layoutHelpers');
const { initializeLayout } = require('./layouts/framework/init.js');

class CMSHotReloader {
  constructor() {
    this.root = path.resolve(__dirname, '..', 'src');

    this.files = [];
    this.watcher = null;
    this.isReloading = false;
    this.pending = [];       // coalescing queue for rapid saves (§18)
    this._flushTimer = null;

    this.ignored = [/node_modules/, /\.git/, /uploads/, /pub-dist/];
  }

  // -----------------------------
  // START
  // -----------------------------
  start() {
    if (process.env.NODE_ENV !== "production") console.log(`🔥 Hot reloader watching ${this.root}`);
    this.files = this.scanFiles(this.root);

    // Watch the directory tree (not a frozen file list) so brand-new files
    // (add) and new subdirectories are observed. `ignored` keeps dependency
    // / upload / build output out. ignoreInitial preserves boot semantics.
    this.watcher = chokidar.watch(this.root, {
      ignored: this.ignored,
      ignoreInitial: true,
      usePolling: process.platform === 'win32',
      awaitWriteFinish: true
    });

    this.watcher
      .on('add',    f => this.handle('add', f))
      .on('change', f => this.handle('change', f))
      .on('unlink', f => this.handle('unlink', f))
      .on('error',  err => console.error('❌ Watcher Error:', err));
  }

  // -----------------------------
  // FILE SCANNER (RECURSIVE)
  // -----------------------------
  scanFiles(dir, out = []) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const full = path.join(dir, item);
      if (this.shouldIgnore(full)) continue;
      if (fs.statSync(full).isDirectory()) {
        this.scanFiles(full, out);
      } else {
        out.push(full);
      }
    }

    return out;
  }

  shouldIgnore(file) {
    return this.ignored.some(r => r.test(file));
  }

  // -----------------------------
  // FILE EVENT HANDLER (coalescing — rapid saves become one transaction §18)
  // -----------------------------
  handle(type, file) {
    // Watch new files immediately so new dirs aren't missed; the reload work
    // waits for the 250ms coalescing window.
    if (type === 'add') {
      try { this.watcher?.add?.(file); } catch (_) {}
    }
    this.pending.push({ type, file });
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      try { this._flush(); } catch (err) { console.error('❌ Reload Error:', err); }
    }, 250);
  }

  _flush() {
    const batch = this.pending;
    this.pending = [];
    if (!batch.length) return;
    this.isReloading = true;
    try {
      for (const { type, file } of batch) {
        if (type === 'add' && !this.files.includes(file)) this.files.push(file);
        if (type === 'unlink') {
          this.files = this.files.filter(f => f !== file);
          // Drop the deleted file's impact edges (same bare-path key space
          // pages.js declares) so later invalidations of that path don't
          // claim pages it no longer renders.
          try { require('./core/runtime/graph').remove(String(file).replace(/\\/g, '/')); } catch (_) {}
        }
        try { this.clearCache(file); } catch (e) { console.error('❌ Cache clear failed:', e.message); }
      }
      const seen = new Map();
      for (const e of batch) if (!seen.has(e.file)) seen.set(e.file, e);
      const classified = [];
      for (const { file } of seen.values()) {
        try {
          const c = this.smartReload(file); // local actions + legacy notify
          if (c && c.kind !== 'config') classified.push({ file, kind: c.kind, scope: c.scope });
        } catch (err) { console.error('❌ Reload Error:', err.message); }
      }
      // One coherent invalidation for the whole batch (§50 transaction).
      if (classified.length) {
        try {
          const inv = require('./core/runtime/invalidate');
          if (classified.length === 1) {
            const c = classified[0];
            let strategy = null;
            try { strategy = require('./core/runtime/planner').choose({ kind: c.kind, scope: c.scope }).strategy; } catch (_) {}
            inv.invalidate({
              type: c.kind, id: String(c.file),
              scope: c.scope === 'stylesheet' ? 'stylesheet' : c.scope,
              reason: `change:${path.basename(String(c.file))}`, strategy,
            });
            if (process.env.NODE_ENV !== "production") {
              try {
                const g = require('./core/runtime/graph').affectedBy(String(c.file));
                console.log(`[Acroxa:RUNTIME] affected by ${path.basename(String(c.file))}: ${g.length ? g.slice(0, 8).join(", ") : "(none)"}`);
              } catch (_) {}
            }
          } else {
            inv.bundle(
              classified.map(c => ({ type: c.kind, id: String(c.file), scope: c.scope })),
              { reason: `batch:${classified.length}` }
            );
          }
          if (process.env.NODE_ENV !== "production") {
            console.log(`[Acroxa:RUNTIME] batch:${classified.length} applied (rev ${require('./core/runtime/revision').get()})`);
          }
        } catch (e) { console.warn('[HotReloader] invalidate:', e.message); }
      }
    } finally {
      this.isReloading = false;
    }
  }

  // -----------------------------
  // SMART RELOAD ROUTER (local actions only — batch owner invalidates)
  // Returns { kind, scope } for the batch transaction.
  // -----------------------------
  smartReload(file) {
    let c = null;
    try { c = require('./core/runtime/pipeline').classify(file); }
    catch (_) { c = this.classifyChange(file); }
    const { kind, scope } = c;
    let plan = null;
    try { plan = require('./core/runtime/planner').choose({ kind, scope }).strategy; } catch (_) {}
    console.log(`♻️  Reload [${kind}/${scope}]: ${path.basename(String(file))}${plan ? ` → ${plan}` : ""}`);

    const notify = (event, data) => {
      try { require('./core/sseHub').broadcast(event, data || {}); } catch (_) {}
      try {
        const events = require('./core/runtime/events');
        events.emit(event.replace('.', ':'), data || {});
      } catch (_) {}
    };

    const norm = String(file).replace(/\\/g, '/');

    // CSS: stylesheet swap only — never full reload, never cache nuke.
    if (kind === 'css') {
      notify('layout.updated', { file, kind });
      return c;
    }

    // Frontend JS: module reload + affected hydration roots (no page reload).
    if (kind === 'frontend') {
      notify('page.updated', { file, kind });
      return c;
    }

    if (norm.endsWith('routes/pages.js')) {
      this._rebuildPages([file]);
      notify('page.updated', { file, kind });
      return c;
    }

    if (kind === 'route' || kind === 'api') {
      try { require('./core/loadRoutes').reloadRoutes(); } catch (e) { console.error('❌ reloadRoutes:', e.message); }
      try { global.acrx?.reloadRoutes?.(); } catch (_) {}
      return c;
    }

    if (kind === 'view') {
      this._rebuildPages([file]);
      notify('page.updated', { file, kind });
      return c;
    }

    if (kind === 'layout' || kind === 'meta') {
      this._reloadActiveLayout();
      this._rebuildPages([file]);
      notify('layout.updated', { file, kind });
      return c;
    }

    if (norm.includes('/extensions/')) {
      global.acrx?.reloadExtensions?.();
      return c;
    }

    if (kind === 'config') {
      console.warn('⚠️  Config changed — restart to apply (hot swap is unsafe for DB/auth/paths).');
      notify('settings.updated', { file, kind, restartRequired: true });
      return c;
    }

    try { require('./core/runtime/cache').invalidate('route:*'); } catch (_) {}
    global.acrx?.reloadRoutes?.();
    this._rebuildPages([file]);
    return c;
  }

  // Rebuild admin pages through the stable proxy (index.js). Falls back to
  // the notify shim when the server predates rebuildPagesRouter.
  _rebuildPages(files) {
    try {
      if (global.acrx && typeof global.acrx.rebuildPagesRouter === 'function') {
        const r = global.acrx.rebuildPagesRouter(files);
        if (!r || r.success === false) console.error('❌ Pages rebuild failed:', r && r.error);
      } else {
        global.acrx?.reloadPageRenderers?.();
      }
    } catch (e) { console.error('❌ Pages rebuild failed:', e.message); }
  }

  // -----------------------------
  // LAYOUT RELOAD (safe)
  // -----------------------------
  _reloadActiveLayout() {
    const layoutId = Layout.getActiveLayout();

    if (!layoutId) {
      console.warn('[HotReloader] No active layout set — skipping layout reload');
      return;
    }

    initializeLayout(global.acrx, layoutId)
      .then(() => { if (process.env.NODE_ENV !== "production") console.log(`✅ Layout hot-reloaded: ${layoutId}`); })
      .catch(err => console.error(`❌ Layout reload failed (${layoutId}):`, err.message));
  }

  // -----------------------------
  // CLASSIFY CHANGE (single coherent strategy, spec §34)
  // Returns { kind, scope } so callers invalidate the smallest safe set.
  // -----------------------------
  classifyChange(file) {
    const norm = String(file || '').replace(/\\/g, '/');
    const lower = norm.toLowerCase();
    if (lower.endsWith('.css')) return { kind: 'css', scope: 'stylesheet' };
    if (lower.endsWith('.json') && norm.includes('/layouts/')) return { kind: 'meta', scope: 'layout-meta' };
    if (norm.includes('/layouts/')) return { kind: 'layout', scope: 'layout' };
    if (norm.includes('/views/')) return { kind: 'view', scope: 'view' };
    if (norm.includes('/routes/')) return { kind: 'route', scope: 'routes' };
    if (norm.includes('/controllers/') || norm.includes('/services/')) return { kind: 'api', scope: 'api' };
    if (norm.includes('acrx/assets/js')) return { kind: 'frontend', scope: 'frontend-module' };
    if (norm.includes('/core/') || norm.includes('/modules/') || norm.includes('/functions/')) return { kind: 'backend', scope: 'core' };
    if (lower.endsWith('.json') && (lower.includes('config') || lower.includes('paths'))) return { kind: 'config', scope: 'config' };
    if (norm.includes('/models/')) return { kind: 'backend', scope: 'models' };
    return { kind: 'backend', scope: 'generic' };
  }

  // -----------------------------
  // SCOPED CACHE CLEAR (never nuke all of src/)
  // Deletes only the changed file + its children bounded to src/.
  // src/core/ is NEVER cascade-evicted: it holds the process-stable
  // runtime singletons (registry, hookBus, events, targets, owners,
  // apiRegistry dispatch). Evicting them as a side effect of editing an
  // unrelated controller/view silently wipes all registrations and kills
  // every hook until restart. Feature code (views/routes/layouts) refreshes
  // through the designated rebuild paths; core changes restart the process.
  // -----------------------------
  clearModuleScoped(file) {
    let count = 0;
    const visited = new Set();
    const coreRoot = path.join(this.root, "core") + path.sep;
    const drop = (target, isExplicit = false) => {
      if (!target || visited.has(target)) return;
      visited.add(target);
      const mod = require.cache[target];
      if (!mod) {
        // Not cached yet — still count the file itself as handled.
        return;
      }
      for (const child of mod.children || []) {
        try {
          if (!child.filename || !child.filename.startsWith(this.root)) continue;
          if (!isExplicit && child.filename.startsWith(coreRoot)) continue;
          drop(child.filename);
        } catch (_) {}
      }
      // Only the explicitly changed file may evict itself from core;
      // cascade walks never touch core singletons.
      if (!isExplicit && target.startsWith(coreRoot)) return;
      try {
        delete require.cache[target];
        count++;
      } catch (_) {}
    };
    try {
      const resolved = require.resolve(file);
      drop(resolved, true);
    } catch (_) {
      // File may be ESM/layout asset with no require.cache entry — nothing to drop.
    }
    return count;
  }

  // Back-compat alias: old callers expect clearCache(file).
  clearCache(file) {
    const count = this.clearModuleScoped(file);
    console.log(`🧹 Cache cleared (scoped): ${count} module(s) for ${path.basename(String(file))}`);
    return count;
  }

  // -----------------------------
  // STOP
  // -----------------------------
  stop() {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    this.pending = [];
    this.watcher?.close();
    console.log('🛑 Hot Reloader Stopped');
  }
}

module.exports = CMSHotReloader;