import assert from "node:assert/strict";
import test from "node:test";

import { notesSearchPath } from "../src/api/endpoints";

test("R20b note category is part of the server search and every cursor page", () => {
  const first = new URL(notesSearchPath({ association: "all", noteKind: "meeting", q: "Launch" }), "https://orbit.local");
  assert.equal(first.searchParams.get("noteKind"), "meeting");
  assert.equal(first.searchParams.get("q"), "Launch");
  const next = new URL(notesSearchPath({ noteKind: "free", cursor: "opaque:page:2", limit: 20 }), "https://orbit.local");
  assert.equal(next.searchParams.get("noteKind"), "free");
  assert.equal(next.searchParams.get("cursor"), "opaque:page:2");
  assert.equal(next.searchParams.get("limit"), "20");
  assert.equal(new URL(notesSearchPath(), "https://orbit.local").searchParams.has("noteKind"), false);
});
