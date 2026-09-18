// acrx/assets/js/editor/engines/seo-engine.js
//
// ENGINE 30 — SEO Engine (headless, JSON-driven).
// Serious analysis, not a form: document + metadata + settings in, structured
// analysis JSON out — score, categories, checks, warnings, recommendations,
// metrics and graphical metric data (the UI renders meters/charts from it).
// Every deduction is explainable; nothing is fabricated beyond the input.

export const SEO_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "seo";

const CATEGORIES = ["technical", "content", "onPage", "social", "accessibility"];

function statusFor(score) {
  if (score >= 80) return "good";
  if (score >= 50) return "needs-work";
  return "poor";
}

function inlineTextOf(data) {
  if (!data || typeof data !== "object") return "";
  const parts = [];
  if (typeof data.text === "string") parts.push(data.text);
  if (typeof data.title === "string") parts.push(data.title);
  if (Array.isArray(data.content)) {
    for (const n of data.content) {
      if (n && n.type === "text" && typeof n.text === "string") parts.push(n.text);
    }
  }
  return parts.join(" ");
}

function collectNodes(doc) {
  if (!doc) return [];
  if (typeof doc.traverse === "function") {
    const out = [];
    doc.traverse((n) => out.push(n));
    return out;
  }
  if (Array.isArray(doc.nodes)) return doc.nodes;
  if (doc.type === "doc" && Array.isArray(doc.content)) {
    // RTE-shaped doc: synthesize shallow node views.
    return doc.content.map((b, i) => ({ id: `rte-${i}`, type: b.type, data: { ...(b.attrs || {}), content: b.content } }));
  }
  return [];
}

function wordsOf(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function sentencesOf(text) {
  return String(text || "").split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
}

export function analyzeSEO(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
  const nodes = collectNodes(input.document);
  const explicitText = typeof input.text === "string" ? input.text : null;

  // Corpus assembly (all derivable from supplied JSON only).
  const nodeTexts = nodes.map((n) => inlineTextOf(n.data)).filter(Boolean);
  const fullText = explicitText !== null ? explicitText : nodeTexts.join("\n");
  const words = wordsOf(fullText);
  const sentences = sentencesOf(fullText);
  const headings = nodes.filter((n) => n.type === "heading").map((n) => ({
    id: n.id,
    level: Number(n.data?.level) >= 1 && Number(n.data?.level) <= 6 ? Number(n.data.level) : 2,
    text: inlineTextOf(n.data),
  }));
  const images = nodes.filter((n) => n.type === "image" || n.data?.src?.match?.(/\.(png|jpe?g|gif|webp|avif|svg)$/i));
  const links = [];
  for (const n of nodes) {
    const d = n.data || {};
    if (d.href) links.push({ nodeId: n.id, href: d.href, text: inlineTextOf(d) });
    if (Array.isArray(d.content)) {
      for (const inline of d.content) {
        const mark = inline?.marks?.find((m) => m.type === "link");
        if (mark) links.push({ nodeId: n.id, href: mark.attrs?.href || "", text: inline.text || "" });
      }
    }
  }
  const internalLinks = links.filter((l) => /^(#|\/|[^:/?#]+$)/.test(l.href) || (settings.siteHost && l.href.includes(settings.siteHost)));
  const externalLinks = links.filter((l) => /^https?:\/\//.test(l.href) && !internalLinks.includes(l));

  const title = metadata.metaTitle || metadata.title || "";
  const description = metadata.metaDescription || metadata.description || "";
  const keyword = (metadata.focusKeyword || "").trim().toLowerCase();
  const slug = metadata.slug || "";
  const canonical = metadata.canonical || metadata.canonicalUrl || "";

  const checks = [];
  const add = (id, category, severity, points, message, recommendation, metric) => {
    checks.push({ id, category, severity, points, message, recommendation, ...(metric !== undefined ? { metric } : {}) });
  };

  // ── Technical ──
  if (canonical) add("canonical-present", "technical", "info", 0, "Canonical URL is set.", null);
  else add("missing-canonical", "technical", "warning", -4, "No canonical URL is set.", "Set a canonical URL to consolidate ranking signals.");
  if (metadata.language || metadata.lang) add("language-set", "technical", "info", 0, "Content language is declared.", null);
  else add("missing-language", "technical", "warning", -3, "No content language declared.", "Set the page language (e.g. \"en\").");
  if (metadata.robots?.noindex || metadata.noIndex) {
    add("robots-noindex", "technical", "warning", -10, "Page is set to noindex and will not appear in search results.", "Remove noindex before publishing, unless intentional.");
  }
  if (slug) add("slug-present", "technical", "info", 0, "URL slug is set.", null);
  else add("missing-slug", "technical", "warning", -4, "No URL slug is set.", "Define a short, keyword-rich slug.");

  // ── Content ──
  const wordCount = words.length;
  if (wordCount >= 600) add("content-length-good", "content", "info", 0, `Content length is healthy (${wordCount} words).`, null, wordCount);
  else if (wordCount >= 300) add("content-length-ok", "content", "warning", -5, `Content is fairly short (${wordCount} words).`, "Aim for 600+ words for competitive topics.", wordCount);
  else add("content-length-thin", "content", "error", -12, `Content is thin (${wordCount} words).`, "Expand thin content; pages under 300 words rarely rank.", wordCount);
  if (sentences.length > 0) {
    const avg = words.length / sentences.length;
    if (avg > 25) add("readability-long", "content", "warning", -4, `Sentences average ${avg.toFixed(1)} words (hard to scan).`, "Break long sentences; aim for ~20 words average.", Number(avg.toFixed(1)));
  }
  if (headings.length === 0) add("no-headings", "content", "error", -10, "Content has no headings.", "Structure content with at least one H1/H2.");
  else {
    const h1s = headings.filter((h) => h.level === 1);
    if (h1s.length === 0) add("no-h1", "content", "warning", -5, "No level-1 heading found.", "Add exactly one H1 summarizing the page.");
    if (h1s.length > 1) add("multiple-h1", "content", "warning", -4, `${h1s.length} H1 headings found.`, "Keep a single H1; demote the rest to H2.");
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level > headings[i - 1].level + 1) {
        add("heading-skip", "content", "warning", -3, `Heading jumps from H${headings[i - 1].level} to H${headings[i].level}.`, "Keep heading levels sequential.", headings[i].id);
        break;
      }
    }
  }
  if (keyword) {
    const lowered = fullText.toLowerCase();
    const kwCount = lowered.split(keyword).length - 1;
    const density = wordCount > 0 ? (kwCount / wordCount) * 100 : 0;
    if (density <= 0) add("keyword-absent", "content", "warning", -6, `Focus keyword "${keyword}" never appears in the copy.`, "Use the focus keyword naturally in headings and body.", 0);
    else if (density <= 3) add("keyword-good", "content", "info", 0, `Keyword density is healthy (${density.toFixed(2)}%).`, null, Number(density.toFixed(2)));
    else add("keyword-stuffed", "content", "warning", -6, `Keyword density is high (${density.toFixed(2)}%).`, "Reduce repetition; write for readers first.", Number(density.toFixed(2)));
  } else {
    add("no-focus-keyword", "content", "warning", -4, "No focus keyword is set.", "Choose one focus keyword per page.");
  }

  // ── On-page ──
  if (!title) add("missing-title", "onPage", "error", -12, "SEO title is empty.", "Write a 30–60 character title containing the keyword.");
  else if (title.length < 30) add("title-short", "onPage", "warning", -5, `Title is short (${title.length} chars).`, "Expand the title toward 30–60 characters.", title.length);
  else if (title.length > 60) add("title-long", "onPage", "warning", -5, `Title is long (${title.length} chars) and may truncate.`, "Trim the title to ~60 characters.", title.length);
  else add("title-good", "onPage", "info", 0, "Title length is in the ideal range.", null, title.length);
  if (keyword && title.toLowerCase().includes(keyword)) add("keyword-in-title", "onPage", "info", 0, "Focus keyword appears in the title.", null);
  else if (keyword && title) add("keyword-missing-title", "onPage", "warning", -4, "Focus keyword is missing from the title.", "Place the keyword near the start of the title.");
  if (!description) add("missing-meta-description", "onPage", "error", -8, "Meta description is empty.", "Write a 120–160 character description with the keyword.");
  else if (description.length < 120) add("description-short", "onPage", "warning", -4, `Meta description is short (${description.length} chars).`, "Expand toward 120–160 characters.", description.length);
  else if (description.length > 160) add("description-long", "onPage", "warning", -3, `Meta description is long (${description.length} chars).`, "Trim to ~160 characters.", description.length);
  else add("description-good", "onPage", "info", 0, "Meta description length is ideal.", null, description.length);
  if (keyword && slug && slug.toLowerCase().includes(keyword.split(/\s+/)[0])) {
    add("keyword-in-slug", "onPage", "info", 0, "Focus keyword appears in the slug.", null);
  } else if (keyword && slug) {
    add("keyword-missing-slug", "onPage", "warning", -2, "Focus keyword is missing from the slug.", "Include the keyword stem in the slug.");
  }
  const firstPara = nodeTexts[0] || "";
  if (keyword && firstPara.toLowerCase().includes(keyword)) add("keyword-in-intro", "onPage", "info", 0, "Keyword appears in the opening paragraph.", null);
  else if (keyword && wordCount > 0) add("keyword-missing-intro", "onPage", "warning", -2, "Keyword is missing from the opening paragraph.", "Mention the keyword within the first 100 words.");

  // ── Links ──
  if (internalLinks.length === 0 && wordCount >= 300) {
    add("no-internal-links", "onPage", "warning", -3, "No internal links found in a long page.", "Link to related content on the site.");
  }
  if (externalLinks.some((l) => !l.text.trim())) {
    add("empty-link-text", "onPage", "warning", -3, "A link has no anchor text.", "Give every link descriptive anchor text.");
  }

  // ── Social ──
  const ogTitle = metadata.ogTitle || "";
  const ogDesc = metadata.ogDescription || "";
  const ogImage = metadata.ogImage || metadata.featuredImage || "";
  if (!ogTitle && !title) add("social-no-title", "social", "warning", -2, "No social share title available.", "Set an Open Graph title (falls back to SEO title).");
  if (!ogDesc && !description) add("social-no-description", "social", "warning", -2, "No social share description available.", "Set an Open Graph description.");
  if (!ogImage) add("social-no-image", "social", "warning", -4, "No social share image set.", "Add a 1200×630 share image for rich previews.");
  else add("social-image-set", "social", "info", 0, "Social share image is set.", null);

  // ── Accessibility signals feeding SEO ──
  const imagesWithoutAlt = images.filter((n) => !(n.data?.alt));
  if (imagesWithoutAlt.length > 0) {
    add("images-missing-alt", "accessibility", "warning", -5, `${imagesWithoutAlt.length} image(s) lack alt text.`, "Describe every image; search uses alt text for image ranking.", imagesWithoutAlt.length);
  } else if (images.length > 0) {
    add("images-alt-ok", "accessibility", "info", 0, "All images define alt text.", null, images.length);
  }

  // ── Scoring ──
  let score = 100;
  for (const c of checks) {
    if (typeof c.points === "number" && c.points < 0) score += c.points;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const catScores = {};
  for (const cat of CATEGORIES) {
    const relevant = checks.filter((c) => c.category === cat && c.points < 0);
    const deduction = relevant.reduce((n, c) => n + Math.abs(c.points), 0);
    // Category budgets keep one weak area from zeroing the whole report.
    const catScore = Math.max(0, 100 - deduction * 4);
    catScores[cat] = { score: catScore, max: 100, status: statusFor(catScore), issues: relevant.length };
  }

  const errors = checks.filter((c) => c.severity === "error");
  const warnings = checks.filter((c) => c.severity === "warning");
  const recommendations = [...errors, ...warnings]
    .filter((c) => c.recommendation)
    .map((c) => ({ checkId: c.id, severity: c.severity, recommendation: c.recommendation }));

  const metrics = {
    wordCount,
    sentenceCount: sentences.length,
    avgSentenceLength: sentences.length > 0 ? Number((words.length / sentences.length).toFixed(1)) : 0,
    headingCount: headings.length,
    h1Count: headings.filter((h) => h.level === 1).length,
    imageCount: images.length,
    imagesMissingAlt: imagesWithoutAlt.length,
    linkCount: links.length,
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    titleLength: title.length,
    descriptionLength: description.length,
  };

  return {
    score,
    maxScore: 100,
    status: statusFor(score),
    categories: catScores,
    checks,
    errorCount: errors.length,
    warningCount: warnings.length,
    warnings: warnings.map((w) => ({ id: w.id, message: w.message, recommendation: w.recommendation })),
    recommendations,
    metrics,
    charts: {
      overall: { score, max: 100, status: statusFor(score) },
      categories: CATEGORIES.map((cat) => ({ id: cat, label: cat, score: catScores[cat].score, max: 100, status: catScores[cat].status })),
      issues: [
        { severity: "error", count: errors.length },
        { severity: "warning", count: warnings.length },
      ],
      keyword: keyword ? { keyword, density: metrics.wordCount > 0 ? Number(((fullText.toLowerCase().split(keyword).length - 1) / metrics.wordCount * 100).toFixed(2)) : 0 } : null,
    },
    analyzedAt: new Date().toISOString(),
  };
}

// ─── Deterministic auto-fixes ─────────────────────────────────────────
// fixForCheck(checkId, context) is the single source of truth for which SEO
// recommendations the UI may fix automatically. It returns { field, value }
// (a patch for the seo store) or null when the issue needs human judgment
// (short titles, missing keywords, structural problems) — in that case the
// UI must guide the user to the field instead of pretending to fix it.
// Only safe, lossless transforms live here: trims, explicit fallbacks
// (social ← SEO title/description), unchecking noindex, and drafting missing
// metadata from the post title / document text supplied by the caller.
export const SEO_AUTO_FIXABLE = Object.freeze([
  "title-long",
  "description-long",
  "missing-title",
  "missing-meta-description",
  "robots-noindex",
  "social-no-title",
  "social-no-description",
]);

export function isAutoFixable(checkId) {
  return SEO_AUTO_FIXABLE.includes(checkId);
}

function trimTo(text, max) {
  const cut = String(text || "").slice(0, max);
  // Prefer a word boundary so the trim doesn't leave a dangling fragment.
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  return trimmed || cut.trim();
}

function draftDescription(docText, max = 160) {
  const flat = String(docText || "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return trimTo(flat, max);
}

export function fixForCheck(checkId, context = {}) {
  const { metaTitle = "", metaDescription = "", postTitle = "", docText = "" } = context;
  switch (checkId) {
    case "title-long":
      if (!metaTitle || metaTitle.length <= 60) return null;
      return { field: "metaTitle", value: trimTo(metaTitle, 60) };
    case "description-long":
      if (!metaDescription || metaDescription.length <= 160) return null;
      return { field: "metaDescription", value: trimTo(metaDescription, 160) };
    case "missing-title": {
      const source = String(postTitle || "").trim() || String(docText || "").replace(/\s+/g, " ").trim();
      if (!source) return null;
      return { field: "metaTitle", value: trimTo(source, 60) };
    }
    case "missing-meta-description": {
      const drafted = draftDescription(docText);
      if (!drafted) return null;
      return { field: "metaDescription", value: drafted };
    }
    case "robots-noindex":
      return { field: "noIndex", value: false };
    case "social-no-title": {
      const title = String(metaTitle || "").trim() || String(postTitle || "").trim();
      if (!title) return null;
      return { field: "ogTitle", value: title };
    }
    case "social-no-description": {
      const desc = String(metaDescription || "").trim();
      if (!desc) return null;
      return { field: "ogDescription", value: desc };
    }
    default:
      return null;
  }
}

export function createSEOEngine(defaults = {}) {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return SEO_ENGINE_VERSION; },
    analyze: (input) => analyzeSEO({ settings: defaults.settings || {}, ...(input || {}) }),
    fixForCheck,
    isAutoFixable,
  };
}

export default createSEOEngine;
