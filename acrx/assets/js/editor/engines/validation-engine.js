// acrx/assets/js/editor/engines/validation-engine.js
//
// ENGINE 21 — Validation Engine (headless foundation).
// Central framework that aggregates named checks over any target and returns
// structured results: { valid, errors, warnings }. Checks are plain sync
// functions, so schema-based, document-based and custom rules compose here.

export const VALIDATION_ENGINE_VERSION = "1.0.0";
export const ENGINE_ID = "validation";

function toIssue(raw, fallback) {
  if (typeof raw === "string") return { code: "CHECK_FAILED", path: "", message: raw, severity: "error" };
  const issue = {
    code: raw.code || "CHECK_FAILED",
    path: raw.path || "",
    message: raw.message || (fallback ? `Check "${fallback}" failed.` : "Validation failed."),
    severity: raw.severity === "warning" ? "warning" : "error",
  };
  if (raw.expected !== undefined) issue.expected = raw.expected;
  if (raw.actual !== undefined) issue.actual = raw.actual;
  return issue;
}

export function createValidationEngine() {
  const checks = new Map(); // id -> { id, scope, severity, run, description }
  let destroyed = false;

  function fail(operation, code, message) {
    const err = new Error(message);
    err.name = "ValidationError";
    err.code = code;
    err.engine = ENGINE_ID;
    err.operation = operation;
    throw err;
  }

  const engine = {
    get engine() { return ENGINE_ID; },
    get version() { return VALIDATION_ENGINE_VERSION; },

    registerCheck(def) {
      if (destroyed) fail("registerCheck", "Engine is destroyed.");
      if (!def || typeof def !== "object") fail("registerCheck", "Check definition must be an object.");
      if (typeof def.id !== "string" || def.id === "") fail("registerCheck", "Check requires a non-empty string id.");
      if (typeof def.run !== "function") fail("registerCheck", `Check "${def.id}" requires a run(target, ctx) function.`);
      if (def.severity !== undefined && def.severity !== "error" && def.severity !== "warning") {
        fail("registerCheck", `Check "${def.id}": severity must be "error" or "warning".`);
      }
      const existed = checks.has(def.id);
      checks.set(def.id, {
        id: def.id,
        scope: def.scope || "general",
        severity: def.severity || "error",
        description: def.description || "",
        run: def.run,
      });
      return existed ? "updated" : "registered";
    },

    unregisterCheck(id) {
      return checks.delete(id);
    },

    hasCheck(id) {
      return checks.has(id);
    },

    listChecks(scope) {
      const out = [];
      for (const c of checks.values()) {
        if (scope !== undefined && c.scope !== scope) continue;
        out.push({ id: c.id, scope: c.scope, severity: c.severity, description: c.description });
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : 1));
    },

    // Run checks against a target. Options: { scope, ids, ctx }.
    // A check returns: null/undefined/true (pass), string | issue | array
    // (failures), or throws (captured as CHECK_THREW error issue).
    validate(target, opts = {}) {
      if (destroyed) fail("validate", "Engine is destroyed.");
      const errors = [];
      const warnings = [];
      const ran = [];
      for (const check of checks.values()) {
        if (opts.scope !== undefined && check.scope !== opts.scope) continue;
        if (opts.ids !== undefined && !opts.ids.includes(check.id)) continue;
        ran.push(check.id);
        let outcome;
        try {
          outcome = check.run(target, opts.ctx || {});
        } catch (err) {
          errors.push({
            code: "CHECK_THREW",
            path: "",
            message: `Check "${check.id}" threw: ${err && err.message ? err.message : String(err)}.`,
            severity: "error",
          });
          continue;
        }
        if (outcome === null || outcome === undefined || outcome === true) continue;
        if (outcome === false) {
          (check.severity === "warning" ? warnings : errors).push(
            toIssue({ code: "CHECK_FAILED", message: `Check "${check.id}" failed.` }, check.id)
          );
          continue;
        }
        const items = Array.isArray(outcome) ? outcome : [outcome];
        for (const raw of items) {
          const issue = toIssue(raw, check.id);
          // A check-declared warning severity wins unless the issue says error.
          if (check.severity === "warning" && (!raw || typeof raw !== "object" || raw.severity === undefined)) {
            issue.severity = "warning";
          }
          (issue.severity === "warning" ? warnings : errors).push(issue);
        }
      }
      return { valid: errors.length === 0, errors, warnings, ran };
    },

    clear() {
      checks.clear();
    },

    destroy() {
      checks.clear();
      destroyed = true;
    },
  };

  return engine;
}

export default createValidationEngine;
