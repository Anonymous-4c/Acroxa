// acrx/assets/js/editor/app/core/commands.js
//
// Palette-facing command registry built on the runtime command engine.
// Structural commands delegate to controller mutations (history-aware);
// UI commands drive panels, sidebars, device preview and persistence.
//
// Every entry carries palette display metadata (icon/description/keywords)
// plus an optional `when` availability predicate evaluated against the app
// context. Entries without a real handler are never registered here.

import { INSERTER_CATALOG, SLUG_TO_TYPE } from "./model.js";

let ctx = null;

// Availability predicates (app-context closures).
const needsBlock = () => !!ctx.currentBlockId();
const needsMulti = () => ctx.isMulti();
const needsBlockOrMulti = () => needsBlock() || needsMulti();
const needsImageSrc = () => {
  const block = ctx.getBlock(ctx.currentBlockId());
  return !!(block && block.type === "image" && block.data && block.data.src);
};

export function initCommands(shared) {
  ctx = shared;
  const commands = ctx.editor.engines.commands;

  const register = (def) => {
    if (!commands.has(def.id)) commands.register(def);
  };

  // Block insertion commands (one per inserter type + slash aliases).
  for (const def of INSERTER_CATALOG) {
    register({
      id: `insert.${def.type}`,
      label: `Insert ${def.label}`,
      category: "Insert",
      description: def.description || "",
      icon: def.icon || "cube",
      keywords: [def.slug, def.category, "add", "new", "insert"].filter(Boolean),
      run: () => ctx.insertAtSelection(def.type),
    });
  }

  register({ id: "block.duplicate", label: "Duplicate block", category: "Block", description: "Copy the selected block with fresh IDs", icon: "clone", keywords: ["copy", "clone", "repeat"], shortcut: "mod+d", when: needsBlockOrMulti, run: (c, a) => ctx.duplicateBlock(a?.id) });
  register({ id: "block.delete", label: "Delete block", category: "Block", description: "Remove the selected block (undoable)", icon: "trash", keywords: ["remove", "clear"], danger: true, when: needsBlockOrMulti, run: (c, a) => ctx.deleteBlock(a?.id) });
  register({ id: "block.moveUp", label: "Move block up", category: "Block", description: "Shift the selected block earlier", icon: "arrow-up", keywords: ["reorder", "up", "previous"], when: needsBlock, run: (c, a) => ctx.moveBlock(a?.id, -1) });
  register({ id: "block.moveDown", label: "Move block down", category: "Block", description: "Shift the selected block later", icon: "arrow-down", keywords: ["reorder", "down", "next"], when: needsBlock, run: (c, a) => ctx.moveBlock(a?.id, 1) });
  register({ id: "block.transform.paragraph", label: "Transform to paragraph", category: "Transform", description: "Convert while keeping compatible content", icon: "paragraph", keywords: ["convert", "change", "text"], when: needsBlock, run: (c, a) => ctx.transformBlock(a?.id, "paragraph") });
  register({ id: "block.transform.heading", label: "Transform to heading", category: "Transform", description: "Convert while keeping compatible content", icon: "heading", keywords: ["convert", "change", "title", "h1"], when: needsBlock, run: (c, a) => ctx.transformBlock(a?.id, "heading") });
  register({ id: "block.transform.blockquote", label: "Transform to quote", category: "Transform", description: "Convert while keeping compatible content", icon: "quote-left", keywords: ["convert", "change", "cite"], when: needsBlock, run: (c, a) => ctx.transformBlock(a?.id, "blockquote") });
  register({ id: "block.transform.codeblock", label: "Transform to code", category: "Transform", description: "Convert while keeping compatible content", icon: "code", keywords: ["convert", "change", "snippet"], when: needsBlock, run: (c, a) => ctx.transformBlock(a?.id, "codeblock") });
  register({ id: "block.toggleLock", label: "Lock / unlock block", category: "Block", description: "Protect the block from accidental edits", icon: "lock", keywords: ["protect", "freeze"], when: needsBlock, run: (c, a) => ctx.toggleLock(a?.id) });
  register({ id: "block.toggleHide", label: "Show / hide block", category: "Block", description: "Toggle block visibility", icon: "eye-slash", keywords: ["visible", "invisible", "conceal"], when: needsBlock, run: (c, a) => ctx.toggleHide(a?.id) });
  register({ id: "block.copy", label: "Copy block", category: "Block", description: "Copy the selected block to the clipboard", icon: "copy", keywords: ["clipboard", "duplicate"], when: needsBlockOrMulti, run: (c, a) => ctx.copyBlocks(a?.id) });
  register({ id: "block.paste", label: "Paste block", category: "Block", description: "Insert the clipboard contents", icon: "paste", keywords: ["clipboard", "insert"], run: () => ctx.pasteBlocks() });
  register({ id: "block.group", label: "Group selected blocks", category: "Block", description: "Wrap the selection in a container", icon: "object-group", keywords: ["combine", "wrap", "container"], shortcut: "mod+g", when: needsMulti, run: () => ctx.groupSelection("group") });
  register({ id: "block.ungroup", label: "Ungroup container", category: "Block", description: "Dissolve the selected container", icon: "layer-group", keywords: ["dissolve", "unwrap", "split"], shortcut: "mod+shift+g", when: needsBlock, run: (c, a) => ctx.ungroup(a?.id) });
  register({ id: "block.alignLeft", label: "Align blocks left", category: "Block", description: "Align the selection to the left", icon: "align-left", keywords: ["alignment", "position"], when: needsBlockOrMulti, run: (c, a) => ctx.alignBlocks(a?.ids, "left") });
  register({ id: "block.alignCenter", label: "Align blocks center", category: "Block", description: "Center the selection", icon: "align-center", keywords: ["alignment", "position", "middle"], when: needsBlockOrMulti, run: (c, a) => ctx.alignBlocks(a?.ids, "center") });
  register({ id: "block.alignRight", label: "Align blocks right", category: "Block", description: "Align the selection to the right", icon: "align-right", keywords: ["alignment", "position"], when: needsBlockOrMulti, run: (c, a) => ctx.alignBlocks(a?.ids, "right") });
  register({ id: "pattern.save", label: "Save selection as pattern", category: "Block", description: "Reuse the selected blocks later", icon: "bookmark", keywords: ["template", "reuse", "favorite"], when: needsMulti, run: () => ctx.saveSelectionAsPattern() });

  register({ id: "history.undo", label: "Undo", category: "History", description: "Reverse the last change", icon: "rotate-left", keywords: ["revert", "back"], shortcut: "mod+z", run: () => ctx.undo() });
  register({ id: "history.redo", label: "Redo", category: "History", description: "Reapply the undone change", icon: "rotate-right", keywords: ["repeat", "forward"], shortcut: "mod+shift+z", run: () => ctx.redo() });
  register({ id: "document.save", label: "Save now", category: "Document", description: "Persist the document immediately", icon: "floppy-disk", keywords: ["persist", "store"], shortcut: "mod+s", run: () => ctx.saveNow() });
  register({ id: "document.preview", label: "Preview document", category: "Document", description: "Open the rendered preview", icon: "eye", keywords: ["view", "render"], run: () => ctx.openPreview() });
  register({ id: "document.exportHtml", label: "Export HTML", category: "Document", description: "Download the rendered page", icon: "code", keywords: ["download", "file"], run: () => ctx.exportDocument("html") });
  register({ id: "document.exportJson", label: "Export JSON", category: "Document", description: "Download the document blueprint", icon: "brackets", keywords: ["download", "file", "data"], run: () => ctx.exportDocument("json") });
  register({ id: "document.exportMd", label: "Export Markdown", category: "Document", description: "Download as Markdown", icon: "markdown", keywords: ["download", "file", "md"], run: () => ctx.exportDocument("md") });
  register({ id: "document.revisions", label: "Revision history", category: "Document", description: "Browse and restore revisions", icon: "clock-rotate-left", keywords: ["history", "versions", "restore"], run: () => ctx.openRevisions() });
  register({ id: "document.shortcuts", label: "Keyboard shortcuts", category: "Document", description: "Show the shortcut cheat sheet", icon: "keyboard", keywords: ["keys", "hotkeys", "help"], run: () => ctx.openShortcuts() });

  register({ id: "ui.toggleLeft", label: "Toggle left sidebar", category: "View", description: "Show or hide layers, widgets and patterns", icon: "sidebar", keywords: ["panel", "hide"], run: () => ctx.toggleSidebar("left") });
  register({ id: "ui.toggleRight", label: "Toggle right sidebar", category: "View", description: "Show or hide post, SEO and block panels", icon: "sidebar-flip", keywords: ["panel", "hide", "inspector"], run: () => ctx.toggleSidebar("right") });
  register({ id: "ui.showLayers", label: "Show Layers", category: "View", description: "Open the layers panel", icon: "layer-group", keywords: ["tree", "structure", "navigate"], run: () => ctx.showPanel("left", "layers") });
  register({ id: "ui.showWidgets", label: "Show Widgets", category: "View", description: "Open the widget library", icon: "cube", keywords: ["blocks", "library", "insert"], run: () => ctx.showPanel("left", "widgets") });
  register({ id: "ui.showPatterns", label: "Show Patterns", category: "View", description: "Open saved patterns", icon: "diamonds-4", keywords: ["templates", "sections"], run: () => ctx.showPanel("left", "patterns") });
  register({ id: "ui.showPost", label: "Show Post settings", category: "View", description: "Open publishing and metadata", icon: "pen", keywords: ["publish", "meta", "navigate"], run: () => ctx.showPanel("right", "post") });
  register({ id: "ui.showSeo", label: "Show SEO", category: "View", description: "Open analysis and metadata", icon: "chart-simple", keywords: ["search", "meta", "navigate"], run: () => ctx.showPanel("right", "seo") });
  register({ id: "ui.showBlock", label: "Show Block settings", category: "View", description: "Open the block inspector", icon: "sliders", keywords: ["settings", "style", "navigate"], when: needsBlock, run: () => ctx.showPanel("right", "block") });
  register({ id: "ui.deviceDesktop", label: "Desktop preview", category: "View", description: "Preview at desktop width", icon: "desktop", keywords: ["responsive", "breakpoint"], run: () => ctx.setDevice("desktop") });
  register({ id: "ui.deviceTablet", label: "Tablet preview", category: "View", description: "Preview at tablet width", icon: "tablet-screen-button", keywords: ["responsive", "breakpoint"], run: () => ctx.setDevice("tablet") });
  register({ id: "ui.deviceMobile", label: "Mobile preview", category: "View", description: "Preview at mobile width", icon: "mobile-screen-button", keywords: ["responsive", "breakpoint", "phone"], run: () => ctx.setDevice("mobile") });

  register({ id: "mark.bold", label: "Toggle bold", category: "Format", description: "Bold the current selection", icon: "bold", keywords: ["strong", "weight"], when: needsBlock, run: (c, a) => ctx.toggleMark(a?.id, "bold") });
  register({ id: "mark.italic", label: "Toggle italic", category: "Format", description: "Italicize the current selection", icon: "italic", keywords: ["emphasis", "slant"], when: needsBlock, run: (c, a) => ctx.toggleMark(a?.id, "italic") });
  register({ id: "mark.underline", label: "Toggle underline", category: "Format", description: "Underline the current selection", icon: "underline", keywords: ["line"], when: needsBlock, run: (c, a) => ctx.toggleMark(a?.id, "underline") });
  register({ id: "mark.strike", label: "Toggle strikethrough", category: "Format", description: "Strike through the selection", icon: "strikethrough", keywords: ["delete", "line"], when: needsBlock, run: (c, a) => ctx.toggleMark(a?.id, "strikethrough") });
  register({ id: "mark.code", label: "Toggle inline code", category: "Format", description: "Mark the selection as code", icon: "code", keywords: ["monospace", "snippet"], when: needsBlock, run: (c, a) => ctx.toggleMark(a?.id, "code") });
  register({ id: "mark.link", label: "Add link", category: "Format", description: "Link the current selection", icon: "link", keywords: ["url", "href", "anchor"], when: needsBlock, run: (c, a) => ctx.promptLink(a?.id) });

  register({ id: "ai.generate", label: "Generate with AI", category: "AI", description: "Draft a section from a prompt", icon: "sparkles", keywords: ["create", "write", "draft", "generate"], run: () => import("../services/ai.js").then((m) => m.openGenerateDialog()) });
  register({ id: "ai.improve", label: "AI · Improve writing", category: "AI", description: "Rewrite the selected block more clearly", icon: "wand-magic-sparkles", keywords: ["rewrite", "better", "enhance"], when: needsBlock, run: (c, a) => import("../services/ai.js").then((m) => m.transformBlock(a?.id, "improve")) });
  register({ id: "ai.shorten", label: "AI · Shorten", category: "AI", description: "Condense the selected block", icon: "compress", keywords: ["brief", "concise", "tldr"], when: needsBlock, run: (c, a) => import("../services/ai.js").then((m) => m.transformBlock(a?.id, "shorten")) });
  register({ id: "ai.expand", label: "AI · Expand", category: "AI", description: "Flesh out the selected block", icon: "expand", keywords: ["longer", "detail", "elaborate"], when: needsBlock, run: (c, a) => import("../services/ai.js").then((m) => m.transformBlock(a?.id, "expand")) });
  register({ id: "ai.seoTitle", label: "AI · Suggest SEO title", category: "AI", description: "Generate the meta title from content", icon: "magnifying-glass", keywords: ["seo", "meta", "search"], run: () => import("../services/ai.js").then((m) => m.seoFill("seo-title")) });
  register({ id: "ai.metaDescription", label: "AI · Suggest meta description", category: "AI", description: "Generate the meta description", icon: "magnifying-glass", keywords: ["seo", "meta", "search", "snippet"], run: () => import("../services/ai.js").then((m) => m.seoFill("meta-description")) });
  register({ id: "ai.altText", label: "AI · Generate alt text", category: "AI", description: "Describe the selected image", icon: "image", keywords: ["accessibility", "a11y", "describe"], when: needsImageSrc, run: (c, a) => import("../services/ai.js").then((m) => m.altTextFor(a?.id)) });
}

export function commandItems() {
  return ctx.editor.engines.commands.list().map((m) => ({
    id: m.id, label: m.label, category: m.category, shortcut: m.shortcut || "",
    description: m.description || "", icon: m.icon || null, keywords: m.keywords || [],
    danger: !!m.danger,
    run: (args) => ctx.editor.execute(m.id, args || { id: ctx.currentBlockId() }),
  }));
}

export function slashItems() {
  return INSERTER_CATALOG.map((def) => ({
    slug: def.slug,
    label: def.label,
    icon: def.icon,
    description: def.description,
    category: def.category,
    insert: () => ctx.insertAtSelection(def.type),
  }));
}

export function typeForSlug(slug) {
  return SLUG_TO_TYPE[slug] || null;
}

export default { initCommands, commandItems, slashItems, typeForSlug };
