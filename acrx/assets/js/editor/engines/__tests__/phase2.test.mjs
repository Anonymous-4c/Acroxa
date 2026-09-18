import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../document-engine.js";
import { createBlockEngine } from "../block-engine.js";
import { createWidgetDefinitionEngine } from "../widget-definition-engine.js";
import { createWidgetSettingsEngine } from "../widget-settings-engine.js";
import { createWidgetStateEngine } from "../widget-state-engine.js";
import { createConstraintEngine } from "../constraint-engine.js";

function setup() {
  const doc = createDocument({ id: "d1" });
  const definitions = createWidgetDefinitionEngine();
  definitions.register({
    type: "columns", category: "layout", label: "Columns", kind: "container",
    capabilities: { nestable: true, draggable: true, editable: false },
    allowedChildren: ["column"], defaults: {},
  });
  definitions.register({
    type: "column", category: "layout", label: "Column", kind: "container",
    capabilities: { nestable: true, draggable: true, editable: false },
    allowedParents: ["columns"], allowedChildren: ["paragraph", "button"], defaults: {},
  });
  definitions.register({
    type: "paragraph", category: "text", label: "Paragraph", kind: "content",
    capabilities: { editable: true, draggable: true }, allowedParents: ["column"],
    defaults: { text: "" },
    settingsSchema: {
      type: "object",
      fields: {
        align: { type: "string", enum: ["left", "center", "right"], default: "left", group: "layout", order: 1 },
        dropCap: { type: "boolean", default: false, group: "typography", order: 2, visibleIf: { field: "align", equals: "left" } },
      },
    },
  });
  definitions.register({
    type: "button", category: "interactive", label: "Button", kind: "atomic",
    capabilities: { editable: false, draggable: true }, allowedParents: ["column"],
    defaults: { text: "Buy" },
  });
  definitions.register({
    type: "locked-note", category: "text", label: "Locked", kind: "atomic",
    capabilities: { editable: false, draggable: false, deletable: false }, defaults: {},
  });
  const constraints = createConstraintEngine({ definitions });
  const blocks = createBlockEngine({ document: doc, definitions, constraints });
  return { doc, definitions, constraints, blocks };
}

describe("widget definitions", () => {
  it("registers, versions, lists and reports capabilities", () => {
    const { definitions } = setup();
    assert.deepEqual(definitions.categories(), ["interactive", "layout", "text"]);
    assert.equal(definitions.byCategory("layout").length, 2);
    assert.equal(definitions.can("button", "draggable"), true);
    assert.equal(definitions.can("button", "editable"), false);
    assert.deepEqual(definitions.defaultsOf("button"), { text: "Buy" });
    assert.equal(definitions.rendererOf("button"), null);
    assert.equal(definitions.has("nope"), false);
    assert.throws(() => definitions.register({ type: "", label: "" }), /Invalid widget definition/);
    assert.throws(() => definitions.capabilitiesOf("nope"), /Unknown widget/);
  });
});

describe("constraints", () => {
  it("derives verdicts from definitions plus custom rules", () => {
    const { constraints } = setup();
    assert.equal(constraints.canInsert({ parentType: "column", childType: "button" }).allowed, true);
    const bad = constraints.canInsert({ parentType: "column", childType: "columns" });
    assert.equal(bad.allowed, false);
    assert.ok(bad.reasons.length > 0);
    assert.equal(constraints.canMove({ nodeType: "locked-note" }).allowed, false);
    assert.equal(constraints.canDelete({ nodeType: "button", locked: true }).allowed, false);
    assert.equal(constraints.canEdit({ nodeType: "button" }).allowed, false);
    assert.equal(constraints.canEdit({ nodeType: "paragraph" }).allowed, true);
    assert.equal(constraints.canNest({ parentType: "button", childType: "paragraph" }).allowed, false);
    const off = constraints.addRule("insert", () => ({ allowed: false, reason: "frozen" }));
    assert.equal(constraints.canInsert({ parentType: "column", childType: "button" }).allowed, false);
    off();
    assert.equal(constraints.canInsert({ parentType: "column", childType: "button" }).allowed, true);
  });
});

describe("block engine", () => {
  it("runs structural editing through constraints", () => {
    const { doc, blocks } = setup();
    const cols = blocks.insertBlock(doc.rootId, "columns", { id: "cols" });
    assert.equal(cols.type, "columns");
    const col = blocks.insertBlock("cols", "column", { id: "col1" });
    const para = blocks.insertBlock("col1", "paragraph", { id: "p1" });
    assert.equal(para.data.text, "");
    assert.throws(() => blocks.insertBlock("col1", "columns"), /Cannot insert/);
    assert.throws(() => blocks.insertBlock(doc.rootId, "nope-type"), /Unknown block type|Cannot insert/);
    const info = blocks.blockInfo("p1");
    assert.deepEqual(
      { kind: info.kind, parentId: info.parentId, editable: info.capabilities.editable },
      { kind: "content", parentId: "col1", editable: true }
    );
    assert.deepEqual(blocks.allowedChildrenOf("column").sort(), ["button", "paragraph"]);
    assert.equal(blocks.isAtomic("button"), true);
    assert.equal(blocks.isAtomic("paragraph"), false);
    assert.equal(blocks.queryByType("paragraph").length, 1);
    blocks.updateBlock("p1", { data: { text: "Hello" } });
    assert.equal(blocks.getBlock("p1").data.text, "Hello");
    const dup = blocks.duplicateBlock("p1");
    assert.notEqual(dup.id, "p1");
    assert.equal(blocks.siblingBlocks("p1").length, 2);
    blocks.moveBlock(dup.id, "col1", 0);
    assert.equal(doc.childrenOf("col1")[0].id, dup.id);
    assert.throws(() => blocks.removeBlock("nope"), /does not exist/);
    assert.equal(blocks.blockInfo("nope"), null);
    void col;
  });

  it("enforces delete/move guards", () => {
    const { doc, blocks } = setup();
    blocks.insertBlock(doc.rootId, "locked-note", { id: "ln" });
    assert.throws(() => blocks.removeBlock("ln"), /Cannot delete/);
    assert.equal(blocks.removeBlock("ln", { force: true }).length, 1);
  });
});

describe("widget settings", () => {
  it("validates, defaults, updates, resets and describes", () => {
    const { definitions } = setup();
    const settings = createWidgetSettingsEngine({ definitions });
    assert.deepEqual(settings.getSettings("paragraph", {}), { align: "left", dropCap: false });
    assert.deepEqual(settings.resetSettings("paragraph"), { align: "left", dropCap: false });
    const updated = settings.updateSettings("paragraph", {}, { align: "center" });
    assert.equal(updated.align, "center");
    assert.throws(() => settings.updateSettings("paragraph", {}, { align: "diagonal" }), /Invalid settings/);
    assert.deepEqual(settings.visibleFields("paragraph", { align: "left" }).sort(), ["align", "dropCap"]);
    assert.deepEqual(settings.visibleFields("paragraph", { align: "center" }), ["align"]);
    assert.deepEqual(Object.keys(settings.settingsGroups("paragraph")).sort(), ["layout", "typography"]);
    const described = settings.describeSettings("paragraph", { align: "center" });
    const align = described.find((d) => d.name === "align");
    assert.equal(align.group, "layout");
    assert.equal(align.visible, true);
    assert.equal(align.value, "center");
    assert.equal(settings.normalizeSettings("paragraph", { align: "right", junk: 1 }).junk, undefined);
    assert.throws(() => settings.validateSettings("nope-type", {}), /No settings schema/);
  });
});

describe("widget state", () => {
  it("tracks transient flags separately from settings", () => {
    const st = createWidgetStateEngine();
    st.setSelected("w1");
    st.setFocused("w1");
    st.set("w1", { open: true, draft: { x: 1 }, cb: () => {} });
    assert.equal(st.isSelected("w1"), true);
    assert.equal(st.isFocused("w1"), true);
    assert.deepEqual(Object.keys(st.get("w1")).sort(), ["draft", "focused", "open", "selected"]);
    const snap = st.serialize();
    assert.deepEqual(snap.w1.draft, { x: 1 });
    const events = [];
    const off = st.subscribe("w1", (ctx) => events.push(ctx.patch));
    st.setLoading("w1", true);
    assert.deepEqual(events, [{ loading: true }]);
    off();
    assert.equal(st.reset("w1"), true);
    assert.deepEqual(st.get("w1"), {});
    st.set("a", { selected: true });
    st.clear();
    assert.deepEqual(st.ids(), []);
    st.destroy();
  });
});
