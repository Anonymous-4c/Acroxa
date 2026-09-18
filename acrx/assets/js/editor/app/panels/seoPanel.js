// acrx/assets/js/editor/app/panels/seoPanel.js
//
// SEO panel on #sidebar-right-panel-seo: Problem → Explanation → Action.
// Fields edit the State "seo" store; analysis runs live in the client SEO
// engine over the real document + metadata; search/social previews render
// from the SEO preview engine. Compact score presentation, no giant meters.

import { State } from "../core/store.js";
import { toggleHTML } from "./controls.js";
import { blockText } from "../core/model.js";
import { fixForCheck, isAutoFixable } from "../../engines/seo-engine.js";

let ctx = null;
let panel = null;
let analyzeTimer = 0;

export function initSeoPanel(shared) {
  ctx = shared;
  panel = document.getElementById("sidebar-right-panel-seo");
  if (!panel) return;
  panel.addEventListener("input", onEdit);
  panel.addEventListener("change", onEdit);
  panel.addEventListener("click", onClick);
}

function seo() {
  return State.get("seo") || {};
}

function set(patch, analyze = true) {
  State.patch("seo", patch);
  ctx.markDirty();
  if (analyze) queueAnalysis();
}

function onEdit(event) {
  const field = event.target.closest("[data-seo-field]");
  if (!field) return;
  const key = field.getAttribute("data-seo-field");
  if (field.type === "checkbox") {
    set({ [key]: field.checked });
    refresh();
    return;
  }
  if (key === "keywords") {
    set({ keywords: field.value.split(",").map((k) => k.trim()).filter(Boolean) }, false);
  } else {
    set({ [key]: field.value }, false);
  }
  updateCounters();
  queueAnalysis();
}

function onClick(event) {
  const fix = event.target.closest("[data-seo-fix]");
  if (fix) {
    applyAutoFix(fix.getAttribute("data-seo-fix"));
    return;
  }
  const jump = event.target.closest("[data-seo-goto]");
  if (jump) {
    panel.querySelectorAll("[data-seo-tab]").forEach((t) => t.classList.toggle("is-active", t.getAttribute("data-seo-tab") === "fields"));
    panel.querySelectorAll("[data-seo-view]").forEach((v) => v.classList.toggle("hidden", v.getAttribute("data-seo-view") !== "fields"));
    const target = panel.querySelector(`[data-seo-field='${jump.getAttribute("data-seo-goto")}']`);
    target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
    target?.classList.add("insp-flash");
    setTimeout(() => target?.classList.remove("insp-flash"), 1600);
    return;
  }
  const ai = event.target.closest("[data-seo-ai]");
  if (ai) {
    ctx.aiSeoFill(ai.getAttribute("data-seo-ai"));
    return;
  }
  if (event.target.closest("[data-seo-pick-image]")) {
    ctx.pickMediaForSeo();
    return;
  }
  const tab = event.target.closest("[data-seo-tab]");
  if (tab) {
    panel.querySelectorAll("[data-seo-tab]").forEach((t) => t.classList.toggle("is-active", t === tab));
    panel.querySelectorAll("[data-seo-view]").forEach((v) => {
      v.classList.toggle("hidden", v.getAttribute("data-seo-view") !== tab.getAttribute("data-seo-tab"));
    });
  }
}

function docTextForFix() {
  try {
    const order = typeof ctx.topLevelOrder === "function" ? ctx.topLevelOrder() : [];
    return order.map((id) => blockText(ctx.getBlock(id))).filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

// Real Fix-It: compute the deterministic patch from the SEO engine, write it
// to the seo store (markDirty → persistable), refresh the fields, then
// re-run analysis immediately so the score/report update without waiting
// for the typing debounce. Non-auto-fixable checks keep the goto-field
// guidance button instead — never a fake "Fixed" state.
function applyAutoFix(checkId) {
  const s = seo();
  const post = State.get("post") || {};
  const patch = fixForCheck(checkId, {
    metaTitle: s.metaTitle || "",
    metaDescription: s.metaDescription || "",
    postTitle: post.title || "",
    docText: docTextForFix(),
  });
  if (!patch) {
    // Guide, don't strand: focus + highlight the exact field and switch to
    // the Fields tab so the user sees where to type.
    const field = relatedField(checkId);
    panel.querySelectorAll("[data-seo-tab]").forEach((t) => t.classList.toggle("is-active", t.getAttribute("data-seo-tab") === "fields"));
    panel.querySelectorAll("[data-seo-view]").forEach((v) => v.classList.toggle("hidden", v.getAttribute("data-seo-view") !== "fields"));
    const target = field ? panel.querySelector(`[data-seo-field='${field}']`) : null;
    if (target) {
      target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      target.focus({ preventScroll: true });
      target.classList.add("insp-flash");
      setTimeout(() => target.classList.remove("insp-flash"), 1600);
      const label = target.closest(".insp-field")?.querySelector(".insp-label")?.textContent?.trim() || field;
      ctx.toast?.(`Needs your input — editing ${label}`, "info");
    } else {
      ctx.toast?.("This issue needs your input — see the linked field", "info");
    }
    return;
  }
  set({ [patch.field]: patch.value }, false);
  ctx.toast?.("Fixed — analysis re-running", "success");
  refresh();
  refreshAnalysis();
}

function queueAnalysis() {
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(() => {
    if (!ctx.isActive()) return;
    const report = ctx.analyzeSeo();
    State.patch("seo", { report });
    State.patch("editor", { seoScore: report ? report.score : null });
    paintReport(report);
  }, 500);
}

export function refreshAnalysis() {
  clearTimeout(analyzeTimer);
  const report = ctx.analyzeSeo();
  State.patch("seo", { report });
  State.patch("editor", { seoScore: report ? report.score : null });
  paintReport(report);
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function counter(value, min, max) {
  const len = (value || "").length;
  const ok = len >= min && len <= max;
  return `<span class="insp-counter${ok ? " is-ok" : ""}">${len}/${min}–${max}</span>`;
}

function updateCounters() {
  const s = seo();
  const setCounter = (key, min, max) => {
    const host = panel.querySelector(`[data-counter-for='${key}']`);
    if (host) host.innerHTML = counter(s[key], min, max);
  };
  setCounter("metaTitle", 30, 60);
  setCounter("metaDescription", 120, 160);
}

export function refresh() {
  if (!panel || !ctx) return;
  const s = seo();
  panel.innerHTML =
    `<div class="seo-score" data-seo-score></div>` +
    `<div class="insp-tabs" role="tablist">` +
    `<button type="button" class="insp-tab is-active" data-seo-tab="fields">Fields</button>` +
    `<button type="button" class="insp-tab" data-seo-tab="preview">Preview</button>` +
    `<button type="button" class="insp-tab" data-seo-tab="analysis">Analysis</button></div>` +

    `<div data-seo-view="fields">` +
    `<div class="insp-group"><div class="insp-group-title">Fundamental</div>` +
    `<div class="insp-field"><label class="insp-label">Focus keyword <button type="button" class="insp-link" data-seo-ai="keywords">Suggest</button></label>` +
    `<input type="text" class="insp-input" data-seo-field="focusKeyword" value="${esc(s.focusKeyword)}"></div>` +
    `<div class="insp-field"><label class="insp-label">SEO title ${`<span data-counter-for="metaTitle">${counter(s.metaTitle, 30, 60)}</span>`} <button type="button" class="insp-link" data-seo-ai="seo-title">AI</button></label>` +
    `<input type="text" class="insp-input" data-seo-field="metaTitle" value="${esc(s.metaTitle)}"></div>` +
    `<div class="insp-field"><label class="insp-label">Meta description ${`<span data-counter-for="metaDescription">${counter(s.metaDescription, 120, 160)}</span>`} <button type="button" class="insp-link" data-seo-ai="meta-description">AI</button></label>` +
    `<textarea class="insp-textarea" data-seo-field="metaDescription" rows="3">${esc(s.metaDescription)}</textarea></div>` +
    `<div class="insp-field"><label class="insp-label">Canonical URL</label>` +
    `<input type="text" class="insp-input" data-seo-field="canonicalUrl" value="${esc(s.canonicalUrl)}" placeholder="https://…"></div>` +
    `<div class="insp-field"><label class="insp-label">Robots</label><div class="insp-row">` +
    toggleHTML({ label: "noindex", checked: !!s.noIndex, attrs: `data-seo-field="noIndex"` }) +
    toggleHTML({ label: "nofollow", checked: !!s.noFollow, attrs: `data-seo-field="noFollow"` }) + `</div></div></div>` +
    `<div class="insp-group"><div class="insp-group-title">Social</div>` +
    `<div class="insp-field"><label class="insp-label">OG title</label><input type="text" class="insp-input" data-seo-field="ogTitle" value="${esc(s.ogTitle)}"></div>` +
    `<div class="insp-field"><label class="insp-label">OG description</label><textarea class="insp-textarea" data-seo-field="ogDescription" rows="2">${esc(s.ogDescription)}</textarea></div>` +
    `<div class="insp-field"><label class="insp-label">OG image</label>` +
    `<div class="insp-media"><button type="button" class="axed-btn" data-seo-og-image>Choose</button>` +
    (s.ogImage ? `<img src="${esc(s.ogImage)}" alt="">` : "") + `</div></div></div></div>` +

    `<div data-seo-view="preview" class="hidden"><div data-seo-previews></div></div>` +
    `<div data-seo-view="analysis" class="hidden"><div data-seo-issues></div></div>`;

  panel.querySelector("[data-seo-og-image]")?.addEventListener("click", () => ctx.pickMediaForSeo());
  queueAnalysis();
}

function paintReport(report) {
  const scoreHost = panel.querySelector("[data-seo-score]");
  if (scoreHost) {
    if (!report) {
      scoreHost.innerHTML = `<div class="seo-score-empty">Analysis unavailable.</div>`;
    } else {
      const status = report.status === "good" ? "Good" : report.status === "needs-work" ? "Fair" : "Poor";
      const R = 24;
      const C = 2 * Math.PI * R;
      const frac = Math.max(0, Math.min(1, report.score / 100));
      const cats = (report.charts?.categories || []).map((c) =>
        `<div class="seo-cat"><span class="seo-cat-label">${esc(cap(c.id))}</span>` +
        `<span class="seo-cat-bar"><span style="width:${c.score}%"></span></span>` +
        `<span class="seo-cat-num">${c.score}</span></div>`
      ).join("");
      scoreHost.innerHTML =
        `<div class="seo-score-row">` +
        `<svg class="seo-ring seo-${report.status}" viewBox="0 0 56 56" width="56" height="56" role="img" aria-label="SEO score ${report.score} of 100, ${status}">` +
        `<circle cx="28" cy="28" r="${R}" fill="none" stroke-width="6" class="seo-ring-track"/>` +
        `<circle cx="28" cy="28" r="${R}" fill="none" stroke-width="6" stroke-linecap="round" class="seo-ring-value" ` +
        `stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/>` +
        `<text x="28" y="33" text-anchor="middle" class="seo-ring-num">${report.score}</text></svg>` +
        `<span class="seo-score-meta"><span class="seo-score-status">${status}</span>` +
        `<span class="seo-score-sub">${report.errorCount} problems · ${report.warningCount} improvements</span></span></div>` +
        (cats ? `<div class="seo-cats">${cats}</div>` : "");
    }
  }
  const previews = panel.querySelector("[data-seo-previews]");
  if (previews) previews.innerHTML = ctx.seoPreviewHTML();
  const issues = panel.querySelector("[data-seo-issues]");
  if (issues) {
    if (!report || report.recommendations.length === 0) {
      issues.innerHTML = `<div class="seo-all-good"><i class="fa-duotone fa-circle-check"></i> No issues found. Nice work.</div>`;
    } else {
      const errs = report.recommendations.filter((r) => r.severity === "error");
      const warns = report.recommendations.filter((r) => r.severity !== "error");
      const row = (r) => {
        const check = (report.checks || []).find((c) => c.id === r.checkId) || {};
        const field = relatedField(r.checkId);
        const auto = isAutoFixable(r.checkId);
        return `<div class="seo-issue seo-${r.severity}"><div class="seo-issue-head"><i class="fa-duotone fa-${r.severity === "error" ? "circle-xmark" : "triangle-exclamation"}"></i>` +
          `<span>${esc(check.message || r.checkId)}</span></div>` +
          (check.recommendation ? `<p class="seo-issue-why">${esc(check.recommendation)}</p>` : "") +
          (auto ? `<button type="button" class="insp-link" data-seo-fix="${esc(r.checkId)}">Fix it</button>`
            : field ? `<button type="button" class="insp-link" data-seo-goto="${field}">Fix it →</button>` : "") + `</div>`;
      };
      issues.innerHTML =
        (errs.length > 0 ? `<div class="seo-group-title">Problems (${errs.length})</div>` + errs.map(row).join("") : "") +
        (warns.length > 0 ? `<details class="seo-group" open><summary class="seo-group-title">Improvements (${warns.length})</summary>` + warns.map(row).join("") + `</details>` : "") +
        `<details class="seo-group"><summary class="seo-group-title">Good (${(report.checks || []).filter((c) => c.severity === "info").length})</summary>` +
        `<div class="seo-good-note">These checks already pass.</div></details>`;
    }
  }
}

function cap(s) {
  const map = { technical: "Technical", content: "Content", onPage: "On-page", social: "Social", accessibility: "Accessibility" };
  return map[s] || s;
}

function relatedField(checkId) {
  if (/title/.test(checkId)) return "metaTitle";
  if (/description/.test(checkId)) return "metaDescription";
  if (/slug/.test(checkId)) return null;
  if (/canonical/.test(checkId)) return "canonicalUrl";
  if (/keyword/.test(checkId)) return "focusKeyword";
  return null;
}

export default { initSeoPanel, refresh, refreshAnalysis };
