import assert from "node:assert/strict";
import test from "node:test";
import { noteTaskPageSchema } from "../../shared/api-schema/note-task-page";

test("note task receipt requires an explicit cursor and rejects inconsistent or body-bearing pages", () => {
  const empty = { actorId: "a", noteId: "n", items: [], total: 0, hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00Z" };
  assert.deepEqual(noteTaskPageSchema.parse(empty), empty);
  const { nextCursor: _, ...missing } = empty;
  const item = { id: "t", titlePreview: "Title", status: "cancelled", sourceNoteVersion: 1 };
  const single = { ...empty, items: [item], total: 1 };
  assert.deepEqual(noteTaskPageSchema.parse(single), single);
  for (const invalid of [missing, { ...empty, nextCursor: undefined }, { ...empty, hasMore: true },
    { ...empty, nextCursor: "next" }, { ...single, total: 0 }, { ...single, items: [item, item], total: 2 },
    { ...single, items: [{ ...item, notes: "private body" }] },
    { ...single, items: [{ ...item, sourceNoteVersion: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...empty, items: Array.from({ length: 31 }, (_, i) => ({ ...item, id: String(i) })), total: 31 },
  ]) assert.equal(noteTaskPageSchema.safeParse(invalid).success, false);
});
