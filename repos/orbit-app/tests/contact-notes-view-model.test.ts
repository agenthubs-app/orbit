import assert from "node:assert/strict";
import test from "node:test";
import { contactNotesToView, confirmedContactNotes } from "../src/view-models/contact-notes";
import { contactDetailToSummary } from "../src/view-models/contacts";

const id = "contact:notes";
const body = "strategic_fit / CRM mock 案例\n刚刚聊到日本市场。";
const note = { noteId: "note:private:1", body, createdAt: "2026-09-08T01:00:00.000Z", privacy: "private", authorLabel: "我" };
const payload = { contact: { id, displayName: "林先生", notes: [note, { ...note, noteId: "note:shared", body: "双方已经确认的纪要", privacy: "relationship_shared" }] } };

test("contact notes retain every private note and literal text, newest first", () => {
  const view = contactNotesToView({ contact: { ...payload.contact, notes: [
    ...payload.contact.notes,
    { ...note, noteId: "note:private:2", body: "第二条", createdAt: "2026-09-08T02:00:00.000Z" },
    { ...note, noteId: "note:private:3", body: "第三条", createdAt: "2026-09-08T03:00:00.000Z" },
    { ...note, noteId: "note:unknown", body: "来源记录", privacy: undefined },
  ] } }, id);
  assert.equal(view.state, "ready");
  if (view.state !== "ready") throw new Error("Missing notes");
  assert.deepEqual(view.notes.map((entry) => entry.id), ["note:private:3", "note:private:2", "note:private:1"]);
  assert.equal(view.notes[2]!.body, body);
});

test("unknown note data or a different contact does not become an empty notes list", () => {
  for (const data of [{}, { contact: null }, { contact: { id, notes: null } }, { contact: { id: "another-contact", notes: [] } }]) {
    assert.deepEqual(contactNotesToView(data, id), { state: "unavailable" });
  }
  assert.deepEqual(contactNotesToView({ contact: { id, notes: [] } }, id), { state: "ready", notes: [] });
});

test("only a matching private note acknowledges a successful save", () => {
  const confirmed = confirmedContactNotes(payload, id, body);
  assert.ok(confirmed);
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]!.body, body);
  assert.equal(confirmedContactNotes(payload, "another-contact", body), null);
  assert.equal(confirmedContactNotes(payload, id, "different body"), null);
  for (const patch of [{ privacy: undefined }, { privacy: "relationship_shared" }, { authorLabel: "Someone else" }, { createdAt: "" }, { noteId: "" }]) {
    assert.equal(confirmedContactNotes({ contact: { id, notes: [{ ...note, ...patch }] } }, id, body), null);
  }
});

test("a matching legacy note timestamp remains a valid acknowledgement under the shared contract", () => {
  const confirmed = confirmedContactNotes({ contact: { id, notes: [{ ...note, createdAt: "昨天" }] } }, id, body);
  assert.equal(confirmed?.[0]?.createdAt, "昨天");
});

test("private notes are not silently reduced to the two-item interaction summary", () => {
  const view = contactDetailToSummary({ contact: { ...payload.contact, notes: [
    { ...note, body: "只给自己看的联系人备注" },
    { ...note, noteId: "note:shared", body: "双方已经确认的纪要", privacy: "relationship_shared" },
  ] } });
  assert.equal(view.noteSummaries.includes("只给自己看的联系人备注"), false);
  assert.ok(view.noteSummaries.includes("双方已经确认的纪要"));
});
