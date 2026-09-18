// acrx/assets/js/editor/engines/link-engine.js
//
// ENGINE 28 — Link Engine (headless).
// URLs, internal/external/anchor links, target + rel semantics, validation,
// normalization, metadata and serialization. Provider-agnostic pure data.

export const LINK_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "link";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const TRUSTED_REL = new Set(["noopener", "noreferrer", "nofollow", "sponsored", "ugc", "alternate", "canonical"]);

function linkError(operation, code, message) {
  const err = new Error(message);
  err.name = "LinkError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function isAnchor(href) {
  return typeof href === "string" && href.startsWith("#");
}

function isRelative(href) {
  return typeof href === "string" && /^(?:\/|\.\/|\.\.\/|\?)/.test(href);
}

export function classifyLink(href, opts = {}) {
  const value = String(href || "").trim();
  if (value === "") return { kind: "empty", internal: false, external: false };
  if (isAnchor(value)) return { kind: "anchor", internal: true, external: false };
  if (isRelative(value)) return { kind: "internal", internal: true, external: false };
  try {
    const parsed = new URL(value);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return { kind: "unsafe", internal: false, external: false };
    if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") {
      return { kind: parsed.protocol.slice(0, -1), internal: false, external: false };
    }
    if (opts.siteHost) {
      const host = String(opts.siteHost).toLowerCase().replace(/^www\./, "");
      const target = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (target === host) return { kind: "internal", internal: true, external: false };
    }
    return { kind: "external", internal: false, external: true };
  } catch {
    return { kind: "invalid", internal: false, external: false };
  }
}

export function normalizeUrl(href) {
  const value = String(href || "").trim();
  if (value === "" || isAnchor(value) || isRelative(value)) return value;
  if (/^(mailto|tel):/i.test(value)) return value;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+/.test(value)) return `https://${value}`;
  return value;
}

export function buildRel({ target, rel, external } = {}) {
  const parts = String(rel || "").split(/\s+/).filter(Boolean);
  if (target === "_blank") {
    if (!parts.includes("noopener")) parts.push("noopener");
    if (!parts.includes("noreferrer")) parts.push("noreferrer");
  }
  if (external && !parts.includes("noopener") && target === "_blank") parts.push("noopener");
  return [...new Set(parts)].join(" ");
}

export function validateLink(link, opts = {}) {
  const errors = [];
  const warnings = [];
  const fail = (code, path, message) => errors.push({ code, path, message, severity: "error" });
  if (!link || typeof link !== "object") {
    return { valid: false, errors: [{ code: "INVALID_LINK", path: "", message: "Link must be an object.", severity: "error" }], warnings };
  }
  const href = link.href !== undefined ? String(link.href) : "";
  if (href.trim() === "") {
    fail("EMPTY_HREF", "href", "Link href must not be empty.");
  } else {
    const cls = classifyLink(href, opts);
    if (cls.kind === "invalid") fail("INVALID_URL", "href", `"${href}" is not a valid URL.`);
    if (cls.kind === "unsafe") fail("UNSAFE_PROTOCOL", "href", `"${href}" uses a disallowed protocol.`);
    if (cls.kind === "external" && !link.text && !link.ariaLabel && opts.requireLabel !== false) {
      warnings.push({ code: "LINK_LABEL", path: "", message: "External links should carry accessible label text.", severity: "warning" });
    }
  }
  if (link.target !== undefined && !["", "_self", "_blank", "_parent", "_top"].includes(link.target)) {
    fail("BAD_TARGET", "target", `Unsupported link target "${link.target}".`);
  }
  for (const token of String(link.rel || "").split(/\s+/).filter(Boolean)) {
    if (!TRUSTED_REL.has(token)) {
      warnings.push({ code: "UNKNOWN_REL", path: "rel", message: `Unrecognized rel token "${token}".`, severity: "warning" });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function createLink(href, opts = {}) {
  const normalized = normalizeUrl(href);
  const cls = classifyLink(normalized, opts);
  if (cls.kind === "invalid" || cls.kind === "unsafe" || cls.kind === "empty") {
    throw linkError("createLink", "INVALID_URL", `Cannot create link from "${href}".`);
  }
  return {
    href: normalized,
    kind: cls.kind,
    internal: cls.internal,
    external: cls.external,
    target: opts.target || (cls.external ? "_blank" : "_self"),
    rel: buildRel({ target: opts.target || (cls.external ? "_blank" : "_self"), rel: opts.rel, external: cls.external }),
    text: opts.text || "",
    title: opts.title || "",
  };
}

export function serializeLink(link) {
  if (!link || typeof link !== "object") throw linkError("serializeLink", "INVALID_LINK", "Link must be an object.");
  return JSON.parse(JSON.stringify({
    href: link.href || "", target: link.target || "_self", rel: link.rel || "",
    text: link.text || "", title: link.title || "",
  }));
}

export function createLinkEngine(siteOpts = {}) {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return LINK_ENGINE_VERSION; },
    classify: (href) => classifyLink(href, siteOpts),
    normalize: normalizeUrl,
    buildRel,
    validate: (link) => validateLink(link, siteOpts),
    create: (href, opts) => createLink(href, { ...siteOpts, ...(opts || {}) }),
    serialize: serializeLink,
  };
}

export default createLinkEngine;
