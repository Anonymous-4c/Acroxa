// acrx/assets/js/editor/engines/asset-engine.js
//
// ENGINE 26 — Asset Engine (headless, provider-agnostic).
// Asset references, metadata, IDs, URLs, dimensions, MIME types, alt text,
// replacement, deletion, validation and serialization. Knows nothing about
// storage providers — it tracks references and their metadata.

export const ASSET_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "asset";

let assetCounter = 0;

function assetError(operation, code, message) {
  const err = new Error(message);
  err.name = "AssetError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function kindOfMime(mime) {
  const m = String(mime || "");
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || m.startsWith("text/")) return "document";
  return "file";
}

export function validateAsset(asset) {
  const errors = [];
  const fail = (code, path, message) => errors.push({ code, path, message, severity: "error" });
  if (!asset || typeof asset !== "object") {
    return { valid: false, errors: [{ code: "INVALID_ASSET", path: "", message: "Asset must be an object.", severity: "error" }], warnings: [] };
  }
  if (!asset.id || typeof asset.id !== "string") fail("MISSING_ID", "id", "Asset requires a string id.");
  if (!asset.url || typeof asset.url !== "string" || asset.url.trim() === "") fail("MISSING_URL", "url", "Asset requires a URL.");
  if (asset.mime !== undefined && typeof asset.mime !== "string") fail("BAD_MIME", "mime", "Asset mime must be a string.");
  for (const dim of ["width", "height", "size"]) {
    if (asset[dim] !== undefined && asset[dim] !== null && (typeof asset[dim] !== "number" || asset[dim] < 0)) {
      fail("BAD_DIMENSION", dim, `Asset ${dim} must be a non-negative number.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function createAssetEngine() {
  const assets = new Map();
  const listeners = new Map();

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb({ engine: ENGINE_ID, event, ...payload }); } catch (err) {
        if (typeof console !== "undefined") console.error(`[asset] listener for "${event}" threw:`, err);
      }
    }
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return ASSET_ENGINE_VERSION; },

    register(raw) {
      if (!raw || typeof raw !== "object") throw assetError("register", "INVALID_ASSET", "Asset must be an object.");
      const asset = {
        id: raw.id || `asset_${(++assetCounter).toString(36)}`,
        url: raw.url || "",
        mime: raw.mime || "application/octet-stream",
        kind: raw.kind || kindOfMime(raw.mime),
        alt: raw.alt || "",
        title: raw.title || "",
        width: raw.width ?? null,
        height: raw.height ?? null,
        size: raw.size ?? null,
        meta: raw.meta && typeof raw.meta === "object" ? JSON.parse(JSON.stringify(raw.meta)) : {},
      };
      const check = validateAsset(asset);
      if (!check.valid) throw assetError("register", check.errors[0].code, check.errors[0].message);
      const existed = assets.has(asset.id);
      assets.set(asset.id, Object.freeze(JSON.parse(JSON.stringify(asset))));
      emit(existed ? "asset:replaced" : "asset:added", { id: asset.id });
      return engine.get(asset.id);
    },

    get(id) {
      const a = assets.get(id);
      return a ? JSON.parse(JSON.stringify(a)) : null;
    },

    has(id) {
      return assets.has(id);
    },

    replace(id, patch) {
      const current = assets.get(id);
      if (!current) throw assetError("replace", "NOT_FOUND", `Asset "${id}" does not exist.`);
      return engine.register({ ...JSON.parse(JSON.stringify(current)), ...patch, id });
    },

    remove(id) {
      const removed = assets.delete(id);
      if (removed) emit("asset:removed", { id });
      return removed;
    },

    list(filter) {
      const out = [];
      for (const a of assets.values()) {
        const snap = JSON.parse(JSON.stringify(a));
        if (!filter) out.push(snap);
        else if (typeof filter === "function" ? filter(snap) : snap.kind === filter) out.push(snap);
      }
      return out;
    },

    findByUrl(url) {
      for (const a of assets.values()) {
        if (a.url === url) return JSON.parse(JSON.stringify(a));
      }
      return null;
    },

    validate: validateAsset,

    toJSON() {
      return [...assets.values()].map((a) => JSON.parse(JSON.stringify(a)));
    },

    fromJSON(list) {
      if (!Array.isArray(list)) throw assetError("fromJSON", "INVALID_ASSET", "Asset list must be an array.");
      assets.clear();
      for (const raw of list) engine.register(raw);
      return engine.list().length;
    },

    on(event, cb) {
      if (typeof cb !== "function") throw assetError("on", "INVALID_LISTENER", "Listener must be a function.");
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => engine.off(event, cb);
    },

    off(event, cb) {
      const set = listeners.get(event);
      if (!set) return;
      if (cb) { set.delete(cb); if (set.size === 0) listeners.delete(event); }
      else listeners.delete(event);
    },

    clear() { assets.clear(); },
    destroy() { assets.clear(); listeners.clear(); },
  };

  return engine;
}

export default createAssetEngine;
