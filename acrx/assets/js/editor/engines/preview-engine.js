// acrx/assets/js/editor/engines/preview-engine.js
//
// ENGINE 16 — Preview Engine (headless).
// Renders the same document into an isolated preview without mutating the
// source: viewport/device presets, responsive breakpoints, preview metadata
// and JSON-safe preview specs the future UI renders.

export const PREVIEW_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "preview";

export const DEVICE_PRESETS = Object.freeze({
  mobile: { width: 390, height: 844, breakpoint: "mobile", label: "Mobile" },
  tablet: { width: 768, height: 1024, breakpoint: "tablet", label: "Tablet" },
  desktop: { width: 1280, height: 800, breakpoint: "desktop", label: "Desktop" },
  wide: { width: 1600, height: 900, breakpoint: "desktop", label: "Wide" },
});

function previewError(operation, code, message) {
  const err = new Error(message);
  err.name = "PreviewError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

export function createPreviewEngine(options = {}) {
  if (!options.renderer) throw previewError("create", "NO_RENDERER", "Preview engine requires a renderer.");
  const renderer = options.renderer;
  let counter = 0;

  function snapshotDoc(doc) {
    // Isolation: preview always renders a detached clone.
    if (!doc || typeof doc.toJSON !== "function") {
      throw previewError("preview", "INVALID_DOCUMENT", "Preview requires a document with toJSON().");
    }
    return JSON.parse(JSON.stringify(doc.toJSON()));
  }

  // Minimal doc facade over a detached snapshot for the renderer.
  function facade(snapshot) {
    const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
    return {
      rootId: snapshot.rootId,
      getNode: (id) => {
        const n = byId.get(id);
        return n ? JSON.parse(JSON.stringify(n)) : null;
      },
      childrenOf: (id) => {
        const n = byId.get(id);
        if (!n) return [];
        return n.children.map((cid) => JSON.parse(JSON.stringify(byId.get(cid)))).filter(Boolean);
      },
    };
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return PREVIEW_ENGINE_VERSION; },
    get devices() { return JSON.parse(JSON.stringify(DEVICE_PRESETS)); },

    previewDocument(doc, opts = {}) {
      const device = opts.device || "desktop";
      const preset = DEVICE_PRESETS[device] || DEVICE_PRESETS.desktop;
      const width = opts.width || preset.width;
      const height = opts.height || preset.height;
      const breakpoint = opts.breakpoint || preset.breakpoint;
      const snapshot = snapshotDoc(doc);
      const before = JSON.stringify(doc.toJSON());
      const html = renderer.renderDocument(facade(snapshot), { mode: "preview", breakpoint });
      if (JSON.stringify(doc.toJSON()) !== before) {
        throw previewError("previewDocument", "SOURCE_MUTATED", "Preview must never mutate the source document.");
      }
      return {
        id: `preview_${(++counter).toString(36)}`,
        html,
        device,
        width,
        height,
        breakpoint,
        nodeCount: snapshot.nodes.length,
        at: new Date().toISOString(),
      };
    },

    previewNode(doc, nodeId, opts = {}) {
      if (!nodeId) throw previewError("previewNode", "INVALID_ID", "Node id is required.");
      const snapshot = snapshotDoc(doc);
      const node = snapshot.nodes.find((n) => n.id === nodeId);
      if (!node) throw previewError("previewNode", "NOT_FOUND", `Node "${nodeId}" does not exist.`);
      const device = opts.device || "desktop";
      const preset = DEVICE_PRESETS[device] || DEVICE_PRESETS.desktop;
      const breakpoint = opts.breakpoint || preset.breakpoint;
      const kids = node.children
        .map((cid) => {
          const child = snapshot.nodes.find((n) => n.id === cid);
          return child ? renderer.renderNode(child, { mode: "preview", breakpoint }) : "";
        })
        .join("");
      const html = renderer.renderNode(node, { mode: "preview", breakpoint, childrenHtml: kids });
      return { id: `preview_${(++counter).toString(36)}`, nodeId, html, device, breakpoint, at: new Date().toISOString() };
    },

    deviceForWidth(width) {
      if (width <= 480) return "mobile";
      if (width <= 1024) return "tablet";
      return "desktop";
    },
  };

  return engine;
}

export default createPreviewEngine;
