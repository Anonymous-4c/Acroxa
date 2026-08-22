// src/controllers/layoutController.js
const fs   = require("fs");
const path = require("path");

const { initializeLayout }         = require("../layouts/framework/init.js");
const Layout                       = require("../core/layoutHelpers");
const PreviewEngineManager         = require("../core/PreviewEngineManager.js");
const { ensureLayoutReady }        = require("../services/layoutService.js");
const { getPreviewRoutes }         = require("../core/RouteResolver.js");
const { generateVariablesCSS }     = require("../layouts/framework/cssGenerator.js");

const LAYOUTS_DIR = path.join(__dirname, "../layouts");



const metaPath = (id) => path.join(LAYOUTS_DIR, id, "meta.json");
const basePath = (id) => path.join(LAYOUTS_DIR, id);

function safeFilePath(id, file) {
  const base = basePath(id);
  const full = path.join(base, file);
  if (!full.startsWith(base)) throw new Error("Invalid path");
  return full;
}

function readMeta(id) {
  const mp = metaPath(id);
  if (!fs.existsSync(mp)) throw new Error("meta.json not found for: " + id);
  return JSON.parse(fs.readFileSync(mp, "utf-8"));
}




async function _buildMergedConfig(layoutId) {
  try {
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    const entry  = await models.LayoutConfig.getByLayout(layoutId);
    const meta   = readMeta(layoutId);

    
    function extractDefaults(schema) {
      const result = {};
      for (const key of Object.keys(schema)) {
        const val = schema[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          if ("default" in val || "type" in val) result[key] = val.default ?? null;
          else result[key] = extractDefaults(val);
        } else {
          result[key] = val;
        }
      }
      return result;
    }

    const defaults = extractDefaults(meta.config || {});
    return _mergeDeep(defaults, entry?.config || {});
  } catch (err) {
    console.warn("[LayoutController] _buildMergedConfig:", err.message);
    return {};
  }
}

function _mergeDeep(target, source) {
  if (typeof target !== "object" || target === null) return source;
  if (typeof source !== "object" || source === null) return source;
  const out = { ...target };
  for (const k of Object.keys(source)) {
    if (typeof source[k] === "object" && !Array.isArray(source[k]) && source[k] !== null) {
      out[k] = _mergeDeep(target[k] || {}, source[k]);
    } else {
      out[k] = source[k];
    }
  }
  return out;
}



exports.getLayouts = (req, res) => {
  try {
    const layouts = fs.readdirSync(LAYOUTS_DIR)
      .filter(id => {
        const mp = metaPath(id);
        return fs.existsSync(mp) && !id.startsWith("_") && !id.startsWith("framework");
      })
      .map((id) => {
        const meta = readMeta(id);
        return {
          id,
          name:        meta.name,
          version:     meta.version,
          preview:     `/layouts/${id}${meta.preview}`,
          author:      meta.author?.name || "Unknown",
          authorUrl:   meta.author?.url  || "#",
          description: meta.description,
          features:    meta.features    || [],
          colorScheme: meta.color_scheme || {},
          capabilities: {
            supportsBlog:       !!(meta.templates?.blog),
            supportsSidebar:    !!(meta.config?.layout?.sidebar),
            supportsCustomizer: !!(meta.config),
            supportsWidgets:    !!(meta.widgetAreas?.length),
            supportsLanding:    !!(meta.templates?.landing),
          },
        };
      });

    res.json(layouts);
  } catch (err) {
    console.error("[LayoutController] getLayouts:", err);
    res.status(500).json({ error: "Failed to list layouts" });
  }
};



exports.getLayout = (req, res) => {
  const { id } = req.params;
  const mp = metaPath(id);
  if (!fs.existsSync(mp)) return res.status(404).json({ error: "Layout not found" });
  res.json(JSON.parse(fs.readFileSync(mp, "utf-8")));
};



exports.updateLayout = (req, res) => {
  const { id } = req.params;
  const mp = metaPath(id);
  if (!fs.existsSync(mp)) return res.status(404).json({ error: "Layout not found" });

  const newMeta = req.body;
  delete newMeta.routes; 

  fs.writeFileSync(mp + ".bak", fs.readFileSync(mp, "utf-8"));
  fs.writeFileSync(mp, JSON.stringify(newMeta, null, 2));

  if (Layout.getActiveLayout() === id) {
    Layout.setActiveLayout(id, newMeta);
  }

  res.json({ success: true });
};



exports.getActiveLayout = (req, res) => {
  const activeId = Layout.getActiveLayout();
  if (!activeId) {
    return res.json({ id: null, meta: null, message: "No active layout set yet" });
  }
  res.json({ id: activeId, meta: Layout.getActiveLayoutMeta() });
};



exports.setActiveLayout = async (req, res) => {
  const { id } = req.body;

  if (!fs.existsSync(metaPath(id))) {
    return res.status(404).json({ error: "Layout not found" });
  }

  try {
    
    await initializeLayout(global.acrx, id);

    
    const mergedConfig = await _buildMergedConfig(id);
    await generateVariablesCSS(mergedConfig).catch(err =>
      console.error("[LayoutController] CSS gen failed on activation:", err.message)
    );

    res.json({ success: true, active: id, changeId: Layout.state.changeId });
  } catch (err) {
    console.error("[LayoutController] setActiveLayout:", err.message);
    res.status(500).json({ error: err.message });
  }
};



exports.getTemplates = (req, res) => {
  const { id } = req.params;
  try {
    const meta      = readMeta(id);
    const templates = meta.templates || {};
    const available = Object.keys(templates);
    res.json({ id, templates, available });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};



exports.getConfig = async (req, res) => {
  const { id } = req.params;
  try {
    await ensureLayoutReady(id);

    const { connectDB } = require("../core/connect-db");
    const models   = await connectDB();
    const entry    = await models.LayoutConfig.getByLayout(id);
    const meta     = readMeta(id);

    
    let uiSchema = {};
    try {
      const cfgPath = path.join(LAYOUTS_DIR, id, "meta.config.js");
      if (fs.existsSync(cfgPath)) {
        delete require.cache[require.resolve(cfgPath)];
        uiSchema = require(cfgPath) || {};
      }
    } catch (e) {
      console.warn("[LayoutController] meta.config.js load failed:", e.message);
      uiSchema = {};
    }

    res.json({
      id,
      config:   entry.config || {},
      schema:   meta.config  || {},
      uiState:  entry.uiState || {},
      uiSchema,
    });
  } catch (err) {
    console.error("[LayoutController] getConfig:", err);
    res.status(500).json({ error: err.message });
  }
};















exports.updateConfig = async (req, res) => {
  const { id }     = req.params;
  const { config } = req.body;

  try {
    
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();
    const entry  = await models.LayoutConfig.updateConfig(id, config);

    
    const mergedConfig = await _buildMergedConfig(id);


    
    await PreviewEngineManager.reload(global.acrx, id, config);

    
    
    
    const activeId = Layout.getActiveLayout();
    if (activeId === id) {
      generateVariablesCSS(mergedConfig).catch(err =>
        console.error("[LayoutController] CSS gen failed:", err.message)
      );
      initializeLayout(global.acrx, id).catch(err =>
        console.error("[LayoutController] Live engine re-init failed:", err.message)
      );
    }

    res.json({ success: true, config: entry.config });
  } catch (err) {
    console.error("[LayoutController] updateConfig:", err);
    res.status(500).json({ error: err.message });
  }
};



exports.resetConfig = async (req, res) => {
  const { id } = req.params;
  try {
    const { connectDB } = require("../core/connect-db");
    const models = await connectDB();

    await (models.LayoutConfig.reset
      ? models.LayoutConfig.reset(id)
      : models.LayoutConfig.resetLayout(id));

    await PreviewEngineManager.clear(id);

    
    const meta     = readMeta(id);
    const defaults = {};
    function extractDefaults(schema, out = {}) {
      for (const key of Object.keys(schema)) {
        const val = schema[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          if ("default" in val || "type" in val) out[key] = val.default ?? null;
          else out[key] = extractDefaults(val);
        } else {
          out[key] = val;
        }
      }
      return out;
    }
    const schemaDefaults = extractDefaults(meta.config || {});


    
    const activeId = Layout.getActiveLayout();
    if (activeId === id) {
      generateVariablesCSS(schemaDefaults).catch(err =>
        console.error("[LayoutController] CSS gen failed on reset:", err.message)
      );
      initializeLayout(global.acrx, id).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



exports.getPreview = async (req, res) => {
  const { id, url = "/" } = req.query;

  if (!id) return res.status(400).send("Missing layout id");
  if (!fs.existsSync(metaPath(id))) return res.status(404).send("Layout not found");

  try {
    const html = await PreviewEngineManager.render(global.acrx, id, url);
    res.setHeader("Content-Type", "text/html");
    res.setHeader("X-Preview-Layout", id);
    res.setHeader("X-Preview-URL",    url);
    res.send(html);
  } catch (err) {
    console.error("[LayoutController] getPreview:", err);
    res.status(500).send(_previewErrorPage(err.message));
  }
};

exports.reloadPreview = async (req, res) => {
  const { id, config } = req.body;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    await PreviewEngineManager.reload(global.acrx, id, config || null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.clearPreview = async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Missing id" });

  try {
    await PreviewEngineManager.clear(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPreviewRoutes = async (req, res) => {
  const { id } = req.query;
  try {
    const routes = await getPreviewRoutes(id);
    res.json({ routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPreviewStatus = (req, res) => {
  res.json(PreviewEngineManager.status());
};



exports.getFiles = (req, res) => {
  const { id } = req.params;

  function read(dir) {
    return fs.readdirSync(dir).map((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return {
        name:     f,
        type:     stat.isDirectory() ? "folder" : "file",
        children: stat.isDirectory() ? read(full) : null,
      };
    });
  }

  res.json(read(basePath(id)));
};

exports.getFileContent = (req, res) => {
  const { id }   = req.params;
  const { file } = req.query;
  try {
    const content = fs.readFileSync(safeFilePath(id, file), "utf-8");
    res.json({ content });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.updateFile = (req, res) => {
  const { id }            = req.params;
  const { file, content } = req.body;
  try {
    const filePath = safeFilePath(id, file);
    const allowed  = [".html", ".css", ".js", ".json"];
    if (!allowed.includes(path.extname(filePath))) throw new Error("File type not allowed");

    fs.writeFileSync(filePath + ".bak", fs.readFileSync(filePath, "utf-8"));
    fs.writeFileSync(filePath, content);

    PreviewEngineManager.clear(id).catch(() => {});

    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONS to src/controllers/layoutController.js
// Paste these into the existing file (e.g. right after exports.updateFile)
// ─────────────────────────────────────────────────────────────────────────────

exports.createFile = (req, res) => {
  const { id }            = req.params;
  const { file, content } = req.body;

  try {
    if (!file) throw new Error("File name is required");

    const filePath = safeFilePath(id, file);
    const allowed  = [".html", ".css", ".js", ".json", ".md", ".txt", ".mjs", ".cjs"];
    if (!allowed.includes(path.extname(filePath))) throw new Error("File type not allowed");

    if (fs.existsSync(filePath)) throw new Error("File already exists");

    // ensure parent dir exists (in case file is nested under a new folder)
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content || "");

    res.json({ success: true, file });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.deleteFile = (req, res) => {
  const { id }   = req.params;
  const { file } = req.body;

  try {
    if (!file) throw new Error("File is required");

    const filePath = safeFilePath(id, file);
    if (!fs.existsSync(filePath)) throw new Error("File not found");

    // keep a backup like updateFile does, in case of accidental delete
    fs.writeFileSync(filePath + ".bak", fs.readFileSync(filePath, "utf-8"));
    fs.unlinkSync(filePath);

    PreviewEngineManager.clear(id).catch(() => {});

    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.renameFile = (req, res) => {
  const { id }       = req.params;
  const { from, to } = req.body;

  try {
    if (!from || !to) throw new Error("Both from and to are required");

    const fromPath = safeFilePath(id, from);
    const toPath   = safeFilePath(id, to);

    const allowed = [".html", ".css", ".js", ".json", ".md", ".txt", ".mjs", ".cjs"];
    if (!allowed.includes(path.extname(toPath))) throw new Error("File type not allowed");

    if (!fs.existsSync(fromPath)) throw new Error("Source file not found");
    if (fs.existsSync(toPath))    throw new Error("A file with that name already exists");

    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.renameSync(fromPath, toPath);

    PreviewEngineManager.clear(id).catch(() => {});

    res.json({ success: true, from, to });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

exports.createFolder = (req, res) => {
  const { id }   = req.params;
  const { name } = req.body;

  try {
    if (!name) throw new Error("Folder name is required");
    if (/[\\/]$/.test(name) === false && name.includes("..")) throw new Error("Invalid folder name");

    const folderPath = safeFilePath(id, name);
    if (fs.existsSync(folderPath)) throw new Error("Folder already exists");

    fs.mkdirSync(folderPath, { recursive: true });

    res.json({ success: true, name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE LAYOUT (wizard "Generate" step -> POST /acr/api/layouts/create)
// ─────────────────────────────────────────────────────────────────────────────

exports.createLayout = (req, res) => {
  const {
    id,
    name,
    version,
    author,
    description,
    preview,
    features,
    colorScheme,
    templates,
    widgetAreas,
    menuAreas,
  } = req.body;

  try {
    if (!id)   throw new Error("Layout id is required");
    if (!name) throw new Error("Layout name is required");
    if (!/^[a-z0-9-_]+$/.test(id)) throw new Error("ID must be URL-safe: lowercase, hyphens/underscores only");

    const dir = basePath(id);
    if (fs.existsSync(dir)) throw new Error("A layout with that id already exists");

    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });

    const templatesObj = {};
    (templates || []).forEach((t) => {
      templatesObj[t] = `templates/${t}.js`;
      fs.writeFileSync(
        path.join(dir, "templates", `${t}.js`),
        `// ${t} template for ${name}\nmodule.exports = () => "";\n`
      );
    });

    const meta = {
      name,
      version: version || "1.0.0",
      description: description || "",
      author: { name: author || "" },
      preview: preview || "/preview/screenshot.png",
      templates: templatesObj,
      widgetAreas: widgetAreas?.length ? widgetAreas : ["sidebar", "footer-col-1"],
      menuAreas:   menuAreas?.length   ? menuAreas   : ["primary", "footer"],
      color_scheme: colorScheme || {},
      features: features || [],
      config: {},
    };

    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    fs.writeFileSync(
      path.join(dir, "index.js"),
      `// ${name} — layout entry point\nmodule.exports = {};\n`
    );

    res.json({ success: true, id, meta });
  } catch (err) {
    console.error("[LayoutController] createLayout:", err.message);
    res.status(400).json({ error: err.message });
  }
};

function _previewErrorPage(message) {
  return `<!DOCTYPE html><html>
<head><title>Preview Error</title>
<style>body{font-family:monospace;background:#0a0a14;color:#ff4444;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;}
h2{margin-bottom:1rem;}pre{background:#1a1a2e;padding:1rem;border-radius:8px;color:#ccc;max-width:600px;}
button{margin-top:1rem;padding:.5rem 1rem;background:#00f0ff;border:none;border-radius:4px;cursor:pointer;}</style>
</head>
<body>
  <h2>⚠ Preview Render Error</h2>
  <pre>${message}</pre>
  <button onclick="location.reload()">↺ Reload</button>
</body></html>`;
}