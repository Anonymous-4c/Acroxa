import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createComponentEngine } from "../component-engine.js";
import { createTemplateEngine, listVariables, substituteVariables } from "../template-engine.js";
import { createVariableEngine, interpolate } from "../variable-engine.js";
import { createFormEngine } from "../form-engine.js";

describe("component engine", () => {
  it("defines, instantiates with overrides, versions and detaches", () => {
    const c = createComponentEngine();
    const def = c.define({
      id: "hero", name: "Hero",
      nodes: [
        { id: "h-root", type: "hero", parentId: null, children: [], data: { theme: "dark" } },
        { id: "h-title", type: "heading", parentId: "h-root", children: [], data: { text: "Title" } },
      ],
      shared: { theme: "dark" },
    });
    assert.equal(def.nodes.length, 2);
    const { roots, instance } = c.instantiate("hero", { overrides: { "h-title": { text: "Hello" } } });
    assert.equal(roots.length, 2);
    assert.notEqual(roots[1].id, "h-title");
    assert.equal(roots[1].data.text, "Hello");
    assert.equal(roots[0].data.theme, "dark");
    assert.deepEqual(instance.rootIds.length, 2);
    assert.equal(c.instancesOf("hero").length, 1);
    c.updateInstanceOverrides(instance.id, { "h-title": { text: "Hi" } });
    assert.equal(c.getInstance(instance.id).overrides["h-title"].text, "Hi");
    const v2 = c.updateShared("hero", { theme: "light" });
    assert.equal(v2.version, 2);
    assert.equal(c.detach(instance.id), true);
    assert.equal(c.instancesOf("hero").length, 0);
    // unregister blocked while instances live
    const second = c.instantiate("hero");
    assert.throws(() => c.unregister("hero"), /live instances/);
    c.detach(second.instance.id);
    assert.equal(c.unregister("hero"), true);
    const json = c.toJSON();
    const c2 = createComponentEngine();
    c2.fromJSON(json);
    assert.equal(c2.list().length, 0);
    assert.throws(() => c.define({ nodes: [] }), /non-empty/);
    assert.throws(() => c.instantiate("ghost"), /does not exist/);
  });
});

describe("template engine", () => {
  it("registers fragments and binds variables", () => {
    assert.deepEqual(listVariables({ a: "Hi {{user.name}}!", b: ["{{x|fallback}}"] }).sort(), ["user.name", "x"]);
    const t = createTemplateEngine();
    const tpl = t.register({
      id: "cta", name: "CTA",
      nodes: [{ id: "n1", type: "button", data: { text: "{{label|Click}}", href: "{{href}}" } }],
    });
    assert.deepEqual(tpl.variables, ["label", "href"]);
    const full = t.instantiate("cta", { label: "Buy", href: "/buy" });
    assert.equal(full.nodes[0].data.text, "Buy");
    assert.deepEqual(full.missing, []);
    const partial = t.instantiate("cta", {});
    assert.equal(partial.nodes[0].data.text, "Click");
    assert.deepEqual(partial.missing, ["href"]);
    assert.throws(() => t.instantiate("cta", {}, { strict: true }), (e) => e.code === "MISSING_VARIABLE");
    assert.equal(t.validate("cta").valid, true);
    t.register({
      id: "partial", name: "Partial", variables: ["label"],
      nodes: [{ id: "n1", type: "button", data: { text: "{{label}}", href: "{{href}}" } }],
    });
    assert.equal(t.validate("partial").errors[0].code, "UNDECLARED_VARIABLE");
    assert.throws(() => t.instantiate("ghost"), /does not exist/);
  });
});

describe("variable engine", () => {
  it("resolves sources, bindings and interpolations", () => {
    const v = createVariableEngine();
    v.registerSource("post", (ctx) => ctx.post, { description: "Current post" });
    assert.deepEqual(v.listSources().map((s) => s.name), ["post"]);
    const { values, missing } = v.resolveBindings([
      { path: "title", source: "post", key: "title" },
      { path: "author", source: "post", key: "author.name", fallback: "Staff" },
      { path: "gone", source: "post", key: "nope" },
    ], { post: { title: "Hello" } });
    assert.deepEqual(values, { title: "Hello", author: "Staff" });
    assert.equal(missing.length, 1);
    assert.equal(v.validateBinding({ path: "a", source: "ghost" }).errors[0].code, "UNKNOWN_SOURCE");
    assert.equal(interpolate("Hi {{user}}!", { user: "Ada" }).text, "Hi Ada!");
    assert.equal(interpolate("Hi {{user}}!", {}).missing[0], "user");
    assert.equal(interpolate("Hi {{user|friend}}!", {}).text, "Hi friend!");
    assert.throws(() => interpolate("Hi {{user}}!", {}, { strict: true }), /not available/);
    v.unregisterSource("post");
    assert.equal(v.listSources().length, 0);
  });
});

describe("form engine", () => {
  it("defines forms, validates and serializes submissions", () => {
    const f = createFormEngine();
    const form = f.define({
      id: "contact", name: "Contact",
      fields: [
        { name: "email", type: "email", label: "Email", required: true },
        { name: "topic", type: "select", label: "Topic", options: ["a", "b"], default: "a" },
        { name: "age", type: "number", label: "Age", minimum: 0, maximum: 150 },
        { name: "nick", label: "Nickname" },
      ],
    });
    assert.equal(form.fields.length, 4);
    assert.deepEqual(f.initialValues("contact").topic, "a");
    const bad = f.validate("contact", { email: "nope", topic: "z", age: 999, extra: 1 });
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.some((e) => e.code === "BAD_EMAIL"));
    assert.ok(bad.errors.some((e) => e.code === "BAD_OPTION"));
    assert.ok(bad.warnings.some((w) => w.code === "UNKNOWN_FIELD"));
    assert.equal(f.validate("contact", { email: "a@b.co" }).valid, true);
    const sub = f.serializeSubmission("contact", { email: " a@b.co ", topic: "b" });
    assert.equal(sub.data.email, "a@b.co");
    assert.ok(!("extra" in sub.data));
    assert.ok(sub.submittedAt);
    assert.throws(() => f.serializeSubmission("contact", {}), /required/);
    assert.equal(f.describe("contact").fields[0].accessible, true);
    assert.throws(() => f.define({ fields: [] }), /non-empty/);
  });
});
