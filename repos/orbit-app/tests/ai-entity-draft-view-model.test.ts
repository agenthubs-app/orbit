import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createTranslator } from "../src/i18n/messages";
import {
  AI_ENTITY_KINDS,
  aiEntityDraftCardView,
  aiEntityRecordHref,
  readAiEntityDraft,
} from "../src/view-models/ai-entity-draft";

const t = createTranslator("zh");
const NOW = "2026-09-19T02:00:00.000Z";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: NOW,
    draftId: "entity-draft:1",
    fields: { dueAt: "2026-09-20T09:00", title: "整理笔记的后续行动" },
    kind: "task",
    revision: 1,
    sourceRefs: [{ id: "note:1", kind: "note" }, { id: "contact:2", kind: "contact" }],
    state: "pending_confirmation",
    updatedAt: NOW,
    ...overrides,
  };
}

test("a well-formed payload becomes a card with a heading and its own rows", () => {
  const draft = readAiEntityDraft(payload());
  assert.ok(draft);
  const view = aiEntityDraftCardView(draft, t);

  assert.equal(view.title, "整理笔记的后续行动");
  assert.equal(view.kindLabel, "待办");
  assert.equal(view.confirmable, true);
  assert.equal(view.createdHref, null);
  assert.deepEqual(view.rows.map(row => row.label), ["截止", "关联"]);
  assert.equal(view.rows[0]?.editable, true, "a pending field can be corrected");
  assert.equal(view.rows[1]?.editable, false, "the source summary is derived, not entered");
  assert.equal(view.sourceSummary, "笔记 1 · 人脉 1");
  assert.equal(view.footnote, "确认前不会写入任何数据。");
});

test("the heading is never repeated as a row", () => {
  const draft = readAiEntityDraft(payload());
  const view = aiEntityDraftCardView(draft!, t);
  assert.equal(view.rows.some(row => row.value === view.title), false);
});

test("a card stays within four rows even when the model fills every field", () => {
  for (const [kind, fields] of [
    ["task", { category: "work", dueAt: "2026-09-20T09:00", notes: "n", title: "t" }],
    ["schedule", { endsAt: "2026-09-21T15:00", location: "东京", startsAt: "2026-09-21T14:00", title: "t" }],
    ["event", { description: "d", endsAt: "2026-09-22T03:00", location: "大阪", startsAt: "2026-09-22T01:00", title: "t" }],
    ["note", { body: "b", title: "t" }],
  ] as const) {
    const draft = readAiEntityDraft(payload({ fields, kind, sourceRefs: [{ id: "note:1", kind: "note" }] }));
    assert.ok(draft, kind);
    const view = aiEntityDraftCardView(draft, t);
    assert.ok(view.rows.length <= 4, `${kind} has ${view.rows.length} rows`);
    assert.ok(view.title.length > 0, kind);
  }
});

test("a created card offers its record and stops offering confirmation", () => {
  const draft = readAiEntityDraft(payload({ createdRecordId: "task:9", state: "created" }));
  const view = aiEntityDraftCardView(draft!, t);

  assert.equal(view.confirmable, false);
  assert.equal(view.createdHref, "/tasks/task%3A9");
  assert.equal(view.footnote, "已写入并回读成功。");
});

test("a failed attempt keeps the card confirmable and carries the reason", () => {
  const draft = readAiEntityDraft(payload({ failureReason: "待办服务暂时不可用" }));
  const view = aiEntityDraftCardView(draft!, t);

  assert.equal(view.confirmable, true, "the user can fix a field and retry");
  assert.equal(view.failureReason, "待办服务暂时不可用");
});

test("a payload that does not parse becomes no card at all", () => {
  // A half-understood draft is worse than none: someone might confirm it.
  assert.equal(readAiEntityDraft(null), null);
  assert.equal(readAiEntityDraft(payload({ kind: "invoice" })), null);
  assert.equal(readAiEntityDraft(payload({ state: "approved" })), null);
  assert.equal(readAiEntityDraft(payload({ fields: {} })), null);
  assert.equal(readAiEntityDraft(payload({ revision: "1" })), null);
  assert.equal(readAiEntityDraft(payload({ draftId: "" })), null);
});

test("a source ref the client does not understand is dropped, not rendered as a guess", () => {
  const draft = readAiEntityDraft(payload({ sourceRefs: [{ id: "x", kind: "ledger" }, { id: "note:1", kind: "note" }] }));
  assert.deepEqual(draft?.sourceRefs, [{ id: "note:1", kind: "note" }]);
});

test("each kind opens the page that actually holds it", () => {
  assert.equal(aiEntityRecordHref("task", "task:1"), "/tasks/task%3A1");
  assert.equal(aiEntityRecordHref("note", "note:1"), "/notes/note%3A1");
  // A schedule draft creates a personal entry; /schedule/<id> is not a route.
  assert.equal(aiEntityRecordHref("schedule", "s:1"), "/schedule/personal/s%3A1");
  assert.equal(aiEntityRecordHref("event", "e:1"), "/events/e%3A1");
  // Contacts are absent on purpose: they keep their existing acquisition flow,
  // so the agent never produces a contact card to open.
  assert.equal(AI_ENTITY_KINDS.includes("contact" as never), false);
});

test("an event draft shows why it belongs in Orbit, so the reason can be corrected before confirming", () => {
  const view = aiEntityDraftCardView({
    createdAt: "2026-09-20T00:00:00.000Z", draftId: "draft:1", fields: {
      sourceNote: "用户要去谈关西制造业的试点。", startsAt: "2026-09-22T01:00:00Z", title: "关西跨境商务对接会",
    }, kind: "event", revision: 1, sourceRefs: [], state: "pending_confirmation", updatedAt: "2026-09-20T00:00:00.000Z",
  }, t);
  const row = view.rows.find((entry) => entry.field === "sourceNote");
  assert.ok(row, "the event service requires this field; a card that hides it refuses the write with no way to fix it");
  assert.equal(row!.editable, true);
  assert.equal(row!.value, "用户要去谈关西制造业的试点。");
});
