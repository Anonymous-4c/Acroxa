// acrx/assets/js/editor/engines/performance-engine.js
//
// ENGINE — Performance Analysis Engine (headless).
// Document-level signals derivable WITHOUT loading the deployed site: media
// metadata, DOM-complexity estimates, nesting depth, resource counts.
// Estimates are labeled estimated:true and measured stays null — an estimate
// is never presented as a browser measurement.

export const PERFORMANCE_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "performance";

function collectNodes(doc) {
  if (!doc) return [];
  if (typeof doc.traverse === "function") {
    const out = [];
    doc.traverse((n) => { out.push({ node: n, depth: 0 }); });
    // Re-walk with depths (traverse snapshots lack depth info).
    const withDepth = [];
    const walk = (id, depth) => {
      const n = doc.getNode(id);
      if (!n) return;
      withDepth.push({ node: n, depth });
      for (const cid of n.children || []) walk(cid, depth + 1);
    };
    if (doc.rootId) walk(doc.rootId, -1);
    return withDepth.filter((d) => d.depth >= 0);
  }
  if (Array.isArray(doc.nodes)) {
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const out = [];
    const walk = (id, depth) => {
      const n = byId.get(id);
      if (!n) return;
      out.push({ node: n, depth });
      for (const cid of n.children || []) walk(cid, depth + 1);
    };
    if (doc.rootId) walk(doc.rootId, -1);
    return out.filter((d) => d.depth >= 0);
  }
  return [];
}

export function analyzePerformance(input = {}) {
  const entries = collectNodes(input.document);
  const nodes = entries.map((e) => e.node);
  const maxDepth = entries.reduce((m, e) => Math.max(m, e.depth), 0);

  const images = nodes.filter((n) => n.type === "image" || /\.(png|jpe?g|gif|webp|avif)$/i.test(n.data?.src || ""));
  const videos = nodes.filter((n) => n.type === "video" || n.data?.provider === "youtube" || n.data?.provider === "vimeo" || n.type === "embed");
  const imagesWithoutDimensions = images.filter((n) => !(n.data?.width > 0 && n.data?.height > 0));
  const imagesWithoutAlt = images.filter((n) => !n.data?.alt);
  const externalHrefs = new Set();
  for (const n of nodes) {
    const d = n.data || {};
    if (typeof d.src === "string" && /^https?:\/\//.test(d.src)) externalHrefs.add(d.src);
    if (typeof d.href === "string" && /^https?:\/\//.test(d.href)) externalHrefs.add(d.href);
    if (typeof d.embedUrl === "string" && /^https?:\/\//.test(d.embedUrl)) externalHrefs.add(d.embedUrl);
  }

  // Rough DOM estimate: each block ~ its wrapper + content + handle nodes.
  const estimatedDomNodes = nodes.length * 4;
  const textBytes = nodes.reduce((sum, n) => {
    const d = n.data || {};
    let s = "";
    if (typeof d.text === "string") s += d.text;
    if (Array.isArray(d.content)) s += d.content.filter((c) => c?.type === "text").map((c) => c.text).join("");
    return sum + BufferByteLength(s);
  }, 0);

  const warnings = [];
  const warn = (id, message, recommendation, metric) => warnings.push({ id, severity: "warning", message, recommendation, ...(metric !== undefined ? { metric } : {}) });
  if (images.length > 10) warn("many-images", `${images.length} images may slow initial render.`, "Lazy-load below-the-fold images and compress assets.", images.length);
  if (imagesWithoutDimensions.length > 0) warn("images-no-dimensions", `${imagesWithoutDimensions.length} image(s) lack dimensions (layout shift risk).`, "Set width/height so the browser can reserve space.", imagesWithoutDimensions.length);
  if (videos.length > 2) warn("many-embeds", `${videos.length} videos/embeds pull third-party players.`, "Facade embeds behind a click-to-play preview.", videos.length);
  if (estimatedDomNodes > 1500) warn("dom-complexity", `Estimated ~${estimatedDomNodes} DOM nodes is heavy.`, "Split long pages or virtualize repeated sections.", estimatedDomNodes);
  if (maxDepth > 6) warn("deep-nesting", `Nesting depth of ${maxDepth} complicates layout.`, "Flatten deeply nested containers.", maxDepth);
  if (externalHrefs.size > 15) warn("many-external", `${externalHrefs.size} external resources imply many connections.`, "Consolidate hosts and preconnect critical origins.", externalHrefs.size);

  let score = 100 - warnings.length * 8;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    maxScore: 100,
    estimated: true,
    status: score >= 80 ? "good" : score >= 50 ? "needs-work" : "poor",
    warnings,
    recommendations: warnings.map((w) => ({ checkId: w.id, recommendation: w.recommendation })),
    estimates: {
      blockCount: nodes.length,
      estimatedDomNodes,
      maxDepth,
      imageCount: images.length,
      imagesWithoutDimensions: imagesWithoutDimensions.length,
      imagesWithoutAlt: imagesWithoutAlt.length,
      videoEmbedCount: videos.length,
      externalResourceCount: externalHrefs.size,
      textBytes,
    },
    measured: null,
    note: "Estimates derive from document structure only; no network or runtime measurement was performed.",
    analyzedAt: new Date().toISOString(),
  };
}

function BufferByteLength(s) {
  if (typeof Buffer !== "undefined" && Buffer.byteLength) {
    try { return Buffer.byteLength(s, "utf8"); } catch { /* fall through */ }
  }
  // Browser-safe approximation (UTF-8 length via encoding).
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

export function createPerformanceEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return PERFORMANCE_ENGINE_VERSION; },
    analyze: analyzePerformance,
  };
}

export default createPerformanceEngine;
