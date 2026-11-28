/**
 * 2026-11-28 第六期详情页登录后 500：overview 的非必需读取（联系人、计划评估、计划类型、关注、主办方历史、锁定名单计数）
 * 任一抛错都不让整页失败——各自回退为空并记一条 event_overview_read_degraded（含 read + error.name + message 前 200 字）。
 * 活动本体与我的报名状态读取失败仍按原样报错。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import type { JourneyEvent, JourneyLivePorts } from "../../features/events/journey/ports";
import { createJourneyService } from "../../features/events/journey/service";
import { eventOverviewResponseSchema } from "../../shared/api-schema/event-overview";

const EVENT: JourneyEvent = { agenda: [], badges: [], capacity: 30, description: null, emoji: "🥂", endsAt: "2026-12-01T21:30:00+09:00", eventId: "ev1", hostContact: null, organizerKey: "org_x", organizerName: "主催", priceYen: 3000, publicCode: "ABCD-EFGH", registrationClosesAt: null, registrationCount: 3, review: true, startsAt: "2026-12-01T19:00:00+09:00", title: "交流会", venue: "渋谷" };
const boom = async () => { throw new Error("relation \"x\" does not exist"); };

function ports(registered: boolean, overrides: Partial<JourneyLivePorts> = {}): JourneyLivePorts {
  return {
    catalogue: async () => [EVENT],
    contacts: async () => [{ history: [], id: "c1", linkedTypeKey: null, name: "山田 太郎", org: null, role: null }],
    event: async (id: string) => (id === EVENT.eventId ? EVENT : null),
    eventIdByCode: async () => null,
    judge: async () => ({ goal: null, hasPlan: false, results: {} }),
    myEvents: async () => (registered ? [{ eventId: "ev1", organizerKey: "org_x", status: "registered" }] : []),
    organizerStats: async () => null,
    planTypesFor: async () => ({}),
    publicAttendees: async () => ({ attendees: [{ attendeeId: "p1", name: "山田 太郎", note: null, org: "A社", role: "CEO", speaker: false }], total: 1 }),
    publicRosterCounts: async () => ({ known: 1, planFit: 0 }),
    registered: async () => registered,
    selfIntro: async () => null,
    ...overrides,
  } as unknown as JourneyLivePorts;
}

function service(p: JourneyLivePorts, followsFail = false) {
  const store = createMemoryActorRecordStore();
  const follows = createOrganizerFollowService({ store });
  return createJourneyService({ now: () => new Date("2026-11-20T10:00:00.000Z"), ports: p, records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: followsFail ? { ...follows, followed: boom } : follows, memos: createVenueMemoService({ store }) } });
}

async function capture<T>(fn: () => Promise<T>): Promise<{ value: T; logs: Array<Record<string, unknown>> }> {
  const original = console.warn;
  const logs: Array<Record<string, unknown>> = [];
  console.warn = (line: unknown) => { try { logs.push(JSON.parse(String(line))); } catch { /* not ours */ } };
  try { return { logs, value: await fn() }; } finally { console.warn = original; }
}

test("overview: each optional read failing degrades to empty, logs which read, and the page still renders", async () => {
  const cases: Array<[string, boolean, Partial<JourneyLivePorts>, boolean]> = [
    ["contacts", true, { contacts: boom }, false],
    ["judge", true, { judge: boom }, false],
    ["plan_types", true, { planTypesFor: boom }, false],
    ["organizer_stats", true, { organizerStats: boom }, false],
    ["follows", true, {}, true],
    ["locked_roster_counts", false, { publicRosterCounts: boom }, false],
  ];
  for (const [read, registered, overrides, followsFail] of cases) {
    const { logs, value } = await capture(() => service(ports(registered, overrides), followsFail).overview("actor:a", "ev1", "ja", "web"));
    assert.ok(value, read);
    eventOverviewResponseSchema.parse(value);
    assert.equal(value?.title, "交流会", read);
    const entry = logs.find((log) => log.event === "event_overview_read_degraded");
    assert.equal(entry?.read, read);
    assert.equal(entry?.error, "Error");
    assert.match(String(entry?.message), /does not exist/u);
  }
});

test("overview: degraded reads fall back to empty values, not zeros pretending to be facts", async () => {
  const { value } = await capture(() => service(ports(true, { contacts: boom, judge: boom })).overview("actor:a", "ev1", "ja", "web"));
  assert.equal(value?.attendeeCounts.known, 0);
  assert.deepEqual(value?.knownAttendees, []);
  assert.equal(value?.assessment, null);
  assert.equal(value?.registration.status, "registered");
  const locked = await capture(() => service(ports(false, { publicRosterCounts: boom })).overview("actor:a", "ev1", "ja", "web"));
  assert.equal(locked.value?.rosterLocked, true);
  assert.equal(locked.value?.attendeeCounts.all, 3);
});

test("overview: the event itself or my registration status failing still fails", async () => {
  await assert.rejects(() => service(ports(true, { event: boom })).overview("actor:a", "ev1", "ja", "web"));
  await assert.rejects(() => service(ports(true, { registered: boom })).overview("actor:a", "ev1", "ja", "web"));
  await assert.rejects(() => service(ports(true, { myEvents: boom })).overview("actor:a", "ev1", "ja", "web"));
});
