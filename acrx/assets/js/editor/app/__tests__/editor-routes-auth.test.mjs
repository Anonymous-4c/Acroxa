import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// P0-08: editor save/preview/restore POSTs must carry role + ownership checks.
// Reads the route source as text (never requires it — requiring boots DB).
const routesPath = path.join(process.cwd(), "src", "routes", "cmsRoutes.js");
const src = fs.readFileSync(routesPath, "utf8");

function blockFor(route) {
  const i = src.indexOf(route);
  assert.ok(i !== -1, `route not found: ${route}`);
  // Capture from route start to the closing ");" of that router call.
  const end = src.indexOf(");", i);
  return src.slice(i, end);
}

describe("P0-08 editor POST authZ", () => {
  it("POST /editor/:id/content requires roles + ownership", () => {
    const b = blockFor("router.post('/editor/:id/content'");
    assert.ok(b.includes("verifyAPIToken"), "must keep verifyAPIToken");
    assert.ok(b.includes('requireRoles(["author", "editor", "admin"])'), "must require author/editor/admin");
    assert.ok(
      b.includes("checkEditorOwnership") || b.includes("checkOwnership"),
      "must check ownership"
    );
    assert.ok(b.includes("saveEditorContent"), "must still route to saveEditorContent");
  });

  it("POST /editor/:id/preview requires roles + ownership", () => {
    const b = blockFor("router.post('/editor/:id/preview'");
    assert.ok(b.includes("verifyAPIToken"), "must keep verifyAPIToken");
    assert.ok(b.includes('requireRoles(["author", "editor", "admin"])'), "must require author/editor/admin");
    assert.ok(
      b.includes("checkEditorOwnership") || b.includes("checkOwnership"),
      "must check ownership"
    );
    assert.ok(b.includes("previewEditorContent"), "must still route to previewEditorContent");
  });

  it("POST restore requires roles + ownership", () => {
    const b = blockFor("router.post('/editor/:id/revisions/:revisionId/restore'");
    assert.ok(b.includes('requireRoles(["author", "editor", "admin"])'), "must require author/editor/admin");
    assert.ok(
      b.includes("checkEditorOwnership") || b.includes("checkOwnership"),
      "must check ownership"
    );
  });

  it("editor ownership is postType-aware (pages are not checked as posts)", () => {
    assert.ok(
      src.includes("checkEditorOwnership"),
      "expected a postType-aware ownership helper for editor routes"
    );
    assert.ok(
      src.includes('docType === "page"') || src.includes("=== 'page'"),
      "helper must distinguish page vs post"
    );
  });
});
