// acrx/assets/js/editor/engines/ai-engine.js
//
// AI Integration Engine (headless).
// Structured, token-conscious snapshots of editor state for AI consumers —
// document digests, selection summaries, analysis rollups — without DOM
// scraping. Supports redaction paths, truncation budgets and token estimates
// (heuristic, always labeled as estimates).

export const AI_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "ai";

function aiError(operation, code, message) {
  const err = new Error(message);
  err.name = "AIEngineError"; err.code = code; err.engine = ENGINE_ID; err.operation = operation;
  return err;
}

function truncateText(text, max) {
  const t = String(text || "");
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function nodeDigest(node, budget) {
  const data = (node && node.data) || {};
  const digest = { id: node.id, type: node.type, children: (node.children || []).length };
  const texts = [];
  if (typeof data.text === "string" && data.text) texts.push(data.text);
  if (typeof data.title === "string" && data.title) texts.push(data.title);
  if (Array.isArray(data.content)) {
    texts.push(data.content.filter((c) => c?.type === "text").map((c) => c.text).join(""));
  }
  const joined = texts.join(" / ").trim();
  if (joined) digest.text = truncateText(joined, budget);
  const keys = ["level", "href", "src", "alt", "align", "variant"].filter((k) => data[k] !== undefined);
  if (keys.length > 0) {
    digest.attrs = {};
    for (const k of keys) digest.attrs[k] = typeof data[k] === "string" ? truncateText(data[k], 120) : data[k];
  }
  return digest;
}

function deletePaths(obj, paths) {
  for (const path of paths || []) {
    const segs = String(path).split(".");
    let cursor = obj;
    for (let i = 0; i < segs.length - 1; i++) {
      cursor = cursor?.[segs[i]];
      if (!cursor || typeof cursor !== "object") break;
    }
    if (cursor && typeof cursor === "object") delete cursor[segs[segs.length - 1]];
  }
}

export function estimateTokens(text) {
  // ~4 chars/token heuristic for English prose. Labeled estimate, never exact.
  return { tokens: Math.ceil(String(text || "").length / 4), estimated: true, basis: "chars/4" };
}

export function createAIEngine(options = {}) {
  const textBudget = options.textBudget || 240;
  const maxNodes = options.maxNodes || 200;

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return AI_ENGINE_VERSION; },

    // Compact document digest: structure + skimmed text, capped for context.
    digestDocument(doc, opts = {}) {
      if (!doc || typeof doc.getNode !== "function") {
        throw aiError("digestDocument", "INVALID_DOCUMENT", "AI digest requires a document with getNode().");
      }
      const budget = opts.textBudget || textBudget;
      const limit = opts.maxNodes || maxNodes;
      const nodes = [];
      let truncated = false;
      doc.traverse((n) => {
        if (nodes.length >= limit) { truncated = true; return false; }
        nodes.push(nodeDigest(n, budget));
      });
      const digest = {
        kind: "document-digest",
        documentId: doc.id || null,
        rev: doc.rev ?? null,
        nodeCount: doc.size ?? nodes.length,
        nodes,
        truncated,
      };
      if (opts.redact) deletePaths(digest, opts.redact);
      return digest;
    },

    summarizeSelection(selection, doc) {
      if (!selection) return { kind: "selection-summary", empty: true };
      const sel = typeof selection.get === "function" ? selection.get() : selection;
      const summary = {
        kind: "selection-summary",
        empty: sel.mode === "none",
        mode: sel.mode,
        blockIds: sel.mode === "blocks" ? [...(sel.blockIds || [])] : [...new Set([sel.anchorId, sel.focusId].filter(Boolean))],
      };
      if (doc && typeof doc.getNode === "function") {
        summary.blocks = summary.blockIds.slice(0, 10).map((id) => {
          const n = doc.getNode(id);
          return n ? nodeDigest(n, textBudget) : { id, missing: true };
        });
      }
      return summary;
    },

    rollupAnalysis({ seo, accessibility, performance, validation } = {}) {
      const rollup = { kind: "analysis-rollup", at: new Date().toISOString() };
      if (seo) rollup.seo = { score: seo.score, status: seo.status, errors: seo.errorCount, warnings: seo.warningCount, top: (seo.recommendations || []).slice(0, 5) };
      if (accessibility) rollup.accessibility = { score: accessibility.score, status: accessibility.status, errors: accessibility.errorCount, warnings: accessibility.warningCount };
      if (performance) rollup.performance = { score: performance.score, status: performance.status, estimated: performance.estimated, warnings: (performance.warnings || []).length };
      if (validation) rollup.validation = { valid: validation.valid, errors: (validation.errors || []).length, warnings: (validation.warnings || []).length };
      return rollup;
    },

    // Full context pack for one AI call: digest + selection + analyses.
    contextPack(parts = {}) {
      const pack = { kind: "ai-context", version: AI_ENGINE_VERSION, at: new Date().toISOString() };
      if (parts.document) pack.document = engine.digestDocument(parts.document, parts.digestOpts || {});
      if (parts.selection) pack.selection = engine.summarizeSelection(parts.selection, parts.document || null);
      if (parts.metadata) pack.metadata = JSON.parse(JSON.stringify(parts.metadata));
      if (parts.analysis) pack.analysis = engine.rollupAnalysis(parts.analysis);
      if (parts.redact) deletePaths(pack, parts.redact);
      const text = JSON.stringify(pack);
      pack.budget = { chars: text.length, ...estimateTokens(text) };
      return pack;
    },

    estimateTokens,
  };

  return engine;
}

export default createAIEngine;
