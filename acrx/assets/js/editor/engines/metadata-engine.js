// acrx/assets/js/editor/engines/metadata-engine.js
//
// ENGINE 29 — Metadata Engine (headless).
// Generic page/document metadata — title, description, author, canonical,
// language, robots, social references, custom entries — with normalization,
// validation and head-tag derivation. Scoring lives in the SEO engine.

export const METADATA_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "metadata";

function metaError(operation, code, message) {
  const err = new Error(message);
  err.name = "MetadataError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export const METADATA_FIELDS = Object.freeze([
  "title", "description", "author", "canonical", "language", "robots",
  "ogTitle", "ogDescription", "ogImage", "ogType", "twitterCard",
  "twitterTitle", "twitterDescription", "twitterImage", "focusKeyword",
  "keywords", "custom",
]);

export function normalizeMetadata(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {
    title: String(src.title || ""),
    description: String(src.description || ""),
    author: String(src.author || ""),
    canonical: String(src.canonical || src.canonicalUrl || ""),
    language: String(src.language || "en"),
    robots: {
      noindex: !!(src.robots?.noindex ?? src.noIndex ?? false),
      nofollow: !!(src.robots?.nofollow ?? src.noFollow ?? false),
    },
    ogTitle: String(src.ogTitle || ""),
    ogDescription: String(src.ogDescription || ""),
    ogImage: String(src.ogImage || ""),
    ogType: String(src.ogType || "website"),
    twitterCard: String(src.twitterCard || "summary_large_image"),
    twitterTitle: String(src.twitterTitle || ""),
    twitterDescription: String(src.twitterDescription || ""),
    twitterImage: String(src.twitterImage || ""),
    focusKeyword: String(src.focusKeyword || ""),
    keywords: Array.isArray(src.keywords) ? src.keywords.map(String) : [],
    custom: src.custom && typeof src.custom === "object" && !Array.isArray(src.custom)
      ? JSON.parse(JSON.stringify(src.custom)) : {},
  };
  if (src.slug !== undefined) out.slug = String(src.slug);
  if (src.url !== undefined) out.url = String(src.url);
  return out;
}

export function validateMetadata(meta) {
  const errors = [];
  const warnings = [];
  const m = meta && typeof meta === "object" ? meta : {};
  if (m.title !== undefined && typeof m.title !== "string") {
    errors.push({ code: "BAD_TITLE", path: "title", message: "Title must be a string.", severity: "error" });
  }
  if (m.canonical) {
    const value = String(m.canonical);
    if (/^(https?:\/\/|\/[^/\s])/.test(value)) {
      try {
        const u = new URL(value, "https://placeholder.local");
        if (!["http:", "https:"].includes(u.protocol)) {
          errors.push({ code: "BAD_CANONICAL", path: "canonical", message: "Canonical URL is invalid.", severity: "error" });
        }
      } catch {
        errors.push({ code: "BAD_CANONICAL", path: "canonical", message: "Canonical URL is invalid.", severity: "error" });
      }
    } else {
      errors.push({ code: "BAD_CANONICAL", path: "canonical", message: "Canonical URL must be absolute or site-relative.", severity: "error" });
    }
  }
  if (m.language !== undefined && !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(m.language))) {
    warnings.push({ code: "BAD_LANGUAGE", path: "language", message: `Language "${m.language}" is not a valid BCP-47 tag.`, severity: "warning" });
  }
  if (m.keywords !== undefined && !Array.isArray(m.keywords)) {
    errors.push({ code: "BAD_KEYWORDS", path: "keywords", message: "Keywords must be an array.", severity: "error" });
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function mergeMetadata(base = {}, override = {}) {
  const a = normalizeMetadata(base);
  const b = normalizeMetadata(override);
  const out = { ...a };
  for (const key of METADATA_FIELDS) {
    if (key === "robots") out.robots = { ...a.robots, ...b.robots };
    else if (key === "keywords") out.keywords = b.keywords.length > 0 ? b.keywords : a.keywords;
    else if (key === "custom") out.custom = { ...a.custom, ...b.custom };
    else if (b[key] !== "" && b[key] !== undefined) out[key] = b[key];
  }
  if (b.slug !== undefined && b.slug !== "") out.slug = b.slug;
  if (b.url !== undefined && b.url !== "") out.url = b.url;
  return out;
}

export function robotsContent(meta) {
  const robots = (meta && meta.robots) || {};
  const parts = [];
  parts.push(robots.noindex ? "noindex" : "index");
  parts.push(robots.nofollow ? "nofollow" : "follow");
  return parts.join(", ");
}

// Derived <head> tags (escaped). The HTML Export engine embeds these.
export function toHeadTags(meta) {
  const m = normalizeMetadata(meta);
  const tags = [];
  if (m.title) tags.push(`<title>${escapeAttr(m.title)}</title>`);
  if (m.description) tags.push(`<meta name="description" content="${escapeAttr(m.description)}">`);
  if (m.author) tags.push(`<meta name="author" content="${escapeAttr(m.author)}">`);
  if (m.canonical) tags.push(`<link rel="canonical" href="${escapeAttr(m.canonical)}">`);
  tags.push(`<meta name="robots" content="${escapeAttr(robotsContent(m))}">`);
  if (m.language) tags.push(`<meta http-equiv="content-language" content="${escapeAttr(m.language)}">`);
  if (m.ogTitle || m.title) tags.push(`<meta property="og:title" content="${escapeAttr(m.ogTitle || m.title)}">`);
  if (m.ogDescription || m.description) tags.push(`<meta property="og:description" content="${escapeAttr(m.ogDescription || m.description)}">`);
  if (m.ogImage) tags.push(`<meta property="og:image" content="${escapeAttr(m.ogImage)}">`);
  tags.push(`<meta property="og:type" content="${escapeAttr(m.ogType)}">`);
  tags.push(`<meta name="twitter:card" content="${escapeAttr(m.twitterCard)}">`);
  return tags;
}

export function createMetadataEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return METADATA_ENGINE_VERSION; },
    fields: [...METADATA_FIELDS],
    normalize: normalizeMetadata,
    validate: validateMetadata,
    merge: mergeMetadata,
    robotsContent,
    toHeadTags,
  };
}

export default createMetadataEngine;
