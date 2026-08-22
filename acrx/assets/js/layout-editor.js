// ../acrx/assets/js/layoutEditor.js

document.addEventListener("DOMContentLoaded",(function () {
  "use strict";

  
  
  
  const shell       = document.getElementById("acrx-le-shell");
  if (!shell) { console.warn("[LayoutEditor] Shell not found."); return; }

  const LAYOUT_ID   = shell.dataset.layoutId;
  const API_BASE    = shell.dataset.apiBase    || "/acr/api/layouts";
  const PREV_BASE   = shell.dataset.previewBase|| "/acr/api/layouts/preview";
  const FILES_BASE  = shell.dataset.filesBase  || `/layouts/${LAYOUT_ID}`;

  const LANG_MAP = {
    js: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", css: "css", html: "html", md: "markdown",
    txt: "plaintext", xml: "xml", yaml: "yaml", yml: "yaml",
  };

  const FILE_ICONS = {
    js: "file-js", mjs: "file-js", json: "file-brackets-curly",
    css: "file-css", html: "file-html", md: "file",
    txt: "file-text", default: "file-code",
  };

  const ALLOWED_EXTS = [".js",".css",".json",".html",".md",".txt",".mjs",".cjs"];

  const AUTOSAVE_DELAY    = 3000;
  const PREVIEW_DEBOUNCE  = 1200;

  
  
  
  const store = {
    tabs:        [],     
    activeTab:   null,
    treeData:    null,
    monacoReady: false,
    editor:      null,
    previewOpen: true,
    autosaveTimers: {},
    previewTimer: null,
    ctxTarget:   null,   
    renameTarget: null,
    deleteTarget: null,
    wizardStep:  1,
    wizardData:  {},
    metaCache:   null,
  };

  
  
  
  const $  = (id)  => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  
  
  
  function toast(message, type = "info", duration = 3000) {
    const stack = $("le-toast-stack");
    if (!stack) return;
    const icons = { success: "circle-check", error: "circle-x", warning: "alert-triangle", info: "info-circle" };
    const el = document.createElement("div");
    el.className = `le-toast ${type}`;
    el.innerHTML = `<i class="fa-duotone fa-${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.animation = "le-toast-out 0.2s ease-out forwards";
      setTimeout(() => el.remove(), 220);
    }, duration);
  }

  
  
  
  function openModal(id)  { const m = $(id); if (m) { m.classList.add("open");  setTimeout(() => m.querySelector("input,textarea")?.focus(), 50); } }
  function closeModal(id) { const m = $(id); if (m) m.classList.remove("open"); }
  function openModals(...ids) { ids.forEach(openModal); }
  function modalCloseBtn(btnId, modalId) { $(btnId)?.addEventListener("click", () => closeModal(modalId)); }

  
  document.querySelectorAll(".le-modal-backdrop").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); });
  });

  
  
  
  function extOf(filename) { return (filename.split(".").pop() || "").toLowerCase(); }
  function iconFor(filename) {
    const ext = extOf(filename);
    return FILE_ICONS[ext] || FILE_ICONS.default;
  }
  function langFor(filename) { return LANG_MAP[extOf(filename)] || "plaintext"; }
  function tabId(file)       { return "tab_" + file.replace(/[^a-zA-Z0-9]/g, "_"); }

  
  
  
  function updateStatus(lang, line, col) {
    const t = store.tabs.find(t => t.id === store.activeTab);
    const langLabel = $("le-status-lang");
    const lineLabel = $("le-status-line");
    const dirtyLabel = $("le-status-dirty-count");
    const statusText = $("le-status-text");

    if (langLabel) langLabel.innerHTML = `<i class="fa-duotone fa-code"></i> ${lang || (t ? langFor(t.file) : "—")}`;
    if (lineLabel) lineLabel.innerHTML = `<i class="fa-duotone fa-circle-location-arrow"></i> Ln ${line || 1}, Col ${col || 1}`;

    const dirtyCount = store.tabs.filter(t => t.dirty).length;
    if (dirtyLabel) dirtyLabel.textContent = dirtyCount ? `${dirtyCount} unsaved` : "";
    if (statusText) statusText.textContent = t ? t.file.split("/").pop() : "Ready";

    const badge = $("le-unsaved-badge");
    if (badge) badge.classList.toggle("show", dirtyCount > 0);
  }

  
  
  
  function updateBreadcrumb(file) {
    const el = $("le-breadcrumb-file");
    const pathEl = $("le-editor-path-text");
    if (el) el.textContent = file ? file.split("/").pop() : "—";
    if (pathEl) pathEl.textContent = file ? file : "No file open";
  }

  
  
  
  function initMonaco() {
    if (typeof require === "undefined" || !require.config) return;

    require(["vs/editor/editor.main"], function () {
      
      monaco.editor.defineTheme("acroxa-hyper", {
  base: "vs-dark",
  inherit: true,
  semanticHighlighting: true,

  semanticTokenColors: {

    
    variable: "#dbe7ff",

    
    parameter: "#ffb86c",

    
    property: "#7dd3fc",

    
    function: "#4fc1ff",

    
    method: "#27e1c1",

    
    class: "#5eead4",

    
    interface: "#c792ea",

    
    enum: "#ff79c6",

    
    namespace: "#ffd580",

    
    keyword: "#7c8cff",

    
    decorator: "#ff7ab6",

    
    string: "#7ee787",

    
    number: "#ffcf5a",

    
    regexp: "#ff79c6",

    
    operator: "#ff9ed8",

    
    comment: "#5c6b7a"
  },
  rules: [

    
    
    
    {
      token: "comment",
      foreground: "5c6b7a",
      fontStyle: "italic"
    },

    
    
    
    {
      token: "keyword",
      foreground: "7c8cff",
      fontStyle: "bold"
    },

    {
      token: "keyword.control",
      foreground: "9d7cff"
    },

    {
      token: "storage",
      foreground: "5eead4"
    },

    
    {
      token: "keyword.operator.expression",
      foreground: "7dd3fc"
    },

    
    
    
    {
      token: "variable",
      foreground: "dbe7ff"
    },

    {
      token: "variable.parameter",
      foreground: "f7c873"
    },

    {
      token: "variable.language",
      foreground: "ff7ab6"
    },

    
    {
      token: "identifier",
      foreground: "dbe7ff"
    },

    
    
    
    {
      token: "entity.name.function",
      foreground: "4fc1ff"
    },

    
    {
      token: "support.function",
      foreground: "27e1c1"
    },

    {
      token: "meta.function-call",
      foreground: "56ccf2"
    },

    {
      token: "entity.name.method",
      foreground: "67e8f9"
    },

    
    
    
    {
      token: "string",
      foreground: "7ee787"
    },

    {
      token: "string.escape",
      foreground: "ffb86c"
    },

    {
      token: "string.regexp",
      foreground: "ff79c6"
    },

    
    
    
    {
      token: "number",
      foreground: "ffcf5a"
    },

    {
      token: "constant.numeric",
      foreground: "ffcf5a"
    },

    
    
    
    {
      token: "type",
      foreground: "5eead4"
    },

    {
      token: "support.type",
      foreground: "4fd1ff"
    },

    {
      token: "entity.name.type",
      foreground: "22d3ee"
    },

    {
      token: "entity.name.class",
      foreground: "5eead4"
    },

    
    
    
    {
      token: "tag",
      foreground: "ff7b72"
    },

    {
      token: "meta.tag",
      foreground: "ff7b72"
    },

    {
      token: "entity.name.tag",
      foreground: "ff7b72"
    },

    {
      token: "attribute.name",
      foreground: "ffd580"
    },

    {
      token: "attribute.value",
      foreground: "7ee787"
    },

    
    
    
    {
      token: "operator",
      foreground: "ff9ed8"
    },

    {
      token: "keyword.operator",
      foreground: "c792ea"
    },

    
    
    
    {
      token: "delimiter",
      foreground: "708090"
    },

    
    
    
    {
      token: "support.type.property-name.json",
      foreground: "79c0ff"
    },

    
    
    
    {
      token: "markup.heading",
      foreground: "4fc1ff",
      fontStyle: "bold"
    },

    {
      token: "markup.bold",
      foreground: "ffffff",
      fontStyle: "bold"
    },

    {
      token: "markup.italic",
      foreground: "d8dee9",
      fontStyle: "italic"
    }

  ],

  colors: {

    
    
    
    "editor.background": "#0a0f18",
    "editor.foreground": "#dbe7ff",

    
    
    
    "editorCursor.foreground": "#27e1c1",

    
    
    
    "editor.selectionBackground": "#285b7444",
    "editor.inactiveSelectionBackground": "#1d334444",

    
    
    
    "editor.lineHighlightBackground": "#111827",

    
    
    
    "editorLineNumber.foreground": "#334155",
    "editorLineNumber.activeForeground": "#4fc1ff",

    
    
    
    "editorIndentGuide.background1": "#1e293b",
    "editorIndentGuide.activeBackground1": "#4fc1ff55",

    
    
    
    "editorBracketMatch.background": "#4fc1ff22",
    "editorBracketMatch.border": "#4fc1ff",

    
    
    
    "editor.findMatchBackground": "#ffcf5a55",
    "editor.findMatchHighlightBackground": "#ffcf5a22",

    
    
    
    "editorWidget.background": "#111827",
    "editorWidget.border": "#1f2937",

    
    
    
    "editorHoverWidget.background": "#111827",
    "editorHoverWidget.border": "#334155",

    
    
    
    "editorSuggestWidget.background": "#0f172a",
    "editorSuggestWidget.border": "#1e293b",
    "editorSuggestWidget.foreground": "#dbe7ff",

    "editorSuggestWidget.selectedBackground": "#1e3a5f",
    "editorSuggestWidget.highlightForeground": "#4fc1ff",

    
    
    
    "input.background": "#111827",
    "input.foreground": "#dbe7ff",
    "input.border": "#334155",

    
    
    
    "editorGutter.background": "#0a0f18",

    
    
    
    "minimap.background": "#0a0f18",

    
    
    
    "scrollbarSlider.background": "#33415588",
    "scrollbarSlider.hoverBackground": "#475569",
    "scrollbarSlider.activeBackground": "#64748b",

    
    
    
    "editor.foldBackground": "#1e293b55",

    
    
    
    "editorOverviewRuler.border": "#111827",

    
    
    
    "panel.background": "#0f172a",

    
    
    
    "list.activeSelectionBackground": "#1e3a5f",
    "list.hoverBackground": "#172554",

    
    
    
    "dropdown.background": "#111827",
    "dropdown.border": "#1f2937",

    
    
    
    "sideBar.background": "#0b1220",

    
    
    
    "terminal.background": "#0a0f18",

    
    
    
    "diffEditor.insertedTextBackground": "#22c55e22",
    "diffEditor.removedTextBackground": "#ef444422"
  }
});

      store.editor = monaco.editor.create($("le-monaco-wrap"), {
        theme:                "acroxa-hyper",
        language:             "javascript",
        value:                "",
        fontFamily:           "'JetBrains Mono', 'Fira Code', monospace",
        fontSize:             13,
        lineHeight:           22,
        fontLigatures:        true,
        wordWrap:             "off",
        minimap:              { enabled: true, scale: 1, side: "right" },
        scrollBeyondLastLine: false,
        renderWhitespace:     "selection",
        smoothScrolling:      true,
        cursorBlinking:       "phase",
        cursorSmoothCaretAnimation: "on",
        bracketPairColorization: { enabled: true },
        semanticHighlighting: true,
        formatOnPaste:        true,
        tabSize:              2,
        insertSpaces:         true,
        automaticLayout:      true,
        renderLineHighlight:  "line",
        folding:              true,
        glyphMargin:          false,
        overviewRulerBorder:  false,
        scrollbar: {
          vertical:           "visible",
          horizontal:         "visible",
          useShadows:         false,
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
        suggest: {
          snippetsPreventQuickSuggestions: false,
          showFiles: true,
        },
      });

      store.monacoReady = true;

      
      store.editor.onDidChangeCursorPosition(e => {
        updateStatus(null, e.position.lineNumber, e.position.column);
      });

      
      store.editor.onDidChangeModelContent(() => {
        const tab = store.tabs.find(t => t.id === store.activeTab);
        if (!tab) return;
        const current = store.editor.getValue();
        tab.dirty = current !== tab.originalContent;
        tab.content = current;
        _renderTabDirty(tab);
        updateStatus();
        _scheduleAutosave(tab);
        _schedulePreviewRefresh();
      });

      
      store.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveActiveTab());
      store.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () => saveAllTabs());
      store.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => openFindReplace());
      store.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => closeActiveTab());

      
      const empty = $("le-editor-empty");
      if (store.tabs.length === 0 && empty) empty.style.display = "flex";

      
      const initFile = shell.dataset.activeFile;
      if (initFile) openFile(initFile);
    });
  }

  
  
  
  async function loadTree() {
    try {
      const res  = await fetch(`${API_BASE}/${LAYOUT_ID}/files`);
      const data = await res.json();
      store.treeData = data;
      renderTree(data);
      loadMetaPreview();
    } catch (err) {
      console.error("[LE] loadTree:", err);
      toast("Failed to load file tree", "error");
    }
  }

function renderTree(items, container = null, depth = 0, currentPath = "") {
  const tree = container || $("le-file-tree");
  if (!tree) return;

  if (!container) tree.innerHTML = "";

  items.forEach(item => {

    const itemPath = `${currentPath}/${item.name}`;

    if (item.type === "folder") {

      const folder = document.createElement("div");
      folder.className = "le-tree-folder open";
      folder.dataset.path = itemPath;

      const row = document.createElement("div");
      row.className = "le-tree-item";

      row.style.paddingLeft = `${8 + depth * 14}px`;

      row.innerHTML = `
        <i class="fa-duotone fa-chevron-right le-tree-folder-toggle"></i>
        <i class="fa-duotone fa-folder le-tree-item-icon"></i>
        <span class="le-tree-item-name">${escHtml(item.name)}</span>

        <div class="le-tree-item-actions">
          <button class="le-tree-item-action"
                  data-action="new-file-in"
                  title="New file">
            <i class="fa-duotone fa-file-plus"></i>
          </button>
        </div>
      `;

      folder.appendChild(row);

      const children = document.createElement("div");
      children.className = "le-tree-children";

      folder.appendChild(children);

      if (item.children?.length) {
        renderTree(
          item.children,
          children,
          depth + 1,
          itemPath
        );
      }

      row.addEventListener("click", () => {
        folder.classList.toggle("open");
      });

      tree.appendChild(folder);

    } else {

      const ext = extOf(item.name);

      const row = document.createElement("div");

      row.className = "le-tree-item";

      row.dataset.file = itemPath;
      row.dataset.ext = ext;

      row.style.paddingLeft =
        `${8 + depth * 14 + 14}px`;

      row.innerHTML = `
        <i class="fa-duotone fa-${iconFor(item.name)} le-tree-item-icon"></i>

        <span class="le-tree-item-name">
          ${escHtml(item.name)}
        </span>

        ${item.name === "meta.json"
          ? '<span class="le-tree-item-badge">meta</span>'
          : ""
        }

        <div class="le-tree-item-actions">
          <button class="le-tree-item-action"
                  data-action="rename"
                  title="Rename">
            <i class="fa-duotone fa-edit"></i>
          </button>

          <button class="le-tree-item-action"
                  data-action="delete"
                  title="Delete">
            <i class="fa-duotone fa-trash"></i>
          </button>
        </div>
      `;

      row.addEventListener("click", () => {
        openFile(row.dataset.file);
      });

      row.addEventListener("contextmenu", e => {
        openCtxMenu(e, row.dataset.file, row);
      });

      row.querySelector("[data-action=rename]")
        ?.addEventListener("click", e => {
          e.stopPropagation();
          openRenameModal(row.dataset.file);
        });

      row.querySelector("[data-action=delete]")
        ?.addEventListener("click", e => {
          e.stopPropagation();
          openDeleteModal(row.dataset.file);
        });

      tree.appendChild(row);
    }
  });
}
  
  $("le-file-search")?.addEventListener("input", function () {
    const q = this.value.toLowerCase();
    $$(".le-tree-item[data-file]").forEach(el => {
      const name = (el.dataset.file || "").toLowerCase();
      el.style.display = (!q || name.includes(q)) ? "" : "none";
    });
  });

  
  
  
  async function openFile(file) {
    if (!file) return;

    
    const existing = store.tabs.find(t => t.file === file);
    if (existing) { activateTab(existing.id); return; }

    try {
      const res  = await fetch(`${API_BASE}/${LAYOUT_ID}/file?file=${encodeURIComponent(file)}`);
      const data = await res.json();
      if (!data.content && data.error) throw new Error(data.error);

      const content = data.content || "";
      addTab(file, content);
      highlightTreeItem(file);
    } catch (err) {
      console.error("[LE] openFile:", err);
      toast(`Failed to open ${file}: ${err.message}`, "error");
    }
  }

  function highlightTreeItem(file) {
    $$(".le-tree-item[data-file]").forEach(el => el.classList.toggle("active", el.dataset.file === file));
  }

  
  
  
  function addTab(file, content) {
    const id   = tabId(file);
    const lang = langFor(file);
    const ext  = extOf(file);
    const name = file.split("/").pop();

    
    let model = null;
if (store.monacoReady) {

  const normalizedFile =
    file.replace(/^\/+/, "");

  const uri = monaco.Uri.parse(
    `file:///${LAYOUT_ID}/${normalizedFile}`
  );

  model =
    monaco.editor.getModel(uri) ||
    monaco.editor.createModel(
      content,
      lang,
      uri
    );

  model.setValue(content);
}

    const tab = { id, file, content, originalContent: content, model, dirty: false, ext, name, lang };
    store.tabs.push(tab);
    renderTabEl(tab);
    activateTab(id);
  }

  function renderTabEl(tab) {
    const bar = $("le-tabs");
    if (!bar) return;

    const el = document.createElement("div");
    el.className     = "le-tab";
    el.id            = "le-tab-" + tab.id;
    el.dataset.tabId = tab.id;
    el.dataset.ext   = tab.ext;
    el.setAttribute("role", "tab");
    el.innerHTML     = `
      <i class="fa-duotone fa-${iconFor(tab.name)} le-tab-icon"></i>
      <span class="le-tab-name">${escHtml(tab.name)}</span>
      <span class="le-tab-dot"></span>
      <button class="le-tab-close" title="Close (Ctrl+W)"><i class="fa-duotone fa-x"></i></button>`;

    el.addEventListener("click", e => { if (!e.target.closest(".le-tab-close")) activateTab(tab.id); });
    el.querySelector(".le-tab-close").addEventListener("click", e => { e.stopPropagation(); closeTab(tab.id); });
    bar.appendChild(el);
  }

  function activateTab(id) {
    const tab = store.tabs.find(t => t.id === id);
    if (!tab) return;
    store.activeTab = id;

    
    $$(".le-tab").forEach(el => el.classList.toggle("active", el.dataset.tabId === id));

    
    if (store.monacoReady && store.editor && tab.model) {
      store.editor.setModel(tab.model);
      $("le-editor-empty").style.display = "none";
      $("le-monaco-wrap").style.display  = "block";
    }

    updateBreadcrumb(tab.file);
    updateStatus(tab.lang);
    $("le-editor-lang-label") && ($("le-editor-lang-label").textContent = tab.lang);
    $("le-lang-label") && ($("le-lang-label").textContent = tab.lang);
    highlightTreeItem(tab.file);
    refreshPreview();
  }

  function closeTab(id) {
    const tab = store.tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.dirty) {
      const confirmed = window.confirm(`"${tab.name}" has unsaved changes. Close anyway?`);
      if (!confirmed) return;
    }

    if (tab.model) tab.model.dispose();
    store.tabs = store.tabs.filter(t => t.id !== id);
    $("le-tab-" + id)?.remove();

    if (store.activeTab === id) {
      const next = store.tabs[store.tabs.length - 1];
      if (next) activateTab(next.id);
      else {
        store.activeTab = null;
        $("le-editor-empty").style.display = "flex";
        $("le-monaco-wrap").style.display  = "none";
        updateBreadcrumb("");
        updateStatus();
      }
    }
  }

  function closeActiveTab() { if (store.activeTab) closeTab(store.activeTab); }

  function _renderTabDirty(tab) {
    const el = $("le-tab-" + tab.id);
    if (el) el.classList.toggle("dirty", tab.dirty);
  }

  
  
  
  async function saveActiveTab() {
    const tab = store.tabs.find(t => t.id === store.activeTab);
    if (!tab) return;
    await saveTab(tab);
  }

  async function saveAllTabs() {
    const dirty = store.tabs.filter(t => t.dirty);
    if (!dirty.length) { toast("All files saved", "info"); return; }
    await Promise.all(dirty.map(saveTab));
    toast(`Saved ${dirty.length} file${dirty.length > 1 ? "s" : ""}`, "success");
  }

  async function saveTab(tab) {
    try {
      const content = store.editor && store.activeTab === tab.id
        ? store.editor.getValue()
        : tab.content;

      const res  = await fetch(`${API_BASE}/${LAYOUT_ID}/file`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: tab.file, content }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");

      tab.originalContent = content;
      tab.dirty = false;
      _renderTabDirty(tab);
      updateStatus();

      
      if (tab.file === "meta.json" || tab.file.endsWith("/meta.json")) loadMetaPreview();

      toast(`Saved: ${tab.name}`, "success", 1500);
      refreshPreview();
    } catch (err) {
      toast(`Save failed: ${err.message}`, "error");
    }
  }

  
  function _scheduleAutosave(tab) {
    clearTimeout(store.autosaveTimers[tab.id]);
    store.autosaveTimers[tab.id] = setTimeout(() => {
      if (tab.dirty) saveTab(tab).catch(() => {});
    }, AUTOSAVE_DELAY);
  }

  
  
  
  function refreshPreview() {
    const iframe = $("le-preview-iframe");
    if (!iframe || !store.previewOpen) return;
    const tab = store.tabs.find(t => t.id === store.activeTab);
    if (!tab) return;
    const url = `${PREV_BASE}?id=${encodeURIComponent(LAYOUT_ID)}&url=/`;
    if (iframe.src !== url) iframe.src = url;
    else iframe.contentWindow?.location.reload();
  }

  function _schedulePreviewRefresh() {
    clearTimeout(store.previewTimer);
    store.previewTimer = setTimeout(refreshPreview, PREVIEW_DEBOUNCE);
  }

  function togglePreview(show) {
    store.previewOpen = show !== undefined ? show : !store.previewOpen;
    const area = $("le-editor-area");
    const panel = $("le-preview-panel");
    if (area)  area.classList.toggle("with-preview",  store.previewOpen);
    if (panel) panel.style.display = store.previewOpen ? "" : "none";
    if (store.previewOpen) refreshPreview();
  }

  
  
  
  function openFindReplace() {
    const fr = $("le-find-replace");
    if (!fr) return;
    fr.classList.add("open");
    $("le-find-input")?.focus();
    if (store.editor) {
      const sel = store.editor.getSelection();
      const txt = store.editor.getModel()?.getValueInRange(sel);
      if (txt) $("le-find-input").value = txt;
    }
  }

  $("le-find-close")?.addEventListener("click",  () => $("le-find-replace")?.classList.remove("open"));
  $("le-btn-find")?.addEventListener("click",    openFindReplace);

  $("le-find-input")?.addEventListener("input", function () {
    if (!store.editor || !this.value) { $("le-find-count").textContent = ""; return; }
    const matches = store.editor.getModel()?.findMatches(this.value, false, false, false, null, false) || [];
    $("le-find-count").textContent = `${matches.length} match${matches.length !== 1 ? "es" : ""}`;
  });

  $("le-replace-one")?.addEventListener("click", () => {
    if (!store.editor) return;
    const find    = $("le-find-input")?.value;
    const replace = $("le-replace-input")?.value || "";
    if (!find) return;
    const sel = store.editor.getSelection();
    const txt = store.editor.getModel()?.getValueInRange(sel);
    if (txt === find) {
      store.editor.executeEdits("find-replace", [{ range: sel, text: replace }]);
    } else {
      const m = store.editor.getModel()?.findNextMatch(find, sel.getStartPosition(), false, false, null, false);
      if (m) store.editor.setSelection(m.range);
    }
  });

  $("le-replace-all")?.addEventListener("click", () => {
    if (!store.editor) return;
    const find    = $("le-find-input")?.value;
    const replace = $("le-replace-input")?.value || "";
    if (!find) return;
    const matches = store.editor.getModel()?.findMatches(find, false, false, false, null, false) || [];
    store.editor.executeEdits("replace-all", matches.map(m => ({ range: m.range, text: replace })));
    toast(`Replaced ${matches.length} occurrence${matches.length !== 1 ? "s" : ""}`, "success");
  });

  
  
  
  function openCtxMenu(e, file, el) {
    e.preventDefault();
    store.ctxTarget = { file, el };
    const menu = $("le-ctx-menu");
    if (!menu) return;
    menu.style.left = `${e.clientX}px`;
    menu.style.top  = `${e.clientY}px`;
    menu.classList.add("open");
  }

  document.addEventListener("click",       () => $("le-ctx-menu")?.classList.remove("open"));
  document.addEventListener("contextmenu", e => { if (!e.target.closest(".le-tree-item[data-file]")) $("le-ctx-menu")?.classList.remove("open"); });

  $("le-ctx-open")?.addEventListener("click",      () => { if (store.ctxTarget) openFile(store.ctxTarget.file); });
  $("le-ctx-rename")?.addEventListener("click",    () => { if (store.ctxTarget) openRenameModal(store.ctxTarget.file); });
  $("le-ctx-delete")?.addEventListener("click",    () => { if (store.ctxTarget) openDeleteModal(store.ctxTarget.file); });
  $("le-ctx-copy-path")?.addEventListener("click", () => {
    if (store.ctxTarget) {
      navigator.clipboard?.writeText(store.ctxTarget.file);
      toast("Path copied", "info", 1500);
    }
  });
  $("le-ctx-new-file")?.addEventListener("click",  () => openNewFileModal());

  
  
  
  function openNewFileModal() {
    const inp = $("le-nf-name");
    if (inp) inp.value = "";
    $("le-nf-error")?.classList.remove("show");
    openModal("le-modal-new-file");
  }

  async function createFile() {
    const name = $("le-nf-name")?.value.trim();
    const err  = $("le-nf-error");
    if (!name) { err.textContent = "Name is required"; err.classList.add("show"); return; }
    const ext = "." + extOf(name);
    if (!ALLOWED_EXTS.includes(ext)) { err.textContent = `Extension "${ext}" not allowed`; err.classList.add("show"); return; }

    try {
      const res = await fetch(`${API_BASE}/${LAYOUT_ID}/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: name, content: _starterContent(name) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      closeModal("le-modal-new-file");
      await loadTree();
      openFile(name);
      toast(`Created: ${name}`, "success");
    } catch (e) {
      err.textContent = e.message;
      err.classList.add("show");
    }
  }

  function _starterContent(name) {
    const ext = extOf(name);
    if (ext === "js")   return `// ${name}\n\n`;
    if (ext === "css")  return `/* ${name} */\n\n`;
    if (ext === "json") return `{\n\n}\n`;
    if (ext === "html") return `<!DOCTYPE html>\n<html>\n<head><title></title></head>\n<body>\n\n</body>\n</html>\n`;
    return "";
  }

  modalCloseBtn("le-modal-nf-close",  "le-modal-new-file");
  modalCloseBtn("le-modal-nf-cancel", "le-modal-new-file");
  $("le-modal-nf-create")?.addEventListener("click", createFile);
  $("le-nf-name")?.addEventListener("keydown", e => { if (e.key === "Enter") createFile(); });

  
  
  
  async function createFolder() {
    const name = $("le-folder-name")?.value.trim();
    const err  = $("le-folder-error");
    if (!name) { err.textContent = "Name is required"; err.classList.add("show"); return; }

    try {
      const res = await fetch(`${API_BASE}/${LAYOUT_ID}/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      closeModal("le-modal-new-folder");
      await loadTree();
      toast(`Created folder: ${name}`, "success");
    } catch (e) {
      err.textContent = e.message;
      err.classList.add("show");
    }
  }

  modalCloseBtn("le-modal-folder-close",  "le-modal-new-folder");
  modalCloseBtn("le-modal-folder-cancel", "le-modal-new-folder");
  $("le-modal-folder-create")?.addEventListener("click", createFolder);

  
  
  
  function openRenameModal(file) {
    store.renameTarget = file;
    const inp = $("le-rename-input");
    if (inp) inp.value = file.split("/").pop();
    $("le-rename-error")?.classList.remove("show");
    openModal("le-modal-rename");
  }

  async function renameFile() {
    const newName = $("le-rename-input")?.value.trim();
    const err     = $("le-rename-error");
    if (!newName) { err.textContent = "Name is required"; err.classList.add("show"); return; }

    const oldFile = store.renameTarget;
    const dir     = oldFile.includes("/") ? oldFile.substring(0, oldFile.lastIndexOf("/") + 1) : "";
    const newFile = dir + newName;

    try {
      const res = await fetch(`${API_BASE}/${LAYOUT_ID}/file/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: oldFile, to: newFile }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      closeModal("le-modal-rename");
      
      const tab = store.tabs.find(t => t.file === oldFile);
      if (tab) { tab.file = newFile; tab.name = newName; tab.ext = extOf(newName); }
      await loadTree();
      toast(`Renamed to: ${newName}`, "success");
    } catch (e) {
      err.textContent = e.message;
      err.classList.add("show");
    }
  }

  modalCloseBtn("le-modal-rename-close",  "le-modal-rename");
  modalCloseBtn("le-modal-rename-cancel", "le-modal-rename");
  $("le-modal-rename-ok")?.addEventListener("click", renameFile);
  $("le-rename-input")?.addEventListener("keydown", e => { if (e.key === "Enter") renameFile(); });

  
  
  
  function openDeleteModal(file) {
    store.deleteTarget = file;
    const name = file.split("/").pop();
    const dn   = $("le-delete-name");
    if (dn) dn.textContent = name;
    openModal("le-modal-delete");
  }

  async function deleteFile() {
    const file = store.deleteTarget;
    if (!file) return;
    try {
      const res = await fetch(`${API_BASE}/${LAYOUT_ID}/file`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      closeModal("le-modal-delete");
      
      const tab = store.tabs.find(t => t.file === file);
      if (tab) closeTab(tab.id);
      await loadTree();
      toast(`Deleted: ${file.split("/").pop()}`, "success");
    } catch (e) {
      toast(`Delete failed: ${e.message}`, "error");
    }
  }

  modalCloseBtn("le-modal-delete-close",  "le-modal-delete");
  modalCloseBtn("le-modal-delete-cancel", "le-modal-delete");
  $("le-modal-delete-ok")?.addEventListener("click", deleteFile);

  
  
  
  async function loadMetaPreview() {
    try {
      const res  = await fetch(`${API_BASE}/${LAYOUT_ID}`);
      const meta = await res.json();
      store.metaCache = meta;
      renderMetaPreview(meta);
    } catch (_) {}
  }

  function renderMetaPreview(meta) {
    const rows = $("le-meta-rows");
    if (!rows) return;
    const fields = [
      ["name",        meta.name || "—",                          "str"],
      ["version",     meta.version || "—",                       "str"],
      ["author",      meta.author?.name || "—",                  "str"],
      ["templates",   Object.keys(meta.templates || {}).length,  "num"],
      ["widgetAreas", (meta.widgetAreas || []).length,           "num"],
      ["menuAreas",   (meta.menuAreas   || []).length,           "num"],
    ];
    rows.innerHTML = fields.map(([k, v, type]) =>
      `<div class="le-meta-row">
        <span class="le-meta-key">${escHtml(k)}</span>
        <span class="le-meta-val ${type || ""}">${escHtml(String(v))}</span>
      </div>`
    ).join("");
  }

  $("le-meta-toggle")?.addEventListener("click", () => {
    const rows = $("le-meta-rows");
    const chev = document.querySelector(".le-meta-chevron");
    if (rows) rows.style.display = rows.style.display === "none" ? "" : "none";
    if (chev) chev.style.transform = rows?.style.display === "none" ? "rotate(-90deg)" : "";
  });

  
  
  
  function formatCode() {
    if (!store.editor) return;
    store.editor.getAction("editor.action.formatDocument")?.run();
    toast("Formatted", "success", 1500);
  }

  $("le-btn-format")?.addEventListener("click", formatCode);
  $("le-btn-cmd-format")?.addEventListener("click", formatCode);

  
  
  
  $("le-btn-copy-all")?.addEventListener("click", () => {
    if (!store.editor) return;
    navigator.clipboard?.writeText(store.editor.getValue());
    toast("Copied to clipboard", "info", 1500);
  });

  
  
  
  let wordWrap = false;
  $("le-btn-cmd-wordwrap")?.addEventListener("click", () => {
    wordWrap = !wordWrap;
    store.editor?.updateOptions({ wordWrap: wordWrap ? "on" : "off" });
    $("le-btn-cmd-wordwrap").classList.toggle("active", wordWrap);
  });

  
  
  
  $("le-btn-sidebar-toggle")?.addEventListener("click", () => {
    const sb = $("le-sidebar");
    if (sb) sb.classList.toggle("collapsed");
  });

  $("le-sb-collapse-all")?.addEventListener("click", () => {
    $$(".le-tree-folder.open").forEach(el => el.classList.remove("open"));
  });

  
  
  
  $("le-btn-new-file")?.addEventListener("click",   openNewFileModal);
  $("le-sb-new-file")?.addEventListener("click",    openNewFileModal);

  $("le-btn-new-folder")?.addEventListener("click", () => { $("le-folder-name").value = ""; openModal("le-modal-new-folder"); });
  $("le-sb-new-folder")?.addEventListener("click",  () => { $("le-folder-name").value = ""; openModal("le-modal-new-folder"); });

  $("le-btn-new-layout")?.addEventListener("click", () => openWizard());
  $("le-btn-reload-tree")?.addEventListener("click", loadTree);
  $("le-btn-save")?.addEventListener("click",        saveActiveTab);
  $("le-btn-save-all")?.addEventListener("click",    saveAllTabs);
  $("le-btn-preview-toggle")?.addEventListener("click", () => togglePreview());
  $("le-btn-preview-close")?.addEventListener("click",  () => togglePreview(false));
  $("le-preview-reload")?.addEventListener("click",     refreshPreview);
  $("le-btn-open-customizer")?.addEventListener("click", () => {
    window.location.href = `/acrx/layouts/customize?layout=${LAYOUT_ID}`;
  });

  $("le-preview-open-new")?.addEventListener("click", () => {
    const url = `${PREV_BASE}?id=${encodeURIComponent(LAYOUT_ID)}&url=/`;
    window.open(url, "_blank");
  });

  
  
  
  document.addEventListener("keydown", e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "s") { e.preventDefault(); e.shiftKey ? saveAllTabs() : saveActiveTab(); }
    if (ctrl && e.key === "w") { e.preventDefault(); closeActiveTab(); }
    if (ctrl && e.key === "f") { e.preventDefault(); openFindReplace(); }
    if (e.key === "Escape")    { $("le-find-replace")?.classList.remove("open"); $("le-ctx-menu")?.classList.remove("open"); }
  });

  
  
  
  
  

  const WIZARD_STEPS = ["basic","identity","colors","templates","advanced","confirm"];
  const OPTIONAL_STEPS = ["identity","advanced"];

  function openWizard() {
    store.wizardStep = 1;
    store.wizardData = {};
    _renderWizardStep(1);
    $("le-wizard-overlay").classList.add("open");
  }

  $("le-wizard-close")?.addEventListener("click", () => $("le-wizard-overlay")?.classList.remove("open"));
  $("le-wizard-overlay")?.addEventListener("click", e => { if (e.target === $("le-wizard-overlay")) $("le-wizard-overlay").classList.remove("open"); });

  function _renderWizardStep(step) {
    const total = WIZARD_STEPS.length;
    $("le-wiz-step-label").textContent = `Step ${step} of ${total}`;

    
    $$(".le-wizard-step").forEach((el, i) => {
      el.classList.remove("active","done");
      if (i + 1 === step) el.classList.add("active");
      else if (i + 1 < step) el.classList.add("done");
    });

    
    const stepId = WIZARD_STEPS[step - 1];
    $$(".le-wizard-panel").forEach(p => p.classList.remove("active"));
    $(`le-wp-${stepId}`)?.classList.add("active");

    
    const backBtn     = $("le-wiz-back");
    const nextBtn     = $("le-wiz-next");
    const genBtn      = $("le-wiz-generate");
    const skipLink    = $("le-wiz-skip");

    if (backBtn)  backBtn.style.display  = step > 1      ? "" : "none";
    if (nextBtn)  nextBtn.classList.toggle("hidden", step === total);
    if (genBtn)   genBtn.classList.toggle("hidden",  step !== total);
    if (skipLink) skipLink.style.display = OPTIONAL_STEPS.includes(stepId) ? "" : "none";

    
    if (step === total) _buildWizardConfirmPreview();
  }

  $("le-wiz-next")?.addEventListener("click", () => {
    if (!_validateWizardStep(store.wizardStep)) return;
    _collectWizardStep(store.wizardStep);
    if (store.wizardStep < WIZARD_STEPS.length) {
      store.wizardStep++;
      _renderWizardStep(store.wizardStep);
    }
  });

  $("le-wiz-back")?.addEventListener("click", () => {
    if (store.wizardStep > 1) { store.wizardStep--; _renderWizardStep(store.wizardStep); }
  });

  $("le-wiz-skip")?.addEventListener("click", () => {
    if (store.wizardStep < WIZARD_STEPS.length) { store.wizardStep++; _renderWizardStep(store.wizardStep); }
  });

  function _validateWizardStep(step) {
    if (step === 1) {
      const name = $("le-wiz-name")?.value.trim();
      const id   = $("le-wiz-id")?.value.trim();
      if (!name) { _wizErr("le-wiz-name-err", "Layout name is required"); return false; }
      if (!id)   { _wizErr("le-wiz-id-err",   "Layout ID is required"); return false; }
      if (!/^[a-z0-9-_]+$/.test(id)) { _wizErr("le-wiz-id-err", "ID must be URL-safe: lowercase, hyphens only"); return false; }
    }
    return true;
  }

  function _wizErr(id, msg) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
  }

  function _collectWizardStep(step) {
    const d = store.wizardData;
    switch (WIZARD_STEPS[step - 1]) {
      case "basic":
        d.name    = $("le-wiz-name")?.value.trim()    || "";
        d.id      = $("le-wiz-id")?.value.trim()      || "";
        d.version = $("le-wiz-version")?.value.trim() || "1.0.0";
        d.author  = $("le-wiz-author")?.value.trim()  || "";
        d.description = $("le-wiz-desc")?.value.trim() || "";
        break;
      case "identity":
        d.preview  = $("le-wiz-preview")?.value.trim()    || "/preview/screenshot.png";
        d.features = ($("le-wiz-features")?.value || "").split("\n").map(s => s.trim()).filter(Boolean);
        break;
      case "colors":
        d.colorScheme = {
          primary:    $("le-wiz-colorhex-primary")?.value    || "#00f0ff",
          secondary:  $("le-wiz-colorhex-secondary")?.value  || "#7c3aed",
          accent:     $("le-wiz-colorhex-accent")?.value     || "#ec4899",
          background: $("le-wiz-colorhex-background")?.value || "#0a0a14",
        };
        d.configPreset = document.querySelector(".le-preset-btn.active")?.dataset.preset || "basic";
        break;
      case "templates":
        d.templates = ($("le-wiz-templates")?.value || "").split("\n").map(s => s.trim()).filter(Boolean);
        break;
      case "advanced":
        d.widgetAreas = ($("le-wiz-widgets")?.value || "").split("\n").map(s => s.trim()).filter(Boolean);
        d.menuAreas   = ($("le-wiz-menus")?.value   || "").split("\n").map(s => s.trim()).filter(Boolean);
        break;
    }
  }

  
  $("le-wiz-name")?.addEventListener("input", function () {
    const id = this.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const idField = $("le-wiz-id");
    if (idField && (!idField.value || idField.dataset.auto !== "0")) {
      idField.value = id;
      idField.dataset.auto = "1";
    }
  });
  $("le-wiz-id")?.addEventListener("input", function () { this.dataset.auto = "0"; });

  
  ["primary","secondary","accent","background"].forEach(key => {
    const picker = $(`le-wiz-color-${key}`);
    const hex    = $(`le-wiz-colorhex-${key}`);
    picker?.addEventListener("input", () => { if (hex) hex.value = picker.value; });
    hex?.addEventListener("input", () => {
      if (/^#[0-9a-f]{3,8}$/i.test(hex.value) && picker) picker.value = hex.value;
    });
  });

  
  $$(".le-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".le-preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  function _buildWizardConfirmPreview() {
    
    for (let i = 1; i <= WIZARD_STEPS.length - 1; i++) _collectWizardStep(i);
    const d = store.wizardData;

    
    const tree = $("le-wiz-tree-preview");
    if (tree) {
      const temps = (d.templates || []).map(t => `<div style="padding-left:32px"><span class="file">${t}.js</span></div>`).join("");
      tree.innerHTML = `
        <div><span class="folder">📁 layouts/</span><span class="folder">${d.id || "your-layout-id"}/</span></div>
        <div style="padding-left:16px"><span class="meta">meta.json</span></div>
        <div style="padding-left:16px"><span class="file">index.js</span></div>
        <div style="padding-left:16px"><span class="folder">📁 templates/</span></div>
        ${temps}
        <div style="padding-left:16px"><span class="folder">📁 assets/</span></div>`;
    }

    
    const metaEl = $("le-wiz-meta-preview");
    if (metaEl) {
      const templates = {};
      (d.templates || []).forEach(t => { templates[t] = t; });
      const meta = {
        name: d.name || "My Layout",
        version: d.version || "1.0.0",
        description: d.description || "",
        author: { name: d.author || "" },
        preview: d.preview || "/preview/screenshot.png",
        templates,
        widgetAreas: d.widgetAreas || ["sidebar","footer-col-1"],
        menuAreas: d.menuAreas || ["primary","footer"],
        color_scheme: d.colorScheme || {},
        features: d.features || [],
      };
      metaEl.innerHTML = syntaxHighlightJSON(JSON.stringify(meta, null, 2));
    }
  }

  function syntaxHighlightJSON(json) {
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="key">${escHtml(match)}</span>`;
        return `<span class="str">${escHtml(match)}</span>`;
      }
      if (/true|false|null/.test(match)) return `<span class="arr">${escHtml(match)}</span>`;
      return `<span class="num">${escHtml(match)}</span>`;
    });
  }

  
  $("le-wiz-generate")?.addEventListener("click", async () => {
    _collectWizardStep(5);
    const d = store.wizardData;
    const btn = $("le-wiz-generate");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-duotone fa-loader-2" style="animation:spin 1s linear infinite"></i> Generating…`;

    try {
      const res = await fetch(`${API_BASE}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");

      $("le-wizard-overlay").classList.remove("open");
      toast(`Layout "${d.name}" created!`, "success", 4000);

      
      setTimeout(() => { window.location.href = `/acrx/layouts/edit?layoutid=${d.id}`; }, 1000);
    } catch (err) {
      toast(`Generation failed: ${err.message}`, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-duotone fa-wand"></i> Generate`;
    }
  });

  
  
  
  function escHtml(str = "") {
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  
  const spinStyle = document.createElement("style");
  spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(spinStyle);

  
  
  
  async function boot() {
    
    if (window.monaco) {
      initMonaco();
    } else {
      const checkMonaco = setInterval(() => {
        if (window.require && window.require.config) {
          clearInterval(checkMonaco);
          initMonaco();
        }
      }, 100);
      setTimeout(() => clearInterval(checkMonaco), 10000);
    }

    
    await loadTree();

    
    togglePreview(true);

    
    updateStatus("—", 1, 1);

    console.log("[LayoutEditor] Boot complete:", LAYOUT_ID);
  }

  boot();

}))