// src/layouts/framework/hydration-snippet.js
//
// Visitor hydration snippet — the ONLY JS shipped to public pages besides
// analytics + per-page customJS. Delegated, dependency-free, inert without
// widgets. Extracted here so LayoutEngine + tests share one source of truth.
//
// Covers: .wdg-tabs click runtime (idempotent via data-acrx-tabs) and generic
// [data-acrx-id][data-acrx-hydrate="interaction"] one-shot hooks. Static hero /
// text / images are never touched (selective hydration, spec §17).

"use strict";

function widgetHydrationScript() {
  return `<script>(function () {
  function activate(box, id) {
    var btns = box.querySelectorAll(".wdg-tab-btn[data-tab]");
    var panels = box.querySelectorAll(".wdg-tab-panel[data-panel]");
    btns.forEach(function (b) {
      var on = b.getAttribute("data-tab") === id;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach(function (p) {
      if (p.getAttribute("data-panel") === id) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
  }
  function initTabs(scope) {
    (scope || document).querySelectorAll(".wdg-tabs:not([data-acrx-tabs])").forEach(function (box) {
      var first = box.querySelector(".wdg-tab-btn[data-tab]");
      if (!first) return;
      box.setAttribute("data-acrx-tabs", "1");
      box.setAttribute("role", "tablist");
      activate(box, first.getAttribute("data-tab"));
    });
  }
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".wdg-tab-btn[data-tab]") : null;
    if (!btn) return;
    var box = btn.closest(".wdg-tabs");
    if (!box) return;
    activate(box, btn.getAttribute("data-tab"));
  });
  // The script ships at end of body: init now, and again on
  // DOMContentLoaded for deferred parsing. initTabs() is idempotent.
  initTabs(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { initTabs(document); });
  }
})();</script>`;
}

module.exports = { widgetHydrationScript };
