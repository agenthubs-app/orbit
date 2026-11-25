// 2026-11-20 会場の記録 / 参加者の詳細 / 活动图片（后端）。示例活动走真实 service（features/events/design-fixtures/venue-record.ts）。
import assert from "node:assert/strict";
import test from "node:test";

import { eventAttendeeProfileSchema } from "../../shared/api-schema/event-attendee-profile";
import { eventAfterResponseSchema } from "../../shared/api-schema/event-after";
import { eventOverviewResponseSchema } from "../../shared/api-schema/event-overview";
import { eventVenueResponseSchema } from "../../shared/api-schema/event-venue";
import { myEventsResponseSchema } from "../../shared/api-schema/events-mine";
import { eventCoverUrlFromPayload, normalizeEventCoverUrl } from "../../shared/compute/event-cover";
import { eventExchangeOpen, eventExchangeUntil } from "../../shared/compute/event-exchange-window";
import { VENUE_RECORD_COVER, VENUE_RECORD_EVENT_ID, venueRecordPorts, venueRecordService, venueRecordWorkspace } from "../../features/events/design-fixtures/venue-record";
import { EVENT_DESIGN_FIXTURES, DESIGN_FIXTURE_NOW } from "../../features/events/design-fixtures";
import { buildDiscover } from "../../features/events/journey/discover-core";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { attendeeProfileFromRegistration, journeyEventFromCanonical } from "../../features/events/journey/live-mapping";
import { buildVenue, venueRecordFrom } from "../../features/events/journey/venue-core";
import { createMyEventsService } from "../../features/events/mine/service";
import { eventDiscoverQueryObject } from "../../shared/api-schema/event-discover";
import type { EventRegistration } from "../../features/events/registration/contract";
import { createMemoryActorRecordStore } from "../../features/events/actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../../features/events/journey/attendee-records";
import { createJourneyService } from "../../features/events/journey/service";

const NOW = new Date(DESIGN_FIXTURE_NOW);
const actor = (id: string) => async () => ({ id }) as never;
const get = (path = "/x") => new Request(`http://localhost${path}`);
const params = (values: Record<string, string>) => ({ params: Promise.resolve(values) });
const routes = (service = venueRecordService()) => createEventJourneyRoutes({ liveService: async () => service, resolveActor: actor("actor:me"), resolveMode: () => "live" });

// ── 会場の記録（buildVenue）───────────────────────────────────────────────

test("venue record: ended + workspace → readOnly, checkedIn, both rounds with table / theme / why / tablemates / agenda title", () => {
  const venue = buildVenue({ agenda: [{ at: "19:30", title: "R1 · 自己紹介" }, { at: "20:15", title: "R2 · テーマ別トーク" }], event: { endsAt: "2026-10-03T21:30:00+09:00", eventId: "e", startsAt: "2026-10-03T19:00:00+09:00", title: "t" }, myContacts: [], now: NOW, registered: true, wantedParticipantIds: new Set(), workspace: venueRecordWorkspace() });
  assert.equal(venue.state, "ended");
  assert.equal(venue.readOnly, true);
  assert.equal(venue.checkedIn, true);
  assert.deepEqual(venue.rounds?.map((round) => [round.round, round.table, round.theme, round.title]), [[1, "A-1", "日中の資金調達", "R1 · 自己紹介"], [2, "C-2", "製造業 DX", "R2 · テーマ別トーク"]]);
  assert.match(venue.rounds![0]!.why ?? "", /シード/u);
  assert.match(venue.rounds![0]!.whyDetail ?? "", /投資側 3 名/u);
  assert.deepEqual(venue.rounds![0]!.tablemates.map((mate) => mate.attendeeId), ["vr-wang", "vr-liu", "vr-suzuki"]);
  assert.ok(venue.rounds!.every((round) => round.tablemates.every((mate) => mate.attendeeId !== "vr-me")), "never lists me as my own tablemate");
  // readOnly：已交换的人仍留在推荐名单里（回看「当天推荐了谁」）。
  assert.deepEqual(venue.recommendations.map((person) => [person.attendeeId, person.exchange]), [["vr-wang", "exchanged"], ["vr-chen", "exchanged"], ["vr-liu", "incoming"]]);
  assert.ok(eventVenueResponseSchema.safeParse(venue).success);
});

test("venue record: roundTables lists, per round, the tables I was not at with their members (never me); only after the end", () => {
  const input = { agenda: [], event: { endsAt: "2026-10-03T21:30:00+09:00", eventId: "e", startsAt: "2026-10-03T19:00:00+09:00", title: "t" }, myContacts: [], registered: true, wantedParticipantIds: new Set<string>(), workspace: venueRecordWorkspace() };
  const ended = buildVenue({ ...input, now: NOW });
  assert.ok(ended.roundTables && ended.roundTables.length > 0);
  for (const round of ended.roundTables!) {
    const mine = ended.rounds?.find((item) => item.round === round.round)?.table.charAt(0);
    assert.ok(round.tables.every((table) => table.table !== mine), "my own table is not repeated");
    assert.ok(round.tables.every((table) => table.members.every((member) => member.attendeeId !== "vr-me")));
  }
  assert.ok(eventVenueResponseSchema.safeParse(ended).success);
  const during = buildVenue({ ...input, now: new Date("2026-10-03T20:00:00+09:00") });
  assert.equal(during.roundTables, undefined, "live venue keeps the old groups only");
});

test("venue record: during the event the exchanged are still filtered out of recommendations and readOnly is false", () => {
  const venue = buildVenue({ agenda: [], event: { endsAt: "2026-10-03T21:30:00+09:00", eventId: "e", startsAt: "2026-10-03T19:00:00+09:00", title: "t" }, myContacts: [], now: new Date("2026-10-03T11:20:00.000Z"), registered: true, wantedParticipantIds: new Set(), workspace: venueRecordWorkspace() });
  assert.equal(venue.state, "checked_in");
  assert.equal(venue.readOnly, false);
  assert.deepEqual(venue.recommendations.map((person) => person.attendeeId), ["vr-liu"]);
  assert.equal(venue.rounds?.length, 2, "rounds are returned during the event too");
  assert.equal(venue.rounds![0]!.title, null, "no agenda → no round title");
});

test("venue record: a round I was not seated in is left out; no workspace after the end → readOnly, not checked in, no rounds", () => {
  const ws = venueRecordWorkspace();
  const venue = buildVenue({ agenda: [], event: { endsAt: null, eventId: "e", startsAt: "2026-10-03T19:00:00+09:00", title: "t" }, myContacts: [], now: NOW, registered: true, wantedParticipantIds: new Set(), workspace: { ...ws, roundTwoTable: null } });
  assert.deepEqual(venue.rounds?.map((round) => round.round), [1]);
  const empty = buildVenue({ agenda: [], event: { endsAt: "2026-10-03T21:30:00+09:00", eventId: "e", startsAt: "2026-10-03T19:00:00+09:00", title: "t" }, myContacts: [], now: NOW, registered: true, wantedParticipantIds: new Set(), workspace: null });
  assert.deepEqual([empty.state, empty.readOnly, empty.checkedIn, empty.rounds], ["ended", true, false, []]);
});

test("venueRecordFrom: distinct tablemates across rounds, recommended, accepted exchanges, check-in; nothing to show → null", () => {
  assert.deepEqual(venueRecordFrom(venueRecordWorkspace()), { checkedIn: true, exchanged: 2, recommended: 3, tablemates: 5 });
  const ws = venueRecordWorkspace();
  assert.equal(venueRecordFrom({ ...ws, recommendations: null, roundOneTable: null, roundTwoTable: null }), null);
  assert.equal(venueRecordFrom({ ...ws, checkIn: null })?.checkedIn, false);
});

// ── overview：coverUrl + venueRecord ─────────────────────────────────────

test("overview: ended + attended + workspace → coverUrl and venueRecord; before the end the workspace is not read", async () => {
  const body = await (await routes().overview(get(), params({ id: VENUE_RECORD_EVENT_ID }))).json();
  assert.equal(body.data.coverUrl, VENUE_RECORD_COVER);
  assert.deepEqual(body.data.venueRecord, { checkedIn: true, exchanged: 2, recommended: 3, tablemates: 5 });
  assert.ok(eventOverviewResponseSchema.safeParse(body.data).success);

  let reads = 0;
  const ports = venueRecordPorts();
  const early = createJourneyService({ now: () => new Date("2026-10-03T10:30:00.000Z"), ports: { ...ports, venueWorkspace: async (...args) => { reads += 1; return ports.venueWorkspace(...args); } }, records: venueRecordRecords() });
  const live = await early.overview("actor:me", VENUE_RECORD_EVENT_ID, "ja");
  assert.equal(live?.venueRecord, undefined);
  assert.equal(reads, 0, "the workspace is only read for an ended event I registered for");
  const signedOut = await early.overview(null, VENUE_RECORD_EVENT_ID, "ja");
  assert.equal(signedOut?.coverUrl, VENUE_RECORD_COVER, "the cover is public");
  assert.equal(signedOut?.venueRecord, undefined);
});

test("overview: not registered → no venueRecord and no workspace read", async () => {
  let reads = 0;
  const ports = venueRecordPorts();
  const service = createJourneyService({ now: () => NOW, ports: { ...ports, myEvents: async () => [], registered: async () => false, venueWorkspace: async () => { reads += 1; return null; } }, records: venueRecordRecords() });
  const view = await service.overview("actor:other", VENUE_RECORD_EVENT_ID, "ja");
  assert.equal(view?.venueRecord, undefined);
  assert.equal(reads, 0);
});

// ── 参加者の詳細 ─────────────────────────────────────────────────────────

test("attendee profile: fields, shared rounds, recommendation, exchange (same rule as 会場), memo, 30-day window", async () => {
  const service = venueRecordService();
  await service.saveVenueMemo("actor:me", VENUE_RECORD_EVENT_ID, "vr-liu", "年内に出資 3 社");
  const res = await routes(service).attendeeProfile(get(), params({ attendeeId: "vr-liu", id: VENUE_RECORD_EVENT_ID }));
  assert.equal(res.status, 200);
  const profile = (await res.json()).data;
  assert.ok(eventAttendeeProfileSchema.safeParse(profile).success);
  assert.equal(profile.attendeeId, "vr-liu");
  assert.equal(profile.participantId, "vr-liu");
  assert.equal(profile.name, "劉 洋");
  // 2026-11-26: the confirmed self-introduction is the intro; the topic is the first Q&A row.
  assert.equal(profile.intro, "個人でエンジェル投資をしています。シード期の B2B SaaS の方とお話しできればうれしいです。");
  assert.equal(profile.answers.length, 4);
  assert.deepEqual(profile.answers[0], { a: "B2B SaaS へのエンジェル投資 12 件", q: "話せるトピック" });
  assert.equal((await venueRecordService().attendeeProfile("actor:me", VENUE_RECORD_EVENT_ID, "vr-tanaka"))?.intro, null, "no intro written → no intro line");
  assert.deepEqual(profile.together.sharedRounds, [{ round: 1, table: "A-1" }, { round: 2, table: "C-2" }]);
  assert.equal(profile.together.recommended, true);
  assert.equal(profile.exchange, "incoming");
  assert.equal(profile.requestId, "vr-req-liu");
  assert.equal(profile.requestRevision, 1);
  assert.equal(profile.memo, "年内に出資 3 社");
  assert.equal(profile.canRequestExchange, false, "a pending request blocks a new one");
  assert.equal(profile.exchangeUntil, "2026-11-02T12:30:00.000Z");
  assert.equal(profile.email, undefined);

  const venue = await service.venue("actor:me", VENUE_RECORD_EVENT_ID);
  const fromVenue = venue!.attendees.find((person) => person.attendeeId === "vr-liu")!;
  assert.deepEqual([fromVenue.exchange, fromVenue.requestId, fromVenue.requestRevision], [profile.exchange, profile.requestId, profile.requestRevision], "same exchange rule as 会場");

  const wang = await service.attendeeProfile("actor:me", VENUE_RECORD_EVENT_ID, "vr-wang");
  assert.deepEqual([wang?.exchange, wang?.contactId, wang?.canRequestExchange], ["exchanged", "design-contact-wang", false]);
  const tanaka = await service.attendeeProfile("actor:me", VENUE_RECORD_EVENT_ID, "vr-tanaka");
  assert.deepEqual([tanaka?.exchange, tanaka?.canRequestExchange, tanaka?.together.sharedRounds.length, tanaka?.together.recommended], ["none", true, 0, false]);
  const suzuki = await service.attendeeProfile("actor:me", VENUE_RECORD_EVENT_ID, "vr-suzuki");
  assert.equal(suzuki?.contactId, "design-contact-suzuki", "already my contact by name (known) → contactId");
});

test("attendee profile: after 30 days no new request; before the end exchangeUntil is null", async () => {
  const late = venueRecordService(() => new Date("2026-11-03T00:00:00.000Z"));
  const profile = await late.attendeeProfile("actor:me", VENUE_RECORD_EVENT_ID, "vr-tanaka");
  assert.deepEqual([profile?.canRequestExchange, profile?.exchangeUntil], [false, "2026-11-02T12:30:00.000Z"]);
  const during = venueRecordService(() => new Date("2026-10-03T11:00:00.000Z"));
  const live = await during.attendeeProfile("actor:me", VENUE_RECORD_EVENT_ID, "vr-tanaka");
  assert.deepEqual([live?.canRequestExchange, live?.exchangeUntil], [true, null]);
});

test("attendee profile: 404 for non-registrants, private profiles, unknown ids and unknown events (same answer)", async () => {
  const ports = venueRecordPorts();
  const outsider = createJourneyService({ now: () => NOW, ports: { ...ports, registered: async () => false }, records: venueRecordRecords() });
  const outsiderRoutes = createEventJourneyRoutes({ liveService: async () => outsider, resolveActor: actor("actor:x"), resolveMode: () => "live" });
  const cases = [
    await outsiderRoutes.attendeeProfile(get(), params({ attendeeId: "vr-wang", id: VENUE_RECORD_EVENT_ID })),
    await routes().attendeeProfile(get(), params({ attendeeId: "vr-zhao", id: VENUE_RECORD_EVENT_ID })),
    await routes().attendeeProfile(get(), params({ attendeeId: "nobody", id: VENUE_RECORD_EVENT_ID })),
    await routes().attendeeProfile(get(), params({ attendeeId: "vr-wang", id: "other-event" })),
  ];
  for (const res of cases) {
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "NOT_FOUND");
  }
  const anonymous = createEventJourneyRoutes({ liveService: async () => venueRecordService(), resolveActor: async () => null, resolveMode: () => "live" });
  assert.equal((await anonymous.attendeeProfile(get(), params({ attendeeId: "vr-wang", id: VENUE_RECORD_EVENT_ID }))).status, 401);
});

test("attendee profile mapping: only attendee-visible answers, ≤ 6, no positioning duplicate; none visible → null; intro only from the registration's self-introduction", () => {
  const response = (field: string, visibility: string, displayText: string, prompt: string | null = null) => ({ answer: { customText: null, displayText, selectedOptionIds: [] }, answerSource: "participant", answeredAt: "2026-10-01T00:00:00.000Z", field, generation: null, question: prompt ? { fieldLabel: { en: "", zh: "" }, inputKind: "single_choice_with_custom", language: "zh", options: [], prompt } : null, questionId: null, questionSource: "legacy_unknown", visibility });
  const registration = (responses: unknown[]) => ({ cancelledAt: null, eventId: "e", id: "r1", participantProfile: { answers: {}, createdAt: "", displayName: "王 磊", eventId: "e", id: "pp1", interviewResponses: responses, updatedAt: "", userId: "u1" }, participantProfileId: "pp1", reactivatedAt: null, registeredAt: "2026-09-01T00:00:00.000Z", status: "rsvped" }) as unknown as EventRegistration;
  const profile = attendeeProfileFromRegistration(registration([
    response("positioning", "event_attendees", "パートナー @ 華東キャピタル"),
    response("experienceHighlight", "event_attendees", "クロスボーダー投資"),
    response("targetAttendees", "event_attendees", "製造業 DX", "どんな人に会いたい？"),
    response("valueOffered", "matching_only", "非公開の回答"),
    ...Array.from({ length: 8 }, (_, index) => response("desiredOutcome", "public", `目的 ${index}`)),
  ]));
  assert.ok(profile);
  assert.equal(profile.attendeeId, "pp1");
  // 2026-11-26: intro = the self-introduction confirmed at registration (none → no intro); the topic is a Q&A row.
  assert.deepEqual([profile.name, profile.org, profile.role, profile.intro], ["王 磊", "華東キャピタル", "パートナー", null]);
  assert.equal(profile.answers.length, 6);
  assert.deepEqual(profile.answers[0], { a: "クロスボーダー投資", field: "experienceHighlight", q: "話せるトピック" });
  assert.deepEqual(profile.answers[1], { a: "製造業 DX", field: "targetAttendees", q: "どんな人に会いたい？" });
  assert.equal(profile.answers[2]!.q, "参加の目的");
  assert.ok(!profile.answers.some((item) => item.a === "非公開の回答"));
  assert.equal(attendeeProfileFromRegistration(registration([response("valueOffered", "matching_only", "x")])), null);
});

// ── 会後 met.people ─────────────────────────────────────────────────────

test("after: met.people has the same attendeeIds as nextSteps", async () => {
  const body = await (await routes().after(get(), params({ id: VENUE_RECORD_EVENT_ID }))).json();
  assert.ok(eventAfterResponseSchema.safeParse(body.data).success);
  assert.deepEqual(body.data.met.people, [{ attendeeId: "vr-wang", initial: "王", name: "王 磊", org: "華東キャピタル" }, { attendeeId: "vr-chen", initial: "陳", name: "陳 浩", org: "深圳ハードウェア" }]);
  assert.deepEqual(body.data.met.people.map((person: { attendeeId: string }) => person.attendeeId), body.data.nextSteps.map((step: { attendeeId: string }) => step.attendeeId));
});

// ── 活动图片（coverUrl）───────────────────────────────────────────────────

test("coverUrl: https or site path only; coverUrl wins over the seeded coverPath", () => {
  assert.equal(normalizeEventCoverUrl("https://abc.public.blob.vercel-storage.com/x.webp"), "https://abc.public.blob.vercel-storage.com/x.webp");
  assert.equal(normalizeEventCoverUrl("/orbit-covers/a.jpg"), "/orbit-covers/a.jpg");
  for (const bad of ["http://x.test/a.jpg", "//evil.test/a.jpg", "javascript:alert(1)", "data:image/png;base64,AA", "a.jpg", "", "/a b.jpg", 42, null]) assert.equal(normalizeEventCoverUrl(bad), null, String(bad));
  assert.equal(eventCoverUrlFromPayload({ coverPath: "/old.jpg", coverUrl: "https://cdn.test/new.webp" }), "https://cdn.test/new.webp");
  assert.equal(eventCoverUrlFromPayload({ coverPath: "/old.jpg", coverUrl: "http://insecure.test/x" }), "/old.jpg");
  assert.equal(eventCoverUrlFromPayload({}), null);
  const event = journeyEventFromCanonical({ description: null, endsAt: null, eventId: "e", organizerActorId: "a", publicCode: "X", sourcePayload: { coverPath: "/orbit-covers/chip.jpg" }, startsAt: "2026-10-01T00:00:00.000Z", title: "t", venue: null }, { policy: null, registrationCount: 0 });
  assert.equal(event.coverUrl, "/orbit-covers/chip.jpg");
});

test("coverUrl: 探す rows and 参加予定 items carry it (absent when there is no image)", async () => {
  const query = eventDiscoverQueryObject.parse({});
  const discover = buildDiscover({ attendedOrganizers: new Set(), candidates: [{ coverUrl: "/c.jpg", emoji: "🥂", eventId: "a", startsAt: "2026-10-20T10:00:00.000Z", title: "A" }, { emoji: "🥂", eventId: "b", startsAt: "2026-10-21T10:00:00.000Z", title: "B" }], feedback: [], followedOrganizers: new Set(), hasPlan: false, myEventIds: new Set(), now: NOW, query, signedIn: false });
  const rows = [...discover.all];
  assert.equal(rows.find((row) => row.eventId === "a")?.coverUrl, "/c.jpg");
  assert.equal("coverUrl" in rows.find((row) => row.eventId === "b")!, false);

  const fixture = EVENT_DESIGN_FIXTURES["venue-record"]!(NOW);
  const mine = await createMyEventsService({ now: () => NOW, reader: { rows: async () => [...fixture.mine, { coverUrl: "http://bad.test/x.jpg", endsAt: null, eventId: "bad", startsAt: "2026-09-30T10:00:00.000Z", status: "attended", title: "x", venue: null }] } }).list("actor:me", { limit: 20, platform: "web", range: "past" });
  assert.ok(myEventsResponseSchema.safeParse(mine).success);
  assert.equal(mine.items.find((item) => item.eventId === VENUE_RECORD_EVENT_ID)?.coverUrl, VENUE_RECORD_COVER);
  assert.equal("coverUrl" in mine.items.find((item) => item.eventId === "bad")!, false);
});

test("exchange window: 30 days after the end, open before", () => {
  assert.equal(eventExchangeUntil("2026-10-03T21:30:00+09:00"), "2026-11-02T12:30:00.000Z");
  assert.equal(eventExchangeOpen("2026-10-03T21:30:00+09:00", new Date("2026-11-02T12:30:00.000Z")), true);
  assert.equal(eventExchangeOpen("2026-10-03T21:30:00+09:00", new Date("2026-11-02T12:30:00.001Z")), false);
  assert.equal(eventExchangeOpen(null, NOW), true);
});

function venueRecordRecords() {
  const store = createMemoryActorRecordStore();
  return { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) };
}

test("attendee profile reads the id from ?attendeeId= so ids that contain % are not decoded twice (2026-11-21)", async () => {
  const odd = "event-participant-profile:e:party-app%3Aprofile%3Aabc";
  const seen: string[] = [];
  const base = venueRecordService();
  const spy = { ...base, attendeeProfile: async (actorId: string, eventId: string, attendeeId: string) => { seen.push(attendeeId); return base.attendeeProfile(actorId, eventId, "vr-liu"); } };
  const url = `http://x/api/events/${VENUE_RECORD_EVENT_ID}/attendees/profile?attendeeId=${encodeURIComponent(odd)}`;
  const res = await routes(spy).attendeeProfile(new Request(url), params({ attendeeId: "profile", id: VENUE_RECORD_EVENT_ID }));
  assert.equal(res.status, 200);
  assert.deepEqual(seen, [odd]);
});

test("venue ?view=record (2026-11-21): the ended read-only record drops live-only fields and per-person details; live venues are unchanged", async () => {
  const { venueRecordView } = await import("../../features/events/journey/venue-core");
  const service = venueRecordService();
  const full = await service.venue("actor:me", VENUE_RECORD_EVENT_ID);
  assert.ok(full && full.readOnly);
  const slim = venueRecordView(full!);
  for (const key of ["checkIn", "round", "seats", "mySeat", "nextRound", "groups", "mutualHint", "agendaTip", "meetingSlots"] as const) assert.equal(key in slim, false, key);
  assert.deepEqual(slim.openers, []);
  assert.deepEqual(slim.rounds, full!.rounds);
  assert.deepEqual(slim.roundTables, full!.roundTables);
  assert.equal(slim.attendees.length, full!.attendees.length);
  assert.ok(slim.attendees.every((p) => !("memo" in p) && !("whyDetail" in p)));
  assert.ok(JSON.stringify(slim).length < JSON.stringify(full).length);
  const { eventVenueResponseSchema } = await import("../../shared/api-schema/event-venue");
  assert.equal(eventVenueResponseSchema.safeParse(JSON.parse(JSON.stringify(slim))).success, true);
  const res = await routes(service).venue(get(`/api/events/${VENUE_RECORD_EVENT_ID}/venue?view=record`), params({ id: VENUE_RECORD_EVENT_ID }));
  const body = await res.json() as { data: Record<string, unknown> };
  assert.equal("mySeat" in body.data, false);
  const live = { ...full!, readOnly: false };
  assert.equal(venueRecordView(live), live);
});
