import assert from "node:assert/strict";
import test from "node:test";
import { mergeNotePages } from "../src/view-models/note-history-pagination";
import type { NoteView } from "../src/view-models/notes";

const note = (id: string, version = 1, updatedAt = "2026-09-15T00:00:00.000Z"): NoteView => ({
  id, accountId: "account:one", ownerUserId: "account:one", title: id, body: "正文",
  manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version,
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt,
});

test("history pages deduplicate both pages, retain newer versions and sort stable equal times", () => {
  const merged = mergeNotePages([note("note:b"), note("note:a", 3), note("note:b")], [note("note:a", 2), note("note:c"), note("note:b", 2)]);
  assert.deepEqual(merged.map(({ id, version }) => [id, version]), [["note:a", 3], ["note:b", 2], ["note:c", 1]]);
});

test("equal-version duplicate picks later update without mutating input", () => {
  const base = [note("note:a")];
  const extra = [note("note:a", 1, "2026-09-15T00:01:00.000Z"), note("note:b")];
  assert.deepEqual(mergeNotePages(base, extra).map(({ id, updatedAt }) => [id, updatedAt]), [["note:a", "2026-09-15T00:01:00.000Z"], ["note:b", "2026-09-15T00:00:00.000Z"]]);
  assert.equal(base[0]!.updatedAt, "2026-09-15T00:00:00.000Z");
});
