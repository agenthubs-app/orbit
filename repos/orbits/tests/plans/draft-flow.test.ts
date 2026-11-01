import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_GOAL_TEMPLATES } from "../../shared/compute/plan-templates";
import type { PlanAllocationError } from "../../shared/compute/plan-allocation";
import type { PlanDraftConfirmAdjustments, PlanV2Content, PlanWebSource } from "../../shared/contract/plan-v2";
import { createDeepseekPlanFlowAi } from "../../features/plans/v2/ai/deepseek";
import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import type { FirstDraftInputV3 } from "../../features/plans/v2/ai/types";
import { PlanFlowError } from "../../features/plans/v2/flow-service";
import type { PlanSearchContext, PlanSearchInput, PlanSearchLike, PlanSearchResult } from "../../features/plans/v2/search-port";
import { PLAN_V3_FIELD_KEYS, PLAN_V3_UNVERIFIED_NETWORK_RISK, pickPlanV3Fields } from "../../features/plans/v2/v3-fields";
import { countingAi, flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { SCOPE, draftInput } from "./v2-fixture";

// R23 SC-R23-04 / 05 / 06：初版、AI 修正、手動編集、確定（DESIGN §2.4、§5.2 C6 / C7）。
const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

test("the first draft is a full plan: points total 100, short names from the dictionary, citations are published entries", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const content = draft.content;
  const total = content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + content.event.allocation;
  assert.equal(total, 100);
  assert.ok(content.personTypes.every((type) => type.itemId === type.key && type.shortLabel && type.allocation % 5 === 0));
  assert.ok(content.steps.length >= 1 && content.steps.length <= 7);
  assert.ok(draft.citations.length > 0 && draft.citations.every((citation) => citation.sourceUrl.startsWith("https://")));
  assert.equal(draft.aiFixUsed, 0);
  assert.equal(draft.aiFixLimit, 3);
  assert.equal(draft.manualEditAvailable, true);
  assert.equal(world.ai.calls.firstDraftV3, 1);
  const again = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.equal(again.draftId, draft.draftId, "asking again returns the same draft");
  assert.equal(world.ai.calls.firstDraftV3, 1);
});

test("a failed first draft saves nothing and can be tried again with a new ledger key", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  ai.next.firstDraftV3 = { ok: false, reason: "failed" };
  await assert.rejects(world.flow.makeDraft(premise.intakeId, key(), JA), rejects("AI_FAILED"));
  const after = await world.flow.getIntake(premise.intakeId, JA);
  assert.equal(after!.draftId, null);
  assert.equal(after!.aiSteps.draft.state, "failed");
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.ok(draft.draftId);
  assert.match(ai.keys.at(-1)!, /#2$/);
});

test("a first draft at the limit is reported as a limit (not a failure)", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  ai.next.firstDraftV3 = { limit: "monthly", ok: false, reason: "limit", retryOn: "2026-10-31T15:00:00.000Z" };
  await assert.rejects(world.flow.makeDraft(premise.intakeId, key(), JA), (error: unknown) => error instanceof PlanFlowError && error.reason === "AI_LIMIT" && error.details.limit === "monthly");
});

test("changing the premise redoes the first draft without using an AI revision", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const first = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const edited = await world.flow.editPremise(premise.intakeId, { idempotencyKey: key(), key: "purpose", value: "まず黒字化" }, JA);
  assert.equal(edited.draftId, null);
  assert.equal(edited.status, "premise");
  const second = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.notEqual(second.draftId, first.draftId);
  assert.equal(second.aiFixUsed, 0);
  assert.equal((await world.flow.getDraft(first.draftId, JA))!.status, "discarded");
});

test("AI revisions: 3 at most, a 'no change' answer also counts, a failed one does not", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const one = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "主催者には最初の 1 回は無料で試してほしい" }, JA);
  assert.equal(one.aiFixUsed, 1);
  assert.ok(one.turns[0]!.changes.length > 0 && one.turns[0]!.changes[0]!.before && one.turns[0]!.changes[0]!.after);
  assert.ok(one.turns[0]!.unchanged.length > 0);
  ai.next.fix = { ok: false, reason: "failed" };
  await assert.rejects(world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "事例は 3 件" }, JA), rejects("AI_FAILED"));
  assert.equal((await world.flow.getDraft(draft.draftId, JA))!.aiFixUsed, 1, "a failed revision does not count");
  const two = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "事例は 3 件にしたい" }, JA);
  assert.equal(two.aiFixUsed, 2);
  const three = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "このままで、変更しないでください" }, JA);
  assert.equal(three.aiFixUsed, 3);
  assert.deepEqual(three.turns[2]!.changes, []);
  assert.ok(three.turns[2]!.noChangeReason, "a 'no change' turn explains why and still counts");
  await assert.rejects(world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "もう一回" }, JA), rejects("FIX_LIMIT"));
});

test("the same revision request replayed does not call the AI again", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const idempotencyKey = key();
  await world.flow.fix(draft.draftId, { idempotencyKey, text: "営業は 2 人でやる" }, JA);
  const again = await world.flow.fix(draft.draftId, { idempotencyKey, text: "営業は 2 人でやる" }, JA);
  assert.equal(again.aiFixUsed, 1);
  assert.equal(world.ai.calls.fix, 1);
});

test("manual edit: one save, total stays 100, remainder to the last person, and it confirms the plan", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const types = draft.content.personTypes;
  const edit = (allocations: Record<string, number>, idempotencyKey = key()) => ({
    event: { allocation: draft.content.event.allocation, targetCount: draft.content.event.targetCount },
    expectedRevision: draft.revision,
    idempotencyKey,
    personTypes: types.map((type) => ({ allocation: allocations[type.key] ?? type.allocation, key: type.key, targetCount: type.targetCount })),
    steps: draft.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  });
  await assert.rejects(world.flow.manualEdit(draft.draftId, edit({ [types[0]!.key]: types[0]!.allocation + 5 }), JA), rejects("INVALID_INPUT"), "the total must stay 100");
  await assert.rejects(world.flow.manualEdit(draft.draftId, edit({ [types[0]!.key]: types[0]!.allocation + 3, [types[1]!.key]: types[1]!.allocation - 3 }), JA), rejects("INVALID_INPUT"), "5-point steps");
  const moved = edit({ [types[0]!.key]: types[0]!.allocation + 5, [types[1]!.key]: types[1]!.allocation - 5 });
  moved.steps = [...moved.steps.slice(0, 1).map((step) => ({ ...step, title: "名前を変えた" })), ...moved.steps.slice(1), { doneCriteria: "新しい目安", key: null, personTypeKeys: [types[0]!.key], title: "追加した Step" }];
  const confirmed = await world.flow.manualEdit(draft.draftId, moved, JA);
  assert.match(confirmed.href, /^\/app\/tasks\?tab=plan&plan=/);
  const detail = await world.planService.detail(confirmed.planId);
  assert.equal(detail!.content.steps[0]!.title, "名前を変えた");
  assert.equal(detail!.content.steps.at(-1)!.title, "追加した Step");
  assert.equal(detail!.quota.manualEditAvailable, false, "the one manual edit is used");
  await assert.rejects(world.flow.manualEdit(draft.draftId, edit({}), JA), rejects("DRAFT_CLOSED"));
});

test("confirming writes one active v2 plan, archives v1, keeps a manual edit for later, and is idempotent", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const first = await world.flow.confirm(draft.draftId, key(), JA);
  const second = await world.flow.confirm(draft.draftId, key(), JA);
  assert.equal(second.planId, first.planId);
  assert.equal(second.replayed, true);
  const summary = await world.planService.summary();
  assert.equal(summary.goals.filter((goal) => goal.status === "active").length, 1);
  const detail = await world.planService.detail(first.planId);
  assert.equal(detail!.quota.manualEditAvailable, true, "confirmed without a manual edit → one kept for later");
  assert.equal(detail!.goalKind, "fundraising");
  const intake = await world.flow.getIntake(premise.intakeId, JA);
  assert.equal(intake!.status, "planned");
  assert.equal(intake!.planId, first.planId);
  const state = world.repository.dump(SCOPE);
  assert.equal(state.plans.length, 1);
  assert.ok(state.typeItems.length === PLAN_GOAL_TEMPLATES.fundraising.slots.length - 1);
});

// R36a SC-R36a-01（D-1）：确定带初稿页的调整——同一套 plan-allocation 校验，通过则按调整建计划且不占手动编辑。
test("R36a: confirming with adjustments refuses what plan-allocation refuses, then builds the plan from the adjusted numbers without using the manual edit", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const types = draft.content.personTypes;
  assert.ok(types.length >= 3);
  const adjust = (allocations: Record<string, number>, keep = types): PlanDraftConfirmAdjustments => ({
    event: { allocation: draft.content.event.allocation, targetCount: draft.content.event.targetCount },
    expectedRevision: draft.revision,
    personTypes: keep.map((type) => ({ allocation: allocations[type.key] ?? type.allocation, key: type.key, targetCount: type.targetCount })),
  });
  const refusedBy = (code: PlanAllocationError) => (error: unknown) => error instanceof PlanFlowError && error.reason === "INVALID_INPUT" && error.details.allocationError === code;
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA, adjust({ [types[0]!.key]: types[0]!.allocation + 5 })), refusedBy("total_not_100"), "合计 ≠ 100");
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA, adjust({ [types[0]!.key]: types[0]!.allocation + 3, [types[1]!.key]: types[1]!.allocation - 3 })), refusedBy("not_multiple_of_step"), "5 分一档");
  const tooMany = adjust({});
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA, { ...tooMany, personTypes: tooMany.personTypes.map((type, index) => (index === 0 ? { ...type, targetCount: 6 } : type)) }), refusedBy("target_out_of_range"), "人数上限 5");
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA, { ...adjust({}), personTypes: [] }), rejects("INVALID_INPUT"), "删到 0 类");
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA, { ...adjust({}), personTypes: [{ allocation: 100 - draft.content.event.allocation, key: "no-such-type", targetCount: 1 }] }), rejects("INVALID_INPUT"), "未知类型");
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA, { ...adjust({}), expectedRevision: "someone-else" }), rejects("STALE"), "expectedRevision 过期");
  assert.equal(world.repository.dump(SCOPE).plans.length, 0, "a refused confirm creates nothing");

  // 通过：删掉最后一类、它的分给第一类、第二类人数改成 1。
  const removed = types[types.length - 1]!;
  const kept = types.slice(0, -1);
  const good = adjust({ [types[0]!.key]: types[0]!.allocation + removed.allocation }, kept);
  good.personTypes = good.personTypes.map((type, index) => (index === 1 ? { ...type, targetCount: 1 } : type));
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA, good);
  assert.equal(confirmed.replayed, false);
  const detail = await world.planService.detail(confirmed.planId);
  assert.equal(detail!.quota.manualEditAvailable, true, "D-1: adjustments on the draft page do not use the one manual edit");
  assert.deepEqual(
    detail!.content.personTypes.map((type) => [type.key, type.allocation, type.targetCount]),
    good.personTypes.map((type) => [type.key, type.allocation, type.targetCount]),
  );
  assert.equal(detail!.content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + detail!.content.event.allocation, 100);
  assert.ok(detail!.content.steps.every((step) => !step.personTypeKeys.includes(removed.key)), "the removed type leaves its step");
  assert.equal(detail!.content.steps.length, draft.content.steps.length, "steps are not edited on the draft page");
  const row = world.repository.dump(SCOPE).drafts.find((item) => item.id === draft.draftId)!;
  assert.equal(row.manualEditUsed, false);
  assert.equal(row.status, "confirmed");
  assert.equal(row.content.personTypes.length, kept.length, "the draft row keeps the adjusted content");
  // 已确定后再带调整 = 回放同一份计划，不再套调整。
  const again = await world.flow.confirm(draft.draftId, key(), JA, { ...good, expectedRevision: "ignored-after-confirm" });
  assert.equal(again.planId, confirmed.planId);
  assert.equal(again.replayed, true);
});

test("R36a regression: confirming without adjustments leaves the draft content untouched and answers with the same four fields", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const before = JSON.stringify(world.repository.dump(SCOPE).drafts.find((item) => item.id === draft.draftId)!.content);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  assert.deepEqual(Object.keys(confirmed).sort(), ["archivedV1PlanId", "href", "planId", "replayed"]);
  const row = world.repository.dump(SCOPE).drafts.find((item) => item.id === draft.draftId)!;
  assert.equal(JSON.stringify(row.content), before, "no adjustments → the stored content is byte for byte the draft");
  assert.equal(row.manualEditUsed, false);
  const detail = await world.planService.detail(confirmed.planId);
  assert.deepEqual(detail!.content.personTypes.map((type) => [type.key, type.allocation, type.targetCount]), draft.content.personTypes.map((type) => [type.key, type.allocation, type.targetCount]));
});

test("a third active goal is refused at confirm time", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  await world.planService.createPlanFromDraft(draftInput({ creationKey: "x1", goalId: "other-1" }));
  await world.planService.createPlanFromDraft(draftInput({ creationKey: "x2", goalId: "other-2" }));
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA), rejects("PLAN_GOAL_LIMIT"));
});

test("App deep links: the platform decides the href shape", async () => {
  const world = flowWorld();
  const intake = await world.flow.createIntake({ goalKind: "career", goalText: "キャリアを変えたい", idempotencyKey: key(), source: "task" }, { language: "en", platform: "app" });
  assert.equal(intake.href, `/plans/flow/${intake.intakeId}`);
});

/* ---------- R35 SC-R35-03 / 04：初版写入 v3、搜索三态与抛错、幂等回放；修正 / 手动编辑 / 重新生成路径保留 v3 字段 ---------- */

const UNVERIFIED_JA = PLAN_V3_UNVERIFIED_NETWORK_RISK.ja;
const WEB: Array<Omit<PlanWebSource, "id">> = [
  { fetchedAt: "2026-11-01T00:00:00.000Z", kind: "web", query: "シリーズA リード VC 2026", snippet: "…", title: "VC 動向", url: "https://example.jp/vc" },
  { fetchedAt: "2026-11-01T00:00:00.000Z", kind: "web", query: "CVC PoC 条件", snippet: "…", title: "CVC 動向", url: "https://example.jp/cvc" },
];

function fakeSearch(result: PlanSearchResult | (() => never)): PlanSearchLike & { calls: Array<{ input: PlanSearchInput; context: PlanSearchContext }> } {
  const calls: Array<{ input: PlanSearchInput; context: PlanSearchContext }> = [];
  return {
    calls,
    async search(input, context) {
      calls.push({ context, input });
      if (typeof result === "function") return result();
      return result;
    },
  };
}

/** 抓住交给 `firstDraftV3` 的输入（来源编号、answerKeys）。 */
function spyingAi() {
  const inputs: FirstDraftInputV3[] = [];
  const base = createMockPlanFlowAi();
  const ai = countingAi({ ...base, firstDraftV3: async (input, context) => { inputs.push(input); return base.firstDraftV3(input, context); } });
  return { ai, inputs };
}

const stepOf = (content: PlanV2Content, typeKey: string) => content.steps.find((step) => step.personTypeKeys.includes(typeKey))?.key ?? null;

test("R35: the first draft is written as schemaVersion 3 — every v3 block present, sources numbered S1… from the landscape, citations the landscape actually used, each person type carrying the step it belongs to", async () => {
  const { ai, inputs } = spyingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.equal(ai.calls.firstDraftV3, 1);
  assert.equal(ai.calls.firstDraft, 0, "the v2 first-draft call is no longer used for the initial draft");
  const content = draft.content;
  assert.equal(content.schemaVersion, 3);
  for (const field of ["outcome", "summary", "verdict", "confidence", "orderReasons", "comparison", "keyNumbers", "risks", "sources"] as const) assert.notEqual(content[field], undefined, field);
  assert.ok(content.summary!.text.length > 0 && content.summary!.refs.length > 0);
  // 来源：业界现状库条目在前、按 S1… 编号；没有搜索依赖 → 只有 landscape。
  const input = inputs[0]!;
  assert.deepEqual(input.sources.map((source) => source.id), input.sources.map((_, index) => `S${index + 1}`));
  assert.ok(input.sources.length > 0 && input.sources.every((source) => source.kind === "landscape"));
  assert.deepEqual(input.sources.map((source) => (source.kind === "landscape" ? source.landscapeId : null)), input.landscape.map((entry) => entry.id));
  assert.deepEqual(content.sources, input.sources, "the stored source list is the numbered list given to the model");
  // answerKeys = 前提表每行的 key（回答行 = questionId）。
  assert.deepEqual(input.answerKeys, draft.premise.map((row) => row.key));
  assert.ok(input.answerKeys.length > 0);
  // citations = 用到的 landscape 来源；依据区 / 出典照旧能解析。
  assert.ok(content.citations.length > 0 && draft.citations.every((citation) => citation.sourceUrl.startsWith("https://")));
  for (const citation of content.citations) assert.ok(input.sources.some((source) => source.kind === "landscape" && source.landscapeId === citation.id && source.version === citation.version));
  // stepKey 与 Step 的 personTypeKeys 一致。
  assert.ok(content.personTypes.length >= 3);
  for (const type of content.personTypes) {
    assert.ok(type.stepKey, `${type.key}: stepKey`);
    assert.equal(type.stepKey, stepOf(content, type.key), `${type.key}: the step that lists it`);
  }
  // 配点仍合计 100。
  assert.equal(content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + content.event.allocation, 100);
  // 没有搜索依赖 → 恰好多一条 unverified「本次未能联网核实」。
  const stored = world.repository.dump(SCOPE).drafts.find((row) => row.id === draft.draftId)!;
  assert.equal(stored.content.schemaVersion, 3);
  assert.equal(stored.content.risks!.filter((risk) => risk.kind === "unverified" && risk.text === UNVERIFIED_JA).length, 1);
  assert.ok(stored.content.risks!.length <= 3);
  assert.ok(stored.content.personTypes.every((type) => type.stepKey));
});

test("R35: search ok / partial add the web sources after the landscape ones and no network risk; unavailable, a throwing search and no search each add exactly one", async () => {
  const baseline = (await createMockPlanFlowAi().firstDraftV3({ answerKeys: [], background: "", contacts: [], eventSlot: { allocation: 10, targetCount: 2 }, gaps: [], goalKind: "fundraising", goalText: "x", landscape: [], premise: [], purpose: null, slots: [], sources: [{ id: "S1", kind: "landscape", landscapeId: "L-1", version: 1 }] }, { actorId: "a", language: "ja", ledgerKey: "k", now: new Date() }).catch(() => null));
  void baseline;
  const run = async (search: ReturnType<typeof fakeSearch> | undefined) => {
    const { ai, inputs } = spyingAi();
    const world = flowWorld({ ai, search });
    const premise = await premiseReady(world);
    const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
    return { draft, input: inputs[0]!, premise, search, world };
  };
  const ok = await run(fakeSearch({ failed: 0, queries: 8, sources: WEB, status: "ok" }));
  const landscapeCount = ok.input.landscape.length;
  assert.equal(ok.input.sources.length, landscapeCount + WEB.length);
  assert.deepEqual(ok.input.sources.slice(landscapeCount).map((source) => ({ ...source, id: undefined })), WEB.map((source) => ({ ...source, id: undefined })));
  assert.deepEqual(ok.input.sources.map((source) => source.id), ok.input.sources.map((_, index) => `S${index + 1}`), "web sources continue the numbering");
  assert.equal(ok.draft.content.risks!.filter((risk) => risk.text === UNVERIFIED_JA).length, 0, "ok: no network risk");
  // 搜索拿到的输入与上下文：目标 / 前提 / 语言，ledgerKeyPrefix = 初版的账本键。
  const call = ok.search!.calls[0]!;
  assert.equal(call.input.goalKind, "fundraising");
  assert.equal(call.input.language, "ja");
  assert.deepEqual(call.input.premise, ok.draft.premise);
  assert.equal(call.context.actorId, SCOPE.actorId);
  assert.match(call.context.ledgerKeyPrefix, /^draft:intake_[^:]+:\d+$/u);
  assert.equal(call.context.ledgerKeyPrefix, ok.world.ai.keys.at(-1), "the same ledger key the draft call uses");

  const partial = await run(fakeSearch({ failed: 3, queries: 8, sources: WEB.slice(0, 1), status: "partial" }));
  assert.equal(partial.input.sources.length, landscapeCount + 1);
  assert.equal(partial.draft.content.risks!.filter((risk) => risk.text === UNVERIFIED_JA).length, 0, "partial: no network risk");

  const unavailable = await run(fakeSearch({ failed: 8, queries: 8, sources: [], status: "unavailable" }));
  assert.equal(unavailable.input.sources.length, landscapeCount, "unavailable: landscape only");
  assert.equal(unavailable.draft.content.risks!.filter((risk) => risk.text === UNVERIFIED_JA).length, 1);

  const throwing = await run(fakeSearch(() => { throw new Error("tavily down"); }));
  assert.equal(throwing.search!.calls.length, 1);
  assert.equal(throwing.draft.content.schemaVersion, 3, "a throwing search never blocks the draft");
  assert.equal(throwing.input.sources.length, landscapeCount);
  assert.equal(throwing.draft.content.risks!.filter((risk) => risk.text === UNVERIFIED_JA).length, 1);

  const none = await run(undefined);
  assert.equal(none.draft.content.risks!.filter((risk) => risk.text === UNVERIFIED_JA).length, 1);
  // 风险条数不超过 3（fundraising 的 mock 本身带 2 条）。
  for (const item of [ok, partial, unavailable, throwing, none]) assert.ok(item.draft.content.risks!.length <= 3);
});

test("R35: replaying the first draft (same key, or asking again) returns the stored draft — the network risk is not added twice and the search is not called again", async () => {
  const search = fakeSearch({ failed: 8, queries: 8, sources: [], status: "unavailable" });
  const world = flowWorld({ search });
  const premise = await premiseReady(world);
  const draftKey = key("draft");
  const first = await world.flow.makeDraft(premise.intakeId, draftKey, JA);
  const replayed = await world.flow.makeDraft(premise.intakeId, draftKey, JA);
  const again = await world.flow.makeDraft(premise.intakeId, key(), JA);
  for (const view of [replayed, again]) {
    assert.equal(view.draftId, first.draftId);
    assert.deepEqual(view.content.risks, first.content.risks);
    assert.equal(view.content.risks!.filter((risk) => risk.text === UNVERIFIED_JA).length, 1);
  }
  assert.equal(search.calls.length, 1);
  assert.equal(world.ai.calls.firstDraftV3, 1);
  const fetched = await world.flow.getDraft(first.draftId, JA);
  assert.deepEqual(pickPlanV3Fields(fetched!.content), pickPlanV3Fields(first.content));
});

test("R35 SC-04: AI revision, reset, manual edit and confirm keep the v3 fields and step keys of a v3 draft untouched", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const v3 = pickPlanV3Fields(draft.content);
  const stepKeys = Object.fromEntries(draft.content.personTypes.map((type) => [type.key, type.stepKey]));
  assert.equal(v3.schemaVersion, 3);
  // AI 修正（mock 改第一步目安）：差分只在 Step，v3 字段与 stepKey 原样。
  const fixed = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "主催者には最初の 1 回は無料で試してほしい" }, JA);
  assert.ok(fixed.turns[0]!.changes.length > 0);
  assert.deepEqual(pickPlanV3Fields(fixed.content), v3);
  assert.deepEqual(Object.fromEntries(fixed.content.personTypes.map((type) => [type.key, type.stepKey])), stepKeys);
  assert.deepEqual(pickPlanV3Fields(fixed.originContent), v3, "originContent too");
  // 重新生成（もう一度 = reset 回原版）。
  const reset = await world.flow.reset(draft.draftId, key(), JA);
  assert.deepEqual(pickPlanV3Fields(reset.content), v3);
  assert.deepEqual(Object.fromEntries(reset.content.personTypes.map((type) => [type.key, type.stepKey])), stepKeys);
  // 手动编辑并确定 → 计划的 analysis 带 v3 字段，条目带 stepKey；详情透传。
  const types = reset.content.personTypes;
  const edit = {
    event: { allocation: reset.content.event.allocation, targetCount: reset.content.event.targetCount },
    expectedRevision: reset.revision,
    idempotencyKey: key(),
    personTypes: types.map((type, index) => ({ allocation: index === 0 ? type.allocation + 5 : index === 1 ? type.allocation - 5 : type.allocation, key: type.key, targetCount: type.targetCount })),
    steps: reset.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  };
  const confirmed = await world.flow.manualEdit(draft.draftId, edit, JA);
  const detail = await world.planService.detail(confirmed.planId);
  assert.deepEqual(pickPlanV3Fields(detail!.content), v3);
  assert.deepEqual(Object.fromEntries(detail!.content.personTypes.map((type) => [type.key, type.stepKey])), stepKeys);
  const stored = world.repository.dump(SCOPE).plans.find((plan) => plan.id === confirmed.planId)!;
  assert.equal(stored.analysis.schemaVersion, 3);
  assert.deepEqual(pickPlanV3Fields(stored.analysis), v3);
});

test("R35 SC-04: a review revision of a v3 plan keeps the v3 fields; a v2 plan stays v2 through review, revision and detail", async () => {
  // v3 计划 → 見直し → AI 修正：草稿内容仍带 v3 字段与 stepKey；确定后 analysis 不丢。
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const v3 = pickPlanV3Fields(draft.content);
  const { planId } = await world.flow.confirm(draft.draftId, key(), JA);
  const review = await world.flow.startReview(planId, key(), JA);
  assert.deepEqual(pickPlanV3Fields(review.draft.content), v3, "the review draft starts from the plan's v3 fields");
  assert.ok(review.draft.content.personTypes.every((type) => type.stepKey));
  const revised = await world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "主催者には最初の 1 回は無料で試してほしい" }, JA);
  assert.deepEqual(pickPlanV3Fields(revised.draft.content), v3);
  assert.ok(revised.draft.content.personTypes.every((type) => type.stepKey));
  const reviewed = await world.flow.manualEdit(review.draft.draftId, {
    event: { ...revised.draft.content.event },
    expectedRevision: revised.draft.revision,
    idempotencyKey: key(),
    personTypes: revised.draft.content.personTypes.map((type) => ({ allocation: type.allocation, key: type.key, targetCount: type.targetCount })),
    steps: revised.draft.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  }, JA);
  const detail = await world.planService.detail(reviewed.planId);
  assert.deepEqual(pickPlanV3Fields(detail!.content), v3);
  assert.ok(detail!.content.personTypes.every((type) => type.stepKey));

  // v2 旧计划：全程没有任何 v3 键。
  const legacy = flowWorld();
  const created = await legacy.planService.createPlanFromDraft(draftInput());
  const noV3 = (content: PlanV2Content, label: string) => {
    for (const field of PLAN_V3_FIELD_KEYS) assert.equal(field in content, false, `${label}: ${field}`);
    for (const type of content.personTypes) assert.equal("stepKey" in type, false, `${label}: stepKey`);
  };
  noV3(created.plan.content, "created");
  const opened = await legacy.flow.startReview(created.plan.planId, key(), JA);
  noV3(opened.draft.content, "review draft");
  const fixedLegacy = await legacy.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "VC を厚く" }, JA);
  noV3(fixedLegacy.draft.content, "revised review draft");
  noV3((await legacy.planService.detail(created.plan.planId))!.content, "detail");
  assert.equal(legacy.repository.dump(SCOPE).plans[0]!.analysis.schemaVersion, 2);
});

test("R35 SC-04: the real (deepseek) revision checker accepts a v3 draft — the AI sees no citations to mark, and citations / basis / v3 fields are restored after the revision", async () => {
  const ledger: AiQuotaGate = {
    async beginCall() { return { callId: "c" }; },
    async endCall() { /* noop */ },
    async finish() { /* noop */ },
    async reserve() { return { ok: true, operationId: "op", owner: true, status: "reserved" }; },
  };
  const seen: Array<{ current: { citations: unknown[]; diagnosis: string } }> = [];
  const chat = async ({ user }: { system: string; user: string }) => {
    const input = JSON.parse(user) as { current: { citations: unknown[]; diagnosis: string; steps: Array<{ doneCriteria: string }> } };
    seen.push(input);
    const steps = input.current.steps.map((step, index) => (index === 0 ? { ...step, doneCriteria: `${step.doneCriteria}（修正）` } : step));
    return { content: JSON.stringify({ noChangeReason: null, reasons: [{ path: "steps.0.doneCriteria", reason: "r" }], revised: { ...input.current, steps }, unchanged: [] }), usage: { inputTokens: 1, outputTokens: 1 } };
  };
  const deepseek = createDeepseekPlanFlowAi({ chat, ledger, log: () => undefined, model: "fake" });
  const mock = createMockPlanFlowAi();
  const world = flowWorld({ ai: countingAi({ ...mock, fix: deepseek.fix, reviewFix: deepseek.reviewFix }) });
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.ok(draft.content.citations.length > 0, "a v3 draft carries derived citations");
  const v3 = pickPlanV3Fields(draft.content);
  const fixed = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "主催者には最初の 1 回は無料で試してほしい" }, JA);
  assert.deepEqual(seen[0]!.current.citations, [], "the v2 revision prompt gets no citations for a v3 draft (its diagnosis has no markers)");
  assert.match(fixed.content.steps[0]!.doneCriteria, /（修正）$/u);
  assert.deepEqual(fixed.content.citations, draft.content.citations, "citations restored");
  assert.deepEqual(fixed.content.basis, draft.content.basis, "basis (premise / landscape / template) restored in order");
  assert.deepEqual(pickPlanV3Fields(fixed.content), v3);
  // 見直し修正同样。
  const { planId } = await world.flow.confirm(draft.draftId, key(), JA);
  const review = await world.flow.startReview(planId, key(), JA);
  const revised = await world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "投資家に寄せたい" }, JA);
  assert.deepEqual(revised.draft.content.citations, draft.content.citations);
  assert.deepEqual(pickPlanV3Fields(revised.draft.content), v3);
});
