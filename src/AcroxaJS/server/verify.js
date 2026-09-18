// src/AcroxaJS/server/verify.js
// Update verification helpers: content hash + generation guard.
// RR embeds verify{hash,bytes}; the browser recomputes nothing (no crypto
// dep) — it checks presence + byte length + generation ordering via
// dom/transaction. Full hash verification happens server-side on re-render
// mismatch reports and in tests. Hash = sha256(html).slice(0,16).

"use strict";

const crypto = require("crypto");

function hashHtml(html) {
  return crypto.createHash("sha256").update(String(html || ""), "utf8").digest("hex").slice(0, 16);
}

function verifyEnvelope({ boundary = null, html = "", rev = 0, bootId = null, generation = 0 } = {}) {
  const body = String(html || "");
  return {
    boundary: boundary || null,
    html: body,
    rev: Number.isInteger(rev) ? rev : 0,
    bootId: bootId || null,
    generation: Number.isInteger(generation) ? generation : 0,
    verify: { hash: hashHtml(body), bytes: Buffer.byteLength(body, "utf8") },
    at: Date.now(),
  };
}

function checkHtml(html, verify) {
  if (!verify || typeof verify.hash !== "string") return { ok: false, reason: "missing verify.hash" };
  const actual = hashHtml(html);
  if (actual !== verify.hash) return { ok: false, reason: `hash mismatch (expected ${verify.hash}, got ${actual})`, actual };
  return { ok: true };
}

module.exports = { hashHtml, verifyEnvelope, checkHtml };
