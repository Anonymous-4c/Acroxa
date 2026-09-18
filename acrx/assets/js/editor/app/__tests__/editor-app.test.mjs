import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const shell = require("C:/Users/sohai/Desktop/Acroxa/src/views/editor.js");

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shell.renderEditor()}</body></html>`, {
  url: "http://localhost/acrx/editor/",
  pretendToBeVisual: true,
});

for (const key of ["window", "document", "navigator", "localStorage", "Element", "Node", "Document", "Window", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "ResizeObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (dom.window[key] !== undefined && globalThis[key] === undefined) {
    globalThis[key] = key === "requestAnimationFrame" || key === "cancelAnimationFrame"
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
  }
}
// jsdom lacks ResizeObserver; editor panels observe overflow containers.
if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!globalThis.CSS || !globalThis.CSS.escape) {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
}

let controller;
let ctx;

before(async () => {
  controller = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/core/controller.js");
  await controller.boot();
  ctx = controller.getCtx();
});

function canvas() {
  return document.getElementById("editor-canvas");
}

function wraps() {
  return [...canvas().querySelectorAll(":scope > .block-wrap")];
}

describe("editor boot", () => {
  it("renders shell hooks and an empty state", () => {
    assert.ok(canvas());
    assert.ok(document.getElementById("canvas-main-input"));
    assert.ok(document.getElementById("editor-slash-menu"));
    assert.ok(document.getElementById("layers-tree"));
    assert.ok(canvas().querySelector(".canvas-empty-state"));
    assert.equal(wraps().length, 0);
  });
});

describe("block lifecycle", () => {
  it("inserts, selects, edits, and renders with shell contract", async () => {
    const id = ctx.insertAtSelection("heading");
    assert.ok(id);
    const wrap = canvas().querySelector(`.block-wrap[data-for-block-id="${id}"]`);
    assert.ok(wrap);
    assert.ok(wrap.querySelector(".block-handle"));
    assert.ok(wrap.querySelector(".block-check.hidden"));
    const block = wrap.querySelector(".block");
    assert.equal(block.getAttribute("data-block-id"), id);
    assert.equal(block.getAttribute("data-depth"), "0");
    assert.equal(block.getAttribute("data-type"), "heading");
    assert.ok(block.querySelector("[contenteditable='true']"));

    // Type into the editable -> model syncs without full re-render.
    const editable = block.querySelector("[contenteditable='true']");
    editable.innerHTML = "Hello <strong>world</strong>";
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const saved = ctx.getBlock(id);
    assert.equal(saved.content.length, 2);
    assert.deepEqual(saved.content[1].marks, [{ type: "bold" }]);

    // Selection paints + inspector + layers follow.
    ctx.selectBlock(id, { focus: false });
    assert.ok(wrap.classList.contains("is-selected"));
    assert.ok(document.getElementById("sidebar-right-panel-settings").textContent.includes("Heading"));
    assert.ok(document.getElementById("layers-tree").textContent.includes("Heading"));
  });

  it("supports containers with real nesting", () => {
    const cols = ctx.insertAtSelection("columns");
    const doc = ctx.editor.document;
    const node = doc.getNode(cols);
    assert.equal(node.children.length, 2);
    const col = node.children[0];
    const para = ctx.editor.execute("insertBlock", { parentId: col, type: "paragraph", data: { content: [{ type: "text", text: "Nested", marks: [] }] } });
    assert.ok(para.ok);
    ctx.afterStructuralChange({});
    const colWrap = canvas().querySelector(`.block-wrap[data-for-block-id="${col}"]`);
    assert.ok(colWrap);
    assert.ok(colWrap.textContent.includes("Nested"));
    // Layers mirror the nesting depth-first.
    const layersText = document.getElementById("layers-tree").textContent;
    assert.ok(layersText.includes("Columns") && layersText.includes("Paragraph"));
  });

  it("undoes and redoes structural operations", () => {
    // Anchor to a top-level block so insertion is deterministic (unrelated to
    // the nested selection left by the previous test).
    ctx.clearSelection();
    const before = wraps().length;
    const id = ctx.insertAtSelection("divider");
    assert.equal(wraps().length, before + 1);
    ctx.undo();
    assert.equal(wraps().length, before);
    ctx.redo();
    assert.equal(wraps().length, before + 1);
    assert.ok(ctx.getBlock(id));
  });

  it("transforms, duplicates, moves and deletes", () => {
    ctx.selectBlock(ctx.topLevelOrder()[0], { focus: false }); // anchor top level
    const id = ctx.insertAtSelection("paragraph");
    ctx.transformBlock(id, "heading");
    assert.equal(ctx.getBlock(id).type, "heading");
    const dup = ctx.duplicateBlock(id);
    assert.ok(dup && dup !== id);
    const order = ctx.topLevelOrder();
    assert.ok(order.indexOf(dup) === order.indexOf(id) + 1);
    assert.equal(ctx.moveBlock(dup, -1), true);
    assert.equal(ctx.deleteBlock(dup), true);
    assert.equal(ctx.getBlock(dup), null);
  });
});

describe("panels", () => {
  it("widgets panel lists the real catalog and inserts", () => {
    const panel = document.getElementById("sidebar-left-panel-widgets");
    assert.ok(panel.textContent.includes("Paragraph"));
    assert.ok(panel.textContent.includes("Columns"));
    const card = panel.querySelector('[data-widget-type="button"]');
    assert.ok(card);
    ctx.clearSelection(); // top-level insertion point
    card.click();
    const found = ctx.topLevelOrder().map((bid) => ctx.getBlock(bid)).find((b) => b.type === "button");
    assert.ok(found);
  });

  it("inspector edits commit to the model", async () => {
    const id = ctx.insertAtSelection("button");
    ctx.selectBlock(id, { focus: false });
    const panel = document.getElementById("sidebar-right-panel-settings");
    const label = panel.querySelector('[data-field-key="text"]');
    assert.ok(label);
    label.value = "Buy now";
    label.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(ctx.getBlock(id).data.text, "Buy now");
  });

  it("inspector compound controls all function", async () => {
    const faq = ctx.insertAtSelection("faq");
    ctx.selectBlock(faq, { focus: false });
    const panel = document.getElementById("sidebar-right-panel-settings");
    panel.querySelector("[data-faq-add]").click();
    assert.equal(ctx.getBlock(faq).data.items.length, 2);
    const q = panel.querySelector('[data-faq-q="1"]');
    q.value = "Second?";
    q.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(ctx.getBlock(faq).data.items[1].q, "Second?");

    const table = ctx.insertAtSelection("table");
    ctx.selectBlock(table, { focus: false });
    const panel2 = document.getElementById("sidebar-right-panel-settings");
    panel2.querySelector("[data-table-add-row]").click();
    assert.equal(ctx.getBlock(table).data.rows.length, 3);
    panel2.querySelector("[data-table-add-col]").click();
    assert.equal(ctx.getBlock(table).data.rows[0].length, 3);
  });

  it("seo panel analyzes the live document", async () => {
    ctx.showPanel("right", "seo");
    const panel = document.getElementById("sidebar-right-panel-seo");
    const title = panel.querySelector('[data-seo-field="metaTitle"]');
    title.value = "A proper editor title for testing purposes here";
    title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    const score = panel.querySelector("[data-seo-score]");
    assert.ok(score && /\d+/.test(score.textContent));
    assert.ok(panel.querySelector("[data-seo-previews]"));
  });
});

describe("persistence payload", () => {
  it("builds the server save shape without fakes", async () => {
    const persistence = await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/services/persistence.js");
    const payload = persistence.buildSavePayload();
    assert.ok(payload.content && payload.content.json);
    assert.equal(typeof payload.content.html, "string");
    assert.equal(typeof payload.content.raw, "string");
    assert.ok(payload.content.json.blocks);
    assert.ok(Array.isArray(payload.content.json.blockOrder));
    assert.ok("title" in payload && "status" in payload && "meta" in payload && "seo" in payload);
  });
});

describe("toolbar focus retention", () => {
  it("toolbar mousedown does not steal editable focus (real-browser selection bug)", () => {
    const btn = document.querySelector("#toolbar-bold");
    assert.ok(btn);
    const event = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    btn.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  });
});

describe("multi-select paint", () => {
  it("syncs classes, checkboxes and anchor without throwing", () => {
    ctx.clearSelection();
    const a = ctx.insertAtSelection("paragraph");
    const b = ctx.insertAtSelection("paragraph");
    ctx.editor.engines.selection.selectBlocks([a, b]);
    ctx.afterSelectionChange(null);
    const multi = [...document.querySelectorAll("#editor-canvas .block-wrap.is-multiselected")]
      .map((w) => w.getAttribute("data-for-block-id")).sort();
    assert.deepEqual(multi, [a, b].sort());
    const states = {};
    document.querySelectorAll("#editor-canvas .block-wrap").forEach((w) => {
      states[w.getAttribute("data-for-block-id")] = w.querySelector(".block-check").checked;
    });
    assert.equal(states[a], true);
    assert.equal(states[b], true);
    assert.equal(document.querySelector("#editor-canvas .block-wrap.is-anchored"), null);
    ctx.clearSelection();
  });
});

describe("canvas input ownership", () => {
  it("hides the phantom main input while the canvas is empty", () => {
    for (const id of [...ctx.topLevelOrder()]) ctx.deleteBlock(id);
    ctx.sync();
    ctx.render();
    assert.equal(document.querySelectorAll("#editor-canvas .block-wrap").length, 0);
    assert.ok(document.querySelector("#editor-canvas .canvas-empty-state"));
    assert.equal(document.getElementById("canvas-main-input").style.display, "none");
    const id = ctx.insertAtSelection("paragraph");
    assert.ok(id);
    assert.equal(document.getElementById("canvas-main-input").style.display, "");
    assert.equal(document.querySelector("#editor-canvas .canvas-empty-state").style.display, "none");
  });

  it("block handles are draggable so canvas reorder can start", () => {
    const id = ctx.insertAtSelection("paragraph");
    const handle = document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"] .block-handle`);
    assert.ok(handle);
    assert.equal(handle.getAttribute("draggable"), "true");
  });
});

describe("list placeholder truth", () => {
  it("syncs is-empty while typing without a full render", async () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["hello", ""] }, { record: false });
    ctx.sync();
    ctx.render();
    const items = [...document.querySelectorAll(`#editor-canvas .block-wrap[data-for-block-id="${id}"] li.block-child`)];
    assert.equal(items.length, 2);
    assert.equal(items[0].classList.contains("is-empty"), false);
    assert.equal(items[1].classList.contains("is-empty"), true);
    // Type into the empty item -> placeholder hides without Enter/render.
    items[1].textContent = "world";
    items[1].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(items[1].classList.contains("is-empty"), false);
    // Clear it again -> placeholder returns without Enter/render.
    items[1].textContent = "";
    items[1].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(items[1].classList.contains("is-empty"), true);
    await new Promise((r) => setTimeout(r, 50));
  });

  it("treats whitespace-only items as empty at render", () => {
    const id = ctx.insertAtSelection("bulletList");
    ctx.setBlockData(id, { items: ["   "] }, { record: false });
    ctx.sync();
    ctx.render();
    const li = document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"] li.block-child`);
    assert.ok(li.classList.contains("is-empty"));
  });
});

describe("markdown input shortcuts", () => {
  async function typeTrigger(trigger) {
    const id = ctx.insertAtSelection("paragraph");
    const editable = document.querySelector(`#editor-canvas .block-wrap[data-for-block-id="${id}"] [contenteditable='true']`);
    editable.textContent = trigger;
    editable.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    return id;
  }

  it("'# ' becomes a level-1 heading with empty content", async () => {
    const id = await typeTrigger("# ");
    const block = ctx.getBlock(id);
    assert.equal(block.type, "heading");
    assert.equal(block.data.level, 1);
    assert.deepEqual(block.content, []);
  });

  it("'- ' becomes a bullet list with one empty item", async () => {
    const id = await typeTrigger("- ");
    const block = ctx.getBlock(id);
    assert.equal(block.type, "bulletList");
    // Items live in the inline model (P0-02): one empty item == [].
    assert.deepEqual(block.data.items, [[]]);
  });

  it("'> ' becomes a blockquote and '```' a code block", async () => {
    const q = await typeTrigger("> ");
    assert.equal(ctx.getBlock(q).type, "blockquote");
    const c = await typeTrigger("```");
    assert.equal(ctx.getBlock(c).type, "codeblock");
  });

  it("matches triggers typed as NBSP (real browser space behavior)", async () => {
    const id = await typeTrigger("# ");
    const block = ctx.getBlock(id);
    assert.equal(block.type, "heading");
    assert.equal(block.data.level, 1);
  });
});

describe("first-visit onboarding", () => {
  const KEY = "acroxa:editor:onboarding:v1";

  async function onboarding() {
    return await import("file:///C:/Users/sohai/Desktop/Acroxa/acrx/assets/js/editor/app/services/onboarding.js");
  }

  function overlay() {
    return document.querySelector(".acrx-onboarding-overlay");
  }

  function next() {
    overlay().querySelector("[data-ob-next]").click();
  }

  it("stays hidden when a real document is open", async () => {
    // Boot runs against an id-less URL, so it opens onboarding itself.
    document.querySelector(".acrx-onboarding-overlay")?.remove();
    localStorage.removeItem(KEY);
    const ob = await onboarding();
    assert.equal(await ob.maybeShowOnboarding({ fresh: false }), false);
    assert.equal(overlay(), null);
  });

  it("walks Type -> Details -> AI -> Review and dismisses", async () => {
    localStorage.removeItem(KEY);
    const ob = await onboarding();
    assert.equal(await ob.maybeShowOnboarding({ fresh: true }), true);
    assert.ok(overlay());
    assert.match(overlay().querySelector(".acrx-modal-head").textContent, /create something/);
    assert.ok(overlay().querySelector('[data-ob-pick="page"]'));
    assert.ok(overlay().querySelector('[data-ob-pick="post"]'));
    assert.ok(overlay().querySelector(".acrx-ob-steps"));

    // Step 1: pick post, continue.
    overlay().querySelector('[data-ob-pick="post"]').click();
    next();
    // Step 2: title auto-slugs; slug edit sticks.
    const title = overlay().querySelector("#acrx-ob-title");
    const slug = overlay().querySelector("#acrx-ob-slug");
    title.value = "Hello World";
    title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(slug.value, "hello-world");
    slug.value = "custom";
    slug.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    title.value = "Changed";
    title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(slug.value, "custom");
    next();
    // Step 3: AI step offers generate + skip.
    assert.ok(overlay().querySelector("#acrx-ob-brief"));
    assert.ok(overlay().querySelector("[data-ob-generate]"));
    overlay().querySelector("[data-ob-skip-next]").click();
    // Step 4: review summarizes; dismiss closes + completes.
    assert.match(overlay().textContent, /Review|Blank canvas/);
    assert.match(overlay().textContent, /Changed/);
    overlay().querySelector(".acrx-modal-head [data-ob-dismiss]").click();
    assert.equal(overlay(), null);
    assert.equal(JSON.parse(localStorage.getItem(KEY)).completed, true);
  });

  it("shows the compact panel on later no-context visits", async () => {
    const ob = await onboarding();
    assert.equal(await ob.maybeShowOnboarding({ fresh: true }), true);
    assert.match(overlay().querySelector(".acrx-modal-head").textContent, /New document/);
    overlay().querySelector(".acrx-modal-head [data-ob-dismiss]").click();
  });

  it("creates a real blank CMS record and navigates into it", async () => {
    localStorage.removeItem(KEY);
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
      seen.push([String(url), opts]);
      return { ok: true, json: async () => ({ success: true, post: { _id: "abc123" } }) };
    };
    try {
      const ob = await onboarding();
      await ob.maybeShowOnboarding({ fresh: true });
      overlay().querySelector('[data-ob-pick="post"]').click();
      next();
      overlay().querySelector("#acrx-ob-title").value = "Hello";
      overlay().querySelector("#acrx-ob-title").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      next();
      overlay().querySelector("[data-ob-skip-next]").click();
      overlay().querySelector("[data-ob-create]").click();
      await new Promise((r) => setTimeout(r, 150));
      const create = seen.find(([url]) => url.endsWith("/acr/api/posts"));
      assert.ok(create, "POSTed to the real posts endpoint");
      const body = JSON.parse(create[1].body);
      assert.equal(body.title, "Hello");
      assert.equal(body.slug, "hello");
      assert.equal(body.status, "draft");
      assert.deepEqual(body.content.json, null);
    } finally {
      globalThis.fetch = realFetch;
      overlay()?.remove();
    }
  });

  it("seeds the new document with the AI draft when used", async () => {
    localStorage.removeItem(KEY);
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
      url = String(url);
      seen.push([url, opts]);
      if (url.includes("/ai/content/generate")) {
        return { ok: true, json: async () => ({ success: true, text: "First para.\n\nSecond para." }) };
      }
      if (url.includes("/acr/api/pages")) {
        return { ok: true, json: async () => ({ success: true, page: { _id: "pg1" } }) };
      }
      return { ok: true, json: async () => ({ success: true, posts: [], pages: [] }) };
    };
    try {
      const ob = await onboarding();
      await ob.maybeShowOnboarding({ fresh: true });
      next(); // page, step 2
      overlay().querySelector("#acrx-ob-title").value = "Launch";
      overlay().querySelector("#acrx-ob-title").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      next(); // step 3 AI
      overlay().querySelector("#acrx-ob-brief").value = "bakery intro";
      overlay().querySelector("#acrx-ob-brief").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      overlay().querySelector("[data-ob-generate]").click();
      await new Promise((r) => setTimeout(r, 150));
      assert.match(overlay().textContent, /First para/);
      overlay().querySelector("[data-ob-skip-next]").click(); // "Keep draft & continue"
      assert.match(overlay().textContent, /AI draft/);
      overlay().querySelector("[data-ob-create]").click();
      await new Promise((r) => setTimeout(r, 150));
      const create = seen.find(([url, opts]) => url.endsWith("/acr/api/pages") && opts.method === "POST");
      assert.ok(create, "POSTed to the real pages endpoint");
      const body = JSON.parse(create[1].body);
      assert.equal(body.slug, "launch");
      const bp = body.content.json;
      assert.ok(bp && bp.rootId === "block_root");
      assert.deepEqual(bp.blockOrder.map((id) => bp.blocks[id].content[0].text), ["First para.", "Second para."]);
    } finally {
      globalThis.fetch = realFetch;
      overlay()?.remove();
    }
  });
});
