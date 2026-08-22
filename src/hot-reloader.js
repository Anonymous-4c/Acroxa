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

    this.ignored = [/node_modules/, /\.git/, /uploads/, /pub-dist/];
  }

  // -----------------------------
  // START
  // -----------------------------
  start() {
    console.log('\n🔥 ACROXA FILE-INDEX HOT RELOADER STARTED\n');
    console.log('📁 ROOT:', this.root);

    this.files = this.scanFiles(this.root);

    console.log(`📦 Indexed files: ${this.files.length}`);

    this.watcher = chokidar.watch(this.files, {
      ignoreInitial: true,
      usePolling: process.platform === 'win32',
      awaitWriteFinish: true
    });

    this.watcher
      .on('ready', () => {
        console.log('\n🚀 Watcher Ready (file-index mode)\n');
      })
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
  // FILE EVENT HANDLER
  // -----------------------------
  handle(type, file) {
    console.log(`📄 ${type.toUpperCase()}: ${file}`);

    if (this.isReloading) return;
    this.isReloading = true;

    try {
      if (type === 'add')    this.files.push(file);
      if (type === 'unlink') this.files = this.files.filter(f => f !== file);

      this.clearCache(file);
      this.smartReload(file);

    } catch (err) {
      console.error('❌ Reload Error:', err);
    } finally {
      setTimeout(() => { this.isReloading = false; }, 150);
    }
  }

  // -----------------------------
  // SMART RELOAD ROUTER
  // -----------------------------
  smartReload(file) {
    const sep = path.sep;

    if (file.endsWith(`${sep}pages.js`)) {
      console.log('♻️  Reload pages');
      global.acrx?.reloadPageRenderers?.();
      return;
    }

    if (file.includes(`${sep}routes${sep}`)) {
      console.log('♻️  Reload routes');
      global.acrx?.reloadRoutes?.();
      return;
    }

    if (file.includes(`${sep}views${sep}`)) {
      console.log('♻️  Reload views');
      global.acrx?.reloadPageRenderers?.();
      return;
    }

    if (file.includes(`${sep}layouts${sep}`)) {
      console.log('♻️  Reload layouts');
      this._reloadActiveLayout();
      global.acrx?.reloadPageRenderers?.();
      return;
    }

    if (file.includes(`${sep}extensions${sep}`)) {
      console.log('♻️  Reload extensions');
      global.acrx?.reloadExtensions?.();
      return;
    }

    if (
      file.includes(`${sep}modules${sep}`) ||
      file.includes(`${sep}functions${sep}`) ||
      file.includes(`${sep}core${sep}`)
    ) {
      console.log('♻️  Reload system core');
      global.acrx?.reloadRoutes?.();
      global.acrx?.reloadPageRenderers?.();
      return;
    }

    console.log('♻️  Generic reload');
    global.acrx?.reloadRoutes?.();
    global.acrx?.reloadPageRenderers?.();
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

    console.log(`♻️  Re-initializing layout: ${layoutId}`);

    initializeLayout(global.acrx, layoutId)
      .then(() => console.log(`✅ Layout hot-reloaded: ${layoutId}`))
      .catch(err => console.error(`❌ Layout reload failed (${layoutId}):`, err.message));
  }

  // -----------------------------
  // CACHE CLEAR
  // -----------------------------
  clearCache(file) {
    let count = 0;

    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(this.root)) {
        delete require.cache[key];
        count++;
      }
    }

    console.log(`🧹 Cache cleared: ${count} modules`);
  }

  // -----------------------------
  // STOP
  // -----------------------------
  stop() {
    this.watcher?.close();
    console.log('🛑 Hot Reloader Stopped');
  }
}

module.exports = CMSHotReloader;