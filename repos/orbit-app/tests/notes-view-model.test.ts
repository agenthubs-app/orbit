import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNoteCreateRequest,
  buildNoteUpdateRequest,
  confirmedNote,
  noteFromPayload,
  notesFromPayload,
} from "../src/view-models/notes";

const note = {
  id: "note:one",
  accountId: "account:one",
  ownerUserId: "account:one",
  body: "会议原文\n第二行",
  contactIds: ["contact:a", "contact:b"],
  version: 2,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:01:00.000Z",
};

test("reads actor-owned note collections and detail without copying per contact", () => {
  assert.deepEqual(notesFromPayload({ notes: [note] }, "account:one"), [note]);
  assert.deepEqual(noteFromPayload({ note }, "account:one", "note:one"), note);
  assert.equal(notesFromPayload({ notes: [{ ...note, ownerUserId: "account:other" }] }, "account:one"), null);
  assert.equal(noteFromPayload({ note: { ...note, contactIds: ["contact:a", "contact:a"] } }, "account:one", "note:one"), null);
  assert.equal(noteFromPayload({ note: { ...note, version: 0 } }, "account:one", "note:one"), null);
});

test("create and update requests reject empty drafts and canonicalize contact sets", () => {
  assert.deepEqual(buildNoteCreateRequest("  正文\n", ["contact:b", "contact:a", "contact:b"], "create:key"), {
    success: true,
    body: { body: "正文", contactIds: ["contact:a", "contact:b"], idempotencyKey: "create:key" },
  });
  assert.deepEqual(buildNoteUpdateRequest(" 新正文 ", ["contact:b"], 2, "update:key"), {
    success: true,
    body: { body: "新正文", contactIds: ["contact:b"], expectedVersion: 2, idempotencyKey: "update:key" },
  });
  assert.deepEqual(buildNoteCreateRequest("   ", [], "create:key"), { success: false, error: "请输入笔记内容。" });
});

test("a write clears draft state only after an exact actor, body and relation acknowledgement", () => {
  assert.deepEqual(confirmedNote({ note }, {
    actorId: "account:one",
    body: note.body,
    contactIds: note.contactIds,
    noteId: "note:one",
  }), note);
  for (const changed of [
    { ...note, ownerUserId: "account:other" },
    { ...note, body: "另一正文" },
    { ...note, contactIds: ["contact:a"] },
    { ...note, id: "note:other" },
  ]) {
    assert.equal(confirmedNote({ note: changed }, {
      actorId: "account:one",
      body: note.body,
      contactIds: note.contactIds,
      noteId: "note:one",
    }), null);
  }
});
