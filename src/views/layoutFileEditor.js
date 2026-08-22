// src/views/layoutEditorView.js
//
// Acroxa Layout File Editor — full server-side HTML shell.
// All IDE behavior lives in public/js/layoutEditor.js
//
// Features:
//  - Monaco Editor integration (from CDN)
//  - File explorer with full tree, search, context menu
//  - Multi-tab editing with dirty state tracking
//  - Live preview iframe panel
//  - Find / Replace widget
//  - Create New Layout wizard (6-step)
//  - New File / New Folder / Rename / Delete modals
//  - meta.json quick-preview in sidebar
//  - Keyboard shortcuts
//  - Status bar with language, line/col, git-style diff indicator

"use strict";

const fm            = require("./lib/framework.js");
const LayoutHelpers = require("../core/layoutHelpers.js");

function renderLayoutEditor(req) {
  const meta           = LayoutHelpers.getActiveLayoutMeta?.() || {};
  const layoutIdRaw    = meta?.id || LayoutHelpers.getActiveLayout?.();
  const activelayoutId       = typeof layoutIdRaw === "object" ? layoutIdRaw?.id : layoutIdRaw;
  const layoutId   = req.query.id || activelayoutId;
  const activeFile = req.query.file || "";

  // ── Guard ────────────────────────────────────────────────────────────────
  if (!layoutId) return _noLayout();

  // ── Helpers ──────────────────────────────────────────────────────────────
  const ic = (name, cls = "") => fm.el("i", { class: `fa-solid fa-${name}${cls ? " " + cls : ""}`, "aria-hidden": "true" });
  const btn     = (id, label, icon, cls = "")   => fm.el("button", { class: `le-btn ${cls}`, id }, ic(icon), label ? fm.el("span", {}, label) : "");
  const btnIcon = (id, icon, title, cls = "", label = "")   => fm.el("button", { class: `le-btn-icon ${cls}`, id, title }, ic(icon), fm.el("span",{class:"btn-label"}, label));
  const sep     = () => fm.el("div", { class: "le-separator", "aria-hidden": "true" });
  const kbd     = (...keys) => fm.el("span", { class: "le-kbd" }, keys.join("+"));

  // ── Top Bar ──────────────────────────────────────────────────────────────
  function _topbar() {
    return fm.el("header", { class: "le-topbar", role: "toolbar", "aria-label": "Layout editor toolbar" },

      // Left
      fm.el("div", { class: "le-topbar-left" },
        fm.el("div", { class: "le-title" },
          ic("table-layout"),
          fm.el("span", {}, "Layout Editor"),
          fm.el("strong", { id: "le-layout-id" }, layoutId)
        ),
        btnIcon("le-btn-sidebar-toggle", "sidebar", "Toggle sidebar"),
        sep(),
        btnIcon("le-btn-new-file",   "file-plus",    "New file"),
        btnIcon("le-btn-new-folder", "folder-plus",  "New folder"),
        btnIcon("le-btn-new-layout", "clone-plus",         "Create new layout", "active", "Create Layout"),
        sep(),
        btnIcon("le-btn-reload-tree", "refresh",     "Refresh file tree")
      ),

      // Center — breadcrumb + unsaved badge
      fm.el("div", { class: "le-topbar-center" },
        fm.el("div", { class: "le-breadcrumb", id: "le-breadcrumb" },
          ic("folder"),
          fm.el("span", {}, "layouts"),
          ic("chevron-right"),
          fm.el("span", {}, layoutId),
          ic("chevron-right"),
          fm.el("span", { id: "le-breadcrumb-file" }, activeFile || "—")
        ),
        fm.el("div", { class: "le-unsaved-badge", id: "le-unsaved-badge" },
          fm.el("span", { class: "le-unsaved-dot" }),
          fm.el("span", {}, "Unsaved changes")
        )
      ),

      // Right
      fm.el("div", { class: "le-topbar-right" },
        btn("le-btn-find",      "Find",    "search",         "ghost"),
        sep(),
        btn("le-btn-format",    "Format",  "wand",           "ghost"),
        sep(),
        btn("le-btn-save",      "Save",    "floppy-disk",  "primary"),
        btn("le-btn-save-all",  "Save All","files",          "ghost"),
        sep(),
        btnIcon("le-btn-preview-toggle", "eye",           "Toggle preview"),
        btnIcon("le-btn-open-customizer","palette",       "Open in customizer"),
        sep(),
        fm.el("a", { href: "/acrx/layouts", class: "le-btn ghost", id: "le-btn-back" }, ic("arrow-left"), fm.el("span", {}, "Layouts"))
      )
    );
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────
  function _sidebar() {
    return fm.el("aside", {
      class: "le-sidebar",
      id:    "le-sidebar",
      role:  "complementary",
      "aria-label": "File explorer"
    },
      // Header
      fm.el("div", { class: "le-sidebar-header" },
        fm.el("div", { class: "le-sidebar-title" },
          ic("files"),
          fm.el("span", {}, "Explorer")
        ),
        fm.el("div", { class: "le-sidebar-actions" },
          btnIcon("le-sb-new-file",   "file-plus",   "New file"),
          btnIcon("le-sb-new-folder", "folder-plus", "New folder"),
          btnIcon("le-sb-collapse-all","arrows-minimize","Collapse all")
        )
      ),

      // Search
      fm.el("div", { class: "le-file-search" },
        ic("search", "le-file-search-icon"),
        fm.el("input", {
          type:         "text",
          id:           "le-file-search",
          placeholder:  "Search files…",
          autocomplete: "off",
          "aria-label": "Search files"
        })
      ),

      // File tree mount
      fm.el("div", {
        class:            "le-file-tree",
        id:               "le-file-tree",
        role:             "tree",
        "aria-label":     "Layout files",
        "data-layout-id": layoutId
      }),

      // meta.json quick preview
      fm.el("div", { class: "le-meta-preview", id: "le-meta-preview" },
        fm.el("div", {
          class:           "le-meta-preview-header",
          id:              "le-meta-toggle",
          role:            "button",
          tabindex:        "0",
          "aria-expanded": "true"
        },
          ic("brackets-curly"),
          fm.el("span", {}, "meta.json"),
          ic("chevron-down", "le-meta-chevron")
        ),
        fm.el("div", { class: "le-meta-rows", id: "le-meta-rows" })
      )
    );
  }

  // ── Editor Area ──────────────────────────────────────────────────────────
  function _editorArea() {
    return fm.el("main", {
      class:          "le-editor-area",
      id:             "le-editor-area",
      role:           "main",
      "aria-label":   "Code editor"
    },
      // Tab bar
      fm.el("div", { class: "le-tabs", id: "le-tabs", role: "tablist", "aria-label": "Open files" }),

      // Toolbar
      fm.el("div", { class: "le-editor-toolbar" },
        fm.el("div", { class: "le-editor-path", id: "le-editor-path" },
          ic("file-code"),
          fm.el("span", { id: "le-editor-path-text" }, "No file open")
        ),
        fm.el("div", { class: "le-editor-tools" },
          btn("le-btn-cmd-format",  "Format",   "wand",    "ghost"),
          btn("le-btn-cmd-wordwrap","Wrap",      "left-to-dotted-line","ghost"),
          sep(),
          fm.el("div", { class: "le-editor-lang", id: "le-editor-lang" },
            fm.el("span", { id: "le-lang-label" }, "JavaScript")
          ),
          sep(),
          btnIcon("le-btn-diff-view", "code-compare", "View diff"),
          btnIcon("le-btn-copy-all",  "copy",        "Copy all")
        )
      ),

      // Monaco mount — editor fills this
      fm.el("div", { class: "le-monaco", id: "le-monaco", role: "region", "aria-label": "Monaco editor" },

        // Empty state (shown when no tab open)
        fm.el("div", { class: "le-editor-empty", id: "le-editor-empty" },
          ic("file-code"),
          fm.el("p", {}, "Select a file from the explorer to edit"),
          fm.el("div", { style: "display:flex;gap:8px;margin-top:8px;" },
            fm.el("span", { class: "le-kbd" }, "Ctrl"),
            fm.el("span", {}, "+"),
            fm.el("span", { class: "le-kbd" }, "P"),
            fm.el("span", { style: "font-size:11px;color:var(--ed-text-dim);" }, "Quick Open")
          )
        ),

        // Monaco editor container (JS mounts here)
        fm.el("div", { class: "le-monaco-wrap", id: "le-monaco-wrap" }),

        // Find & Replace widget
        fm.el("div", { class: "le-find-replace", id: "le-find-replace", role: "search", "aria-label": "Find and replace" },
          fm.el("div", { class: "le-find-row" },
            fm.el("input", {
              type:         "text",
              id:           "le-find-input",
              placeholder:  "Find…",
              autocomplete: "off",
              "aria-label": "Find"
            }),
            fm.el("span", { class: "le-find-count", id: "le-find-count" }, ""),
            btnIcon("le-find-prev",  "chevron-up",    "Previous match"),
            btnIcon("le-find-next",  "chevron-down",  "Next match"),
            btnIcon("le-find-close", "x",             "Close find")
          ),
          fm.el("div", { class: "le-find-row" },
            fm.el("input", {
              type:         "text",
              id:           "le-replace-input",
              placeholder:  "Replace…",
              autocomplete: "off",
              "aria-label": "Replace"
            }),
            btn("le-replace-one",  "Replace",     "replace",     "ghost"),
            btn("le-replace-all",  "Replace all", "replace-all", "ghost")
          )
        )
      ),

      // Live preview panel
      fm.el("aside", { class: "le-preview-panel", id: "le-preview-panel", "aria-label": "Live preview" },
        fm.el("div", { class: "le-preview-header" },
          fm.el("div", { class: "le-preview-title" }, ic("eye"), fm.el("span", {}, "Live Preview")),
          fm.el("div", { style: "display:flex;align-items:center;gap:4px;" },
            btnIcon("le-preview-reload",   "refresh",        "Reload preview"),
            btnIcon("le-preview-open-new", "external-link",  "Open in new tab"),
            btnIcon("le-btn-preview-close","x",              "Close preview")
          )
        ),
        fm.el("iframe", {
          class:         "le-preview-iframe",
          id:            "le-preview-iframe",
          title:         "Live layout preview",
          sandbox:       "allow-same-origin allow-scripts allow-forms",
          loading:       "lazy"
        })
      )
    );
  }

  // ── Status Bar ───────────────────────────────────────────────────────────
  function _statusbar() {
    return fm.el("footer", { class: "le-statusbar", role: "status", "aria-live": "polite" },
      fm.el("div", { class: "le-statusbar-left" },
        fm.el("span", {}, fm.el("span", { class: "le-status-indicator", id: "le-status-dot" }), fm.el("span", { id: "le-status-text" }, "Ready")),
        fm.el("span", { id: "le-status-lang" }, ic("code"), "JavaScript"),
        fm.el("span", { id: "le-status-encoding" }, "UTF-8")
      ),
      fm.el("div", { class: "le-statusbar-right" },
        fm.el("span", { id: "le-status-line" }, ic("circle-location-arrow"), "Ln 1, Col 1"),
        fm.el("span", { id: "le-status-dirty-count" }),
        fm.el("span", { id: "le-status-layout" }, ic("table-layout"), layoutId)
      )
    );
  }

  // ── Context Menu ─────────────────────────────────────────────────────────
  function _ctxMenu() {
    return fm.el("div", { class: "le-ctx-menu", id: "le-ctx-menu", role: "menu", "aria-label": "File options" },
      fm.el("div", { class: "le-ctx-item", id: "le-ctx-open",   role: "menuitem" }, ic("file-text"),  "Open"),
      fm.el("div", { class: "le-ctx-item", id: "le-ctx-rename", role: "menuitem" }, ic("edit"),       "Rename"),
      fm.el("div", { class: "le-ctx-separator" }),
      fm.el("div", { class: "le-ctx-item", id: "le-ctx-copy-path", role: "menuitem" }, ic("copy"),   "Copy path"),
      fm.el("div", { class: "le-ctx-item", id: "le-ctx-new-file",  role: "menuitem" }, ic("file-plus"), "New file here"),
      fm.el("div", { class: "le-ctx-separator" }),
      fm.el("div", { class: "le-ctx-item danger", id: "le-ctx-delete", role: "menuitem" }, ic("trash"), "Delete")
    );
  }

  // ── Modals ───────────────────────────────────────────────────────────────
  function _modals() {
    // New file modal
    const newFile = fm.el("div", { class: "le-modal-backdrop", id: "le-modal-new-file", role: "dialog", "aria-modal": "true", "aria-labelledby": "le-modal-nf-title" },
      fm.el("div", { class: "le-modal" },
        fm.el("div", { class: "le-modal-header" },
          fm.el("div", { class: "le-modal-title" },
            ic("file-plus"),
            fm.el("span", { id: "le-modal-nf-title" }, "New File")
          ),
          btnIcon("le-modal-nf-close", "x", "Close")
        ),
        fm.el("div", { class: "le-modal-body" },
          fm.el("div", { class: "le-modal-label" }, "File name"),
          fm.el("input", { class: "le-modal-input", id: "le-nf-name", type: "text", placeholder: "e.g. homepage.js", autocomplete: "off" }),
          fm.el("div", { class: "le-modal-hint" }, "Supported: .js  .css  .json  .html  .md"),
          fm.el("div", { class: "le-modal-error", id: "le-nf-error" })
        ),
        fm.el("div", { class: "le-modal-footer" },
          btn("le-modal-nf-cancel", "Cancel", "x",          "ghost"),
          btn("le-modal-nf-create", "Create", "file-plus",  "primary")
        )
      )
    );

    // New folder modal
    const newFolder = fm.el("div", { class: "le-modal-backdrop", id: "le-modal-new-folder", role: "dialog", "aria-modal": "true", "aria-labelledby": "le-modal-folder-title" },
      fm.el("div", { class: "le-modal" },
        fm.el("div", { class: "le-modal-header" },
          fm.el("div", { class: "le-modal-title" },
            ic("folder-plus"),
            fm.el("span", { id: "le-modal-folder-title" }, "New Folder")
          ),
          btnIcon("le-modal-folder-close", "x", "Close")
        ),
        fm.el("div", { class: "le-modal-body" },
          fm.el("div", { class: "le-modal-label" }, "Folder name"),
          fm.el("input", { class: "le-modal-input", id: "le-folder-name", type: "text", placeholder: "e.g. components", autocomplete: "off" }),
          fm.el("div", { class: "le-modal-error", id: "le-folder-error" })
        ),
        fm.el("div", { class: "le-modal-footer" },
          btn("le-modal-folder-cancel", "Cancel",        "x",           "ghost"),
          btn("le-modal-folder-create", "Create Folder", "folder-plus", "primary")
        )
      )
    );

    // Rename modal
    const rename = fm.el("div", { class: "le-modal-backdrop", id: "le-modal-rename", role: "dialog", "aria-modal": "true", "aria-labelledby": "le-modal-rename-title" },
      fm.el("div", { class: "le-modal" },
        fm.el("div", { class: "le-modal-header" },
          fm.el("div", { class: "le-modal-title" }, ic("edit"), fm.el("span", { id: "le-modal-rename-title" }, "Rename")),
          btnIcon("le-modal-rename-close", "x", "Close")
        ),
        fm.el("div", { class: "le-modal-body" },
          fm.el("div", { class: "le-modal-label" }, "New name"),
          fm.el("input", { class: "le-modal-input", id: "le-rename-input", type: "text", autocomplete: "off" }),
          fm.el("div", { class: "le-modal-error", id: "le-rename-error" })
        ),
        fm.el("div", { class: "le-modal-footer" },
          btn("le-modal-rename-cancel", "Cancel", "x",    "ghost"),
          btn("le-modal-rename-ok",     "Rename", "edit", "primary")
        )
      )
    );

    // Delete confirm modal
    const deleteConfirm = fm.el("div", { class: "le-modal-backdrop", id: "le-modal-delete", role: "dialog", "aria-modal": "true", "aria-labelledby": "le-modal-delete-title" },
      fm.el("div", { class: "le-modal" },
        fm.el("div", { class: "le-modal-header" },
          fm.el("div", { class: "le-modal-title", style: "color:var(--ed-red)" }, ic("trash"), fm.el("span", { id: "le-modal-delete-title" }, "Delete file?")),
          btnIcon("le-modal-delete-close", "x", "Close")
        ),
        fm.el("div", { class: "le-modal-body" },
          fm.el("div", { class: "le-confirm-text", id: "le-delete-text" }, "Delete ", fm.el("span", { class: "le-confirm-code", id: "le-delete-name" }, "file.js"), "? This cannot be undone.")
        ),
        fm.el("div", { class: "le-modal-footer" },
          btn("le-modal-delete-cancel", "Cancel",       "x",     "ghost"),
          btn("le-modal-delete-ok",     "Delete",       "trash", "danger")
        )
      )
    );

    return newFile + newFolder + rename + deleteConfirm;
  }

  // ── Create New Layout Wizard ──────────────────────────────────────────────
  function _wizard() {
    const steps = [
      { num: 1, id: "basic",    label: "Basic info"       },
      { num: 2, id: "identity", label: "Visual identity"  },
      { num: 3, id: "colors",   label: "Colors"           },
      { num: 4, id: "templates",label: "Templates"        },
      { num: 5, id: "advanced", label: "Widgets & menus"  },
      { num: 6, id: "confirm",  label: "Review & generate"},
    ];

    const stepBtns = steps.map((s, i) =>
      fm.el("div", { class: `le-wizard-step${i === 0 ? " active" : ""}`, "data-step": s.id, "data-step-num": s.num },
        fm.el("div", { class: "le-wizard-step-num" }, s.num),
        fm.el("span", { class: "le-wizard-step-label" }, s.label)
      )
    ).join("");

    // Panel 1: Basic info
    const p1 = fm.el("div", { class: "le-wizard-panel active", id: "le-wp-basic" },
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Layout name ", fm.el("span", { class: "required" }, "*")),
        fm.el("input", { class: "le-field-input", id: "le-wiz-name", type: "text", placeholder: "e.g. Nova Nexus", autocomplete: "off" }),
        fm.el("div", { class: "le-field-error", id: "le-wiz-name-err" })
      ),
      fm.el("div", { class: "le-field-row" },
        fm.el("div", { class: "le-field" },
          fm.el("div", { class: "le-field-label" }, "Layout ID ", fm.el("span", { class: "required" }, "*"), fm.el("span", { class: "badge" }, "auto")),
          fm.el("input", { class: "le-field-input", id: "le-wiz-id", type: "text", placeholder: "nova-nexus", autocomplete: "off" }),
          fm.el("div", { class: "le-field-hint" }, "URL-safe slug, used as folder name"),
          fm.el("div", { class: "le-field-error", id: "le-wiz-id-err" })
        ),
        fm.el("div", { class: "le-field" },
          fm.el("div", { class: "le-field-label" }, "Version"),
          fm.el("input", { class: "le-field-input", id: "le-wiz-version", type: "text", placeholder: "1.0.0", value: "1.0.0" })
        )
      ),
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Author"),
        fm.el("input", { class: "le-field-input", id: "le-wiz-author", type: "text", placeholder: "Your name", autocomplete: "off" })
      ),
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Description"),
        fm.el("textarea", { class: "le-field-textarea", id: "le-wiz-desc", placeholder: "Brief description of this layout…", rows: "3" })
      )
    );

    // Panel 2: Visual identity
    const p2 = fm.el("div", { class: "le-wizard-panel", id: "le-wp-identity" },
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Preview image path"),
        fm.el("input", { class: "le-field-input", id: "le-wiz-preview", type: "text", placeholder: "/preview/screenshot.png" })
      ),
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Features ", fm.el("span", { class: "badge" }, "one per line")),
        fm.el("textarea", { class: "le-field-textarea", id: "le-wiz-features", placeholder: "Glassmorphism effects\nNeon hover animations\nResponsive sidebar", rows: "6" })
      )
    );

    // Panel 3: Colors
    const colorFields = ["primary", "secondary", "accent", "background"].map(key =>
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, key.charAt(0).toUpperCase() + key.slice(1)),
        fm.el("div", { class: "le-color-swatch-field" },
          fm.el("input", { type: "color", id: `le-wiz-color-${key}`,
            value: key === "primary" ? "#00f0ff" : key === "secondary" ? "#7c3aed" : key === "accent" ? "#ec4899" : "#0a0a14"
          }),
          fm.el("input", { class: "le-field-input", id: `le-wiz-colorhex-${key}`, type: "text",
            value: key === "primary" ? "#00f0ff" : key === "secondary" ? "#7c3aed" : key === "accent" ? "#ec4899" : "#0a0a14",
            placeholder: "#000000"
          })
        )
      )
    ).join("");

    const p3 = fm.el("div", { class: "le-wizard-panel", id: "le-wp-colors" },
      fm.el("div", { class: "le-field-label", style: "margin-bottom:12px" }, "Config preset"),
      fm.el("div", { class: "le-preset-row" },
        fm.el("div", { class: "le-preset-btn active", "data-preset": "basic" },    ic("layout-grid"),   "Basic"),
        fm.el("div", { class: "le-preset-btn",        "data-preset": "advanced" }, ic("adjustments"),   "Advanced"),
        fm.el("div", { class: "le-preset-btn",        "data-preset": "custom" },   ic("tool",           "Custom"))
      ),
      fm.el("div", { class: "le-color-grid" }, colorFields)
    );

    // Panel 4: Templates
    const p4 = fm.el("div", { class: "le-wizard-panel", id: "le-wp-templates" },
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Templates ", fm.el("span", { class: "badge" }, "one per line")),
        fm.el("textarea", { class: "le-field-textarea", id: "le-wiz-templates", rows: "8",
          value: "homepage\nblog\npost\npage\n404\nlanding"
        }, "homepage\nblog\npost\npage\n404\nlanding"),
        fm.el("div", { class: "le-field-hint" }, "Each line becomes a template file. System generates mapping automatically.")
      )
    );

    // Panel 5: Advanced (optional)
    const p5 = fm.el("div", { class: "le-wizard-panel", id: "le-wp-advanced" },
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Widget areas ", fm.el("span", { class: "badge" }, "one per line"), fm.el("span", { class: "required" }, " optional")),
        fm.el("textarea", { class: "le-field-textarea", id: "le-wiz-widgets", rows: "5",
          value: "sidebar\nfooter-col-1\nfooter-col-2"
        }, "sidebar\nfooter-col-1\nfooter-col-2")
      ),
      fm.el("div", { class: "le-field" },
        fm.el("div", { class: "le-field-label" }, "Menu areas"),
        fm.el("textarea", { class: "le-field-textarea", id: "le-wiz-menus", rows: "3",
          value: "primary\nfooter"
        }, "primary\nfooter")
      )
    );

    // Panel 6: Confirmation
    const p6 = fm.el("div", { class: "le-wizard-panel", id: "le-wp-confirm" },
      fm.el("div", { class: "le-confirm-section" },
        fm.el("div", { class: "le-confirm-section-title" }, "Folder structure"),
        fm.el("div", { class: "le-confirm-tree", id: "le-wiz-tree-preview" },
          fm.el("div", {}, fm.el("span", { class: "folder" }, "📁 layouts/"), fm.el("span", { class: "folder" }, "your-layout-id/")),
          fm.el("div", { style: "padding-left:16px" },
            fm.el("div", {}, fm.el("span", { class: "meta" }, "meta.json")),
            fm.el("div", {}, fm.el("span", { class: "file" }, "index.js")),
            fm.el("div", {}, fm.el("span", { class: "folder" }, "📁 templates/")),
            fm.el("div", {}, fm.el("span", { class: "folder" }, "📁 assets/"))
          )
        )
      ),
      fm.el("div", { class: "le-confirm-section" },
        fm.el("div", { class: "le-confirm-section-title" }, "meta.json preview"),
        fm.el("div", { class: "le-confirm-json", id: "le-wiz-meta-preview" })
      )
    );

    return fm.el("div", { class: "le-wizard-overlay", id: "le-wizard-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "le-wizard-title" },
      fm.el("div", { class: "le-wizard" },
        fm.el("div", { class: "le-wizard-header" },
          fm.el("div", {},
            fm.el("div", { class: "le-wizard-title", id: "le-wizard-title" }, "Create New Layout"),
            fm.el("div", { class: "le-wizard-subtitle" }, "6-step wizard • generates meta.json + starter files")
          ),
          btnIcon("le-wizard-close", "x", "Close wizard")
        ),
        fm.el("div", { class: "le-wizard-steps", id: "le-wizard-steps" }, stepBtns),
        fm.el("div", { class: "le-wizard-body", id: "le-wizard-body" }, p1, p2, p3, p4, p5, p6),
        fm.el("div", { class: "le-wizard-footer" },
          fm.el("div", { class: "le-wizard-footer-left" },
            btn("le-wiz-back", "Back", "arrow-left", "ghost"),
            fm.el("span", { class: "le-skip-link", id: "le-wiz-skip" }, "Skip optional step")
          ),
          fm.el("div", { class: "le-wizard-footer-right" },
            fm.el("span", { style: "font-size:12px;color:var(--ed-text-muted);", id: "le-wiz-step-label" }, "Step 1 of 6"),
            btn("le-wiz-next",     "Next",     "arrow-right", "primary"),
            btn("le-wiz-generate", "Generate", "wand",        "success hidden")
          )
        )
      )
    );
  }

  // ── Toast container ──────────────────────────────────────────────────────
  const toastStack = fm.el("div", {
    class:     "le-toast-stack",
    id:        "le-toast-stack",
    role:      "region",
    "aria-live":"polite",
    "aria-label":"Notifications"
  });

  // ── Data attrs root ──────────────────────────────────────────────────────
  const root = fm.el("div", {
    class:            "acrx-le-shell",
    id:               "acrx-le-shell",
    "data-layout-id": layoutId,
    "data-api-base":  "/acr/api/layouts",
    "data-preview-base": "/acr/api/layouts/preview",
    "data-files-base": `/layouts/${layoutId}`,
    "data-active-file": fm.escapeHTML(activeFile)
  },
    _topbar(),
    _sidebar(),
    _editorArea(),
    _statusbar()
  );

  return root
       + _ctxMenu()
       + _modals()
       + _wizard()
       + toastStack
       // Monaco Editor loader (VS Code web)
       + `<link rel="stylesheet" data-name="vs/editor/editor.main" href="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/editor/editor.main.css" />`
       + `<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>`
       + `<script>require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });</script>`;
}

// ── No layout selected state ─────────────────────────────────────────────────
function _noLayout() {
  const fm = require("./lib/framework.js");
  return fm.el("div", { class: "acrx-le-shell", style: "display:flex;align-items:center;justify-content:center;height:100vh;background:#0d0f14;color:#6b7a99;flex-direction:column;gap:16px;font-family:'DM Sans',sans-serif;" },
    fm.el("i", { class: "fa-solid fa-table-layout", style: "font-size:48px;color:#1f2333;" }),
    fm.el("h2", { style: "font-size:16px;font-weight:500;color:#e2e8f0;" }, "No layout selected"),
    fm.el("p", { style: "font-size:13px;" }, "Open this editor from the layouts list."),
    fm.el("a", { href: "/acrx/layouts", style: "display:flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:6px;background:#4f8ef7;color:#fff;font-size:13px;text-decoration:none;" },
      fm.el("i", { class: "fa-solid fa-arrow-left" }), "Go to Layouts"
    )
  );
}

module.exports = { renderLayoutEditor };
module.exports.meta =[{
      "path": `/acrx/layouts/edit`,
      "title": "Layout Editor - Acroxa",

      "render": "renderLayoutEditor",

      "css": [
        "/acrx/assets/css/ad-st.css",
        "/acrx/assets/css/ad-layout-editor.css",
        "/acrx/assets/css/monaco.css"
      ],

      "js": [
        "/acrx/assets/js/system/_shared.js",
        "/acrx/assets/js/layout-editor.js",
      ],
      "layout" : "empty"
    }
  ]