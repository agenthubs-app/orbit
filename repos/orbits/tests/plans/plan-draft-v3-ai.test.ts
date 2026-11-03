/**
 * R35 SC-R35-01 / 02：`firstDraftV3` 是 `PlanFlowAi` 的必选方法；deepseek 实现用 v9 的新任务提示词（来源 id 清单 + 回答 id 清单 +
 * 联系人别名）走既有 run 骨架：好回包一次通过并 finish succeeded；四种可修理的坏回包（无来源句 / 坏加粗 / 分量与判定相反 / 坏引用）
 * 一次通过并把 `repairs` 记进日志；不可修理的（steps 少于 2、全句无来源）第二次 chat 带 repairMessage 与 issues，仍坏 → failed、
 * 账本 finish failed、chat 恰好 2 次；disabled 实现返回 disabled。真实 DeepSeek 调用 0 次（假 chat）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AiQuotaGate, AiQuotaReservation } from "../../features/ai-quota/gate";
import { createDeepseekPlanFlowAi } from "../../features/plans/v2/ai/deepseek";
import { createDisabledPlanFlowAi } from "../../features/plans/v2/ai/disabled";
import { createMockPlanFlowAi, mockDraftV3 } from "../../features/plans/v2/ai/mock";
import { firstDraftV3Task, PLAN_V2_PROMPT_VERSION, TASKS } from "../../features/plans/v2/ai/prompts";
import type { DraftOutputV3, DraftV3, FirstDraftInputV3, PlanAiContext, PlanFlowAi } from "../../features/plans/v2/ai/types";
import { PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES, planShortNameCandidates } from "../../shared/compute/plan-templates";
import type { PlanGoalKind, PlanSource } from "../../shared/contract/plan-v2";

const CONTEXT: PlanAiContext = { actorId: "actor:alice", language: "ja", ledgerKey: "draft:intake-1:1", now: new Date("2026-11-01T01:00:00Z") };
const SOURCES: PlanSource[] = [
  { id: "S1", kind: "landscape", landscapeId: "L-101", version: 1 },
  { id: "S2", kind: "web", url: "https://example.jp/cvc", title: "CVC 動向", fetchedAt: "2026-11-01T00:00:00.000Z", snippet: "…", query: "CVC 投資 動向" },
];
const REAL_NAME = "山田太郎";

function inputFor(kind: PlanGoalKind = "fundraising", overrides: Partial<FirstDraftInputV3> = {}): FirstDraftInputV3 {
  const template = PLAN_GOAL_TEMPLATES[kind];
  const slots = template.slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => ({
    allocation: slot.allocation, emoji: slot.emoji, shortNames: planShortNameCandidates(slot.slot, []).map((id) => ({ id, label: id })), slot: slot.slot, targetCount: slot.targetCount,
  }));
  const event = template.slots.find((slot) => slot.slot === PLAN_EVENT_SLOT)!;
  return {
    answerKeys: ["F3", "purpose"],
    background: "goal: x",
    contacts: [{ alias: "C1", industry: null, name: REAL_NAME, notes: null, organization: null, role: null, tags: [] }],
    eventSlot: { allocation: event.allocation, targetCount: event.targetCount },
    gaps: [],
    goalKind: kind,
    goalText: "シリーズA を年内に",
    landscape: [{ id: "L-101", summary: "s", title: "t", version: 1 }],
    premise: [],
    purpose: null,
    slots,
    sources: SOURCES,
    ...overrides,
  };
}

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
  const requests: Array<{ system: string; user: string }> = [];
  return {
    get calls() { return requests.length; },
    requests,
    chat: async (request: { system: string; user: string }) => {
      const answer = answers[Math.min(requests.length, answers.length - 1)];
      requests.push(request);
      return { content: typeof answer === "string" ? answer : JSON.stringify(answer), usage: { inputTokens: 1000, outputTokens: 200 } };
    },
  };
}

function recordingLog() {
  const entries: Array<Record<string, unknown>> = [];
  return { entries, log: (entry: Record<string, unknown>) => { entries.push(entry); } };
}

const good = (kind: PlanGoalKind = "fundraising") => { const input = inputFor(kind); return { draft: mockDraftV3(input, "ja"), input }; };

test("firstDraftV3 is a required method: mock, deepseek and disabled all implement it", async () => {
  const implementations: PlanFlowAi[] = [createMockPlanFlowAi(), createDisabledPlanFlowAi(), createDeepseekPlanFlowAi({ chat: fakeChat([{}]).chat, ledger: fakeLedger().ledger, log: () => undefined, model: "m" })];
  for (const ai of implementations) assert.equal(typeof ai.firstDraftV3, "function", ai.id);
  assert.deepEqual(await createDisabledPlanFlowAi().firstDraftV3(inputFor(), CONTEXT), { ok: false, reason: "disabled" });
});

test("prompt v10: the v3 task carries the five §3.1 points (+ v10 subtitle, outcome count, no event type), the source ids, the answer keys and the aliases — never a real name", () => {
  assert.equal(PLAN_V2_PROMPT_VERSION, "plan-v2-flow-2026-11-v10");
  const task = TASKS.firstDraftV3;
  assert.match(task, /cite ONLY the sources listed in the input/u, "1. only input sources / answers");
  assert.match(task, /may appear ONLY in risks/u);
  assert.match(task, /first write outcome .* and conclusion .*\. Count the characters of outcome .* Then write summary/u, "2. outcome / conclusion first (v10: count outcome characters)");
  assert.match(task, /"why": "<subtitle, at most 10 characters>"/u, "v10: stage subtitle is asked for, never a fixed null");
  assert.match(task, /Never put \\"event\\" in personTypes|Never put "event" in personTypes/u, "v10: event is not a person type");
  assert.match(task, /EVERY external fact in summary .* must carry a sourceId/u);
  assert.match(task, /doneCriteria is an observable result/u, "3. observable doneCriteria");
  assert.match(task, /Allocations must follow the verdicts/u, "4. allocation by comparison");
  assert.match(task, /EXACTLY 3 strings per person type/u, "5. exactly 3 questions");
  assert.match(task, /Do NOT output citations or sources/u);
  const text = firstDraftV3Task({ aliases: ["C1", "C2"], answerKeys: ["F3", "purpose"], sourceIds: ["S1", "S2", "S3"] });
  assert.match(text, /Source ids you may cite \(no others exist\): S1, S2, S3\./u);
  assert.match(text, /Answer keys you may cite as questionKey \(no others exist\): F3, purpose\./u);
  assert.match(text, /no others exist\): C1, C2\./u);
  const bare = firstDraftV3Task({ aliases: [], answerKeys: [], sourceIds: [] });
  assert.match(bare, /no contacts yet: every introRoutes must be \[\]/u);
  assert.match(bare, /There are no sources this time/u);
  assert.match(bare, /never output a ref of kind answer/u);
});

test("deepseek firstDraftV3: a good answer passes on the first call, is ledgered on plan_draft and finished as succeeded; the system prompt lists S ids and answer keys but no real name", async () => {
  const { draft, input } = good();
  const { events, ledger } = fakeLedger();
  const http = fakeChat([draft]);
  const { entries, log } = recordingLog();
  const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log, model: "deepseek-v4-flash" }).firstDraftV3(input, CONTEXT);
  assert.equal(outcome.ok, true, JSON.stringify(entries));
  assert.equal(http.calls, 1);
  assert.deepEqual(events, ["reserve:plan_draft:user:draft:intake-1:1", "begin:op-1", "end:call-2:1000", "finish:op-1:succeeded"]);
  const value = (outcome as { value: DraftV3 }).value;
  assert.equal(value.schemaVersion, 3);
  assert.deepEqual(value.sources, SOURCES);
  assert.ok(value.personTypes.every((type) => /^step-\d$/u.test(type.stepKey)));
  assert.ok(value.summary.refs.length >= 3 && value.summary.marks.length > 0);
  const { system, user } = http.requests[0]!;
  assert.match(system, /Source ids you may cite \(no others exist\): S1, S2\./u);
  assert.match(system, /Answer keys you may cite as questionKey \(no others exist\): F3, purpose\./u);
  assert.match(system, /no others exist\): C1\./u);
  assert.doesNotMatch(system, new RegExp(REAL_NAME, "u"), "the task text names aliases only");
  assert.ok(user.includes('"id":"S1"') && user.includes('"answerKeys":["F3","purpose"]'), "the user message carries the numbered source list and the answer keys");
  assert.ok(entries.some((entry) => entry.event === "plan_v2_ai_succeeded" && entry.step === "first_draft_v3" && entry.promptVersion === "plan-v2-flow-2026-11-v10"));
  assert.equal(entries.some((entry) => entry.event === "plan_v2_ai_output_rejected"), false);
});

test("repairable bad answers (no-source sentence / bad bold / allocation against the verdicts / unknown reference) pass on the first call with repairs logged", async () => {
  const cases: Array<{ name: string; mutate: (draft: DraftOutputV3) => void; repair: string }> = [
    { mutate: (draft) => { draft.summary[1] = { ...draft.summary[1]!, refs: [] }; }, name: "no source", repair: "summary_sentence_dropped:1:no_source" },
    { mutate: (draft) => { draft.summary[0] = { ...draft.summary[0]!, bold: "この文には無い語" }; }, name: "bad bold", repair: "summary_mark_dropped:0" },
    { mutate: (draft) => { const vc = draft.personTypes.find((type) => type.slot === "vc_partner")!; const cvc = draft.personTypes.find((type) => type.slot === "cvc")!; [vc.allocation, cvc.allocation] = [cvc.allocation, vc.allocation]; }, name: "allocation vs verdict", repair: "allocation_reranked_by_verdict" },
    { mutate: (draft) => { draft.summary[2] = { ...draft.summary[2]!, refs: [{ kind: "source", sourceId: "S9" }] }; draft.keyNumbers[0] = { ...draft.keyNumbers[0]!, sourceIds: ["S9"] }; }, name: "unknown reference", repair: "summary_sentence_dropped:2:unknown_ref" },
  ];
  for (const item of cases) {
    const { draft, input } = good();
    item.mutate(draft);
    const { events, ledger } = fakeLedger();
    const http = fakeChat([draft, draft]);
    const { entries, log } = recordingLog();
    const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log, model: "m" }).firstDraftV3(input, CONTEXT);
    assert.equal(outcome.ok, true, `${item.name}: ${JSON.stringify(entries)}`);
    assert.equal(http.calls, 1, `${item.name}: no repair round-trip`);
    assert.equal(events.at(-1), "finish:op-1:succeeded", item.name);
    const repaired = entries.find((entry) => entry.event === "plan_v2_ai_output_repaired");
    assert.ok(repaired && (repaired.repairs as string[]).includes(item.repair), `${item.name}: ${JSON.stringify(repaired)}`);
    const value = (outcome as { value: DraftV3 }).value;
    assert.equal(value.personTypes.reduce((sum, type) => sum + type.allocation, 0) + value.event.allocation, 100, item.name);
    if (item.name === "unknown reference") assert.ok(value.risks.some((risk) => risk.kind === "unverified"), "the unsourced key number moved to risks");
  }
});

test("unrepairable answers: the second call carries the issues; still bad → failed, finished as failed, exactly two chats", async () => {
  const cases: Array<{ name: string; mutate: (draft: DraftOutputV3) => void; issue: RegExp }> = [
    { issue: /steps: 2–4/u, mutate: (draft) => { draft.steps = draft.steps.slice(0, 1); }, name: "one step" },
    { issue: /summary: no sentence with a source is left/u, mutate: (draft) => { draft.summary = draft.summary.map((sentence) => ({ ...sentence, refs: [] })); }, name: "no sourced sentence" },
  ];
  for (const item of cases) {
    const { draft, input } = good();
    item.mutate(draft);
    const { events, ledger } = fakeLedger();
    const http = fakeChat([draft, draft]);
    const { entries, log } = recordingLog();
    const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log, model: "m" }).firstDraftV3(input, CONTEXT);
    assert.deepEqual(outcome, { ok: false, reason: "failed" }, item.name);
    assert.equal(http.calls, 2, item.name);
    assert.equal(events.at(-1), "finish:op-1:failed", item.name);
    assert.equal(entries.filter((entry) => entry.event === "plan_v2_ai_output_rejected").length, 2, item.name);
    const second = http.requests[1]!;
    assert.equal(second.system, http.requests[0]!.system, "same task");
    assert.match(second.user, /Your previous answer was rejected for these reasons:/u);
    assert.match(second.user, item.issue, `${item.name}: the repair message carries the issue`);
    assert.ok(second.user.startsWith(http.requests[0]!.user), "the repair message repeats the original input first");
  }
  // 第二次修好了 → 通过（两次 chat，succeeded）。
  const { draft, input } = good();
  const bad = structuredClone(draft);
  bad.steps = bad.steps.slice(0, 1);
  const { events, ledger } = fakeLedger();
  const http = fakeChat([bad, draft]);
  const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log: () => undefined, model: "m" }).firstDraftV3(input, CONTEXT);
  assert.equal(outcome.ok, true);
  assert.equal(http.calls, 2);
  assert.equal(events.at(-1), "finish:op-1:succeeded");
});
