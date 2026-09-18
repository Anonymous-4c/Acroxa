// src/core/runtime/render/deps.js
// AcroxaJS static dependency scanner (Phase 3).
// Extracts require() specifiers from a source file and resolves relative
// ones to normalized absolute paths — the same bare-path key space
// graph.js/hot-reloader use for invalidation queries. Bounded to the
// watched src/ tree: bare module names (chokidar, express, ...) are
// skipped, so only project-internal edges are declared.
//
// Purpose: view → component/module/service/framework edges. With these,
// affectedBy(changedFile) BFS walks file → view → page without executing
// any code. Deterministic, cheap (one read per view per rebuild).

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEPS = 200;

function srcRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

/**
 * Scan `filePath` for require() dependencies. Returns a unique list of
 * normalized absolute paths (forward slashes) bounded to src/, max 200.
 * Never throws — unreadable files return [].
 */
function scanFileImports(filePath) {
  const out = [];
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return out;
    const src = fs.readFileSync(filePath, "utf8");
    const root = srcRoot();
    let m;
    REQUIRE_RE.lastIndex = 0;
    while ((m = REQUIRE_RE.exec(src)) !== null) {
      const spec = m[1];
      if (!spec || (!spec.startsWith("./") && !spec.startsWith("../"))) continue;
      let resolved;
      try {
        // require.resolve matches Node's actual loading (adds .js/index.js
        // for extensionless requires); path.resolve alone would record
        // `./lib/framework` where the real file is framework.js and the
        // invalidation query would never match.
        resolved = require.resolve(spec, { paths: [path.dirname(filePath)] });
      } catch (_) {
        try { resolved = path.resolve(path.dirname(filePath), spec); } catch (_) { continue; }
      }
      const norm = resolved.replace(/\\/g, "/");
      if (!norm.startsWith(root.replace(/\\/g, "/") + "/")) continue;
      if (!out.includes(norm)) out.push(norm);
      if (out.length >= MAX_DEPS) break;
    }
  } catch (_) {}
  return out;
}

/**
 * Declare impact edges for a rendered page: page → view file + every
 * project-internal module the view requires. depend() overwrites, so
 * rebuilds re-declare idempotently.
 */
function declarePageDeps(pageId, viewFilePath) {
  const deps = [viewFilePath, ...scanFileImports(viewFilePath)];
  try {
    require("../graph").depend(pageId, deps);
  } catch (_) {}
  return deps;
}

module.exports = { scanFileImports, declarePageDeps, MAX_DEPS, MAX_FILE_BYTES };
