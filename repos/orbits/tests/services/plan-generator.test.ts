/**
 * W0008 SC-02：mock 计划生成器与一次生成的编排。
 *
 * - 周期按期限：一个月内 2–3 段按周（现有人脉 ≥3 位时 3 段）、3 个月内 3 段按周（12 周）、
 *   一年内 4 个季度段且只有第一段细到周；
 * - 阶段细节有界并行，完成先后不影响结果顺序；任一阶段失败整份失败（报顺序最靠前的那个阶段）；
 * - 计划里的联系人／活动只来自输入；人脉需求带分类内的一二级行业与职位关键词。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import {
  generatePlanDraft,
  mapBounded,
  PlanGenerationError,
  type PlanDraft,
  type PlanGenerator,
} from "../../features/plans/generator";
import { DEFAULT_GOAL_ARCHETYPE, GOAL_ARCHETYPES, goalArchetype, goalTarget } from "../../features/plans/goal-signals";
import { createMockPlanGenerator, planPhaseFrames } from "../../features/plans/mock-generator";
import { collectPlanReferences, validateGeneratedPlan } from "../../features/plans/validate";
import { validateIndustrySelection } from "../../shared/domain/industries";
import { CONTACTS, EVENTS, ME, generatorInput } from "../support/plan-bootstrap-fixture";

const weeks = (draft: PlanDraft) => draft.phases.map((phase) => [phase.startWeek, phase.endWeek, phase.granularity]);

function assertItemsInsidePhases(draft: PlanDraft) {
  for (const item of draft.items) {
    const phase = draft.phases.find((entry) => entry.key === item.phaseKey);
    assert.ok(phase, `item ${item.title} has no phase`);
    if (item.suggestedWeek !== null && item.suggestedWeek !== undefined) {
      assert.ok(item.suggestedWeek >= phase.startWeek && item.suggestedWeek <= phase.endWeek, `${item.title} is outside ${phase.key}`);
    }
  }
}

async function validates(draft: PlanDraft, input = generatorInput()) {
  await validateGeneratedPlan({
    draft,
    generatorInput: input,
    references: createAllowListPlanReferenceValidator({
      actorId: ME,
      allowList: { contactsByActor: { [ME]: input.contacts.map((entry) => entry.id) }, eventIds: input.events.map((entry) => entry.id) },
    }),
  });
}

test("3 months: three weekly phases over 12 weeks (1–3 / 4–8 / 9–12), every item inside its phase", async () => {
  const input = generatorInput({ horizon: "quarter" });
  const draft = await generatePlanDraft(createMockPlanGenerator(), input);
  assert.deepEqual(weeks(draft), [[1, 3, "week"], [4, 8, "week"], [9, 12, "week"]]);
  assert.equal(draft.horizon, "quarter");
  assert.equal(draft.startsOn, "2026-09-28");
  assertItemsInsidePhases(draft);
  assert.ok(draft.items.filter((item) => item.kind === "action").every((item) => typeof item.suggestedWeek === "number"));
  assert.deepEqual(draft.analysis.phases.map((phase) => phase.detailed), [true, true, true]);
  await validates(draft, input);
});

test("1 month: three weekly phases with an existing network of ≥3, two without; all within weeks 1–4", async () => {
  const three = await generatePlanDraft(createMockPlanGenerator(), generatorInput({ horizon: "month" }));
  assert.deepEqual(weeks(three), [[1, 1, "week"], [2, 2, "week"], [3, 4, "week"]]);
  assert.equal(three.phases[0]!.title, "借力现有人脉");
  assertItemsInsidePhases(three);

  const smallInput = generatorInput({ contacts: CONTACTS.slice(0, 2), contactsTotal: 2, horizon: "month" });
  const two = await generatePlanDraft(createMockPlanGenerator(), smallInput);
  assert.deepEqual(weeks(two), [[1, 2, "week"], [3, 4, "week"]]);
  assertItemsInsidePhases(two);
  await validates(two, smallInput);
  assert.deepEqual(planPhaseFrames("month", 0).length, 2);
});

test("1 year: four quarterly phases and only the first one is detailed down to weeks", async () => {
  const input = generatorInput({ horizon: "year" });
  const draft = await generatePlanDraft(createMockPlanGenerator(), input);
  assert.deepEqual(weeks(draft), [[1, 13, "quarter"], [14, 26, "quarter"], [27, 39, "quarter"], [40, 52, "quarter"]]);
  assert.deepEqual(draft.analysis.phases.map((phase) => phase.detailed), [true, false, false, false]);
  const firstActions = draft.items.filter((item) => item.phaseKey === "q1" && item.kind === "action");
  assert.ok(firstActions.length > 0 && firstActions.every((item) => typeof item.suggestedWeek === "number"));
  const later = draft.items.filter((item) => item.phaseKey !== "q1");
  assert.ok(later.length > 0);
  assert.ok(later.every((item) => (item.suggestedWeek ?? null) === null), "later quarters carry no weekly steps yet");
  await validates(draft, input);
});

test("the plan only references the actor's own contacts and real catalogue events from its input", async () => {
  for (const horizon of ["month", "quarter", "year"] as const) {
    const draft = await generatePlanDraft(createMockPlanGenerator(), generatorInput({ horizon }));
    const { contactIds, eventIds } = collectPlanReferences(draft);
    assert.ok(contactIds.length > 0 && contactIds.every((id) => CONTACTS.some((entry) => entry.id === id)));
    assert.ok(eventIds.length > 0 && eventIds.every((id) => EVENTS.some((entry) => entry.id === id)));
  }
  // 别人的联系人即使混进输入也不会被引用。
  const leaked = generatorInput({ contacts: [...CONTACTS, { ...CONTACTS[0]!, id: "contact:someone-else", ownerId: "actor:other" }] });
  const draft = await generatePlanDraft(createMockPlanGenerator(), leaked);
  assert.ok(!collectPlanReferences(draft).contactIds.includes("contact:someone-else"));
});

test("network needs carry taxonomy industries and role keywords; every goal rule uses a valid industry pair", async () => {
  const draft = await generatePlanDraft(createMockPlanGenerator(), generatorInput());
  const needs = draft.items.filter((item) => item.kind === "network_need");
  assert.equal(needs.length, 3);
  for (const need of needs) {
    assert.ok(need.criteria, `${need.title} has criteria`);
    assert.equal(validateIndustrySelection(need.criteria!).valid, true, `${need.title} industries are in the taxonomy`);
    assert.ok((need.criteria!.titleKeywords ?? []).length > 0);
  }
  // 「客户」目标本身不带行业：用联系人里最常见的一级行业补上。
  const target = needs.find((need) => need.title === "目标客户里能拍板的人");
  assert.equal(target?.criteria?.primaryIndustryId, "manufacturing_supply_chain");
  assert.deepEqual([...draft.analysis.gaps].sort(), needs.map((need) => need.title).sort(), "the 'still missing' chips are the network needs");

  for (const archetype of [...GOAL_ARCHETYPES, DEFAULT_GOAL_ARCHETYPE]) {
    assert.equal(validateIndustrySelection(archetype).valid, true, archetype.key);
  }
  assert.equal(goalArchetype("一个月内见 10 位关注我们赛道的投资人").key, "investor");
  assert.equal(goalArchetype("三个月内认识 3 位日本市场的渠道伙伴").key, "channel");
  assert.equal(goalArchetype("从 0 到 1 打造自有品牌").key, "general");
});

test("the answer card leads with the conclusion: one-liner, three figures, this week, allies, risk and pitch", async () => {
  const draft = await generatePlanDraft(createMockPlanGenerator(), generatorInput());
  const { analysis } = draft;
  const oneLiner = analysis.answer.map((segment) => segment.text).join("");
  assert.match(oneLiner, /^12 周分 3 步/);
  assert.deepEqual(analysis.answer.filter((segment) => segment.emphasis).map((segment) => segment.text), [
    "王砚",
    "JETRO 外资企业商务交流会",
    "10 位企业决策人",
    "10 家",
  ]);
  assert.deepEqual(analysis.figures.map((figure) => [figure.value, figure.unit]), [["10", "家"], ["10", "位"], ["2", "场"]]);
  assert.equal(analysis.thisWeek.length, 3);
  assert.deepEqual(analysis.allies.map((ally) => ally.name), ["王砚", "佐藤美咲", "林志远"]);
  assert.match(analysis.pitch.text, /我更想先从制造业客户开始/);
  assert.ok(analysis.risk.length > 0);
  assert.deepEqual(analysis.read, { contacts: 3, contactsTotal: 3, events: 3 });
  assert.equal(analysis.generator, "mock-template-v1");

  const english = await generatePlanDraft(createMockPlanGenerator(), generatorInput({ locale: "en" }));
  assert.match(english.analysis.answer.map((segment) => segment.text).join(""), /^12 weeks in 3 steps/);
  assert.equal(english.phases[0]!.title, "Map the ground");
});

test("the same input always produces the same plan", async () => {
  const a = await generatePlanDraft(createMockPlanGenerator(), generatorInput());
  const b = await generatePlanDraft(createMockPlanGenerator(), generatorInput());
  assert.deepEqual(a, b);
});

test("phase details run with bounded parallelism and are assembled in phase order, not completion order", async () => {
  const base = createMockPlanGenerator();
  let running = 0;
  let peak = 0;
  const finished: string[] = [];
  const delays: Record<string, number> = { p1: 30, p2: 15, p3: 1 };
  const slow: PlanGenerator = {
    ...base,
    async phaseDetail(input, phase) {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delays[phase.key]));
      running -= 1;
      finished.push(phase.key);
      return base.phaseDetail(input, phase);
    },
  };
  const draft = await generatePlanDraft(slow, generatorInput(), { concurrency: 2 });
  assert.equal(peak, 2, "never more than two phases at once");
  assert.notDeepEqual(finished, ["p1", "p2", "p3"], "completion order differs from phase order");
  assert.deepEqual(draft, await generatePlanDraft(base, generatorInput()));

  assert.deepEqual(await mapBounded([3, 1, 2], 2, async (value) => value * 10), [30, 10, 20]);
});

test("one failing phase fails the whole plan; with several failures the earliest phase is reported", async () => {
  const base = createMockPlanGenerator();
  const failing = (keys: string[]): PlanGenerator => ({
    ...base,
    async phaseDetail(input, phase) {
      if (keys.includes(phase.key)) throw new Error(`boom ${phase.key}`);
      return base.phaseDetail(input, phase);
    },
  });
  await assert.rejects(generatePlanDraft(failing(["p2"]), generatorInput()), (error: unknown) => {
    assert.ok(error instanceof PlanGenerationError);
    assert.equal(error.phaseKey, "p2");
    return true;
  });
  await assert.rejects(generatePlanDraft(failing(["p3", "p2"]), generatorInput()), (error: unknown) => {
    assert.ok(error instanceof PlanGenerationError);
    assert.equal(error.phaseKey, "p2");
    return true;
  });
  const brokenSkeleton: PlanGenerator = { ...base, skeleton: async () => Promise.reject(new Error("no skeleton")) };
  await assert.rejects(generatePlanDraft(brokenSkeleton, generatorInput()), (error: unknown) => {
    assert.ok(error instanceof PlanGenerationError);
    assert.equal(error.phaseKey, null);
    return true;
  });
});

test("goal numbers: time and horizon numbers are ignored, only business outcomes count, otherwise no number", async () => {
  assert.deepEqual(goalTarget("Within 3 months, get 10 enterprise customers"), { unit: { en: "customers", zh: "家" }, value: 10 });
  assert.equal(goalTarget("Build a brand from 0 to 1"), null);
  assert.deepEqual(goalTarget("3 个月内认识 20 位本行业的决策者"), { unit: { en: "people", zh: "位" }, value: 20 });
  assert.equal(goalTarget("3 个月内完成第一版试用"), null, "the horizon number is not an outcome");
  assert.equal(goalTarget("从 0 到 1 打造自有品牌"), null);
  assert.deepEqual(goalTarget("Get 10 business customers onto a trial within three months")?.value, 10);
  assert.deepEqual(goalTarget("Open 2 stores in 12 months"), { unit: { en: "stores", zh: "家" }, value: 2 });

  // 没有可靠的结果数字：关键数字与一句话回答都不编数字（第一个数字是计划周期）。
  for (const text of ["Build a brand from 0 to 1", "3 个月内完成第一版试用"]) {
    const draft = await generatePlanDraft(createMockPlanGenerator(), generatorInput({ goal: { horizon: "quarter", snapshot: text, text } }));
    assert.deepEqual(draft.analysis.figures[0], { label: "计划周期", unit: "周", value: "12" });
    const oneLiner = draft.analysis.answer.map((segment) => segment.text).join("");
    assert.doesNotMatch(oneLiner, /拿下/);
    assert.ok(!draft.items.some((item) => /达成 \d/.test(item.title)));
  }
});
