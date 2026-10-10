/**
 * R24 独立复核的服务端修复（内存仓储 / 纯函数部分；Postgres 部分见 tests/capabilities/plans-v2-r24-review-postgres.test.ts）：
 * M1 memo 卡决定原子化、M2 线下聊过新建联系人幂等、M3 live 不读活动、M4 活动参加 v1 / v2 各自独立、
 * m1 计划钩子出错只跳过计划部分、m3 / m9 pending 的 href 与 points、fit 的推荐度、m5 依頼文固定句、m6 memo 提议守卫、
 * S1 补充 job.ts 吞错改结构化日志。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { planContactFitSchema, planPendingListResponseSchema } from "../../shared/api-schema/plan-v2";
import { DEMO_PLAN } from "../../shared/mock/demo-world";
import { runMemoExtraction } from "../../features/contacts/memo-extraction/job";
import { createMockMemoExtractionProvider } from "../../features/contacts/memo-extraction/provider";
import { createLiveRecordMemoExtractionStore, planCoverageHooksOrSkip } from "../../features/contacts/memo-extraction/store";
import { markPlanEventAttendedForActor } from "../../features/plans/event-attribution-runtime";
import { INTRO_DRAFT_REASON } from "../../features/plans/v2/drafts";
import { demoPlanEventFacts, livePlanEventFacts, PLAN_LIVE_EVENT_LIMIT } from "../../features/plans/v2/event-facts";
import { demoPlanV2State } from "../../features/plans/v2/mock-seed";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service, PlanV2Error } from "../../features/plans/v2/service";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ANY_REFERENCES, draftInput, SCOPE, steppingClock } from "./v2-fixture";

const PLAN = DEMO_PLAN.id;
const rejects = (reason: string) => (error: unknown) => error instanceof PlanV2Error && error.reason === reason;

function world(createContact?: (input: { name: string }) => Promise<string | null>) {
  const repository = createMemoryPlanV2Repository();
  repository.seed(SCOPE, demoPlanV2State());
  let n = 0;
  const service = createPlanV2Service({ createContact, events: demoPlanEventFacts, newId: () => `fix-${(n += 1)}`, now: steppingClock("2026-10-07T03:00:00.000Z"), references: ANY_REFERENCES, repository, scope: SCOPE });
  return { repository, service };
}
async function itemId(service: ReturnType<typeof world>["service"], key: string) {
  return (await service.detail(PLAN))!.content.personTypes.find((type) => type.key === key)!.itemId;
}
async function total(service: ReturnType<typeof world>["service"]) {
  return (await service.summary()).current!.score.total;
}

/* ---------------- M1 ---------------- */

test("M1: a memo card dismissed first cannot score later with a new key (409 PENDING_DECIDED); the score does not move", async () => {
  const { service } = world();
  const angel = await itemId(service, "angel");
  assert.equal(await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 2], itemId: angel }], memoId: "m-d" }), 1);
  const card = (await service.pending()).find((item) => item.kind === "memo_coverage")!;
  await service.decidePending({ decision: "dismiss", id: card.id, idempotencyKey: "d1" });
  const before = await total(service);
  await assert.rejects(service.decidePending({ decision: "accept", id: card.id, idempotencyKey: "a1" }), rejects("PENDING_DECIDED"));
  assert.equal(await total(service), before, "no points after a dismissal");
  // 同键重放返回原结果（不是 409）。
  const replay = await service.decidePending({ decision: "dismiss", id: card.id, idempotencyKey: "d1" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.status, "dismissed");
});

test("M1: replaying an accepted memo card adds the points once; a second accept with a new key is 409", async () => {
  const { repository, service } = world();
  const angel = await itemId(service, "angel");
  await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 1], itemId: angel }], memoId: "m-a" });
  const card = (await service.pending()).find((item) => item.kind === "memo_coverage")!;
  const before = await total(service);
  const first = await service.decidePending({ decision: "accept", id: card.id, idempotencyKey: "acc" });
  const again = await service.decidePending({ decision: "accept", id: card.id, idempotencyKey: "acc" });
  assert.equal(first.replayed, false);
  assert.equal(again.replayed, true);
  assert.deepEqual(again.award, first.award);
  assert.equal(await total(service), before + first.award!.points);
  await assert.rejects(service.decidePending({ decision: "accept", id: card.id, idempotencyKey: "acc-2" }), rejects("PENDING_DECIDED"));
  const memoAwards = repository.dump(SCOPE).log.filter((entry) => entry.event === "score_awarded" && entry.payload.basis === "memo");
  assert.equal(memoAwards.length, 1);
});

/* ---------------- M2 ---------------- */

test("M2: talked offline 「新しく登録」 retried with the same key creates one contact and replays the score", async () => {
  const created: string[] = [];
  const { service } = world(async ({ name }) => {
    created.push(name);
    return `contact:new-${created.length}`;
  });
  const angel = await itemId(service, "angel");
  const request = { createContact: true, idempotencyKey: "same", name: "新しい 人" };
  const first = await service.talkedOffline({ itemId: angel, planId: PLAN, request });
  const again = await service.talkedOffline({ itemId: angel, planId: PLAN, request });
  assert.deepEqual(created, ["新しい 人"], "the retry does not create a second contact");
  assert.equal(first.createdContactId, "contact:new-1");
  assert.equal(again.createdContactId, "contact:new-1");
  assert.equal(first.award!.replayed, false);
  assert.equal(again.award!.replayed, true);
  assert.equal(again.award!.awardLogId, first.award!.awardLogId);
  // 同键不同内容 → 409。
  await assert.rejects(service.talkedOffline({ itemId: angel, planId: PLAN, request: { ...request, name: "別の 人" } }), rejects("IDEMPOTENCY_KEY_REUSED"));
});

test("M2: a failed contact creation is CONTACT_CREATE_FAILED (not a silent anonymous score); the same key replays the failure", async () => {
  let calls = 0;
  const { service } = world(async () => {
    calls += 1;
    throw new Error("contacts down");
  });
  const angel = await itemId(service, "angel");
  const before = await total(service);
  await assert.rejects(service.talkedOffline({ itemId: angel, planId: PLAN, request: { createContact: true, idempotencyKey: "f1", name: "新しい 人" } }), (error: unknown) => {
    assert.ok(error instanceof PlanV2Error);
    assert.equal(error.reason, "CONTACT_CREATE_FAILED");
    assert.equal(error.code, "SERVICE_UNAVAILABLE");
    return true;
  });
  await assert.rejects(service.talkedOffline({ itemId: angel, planId: PLAN, request: { createContact: true, idempotencyKey: "f1", name: "新しい 人" } }), rejects("CONTACT_CREATE_FAILED"));
  assert.equal(calls, 1, "the replay does not try again");
  assert.equal(await total(service), before, "nothing was scored");
  // 没有建联系人的能力（null）也是同一个错。
  const { service: none } = world(async () => null);
  await assert.rejects(none.talkedOffline({ itemId: angel, planId: PLAN, request: { createContact: true, idempotencyKey: "f2", name: "新しい 人" } }), rejects("CONTACT_CREATE_FAILED"));
});

test("M2: a key already used for an anonymous record is refused before any contact is created", async () => {
  let calls = 0;
  const { service } = world(async () => {
    calls += 1;
    return "contact:x";
  });
  const angel = await itemId(service, "angel");
  await service.talkedOffline({ itemId: angel, planId: PLAN, request: { anonymous: true, idempotencyKey: "k" } });
  await assert.rejects(service.talkedOffline({ itemId: angel, planId: PLAN, request: { createContact: true, idempotencyKey: "k", name: "新しい 人" } }), rejects("IDEMPOTENCY_KEY_REUSED"));
  assert.equal(calls, 0);
});

/* ---------------- M3 ---------------- */

test("M3: live event facts read nothing until R26 (no event table read); when enabled the read is a bounded time window", async () => {
  let opened = 0;
  const windowReader = () => {
    opened += 1;
    return {
      async listPublishedStartingBetween(from: string, to: string) {
        assert.ok(Date.parse(to) - Date.parse(from) <= 61 * 86_400_000, "bounded window");
        return Array.from({ length: 30 }, (_, index) => ({ eventId: `e${index}`, startsAt: "2026-10-20T10:00:00.000Z", title: `E${index}` }));
      },
    };
  };
  assert.deepEqual(await livePlanEventFacts({ window: windowReader })(), []);
  assert.equal(opened, 0, "the live factory does not touch the events at all");
  const enabled = await livePlanEventFacts({ now: () => new Date("2026-10-11T00:00:00.000Z"), ready: true, window: windowReader })();
  assert.equal(opened, 1);
  assert.equal(enabled.length, PLAN_LIVE_EVENT_LIMIT);
  assert.deepEqual(enabled[0]!.facts.expected, {});
});

/* ---------------- M4 ---------------- */

test("M4: when the v1 attendance write throws, the v2 event slot still scores (and the error is reported afterwards)", async () => {
  const v2Calls: string[] = [];
  await assert.rejects(
    markPlanEventAttendedForActor({ actorId: "actor:a", eventId: "event:1" }, {
      v1: async () => ({ async markEventAttended() { throw new Error("v1 down"); } }),
      v2: async () => ({ async hasActivePlan() { return true; }, async recordEventAttendanceForPlans({ eventId }) { v2Calls.push(eventId); return []; } }),
    }),
    /v1 down/,
  );
  assert.deepEqual(v2Calls, ["event:1"]);
  // 反过来 v2 失败时 v1 也照常写。
  const v1Calls: string[] = [];
  await assert.rejects(
    markPlanEventAttendedForActor({ actorId: "actor:a", eventId: "event:2" }, {
      v1: async () => ({ async markEventAttended({ eventId }) { v1Calls.push(eventId); return {}; } }),
      v2: async () => { throw new Error("v2 down"); },
    }),
    /v2 down/,
  );
  assert.deepEqual(v1Calls, ["event:2"]);
});

test("M4: a v2 plan scores the event slot through the real service even when v1 fails", async () => {
  const repository = createMemoryPlanV2Repository();
  let n = 0;
  const service = createPlanV2Service({ newId: () => `m4-${(n += 1)}`, now: steppingClock(), references: ANY_REFERENCES, repository, scope: SCOPE });
  await service.createPlanFromDraft(draftInput());
  await assert.rejects(markPlanEventAttendedForActor({ actorId: SCOPE.actorId, eventId: "event:9" }, {
    v1: async () => ({ async markEventAttended() { throw new Error("v1 down"); } }),
    v2: async () => service,
  }));
  const segment = (await service.summary()).current!.score.segments.find((item) => item.key === "event")!;
  assert.ok(segment.earned > 0, "the event slot was scored");
});

/* ---------------- m1 / S1 补充 ---------------- */

test("m1: a failing plan hook only skips the plan part (logged), it does not stop the memo extraction", async (t) => {
  const errors: string[] = [];
  t.mock.method(console, "error", (line: string) => errors.push(line));
  const result = await planCoverageHooksOrSkip({ actorId: "a", contactId: "c", noteId: "n" }, async () => {
    throw new Error("plans db down");
  });
  assert.equal(result, null);
  const logged = JSON.parse(errors[0]!);
  assert.equal(logged.event, "memo_extraction_error");
  assert.equal(logged.stage, "plan_hooks_failed");
  assert.match(logged.error, /plans db down/);
});

test("S1: a failing plan proposal after the extraction is logged as structured JSON (no longer swallowed); the extraction still succeeds", async (t) => {
  const errors: string[] = [];
  t.mock.method(console, "error", (line: string) => errors.push(line));
  const gate: AiQuotaGate = {
    async beginCall() { return { callId: "call-1" }; },
    async endCall() {},
    async finish() {},
    async reserve() { return { ok: true, operationId: "op-1", owner: true, status: "reserved" }; },
  } as AiQuotaGate;
  const provider = createMockMemoExtractionProvider({ eventTypes: [], offering: [], questionCoverage: [{ answered: [0, 2], itemId: "pitem_1" }], seeking: [], topics: [] });
  const record = await runMemoExtraction(
    { actorId: "a", body: "メモ本文", contact: {}, contactId: "c1", noteId: "note:s1", planQuestions: [{ itemId: "pitem_1", questions: ["a", "b", "c"] }] },
    {
      applyValues: async () => [],
      gate,
      now: () => new Date("2026-10-07T03:00:00.000Z"),
      onPlanCoverage: async () => {
        throw new Error('new row for relation "plan_log" violates check constraint');
      },
      provider,
      store: createLiveRecordMemoExtractionStore({ store: createMemoryLiveRecordStore(), workspaceId: "w" }),
    },
  );
  assert.equal(record.status, "succeeded");
  assert.equal(record.planPromptVersion, "memo-plan-coverage-2026-10-v1", "the C11 prompt version is kept on the call record (M5)");
  const logged = errors.map((line) => JSON.parse(line)).find((entry) => entry.stage === "plan_coverage_failed");
  assert.ok(logged, "the failure is logged");
  assert.equal(logged.noteId, "note:s1");
  assert.equal(logged.manual, false);
  assert.ok(!JSON.stringify(logged).includes("メモ本文"), "the memo body never goes to the log");
});

/* ---------------- m3 / m9 ---------------- */

test("m3 / m9: pending items carry a deep link and the memo card's points come from the server (0 when already counted)", async () => {
  const { service } = world();
  const angel = await itemId(service, "angel");
  await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 2], itemId: angel }], memoId: "m-p" });
  const items = planPendingListResponseSchema.parse({ items: await service.pending({ platform: "app" }) }).items;
  const memo = items.find((item) => item.kind === "memo_coverage")!;
  assert.equal(memo.href, `/plans/${encodeURIComponent(PLAN)}/types/${encodeURIComponent(angel)}`);
  for (const item of items) assert.ok(item.href, `${item.kind} has a deep link`);
  assert.ok(items.filter((item) => item.kind === "step_suggestion").every((item) => item.href === `/plans/${encodeURIComponent(PLAN)}`));
  const accepted = await service.decidePending({ decision: "accept", id: memo.id, idempotencyKey: "pp" });
  assert.equal(memo.points, accepted.award!.points, "the preview equals what the server awards");
  assert.ok(memo.points! > 0);
  // 这个人在这个类型下已计过：新的卡预告 0。
  await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 1], itemId: angel }], memoId: "m-p2" });
  const again = (await service.pending()).filter((item) => item.kind === "memo_coverage");
  assert.equal(again.length, 0, "an already-counted person gets no new proposal");
});

test("m9: a memo card on a skipped type previews 0 points", async () => {
  const { service } = world();
  const angel = await itemId(service, "angel");
  await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 2], itemId: angel }], memoId: "m-s" });
  await service.skip({ idempotencyKey: "sk", itemId: angel, planId: PLAN });
  const memo = (await service.pending()).find((item) => item.kind === "memo_coverage")!;
  assert.equal(memo.points, 0);
});

test("m9: a memo card whose person was scored another way afterwards previews 0 points (and confirming gives 0)", async () => {
  const { service } = world();
  const angel = await itemId(service, "angel");
  await service.proposeMemoCoverage({ contactId: "demo-person-kobayashi", coverage: [{ answered: [0, 2], itemId: angel }], memoId: "m-c" });
  await service.award({ itemId: angel, planId: PLAN, request: { basis: "talked", contactId: "demo-person-kobayashi", idempotencyKey: "direct" } });
  const memo = (await service.pending()).find((item) => item.kind === "memo_coverage")!;
  assert.equal(memo.points, 0);
  const decided = await service.decidePending({ decision: "accept", id: memo.id, idempotencyKey: "c0" });
  assert.equal(decided.award!.points, 0);
  assert.equal(decided.award!.reason, "already_counted");
});

test("m3: contact fit gives candidates a recommend score and a reason (optional fields; schema reads them)", async () => {
  const { service } = world();
  const fit = planContactFitSchema.parse(await service.contactFit("demo-person-sasaki"));
  const candidate = fit.fits.find((item) => item.status === "candidate")!;
  assert.equal(typeof candidate.recommendScore, "number");
  assert.ok(candidate.recommendScore! >= 0 && candidate.recommendScore! <= 100);
  assert.ok("reason" in candidate);
  const talked = (await service.contactFit("demo-person-takahashi")).fits.find((item) => item.status === "talked")!;
  assert.equal(talked.recommendScore, undefined);
});

/* ---------------- m5 ---------------- */

test("m5: the introduction request uses a fixed sentence, never the AI's third-person why (three languages)", async () => {
  const repository = createMemoryPlanV2Repository();
  let n = 0;
  const service = createPlanV2Service({ newId: () => `m5-${(n += 1)}`, now: steppingClock(), references: ANY_REFERENCES, repository, scope: SCOPE });
  const input = draftInput();
  const why = "渡辺さんは彼の元上司なので紹介を頼みやすい";
  input.content.personTypes[0] = { ...input.content.personTypes[0]!, introRoutes: [{ viaContactId: "contact:via", why }] } as never;
  const { plan } = await service.createPlanFromDraft(input);
  const state = repository.dump(SCOPE);
  repository.seed(SCOPE, { ...state, contacts: [{ id: "contact:via", isOrbitUser: false, lastInteractionAt: null, name: "渡辺 健", organization: null, role: null }] });
  const cfo = plan.content.personTypes[0]!.itemId;
  for (const language of ["ja", "en", "zh"] as const) {
    const draft = await service.introDraft({ itemId: cfo, language, planId: plan.planId, viaContactId: "contact:via" });
    assert.ok(!draft.body.includes(why), `${language}: no AI why in the letter`);
    assert.ok(draft.body.includes(INTRO_DRAFT_REASON[language]), `${language}: the fixed sentence`);
  }
});

/* ---------------- m6 ---------------- */

test("m6: a memo proposal is only made for a candidate or a linked person of that type; a stranger is skipped", async () => {
  const { service } = world();
  const cfo = await itemId(service, "cfo");
  assert.equal(await service.proposeMemoCoverage({ contactId: "stranger", coverage: [{ answered: [0, 1], itemId: cfo }], memoId: "mx" }), 0);
  assert.equal((await service.pending()).filter((item) => item.kind === "memo_coverage").length, 0);
  await service.linkTypeContact({ contactId: "stranger", itemId: cfo });
  assert.equal(await service.proposeMemoCoverage({ contactId: "stranger", coverage: [{ answered: [0, 1], itemId: cfo }], memoId: "mx" }), 1, "once linked, the proposal is made");
});
