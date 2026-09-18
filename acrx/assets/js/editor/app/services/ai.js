// acrx/assets/js/editor/app/services/ai.js
//
// AI integration against the existing content endpoints
// (POST /acr/api/ai/content/*). Scoped actions only: selected-block text
// transforms, SEO field generation, alt text. Loading state on the invoking
// control; errors surface as toasts; nothing is applied silently.

import { inlineToText } from "../core/model.js";

let ctx = null;

export function initAi(shared) {
  ctx = shared;
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.message || "AI request rejected");
  return data;
}

function blockPlainText(block) {
  if (!block) return "";
  const direct = inlineToText(block.content);
  if (direct.trim()) return direct;
  const d = block.data || {};
  return [d.text, d.title, d.subtitle, d.description].filter(Boolean).join("\n");
}

// Rewrite the selected block's text through /content/transform.
export async function transformBlock(blockId, operation, tone) {
  const block = ctx.getBlock(blockId);
  if (!block) return;
  const text = blockPlainText(block);
  if (!text.trim()) {
    ctx.toast("Block has no text to transform", "info");
    return;
  }
  ctx.toast("AI working…", "info");
  try {
    const data = await post("/acr/api/ai/content/transform", { text, operation, tone });
    const out = (data.text || "").trim();
    if (!out) throw new Error("Empty AI response");
    applyTextResult(block, out, `AI ${operation}`);
    ctx.toast("AI update applied", "success");
  } catch (err) {
    ctx.toast(err.message || "AI transform failed", "error");
  }
}

function applyTextResult(block, out, label) {
  if (block.content && block.content.length > 0) {
    ctx.setBlockData(block.id, { content: [{ type: "text", text: out, marks: [] }] }, { record: true, label });
  } else if (block.data.text !== undefined) {
    ctx.setBlockData(block.id, { text: out }, { record: true, label });
  } else if (block.data.description !== undefined) {
    ctx.setBlockData(block.id, { description: out }, { record: true, label });
  } else {
    ctx.toast("No writable text field on this block", "info");
    return;
  }
  ctx.afterStructuralChange({ select: block.id, focus: false });
}

// SEO field generation: kind in seo-title | meta-description | keywords.
export async function seoFill(kind) {
  const plain = ctx.documentText().slice(0, 4000);
  const title = ctx.postTitle();
  ctx.toast("AI working…", "info");
  try {
    if (kind === "keywords") {
      const data = await post("/acr/api/ai/content/keywords", { content: plain, title });
      if (data.focusKeyword) ctx.setSeo({ focusKeyword: data.focusKeyword });
      if (Array.isArray(data.keywords)) ctx.setSeo({ keywords: data.keywords });
    } else if (kind === "seo-title") {
      const data = await post("/acr/api/ai/content/seo-title", { content: plain, title });
      if (data.text) ctx.setSeo({ metaTitle: data.text.trim() });
    } else if (kind === "meta-description") {
      const data = await post("/acr/api/ai/content/meta-description", { content: plain, title });
      if (data.text) ctx.setSeo({ metaDescription: data.text.trim() });
    }
    ctx.toast("AI suggestion applied", "success");
  } catch (err) {
    ctx.toast(err.message || "AI request failed", "error");
  }
}

export async function altTextFor(blockId) {
  const block = ctx.getBlock(blockId);
  if (!block || !block.data.src) return;
  ctx.toast("AI working…", "info");
  try {
    const data = await post("/acr/api/ai/content/alt-text", { src: block.data.src, context: block.data.caption || "" });
    if (data.text) {
      ctx.setBlockData(blockId, { alt: data.text.trim() }, { record: true, label: "AI alt text" });
      ctx.toast("Alt text applied", "success");
    }
  } catch (err) {
    ctx.toast(err.message || "AI request failed", "error");
  }
}

// Fast-create dialog: prompt → /content/generate → real paragraph blocks.
// Graceful by design: cancel closes, failure toasts, editing never blocks.
export function openGenerateDialog() {
  closeGenerateDialog();
  const overlay = document.createElement("div");
  overlay.className = "acrx-modal-overlay";
  overlay.innerHTML = `<div class="acrx-modal" role="dialog" aria-label="Generate with AI">` +
    `<div class="acrx-modal-head"><span>Generate with AI</span>` +
    `<button type="button" class="axed-btn axed-icon axed-xs" data-ai-cancel aria-label="Close">×</button></div>` +
    `<div class="acrx-modal-body"><div class="insp-field"><label class="insp-label">What should this section say?</label>` +
    `<textarea class="insp-textarea" data-ai-prompt rows="3" placeholder="e.g. A short intro for a bakery landing page"></textarea></div>` +
    `<div class="acrx-modal-actions"><button type="button" class="axed-btn" data-ai-cancel>Cancel</button>` +
    `<button type="button" class="axed-btn axed-primary" data-ai-go>Generate</button></div>` +
    `<div class="acrx-ai-status" hidden></div></div></div>`;
  document.body.appendChild(overlay);
  const promptEl = overlay.querySelector("[data-ai-prompt]");
  const goBtn = overlay.querySelector("[data-ai-go]");
  const status = overlay.querySelector(".acrx-ai-status");
  promptEl.focus();
  const close = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-ai-cancel]")) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  goBtn.addEventListener("click", async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      status.hidden = false;
      status.textContent = "Describe what to generate first.";
      return;
    }
    goBtn.disabled = true;
    status.hidden = false;
    status.textContent = "Generating…";
    try {
      const data = await post("/acr/api/ai/content/generate", { prompt });
      const text = (data.text || "").trim();
      if (!text) throw new Error("Empty AI response");
      const chunks = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
      let last = null;
      for (const chunk of chunks) {
        const id = ctx.insertAtSelection("paragraph");
        if (!id) break;
        ctx.setBlockData(id, { content: [{ type: "text", text: chunk, marks: [] }] }, { record: false, sync: false });
        last = id;
      }
      ctx.afterStructuralChange({ select: last });
      close();
      ctx.toast(`Inserted ${chunks.length} paragraph${chunks.length === 1 ? "" : "s"} — edit freely`, "success");
    } catch (err) {
      status.textContent = err.message || "Generation failed. Edit manually instead.";
      goBtn.disabled = false;
    }
  });
}

function closeGenerateDialog() {
  document.querySelector(".acrx-modal-overlay")?.remove();
}

export default { initAi, transformBlock, seoFill, altTextFor, openGenerateDialog };
