// acrx/assets/js/acroxajs-demo.js — AcroxaJS demo interactivity (§48).
// Proves targeted patching: counter/clock/data/nested/style updates go
// through window.AcroxaDomPatch.patchNode on exactly one boundary, so
// sibling boundaries (incl. the form input) keep DOM node identity.
// Exposes window.__acroxajsDemo for Playwright invariant assertions.

(function Demo() {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__acroxajsDemo && window.__acroxajsDemo.__v === 1) return;

  var state = { counter: 0, nested: 0, seed: 0, accent: false };

  function patchById(id, html) {
    var target = document.querySelector('[data-acrx-id="' + id + '"]');
    if (!target) return false;
    if (window.AcroxaDomPatch && typeof window.AcroxaDomPatch.patchNode === 'function') {
      window.AcroxaDomPatch.patchNode(target, html);
      return true;
    }
    return false;
  }

  function counterHtml() {
    return '<div data-acrx-id="boundary:core:demo.counter" data-acrx-hydrate="immediate" data-acrx-owner="core">' +
      '<div class="acrx-demo-label">Counter Boundary</div><div class="acrx-demo-body">' +
      '<span data-acrx-id="element:core:demo.counter.value">' + state.counter + '</span> ' +
      '<button data-acrx-id="element:core:demo.counter.btn" data-demo="counter-inc" type="button">Increment</button>' +
      '</div></div>';
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-demo]') : null;
      if (!t) return;
      var kind = t.getAttribute('data-demo');
      if (kind === 'counter-inc') {
        state.counter++;
        patchById('boundary:core:demo.counter', counterHtml());
      } else if (kind === 'data-refresh') {
        state.seed++;
        var d = document.querySelector('[data-demo="data"]');
        if (d) d.textContent = 'seed:' + state.seed;
      } else if (kind === 'nested-inc') {
        state.nested++;
        var n = document.querySelector('[data-demo="nested"]');
        if (n) n.textContent = 'inner:' + state.nested;
      } else if (kind === 'style-toggle') {
        state.accent = !state.accent;
        document.querySelector('.acrx-demo').classList.toggle('acrx-demo-accent', state.accent);
      }
    });
    setInterval(function () {
      var c = document.querySelector('[data-demo="clock"]');
      if (c) c.textContent = new Date().toLocaleTimeString();
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }

  window.__acroxajsDemo = { __v: 1, state: state };
})();
