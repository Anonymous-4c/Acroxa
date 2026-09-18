import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMark, removeMark, normalizeContent, textNode,
  toHTML, toMarkdown, fromInlineHTML,
} from "../rich-text-engine.js";

// P0-01: canvas vocabulary ("strike") and engine vocabulary ("strikethrough")
// must agree. Canonical mark is "strikethrough"; the legacy "strike" spelling
// (and "inlineCode" for "code") heals on read instead of throwing.
describe("P0-01 strike/strikethrough vocabulary", () => {
  it("applyMark accepts both spellings and stores canonical strikethrough", () => {
    const canon = applyMark([textNode("hello world")], 0, 5, { type: "strikethrough" });
    assert.deepEqual(canon[0].marks, [{ type: "strikethrough" }]);
    // Legacy spelling no longer throws (old code: RichTextError UNKNOWN_MARK).
    const legacy = applyMark([textNode("hello world")], 0, 5, { type: "strike" });
    assert.deepEqual(legacy[0].marks, [{ type: "strikethrough" }]);
  });

  it("removeMark accepts both spellings", () => {
    const marked = applyMark([textNode("hello world")], 0, 5, { type: "strikethrough" });
    assert.deepEqual(removeMark(marked, 0, 5, "strikethrough")[0].marks, []);
    assert.deepEqual(removeMark(marked, 0, 5, "strike")[0].marks, []);
  });

  it("normalizeContent heals legacy marks on load", () => {
    const healed = normalizeContent([
      { type: "text", text: "a", marks: [{ type: "strike" }] },
      { type: "text", text: "b", marks: [{ type: "inlineCode" }] },
    ]);
    assert.deepEqual(healed[0].marks, [{ type: "strikethrough" }]);
    assert.deepEqual(healed[1].marks, [{ type: "code" }]);
  });

  it("canvas <-> engine round-trip agrees on strike", () => {
    for (const html of ["<s>hi</s>", "<strike>hi</strike>", "<del>hi</del>"]) {
      const content = fromInlineHTML(html);
      assert.deepEqual(content[0].marks, [{ type: "strikethrough" }]);
    }
    const out = toHTML([{ type: "text", text: "hi", marks: [{ type: "strikethrough" }] }]);
    assert.equal(out, "<s>hi</s>");
    assert.equal(toMarkdown([{ type: "text", text: "hi", marks: [{ type: "strikethrough" }] }]), "~~hi~~");
  });
});
