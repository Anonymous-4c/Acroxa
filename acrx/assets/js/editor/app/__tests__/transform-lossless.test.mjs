import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// P0-07: transforms must be lossless-or-refused. For every ordered pair of
// catalog types (seeded with distinctive words on every text surface), the
// carry either lands every source line in the target's text slot(s) or
// refuses ({ ok:false }) — never silently drops a word. Slot-bearing targets
// must always carry; refusal is only legal for slot-less targets (or stranded
// children), and the UI wrapper must then toast + no-op.

const require = createRequire(import.meta.url);
const shell = require("C:/Users/sohai/Desktop/Acroxa/src/views/editor.js");

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shell.renderEditor()}</body></html>`, {
  url: "http://localhost/acrx/editor/",
  pretendToBeVisual: true,
});

for (const key of ["window", "document", "navigator", "localStorage", "Element", "Node", "Document", "Window", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (dom.window[key] !== undefined && globalThis[key] === undefined) {
    globalThis[key] = key === "requestAnimationFrame" || key === "cancelAnimationFrame"
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
  }
}
if (!globalThis.CSS || !globalThis.CSS.escape) {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
}

const T = ["VQ_ALPHA", "VQ_BETA", "VQ_GAMMA", "VQ_DELTA", "VQ_EPSILON", "VQ_ZETA"];
const CONTENT_TYPES = new Set(["paragraph", "heading", "blockquote", "codeblock", "alert", "link", "testimonial"]);
// Targets that own at least one text slot: carrying into them must succeed.
const SLOT_TARGETS = new Set([...CONTENT_TYPES, "bulletList", "orderedList", "table", "button", "hero", "cta", "card", "image"]);

let blockTextLines;
let carryTransformContent;
let createBlockData;
let BLOCK_CATALOG;
let controller;
let ctx;

before(async () => {
  const ctrl = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  const model = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/model.js");
  blockTextLines = ctrl.blockTextLines;
  carryTransformContent = ctrl.carryTransformContent;
  createBlockData = model.createBlockData;
  BLOCK_CATALOG = model.BLOCK_CATALOG;
  controller = ctrl;
  await ctrl.boot();
  ctx = ctrl.getCtx();
});

function seedBlock(type) {
  const base = createBlockData(type);
  const block = {
    id: `seed_${type}`, type, content: JSON.parse(JSON.stringify(base.content || [])),
    attrs: {}, styles: {}, responsive: { mobile: {}, tablet: {}, desktop: {} },
    children: [], parent: "root", locked: false, hidden: false,
    customClasses: "", customId: "", customCSS: "", tag: "",
    ariaLabel: "", dataAttrs: {}, customAttributes: {},
    data: JSON.parse(JSON.stringify(base.settings || {})),
  };
  const d = block.data;
  if (CONTENT_TYPES.has(type)) {
    block.content = [{ type: "text", text: `${T[0]} ${T[1]}`, marks: [{ type: "bold" }] }];
  }
  if (type === "bulletList" || type === "orderedList") d.items = [T[0], T[1]];
  else if (Array.isArray(d.items)) {
    d.items = d.items.map((i) => (typeof i === "string" ? T[0] : { ...i, q: `${T[0]}?`, a: `${T[1]}.` }));
  }
  if (Array.isArray(d.rows)) d.rows = [[T[0], T[1]], [T[2], T[3]]];
  const slots = [
    ["text", `${T[0]} ${T[1]}`], ["title", T[0]], ["description", T[1]],
    ["caption", T[2]], ["cite", T[3]], ["author", T[4]], ["role", T[5]],
    ["badge", T[0]], ["eyebrow", T[1]], ["subtitle", T[2]],
    ["buttonText", T[3]], ["secondaryText", T[4]], ["alt", T[5]],
  ];
  for (const [k, v] of slots) if (typeof d[k] === "string") d[k] = v;
  if (Array.isArray(d.plans)) {
    d.plans = [{ id: "p", name: T[0], price: T[1], period: T[2], description: T[3], features: [T[4]], ctaText: T[5], ctaUrl: "", highlight: false }];
  }
  if (Array.isArray(d.tabs)) d.tabs = [{ id: "t", label: T[0], content: T[1] }];
  if (Array.isArray(d.stats)) d.stats = [{ id: "s", value: T[0], label: T[1] }];
  if (Array.isArray(d.events)) d.events = [{ id: "e", date: T[0], title: T[1], text: T[2] }];
  if (Array.isArray(d.features)) d.features = [{ id: "f", icon: "star", title: T[0], text: T[1] }];
  return block;
}

function resultWords(base) {
  const parts = [];
  for (const n of base.content || []) if (n?.type === "text" && n.text) parts.push(n.text);
  const s = base.settings || {};
  const grab = (v) => { if (typeof v === "string" && v) parts.push(v); };
  if (Array.isArray(s.items)) {
    for (const i of s.items) {
      if (typeof i === "string") grab(i);
      else if (Array.isArray(i)) {
        grab(i.filter((n) => n?.type === "text").map((n) => n.text || "").join(""));
      }
      else if (i && typeof i === "object") { grab(i.q); grab(i.a); }
    }
  }
  if (Array.isArray(s.rows)) {
    for (const r of s.rows) {
      for (const c of (Array.isArray(r) ? r : [r])) {
        grab(typeof c === "string" ? c : (Array.isArray(c) ? c.filter((n) => n?.type === "text").map((n) => n.text || "").join("") : ""));
      }
    }
  }
  for (const k of ["text", "title", "description", "caption", "cite", "author", "role", "badge", "eyebrow", "subtitle", "buttonText", "secondaryText", "alt"]) grab(s[k]);
  return parts.join("\n");
}

describe("P0-07 pairwise lossless transforms (fuzz)", () => {
  it("every ordered catalog pair carries or refuses — never silently drops", () => {
    const types = BLOCK_CATALOG.map((d) => d.type);
    assert.ok(types.length > 10, "expected a populated catalog");
    let carried = 0;
    let refused = 0;
    const failures = [];
    for (const s of types) {
      if (s === "column") continue; // internal structural child, never a transform source
      const seed = seedBlock(s);
      const lines = blockTextLines(seed);
      for (const t of types) {
        if (t === s || t === "column" || t === "unresolved") continue;
        let base;
        try {
          base = createBlockData(t);
        } catch { continue; }
        let res;
        try {
          res = carryTransformContent(seed, t, base);
        } catch (err) {
          failures.push(`${s}->${t} THREW: ${err.message}`);
          continue;
        }
        if (res.ok) {
          carried++;
          const got = resultWords(base);
          for (const line of lines) {
            if (!got.includes(line)) failures.push(`${s}->${t} LOST: "${line}"`);
          }
        } else {
          refused++;
          if (SLOT_TARGETS.has(t) && lines.length > 0) {
            failures.push(`${s}->${t} REFUSED a slot-bearing target with ${lines.length} line(s)`);
          }
        }
      }
    }
    assert.ok(carried > 0, "expected successful carries");
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} pair failure(s), first: ${failures.slice(0, 3).join(" | ")}`);
  });

  it("content-to-content carry preserves marks", () => {
    const seed = seedBlock("paragraph");
    seed.data = {}; // realistic paragraph: words live in content only
    const base = createBlockData("heading");
    const res = carryTransformContent(seed, "heading", base);
    assert.equal(res.ok, true);
    assert.deepEqual(base.content[0].marks, [{ type: "bold" }]);
  });

  it("pristine defaults never phantom-carry", () => {
    // Fresh button ("Button" label untouched) -> paragraph: nothing user
    // written, so the target must NOT inherit the word "Button".
    const base = createBlockData("button");
    const fresh = {
      id: "fresh", type: "button", content: [], attrs: {}, styles: {},
      responsive: { mobile: {}, tablet: {}, desktop: {} }, children: [],
      parent: "root", data: JSON.parse(JSON.stringify(base.settings)),
    };
    assert.deepEqual(blockTextLines(fresh), []);
    const target = createBlockData("paragraph");
    assert.equal(carryTransformContent(fresh, "paragraph", target).ok, true);
    assert.deepEqual(target.content, []);
  });

  it("stranded children refuse at carry level", () => {
    const plain = seedBlock("paragraph");
    plain.children = ["kid_a", "kid_b"];
    // Leaf -> leaf with nested blocks stranded: refuse.
    const res = carryTransformContent(plain, "heading", createBlockData("heading"));
    assert.equal(res.ok, false);
    assert.equal(res.kids, 2);
    // Container source -> container target with kids: allowed.
    const cols = seedBlock("columns");
    cols.children = ["kid_a", "kid_b"];
    const res2 = carryTransformContent(cols, "section", createBlockData("section"));
    assert.equal(res2.ok, true);
  });
});

describe("P0-07 transformBlock wiring", () => {
  it("list -> paragraph preserves text and undoes in one step", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["Alpha one", "Beta two"] }, { record: false });
    ctx.sync();
    assert.equal(ctx.transformBlock(id, "paragraph"), true);
    const after = ctx.getBlock(id);
    assert.equal(after.type, "paragraph");
    const text = (after.content || []).map((n) => n.text || "").join("\n");
    assert.ok(text.includes("Alpha one") && text.includes("Beta two"));
    ctx.undo();
    const back = ctx.getBlock(id);
    assert.equal(back.type, "bulletList");
    // Items live in the inline model (P0-02): compare plain texts.
    assert.deepEqual(
      (back.data.items || []).map((item) =>
        (Array.isArray(item) ? item : []).filter((n) => n?.type === "text").map((n) => n.text || "").join("")),
      ["Alpha one", "Beta two"]
    );
  });

  it("paragraph with text -> divider refuses loudly and keeps text", () => {
    const id = ctx.insertAtSelection("paragraph");
    ctx.setBlockData(id, { content: [{ type: "text", text: "Keep me", marks: [] }] }, { record: false });
    ctx.sync();
    assert.equal(ctx.transformBlock(id, "divider"), false);
    const still = ctx.getBlock(id);
    assert.equal(still.type, "paragraph");
    assert.equal((still.content || []).map((n) => n.text || "").join(""), "Keep me");
  });
});
