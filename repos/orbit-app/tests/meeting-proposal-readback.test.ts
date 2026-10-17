import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import * as flow from "../src/screens/calendar/meeting-proposal-flow";

const now = Date.parse("2026-10-18T00:00:00Z"), at = "2026-10-18T00:00:00.000Z";
const medium = { kind: "in_person", location: "Tokyo" } as const;
const candidates = [19, 20, 21].map(day => ({ startsAt: `2026-10-${day}T01:00:00.000Z`, endsAt: `2026-10-${day}T01:30:00.000Z` }));
const proposed = (revision: number) => ({ createdAt: at, durationMinutes: 30, medium, note: "", proposedBy: "you", revision, timezone: "Asia/Tokyo", candidateTimes: candidates.map((row, index) => ({ candidateId: `candidate:${revision}:${index}`, startsAtUtc: row.startsAt })) });
const originalProposal = { ...proposed(1), candidateTimes: [15, 16, 17].map((day, index) => ({ candidateId: `candidate:1:${index}`, startsAtUtc: `2026-10-${day}T01:00:00.000Z` })) };
const confirmed = {
  appointmentId: "appointment:one", contactId: "contact:one", eventId: "accepted-event", title: "Meeting", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null,
  confirmed: { candidateId: "candidate:1:1", proposalRevision: 1, durationMinutes: 30, medium, startsAtUtc: "2026-10-16T01:00:00.000Z", timezone: "Asia/Tokyo" },
  proposals: [originalProposal], pendingProposalRevision: null, status: "confirmed", updatedAt: at, version: 4, visibility: "participants",
} as const;
const pending = { ...confirmed, proposals: [...confirmed.proposals, proposed(2)], pendingProposalRevision: 2, status: "reschedule_pending", version: 5, replayed: false };
const initial = { ...confirmed, confirmed: null, proposals: [proposed(1)], pendingProposalRevision: 1, status: "awaiting_response", version: 2, replayed: false };
const args = [candidates, medium, "Asia/Tokyo", "ios:proposal:test", now] as const;

function clientFor(receipt: unknown, readback: unknown = receipt) {
  const calls: { path: string; method: string; body: any; key: string | null; signal: AbortSignal | null | undefined }[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.fixture.test", conditionalCache: new Map(), fetchImpl: async (url, init) => {
    calls.push({ path: new URL(String(url)).pathname, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, key: new Headers(init?.headers).get("idempotency-key"), signal: init?.signal });
    return Response.json({ success: true, data: init?.method === "POST" ? receipt : readback });
  } });
  return { client, calls };
}

test("reschedule success requires an independent GET with the same complete proposal and confirmed slot", async () => {
  const { client, calls } = clientFor(pending), signal = new AbortController().signal;
  assert.deepEqual(await flow.postRescheduleProposal(client, confirmed, ...args, signal), { status: "sent", appointmentId: confirmed.appointmentId });
  assert.deepEqual(calls.map(row => [row.method, row.path]), [["POST", "/api/appointments/appointment%3Aone/commands"], ["GET", "/api/appointments/appointment%3Aone"]]);
  assert.ok(calls.every(row => row.signal === signal));
  assert.equal(calls[0]!.key, "ios:proposal:test");
});

test("reschedule rejects candidate, medium, duration, pending revision and original-slot tampering before success", async () => {
  const mutations = [
    { ...pending, proposals: [...confirmed.proposals, { ...proposed(2), candidateTimes: proposed(2).candidateTimes.slice(0, 2) }] },
    { ...pending, proposals: [...confirmed.proposals, { ...proposed(2), medium: { kind: "phone", phoneHint: null } }] },
    { ...pending, proposals: [...confirmed.proposals, { ...proposed(2), durationMinutes: 60 }] },
    { ...pending, pendingProposalRevision: 99 },
    { ...pending, confirmed: { ...confirmed.confirmed, durationMinutes: 60 } },
  ];
  for (const receipt of mutations) {
    const { client } = clientFor(receipt);
    assert.deepEqual(await flow.postRescheduleProposal(client, confirmed, ...args), { status: "unconfirmed" });
  }
  const { client } = clientFor(pending, { ...pending, version: 99 });
  assert.deepEqual(await flow.postRescheduleProposal(client, confirmed, ...args), { status: "unconfirmed" });
});

test("scope abort suppresses late reschedule receipt and never starts a readback in the old account", async () => {
  const controller = new AbortController(); let gets = 0;
  const client = createOrbitApiClient({ baseUrl: "https://orbit.fixture.test", fetchImpl: async (_url, init) => {
    if (init?.method === "GET") gets++;
    controller.abort();
    return Response.json({ success: true, data: pending });
  } });
  assert.deepEqual(await flow.postRescheduleProposal(client, confirmed, ...args, controller.signal), { status: "failed" });
  assert.equal(gets, 0);
});

test("accepted authority availability validates exact contact identity; owned contact alone never implies consent", async () => {
  assert.equal(typeof flow.loadInitialProposalAvailability, "function");
  for (const [data, expected] of [[{ contactId: "contact:one", available: true }, true], [{ contactId: "contact:one", available: false }, false], [{ contactId: "other", available: true }, null]] as const) {
    const { client, calls } = clientFor(null, data);
    assert.equal(await flow.loadInitialProposalAvailability(client, "contact:one"), expected);
    assert.equal(calls[0]?.path, "/api/appointments/initial-proposal");
    assert.ok(calls.every(row => row.method === "GET"));
  }
});

test("first proposal sends only contact and proposal, checks exact receipt, then independently reads it", async () => {
  assert.equal(typeof flow.postInitialProposal, "function");
  const { client, calls } = clientFor(initial), signal = new AbortController().signal;
  assert.deepEqual(await flow.postInitialProposal(client, "contact:one", ...args, signal), { status: "sent", appointmentId: "appointment:one" });
  assert.deepEqual(calls.map(row => [row.method, row.path]), [["POST", "/api/appointments/initial-proposal"], ["GET", "/api/appointments/appointment%3Aone"]]);
  assert.deepEqual(Object.keys(calls[0]!.body).sort(), ["contactId", "proposal"]);
  assert.deepEqual(calls[0]!.body.proposal.candidateTimes, candidates.map(row => ({ startsAtUtc: row.startsAt })));
  assert.ok(calls.every(row => row.signal === signal));
});

test("first proposal cannot acknowledge mismatched contact/candidates, changed GET, or a revoked scope", async () => {
  assert.equal(typeof flow.postInitialProposal, "function");
  for (const receipt of [{ ...initial, contactId: "other" }, { ...initial, proposals: [{ ...proposed(1), candidateTimes: proposed(1).candidateTimes.slice(0, 2) }] }]) {
    const { client } = clientFor(receipt);
    assert.deepEqual(await flow.postInitialProposal(client, "contact:one", ...args), { status: "unconfirmed" });
  }
  const changed = clientFor(initial, { ...initial, version: 99 });
  assert.deepEqual(await flow.postInitialProposal(changed.client, "contact:one", ...args), { status: "unconfirmed" });
  const controller = new AbortController(); let gets = 0;
  const client = createOrbitApiClient({ baseUrl: "https://orbit.fixture.test", fetchImpl: async (_url, init) => {
    if (init?.method === "GET") gets++;
    controller.abort(); return Response.json({ success: true, data: initial });
  } });
  assert.deepEqual(await flow.postInitialProposal(client, "contact:one", ...args, controller.signal), { status: "failed" });
  assert.equal(gets, 0);
});
