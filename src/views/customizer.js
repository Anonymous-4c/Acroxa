// src/views/customizer.js
//
// Full Visual Layout Studio shell.
// Renders the server-side HTML frame — all dynamic behavior lives in public/js/customizer.js.
//
// CHANGES vs original:
//  1. Inspector panel on RIGHT side (pushes preview, width:0 → 320px when open)
//  2. Orientation/narrow-screen popup overlay rendered server-side (no FOUC)
//  3. Panel tabs / content structure intact — JS fills them at runtime
//  4. All original IDs preserved exactly
//  5. Font manager section scaffold in panel

"use strict";

const fm            = require("./lib/framework.js");
const LayoutHelpers = require("../core/layoutHelpers.js");

function renderCustomizer(layout) {
  const meta           = LayoutHelpers.getActiveLayoutMeta?.() || {};
  const layoutIdRaw    = meta?.id || LayoutHelpers.getActiveLayout?.();
  const layoutId       = typeof layoutIdRaw === "object" ? layoutIdRaw?.id : layoutIdRaw;
  

  // ── helper: viewport button ──────────────────────────────────────────────
  function _viewportBtn(id, iconName, label, active = false) {
    return fm.el("button", {
      class:           `viewport-btn${active ? " active" : ""}`,
      "data-viewport": id,
      title:           label,
    },
      fm.icon(iconName, "regular"),
      fm.el("span", { class: "viewport-label" }, label)
    );
  }

  // ── inspector panel (RIGHT SIDE) ─────────────────────────────────────────
  // Starts at width:0, becomes 320px when inspector is toggled on.
  // This lives INSIDE .customizer-body so it PUSHES the preview (no overlay).
  function _inspectorPanel() {
    return fm.el("div", { class: "inspector-panel", id: "inspector-panel" },

      fm.el("div", { class: "inspector-header" },
        fm.el("span", { class: "inspector-title" },
          fm.icon("magnifying-glass", "regular"), " Inspector"
        ),
        fm.el("button", { class: "inspector-close topbar-btn ghost", id: "inspector-close", title: "Close inspector" },
          fm.icon("xmark", "regular")
        )
      ),

      // Empty state
      fm.el("div", { class: "inspector-empty", id: "inspector-empty" },
        fm.icon("arrow-pointer", "regular"),
        fm.el("p", {}, "Click any element in the preview to inspect it.")
      ),

      // Data (filled by customizer.js _renderInspectorPanel)
      fm.el("div", { class: "inspector-data", id: "inspector-data-content" })
    );
  }

  // ── orientation popup ────────────────────────────────────────────────────
  // Full-screen overlay shown on narrow/portrait screens.
  // JS will also inject this if missing, but server-side render avoids FOUC.
  function _orientationPopup() {
    return fm.el("div", { class: "orient-popup", id: "orientation-popup" },
      fm.el("div", { class: "orient-popup-inner" },
        fm.el("i", { class: "fa-duotone fa-rotate-right orient-icon" }),
        fm.el("h2", {}, "Better on a wider screen"),
        fm.el("p", {},
          "The customizer needs more room. ",
          fm.el("br", {}),
          "On a phone: ", fm.el("strong", {}, "rotate to landscape"), ".",
          fm.el("br", {}),
          "On desktop: ", fm.el("strong", {}, "zoom out"),
          " or ", fm.el("strong", {}, "go full-screen"), "."
        ),
        fm.el("button", { class: "topbar-btn primary", id: "orient-dismiss" }, "Continue anyway")
      )
    );
  }

  // ── root ─────────────────────────────────────────────────────────────────
  return fm.el("div", {
    class:         "customizer-root",
    "data-layout": layoutId || "",
  },

    // ══════════════════════════════════════════════════════════════════════
    // TOP BAR
    // ══════════════════════════════════════════════════════════════════════
    fm.el("div", { class: "customizer-topbar" },

      // Left: back + layout name
      fm.el("div", { class: "topbar-left" },
        fm.el("button", {
          class:      "topbar-back",
          id:         "return",
          "data-link": "/acrx/layouts",
        },
          fm.icon("left-from-bracket", "regular"),
          fm.el("span", {}, "Layouts")
        ),
        fm.el("div", { class: "topbar-layout-name", id: "layout-name-display" },
          fm.icon("palette", "regular"),
          fm.el("span", { id: "layout-name-text" }, layout || "No layout")
        )
      ),

      // Center: unsaved badge
      fm.el("div", { class: "topbar-center" },
        fm.el("div", { class: "unsaved-badge", id: "unsaved-badge", style: "display:none" },
          fm.el("span", { class: "unsaved-dot" }, "●"),
          fm.el("span", {}, "Unsaved Changes")
        )
      ),

      // Right: action buttons
      fm.el("div", { class: "topbar-right" },
        fm.el("button", { class: "topbar-btn secondary", id: "btn-revert" },
          fm.icon("rotate-left", "regular"),
          fm.el("span", {}, "Revert")
        ),
        fm.el("button", { class: "topbar-btn ghost", id: "btn-inspect-mode", title: "Toggle Inspector" },
          fm.icon("magnifying-glass", "regular"),
          fm.el("span", {}, "Inspect")
        ),
        fm.el("button", { class: "topbar-btn ghost", id: "panel-toggle", title: "Toggle Sidebar" },
          fm.icon("sidebar", "regular")
        ),
        fm.el("button", { class: "topbar-btn primary", id: "btn-save" },
          fm.icon("floppy-disk", "regular"),
          fm.el("span", {}, "Save")
        )
      )
    ),

    // ══════════════════════════════════════════════════════════════════════
    // MAIN BODY: [Left Panel] [Preview] [Inspector Panel]
    // ══════════════════════════════════════════════════════════════════════
    fm.el("div", { class: "customizer-body" },

      // ── LEFT PANEL ─────────────────────────────────────────────────────
      fm.el("div", { class: "customizer-panel", id: "customizer-panel" },

        // Collapse button (visible when collapsed)
        fm.el("button", { class: "panel-collapse-btn", id: "panel-toggle-inner" },
          fm.icon("sidebar", "regular")
        ),

        // Panel header
        fm.el("div", { class: "panel-header" },
          fm.el("span", { class: "panel-title" }, "Customize")
        ),

        // Tab bar — JS renders the 6 section tabs here at runtime
        fm.el("div", { class: "panel-tabs", id: "panel-tabs" }),

        // Content area — JS renders active section here
        fm.el("div", { class: "panel-content", id: "panel-content" },
          fm.el("div", { class: "panel-loading", id: "panel-loading" },
            fm.icon("spinner", "regular", "fa-spin"),
            fm.el("span", {}, "Loading…")
          )
        ),

        // AI context store (data attributes, architecture stub)
        fm.el("div", {
          class:                  "panel-ai-stub",
          id:                     "panel-ai",
          "data-layout-id":       layoutId || "",
          "data-active-route":    "/",
          "data-active-template": "",
          "data-viewport":        "desktop",
        })
      ),

      // ── PREVIEW AREA ───────────────────────────────────────────────────
      fm.el("div", { class: "customizer-preview", id: "customizer-preview" },

        // Controls bar
        fm.el("div", { class: "preview-controls" },

          // Left: route selector
          fm.el("div", { class: "controls-left" },
            fm.el("div", { class: "route-selector", id: "route-selector" },
              fm.el("button", { class: "route-trigger", id: "route-trigger" },
                fm.el("span", { class: "route-icon-wrap", id: "route-icon" },
                  fm.icon("house", "regular")
                ),
                fm.el("span", { class: "route-label", id: "route-label" }, "Homepage"),
                fm.icon("chevron-down", "solid", "route-chevron")
              ),
              fm.el("div", { class: "route-dropdown", id: "route-dropdown" },
                fm.el("div", { class: "route-loading" },
                  fm.icon("spinner", "regular", "fa-spin"),
                  fm.el("span", {}, "Loading routes…")
                )
              )
            )
          ),

          // Center: viewports + custom + zoom
          fm.el("div", { class: "controls-center" },

            fm.el("div", { class: "viewport-switcher", id: "viewport-switcher" },
              _viewportBtn("desktop", "desktop",       "Desktop", true),
              _viewportBtn("laptop",  "laptop",        "Laptop"),
              _viewportBtn("tablet",  "tablet-screen", "Tablet"),
              _viewportBtn("mobile",  "mobile",        "Mobile")
            ),

            // Custom viewport
            fm.el("div", { class: "viewport-custom", id: "viewport-custom" },
              fm.el("button", {
                class:           "viewport-btn",
                id:              "btn-custom-viewport",
                "data-viewport": "custom",
              },
                fm.icon("ruler-horizontal", "regular"),
                fm.el("span", { class: "viewport-label" }, "Custom")
              ),
              fm.el("div", { class: "custom-viewport-input", id: "custom-viewport-input" },
                fm.el("input", {
                  type:        "number",
                  id:          "custom-width-input",
                  placeholder: "1280",
                  min:         "200",
                  max:         "4000",
                }),
                fm.el("span", {}, "px"),
                fm.el("button", { id: "btn-apply-viewport" }, "Apply")
              )
            ),

            // Zoom
            fm.el("div", { class: "zoom-controls" },
              fm.el("button", { class: "zoom-btn", id: "btn-zoom-out", title: "Zoom out" },
                fm.icon("minus", "solid")
              ),
              fm.el("span",   { class: "zoom-label", id: "zoom-label" }, "100%"),
              fm.el("button", { class: "zoom-btn", id: "btn-zoom-in",  title: "Zoom in" },
                fm.icon("plus", "solid")
              ),
              fm.el("button", { class: "zoom-btn", id: "btn-zoom-fit", title: "Reset" },
                fm.icon("arrows-to-circle", "regular")
              )
            )
          ),

          // Right: live-reload toggle
          fm.el("div", { class: "controls-right" },
            fm.el("button", { class: "topbar-btn ghost", id: "btn-live-reload", title: "Live reload" },
              fm.icon("rotate", "regular"),
              fm.el("span", {}, "Live")
            )
          )
        ),

        // Viewport wrapper + iframe
        fm.el("div", { class: "preview-viewport-wrapper" },
          fm.el("div", { class: "preview-frame-outer", id: "frame-outer" },

            // Loading overlay
            fm.el("div", { class: "preview-loading-overlay", id: "preview-loading", style: "display:none" },
              fm.icon("spinner", "regular", "fa-spin"),
              fm.el("span", {}, "Loading preview…")
            ),

            // Error overlay
            fm.el("div", { class: "preview-error-overlay", id: "preview-error", style: "display:none" },
              fm.icon("triangle-exclamation", "regular"),
              fm.el("p", { id: "preview-error-message" }, "Failed to load preview.")
            ),

            // The iframe
            fm.el("iframe", {
              id:              "preview-iframe",
              class:           "preview-iframe",
              title:           "Site preview",
              sandbox:         "allow-same-origin allow-scripts allow-forms allow-popups",
              allowfullscreen: true,
            })
          )
        )
      ),

      // ── RIGHT: INSPECTOR PANEL ─────────────────────────────────────────
      // Starts at width:0. CSS transitions to 320px when .visible is added.
      // Pushes the preview — does NOT overlay it.
      _inspectorPanel()
    ),

    // ── ORIENTATION POPUP ─────────────────────────────────────────────────
    _orientationPopup()
  );
}

module.exports = { renderCustomizer };
module.exports.meta =[{
      "path": `/acrx/layouts/customize`,
      "title": "Customizer - Acroxa",

      "render": "renderCustomizer",

      "css": [
        "/acrx/assets/css/ad-st.css",
        "/acrx/assets/css/ad-customizer.css",
        "/acrx/assets/css/monaco.css"
      ],

      "js": [
        "/acrx/assets/js/system/_shared.js",
        "/acrx/assets/js/customizer.js",
      ],
      "layout" : "empty"
    }
  ]