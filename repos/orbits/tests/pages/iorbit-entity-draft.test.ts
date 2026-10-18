import assert from "node:assert/strict";
import test from "node:test";

import { readIOrbitEntityDraft } from "../../app/(app)/app/orbit-2026/iorbit/entity-draft";

test("an actionable draft card requires a recognized kind, state, id and fields", () => {
  const valid = { draftId: "draft:1", kind: "task", state: "pending_confirmation", fields: { title: "佐藤さんに連絡" } };
  assert.deepEqual(readIOrbitEntityDraft(valid), valid);
  assert.equal(readIOrbitEntityDraft({ ...valid, kind: "contact" }), null);
  assert.equal(readIOrbitEntityDraft({ ...valid, state: "unknown" }), null);
  assert.equal(readIOrbitEntityDraft({ ...valid, fields: { title: " " } }), null);
  assert.equal(readIOrbitEntityDraft({ ...valid, draftId: "" }), null);
});
