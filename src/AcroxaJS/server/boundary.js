// src/AcroxaJS/server/boundary.js
// Phase 2 server slice: boundary-annotated HTML + fragment envelope.
// Composes with src/views/lib/framework.js (string HTML) — framework.js
// is untouched; this helper only adds deterministic data-acrx-* attrs so
// the client reconciler (dom-patch.js) and hydration can key on them.
//
// Boundary HTML: <div data-acrx-id="boundary:<owner>:<name>" ...>inner</div>
// Fragment envelope (targeted update payload over fetch/SSE):
//   { boundary, html, rev, bootId, at }

"use strict";

const identity = require("../contracts/identity");

function escapeAttrValue(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Wrap already-rendered inner HTML in a boundary div. Pure string op,
// same escaping contract as framework.js escapeAttr().
function renderBoundary(owner, name, innerHtml, opts = {}) {
  const id = identity.boundaryId(owner, name);
  const attrs = [`data-acrx-id="${escapeAttrValue(id)}"`];
  const hydrate = opts.hydrate || "immediate";
  attrs.push(`data-acrx-hydrate="${escapeAttrValue(hydrate)}"`);
  if (opts.component) attrs.push(`data-acrx-component="${escapeAttrValue(opts.component)}"`);
  attrs.push(`data-acrx-owner="${escapeAttrValue(owner || "core")}"`);
  if (opts.rev !== undefined && opts.rev !== null) attrs.push(`data-acrx-rev="${escapeAttrValue(opts.rev)}"`);
  const extra = opts.attrs && typeof opts.attrs === "object"
    ? " " + Object.entries(opts.attrs).map(([k, v]) => `${k}="${escapeAttrValue(v)}"`).join(" ")
    : "";
  return `<div ${attrs.join(" ")}${extra}>${innerHtml || ""}</div>`;
}

// Does this HTML string carry the boundary marker? Cheap gate used by
// tests and the fragment endpoint to reject unmarked payloads.
function carriesBoundary(html, owner, name) {
  if (typeof html !== "string") return false;
  const id = identity.boundaryId(owner, name);
  return html.includes(`data-acrx-id="${id}"`);
}

function fragment(owner, name, html) {
  let rev = 0;
  let bootId = null;
  try {
    const revision = require("../../core/runtime/revision");
    rev = revision.get();
    bootId = revision.bootId();
  } catch (_) {}
  return {
    boundary: identity.boundaryId(owner, name),
    html: String(html),
    rev,
    bootId,
    at: Date.now(),
  };
}

module.exports = { renderBoundary, carriesBoundary, fragment };
