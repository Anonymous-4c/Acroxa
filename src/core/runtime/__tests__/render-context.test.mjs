// src/core/runtime/__tests__/render-context.test.mjs
// AcroxaJS Phase 1 render-context tests (DB-free, node:test).
// Covers: context create/current scoping, dep recording + graph flush on
// success only, el() key → data-acrx-key identity, node recording (flat,
// scalar-safe, capped), zero-behavior-change without a context.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const require = createRequire(import.meta.url);

const rc = require(path.join(ROOT, "src/core/runtime/render/context.js"));
const graph = require(path.join(ROOT, "src/core/runtime/graph.js"));
const fw = require(path.join(ROOT, "src/views/lib/framework.js"));

describe("render context", () => {
  it("scopes current() to withRenderContext (sync + awaited renders)", async () => {
    assert.equal(rc.current(), null);
    const seen = [];
    await rc.withRenderContext({ route: "/acrx/x", pageId: "page:/acrx/x" }, async () => {
      seen.push(!!rc.current());
      await Promise.resolve();
      seen.push(!!rc.current());
    });
    assert.deepEqual(seen, [true, true]);
    assert.equal(rc.current(), null);
  });

  it("exposes route/pageId/env/cachePolicy on the context", () => {
    rc.withRenderContext(
      { route: "/acrx/y", pageId: "page:/acrx/y", env: "production", cachePolicy: { ttlMs: 1000 } },
      (ctx) => {
        assert.equal(ctx.route, "/acrx/y");
        assert.equal(ctx.pageId, "page:/acrx/y");
        assert.equal(ctx.env, "production");
        assert.deepEqual(ctx.cachePolicy, { ttlMs: 1000 });
        assert.equal(ctx.meta().nodes, 0);
      }
    );
  });

  it("declares accumulated deps into graph on successful render", () => {
    const page = `page:rc-test-${Date.now()}`;
    rc.withRenderContext({ pageId: page }, (ctx) => {
      ctx.depend("service:posts");
      ctx.depend("service:posts"); // dedup
      ctx.depend("db:users");
      assert.equal(ctx.deps.size, 2);
    });
    assert.deepEqual(graph.dependenciesOf(page).sort(), ["db:users", "service:posts"]);
  });

  it("does NOT flush deps when the render fails", () => {
    const page = `page:rc-fail-${Date.now()}`;
    try {
      rc.withRenderContext({ pageId: page }, () => {
        rc.depend("service:broken");
        throw new Error("render failed");
      });
    } catch (_) {}
    assert.deepEqual(graph.dependenciesOf(page), []);
    graph.remove(page); // cleanup
  });

  it("propagates render errors untouched and still exits the context", () => {
    assert.throws(
      () => rc.withRenderContext({}, () => { throw new Error("boom"); }),
      /boom/
    );
    assert.equal(rc.current(), null);
  });

  it("depend() outside a context is a safe no-op", () => {
    assert.equal(rc.depend("service:x"), false);
    assert.equal(fw.depend("service:x"), false);
  });
});

describe("el() key identity (Phase 1)", () => {
  it("emits data-acrx-key and never a raw key attribute", () => {
    const html = fw.el("div", { key: "dashboard-header", class: "hd" }, "hi");
    assert.ok(html.includes('data-acrx-key="dashboard-header"'), html);
    assert.ok(!html.includes(' key='), html);
    assert.ok(html.includes('class="hd"'));
  });

  it("keeps h() behavior: key becomes data-acrx-id (existing contract)", () => {
    const html = fw.h("section", { key: "dash-title", class: "t" }, "Dashboard");
    assert.ok(String(html).includes('data-acrx-id="dash-title"'));
    assert.ok(!String(html).includes("data-acrx-key"));
  });

  it("leaves el() output byte-identical when no key is passed", () => {
    const html = fw.el("p", { class: "a", dataClick: "go" }, "text");
    assert.equal(html, '<p class="a" data-click="go">text</p>');
  });
});

describe("node recording (context-active)", () => {
  it("records nodes with scalar attrs, key, and html", () => {
    let nodes = null;
    rc.withRenderContext({ route: "/acrx/z" }, (ctx) => {
      fw.el("div", { key: "root", class: "wrap" }, fw.el("span", { id: "s1" }, "inner"));
      nodes = ctx.nodes;
    });
    assert.equal(nodes.length, 2);
    const root = nodes.find((n) => n.key === "root");
    assert.equal(root.tag, "div");
    assert.equal(root.attrs.class, "wrap");
    assert.equal(root.attrs["data-acrx-key"], "root");
    assert.ok(root.html.startsWith('<div data-acrx-key="root" class="wrap">'));
    const span = nodes.find((n) => n.tag === "span");
    assert.equal(span.attrs.id, "s1");
    assert.equal(span.html, '<span id="s1">inner</span>');
    assert.deepEqual(span.children, []); // hierarchy filled by Phase 2 tree builder
  });

  it("records nothing without a context and stays cheap", () => {
    const html = fw.el("div", { class: "x" }, "plain");
    assert.equal(html, '<div class="x">plain</div>');
  });

  it("drops function values from recorded attrs (transport-safe)", () => {
    rc.withRenderContext({}, (ctx) => {
      fw.el("button", { onClick: "handled elsewhere", class: "btn" }, "Go");
      const node = ctx.nodes[0];
      assert.equal(node.attrs.class, "btn");
      assert.equal(node.attrs.onClick, undefined);
    });
  });

  it("records void elements too", () => {
    rc.withRenderContext({}, (ctx) => {
      fw.el("img", { src: "/x.png", alt: "x" });
      assert.equal(ctx.nodes.length, 1);
      assert.ok(ctx.nodes[0].html.endsWith("/>"));
    });
  });

  it("caps node recording (silently, never throws)", () => {
    rc.withRenderContext({}, (ctx) => {
      for (let i = 0; i < rc.NODE_CAP + 50; i++) fw.el("i", {}, "");
      assert.equal(ctx.nodes.length, rc.NODE_CAP);
      assert.equal(ctx.meta().dropped > 0, true);
    });
  });

  it("boundary() nodes land in the recorded tree with data-acrx-id", () => {
    rc.withRenderContext({}, (ctx) => {
      fw.boundary("widget", "core", "hero-test", {}, fw.el("h1", {}, "Hero"));
      const node = ctx.nodes.find((n) => n.attrs && n.attrs["data-acrx-id"] === "widget:core:hero-test");
      assert.ok(node, "boundary node recorded");
      assert.equal(node.tag, "div");
    });
  });
});
