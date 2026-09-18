import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMark, textNode, fromInlineHTML, MARKS, MARK_COMPAT,
  conflictingMarks, canApplyMark,
} from "../rich-text-engine.js";
import { normalizeUrl, classifyLink, validateLink } from "../link-engine.js";

// P0: explicit mark-compatibility rule — inline `code` is mutually exclusive
// with rich emphasis marks (last mark wins, enforced in applyMark so every
// entry point behaves identically); `link` coexists with everything.
describe("P0 mark compatibility matrix", () => {
  it("declares code as exclusive with rich marks, link as universal", () => {
    assert.deepEqual([...conflictingMarks("code")].sort(), ["bold", "italic", "strikethrough", "underline"]);
    for (const m of ["bold", "italic", "underline", "strikethrough"]) {
      assert.deepEqual(conflictingMarks(m), ["code"]);
    }
    assert.deepEqual(conflictingMarks("link"), []);
    assert.ok(MARK_COMPAT.code && MARKS.CODE === "code");
  });

  it("applying code strips rich marks but keeps link", () => {
    let c = [textNode("hello", [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "https://a.co" } }])];
    c = applyMark(c, 0, 5, { type: "code" });
    const types = c[0].marks.map((m) => m.type).sort();
    assert.deepEqual(types, ["code", "link"]);
  });

  it("applying a rich mark strips code (last wins)", () => {
    let c = [textNode("hello", [{ type: "code" }])];
    c = applyMark(c, 0, 5, { type: "bold" });
    assert.deepEqual(c[0].marks.map((m) => m.type), ["bold"]);
  });

  it("compatible marks nest freely", () => {
    let c = [textNode("hello")];
    c = applyMark(c, 0, 5, { type: "bold" });
    c = applyMark(c, 0, 5, { type: "italic" });
    c = applyMark(c, 0, 5, { type: "link", attrs: { href: "https://a.co" } });
    assert.deepEqual(c[0].marks.map((m) => m.type).sort(), ["bold", "italic", "link"]);
  });

  it("canApplyMark mirrors the rule for toolbar disabled state", () => {
    assert.equal(canApplyMark(["code"], "bold"), false);
    assert.equal(canApplyMark(["code"], "italic"), false);
    assert.equal(canApplyMark(["bold"], "code"), false);
    assert.equal(canApplyMark(["code"], "link"), true);
    assert.equal(canApplyMark(["bold"], "link"), true);
    assert.equal(canApplyMark(["bold", "italic"], "underline"), true);
    assert.equal(canApplyMark([], "code"), true);
    assert.equal(canApplyMark(["bold"], "nope"), false);
  });

  it("pasted HTML obeys the rule: innermost conflicting mark wins", () => {
    // <code><b> → bold applied last, so bold wins and code is stripped.
    assert.deepEqual(fromInlineHTML("<code><b>hey</b></code>")[0].marks.map((m) => m.type), ["bold"]);
    // <b><code> → code applied last, so code wins and bold is stripped.
    assert.deepEqual(fromInlineHTML("<b><code>hey</code></b>")[0].marks.map((m) => m.type), ["code"]);
  });
});

describe("P0 link URL validation", () => {
  it("normalizes bare domains, keeps anchors/relative/mailto", () => {
    assert.equal(normalizeUrl("example.com/page"), "https://example.com/page");
    assert.equal(normalizeUrl("#frag"), "#frag");
    assert.equal(normalizeUrl("/docs"), "/docs");
    assert.equal(normalizeUrl("mailto:a@b.co"), "mailto:a@b.co");
  });

  it("classifies unsafe protocols", () => {
    assert.equal(classifyLink("javascript:alert(1)").kind, "unsafe");
    assert.equal(classifyLink("  ").kind, "empty");
    assert.equal(classifyLink("https://a.co").kind, "external");
  });

  it("validateLink rejects empty/unsafe, accepts https", () => {
    assert.equal(validateLink({ href: "" }).valid, false);
    assert.equal(validateLink({ href: "javascript:alert(1)" }).valid, false);
    assert.equal(validateLink({ href: "https://a.co", text: "A" }).valid, true);
  });
});
