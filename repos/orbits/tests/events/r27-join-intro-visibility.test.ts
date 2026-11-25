/**
 * 2026-11-26 用户定：报名时确认的自我介绍显示给这场活动的其他参会者（参会者详情「自己紹介（参加用プロフィール）」）。
 * 可见范围 = 现有 event_attendees 判定：看的人与被看的人都必须是这场活动的有效报名（rsvped）；主办方的参会者详情不走这里。
 * 一次查询带出介绍（不多一次往返）；改了即时反映，取消即消失；没写介绍 = 缺位（intro null）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { EventRegistration } from "../../features/events/registration/contract";
import { VENUE_RECORD_EVENT_ID, venueRecordPorts } from "../../features/events/design-fixtures/venue-record";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { readAttendeeOwner } from "../../features/events/journey/live";
import { attendeeProfileFromRegistration } from "../../features/events/journey/live-mapping";
import { createJourneyService } from "../../features/events/journey/service";
import { createJoinService, type JoinPorts } from "../../features/events/journey/join";
import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";

type Status = "rsvped" | "cancelled" | "pending_review" | "rejected";
/** A tiny stand-in for the two tables the owner query reads (membership heads + orbit_records eventJoinIntros). */
function world() {
  const heads = new Map<string, { actorId: string; status: Status }>();
  const intros = new Map<string, string>();
  const sql: string[] = [];
  const query = async (text: string, values: readonly unknown[] = []) => {
    sql.push(text);
    const [, eventId, participantId] = values as string[];
    const head = heads.get(participantId!);
    // The SQL filters status = 'rsvped'; the stand-in does the same.
    if (!head || head.status !== "rsvped" || eventId !== VENUE_RECORD_EVENT_ID) return { rows: [] };
    return { rows: [{ actor_id: head.actorId, join_intro: intros.get(head.actorId) ?? null }] };
  };
  return { heads, intros, query, sql };
}

const response = (field: string, displayText: string) => ({ answer: { customText: null, displayText, selectedOptionIds: [] }, answerSource: "participant", answeredAt: "2026-11-01T00:00:00.000Z", field, generation: null, question: null, questionId: null, questionSource: "ai_adaptive", visibility: field === "targetAttendees" || field === "desiredOutcome" ? "matching_only" : "event_attendees" });
const registration = (participantId: string, status: string = "rsvped") => ({ cancelledAt: null, eventId: VENUE_RECORD_EVENT_ID, id: `r-${participantId}`, participantProfile: { answers: {}, createdAt: "", displayName: "王 磊", eventId: VENUE_RECORD_EVENT_ID, id: participantId, interviewResponses: [response("positioning", "パートナー @ 華東キャピタル"), response("experienceHighlight", "越境投資"), response("valueOffered", "LP の紹介")], updatedAt: "", userId: "u-wang" }, participantProfileId: participantId, reactivatedAt: null, registeredAt: "2026-11-01T00:00:00.000Z", status }) as unknown as EventRegistration;

function serviceFor(w: ReturnType<typeof world>, viewerRegistered: (actorId: string) => boolean) {
  const store = createMemoryActorRecordStore();
  return createJourneyService({
    now: () => new Date("2026-11-26T00:00:00.000Z"),
    ports: {
      ...venueRecordPorts(),
      attendeeProfile: async (eventId, attendeeId) => {
        const owner = await readAttendeeOwner(w.query, "ws", eventId, attendeeId);
        return owner ? attendeeProfileFromRegistration(registration(attendeeId), owner.intro) : null;
      },
      registered: async (actorId) => viewerRegistered(actorId),
    },
    records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) },
  });
}

test("one query reads the registrant and their confirmed self-introduction (rsvped only, this event's record)", async () => {
  const w = world();
  w.heads.set("pp-wang", { actorId: "u-wang", status: "rsvped" });
  w.intros.set("u-wang", "上海の VC で日本のスタートアップに投資しています。");
  assert.deepEqual(await readAttendeeOwner(w.query, "ws", VENUE_RECORD_EVENT_ID, "pp-wang"), { actorId: "u-wang", intro: "上海の VC で日本のスタートアップに投資しています。" });
  assert.equal(w.sql.length, 1, "no extra round trip for the intro");
  assert.match(w.sql[0]!, /h\.status = 'rsvped'/);
  assert.match(w.sql[0]!, /collection_name = 'eventJoinIntros'/);
  assert.match(w.sql[0]!, /payload ->> 'eventId' = h\.event_id/, "only the intro written for this event");
  assert.match(w.sql[0]!, /lifecycle_state <> 'deleted'/);
});

test("who sees it: attendees see each other's intro; the host's (unregistered) view, outsiders, cancelled / in-review / rejected viewers do not", async () => {
  const w = world();
  w.heads.set("pp-wang", { actorId: "u-wang", status: "rsvped" });
  w.intros.set("u-wang", "上海の VC です。");
  const registeredViewers = new Set(["actor:attendee"]);
  const service = serviceFor(w, (actorId) => registeredViewers.has(actorId));
  assert.equal((await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-wang"))?.intro, "上海の VC です。");
  for (const viewer of ["actor:host", "actor:outsider", "actor:cancelled", "actor:in-review", "actor:rejected"]) {
    assert.equal(await service.attendeeProfile(viewer, VENUE_RECORD_EVENT_ID, "pp-wang"), null, viewer);
  }
});

test("whose is shown: a cancelled, in-review or rejected registrant's intro is not shown to anyone", async () => {
  const w = world();
  const service = serviceFor(w, () => true);
  for (const status of ["cancelled", "pending_review", "rejected"] as const) {
    w.heads.set("pp-x", { actorId: "u-x", status });
    w.intros.set("u-x", "見えてはいけない紹介");
    assert.equal(await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-x"), null, status);
  }
  assert.equal(attendeeProfileFromRegistration(registration("pp-x", "cancelled"), "x"), null);
});

test("edits show at once; cancelling hides it; no intro → no intro line (the topic stays a Q&A row)", async () => {
  const w = world();
  w.heads.set("pp-wang", { actorId: "u-wang", status: "rsvped" });
  const service = serviceFor(w, () => true);
  const none = await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-wang");
  assert.equal(none?.intro, null, "an old registration without an intro shows no intro (not the topic)");
  assert.ok(none?.answers.some((item) => item.a === "越境投資"), "the topic is still shown, as a Q&A row");
  assert.ok(!none?.answers.some((item) => item.a.includes("華東キャピタル")), "company stays under the name");
  w.intros.set("u-wang", "   ");
  assert.equal((await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-wang"))?.intro, null, "blank = none");
  w.intros.set("u-wang", "最初の紹介");
  assert.equal((await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-wang"))?.intro, "最初の紹介");
  w.intros.set("u-wang", "書き直した紹介");
  assert.equal((await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-wang"))?.intro, "書き直した紹介");
  w.heads.set("pp-wang", { actorId: "u-wang", status: "cancelled" });
  assert.equal(await service.attendeeProfile("actor:attendee", VENUE_RECORD_EVENT_ID, "pp-wang"), null);
});

test("the confirmed intro is kept with the registration (a re-registration overwrites it)", async () => {
  const saved: string[] = [];
  const ports = { cancel: async () => undefined, createSchedule: async () => "s", event: async () => ({ endsAt: null, registrationClosesAt: null, review: false, startsAt: "2026-12-07T10:00:00.000Z", title: "T" }), next: async () => null, persona: async () => null, profileIntro: async () => null, readTentative: async () => null, registrationStatus: async () => "none" as const, removeSchedule: async () => undefined, renameSchedule: async () => undefined, saveIntro: async (_a: string, _e: string, text: string) => { saved.push(text); }, saveTentative: async () => undefined, submit: async () => ({ status: "registered" as const, submittedAt: "x" }) } satisfies JoinPorts;
  const service = createJoinService({ ports });
  await service.submit("u", "ev", [], "zh", "AI 草稿原样");
  await service.submit("u", "ev", [], "zh", "改过的介绍");
  assert.deepEqual(saved, ["AI 草稿原样", "改过的介绍"]);
});

test("the visibility line names networking style and follow-up too (three languages)", async () => {
  const { registrationFieldVisibility } = await import("../../features/events/registration/interview-question-token.server");
  assert.equal(registrationFieldVisibility("energyStyle"), "event_attendees");
  assert.equal(registrationFieldVisibility("followUpPreference"), "event_attendees");
  assert.match(eventsJourneyCopy.visAllFields.zh, /交流方式 · 会后联系方式$/);
  assert.match(eventsJourneyCopy.visAllFields.ja, /交流スタイル · 会後の連絡方法$/);
  assert.match(eventsJourneyCopy.visAllFields.en, /networking style · follow-up$/);
});
