/**
 * 主催者の連絡先 × イベント詳細 / 参加登録（2026-11-14）：服务端按查看者的报名状态决定给不给——
 * 审核中 / 确定 / 候补 / 已签到给；未报名、被拒、已取消、未登录不给（字段都不出现）。报名提交成功的结果里带上。
 * mock 示例世界同一规则。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { createJoinService } from "../../features/events/journey/join";
import { createJoinMockPorts } from "../../features/events/journey/join-mock";
import { hostContactFromPayload, journeyEventFromCanonical } from "../../features/events/journey/live-mapping";
import { setJourneyMockState } from "../../features/events/journey/mock";
import type { JourneyEvent, JourneyLivePorts, MyEventStatus } from "../../features/events/journey/ports";
import { createJourneyService } from "../../features/events/journey/service";
import { eventOverviewResponseSchema } from "../../shared/api-schema/event-overview";
import { JOURNEY_EVENT_ID, JOURNEY_HOST_CONTACT } from "../../shared/mock/demo-world/events-journey";

const CONTACT = { lineId: "line_id", note: "WeChat にお名前を送ってください", wechatId: "wx-id" };
const EVENT: JourneyEvent = { agenda: [], badges: [], capacity: 30, description: null, emoji: "🥂", endsAt: "2026-12-01T21:30:00+09:00", eventId: "ev1", hostContact: CONTACT, organizerKey: "org_x", organizerName: "主催", priceYen: 3000, publicCode: "ABCD-EFGH", registrationClosesAt: null, registrationCount: 3, review: true, startsAt: "2026-12-01T19:00:00+09:00", title: "交流会", venue: "渋谷" };

function ports(registered: boolean, myStatus: MyEventStatus | null, event: JourneyEvent = EVENT): JourneyLivePorts {
  return {
    catalogue: async () => [event],
    contacts: async () => [],
    event: async (id) => (id === event.eventId ? event : null),
    eventIdByCode: async () => null,
    judge: async () => ({ goal: null, hasPlan: false, results: {} }),
    myEvents: async () => (myStatus ? [{ eventId: event.eventId, organizerKey: "org_x", status: myStatus }] : []),
    organizerStats: async () => null,
    planTypesFor: async () => ({}),
    publicAttendees: async () => ({ attendees: [], total: 3 }),
    registered: async () => registered,
    selfIntro: async () => null,
  } as unknown as JourneyLivePorts;
}

function service(p: JourneyLivePorts) {
  const store = createMemoryActorRecordStore();
  return createJourneyService({ now: () => new Date("2026-11-20T10:00:00.000Z"), ports: p, records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) } });
}

test("overview: only people registered for this event get the organizer's contact", async () => {
  const cases: Array<[string, boolean, MyEventStatus | null, boolean]> = [
    ["confirmed", true, "registered", true],
    ["checked in", true, "attended", true],
    ["in review", false, "pending_review", true],
    ["waitlisted", false, "waitlisted", true],
    ["not registered", false, null, false],
    ["only planned (仮)", false, "planned", false],
    ["rejected", false, "rejected", false],
    ["cancelled", false, "cancelled", false],
  ];
  for (const [name, registered, status, sees] of cases) {
    const data = await service(ports(registered, status)).overview("actor:a", "ev1", "ja", "web");
    assert.equal("hostContact" in (data ?? {}), sees, name);
    if (sees) assert.deepEqual(data?.hostContact, CONTACT, name);
  }
  const anonymous = await service(ports(true, "registered")).overview(null, "ev1", "ja", "web");
  assert.equal(anonymous?.signedOut, true);
  assert.equal("hostContact" in (anonymous ?? {}), false, "signed out (public page): never");
});

test("overview: registered but the organizer left nothing → null (the card says 「まだありません」)", async () => {
  const data = await service(ports(true, "registered", { ...EVENT, hostContact: null })).overview("actor:a", "ev1", "ja", "web");
  assert.equal(data?.hostContact, null);
  assert.equal(eventOverviewResponseSchema.parse(data).hostContact, null);
});

test("overview route: the response schema keeps the contact; other events' lists never carry it", async () => {
  const p = ports(true, "registered");
  const routes = createEventJourneyRoutes({ liveService: async () => service(p), resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "live" });
  const overview = (await (await routes.overview(new Request("http://localhost/api/events/ev1/overview"), { params: Promise.resolve({ id: "ev1" }) })).json()).data;
  assert.deepEqual(eventOverviewResponseSchema.parse(overview).hostContact, CONTACT);
  const discover = await (await routes.discover(new Request("http://localhost/api/events/discover"))).text();
  assert.doesNotMatch(discover, /wx-id|line_id/u, "探す does not leak it");
  const search = await (await routes.search(new Request("http://localhost/api/events/search?q=%E4%BA%A4%E6%B5%81"))).text();
  assert.doesNotMatch(search, /wx-id|line_id/u, "検索 does not leak it");
});

test("live mapping: source_payload.host.contact → JourneyEvent.hostContact (bad data reads as nothing)", () => {
  assert.deepEqual(hostContactFromPayload({ host: { contact: { lineId: " line_id ", wechatId: "wx-id", note: CONTACT.note } } }), CONTACT);
  assert.equal(hostContactFromPayload({ host: { contact: "wx" } }), null);
  assert.equal(hostContactFromPayload({ contact: CONTACT }), null, "only the host's own setting counts");
  assert.equal(hostContactFromPayload({}), null);
  const mapped = journeyEventFromCanonical({ description: null, endsAt: EVENT.endsAt, eventId: "ev1", organizerActorId: "actor:host", publicCode: "ABCD-EFGH", sourcePayload: { host: { contact: CONTACT, feeKind: "free" } }, startsAt: EVENT.startsAt, title: "交流会", venue: null }, { policy: null, registrationCount: 0 });
  assert.deepEqual(mapped.hostContact, CONTACT);
});

test("join submit: the result carries the contact (the done page pops it up when there is an ID)", async () => {
  const base = createJoinMockPorts();
  const answers = [{ answer: "CFO", field: "positioning", prompt: "立場", questionToken: "t1" }];
  const withContact = await createJoinService({ ports: { ...base, event: async () => ({ endsAt: null, hostContact: CONTACT, registrationClosesAt: null, review: true, startsAt: EVENT.startsAt, title: "交流会" }) } }).submit("actor:a", "ev1", answers, "ja");
  assert.deepEqual(withContact?.hostContact, CONTACT);
  const without = await createJoinService({ ports: { ...base, event: async () => ({ endsAt: null, registrationClosesAt: null, review: true, startsAt: EVENT.startsAt, title: "交流会" }) } }).submit("actor:a", "ev1", answers, "ja");
  assert.equal(without?.hostContact, null);
  const sample = await createJoinService({ ports: base }).submit("actor:a", JOURNEY_EVENT_ID, answers, "ja");
  assert.deepEqual(sample?.hostContact, JOURNEY_HOST_CONTACT);
});

test("mock world: the sample overview follows the same rule", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const get = async () => (await (await routes.overview(new Request(`http://localhost/api/events/${JOURNEY_EVENT_ID}/overview`), { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) })).json()).data;
  setJourneyMockState({ registration: "none" });
  assert.equal((await get()).hostContact, undefined);
  setJourneyMockState({ registration: "pending_review" });
  assert.deepEqual((await get()).hostContact, JOURNEY_HOST_CONTACT);
  setJourneyMockState(null);
  const signedOut = createEventJourneyRoutes({ resolveActor: async () => null, resolveMode: () => "mock" });
  const anon = (await (await signedOut.overview(new Request("http://localhost/x"), { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) })).json()).data;
  assert.equal(anon.hostContact, undefined);
});
