import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../document-engine.js";
import { createMetadataEngine, normalizeMetadata, robotsContent, toHeadTags } from "../metadata-engine.js";
import { createSEOEngine } from "../seo-engine.js";
import { createSEOPreviewEngine } from "../seo-preview-engine.js";
import { createAccessibilityEngine, contrastRatio } from "../accessibility-engine.js";
import { createPerformanceEngine } from "../performance-engine.js";

function richDoc() {
  const doc = createDocument({ id: "d" });
  doc.insertNode(doc.rootId, { id: "h1", type: "heading", data: { level: 1, text: "Acroxa headless editor engines" } });
  const body = Array(40).fill("The Acroxa editor engine renders structured blocks with predictable state and JSON snapshots.").join(" ");
  doc.insertNode(doc.rootId, { id: "p1", type: "paragraph", data: { text: body } });
  doc.insertNode(doc.rootId, { id: "img1", type: "image", data: { src: "hero.png", alt: "Editor diagram", width: 1200, height: 630 } });
  doc.insertNode(doc.rootId, { id: "cta", type: "button", data: { text: "Get started", href: "/pricing" } });
  doc.insertNode(doc.rootId, { id: "ext", type: "button", data: { text: "Docs", href: "https://docs.acroxa.com/" } });
  return doc;
}

const goodMeta = {
  title: "Acroxa headless editor engines for modern CMS teams",
  metaTitle: "Acroxa headless editor engines for modern CMS teams",
  metaDescription: "Build a block editor on dependable headless engines: documents, blocks, SEO analysis and previews with clean JSON contracts.",
  focusKeyword: "editor engines",
  slug: "editor-engines",
  canonical: "https://acroxa.com/editor-engines",
  language: "en",
  ogTitle: "Acroxa editor engines",
  ogDescription: "Headless engines for the Acroxa block editor.",
  ogImage: "https://acroxa.com/og.png",
};

describe("metadata engine", () => {
  it("normalizes, validates, merges and derives head tags", () => {
    const m = createMetadataEngine();
    const n = normalizeMetadata({ title: "T", noIndex: true, keywords: "not-array" });
    assert.equal(n.robots.noindex, true);
    assert.deepEqual(n.keywords, []);
    assert.equal(m.validate({ canonical: "::::" }).valid, false);
    assert.equal(m.validate({ language: "english!!" }).warnings[0].code, "BAD_LANGUAGE");
    const merged = m.merge({ title: "Old", description: "Keep" }, { title: "New" });
    assert.equal(merged.title, "New");
    assert.equal(merged.description, "Keep");
    assert.equal(robotsContent({ robots: { noindex: true } }), "noindex, follow");
    const tags = toHeadTags(goodMeta);
    assert.ok(tags.some((t) => t.startsWith("<title>")));
    assert.ok(tags.some((t) => t.includes('property="og:image"')));
  });
});

describe("seo engine", () => {
  it("scores strong pages highly with explainable checks", () => {
    const seo = createSEOEngine();
    const report = seo.analyze({ document: richDoc(), metadata: goodMeta });
    assert.equal(report.maxScore, 100);
    assert.ok(report.score >= 70, `score was ${report.score}`);
    assert.deepEqual(Object.keys(report.categories).sort(), ["accessibility", "content", "onPage", "social", "technical"]);
    assert.ok(report.metrics.wordCount > 300);
    assert.equal(report.charts.overall.score, report.score);
    assert.equal(report.charts.categories.length, 5);
    assert.ok(report.checks.every((c) => c.id && c.category && c.severity && c.message));
    assert.ok(report.recommendations.every((r) => r.checkId && r.recommendation));
  });

  it("penalizes thin, undescribed pages with reasons", () => {
    const seo = createSEOEngine();
    const doc = createDocument();
    doc.insertNode(doc.rootId, { id: "p", type: "paragraph", data: { text: "Hi" } });
    const report = seo.analyze({ document: doc, metadata: { title: "", description: "" } });
    assert.ok(report.score < 60, `score was ${report.score}`);
    const ids = report.checks.map((c) => c.id);
    assert.ok(ids.includes("missing-title"));
    assert.ok(ids.includes("missing-meta-description"));
    assert.ok(ids.includes("content-length-thin"));
    assert.ok(ids.includes("no-focus-keyword"));
  });
});

describe("seo preview engine", () => {
  it("shapes search and social preview data", () => {
    const p = createSEOPreviewEngine();
    const search = p.search({ title: goodMeta.title, url: goodMeta.canonical, description: goodMeta.metaDescription, breadcrumbs: ["Docs", "Editor"] });
    assert.equal(search.kind, "search");
    assert.equal(search.displayUrl, "acroxa.com/editor-engines");
    assert.deepEqual(search.breadcrumbs, ["Docs", "Editor"]);
    const long = p.search({ title: "x".repeat(100) });
    assert.equal(long.titleTruncated, true);
    const tw = p.social("twitter", goodMeta);
    assert.equal(tw.platform, "twitter");
    assert.equal(tw.card, "summary_large_image");
    assert.equal(tw.image, goodMeta.ogImage);
    const all = p.all(goodMeta);
    assert.ok(all.search && all.social.facebook && all.social.twitter && all.social.linkedin);
  });
});

describe("accessibility engine", () => {
  it("checks semantics and computes real contrast", () => {
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#777777", "#ffffff") < 4.5, true);
    assert.equal(contrastRatio("red", "#fff"), null);
    const a11y = createAccessibilityEngine();
    const doc = createDocument();
    doc.insertNode(doc.rootId, { id: "h", type: "heading", data: { level: 3, text: "Late start" } });
    doc.insertNode(doc.rootId, { id: "im", type: "image", data: { src: "a.png" } });
    doc.insertNode(doc.rootId, { id: "b", type: "button", data: { href: "/x" } });
    doc.insertNode(doc.rootId, {
      id: "low", type: "paragraph",
      data: { text: "faint", style: { textColor: "#777777", backgroundColor: "#ffffff" } },
    });
    const report = a11y.check({ document: doc });
    const ids = report.issues.map((i) => i.id);
    assert.ok(ids.includes("image-no-alt"));
    assert.ok(ids.includes("button-no-label"));
    assert.ok(ids.includes("low-contrast"));
    assert.ok(ids.includes("no-language"));
    assert.equal(report.metrics.imageCount, 1);
    const clean = createDocument();
    clean.insertNode(clean.rootId, { id: "h1", type: "heading", data: { level: 1, text: "Title" } });
    assert.equal(a11y.check({ document: clean, language: "en" }).score, 100);
  });
});

describe("performance engine", () => {
  it("estimates without ever claiming measurement", () => {
    const perf = createPerformanceEngine();
    const doc = richDoc();
    for (let i = 0; i < 12; i++) {
      doc.insertNode(doc.rootId, { id: `im${i}`, type: "image", data: { src: `pic${i}.png` } });
    }
    const report = perf.analyze({ document: doc });
    assert.equal(report.estimated, true);
    assert.equal(report.measured, null);
    assert.ok(report.estimates.imageCount >= 13);
    assert.ok(report.estimates.imagesWithoutDimensions > 0);
    assert.ok(report.warnings.some((w) => w.id === "many-images"));
    assert.ok(report.note.includes("no network"));
    const light = perf.analyze({ document: richDoc() });
    assert.ok(light.score >= report.score);
  });
});
