import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNoteSuggestionNavigation,
  noteSourceFromParams,
  noteSourceTasksFromPayload,
} from "../src/view-models/note-suggestions";

test("note suggestion navigation carries only an immutable reference and editable template", () => {
  const navigation = buildNoteSuggestionNavigation({ id: "note:one", version: 3 });

  assert.equal(navigation.pathname, "/ai/[id]");
  assert.deepEqual(navigation.params, {
    id: "new",
    initialMessage: "请根据这篇笔记整理一个待办，并明确标题和日期。",
    sourceNoteId: "note:one",
    sourceNoteVersion: "3",
  });
  assert.doesNotMatch(JSON.stringify(navigation), /笔记正文|原始笔记/u);
});

test("note detail projects only actor-owned tasks created from that note", () => {
  const tasks = noteSourceTasksFromPayload({ tasks: [
    { id: "task:one", title: "联系佐藤", accountId: "account:one", ownerUserId: "account:one", sourceNoteId: "note:one", sourceNoteVersion: 3 },
    { id: "task:other-note", title: "其他", accountId: "account:one", ownerUserId: "account:one", sourceNoteId: "note:two", sourceNoteVersion: 1 },
    { id: "task:other-actor", title: "越权", accountId: "account:two", ownerUserId: "account:two", sourceNoteId: "note:one", sourceNoteVersion: 3 },
  ] }, "account:one", "note:one");
  assert.deepEqual(tasks, [{ id: "task:one", title: "联系佐藤", sourceNoteVersion: 3 }]);
});

test("conversation parameters reject incomplete or malformed note provenance", () => {
  assert.deepEqual(noteSourceFromParams({ sourceNoteId: "note:one", sourceNoteVersion: "3" }), { id: "note:one", version: 3 });
  assert.equal(noteSourceFromParams({ sourceNoteId: "note:one", sourceNoteVersion: "0" }), null);
  assert.equal(noteSourceFromParams({ sourceNoteId: "note:one" }), null);
  assert.equal(noteSourceFromParams({ sourceNoteId: "", sourceNoteVersion: "3" }), null);
});
