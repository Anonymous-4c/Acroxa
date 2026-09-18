import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeSEO, fixForCheck, isAutoFixable } from "../seo-engine.js";

// P0: SEO "Fix it" is a real mutation (engine-computed patch), never a fake
// success state. Non-fixable issues return null so the UI guides instead.
describe("P0 SEO auto-fix", () => {
  it("marks exactly the safe set as auto-fixable", () => {
    for (const id of ["title-long", "description-long", "missing-title", "missing-meta-description", "robots-noindex", "social-no-title", "social-no-description"]) {
      assert.equal(isAutoFixable(id), true, id);
    }
    for (const id of ["title-short", "missing-slug", "multiple-h1", "no-focus-keyword", "images-missing-alt", "no-headings", "keyword-stuffed"]) {
      assert.equal(isAutoFixable(id), false, id);
    }
  });

  it("trims long titles/descriptions without leaving fragments", () => {
    const long = "A very long title that definitely exceeds sixty characters total yes";
    const fix = fixForCheck("title-long", { metaTitle: long });
    assert.equal(fix.field, "metaTitle");
    assert.ok(fix.value.length <= 60);
    assert.ok(!/\s\S$/.test(fix.value) || fix.value === long.slice(0, 60).trim());
    assert.equal(fixForCheck("title-long", { metaTitle: "Short enough" }), null);
    const desc = fixForCheck("description-long", { metaDescription: "x".repeat(200) });
    assert.equal(desc.field, "metaDescription");
    assert.ok(desc.value.length <= 160);
  });

  it("drafts missing metadata from post title / document text", () => {
    assert.deepEqual(fixForCheck("missing-title", { postTitle: "Hello World", docText: "" }), { field: "metaTitle", value: "Hello World" });
    const fromDoc = fixForCheck("missing-meta-description", { docText: "First sentence here. Second follows." });
    assert.equal(fromDoc.field, "metaDescription");
    assert.ok(fromDoc.value.includes("First sentence"));
    assert.equal(fixForCheck("missing-title", { postTitle: "", docText: "" }), null);
    assert.equal(fixForCheck("missing-meta-description", { docText: "   " }), null);
  });

  it("unchecks noindex and falls social back to SEO fields", () => {
    assert.deepEqual(fixForCheck("robots-noindex", {}), { field: "noIndex", value: false });
    assert.deepEqual(fixForCheck("social-no-title", { metaTitle: "T", postTitle: "" }), { field: "ogTitle", value: "T" });
    assert.deepEqual(fixForCheck("social-no-description", { metaDescription: "D" }), { field: "ogDescription", value: "D" });
    assert.equal(fixForCheck("social-no-title", { metaTitle: "", postTitle: "" }), null);
  });

  it("applying the fix actually clears the finding on re-analysis", () => {
    const base = { title: "", metaTitle: "x".repeat(80), metaDescription: "y".repeat(200), focusKeyword: "", slug: "s", canonical: "https://a.co/s", language: "en", noIndex: true };
    const before = analyzeSEO({ metadata: base, text: "word ".repeat(700) + " heading stuff", document: null });
    assert.ok(before.checks.some((c) => c.id === "title-long"));
    const patched = { ...base };
    for (const rec of before.recommendations) {
      const fix = fixForCheck(rec.checkId, { metaTitle: patched.metaTitle, metaDescription: patched.metaDescription, postTitle: "Post", docText: "doc text here" });
      if (fix) patched[fix.field] = fix.value;
    }
    const after = analyzeSEO({ metadata: patched, text: "word ".repeat(700), document: null });
    assert.ok(!after.checks.some((c) => c.id === "title-long"), "title-long cleared");
    assert.ok(!after.checks.some((c) => c.id === "description-long"), "description-long cleared");
    assert.ok(after.score >= before.score, "score never regresses after fixes");
  });

  it("unknown checks return null (guide, don't fake)", () => {
    assert.equal(fixForCheck("nope-missing", {}), null);
  });
});
