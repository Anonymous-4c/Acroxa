// src/views/acroxajsDemo.js — AcroxaJS proof route (§48).
// Independently updating regions under one persistent page:
// header note + counter / clock / data / nested / form / style boundaries.
// Each region carries a deterministic boundary id so the reconciler can
// patch exactly one scope and tests can assert the rest kept node identity.

const { div, span, p, h1, button, el } = require("./lib/framework");
const boundary = require("../AcroxaJS/server/boundary");

function region(owner, name, label, inner, extra) {
  return boundary.renderBoundary(
    owner,
    name,
    `<div class="acrx-demo-label">${label}</div><div class="acrx-demo-body">${inner}</div>`,
    extra || { hydrate: "immediate" }
  );
}

function renderAcroxaJSDemo() {
  const counter = region(
    "core",
    "demo.counter",
    "Counter Boundary",
    `<span data-acrx-id="element:core:demo.counter.value">999</span> ` +
      `<button data-acrx-id="element:core:demo.counter.btn" data-demo="counter-inc" type="button">Increment</button>`
  );
  const clock = region(
    "core",
    "demo.clock",
    "Clock Boundary",
    `<span data-acrx-id="element:core:demo.clock.value" data-demo="clock">--:--:--</span>`
  );
  const data = region(
    "core",
    "demo.data",
    "Data Boundary",
    `<span data-acrx-id="element:core:demo.data.value" data-demo="data">seed:0</span> ` +
      `<button data-acrx-id="element:core:demo.data.btn" data-demo="data-refresh" type="button">Refresh</button>`
  );
  const nested = boundary.renderBoundary(
    "core",
    "demo.nested",
    `<div class="acrx-demo-label">Nested Boundary</div>` +
      boundary.renderBoundary("core", "demo.nested.inner", `<span data-demo="nested">inner:0</span> ` +
        `<button data-demo="nested-inc" type="button">Bump inner</button>`),
    { hydrate: "immediate" }
  );
  const form = region(
    "core",
    "demo.form",
    "Form Boundary (must survive unrelated patches)",
    `<input data-acrx-id="element:core:demo.form.input" data-demo="form-input" type="text" value="" placeholder="type here, then bump counter" />`
  );
  const style = region(
    "core",
    "demo.style",
    "Style Boundary",
    `<button data-demo="style-toggle" type="button">Toggle accent</button>`
  );

  return div(
    { class: "acrx-demo", "data-acrx-id": "view:core:acrx-demo", "data-demo": "root" },
    h1({}, "AcroxaJS live demo JJJJJJJJJJJJJJJJJJj"),
    p({}, "Each box is an independent boundary. Patching one must not recreate the others."),
    counter + clock + data + nested + form + style,
    el("script", { src: "/acrx/assets/js/acroxajs-demo.js", defer: true })
  );
}

module.exports = { renderAcroxaJSDemo };

module.exports.meta = [
  {
    path: "/acrx/__acroxajs-demo",
    render: "renderAcroxaJSDemo",
    title: "AcroxaJS Demo - Acroxa",
    css: [],
    js: [],
    layout: "full",
    header: null,
    sidebar: null,
    footer: null,
  },
];
