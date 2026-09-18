import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// P1-20 hotfix: revision snapshots + listing must work on BOTH backends.
// The old save path ran a mongoose-only chain
// (findOne({...}).sort().lean()) on every backend, so sequelize threw and
// silently minted zero revisions; the SQL list path was also uncapped.
const ctrlPath = path.join(process.cwd(), "src", "controllers", "cmsController.js");
const src = fs.readFileSync(ctrlPath, "utf8");

describe("P1-20 revision backend parity (hotfix)", () => {
  it("numbers revisions backend-agnostically (sequelize order vs mongoose sort)", () => {
    assert.ok(
      src.includes('where: { documentId: id, documentType: docType }'),
      "sequelize revision lookup must use where-clause"
    );
    assert.ok(
      src.includes('order: [["revisionNumber", "DESC"]]'),
      "sequelize revision lookup must order by revisionNumber"
    );
    assert.ok(
      src.includes(".sort({ revisionNumber: -1 })"),
      "mongoose revision lookup keeps its sort chain"
    );
  });

  it("caps the SQL revisions list like mongo (50)", () => {
    const i = src.indexOf("exports.getRevisions");
    assert.ok(i !== -1, "getRevisions not found");
    const block = src.slice(i, src.indexOf("exports.getRevision =", i));
    assert.ok(block.includes("limit: 50"), "sequelize findAll must limit to 50");
    assert.ok(block.includes(".limit(50)"), "mongoose list must keep its limit(50)");
  });
});
