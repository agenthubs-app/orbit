import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_GOAL_TEMPLATES, planShortNameCandidates, PLAN_EVENT_SLOT } from "../../shared/compute/plan-templates";
import type { AiQuotaGate, AiQuotaReservation } from "../../features/ai-quota/gate";
import { createDeepseekPlanFlowAi } from "../../features/plans/v2/ai/deepseek";
import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import { checkBackground, checkDraft, checkLadder, checkQuestions } from "../../features/plans/v2/ai/schemas";
import type { DraftOutput, FirstDraftInput, PlanAiContext } from "../../features/plans/v2/ai/types";
import { citationMarkerIssues } from "../../features/plans/v2/validate-content";

// R23 SC-R23-07（DESIGN §5.1 / §5.2）：输出校验、mock 确定性、按操作记账、修复重试、失败与上限、同键不再调用。
const CONTEXT: PlanAiContext = { actorId: "actor:alice", language: "ja", ledgerKey: "draft:intake-1:1", now: new Date("2026-10-07T01:00:00Z") };

function draftInputFor(kind: "fundraising" | "launch" = "fundraising"): FirstDraftInput {
  const slots = PLAN_GOAL_TEMPLATES[kind].slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => ({
    allocation: slot.allocation, emoji: slot.emoji, shortNames: planShortNameCandidates(slot.slot, []).map((id) => ({ id, label: id })), slot: slot.slot, targetCount: slot.targetCount,
  }));
  const event = PLAN_GOAL_TEMPLATES[kind].slots.find((slot) => slot.slot === PLAN_EVENT_SLOT)!;
  return {
    background: "goal: x", contacts: [{ alias: "C1", industry: null, name: "A", notes: null, organization: null, role: null, tags: [] }],
    eventSlot: { allocation: event.allocation, targetCount: event.targetCount }, gaps: [], goalKind: kind, goalText: "資金調達", landscape: [{ id: "L-101", summary: "s", title: "t", version: 1 }, { id: "L-102", summary: "s", title: "t", version: 1 }],
    premise: [], purpose: null, slots,
  };
}

const checkInput = (input: FirstDraftInput, enforceTemplate = true) => ({ aliases: new Set(input.contacts.map((contact) => contact.alias)), enforceTemplate, goalKind: input.goalKind, landscape: input.landscape, slots: input.slots });

async function mockDraft(input = draftInputFor()): Promise<DraftOutput> {
  const outcome = await createMockPlanFlowAi().firstDraft(input, CONTEXT);
  assert.equal(outcome.ok, true);
  return (outcome as { value: DraftOutput }).value;
}

test("mock outputs are deterministic and pass the same checks as real outputs", async () => {
  const input = draftInputFor();
  const [a, b] = [await mockDraft(input), await mockDraft(input)];
  assert.deepEqual(a, b);
  assert.deepEqual(checkDraft(structuredClone(a), checkInput(input)), { ok: true, value: a });
  const background = await createMockPlanFlowAi().background({ capabilities: PLAN_GOAL_TEMPLATES.launch.capabilities, contacts: [], goalKind: "launch", goalText: "黒字化したい", profile: { headline: null, name: "A" } }, CONTEXT);
  assert.equal(background.ok, true);
  const checked = checkBackground(structuredClone((background as { value: unknown }).value), { capabilities: PLAN_GOAL_TEMPLATES.launch.capabilities, contacts: [], goalKind: "launch", goalText: "黒字化したい", profile: { headline: null, name: "A" } });
  assert.equal(checked.ok, true);
});

test("first-draft checks reject what the design forbids", async () => {
  const input = draftInputFor();
  const base = await mockDraft(input);
  const reject = (mutate: (draft: DraftOutput) => void, pattern: RegExp) => {
    const draft = structuredClone(base);
    mutate(draft);
    const result = checkDraft(draft, checkInput(input));
    assert.equal(result.ok, false);
    assert.ok((result as { issues: string[] }).issues.some((issue) => pattern.test(issue)), (result as { issues: string[] }).issues.join(" | "));
  };
  reject((draft) => { draft.personTypes[0]!.shortLabelId = "made_up_name"; }, /not in the dictionary/);
  reject((draft) => { draft.personTypes[0]!.allocation += 5; }, /total_not_100|allocation/);
  reject((draft) => { draft.personTypes[0]!.allocation += 3; draft.personTypes[1]!.allocation -= 3; }, /not_multiple/);
  reject((draft) => { draft.personTypes[0]!.allocation += 10; draft.personTypes[1]!.allocation -= 10; }, /template: over_adjusted/);
  reject((draft) => { draft.personTypes[0]!.allocation += 5; draft.personTypes[1]!.allocation -= 5; draft.personTypes[2]!.allocation += 5; draft.personTypes[3]!.allocation -= 5; }, /too_many_adjustments/);
  reject((draft) => { draft.citations = [{ id: "L-777", version: 1 }]; }, /not a published entry/);
  reject((draft) => { draft.diagnosis = "市場は 7,793 億円です。"; }, /number without a citation/);
  reject((draft) => { draft.citations = []; draft.diagnosis = "伸びています①。"; }, /has no citation/);
  reject((draft) => { draft.personTypes[0]!.introRoutes = [{ viaAlias: "C9", why: "知り合い" }]; }, /unknown alias/);
  reject((draft) => { draft.personTypes[0]!.introRoutes = [{ viaAlias: "C1", why: "VC を 3 人紹介できる" }]; }, /headcount/);
  reject((draft) => { draft.steps[0]!.personTypeKeys = ["nobody"]; }, /unknown type/);
  reject((draft) => { draft.personTypes[0]!.slot = "not_a_slot"; }, /not a template slot/);
  reject((draft) => { draft.personTypes[0]!.targetCount = 6; }, /target/);
});

test("numbers are allowed only in sentences that carry a citation marker", () => {
  assert.deepEqual(citationMarkerIssues("市場は 3% 伸びました①。人に会いましょう。", 1, "d"), []);
  assert.equal(citationMarkerIssues("市場は 3% 伸びました。", 1, "d").length, 1);
});

test("question checks: ids from the bank, at most 5, no duplicates, guesses from the options", () => {
  const bank = PLAN_GOAL_TEMPLATES.launch.questions.map((question) => ({ id: question.id, options: question.options.map((value) => ({ label: value, value })), prompt: "", topic: "", type: question.type }));
  const input = { background: "", bank, gaps: [], goalKind: "launch" as const };
  assert.equal(checkQuestions({ questions: [{ guess: null, id: "R1", why: "w" }], skipped: [] }, input).ok, true);
  assert.equal(checkQuestions({ questions: [{ guess: null, id: "F1", why: "w" }] }, input).ok, false);
  assert.equal(checkQuestions({ questions: ["R1", "R2", "R3", "R4", "R5", "R6"].map((id) => ({ guess: null, id, why: "w" })) }, input).ok, false);
  assert.equal(checkQuestions({ questions: [{ guess: null, id: "R1", why: "w" }, { guess: null, id: "R1", why: "w" }] }, input).ok, false);
  assert.equal(checkQuestions({ questions: [{ guess: { text: null, values: ["nope"] }, id: "R1", why: "w" }] }, input).ok, false);
});

test("background checks drop unknown aliases, reject unknown capabilities, and pin level 2 to the original goal", () => {
  const input = { capabilities: ["product", "design"], contacts: [{ alias: "C1", industry: null, name: "A", notes: null, organization: null, role: null, tags: [] }], goalKind: "launch" as const, goalText: "原文", profile: { headline: null, name: "me" } };
  const ladder = { reason: "r", rungs: [{ level: 4, text: "4" }, { level: 3, text: "3" }, { level: 2, text: "書き換え" }, { level: 1, text: "1" }], suggestedLevel: 3 };
  const ok = checkBackground({ ladder, members: [{ alias: "self", capabilities: ["product"], relation: null }, { alias: "C7", capabilities: [], relation: null }], stance: "owner", wants: "w" }, input);
  assert.equal(ok.ok, true);
  const value = (ok as { value: { members: Array<{ alias: string }>; ladder: { rungs: Array<{ level: number; text: string }> } } }).value;
  assert.deepEqual(value.members.map((member) => member.alias), ["self"]);
  assert.equal(value.ladder.rungs.find((rung) => rung.level === 2)?.text, "原文");
  assert.equal(checkBackground({ ladder, members: [{ alias: "self", capabilities: ["legal"], relation: null }], stance: null, wants: "w" }, input).ok, false);
  assert.equal(checkLadder({ rungs: [{ level: 1, text: "a" }, { level: 2, text: "b" }], suggestedLevel: 1 }, "x").ok, false);
});

/* ---------- 真实实现的记账（假 HTTP + 假账本） ---------- */

function fakeLedger(reservation: AiQuotaReservation = { ok: true, operationId: "op-1", owner: true, status: "reserved" }) {
  const events: string[] = [];
  const ledger: AiQuotaGate = {
    async beginCall(operationId) { events.push(`begin:${operationId}`); return { callId: `call-${events.length}` }; },
    async endCall(callId, usage) { events.push(`end:${callId}:${usage ? usage.inputTokens : "null"}`); },
    async finish(operationId, outcome) { events.push(`finish:${operationId}:${outcome}`); },
    async reserve(input) { events.push(`reserve:${input.purpose}:${input.pool}:${input.idempotencyKey}`); return reservation; },
  };
  return { events, ledger };
}

function fakeChat(answers: unknown[]) {
  let calls = 0;
  return {
    get calls() { return calls; },
    chat: async () => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return { content: typeof answer === "string" ? answer : JSON.stringify(answer), usage: { inputTokens: 1000, outputTokens: 200 } };
    },
  };
}

test("a real call is ledgered per operation: reserve on the purpose's pool, one sub-ledger per HTTP, finish once", async () => {
  const input = draftInputFor();
  const good = await mockDraft(input);
  const { events, ledger } = fakeLedger();
  const http = fakeChat([good]);
  const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log: () => undefined, model: "deepseek-v4-flash" }).firstDraft(input, CONTEXT);
  assert.equal(outcome.ok, true);
  assert.equal(http.calls, 1);
  assert.deepEqual(events, ["reserve:plan_draft:user:draft:intake-1:1", "begin:op-1", "end:call-2:1000", "finish:op-1:succeeded"]);
});

test("an invalid answer is repaired once inside the same operation; twice invalid → failed, finished as failed", async () => {
  const input = draftInputFor();
  const good = await mockDraft(input);
  const bad = { ...good, citations: [{ id: "L-777", version: 1 }] };
  const repaired = fakeLedger();
  const http = fakeChat([bad, good]);
  const ok = await createDeepseekPlanFlowAi({ chat: http.chat, ledger: repaired.ledger, log: () => undefined, model: "m" }).firstDraft(input, CONTEXT);
  assert.equal(ok.ok, true);
  assert.equal(http.calls, 2);
  const failing = fakeLedger();
  const httpBad = fakeChat([bad, "not json"]);
  const failed = await createDeepseekPlanFlowAi({ chat: httpBad.chat, ledger: failing.ledger, log: () => undefined, model: "m" }).firstDraft(input, CONTEXT);
  assert.deepEqual(failed, { ok: false, reason: "failed" });
  assert.equal(failing.events.at(-1), "finish:op-1:failed");
});

test("plan_intake calls (max_calls 1) get no repair attempt", async () => {
  const { ledger } = fakeLedger();
  const http = fakeChat([{ goalKind: "nope" }, { goalKind: "sales" }]);
  const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log: () => undefined, model: "m" }).goalKind({ text: "新規顧客を増やしたい" }, { ...CONTEXT, ledgerKey: "goal-kind:x" });
  assert.equal(outcome.ok, false);
  assert.equal(http.calls, 1);
});

test("limits and a replayed key make zero HTTP requests", async () => {
  const input = draftInputFor();
  const limited = fakeLedger({ limit: "monthly", ok: false, reason: "monthly_limit", retryOn: "2026-10-31T15:00:00.000Z" });
  const http = fakeChat([{}]);
  const ai = (ledger: AiQuotaGate) => createDeepseekPlanFlowAi({ chat: http.chat, ledger, log: () => undefined, model: "m" });
  assert.deepEqual(await ai(limited.ledger).firstDraft(input, CONTEXT), { limit: "monthly", ok: false, reason: "limit", retryOn: "2026-10-31T15:00:00.000Z" });
  const daily = fakeLedger({ limit: "plan_flow", ok: false, reason: "daily_limit", retryOn: "2026-10-07T15:00:00.000Z" });
  assert.deepEqual(await ai(daily.ledger).fix({ contacts: [], current: await mockDraft(input), goalKind: "fundraising", landscape: [], premise: [], previousTurns: [], request: "x", slots: input.slots }, CONTEXT), { limit: "daily", ok: false, reason: "limit", retryOn: "2026-10-07T15:00:00.000Z" });
  const busy = fakeLedger({ ok: true, operationId: "op-9", owner: false, status: "reserved" });
  assert.deepEqual(await ai(busy.ledger).firstDraft(input, CONTEXT), { ok: false, reason: "busy" });
  const done = fakeLedger({ ok: true, operationId: "op-9", owner: false, status: "failed" });
  assert.deepEqual(await ai(done.ledger).firstDraft(input, CONTEXT), { ok: false, reason: "failed" });
  assert.equal(http.calls, 0);
});
