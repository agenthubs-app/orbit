import assert from "node:assert/strict";
import test from "node:test";

import { cardsAsText } from "../../features/agent-v1/entry/legacy-runtime";
import type { OrbitAgentArtifactPayload } from "../../features/orbit-ai/artifact-contract";

/**
 * AG01 adapter: the existing runtime writes its reply on the assumption that the records it read
 * are shown as cards below it. The result document has no cards, so the cards go into the delivered
 * text, as plain lines a user reads: local times in the record's time zone, no internal field names,
 * ids or enums (AG01 run-02; ENT-005 R1 failed on raw `startsAt: …Z` lines).
 */

/** The data_query card as data-query/query-artifact-service.ts builds it: every raw field becomes metadata. */
function queryCard(domain: string, items: Record<string, unknown>[]): OrbitAgentArtifactPayload {
  const hidden = new Set(["id", "title", "body", "details", "description", "evidenceSummary", "snippet", "evidenceIds"]);
  return {
    result: {
      generatedView: {
        sections: [{
          items: items.map((item) => {
            const body = [item.body, item.details, item.description, item.evidenceSummary, item.snippet].find((value) => typeof value === "string" && value.length > 0) as string | undefined;
            return {
              actions: [],
              ...(body ? { body } : {}),
              evidenceIds: [],
              id: String(item.id),
              metadata: Object.entries(item).filter(([key, value]) => !hidden.has(key) && value !== undefined && value !== null).map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join(", ") : String(value) })),
              title: String(item.title ?? item.id ?? "Untitled"),
            };
          }),
          title: `${domain} results`,
        }],
        summary: "",
      },
      kind: "data_query",
      presentation: { title: `${domain} query` },
    },
    task: { kind: "data_query" },
  } as unknown as OrbitAgentArtifactPayload;
}

const lunch = { category: "personal", endsAt: "2026-11-19T04:00:00.000Z", evidenceIds: [], id: "schedule:wada", kind: "personal", missingFields: [], startsAt: "2026-11-19T03:00:00.000Z", timeZone: "Asia/Tokyo", title: "和田中午餐" };
const weekly = { category: "personal", endsAt: "2026-11-16T02:00:00.000Z", id: "schedule:weekly", kind: "personal", location: "3F 会议室", missingFields: ["meetingMethod"], startsAt: "2026-11-16T01:00:00.000Z", timeZone: "Asia/Tokyo", title: "团队周会" };
const reply = { category: "relationship", contactId: "contact:8d24a9eac2ee", createdAt: "2026-11-11T07:10:00.000Z", dueAt: "2026-11-17T09:00:00.000Z", id: "task:t44", source: "manual", status: "open", title: "回复田中的询价", updatedAt: "2026-11-11T07:10:00.000Z" };
const quote = { category: "relationship", contactId: "contact:1", createdAt: "2026-11-12T09:40:00.000Z", id: "task:t42", source: "manual", status: "open", title: "给小林发修订报价", updatedAt: "2026-11-12T09:40:00.000Z" };
const done = { category: "relationship", createdAt: "2026-11-01T00:00:00.000Z", id: "task:t9", source: "manual", status: "completed", title: "寄样片", updatedAt: "2026-11-02T00:00:00.000Z" };
const note = { contactIds: ["contact:c40"], createdAt: "2026-11-13T00:00:00.000Z", eventIds: [], evidenceIds: [], id: "note:m39", snippet: "Call with Emily. She will send the dashboard spec by Friday.", title: "Emily call", updatedAt: "2026-11-13T00:00:00.000Z" };
const untitledNote = { ...note, id: "note:m31", snippet: "和小林聊了报价初稿。小林希望把实施费单列，下周再对一次。", title: null };

const INTERNAL = /startsAt|endsAt|timeZone|missingFields|category|kind:|source:|contactId|createdAt|updatedAt|personal|relationship|manual|results|query|schedule:|task:|note:|contact:|T\d\d:\d\d:\d\d|Z\b/u;

test("schedule cards: local time in the record's time zone, title and place, nothing internal (zh)", () => {
  const text = cardsAsText([queryCard("schedule", [lunch, weekly])], "zh");
  assert.equal(text, "查到的记录：\n日程\n- 和田中午餐 · 11月19日（周四）12:00–13:00\n- 团队周会 · 11月16日（周一）10:00–11:00 · 地点：3F 会议室");
  assert.doesNotMatch(text, INTERNAL);
});

test("schedule cards in en and ja", () => {
  assert.equal(cardsAsText([queryCard("schedule", [lunch])], "en"), "Records found:\nSchedule\n- 和田中午餐 · Thu, Nov 19, 12:00–13:00");
  assert.equal(cardsAsText([queryCard("schedule", [weekly])], "ja"), "見つかった記録：\n予定\n- 团队周会 · 11月16日（月）10:00–11:00 · 場所：3F 会议室");
});

test("a record without its own time zone falls back to the given one; all-day and multi-day items read plainly", () => {
  const noZone = { ...lunch, timeZone: undefined };
  assert.equal(cardsAsText([queryCard("schedule", [noZone])], "zh", "America/New_York"), "查到的记录：\n日程\n- 和田中午餐 · 11月18日（周三）22:00–23:00");
  assert.equal(cardsAsText([queryCard("schedule", [noZone])], "zh"), "查到的记录：\n日程\n- 和田中午餐 · 11月19日（周四）12:00–13:00", "default Asia/Tokyo");
  const allDay = { ...lunch, allDay: true, endsAt: undefined, startsAt: "2026-11-18T15:00:00.000Z" };
  assert.equal(cardsAsText([queryCard("schedule", [allDay])], "zh"), "查到的记录：\n日程\n- 和田中午餐 · 11月19日（周四）全天");
  const trip = { ...lunch, endsAt: "2026-11-20T01:00:00.000Z" };
  assert.equal(cardsAsText([queryCard("schedule", [trip])], "en"), "Records found:\nSchedule\n- 和田中午餐 · Thu, Nov 19, 12:00 – Fri, Nov 20, 10:00");
});

test("todo cards: title, due date and status in plain words (zh, en, ja)", () => {
  const zh = cardsAsText([queryCard("tasks", [reply, quote, done])], "zh");
  assert.equal(zh, "查到的记录：\n待办\n- 回复田中的询价 · 截止 11月17日（周二）18:00 · 未完成\n- 给小林发修订报价 · 没有截止时间 · 未完成\n- 寄样片 · 没有截止时间 · 已完成");
  assert.doesNotMatch(zh, INTERNAL);
  assert.equal(cardsAsText([queryCard("tasks", [reply])], "en"), "Records found:\nTo-dos\n- 回复田中的询价 · due Tue, Nov 17, 18:00 · not done");
  assert.equal(cardsAsText([queryCard("tasks", [quote, done])], "ja"), "見つかった記録：\nタスク\n- 给小林发修订报价 · 期限なし · 未完了\n- 寄样片 · 期限なし · 完了");
});

test("note cards: title and date; an untitled note is named by its opening words, never by its id", () => {
  const zh = cardsAsText([queryCard("notes", [note, untitledNote])], "zh");
  assert.equal(zh, "查到的记录：\n笔记\n- Emily call · 11月13日（周五）\n- 和小林聊了报价初稿。小林希望把实施费单列… · 11月13日（周五）");
  assert.doesNotMatch(zh, INTERNAL);
  assert.equal(cardsAsText([queryCard("notes", [note])], "en"), "Records found:\nNotes\n- Emily call · Fri, Nov 13");
  assert.equal(cardsAsText([queryCard("notes", [note])], "ja"), "見つかった記録：\nメモ\n- Emily call · 11月13日（金）");
});

test("several cards are grouped by kind under one header; follow-ups read like todos", () => {
  const followup = { connectionId: "connection:1", createdAt: "2026-11-10T00:00:00.000Z", dueAt: "2026-11-14T03:00:00.000Z", id: "task:f1", source: "confirmed_task", status: "open", title: "跟进田中的分期方案", updatedAt: "2026-11-10T00:00:00.000Z" };
  assert.equal(cardsAsText([queryCard("schedule", [lunch]), queryCard("followups", [followup])], "zh"), "查到的记录：\n日程\n- 和田中午餐 · 11月19日（周四）12:00–13:00\n\n跟进\n- 跟进田中的分期方案 · 截止 11月14日（周六）12:00 · 未完成");
});

test("other card kinds show only their title and subtitle; empty cards add nothing", () => {
  const context = {
    result: { generatedView: { sections: [{ items: [{ actions: [], evidenceIds: [], id: "chat-context:pending", metadata: [{ label: "Resolution score", value: "0.00" }, { label: "Candidates", value: "8" }], subtitle: "Clarify the relationship before continuing.", title: "Clarify relationship context" }], title: "Relationship context" }], summary: "" }, kind: "relationship_chat_context" },
    task: { kind: "relationship_chat_context" },
  } as unknown as OrbitAgentArtifactPayload;
  assert.equal(cardsAsText([context], "en"), "Records found:\n- Clarify relationship context（Clarify the relationship before continuing.）");
  assert.equal(cardsAsText([], "zh"), "");
  assert.equal(cardsAsText([queryCard("schedule", [])], "zh"), "");
});
