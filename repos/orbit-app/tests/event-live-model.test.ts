import assert from "node:assert/strict";
import test from "node:test";
import { readAttendeeWorkspace } from "../src/api/event-attendee-operations";
import {
  agendaItems,
  agendaStatuses,
  candidateTimesFrom,
  composeNoteText,
  currentPlacement,
  exchangeState,
  graphRing,
  liveEntryState,
  liveHref,
  liveTabFrom,
  otherAttendees,
  partyRedirectHref,
  recommendedPeople,
  scheduleDays,
  sharedTopics,
  slotStartsAtUtc
} from "../src/view-models/event-live";
import { attendeeFixture } from "./helpers/attendee-operations-fixtures";

const ws = (patch: (value: ReturnType<typeof attendeeFixture>) => void = () => {}) => {
  const raw = attendeeFixture(); patch(raw); return readAttendeeWorkspace(raw, "event_1");
};
const person = (participantId: string, displayName: string) => ({ participantId, displayName, company: "Co", role: "PM", industry: "Tech", topics: ["AI", "SaaS"], experienceHighlight: null, languages: [] as string[], needs: [] as string[], offers: [] as string[] });

test("tab param accepts the five App tabs, maps the web graph tab to agenda, rejects the rest", () => {
  for (const tab of ["home", "rec", "all", "group", "agenda"]) assert.equal(liveTabFrom(tab), tab);
  assert.equal(liveTabFrom("graph"), "agenda");
  assert.equal(liveTabFrom(["all", "rec"]), "all");
  assert.equal(liveTabFrom("attendees"), "home");
  assert.equal(liveTabFrom(undefined), "home");
});

test("live hrefs encode the event id and only carry real parameters", () => {
  assert.equal(liveHref("event:1/x"), "/events/event%3A1%2Fx/live");
  assert.equal(liveHref("e", { tab: "all" }), "/events/e/live?tab=all");
  assert.equal(liveHref("e", { tab: "all", participant: "p 1" }), "/events/e/live?tab=all&participant=p+1");
  assert.equal(liveHref("e", { tab: "home" }), "/events/e/live");
});

test("legacy party links resolve to the event live page, otherwise to the catalogue", () => {
  assert.equal(partyRedirectHref({ eventId: "event_1" }, "overview"), "/events/event_1/live");
  assert.equal(partyRedirectHref({ code: ["SMALL", "OTHER"] }, "checkin"), "/events/SMALL/live");
  assert.equal(partyRedirectHref({ eventId: " e2 " }, "graph"), "/events/e2/live?tab=agenda");
  assert.equal(partyRedirectHref({}, "overview"), "/events");
  assert.equal(partyRedirectHref({ eventId: "  " }, "graph"), "/events");
});

test("agenda is only the three configured schedule instants, with done/now/soon/later from the clock", () => {
  const workspace = ws();
  const items = agendaItems(workspace);
  assert.deepEqual(items.map(item => [item.key, item.at]), [
    ["checkIn", "2026-09-17T00:00:00Z"], ["roundOne", "2026-09-17T01:00:00Z"], ["roundTwo", "2026-09-17T02:00:00Z"]
  ]);
  assert.deepEqual(agendaStatuses(items, Date.parse("2026-09-16T23:00:00Z")), ["soon", "later", "later"]);
  assert.deepEqual(agendaStatuses(items, Date.parse("2026-09-17T01:30:00Z")), ["done", "now", "soon"]);
  assert.deepEqual(agendaStatuses(items, Date.parse("2026-09-17T03:00:00Z")), ["done", "done", "now"]);
});

test("current placement follows round two only after it starts, and hides a table without complete rationales", () => {
  const before = currentPlacement(ws(w => { w.roundTwoTable.tableNumber = 7; }), Date.parse("2026-09-17T01:30:00Z"));
  assert.deepEqual(before && { round: before.round, table: before.table.tableNumber, seat: before.seat, size: before.members.length + 1 }, { round: 1, table: 1, seat: "A1", size: 2 });
  const after = currentPlacement(ws(w => { w.roundTwoTable.tableNumber = 7; }), Date.parse("2026-09-17T02:30:00Z"));
  assert.equal(after?.round, 2); assert.equal(after?.table.tableNumber, 7);
  const incomplete = ws(w => { w.roundOneTable.memberRationales = { p_me: "Mine" } as never; w.roundTwoTable.memberRationales = { p_me: "Mine" } as never; });
  assert.equal(currentPlacement(incomplete, Date.parse("2026-09-17T02:30:00Z")), null);
  assert.equal(currentPlacement(ws(w => { w.resultsState = "locked"; w.recommendations = null as never; w.roundOneTable = null as never; w.roundTwoTable = null as never; }), Date.now()), null);
});

test("exchange state is derived from the workspace request for that pair only", () => {
  const request = (status: string, requester = "p_me", target = "p_other", contactId: string | null = null) => ({ contactId, requestId: "r1", revision: 2, requesterParticipantId: requester, targetParticipantId: target, status, withdrawnAt: status === "withdrawn" ? "2026-09-17T01:00:00Z" : null });
  assert.equal(exchangeState(ws(), "p_other").kind, "none");
  assert.equal(exchangeState(ws(w => { w.contactRequests = [request("awaiting_target_consent")]; }), "p_other").kind, "outgoing");
  assert.equal(exchangeState(ws(w => { w.contactRequests = [request("awaiting_target_consent", "p_other", "p_me")]; }), "p_other").kind, "incoming");
  const accepted = exchangeState(ws(w => { w.contactRequests = [request("accepted", "p_other", "p_me", "contact_9")]; }), "p_other");
  assert.equal(accepted.kind, "accepted"); assert.equal(accepted.contactId, "contact_9"); assert.equal(accepted.requestId, "r1");
  assert.equal(exchangeState(ws(w => { w.contactRequests = [request("withdrawn")]; }), "p_other").kind, "withdrawn_outgoing");
  assert.equal(exchangeState(ws(w => { w.contactRequests = [request("withdrawn", "p_other", "p_me")]; }), "p_other").kind, "withdrawn_incoming");
  assert.equal(exchangeState(ws(w => { w.contactRequests = [request("declined")]; }), "p_other").kind, "declined");
  assert.equal(exchangeState(ws(), "p_me").kind, "self");
});

test("recommendations keep server order and data; the directory excludes me and searches name/company/role/topics", () => {
  const workspace = ws(w => { w.directory.push(person("p_third", "佐藤真理")); });
  assert.deepEqual(recommendedPeople(workspace).map(r => [r.person.participantId, r.score, r.reasons]), [["p_other", 90, ["Shared AI interests"]]]);
  assert.deepEqual(recommendedPeople(ws(w => { w.resultsState = "processing"; w.recommendations = null as never; w.roundOneTable = null as never; w.roundTwoTable = null as never; })), []);
  assert.deepEqual(otherAttendees(workspace, "").map(p => p.participantId), ["p_other", "p_third"]);
  assert.deepEqual(otherAttendees(workspace, "佐藤").map(p => p.participantId), ["p_third"]);
  assert.deepEqual(otherAttendees(workspace, "saas").map(p => p.participantId), ["p_third"]);
  assert.deepEqual(otherAttendees(workspace, "nobody").map(p => p.participantId), []);
});

test("graph ring puts accepted exchanges first as known, then recommendations, never me, and caps the ring", () => {
  const workspace = ws(w => {
    for (let i = 0; i < 12; i++) w.directory.push(person(`p_${i}`, `Person ${i}`));
    w.recommendations.recommendations.push(...Array.from({ length: 10 }, (_, i) => ({ targetParticipantId: `p_${i}`, score: 50, reasons: [], icebreakers: [], memberHint: "" })));
    w.contactRequests = [{ contactId: "c", requestId: "r", revision: 3, requesterParticipantId: "p_me", targetParticipantId: "p_5", status: "accepted", withdrawnAt: null }];
  });
  const ring = graphRing(workspace, 8);
  assert.equal(ring.nodes.length, 8);
  assert.deepEqual(ring.nodes.slice(0, 2).map(n => [n.participantId, n.kind]), [["p_5", "known"], ["p_other", "recommended"]]);
  assert.equal(ring.nodes.some(n => n.participantId === "p_me"), false);
  assert.equal(new Set(ring.nodes.map(n => n.participantId)).size, 8);
  assert.equal(ring.knownCount, 1); assert.equal(ring.recommendedCount, 10);
  for (const node of ring.nodes) assert.ok(Math.abs(Math.hypot(node.x - ring.center.x, node.y - ring.center.y) - ring.radius) < 0.01);
});

test("shared topics compare case-insensitively without duplicates", () => {
  assert.deepEqual(sharedTopics(["AI", "saas", "AI"], ["ai", "SaaS", "Web3"]), ["AI", "saas"]);
});

test("detail entry: registered only; pinned on the event day; hidden after the event ends", () => {
  const base = { startsAt: "2026-09-27T10:00:00Z", endsAt: "2026-09-27T12:30:00Z", timeZone: "Asia/Tokyo" };
  assert.equal(liveEntryState({ ...base, eligibilityState: "open", now: Date.parse("2026-09-27T11:00:00Z") }), null);
  assert.equal(liveEntryState({ ...base, eligibilityState: undefined, now: Date.parse("2026-09-27T11:00:00Z") }), null);
  assert.deepEqual(liveEntryState({ ...base, eligibilityState: "registered", now: Date.parse("2026-09-20T11:00:00Z") }), { pinned: false, inProgress: false });
  assert.deepEqual(liveEntryState({ ...base, eligibilityState: "registered", now: Date.parse("2026-09-27T01:00:00Z") }), { pinned: true, inProgress: false });
  assert.deepEqual(liveEntryState({ ...base, eligibilityState: "registered", now: Date.parse("2026-09-27T11:00:00Z") }), { pinned: true, inProgress: true });
  assert.equal(liveEntryState({ ...base, eligibilityState: "registered", now: Date.parse("2026-09-27T13:00:00Z") }), null);
  // Tokyo calendar day, not UTC: 2026-09-26T16:00Z is already 27th 01:00 JST.
  assert.equal(liveEntryState({ ...base, eligibilityState: "registered", now: Date.parse("2026-09-26T16:00:00Z") })?.pinned, true);
});

test("appointment slots are real JST days and RFC3339 UTC instants, sorted; notes merge labelled parts", () => {
  const days = scheduleDays(Date.parse("2026-09-27T16:00:00Z"), "zh");
  assert.deepEqual(days.map(d => d.iso), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  assert.equal(slotStartsAtUtc("2026-09-28", "10:00 - 10:30"), "2026-09-28T01:00:00.000Z");
  assert.deepEqual(candidateTimesFrom(["2026-09-29 10:00 - 10:30", "2026-09-28 14:00 - 14:30"]).map(c => c.startsAtUtc), ["2026-09-28T05:00:00.000Z", "2026-09-29T01:00:00.000Z"]);
  assert.equal(composeNoteText({ what: " 聊了产品 ", need: "找渠道", offer: "" }, { need: "对方需求", offer: "我能提供" }), "聊了产品\n对方需求：找渠道");
});
