// acrx/assets/js/editor/app/panels/codeEditor.js
//
// Code authoring over the existing Code Block model: a themed dialog with
// language selection, line numbers, word-wrap toggle and file upload. The
// dialog is a pure view over block data — Save commits through the document
// model (undoable) and the canvas preview updates from the same render path.
// Double-clicking a canvas Code Block opens it for that block.

import { createDropdown } from "./controls.js";
import { toggleHTML } from "./controls.js";

let ctx = null;
let openBlockId = null;
let overlay = null;

const LANGUAGES = ["txt", "js", "css", "html", "php", "json", "bash", "sql", "python"];

const EXT_TO_LANG = {
  js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "js",
  css: "css", scss: "css", less: "css",
  html: "html", htm: "html", vue: "html",
  php: "php", json: "json", sh: "bash", bash: "bash",
  sql: "sql", py: "python", txt: "txt", md: "txt",
};

export function initCodeEditor(shared) {
  ctx = shared;
}

export function guessLanguage(filename) {
  const ext = String(filename || "").split(".").pop().toLowerCase();
  return EXT_TO_LANG[ext] || "txt";
}

export function isOpen() {
  return !!overlay;
}

export function openCodeEditor(blockId) {
  const block = blockId ? ctx.getBlock(blockId) : null;
  if (!block || block.type !== "codeblock") {
    ctx.toast("Select a Code block first", "info");
    return false;
  }
  if (overlay) closeEditor(false);
  openBlockId = blockId;
  const d = block.data || {};
  const initialText = codeTextOf(block);
  const initialLang = d.language || "txt";

  overlay = document.createElement("div");
  overlay.className = "acrx-modal-overlay";
  overlay.innerHTML =
    `<div class="acrx-modal acrx-code-dialog" role="dialog" aria-modal="true" aria-label="Edit code">` +
    `<div class="acrx-modal-head"><span><i class="fa-duotone fa-code acrx-dt-icon"></i> Edit code</span>` +
    `<button type="button" class="acrx-suggest-dismiss" data-code-close aria-label="Close">×</button></div>` +
    `<div class="acrx-modal-body">` +
    `<div class="acrx-code-toolbar">` +
    `<span data-code-lang-mount></span>` +
    toggleHTML({ label: "Wrap lines", checked: !!d.wrap, attrs: `data-code-wrap` }) +
    `<label class="axed-btn acrx-code-upload-label"><i class="fa-duotone fa-upload"></i> Upload file` +
    `<input type="file" data-code-file hidden></label>` +
    `</div>` +
    `<div class="acrx-code-area-wrap"><div class="acrx-code-gutter" data-code-gutter aria-hidden="true"></div>` +
    `<textarea class="acrx-code-area${d.wrap ? " is-wrapped" : ""}" data-code-area spellcheck="false" aria-label="Code"></textarea></div>` +
    `<div class="acrx-code-meta"><span data-code-lines></span><span data-code-lang-label></span></div>` +
    `</div>` +
    `<div class="acrx-modal-head acrx-modal-actions">` +
    `<button type="button" class="axed-btn" data-code-cancel>Cancel</button>` +
    `<button type="button" class="axed-btn axed-primary" data-code-save>Save</button>` +
    `</div></div>`;

  document.body.appendChild(overlay);
  const area = overlay.querySelector("[data-code-area]");
  const gutter = overlay.querySelector("[data-code-gutter]");
  const langLabel = overlay.querySelector("[data-code-lang-label]");
  const linesEl = overlay.querySelector("[data-code-lines]");
  const wrapBox = overlay.querySelector("[data-code-wrap]");
  const fileInput = overlay.querySelector("[data-code-file]");
  const cancelBtn = overlay.querySelector("[data-code-cancel]");
  let language = LANGUAGES.includes(initialLang) ? initialLang : "txt";
  let armedDiscard = false;

  const langDD = createDropdown({
    value: language,
    options: LANGUAGES,
    ariaLabel: "Language",
    onChange: (v) => { language = v; paintMeta(); disarm(); },
  });
  overlay.querySelector("[data-code-lang-mount]").replaceWith(langDD.el);

  area.value = initialText;

  function paintMeta() {
    const lines = area.value.split("\n").length;
    linesEl.textContent = `${lines} line${lines === 1 ? "" : "s"} · ${area.value.length} chars`;
    langLabel.textContent = language;
    const nums = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    gutter.textContent = nums;
    gutter.scrollTop = area.scrollTop;
  }

  function disarm() {
    armedDiscard = false;
    cancelBtn.textContent = "Cancel";
  }

  function dirty() {
    return area.value !== initialText || language !== initialLang || wrapBox.checked !== !!d.wrap;
  }

  area.addEventListener("input", () => { paintMeta(); disarm(); });
  area.addEventListener("scroll", () => { gutter.scrollTop = area.scrollTop; });
  wrapBox.addEventListener("change", () => {
    area.classList.toggle("is-wrapped", wrapBox.checked);
    disarm();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      area.value = String(reader.result || "");
      language = guessLanguage(file.name);
      langDD.setValue(language, true);
      paintMeta();
      disarm();
      ctx.toast(`Imported ${file.name}`, "success");
    };
    reader.onerror = () => ctx.toast("Could not read file", "error");
    reader.readAsText(file);
    fileInput.value = "";
  });

  overlay.querySelector("[data-code-save]").addEventListener("click", () => {
    const block = ctx.getBlock(openBlockId);
    if (!block) { closeEditor(false); return; }
    const patch = {};
    if (area.value !== initialText) patch.content = [{ type: "text", text: area.value, marks: [] }];
    if (language !== (block.data?.language || "txt")) patch.language = language;
    if (wrapBox.checked !== !!block.data?.wrap) patch.wrap = wrapBox.checked;
    if (Object.keys(patch).length > 0) {
      ctx.setBlockData(openBlockId, patch, { record: true, label: "Edit code" });
      ctx.render();
      ctx.toast("Code saved", "success");
    }
    closeEditor(false);
    if (openBlockId) ctx.focusBlock?.(openBlockId, 0);
  });

  const tryDismiss = () => {
    if (dirty() && !armedDiscard) {
      armedDiscard = true;
      cancelBtn.textContent = "Discard changes?";
      ctx.toast("Unsaved changes — click Discard again to close", "warning");
      return;
    }
    closeEditor(true);
  };

  cancelBtn.addEventListener("click", tryDismiss);
  overlay.querySelector("[data-code-close]").addEventListener("click", tryDismiss);
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) tryDismiss();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); tryDismiss(); }
    else if (event.key === "Tab" && document.activeElement === area) {
      event.preventDefault();
      document.execCommand("insertText", false, "  ");
    }
  });

  paintMeta();
  area.focus();
  return true;
}

function codeTextOf(block) {
  const content = block.content;
  if (Array.isArray(content)) {
    return content.filter((n) => n && n.type === "text").map((n) => n.text || "").join("");
  }
  return "";
}

export function closeEditor(refocus = true) {
  if (!overlay) return;
  const id = openBlockId;
  overlay.remove();
  overlay = null;
  openBlockId = null;
  if (refocus && id) ctx.focusBlock?.(id, 0);
}

export default { initCodeEditor, openCodeEditor, closeEditor, isOpen, guessLanguage };
