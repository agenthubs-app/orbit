import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNoteCreateRequest,
  buildRichNoteCreateRequest,
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
const normalizedNote = {
  ...note,
  title: "会议原文",
  manualContactIds: ["contact:a", "contact:b"],
  mentions: [],
  eventIds: [],
};

test("reads actor-owned note collections and detail without copying per contact", () => {
  assert.deepEqual(notesFromPayload({ notes: [note] }, "account:one"), [normalizedNote]);
  assert.deepEqual(noteFromPayload({ note }, "account:one", "note:one"), normalizedNote);
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
  assert.deepEqual(buildRichNoteCreateRequest({ title: " 发布会 ", body: " 正文 ", manualContactIds: ["contact:b", "contact:a"], mentions: [], eventIds: [] }, "create:v2"), {
    success: true,
    body: { title: "发布会", body: "正文", manualContactIds: ["contact:a", "contact:b"], mentions: [], eventIds: [], idempotencyKey: "create:v2" },
  });
});

test("local validation errors follow the active app language", () => {
  assert.deepEqual(buildNoteCreateRequest("   ", [], "create:key", "en"), {
    success: false,
    error: "Enter note content.",
  });
  assert.deepEqual(buildRichNoteCreateRequest({
    title: "   ",
    body: "正文",
    manualContactIds: [],
    mentions: [],
    eventIds: [],
  }, "create:v2", "ja"), {
    success: false,
    error: "メモのタイトルを入力してください。",
  });
  assert.deepEqual(buildNoteUpdateRequest("正文", [], 0, "update:key", "en"), {
    success: false,
    error: "The note version is invalid. Reload it.",
  });
});

test("a write clears draft state only after an exact actor, body and relation acknowledgement", () => {
  assert.deepEqual(confirmedNote({ note }, {
    actorId: "account:one",
    body: note.body,
    contactIds: note.contactIds,
    noteId: "note:one",
  }), normalizedNote);
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
