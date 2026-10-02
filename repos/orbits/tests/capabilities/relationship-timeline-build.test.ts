/**
 * W0046 SC-W0046-01（纯函数）：buildRelationshipTimeline 七种来源各给出符合契约的条目；
 * `note:<encounterId>` 投影不与 encounter 重复；schedule 排除 cancelled；capture 每人恰好 1 条；
 * 降序、同刻按 id；mergeRelationshipTimelineItems 跨联系人取前 N。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipTimeline,
  captureMethodFor,
  mergeRelationshipTimelineItems,
  RELATIONSHIP_TIMELINE_SOURCES,
  timelineExcerpt,
  type RelationshipTimelineSources,
} from "../../features/relationship-timeline/build";

const ACTOR = "actor:alice";
const C1 = "contact:c1";
const C2 = "contact:c2";

function sources(): RelationshipTimelineSources {
  return {
    contacts: [
      { id: C1, createdAt: "2026-09-01T01:00:00.000Z", sourceType: "business_card_ocr", metEventId: "event:e1", metEventTitle: "Tokyo SaaS Night" },
      { id: C2, createdAt: "2026-09-02T01:00:00.000Z", sourceType: "manual" },
    ],
    detailStates: [{
      actorId: ACTOR,
      contactId: C1,
      notes: [
        { noteId: "note:live-contact-detail-update:aaa", body: "聊了 B 轮融资", createdAt: "2026-09-30T03:00:00.000Z", occurredAt: "2026-09-20", eventId: "event:e1", kind: "memo" },
        { noteId: "note:live-contact-detail-update:bbb", body: "旧的跟进记录", createdAt: "2026-09-10T03:00:00.000Z" },
        { noteId: "note:enc-1", body: "谈过：是", createdAt: "2026-09-18T10:00:00.000Z" },
      ],
    }],
    encounters: [
      { encounterId: "enc-1", contactId: C1, observedAt: "2026-09-18T10:00:00.000Z", eventId: "event:e1", noteText: "在展台聊了合作" },
      { encounterId: "enc-2", contactId: C2, observedAt: "2026-09-19T10:00:00.000Z" },
    ],
    notes: [{ id: "note-1", contactIds: [C1, C2], title: "合作想法", body: "一起做活动", createdAt: "2026-09-21T00:00:00.000Z", eventIds: [] }],
    planLog: [
      { id: "log-1", event: "contact_established", kind: "auto", body: "系统文案", linkedContactIds: [C1], createdAt: "2026-09-22T00:00:00.000Z" },
      { id: "log-2", event: "note", kind: "manual", body: "约了下周再聊", linkedContactIds: [C1], createdAt: "2026-09-23T00:00:00.000Z" },
    ],
    schedule: [
      { id: "s-1", kind: "meeting", title: "咖啡", startsAt: "2026-09-25T01:00:00.000Z", state: "ended", contactIds: [C1] },
      { id: "s-2", kind: "meeting", title: "取消的会", startsAt: "2026-09-26T01:00:00.000Z", state: "cancelled", contactIds: [C1] },
      { id: "s-3", kind: "event", title: "SaaS Night", startsAt: "2026-09-17T09:00:00.000Z", state: "ended", contactId: C1, eventId: "event:e1" },
    ],
    tasks: [
      { taskId: "t-1", contactId: C1, status: "completed", title: "发方案", updatedAt: "2026-09-24T00:00:00.000Z" },
      { taskId: "t-2", contactId: C1, status: "open", title: "未完成", updatedAt: "2026-09-29T00:00:00.000Z" },
    ],
  };
}

test("七种来源各给出符合契约的条目，降序且同刻按 id", () => {
  const result = buildRelationshipTimeline(sources(), C1);
  assert.deepEqual(result.unavailableSources, []);
  const bySource = new Map<string, number>();
  for (const item of result.items) bySource.set(item.source, (bySource.get(item.source) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries([...bySource].sort()), {
    capture: 1, encounter: 1, followup_done: 1, memo: 2, note: 1, plan: 2, schedule: 2,
  });
  for (const source of RELATIONSHIP_TIMELINE_SOURCES) assert.ok(bySource.has(source), source);
  const times = result.items.map((item) => item.occurredAt);
  assert.deepEqual(times, [...times].sort().reverse());
  for (const item of result.items) {
    assert.equal(item.contactId, C1);
    assert.ok(item.id.startsWith(`${item.source}:`));
    assert.match(item.occurredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(item.title.zh && item.title.en);
    assert.ok(item.ref.store && item.ref.recordId);
  }
});

test("memo：用户选的日期为 day 精度（东京 00:00），带 eventId 与 ref 子 id；旧备注按创建时刻", () => {
  const memo = buildRelationshipTimeline(sources(), C1).items.filter((item) => item.source === "memo");
  const dated = memo.find((item) => item.ref.subId === "note:live-contact-detail-update:aaa");
  assert.ok(dated);
  assert.equal(dated.occurredAtPrecision, "day");
  assert.equal(dated.occurredAt, "2026-09-19T15:00:00.000Z");
  assert.equal(dated.eventId, "event:e1");
  assert.equal(dated.excerpt, "聊了 B 轮融资");
  assert.deepEqual(dated.ref, { store: "contact_detail_states", recordId: "contact-detail:actor%3Aalice:contact%3Ac1", subId: "note:live-contact-detail-update:aaa" });
  const legacy = memo.find((item) => item.ref.subId === "note:live-contact-detail-update:bbb");
  assert.equal(legacy?.occurredAtPrecision, "instant");
  assert.equal(legacy?.occurredAt, "2026-09-10T03:00:00.000Z");
});

test("encounter 投影 note:<encounterId> 不重复；schedule 排除 cancelled；未完成任务不进", () => {
  const items = buildRelationshipTimeline(sources(), C1).items;
  assert.equal(items.filter((item) => item.source === "encounter").length, 1);
  assert.ok(!items.some((item) => item.ref.subId === "note:enc-1"));
  assert.ok(!items.some((item) => item.id === "schedule:s-2"));
  assert.ok(!items.some((item) => item.id === "followup_done:t-2"));
  assert.equal(items.find((item) => item.id === "schedule:s-3")?.detail?.scheduleKind, "event");
  // 系统计划事件不带节选，手动计划记录带用户原文。
  assert.equal(items.find((item) => item.id === "plan:log-1")?.excerpt, undefined);
  assert.equal(items.find((item) => item.id === "plan:log-2")?.excerpt, "约了下周再聊");
  assert.deepEqual(items.find((item) => item.id === "plan:log-1")?.title, { zh: "计划：确认已建立联系", en: "Plan: connection confirmed" });
});

test("capture 每人恰好 1 条，按来源给出方式与活动", () => {
  const c1 = buildRelationshipTimeline(sources(), C1).items.filter((item) => item.source === "capture");
  assert.equal(c1.length, 1);
  assert.equal(c1[0].detail?.captureMethod, "business_card");
  assert.equal(c1[0].eventId, "event:e1");
  assert.deepEqual(c1[0].title, { zh: "在「Tokyo SaaS Night」认识", en: "Met at Tokyo SaaS Night" });
  const c2 = buildRelationshipTimeline(sources(), C2).items;
  assert.equal(c2.filter((item) => item.source === "capture").length, 1);
  assert.equal(c2.find((item) => item.source === "capture")?.detail?.captureMethod, "manual");
  assert.deepEqual(c2.map((item) => item.source).sort(), ["capture", "encounter", "note"]);
  assert.equal(captureMethodFor("event_import"), "event_exchange");
  assert.equal(captureMethodFor("qr_scan"), "qr");
  assert.equal(captureMethodFor("referral"), "other");
  assert.equal(buildRelationshipTimeline(sources(), "contact:unknown").items.length, 0);
});

test("unavailableSources 原样按固定顺序带出；节选截到 160 字", () => {
  const result = buildRelationshipTimeline({ ...sources(), unavailableSources: ["plan", "memo"] }, C1);
  assert.deepEqual(result.unavailableSources, ["memo", "plan"]);
  const long = "字".repeat(200);
  assert.equal(Array.from(timelineExcerpt(long) ?? "").length, 160);
  assert.equal(timelineExcerpt("  "), undefined);
});

test("mergeRelationshipTimelineItems 跨联系人按时间降序取前 N，同刻按 id", () => {
  const all = [
    ...buildRelationshipTimeline(sources(), C1).items,
    ...buildRelationshipTimeline(sources(), C2).items,
  ];
  const top = mergeRelationshipTimelineItems(all, 3);
  assert.equal(top.length, 3);
  assert.deepEqual(top.map((item) => item.id), ["schedule:s-1", "followup_done:t-1", "plan:log-2"]);
  const times = top.map((item) => item.occurredAt);
  assert.deepEqual(times, [...times].sort().reverse());
  const same = mergeRelationshipTimelineItems([
    { ...all[0], id: "memo:b", occurredAt: "2026-01-01T00:00:00.000Z" },
    { ...all[0], id: "memo:a", occurredAt: "2026-01-01T00:00:00.000Z" },
  ], 5);
  assert.deepEqual(same.map((item) => item.id), ["memo:a", "memo:b"]);
  assert.equal(mergeRelationshipTimelineItems(all, 0).length, 0);
});
