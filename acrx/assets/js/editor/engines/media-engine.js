// acrx/assets/js/editor/engines/media-engine.js
//
// ENGINE 27 — Media Engine (headless).
// Images, video, audio and embeds: metadata normalization, responsive source
// sets, poster/dimension handling, provider-aware embed contracts and
// validation. Storage-provider agnostic; rendering contracts name a renderer.

export const MEDIA_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "media";

function mediaError(operation, code, message) {
  const err = new Error(message);
  err.name = "MediaError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/ogg"]);
const AUDIO_MIMES = new Set(["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"]);

export function mediaKind(mime, url) {
  const m = String(mime || "");
  if (IMAGE_MIMES.has(m) || m.startsWith("image/")) return "image";
  if (VIDEO_MIMES.has(m) || m.startsWith("video/")) return "video";
  if (AUDIO_MIMES.has(m) || m.startsWith("audio/")) return "audio";
  if (detectEmbed(url).provider) return "embed";
  return "file";
}

export function detectEmbed(url) {
  const value = String(url || "");
  let m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(value);
  if (m) return { provider: "youtube", id: m[1], embedUrl: `https://www.youtube.com/embed/${m[1]}`, renderer: "embed.youtube" };
  m = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(value);
  if (m) return { provider: "vimeo", id: m[1], embedUrl: `https://player.vimeo.com/video/${m[1]}`, renderer: "embed.vimeo" };
  m = /open\.spotify\.com\/(track|episode|playlist|album)\/([\w]+)/i.exec(value);
  if (m) return { provider: "spotify", id: `${m[1]}/${m[2]}`, embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, renderer: "embed.spotify" };
  return { provider: null, id: null, embedUrl: null, renderer: "embed.generic" };
}

// Build a srcset string from a base URL + width list. `pattern` receives the
// width and must return the variant URL (provider-agnostic by design).
export function buildSrcSet(url, widths, pattern) {
  if (!Array.isArray(widths) || widths.length === 0) {
    throw mediaError("buildSrcSet", "INVALID_WIDTHS", "Widths must be a non-empty array.");
  }
  const make = typeof pattern === "function" ? pattern : (w) => `${url}?w=${w}`;
  return widths.map((w) => {
    if (!Number.isInteger(w) || w <= 0) throw mediaError("buildSrcSet", "INVALID_WIDTHS", `Invalid width ${JSON.stringify(w)}.`);
    return `${make(w)} ${w}w`;
  }).join(", ");
}

export function sizesFor(breakpoints) {
  // { mobile: "100vw", tablet: "50vw", desktop: "33vw" } -> sizes attribute.
  const order = [["tablet", 768], ["desktop", 1024]];
  const parts = [];
  const bp = breakpoints || {};
  for (const [name, min] of order) {
    if (bp[name]) parts.push(`(min-width: ${min}px) ${bp[name]}`);
  }
  parts.push(bp.mobile || "100vw");
  return parts.join(", ");
}

export function validateMedia(media) {
  const errors = [];
  const warnings = [];
  const fail = (code, path, message) => errors.push({ code, path, message, severity: "error" });
  if (!media || typeof media !== "object") {
    return { valid: false, errors: [{ code: "INVALID_MEDIA", path: "", message: "Media must be an object.", severity: "error" }], warnings };
  }
  if (!media.src || typeof media.src !== "string" || media.src.trim() === "") fail("MISSING_SRC", "src", "Media requires a source URL.");
  const kind = media.kind || mediaKind(media.mime, media.src);
  if (kind === "image" && !media.alt) {
    warnings.push({ code: "MISSING_ALT", path: "alt", message: "Images should define alt text.", severity: "warning" });
  }
  if ((kind === "image" || kind === "video") && media.width !== undefined && media.width !== null) {
    if (typeof media.width !== "number" || media.width <= 0) fail("BAD_DIMENSION", "width", "Width must be a positive number.");
  }
  if ((kind === "image" || kind === "video") && media.height !== undefined && media.height !== null) {
    if (typeof media.height !== "number" || media.height <= 0) fail("BAD_DIMENSION", "height", "Height must be a positive number.");
  }
  if (kind === "video" && !media.poster) {
    warnings.push({ code: "MISSING_POSTER", path: "poster", message: "Video benefits from a poster image.", severity: "warning" });
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function normalizeMedia(raw) {
  if (!raw || typeof raw !== "object") throw mediaError("normalizeMedia", "INVALID_MEDIA", "Media must be an object.");
  const kind = raw.kind || mediaKind(raw.mime, raw.src);
  const embed = kind === "embed" ? detectEmbed(raw.src) : { provider: null, id: null, embedUrl: null, renderer: null };
  return JSON.parse(JSON.stringify({
    kind,
    src: raw.src || "",
    mime: raw.mime || "",
    alt: raw.alt || "",
    title: raw.title || "",
    width: raw.width ?? null,
    height: raw.height ?? null,
    poster: raw.poster || null,
    caption: raw.caption || "",
    responsive: raw.responsive && typeof raw.responsive === "object" ? raw.responsive : {},
    provider: embed.provider || raw.provider || null,
    embedUrl: embed.embedUrl || raw.embedUrl || null,
    renderer: embed.renderer || raw.renderer || `media.${kind}`,
  }));
}

export function createMediaEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return MEDIA_ENGINE_VERSION; },
    kind: mediaKind,
    detectEmbed,
    buildSrcSet,
    sizesFor,
    validate: validateMedia,
    normalize: normalizeMedia,
  };
}

export default createMediaEngine;
