import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNoteCreateRequest,
  buildRichNoteCreateRequest,
  buildNoteUpdateRequest,
  confirmedNote,
  noteAssociationsForReceipt,
  noteFromPayload,
  notesPageFromPayload,
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

test("a trimmed note body keeps event mention offsets aligned in UTF-16", () => {
  const result = buildRichNoteCreateRequest({
    title: "Launch",
    body: "  👋 @Launch  ",
    manualContactIds: [],
    mentions: [{ entityType: "event", eventId: "event:launch", start: 5, end: 12, displayText: "@Launch" }],
    eventIds: [],
  }, "create:trimmed-mention");
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.body.body, "👋 @Launch");
  assert.deepEqual(result.body.mentions, [{ entityType: "event", eventId: "event:launch", start: 3, end: 10, displayText: "@Launch" }]);
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

test("App keeps event and unknown tokens readable, skips one bad note, and preserves page total", () => {
  const eventMention = { entityType: "event", eventId: "event:launch", start: 5, end: 12, displayText: "@Launch" };
  const unknownMention = { entityType: "future", futureId: "future:1", start: 0, end: 4, displayText: "Note" };
  const eventNote = {
    ...normalizedNote, id: "note:event", body: "Meet @Launch", contactIds: [], manualContactIds: [],
    eventIds: ["event:launch"], mentions: [eventMention], noteKind: "meeting", usedForPlan: true,
  };
  const unknownNote = {
    ...normalizedNote, id: "note:future", body: "Note for future", contactIds: [], manualContactIds: [],
    mentions: [unknownMention], noteKind: "future-kind",
  };
  const badMention = { ...normalizedNote, id: "note:bad-token", body: "@Bad", contactIds: [], manualContactIds: [], mentions: [{ entityType: "event", eventId: "event:1", start: 0, end: 9, displayText: "@Bad" }] };
  const badFlag = { ...normalizedNote, id: "note:bad-flag", usedForPlan: "yes" };
  const page = notesPageFromPayload({ notes: [eventNote, { ...normalizedNote, id: "note:bad", body: "" }, badMention, badFlag, unknownNote], total: 19 }, "account:one");
  assert.equal(page?.total, 19);
  assert.deepEqual(page?.notes.map((item) => item.id), ["note:event", "note:future"]);
  assert.deepEqual(page?.notes[0]?.mentions, [eventMention]);
  assert.deepEqual(page?.notes[1]?.mentions, [unknownMention]);
  assert.equal(page?.notes[1]?.noteKind, "free");
});

test("memo acknowledgement includes event token identity and optional plan flags", () => {
  const mention = { entityType: "event" as const, eventId: "event:launch", start: 5, end: 12, displayText: "@Launch" };
  const saved = { ...normalizedNote, body: "Meet @Launch", contactIds: [], manualContactIds: [], eventIds: ["event:launch"], mentions: [mention], noteKind: "meeting", usedForPlan: true };
  const expected = { actorId: "account:one", body: saved.body, contactIds: [], eventIds: ["event:launch"], mentions: [mention], noteKind: "meeting" as const, usedForPlan: true };
  assert.deepEqual(confirmedNote({ note: saved }, expected), saved);
  assert.equal(confirmedNote({ note: { ...saved, noteKind: "free" } }, expected), null);
  assert.equal(confirmedNote({ note: { ...saved, usedForPlan: false } }, expected), null);
  assert.equal(confirmedNote({ note: { ...saved, mentions: [{ ...mention, eventId: "event:other" }] } }, expected), null);
});

test("R20b receipt relations separate event mentions from contact mentions", () => {
  const associations = noteAssociationsForReceipt({
    manualContactIds: ["contact:b"], eventIds: ["event:manual"],
    mentions: [
      { contactId: "contact:a", start: 0, end: 2, displayText: "@A" },
      { entityType: "event", eventId: "event:launch", start: 3, end: 10, displayText: "@Launch" },
    ],
  });
  assert.deepEqual(associations, {
    contactIds: ["contact:a", "contact:b"],
    eventIds: ["event:launch", "event:manual"],
  });
});

test("R20b plan-use requests require a meeting memo for exactly one person", () => {
  const draft = { title: "面談", body: "@Launch で話した", manualContactIds: [] as string[],
    mentions: [{ entityType: "event" as const, eventId: "event:launch", start: 0, end: 7, displayText: "@Launch" }],
    eventIds: [] as string[], noteKind: "meeting" as const, usedForPlan: true };
  assert.deepEqual(buildRichNoteCreateRequest(draft, "plan:zero", "en"), {
    success: false, error: "To use this for your plan, link the meeting note to one person.",
  });
  assert.equal(buildRichNoteCreateRequest({ ...draft, manualContactIds: ["contact:a", "contact:b"] }, "plan:two", "en").success, false);
  assert.equal(buildRichNoteCreateRequest({ ...draft, manualContactIds: ["contact:a"], noteKind: "free" }, "plan:free", "en").success, false);
  assert.equal(buildRichNoteCreateRequest({ ...draft, manualContactIds: ["contact:a"] }, "plan:one", "en").success, true);
});
