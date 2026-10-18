import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import type { MeetingProposalSheetProps } from "../src/screens/calendar/MeetingProposalSheet";
import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import type { OrbitLanguage } from "../src/api/contract/language";
import { renderToHtml, renderedText } from "./helpers/render";
import { createOrbitApiClient, type OrbitApiClient } from "../src/api/client";
import {
  loadRescheduleTarget,
  postRescheduleProposal,
  seedMeetingCandidates,
  validateMeetingCandidates,
} from "../src/screens/calendar/meeting-proposal-flow";

const originalLoad = (Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load;
const identity = { ready: true, signedIn: true, offline: false, actorId: "actor:one", accountId: "account:one" };
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function(request: string, ...rest: unknown[]) {
  if (request === "expo-crypto") return { randomUUID: () => "test-key" };
  if (request === "../../api/AuthSessionProvider") return { useOrbitAuthSession: () => identity };
  if (request === "../../api/ApiBaseUrlProvider") return { useOrbitApiBaseUrl: () => ({ ready: true, baseUrl: "https://orbit.example" }) };
  if (request === "../../hooks/useOrbitApiClient") return { useOrbitApiClient: () => ({ get: async () => ({ success: false, status: 503 }), post: async () => ({ success: false, status: 503 }) }) };
  if (request === "../../time/OrbitTimeZoneProvider") return { useOrbitTimeZone: () => ({ timeZone: "Asia/Tokyo", canSave: true, error: false }) };
  return originalLoad.call(this, request, ...rest);
};
const { MeetingProposalSheet } = createRequire(import.meta.url)("../src/screens/calendar/MeetingProposalSheet") as typeof import("../src/screens/calendar/MeetingProposalSheet");

function sheet(language: OrbitLanguage, props: Partial<MeetingProposalSheetProps> = {}) {
  const value: OrbitLocaleContextValue = {
    choice: language, deviceLanguage: language, error: null, language, preference: { mode: "system", language: null, updatedAt: null },
    retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator(language),
  };
  return createElement(OrbitLocaleContext.Provider, { value }, createElement(MeetingProposalSheet, { open: true, contactId: "c1", onClose() {}, ...props }));
}

for (const [language, expected] of [
  ["ja", ["面談の日程提案", "候補を選ぶ", "形式と場所", "送る前の確認"]],
  ["zh", ["提议会面时间", "选择候选时间", "形式与地点", "发送前确认"]],
  ["en", ["Propose meeting times", "Choose times", "Format and place", "Review before sending"]],
] as const) {
  test(`${language}: open meeting proposal keeps the three review steps in order`, () => {
    let sent = 0;
    const text = renderedText(sheet(language, { onSent: () => { sent++; } }));
    for (const label of expected) assert.ok(text.includes(label), `${label} is visible`);
    assert.ok(text.indexOf(expected[1]) < text.indexOf(expected[2]) && text.indexOf(expected[2]) < text.indexOf(expected[3]));
    assert.equal(sent, 0, "rendering never submits a proposal");
  });
}

test("closed meeting proposal renders no sheet", () => {
  assert.equal(renderToHtml(sheet("ja", { open: false })), "");
});

test("initial entry waits for server-verified bilateral authority before exposing candidates or send", () => {
  const html = renderToHtml(sheet("ja"));
  assert.match(html, /面談を読み込んでいます/u);
  assert.doesNotMatch(html, /この連絡先からはまだ面談を送れません/u);
  assert.doesNotMatch(html, /候補 1/u);
});

test("offline initial entry is read-only and does not claim authority was verified", () => {
  identity.offline = true;
  try {
    const html = renderToHtml(sheet("ja"));
    assert.match(html, /面談の提案には接続が必要です/u);
    assert.doesNotMatch(html, /候補 1/u);
  } finally { identity.offline = false; }
});

test("missing actor identity fails closed before loading either proposal mode", () => {
  identity.actorId = "";
  try {
    for (const props of [{}, { appointmentId: "appointment:one" }]) {
      const html = renderToHtml(sheet("ja", props));
      assert.match(html, /面談を確認できません/u);
      assert.doesNotMatch(html, /面談を読み込んでいます/u);
    }
  } finally { identity.actorId = "actor:one"; }
});

const monday = "2026-10-19T01:00:00.000Z";
const tuesday = "2026-10-20T01:00:00.000Z";
const wednesday = "2026-10-21T01:00:00.000Z";
const thursday = "2026-10-22T01:00:00.000Z";
const friday = "2026-10-23T01:00:00.000Z";
const slot = (startsAt: string) => ({ startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString() });
const candidates = [monday, tuesday, wednesday].map(slot);

test("missing presets produce three tentative weekday slots in the device zone", () => {
  assert.deepEqual(seedMeetingCandidates(undefined, Date.parse("2026-10-18T00:00:00Z"), "Asia/Tokyo"), candidates);
  assert.deepEqual(seedMeetingCandidates([slot(thursday), slot(friday), slot(monday), slot(tuesday), slot(wednesday)], Date.parse("2026-10-18T00:00:00Z"), "Asia/Tokyo"), [slot(thursday), slot(friday), slot(monday), slot(tuesday), slot(wednesday)]);
  assert.equal(seedMeetingCandidates([...candidates, slot(thursday), slot(friday), slot("2026-10-26T01:00:00Z")], Date.parse("2026-10-18T00:00:00Z"), "Asia/Tokyo").length, 6, "an extra supplied candidate must remain visible until the user removes it");
});

test("proposal rejects fewer than three, more than five, duplicate, overlapping, or mismatched candidate durations", () => {
  assert.equal(validateMeetingCandidates(candidates.slice(0, 2), Date.parse("2026-10-18T00:00:00Z")).error, "count");
  assert.equal(validateMeetingCandidates([...candidates, slot(thursday), slot(friday), slot("2026-10-26T01:00:00Z")], Date.parse("2026-10-18T00:00:00Z")).error, "count");
  assert.equal(validateMeetingCandidates([slot(monday), slot(monday), slot(wednesday)], Date.parse("2026-10-18T00:00:00Z")).error, "overlap");
  assert.equal(validateMeetingCandidates([slot(monday), slot("2026-10-19T01:15:00.000Z"), slot(wednesday)], Date.parse("2026-10-18T00:00:00Z")).error, "overlap");
  assert.equal(validateMeetingCandidates([slot(monday), { startsAt: tuesday, endsAt: "2026-10-20T02:00:00.000Z" }, slot(wednesday)], Date.parse("2026-10-18T00:00:00Z")).error, "duration");
  assert.deepEqual(validateMeetingCandidates(candidates, Date.parse("2026-10-18T00:00:00Z")), {
    candidateTimes: [{ startsAtUtc: monday }, { startsAtUtc: tuesday }, { startsAtUtc: wednesday }], durationMinutes: 30, error: null,
  });
});

const confirmed = {
  appointmentId: "appointment:one", contactId: "contact:one", eventId: "event:one", title: "Meeting", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null,
  confirmed: { durationMinutes: 30, medium: { kind: "in_person", location: "Tokyo" }, startsAtUtc: "2026-10-16T01:00:00.000Z", timezone: "Asia/Tokyo" },
  proposals: [{ createdAt: "2026-10-15T00:00:00.000Z", durationMinutes: 30, medium: { kind: "in_person", location: "Tokyo" }, note: "", proposedBy: "you", revision: 1, timezone: "Asia/Tokyo" }],
  status: "confirmed", updatedAt: "2026-10-15T00:00:00.000Z", version: 4, visibility: "participants",
} as const;
const receipt = { ...confirmed, status: "reschedule_pending", version: 5, pendingProposalRevision: 2, replayed: false,
  proposals: [...confirmed.proposals, { ...confirmed.proposals[0], revision: 2, candidateTimes: candidates.map((candidate, index) => ({ candidateId: `candidate:${index}`, startsAtUtc: candidate.startsAt })) }],
};

test("reschedule reads an actor-scoped confirmed appointment and rejects a different contact", async () => {
  const requests: string[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async (input) => {
    requests.push(String(input));
    return Response.json({ success: true, data: confirmed });
  } });
  assert.equal((await loadRescheduleTarget(client, "appointment:one", "contact:one"))?.version, 4);
  assert.equal(await loadRescheduleTarget(client, "appointment:one", "contact:other"), null);
  assert.deepEqual(requests, ["https://orbit.example/api/appointments/appointment%3Aone", "https://orbit.example/api/appointments/appointment%3Aone"]);
});

test("optional abort signal is omitted when absent and forwarded when provided", async () => {
  const options: unknown[] = [];
  const client = { get: async (_path: string, option: unknown) => { options.push(option); return { success: false }; } } as unknown as Pick<OrbitApiClient, "get">;
  const signal = new AbortController().signal;
  await loadRescheduleTarget(client, "appointment:one", "contact:one");
  await loadRescheduleTarget(client, "appointment:one", "contact:one", signal);
  assert.deepEqual(options[0], {});
  assert.deepEqual(options[1], { signal });
});

test("reschedule posts propose with CAS and an idempotency key, then independently reads the pending receipt", async () => {
  const requests: { url: string; method: string; body: unknown; key: string | null }[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, key: new Headers(init?.headers).get("idempotency-key") });
    return Response.json({ success: true, data: receipt });
  } });
  const result = await postRescheduleProposal(client, confirmed, candidates, { kind: "in_person", location: "Tokyo" }, "Asia/Tokyo", "ios:proposal:key-1", Date.parse("2026-10-18T00:00:00Z"));
  assert.deepEqual(result, { status: "sent", appointmentId: "appointment:one" });
  assert.deepEqual(requests, [{
    url: "https://orbit.example/api/appointments/appointment%3Aone/commands", method: "POST", key: "ios:proposal:key-1",
    body: { command: "propose", expectedVersion: 4, proposal: {
      candidateTimes: [{ startsAtUtc: monday }, { startsAtUtc: tuesday }, { startsAtUtc: wednesday }], durationMinutes: 30,
      medium: { kind: "in_person", location: "Tokyo" }, note: "", timezone: "Asia/Tokyo",
    } },
  }, { url: "https://orbit.example/api/appointments/appointment%3Aone", method: "GET", body: null, key: null }]);
});

test("reschedule keeps conflict and unverified success distinct from a confirmed send", async () => {
  const clientFor = (status: number, data: unknown) => createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async () => Response.json(
    status === 200 ? { success: true, data } : { success: false, error: { code: "CONFLICT", message: "Changed" } }, { status },
  ) });
  const args = [confirmed, candidates, { kind: "phone", phoneHint: null } as const, "Asia/Tokyo", "ios:proposal:key-1", Date.parse("2026-10-18T00:00:00Z")] as const;
  assert.deepEqual(await postRescheduleProposal(clientFor(409, null), ...args), { status: "conflict" });
  assert.deepEqual(await postRescheduleProposal(clientFor(200, { ...receipt, status: "confirmed" }), ...args), { status: "unconfirmed" });
});
