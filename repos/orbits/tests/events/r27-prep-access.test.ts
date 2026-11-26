/**
 * 2026-11-26：会う準備只给已确定参加的人。审核中 / 没报名的人不再看到「找不到这个活动」：服务端给原因，页面按原因说明；
 * 审核中的人不再有「去做见面准备」入口；名单的门槛对审核中的人也说「审核通过后」。规则不放宽。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createJourneyService, JourneyRefusedError } from "../../features/events/journey/service";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { VENUE_RECORD_EVENT_ID, venueRecordPorts } from "../../features/events/design-fixtures/venue-record";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";

function service(status: "registered" | "pending_review" | "waitlisted" | "cancelled" | null) {
  const store = createMemoryActorRecordStore();
  const base = venueRecordPorts();
  return createJourneyService({
    now: () => new Date("2026-10-01T00:00:00.000Z"),
    ports: { ...base, myEvents: async () => (status ? [{ eventId: VENUE_RECORD_EVENT_ID, status }] : []) as never, registered: async () => status === "registered" },
    records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) },
  });
}

test("prep: confirmed attendees get it; in review / waitlisted and not registered are refused with their own reason; an unknown event stays not found", async () => {
  assert.ok(await service("registered").prep("actor:me", VENUE_RECORD_EVENT_ID, "ja"));
  for (const [status, reason] of [["pending_review", "PREP_PENDING_REVIEW"], ["waitlisted", "PREP_PENDING_REVIEW"], ["cancelled", "PREP_NOT_REGISTERED"], [null, "PREP_NOT_REGISTERED"]] as const) {
    await assert.rejects(service(status).prep("actor:me", VENUE_RECORD_EVENT_ID, "ja"), (error: unknown) => error instanceof JourneyRefusedError && error.reason === reason, String(status));
  }
  assert.equal(await service(null).prep("actor:me", "no-such-event", "ja"), null);
});

test("prep route: 403 with the reason (not 404); 404 only for an event that is not there", async () => {
  const routes = (status: "pending_review" | null) => createEventJourneyRoutes({ liveService: async () => service(status), resolveActor: async () => ({ id: "actor:me" }) as never, resolveMode: () => "live" });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const get = new Request("http://localhost/api/events/x/prep");
  const pending = await routes("pending_review").prep(get, params(VENUE_RECORD_EVENT_ID));
  assert.equal(pending.status, 403);
  assert.equal((await pending.json()).error.context.reason, "PREP_PENDING_REVIEW");
  assert.equal((await (await routes(null).prep(get, params(VENUE_RECORD_EVENT_ID))).json()).error.context.reason, "PREP_NOT_REGISTERED");
  assert.equal((await routes(null).prep(get, params("no-such-event"))).status, 404);
});

test("pages: no prep entry for people in review; the prep page and the roster gate say why; copy in three languages", () => {
  const detail = readFileSync("app/(app)/app/orbit-2026/events/EventDetail.tsx", "utf8");
  assert.equal((detail.match(/\/prep/g) ?? []).length, 3);
  assert.doesNotMatch(detail, /"pending_review" \? (<Link|\{ href: `\/app\/events\/\$\{id\}\/prep`)/);
  const prep = readFileSync("app/(app)/app/orbit-2026/events/PrepPage.tsx", "utf8");
  assert.match(prep, /PREP_PENDING_REVIEW" \? "pending"/);
  assert.match(prep, /PREP_NOT_REGISTERED" \? "unregistered"/);
  assert.match(prep, /<RetryCard/);
  const people = readFileSync("app/(app)/app/orbit-2026/events/EventPeople.tsx", "utf8");
  assert.match(people, /"railGatePending"/);
  for (const key of ["prepPending", "prepUnregistered", "railGatePending"] as const) for (const language of ["ja", "zh", "en"] as const) assert.ok(eventsJourneyCopy[key][language]);
});
