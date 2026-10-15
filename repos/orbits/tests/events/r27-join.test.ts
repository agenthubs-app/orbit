/**
 * R27 SC-R27-06 参加登録 facade：≤5 问、多选 / 上限按字段、カバー率规则（30 + 14×4）、只在 draft 时调 persona、
 * 审核制活动 409 → 审核申请、仮予定确认后才写 + 结果出来后改名 / 删除、示例模式不写库；公開範囲按字段（服务端策略）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { eventJoinProfileSchema, eventJoinStepSchema } from "../../shared/api-schema/event-join";
import { JOURNEY_EVENT_ID } from "../../shared/mock/demo-world/events-journey";
import { registrationFieldVisibility } from "../../features/events/registration/interview-question-token.server";
import { createEventJourneyRoutes } from "../../features/events/journey/handlers";
import { createJoinService, profileFromAnswers, questionShape, tentativeTitle, type JoinPorts } from "../../features/events/journey/join";

const answer = (field: string, value: string, n: number) => ({ answer: value, field, prompt: `q${n}`, questionToken: `t${n}` });
const post = (body: unknown) => new Request("http://localhost/x", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
const params = { params: Promise.resolve({ id: JOURNEY_EVENT_ID }) };

test("questions: 会いたい人 is multi-select, 話したいテーマ at most 2, the rest single; never more than 5", async () => {
  assert.deepEqual([questionShape("targetAttendees", "ja").multi, questionShape("experienceHighlight", "ja").max, questionShape("desiredOutcome", "ja").multi], [true, 2, false]);
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const first = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: [] }), params)).json()).data);
  assert.deepEqual([first.index, first.total, first.question?.field], [1, 5, "desiredOutcome"]);
  const five = ["desiredOutcome", "experienceHighlight", "targetAttendees", "valueOffered", "followUpPreference"].map((field, n) => answer(field, "x", n));
  const done = eventJoinStepSchema.parse((await (await routes.joinNext(post({ answers: five }), params)).json()).data);
  assert.deepEqual([done.done, done.question ?? null], [true, null]);
  assert.equal((await routes.joinNext(post({ answers: [...five, answer("industry", "x", 6)] }), params)).status, 400, "a sixth answer is rejected");
});

test("profile coverage is a rule (company 30 + 14 each) and the AI persona only runs for the draft", async () => {
  const three = [answer("desiredOutcome", "資金調達", 1), answer("experienceHighlight", "シリーズAの資本政策 · CFO 採用", 2)];
  const profile = profileFromAnswers(three, { review: true });
  assert.equal(profile.coverage, 58);
  assert.deepEqual(profile.topics, ["シリーズAの資本政策", "CFO 採用"]);
  assert.equal(profileFromAnswers([...three, answer("targetAttendees", "VC・CVC", 3)], { review: true }).coverage, 72);
  let personaCalls = 0;
  const ports = fakePorts({ persona: async () => { personaCalls += 1; return { selfIntroDraft: "製造業向け SaaS の代表です。資本政策の話を伺いたいです。", tags: [] }; } });
  const service = createJoinService({ ports });
  await service.profile("actor:a", "ev", three, false, "ja");
  assert.equal(personaCalls, 0);
  const draft = eventJoinProfileSchema.parse(await service.profile("actor:a", "ev", three, true, "ja"));
  assert.equal(personaCalls, 1);
  assert.equal(draft.selfIntro?.source, "ai_draft");
});

test("submit: a screened event (409) becomes a review application; the tentative entry is written only on confirm and renamed / removed when the result arrives", async () => {
  const calls: string[] = [];
  let status: "pending_review" | "registered" | "rejected" = "pending_review";
  const store = new Map<string, { scheduleItemId: string; final: boolean }>();
  const service = createJoinService({ ports: fakePorts({
    createSchedule: async (_actor, input) => { calls.push(`create:${input.title}`); return "sch1"; },
    readTentative: async (actor, event) => store.get(`${actor}:${event}`) ?? null,
    registrationStatus: async () => status,
    removeSchedule: async () => { calls.push("remove"); },
    renameSchedule: async (_actor, _id, title) => { calls.push(`rename:${title}`); },
    saveTentative: async (actor, event, record) => { store.set(`${actor}:${event}`, record); },
    submit: async () => ({ status: "pending_review", submittedAt: "2026-09-20T05:32:00.000Z" }),
  }) });
  const result = await service.submit("ev", [answer("targetAttendees", "VC", 1)], "ja");
  assert.equal(result?.status, "pending_review");
  assert.equal(result?.tentative?.title, "仮：CFO Night");
  assert.deepEqual(calls, [], "nothing is written to the calendar before the user confirms");
  await service.tentative("actor:a", "ev", "k1", "ja");
  await service.tentative("actor:a", "ev", "k2", "ja");
  assert.deepEqual(calls, ["create:仮：CFO Night"], "one tentative entry, idempotent");
  status = "registered";
  await service.syncTentative("actor:a", "ev", "ja");
  await service.syncTentative("actor:a", "ev", "ja");
  assert.deepEqual(calls.slice(1), ["rename:CFO Night"], "renamed once when admitted");
  assert.equal(tentativeTitle("CFO Night Tokyo vol.18", "en"), "Tentative: CFO Night");
});

test("sample mode: submit answers without writing; signed-out callers are refused in live", async () => {
  const routes = createEventJourneyRoutes({ resolveActor: async () => ({ id: "actor:a" }) as never, resolveMode: () => "mock" });
  const res = await routes.joinSubmit(post({ answers: [answer("targetAttendees", "VC・CVC", 1)], idempotencyKey: "k" }), params);
  assert.equal((await res.json()).data.status, "pending_review");
  const live = createEventJourneyRoutes({ liveJoin: async () => null, liveService: async () => null, resolveActor: async () => null, resolveMode: () => "live" });
  assert.equal((await live.joinSubmit(post({ answers: [answer("targetAttendees", "VC", 1)], idempotencyKey: "k" }), params)).status, 401);
});

test("公開範囲 is a per-field server policy: 参加目的 / 会いたい人 organizer-only, the rest shared with attendees", () => {
  assert.equal(registrationFieldVisibility("desiredOutcome"), "matching_only");
  assert.equal(registrationFieldVisibility("targetAttendees"), "matching_only");
  assert.equal(registrationFieldVisibility("valueOffered"), "event_attendees");
  assert.equal(registrationFieldVisibility("positioning"), "event_attendees");
});

function fakePorts(overrides: Partial<JoinPorts> = {}): JoinPorts {
  return {
    createSchedule: async () => "sch",
    event: async () => ({ endsAt: "2026-10-07T12:30:00.000Z", registrationClosesAt: "2026-10-03T14:59:00.000Z", review: true, startsAt: "2026-10-07T10:00:00.000Z", title: "CFO Night Tokyo vol.18" }),
    next: async () => null,
    persona: async () => null,
    profileIntro: async () => null,
    readTentative: async () => null,
    registrationStatus: async () => "none",
    removeSchedule: async () => undefined,
    renameSchedule: async () => undefined,
    saveTentative: async () => undefined,
    submit: async () => ({ status: "registered", submittedAt: "2026-09-20T05:32:00.000Z" }),
    ...overrides,
  };
}
