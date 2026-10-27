import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_GOAL_TEMPLATES, planShortNameCandidates, PLAN_EVENT_SLOT } from "../../shared/compute/plan-templates";
import type { AiQuotaGate, AiQuotaReservation } from "../../features/ai-quota/gate";
import { createDeepseekPlanFlowAi } from "../../features/plans/v2/ai/deepseek";
import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import { firstDraftTask } from "../../features/plans/v2/ai/prompts";
import { checkBackground, checkDraft, checkFix, checkLadder, checkQuestions, checkReviewFix } from "../../features/plans/v2/ai/schemas";
import type { DraftOutput, FirstDraftInput, PlanAiContext } from "../../features/plans/v2/ai/types";
import { checkDraftContent, citationMarkerIssues } from "../../features/plans/v2/validate-content";
import type { PlanGoalKind } from "../../shared/contract/plan-v2";

// R23 SC-R23-07（DESIGN §5.1 / §5.2）：输出校验、mock 确定性、按操作记账、修复重试、失败与上限、同键不再调用。
const CONTEXT: PlanAiContext = { actorId: "actor:alice", language: "ja", ledgerKey: "draft:intake-1:1", now: new Date("2026-10-07T01:00:00Z") };

function draftInputFor(kind: PlanGoalKind = "fundraising"): FirstDraftInput {
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
  reject((draft) => { draft.citations = [{ id: "L-777", version: 1 }]; }, /not a published entry/);
  reject((draft) => { draft.diagnosis = "市場は 7,793 億円です。"; }, /number without a citation/);
  reject((draft) => { draft.citations = []; draft.diagnosis = "伸びています①。"; }, /has no citation/);
  // 少于 3 条的聞くこと没有安全的补法（面谈メモ按 3 问里覆盖 2 问计分）→ 仍拒绝；別名不明 / 写人数的紹介ルート改为删掉（见下方）。
  reject((draft) => { draft.personTypes[0]!.questions = ["最初に何から始めましたか？", "どこでつまずきましたか？"]; }, /three questions/);
  reject((draft) => { draft.personTypes[0]!.slot = "not_a_slot"; }, /not a template slot/);
  reject((draft) => { draft.personTypes[0]!.targetCount = 6; }, /target/);
});

// 真实跑通（R23 / R25 补充）：算术与引用一致性由服务端规整（normalize.ts），规整后的结果仍要过同一套校验。
// 这几种以前直接拒绝；真实 C6 被拦的正是这些（合计不是 100、Step 引用不存在的类型），现在规整成合规方案。
test("first drafts: off-template or off-total allocations snap back to the template; steps drop unknown types", async () => {
  const input = draftInputFor();
  const base = await mockDraft(input);
  const template = new Map(PLAN_GOAL_TEMPLATES[input.goalKind].slots.map((slot) => [slot.slot, slot.allocation]));
  const accepted = (mutate: (draft: DraftOutput) => void) => {
    const draft = structuredClone(base);
    mutate(draft);
    const result = checkDraft(draft, checkInput(input));
    assert.equal(result.ok, true, (result as { issues?: string[] }).issues?.join(" | "));
    return (result as { value: DraftOutput }).value;
  };
  for (const mutate of [
    (draft: DraftOutput) => { draft.personTypes[0]!.allocation += 5; },
    (draft: DraftOutput) => { draft.personTypes[0]!.allocation += 10; draft.personTypes[1]!.allocation -= 10; },
    (draft: DraftOutput) => { draft.personTypes[0]!.allocation += 5; draft.personTypes[1]!.allocation -= 5; draft.personTypes[2]!.allocation += 5; draft.personTypes[3]!.allocation -= 5; },
  ]) {
    const value = accepted(mutate);
    for (const type of value.personTypes) assert.equal(type.allocation, template.get(type.slot), "back to the template");
    assert.equal(value.personTypes.reduce((sum, type) => sum + type.allocation, value.event.allocation), 100);
  }
  // 合规的 ±5（最多 2 处）保留模型的调整。
  const kept = accepted((draft) => { draft.personTypes[0]!.allocation += 5; draft.personTypes[1]!.allocation -= 5; });
  assert.equal(kept.personTypes[0]!.allocation, base.personTypes[0]!.allocation + 5);
  // 不是 5 分一档：四舍五入。
  accepted((draft) => { draft.personTypes[0]!.allocation += 3; draft.personTypes[1]!.allocation -= 3; });
  // 真实 C6 第 3 次：Step 引用了方案里没有的类型（heavy_user）→ 去掉这个引用。
  const steps = accepted((draft) => { draft.steps[0]!.personTypeKeys = ["heavy_user", draft.personTypes[0]!.slot]; });
  assert.deepEqual(steps.steps[0]!.personTypeKeys, [base.personTypes[0]!.slot]);
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

// R25 真实 C9 第 2 次：「投資家にもっと寄せたい」把一个槽 +10 却没有从别处扣，合计 110 → 被拒、没扣次数。
// 规整：差额由模型没改、未跳过的槽按配点高的先扣回，不低于已得与 5 分；跳过的槽不动；补不齐仍拒绝。
test("review fixes: an off-total revision is rebalanced from untouched slots, never from skipped ones or below earned", async () => {
  const input = draftInputFor();
  const current = await mockDraft(input);
  const [raised, skipped, ...others] = current.personTypes;
  const revised = structuredClone(current);
  revised.personTypes[0]!.allocation += 10;
  const earned = { [others[0]!.slot]: others[0]!.allocation };
  const result = checkReviewFix({ noChangeReason: null, reasons: [], revised, unchanged: [] }, checkInput(input, false), current, { earned, skippedSlots: [skipped!.slot] });
  assert.equal(result.ok, true, (result as { issues?: string[] }).issues?.join(" | "));
  const value = (result as { value: { revised: DraftOutput } }).value.revised;
  const by = new Map(value.personTypes.map((type) => [type.slot, type.allocation]));
  assert.equal(by.get(raised!.slot), raised!.allocation + 10, "the model's change is kept");
  assert.equal(by.get(skipped!.slot), skipped!.allocation, "a skipped slot is not touched");
  assert.ok(by.get(others[0]!.slot)! >= others[0]!.allocation, "never below earned");
  assert.equal(value.personTypes.reduce((sum, type) => sum + type.allocation, value.event.allocation), 100);

  // 补不齐（其余都已在下限）→ 仍然拒绝。
  const tight = structuredClone(current);
  const floorEarned = Object.fromEntries([...current.personTypes.map((type) => [type.slot, type.allocation]), ["event", current.event.allocation]]);
  tight.personTypes[0]!.allocation += 10;
  const refused = checkReviewFix({ noChangeReason: null, reasons: [], revised: tight, unchanged: [] }, checkInput(input, false), current, { earned: floorEarned, skippedSlots: [] });
  assert.equal(refused.ok, false);
});

/* ---------- staging 新账号（0 联系人）C6 每次被拒（2026-10-26）：可修的小毛病由服务端确定性修理 ---------- */

/** 营业类、0 联系人、4 条行业概况（staging 日志里的 5 个枠：decision_maker / field_lead / introducer / senior_seller / industry_body）。 */
function stagingInput(): FirstDraftInput {
  const input = draftInputFor("sales");
  return { ...input, contacts: [], landscape: ["L-201", "L-202", "L-203", "L-204"].map((id) => ({ id, summary: "s", title: "t", version: 1 })) };
}

function recordingLog() {
  const entries: Array<Record<string, unknown>> = [];
  return { entries, log: (entry: Record<string, unknown>) => { entries.push(entry); } };
}

test("staging run 1 attempt 1: four questions and made-up intro aliases on every type → trimmed and dropped, the draft succeeds on the first call", async () => {
  const input = stagingInput();
  const good = await mockDraft(input);
  assert.deepEqual(good.personTypes.map((type) => type.slot), ["decision_maker", "field_lead", "introducer", "senior_seller", "industry_body"]);
  const bad = structuredClone(good);
  for (const type of bad.personTypes) {
    type.questions = [...type.questions, "予算はどのくらいですか？"];
    type.introRoutes = [{ viaAlias: "C1", why: "業界の知り合いが多い" }];
  }
  const { entries, log } = recordingLog();
  const { events, ledger } = fakeLedger();
  const http = fakeChat([bad, bad]);
  const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log, model: "m" }).firstDraft(input, CONTEXT);
  assert.equal(outcome.ok, true, JSON.stringify(entries));
  assert.equal(http.calls, 1, "no repair round-trip needed");
  assert.equal(events.at(-1), "finish:op-1:succeeded");
  const value = (outcome as { value: DraftOutput }).value;
  for (const [index, type] of value.personTypes.entries()) {
    assert.deepEqual(type.questions, good.personTypes[index]!.questions, "the first three, unchanged");
    assert.deepEqual(type.introRoutes, [], "no fabricated introducer");
  }
  assert.deepEqual(checkDraftContent(value, checkInput(input)), []);
  const repaired = entries.find((entry) => entry.event === "plan_v2_ai_output_repaired");
  assert.ok(repaired, "repairs are logged, not silent");
  assert.equal(repaired.step, "first_draft");
  const codes = repaired.repairs as string[];
  for (const slot of ["decision_maker", "field_lead", "introducer", "senior_seller", "industry_body"]) {
    assert.ok(codes.includes(`questions_trimmed:${slot}`), codes.join(","));
    assert.ok(codes.includes(`intro_route_unknown_alias_dropped:${slot}`), codes.join(","));
  }
  assert.equal(entries.some((entry) => entry.event === "plan_v2_ai_output_rejected"), false);
});

test("staging run 1 attempt 2 / run 2 attempt 1: intro routes via unknown aliases only → dropped; a known alias with a headcount is dropped too; known aliases stay", async () => {
  const input = stagingInput();
  const good = await mockDraft(input);
  const bad = structuredClone(good);
  for (const type of bad.personTypes) type.introRoutes = [{ viaAlias: "C2", why: "紹介してくれそう" }, { viaAlias: "C7", why: "元同僚" }];
  const result = checkDraft(bad, checkInput(input));
  assert.equal(result.ok, true, (result as { issues?: string[] }).issues?.join(" | "));
  assert.ok((result as { value: DraftOutput }).value.personTypes.every((type) => type.introRoutes.length === 0));

  const withContacts = draftInputFor("sales");
  const base = await mockDraft(withContacts);
  const mixed = structuredClone(base);
  mixed.personTypes[1]!.introRoutes = [{ viaAlias: "C1", why: "同じ業界にいる" }, { viaAlias: "C9", why: "知り合い" }, { viaAlias: "C1", why: "3 人紹介できる" }];
  const kept = checkDraft(mixed, checkInput(withContacts));
  assert.equal(kept.ok, true, (kept as { issues?: string[] }).issues?.join(" | "));
  assert.deepEqual((kept as { value: DraftOutput }).value.personTypes[1]!.introRoutes, [{ viaAlias: "C1", why: "同じ業界にいる" }]);
  assert.deepEqual((kept as { repairs?: string[] }).repairs?.sort(), ["intro_route_headcount_dropped:field_lead", "intro_route_unknown_alias_dropped:field_lead"]);
});

test("staging run 2 attempt 2: citation ④ is not used in the text → dropped; an unused middle citation is dropped and later markers renumbered", async () => {
  const input = stagingInput();
  const good = await mockDraft(input);
  const all = input.landscape.map((entry) => ({ id: entry.id, version: entry.version }));
  const unusedLast = { ...structuredClone(good), citations: all, diagnosis: good.diagnosis.replace("①②", "①②③") };
  const last = checkDraft(unusedLast, checkInput(input));
  assert.equal(last.ok, true, (last as { issues?: string[] }).issues?.join(" | "));
  assert.deepEqual((last as { value: DraftOutput }).value.citations.map((item) => item.id), ["L-201", "L-202", "L-203"]);
  assert.deepEqual((last as { repairs?: string[] }).repairs, ["citation_unused_dropped:1"]);

  const unusedMiddle = { ...structuredClone(good), citations: all, diagnosis: good.diagnosis.replace("①②", "①③④") };
  const middle = checkDraft(unusedMiddle, checkInput(input));
  assert.equal(middle.ok, true, (middle as { issues?: string[] }).issues?.join(" | "));
  const value = (middle as { value: DraftOutput }).value;
  assert.deepEqual(value.citations.map((item) => item.id), ["L-201", "L-203", "L-204"]);
  assert.ok(value.diagnosis.includes("①②③") && !value.diagnosis.includes("④"), value.diagnosis);
  assert.deepEqual(checkDraftContent(value, checkInput(input)), []);
});

test("unusable answers still fail: no person types, an empty diagnosis, or fewer than three questions → repair once, then failed", async () => {
  const input = stagingInput();
  const good = await mockDraft(input);
  const noTypes = { ...structuredClone(good), personTypes: [], steps: good.steps.map((step) => ({ ...step, personTypeKeys: ["event"] })) };
  const noDiagnosis = { ...structuredClone(good), diagnosis: "" };
  const twoQuestions = structuredClone(good);
  for (const type of twoQuestions.personTypes) type.questions = type.questions.slice(0, 2);
  for (const bad of [noTypes, noDiagnosis, twoQuestions]) {
    const { entries, log } = recordingLog();
    const { events, ledger } = fakeLedger();
    const http = fakeChat([bad, bad]);
    const outcome = await createDeepseekPlanFlowAi({ chat: http.chat, ledger, log, model: "m" }).firstDraft(input, CONTEXT);
    assert.deepEqual(outcome, { ok: false, reason: "failed" });
    assert.equal(http.calls, 2);
    assert.equal(events.at(-1), "finish:op-1:failed");
    assert.equal(entries.filter((entry) => entry.event === "plan_v2_ai_output_rejected").length, 2);
  }
});

test("the first-draft prompt lists the real contact aliases, and says intro routes must be empty when there are none", async () => {
  assert.match(firstDraftTask([]), /no contacts yet: every introRoutes must be \[\]/);
  assert.match(firstDraftTask(["C1", "C2"]), /no others exist\): C1, C2\./);
  assert.match(firstDraftTask([]), /EXACTLY 3 strings/);
  assert.doesNotMatch(firstDraftTask([]), /"viaAlias": "C1"/);
  const input = stagingInput();
  const good = await mockDraft(input);
  const systems: string[] = [];
  const { ledger } = fakeLedger();
  await createDeepseekPlanFlowAi({ chat: async ({ system }) => { systems.push(system); return { content: JSON.stringify(good), usage: { inputTokens: 1, outputTokens: 1 } }; }, ledger, log: () => undefined, model: "m" }).firstDraft(input, CONTEXT);
  assert.match(systems[0]!, /no contacts yet/);
});

test("revisions (C7 / C9): rewritten text that drops a citation marker falls back to the confirmed text instead of failing", async () => {
  const input = draftInputFor();
  const current = await mockDraft(input);
  assert.equal(current.citations.length, 2);
  const revised = { ...structuredClone(current), diagnosis: "まず現場の人に話を聞きます①。" };
  revised.steps[0]!.title = "現場の人に話を聞く";
  const raw = { noChangeReason: null, reasons: [{ path: "steps.0.title", reason: "r" }], revised, unchanged: [] };
  const fixed = checkFix(raw, checkInput(input, false), current);
  assert.equal(fixed.ok, true, (fixed as { issues?: string[] }).issues?.join(" | "));
  const value = (fixed as { value: { revised: DraftOutput } }).value.revised;
  assert.equal(value.diagnosis, current.diagnosis);
  assert.equal(value.steps[0]!.title, "現場の人に話を聞く", "the requested change is kept");
  assert.deepEqual((fixed as { repairs?: string[] }).repairs, ["revision_diagnosis_restored_for_citations"]);
  const reviewed = checkReviewFix(raw, checkInput(input, false), current, { earned: {}, skippedSlots: [] });
  assert.equal(reviewed.ok, true, (reviewed as { issues?: string[] }).issues?.join(" | "));

  const { entries, log } = recordingLog();
  const { ledger } = fakeLedger();
  const outcome = await createDeepseekPlanFlowAi({ chat: fakeChat([raw]).chat, ledger, log, model: "m" }).reviewFix({ contacts: input.contacts, current, earned: {}, goalKind: input.goalKind, landscape: input.landscape, premise: [], previousTurns: [], request: "x", skippedSlots: [], slots: input.slots }, CONTEXT);
  assert.equal(outcome.ok, true);
  assert.ok(entries.some((entry) => entry.event === "plan_v2_ai_output_repaired" && entry.step === "review_fix"));
});
