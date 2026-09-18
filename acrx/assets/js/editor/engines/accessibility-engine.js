// acrx/assets/js/editor/engines/accessibility-engine.js
//
// ENGINE 32 — Accessibility Engine (headless).
// Semantic structure, heading hierarchy, alt text, link/button/form labels,
// ARIA references and calculable contrast metadata -> structured JSON with a
// score, warnings and recommendations. Never invents measurements.

export const A11Y_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "accessibility";

const GENERIC_LINK_TEXT = new Set(["click here", "here", "read more", "more", "link", "click"]);

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}

function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(fg, bg) {
  const a = typeof fg === "string" ? hexToRgb(fg.trim().toLowerCase()) : null;
  const b = typeof bg === "string" ? hexToRgb(bg.trim().toLowerCase()) : null;
  if (!a || !b) return null;
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

function collectNodes(doc) {
  if (!doc) return [];
  if (typeof doc.traverse === "function") {
    const out = [];
    doc.traverse((n) => out.push(n));
    return out;
  }
  if (Array.isArray(doc.nodes)) return doc.nodes;
  return [];
}

function inlineTextOf(data) {
  if (!data) return "";
  const parts = [];
  if (typeof data.text === "string") parts.push(data.text);
  if (Array.isArray(data.content)) {
    for (const n of data.content) if (n?.type === "text") parts.push(n.text);
  }
  return parts.join(" ").trim();
}

export function checkAccessibility(input = {}) {
  const nodes = collectNodes(input.document);
  const issues = [];
  const push = (id, severity, points, message, recommendation, path) => {
    issues.push({ id, severity, points, message, recommendation, path: path || null });
  };

  const headings = nodes.filter((n) => n.type === "heading");
  let prevLevel = 0;
  for (const h of headings) {
    const level = Number(h.data?.level) >= 1 && Number(h.data?.level) <= 6 ? Number(h.data.level) : 2;
    if (prevLevel > 0 && level > prevLevel + 1) {
      push("heading-skip", "warning", -4, `Heading order skips from H${prevLevel} to H${level}.`, "Keep heading levels sequential for screen-reader navigation.", h.id);
      break;
    }
    prevLevel = level;
    if (!inlineTextOf(h.data)) push("empty-heading", "warning", -3, "A heading has no accessible text.", "Give every heading descriptive text.", h.id);
  }

  for (const n of nodes.filter((n) => n.type === "image")) {
    if (!n.data?.alt) push("image-no-alt", "error", -8, "An image has no alt text.", "Describe the image or mark it decorative with empty alt plus role.", n.id);
  }
  for (const n of nodes) {
    const href = n.data?.href;
    if (href && !inlineTextOf(n.data) && !n.data?.ariaLabel) {
      push("link-no-label", "error", -8, "A link has no accessible label.", "Add descriptive link text or an aria-label.", n.id);
    }
    const text = inlineTextOf(n.data).toLowerCase();
    if (href && GENERIC_LINK_TEXT.has(text)) {
      push("link-generic-text", "warning", -3, `Link text "${text}" is not descriptive out of context.`, "Describe the destination instead of \"click here\".", n.id);
    }
    if (n.type === "button" && !inlineTextOf(n.data) && !n.data?.ariaLabel) {
      push("button-no-label", "error", -8, "A button has no accessible label.", "Add button text or an aria-label.", n.id);
    }
    if (n.type === "field" || n.type === "input") {
      if (!n.data?.label && !n.data?.ariaLabel) {
        push("field-no-label", "error", -8, "A form field has no label.", "Associate a <label> or aria-label with every field.", n.id);
      }
    }
    const fg = n.data?.style?.textColor;
    const bg = n.data?.style?.backgroundColor;
    if (typeof fg === "string" && typeof bg === "string") {
      const ratio = contrastRatio(fg, bg);
      if (ratio !== null && ratio < 4.5) {
        push("low-contrast", "warning", -4, `Text contrast ${ratio}:1 is below the 4.5:1 AA threshold.`, "Darken text or lighten the background.", n.id);
      }
    }
  }

  if (input.language === undefined && input.metadata?.language === undefined) {
    push("no-language", "warning", -2, "Page language is not declared.", "Set the document language for screen readers.");
  }

  let score = 100;
  for (const i of issues) score += i.points;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    score,
    maxScore: 100,
    status: score >= 80 ? "good" : score >= 50 ? "needs-work" : "poor",
    issues,
    errorCount: errors.length,
    warningCount: warnings.length,
    recommendations: issues.filter((i) => i.recommendation).map((i) => ({ checkId: i.id, severity: i.severity, path: i.path, recommendation: i.recommendation })),
    metrics: {
      headingCount: headings.length,
      imageCount: nodes.filter((n) => n.type === "image").length,
      linkCount: nodes.filter((n) => n.data?.href).length,
      buttonCount: nodes.filter((n) => n.type === "button").length,
      fieldCount: nodes.filter((n) => n.type === "field" || n.type === "input").length,
    },
    checkedAt: new Date().toISOString(),
  };
}

export function createAccessibilityEngine() {
  return {
    get engine() { return ENGINE_ID; },
    get version() { return A11Y_ENGINE_VERSION; },
    check: checkAccessibility,
    contrastRatio,
  };
}

export default createAccessibilityEngine;
