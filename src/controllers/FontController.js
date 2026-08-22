// src/controllers/fontController.js
//
// Handles Google Fonts search proxy, server-side font download,
// listing downloaded fonts, deleting fonts, and injecting/un-injecting
// fonts into the public site via pluginAPI.injectPublicAsset.
//
// Routes (in mediaRoutes.js):
//   GET  /acr/api/media/fonts/search?q=roboto      → proxy Google Fonts list
//   GET  /acr/api/media/fonts                      → list downloaded fonts
//   POST /acr/api/media/fonts/download             → download font to /uploads/fonts/
//   DELETE /acr/api/media/fonts/:slug              → delete a downloaded font
//   POST /acr/api/media/fonts/:slug/inject         → inject font into public site
//   POST /acr/api/media/fonts/:slug/uninject       → remove font injection

const path  = require("path");
const fs    = require("fs");
const https = require("https");

const FONT_DIR = path.join(__dirname, "../../pub-dist/uploads/fonts");
if (!fs.existsSync(FONT_DIR)) fs.mkdirSync(FONT_DIR, { recursive: true });

// Font injection state file (persisted to disk so it survives restarts)
const INJECT_STATE_FILE = path.join(FONT_DIR, "_injected.json");

const GF_API_KEY = process.env.GOOGLE_FONTS_API_KEY || "AIzaSyA2b1XzhOXdMnAcxbIgtMJtD-rsDDrjRqs";

// ─── Curated fallback list (used when no API key is set) ──────────────────
const POPULAR_FONTS = [
  "Roboto","Open Sans","Lato","Montserrat","Oswald","Raleway","Poppins",
  "Nunito","Ubuntu","Merriweather","Playfair Display","Source Sans 3",
  "Inter","Noto Sans","PT Sans","Roboto Slab","Mukta","Rubik",
  "Work Sans","Titillium Web","Fira Sans","Barlow","Quicksand","Heebo",
  "Josefin Sans","Cabin","Arimo","Oxygen","Libre Baskerville","DM Sans",
  "Space Grotesk","Lexend","Figtree","Outfit","Plus Jakarta Sans",
  "Manrope","Karla","Mulish","Nunito Sans","Epilogue","Be Vietnam Pro",
  "Syne","Cabinet Grotesk","General Sans","Clash Display",
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function familyToSlug(family) {
  return family.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function slugToFamily(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "AcroxaCMS/1.0",
        ...extraHeaders
      }
    }, (res) => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end",  () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

function httpsDownload(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", err => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// ─── Injection state helpers ───────────────────────────────────────────────

function readInjectState() {
  try {
    if (fs.existsSync(INJECT_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(INJECT_STATE_FILE, "utf8"));
    }
  } catch (_) {}
  return {}; // { slug: true/false }
}

function writeInjectState(state) {
  fs.writeFileSync(INJECT_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Sync injected fonts into publicAPI via pluginAPI.injectPublicAsset.
 * Called on boot and after inject/uninject changes.
 */
function syncPublicInjections() {
  const state = readInjectState();

  // Get the global registered list
  const pluginAPI = global.CMS?.pluginAPI;
  if (!pluginAPI) return;

  // Remove all previously injected font entries from publicInject
  const registered = global.CMS?.registered;
  if (registered?.publicInject) {
    registered.publicInject = registered.publicInject.filter(
      item => !(item.plugin === "acroxa-fonts")
    );
  }

  // Re-inject all active fonts
  for (const [slug, active] of Object.entries(state)) {
    if (!active) continue;
    const fontDir = path.join(FONT_DIR, slug);
    const cssFile = path.join(fontDir, "font.css");
    if (!fs.existsSync(cssFile)) continue;

    // Inject via the URL of the served font.css
    pluginAPI.injectPublicAsset({
      type:     "stylesheet",
      url:      `/uploads/fonts/${slug}/font.css`,
      location: "head",
      plugin:   "acroxa-fonts",
    });
  }
}

// ─── GET /acr/api/media/fonts/search ──────────────────────────────────────

async function searchFonts(req, res) {
  const q = (req.query.q || "").trim();
  if (!q || q.length < 2) return res.json({ fonts: [] });

  try {
    let fonts = [];
    if (GF_API_KEY) {
      const resp = await httpsGet(
        `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${GF_API_KEY}`
      );
      if (resp.status === 200) {
        const data = JSON.parse(resp.body);
        fonts = (data.items || [])
          .filter(f => f.family.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 15)
          .map(f => ({ family: f.family, category: f.category || "sans-serif" }));
      }
    } else {
      fonts = POPULAR_FONTS
        .filter(f => f.toLowerCase().includes(q.toLowerCase()))
        .map(f => ({ family: f, category: "sans-serif" }));
    }
    return res.json({ fonts });
  } catch (err) {
    console.error("[fonts] Search error:", err);
    return res.status(500).json({ fonts: [], error: err.message });
  }
}

// ─── GET /acr/api/media/fonts ─────────────────────────────────────────────
// Lists all downloaded fonts with their inject state and metadata.

function getFonts(req, res) {
  try {
    const injectState = readInjectState();

    if (!fs.existsSync(FONT_DIR)) return res.json({ success: true, fonts: [] });

    const entries = fs.readdirSync(FONT_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const slug    = d.name;
        const fontDir = path.join(FONT_DIR, slug);
        const cssFile = path.join(fontDir, "font.css");
        const hasCss  = fs.existsSync(cssFile);

        // Count font files
        let files = [];
        try {
          files = fs.readdirSync(fontDir).filter(f => f.endsWith(".woff2") || f.endsWith(".woff") || f.endsWith(".ttf"));
        } catch (_) {}

        // Stat for size
        let totalSize = 0;
        for (const f of files) {
          try { totalSize += fs.statSync(path.join(fontDir, f)).size; } catch (_) {}
        }

        // Get download date from the CSS file mtime
        let downloadedAt = null;
        if (hasCss) {
          try { downloadedAt = fs.statSync(cssFile).mtime.toISOString(); } catch (_) {}
        }

        return {
          slug,
          family:       slugToFamily(slug),
          injected:     !!(injectState[slug]),
          cssUrl:       hasCss ? `/uploads/fonts/${slug}/font.css` : null,
          fileCount:    files.length,
          totalSize,
          downloadedAt,
          fontDir:      `/uploads/fonts/${slug}`,
        };
      });

    return res.json({ success: true, fonts: entries });
  } catch (err) {
    console.error("[fonts] getFonts error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ─── POST /acr/api/media/fonts/download ───────────────────────────────────

async function downloadFont(req, res) {
  const { family } = req.body;
  if (!family) return res.status(400).json({ success: false, message: "Missing font family" });

  const slug    = familyToSlug(family);
  const fontDir = path.join(FONT_DIR, slug);

  // Already downloaded?
  if (fs.existsSync(fontDir) && fs.readdirSync(fontDir).filter(f => f !== "font.css" && f !== "_meta.json").length > 0) {
    return res.json({ success: true, cached: true, fontDir: `/uploads/fonts/${slug}`, message: "Already downloaded." });
  }

  fs.mkdirSync(fontDir, { recursive: true });

  try {
    // Fetch Google Fonts CSS with a modern UA to get woff2
    const cssUrl  = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
    const cssResp = await httpsGet(cssUrl, {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });

    if (cssResp.status !== 200) throw new Error(`Google Fonts CSS: HTTP ${cssResp.status}`);
    const css = cssResp.body;

    // Extract all font-face src woff2 URLs
    const urlMatches = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)];
    const fontUrls   = [...new Set(urlMatches.map(m => m[1]))];
    if (!fontUrls.length) throw new Error("No font URLs found in CSS response");

    // Extract weights from the CSS to map to URLs
    const faceBlocks = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m => m[1]);
    const weightMap  = {};
    for (const block of faceBlocks) {
      const urlMatch    = block.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/);
      const weightMatch = block.match(/font-weight:\s*(\d+)/);
      if (urlMatch && weightMatch) {
        weightMap[urlMatch[1]] = weightMatch[1];
      }
    }

    // Download each woff2
    const downloaded = [];
    for (const fontUrl of fontUrls) {
      const urlPath  = new URL(fontUrl).pathname;
      const fileName = path.basename(urlPath);
      const destPath = path.join(fontDir, fileName);
      if (!fs.existsSync(destPath)) await httpsDownload(fontUrl, destPath);
      downloaded.push({ file: `/uploads/fonts/${slug}/${fileName}`, url: fontUrl });
    }

    // Write local CSS pointing to downloaded files
    const localCss = downloaded.map(({ file, url }) => {
      const weight = weightMap[url] || "400";
      return `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('${file}') format('woff2');\n}`;
    }).join("\n\n");

    fs.writeFileSync(path.join(fontDir, "font.css"), localCss, "utf8");

    // Write meta
    fs.writeFileSync(path.join(fontDir, "_meta.json"), JSON.stringify({
      family, slug, downloadedAt: new Date().toISOString(), files: downloaded.map(d => d.file)
    }, null, 2), "utf8");

    console.log(`[fonts] Downloaded ${downloaded.length} files for "${family}"`);
    return res.json({ success: true, cached: false, family, slug, fontDir: `/uploads/fonts/${slug}`, cssFile: `/uploads/fonts/${slug}/font.css`, files: downloaded.map(d => d.file) });

  } catch (err) {
    try { fs.rmSync(fontDir, { recursive: true, force: true }); } catch (_) {}
    console.error("[fonts] Download error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── DELETE /acr/api/media/fonts/:slug ───────────────────────────────────

function deleteFont(req, res) {
  const { slug } = req.params;
  if (!slug) return res.status(400).json({ success: false, message: "Missing slug" });

  const fontDir = path.join(FONT_DIR, slug);
  if (!fs.existsSync(fontDir)) return res.status(404).json({ success: false, message: "Font not found" });

  try {
    fs.rmSync(fontDir, { recursive: true, force: true });

    // Remove from inject state
    const state = readInjectState();
    delete state[slug];
    writeInjectState(state);

    // Sync public injections (removes this font's CSS link)
    syncPublicInjections();

    return res.json({ success: true, message: `Font "${slugToFamily(slug)}" deleted.` });
  } catch (err) {
    console.error("[fonts] Delete error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── POST /acr/api/media/fonts/:slug/inject ───────────────────────────────

function injectFont(req, res) {
  const { slug } = req.params;
  const fontDir  = path.join(FONT_DIR, slug);
  const cssFile  = path.join(fontDir, "font.css");

  if (!fs.existsSync(cssFile)) {
    return res.status(404).json({ success: false, message: "Font CSS not found. Download the font first." });
  }

  const state = readInjectState();
  state[slug] = true;
  writeInjectState(state);
  syncPublicInjections();

  return res.json({ success: true, injected: true, cssUrl: `/uploads/fonts/${slug}/font.css`, message: `Font "${slugToFamily(slug)}" injected into public site.` });
}

// ─── POST /acr/api/media/fonts/:slug/uninject ─────────────────────────────

function uninjectFont(req, res) {
  const { slug } = req.params;

  const state = readInjectState();
  state[slug] = false;
  writeInjectState(state);
  syncPublicInjections();

  return res.json({ success: true, injected: false, message: `Font "${slugToFamily(slug)}" removed from public site.` });
}

// ─── Boot: sync injections on startup ────────────────────────────────────
// Call this from your app boot sequence after global.CMS is ready.
function bootSyncFonts() {
  try { syncPublicInjections(); } catch (err) {
    console.warn("[fonts] Boot sync failed:", err.message);
  }
}

module.exports = { searchFonts, getFonts, downloadFont, deleteFont, injectFont, uninjectFont, bootSyncFonts };