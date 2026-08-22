
// auto-backup.js
// Acroxa Single-File Auto Backup System

const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const archiver = require("archiver");

function initAutoBackup(options = {}) {
  if(process.env.NODE_ENV === "pub") {
  const config = {
    watchPath: options.watchPath || process.cwd(),
    backupDir: options.backupDir || "./backups",
    interval: options.interval || 1000 * 60 * 10,
    ignore: options.ignore || ["node_modules", "backups", ".git", "pub-dist", "public"],
    silent: options.silent ?? true,
  };

  fs.mkdirSync(config.backupDir, { recursive: true });

  const createSnapshot = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backup-${timestamp}.zip`;
    const filePath = path.join(config.backupDir, fileName);
s
    const output = fs.createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      if (!config.silent) {
        console.log(`[AutoBackup] created ${fileName}`);
      }
    });

    archive.on("error", (err) => {
      console.error("[AutoBackup] error:", err);
    });

    archive.pipe(output);

    archive.glob("**/*", {
      cwd: config.watchPath,
      ignore: config.ignore.map((i) => `**/${i}/**`),
    });

    archive.finalize();
  };

  // --- File watcher (debounced) ---
  let timeout = null;

  const watcher = chokidar.watch(config.watchPath, {
    ignored: config.ignore,
    persistent: true,
    ignoreInitial: true,
  });

  const trigger = () => {
    clearTimeout(timeout);
    timeout = setTimeout(createSnapshot, 3000);
  };

  watcher.on("add", trigger);
  watcher.on("change", trigger);
  watcher.on("unlink", trigger);

  // --- fallback interval backup ---
  setInterval(createSnapshot, config.interval);

  if (!config.silent) {
    console.log("[AutoBackup] initialized");
  }

  return {
    stop: () => watcher.close(),
  };}
}

module.exports = initAutoBackup;
