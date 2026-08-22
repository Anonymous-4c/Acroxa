const fs = require('fs');
const path = require('path');
const Layout = require('./layoutHelpers');

let watcher = null;

// -----------------------------
// Start Watching Active Layout
// -----------------------------
function startLayoutWatcher(acrx) {
  const getPath = () => {
    const layoutId = Layout.getActiveLayout();
    if (!layoutId) return null;

    return path.join(
      process.cwd(),
      'src/layouts',
      layoutId,
      'meta.json'
    );
  };

  function watch() {
    const filePath = getPath();
    if (!filePath) return;

    if (watcher) watcher.close();

    watcher = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;

      try {
        const newMeta = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // 🔥 update global state instantly
        Layout.setActiveLayout(Layout.getActiveLayout(), newMeta);

        console.log(`[HotReload] meta.json updated → ${Layout.getActiveLayout()}`);
      } catch (err) {
        console.error(`[HotReload Error]`, err.message);
      }
    });
  }

  // initial watch
  watch();

  // 🔥 rebind watcher if layout changes
  const interval = setInterval(() => {
    watch();
  }, 2000);

  return () => {
    clearInterval(interval);
    if (watcher) watcher.close();
  };
}

module.exports = { startLayoutWatcher };