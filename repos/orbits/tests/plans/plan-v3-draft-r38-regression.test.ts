/**
 * R38-01：真实 DeepSeek（提示词 v9）第一次输出被 `checkDraftV3` 拒绝的原文（`tests/fixtures/plan-v3/r38-rejected-first-drafts.json`，
 * 取自 R38 真调用日志）。能确定性修的必须修好并通过；修不了的（`outcome` 超长）仍拒绝，交给同一操作内的修复重试。
 * 输入按原文还原：来源 id / 回答 key / 联系人别名取原文里引用到的，短名字典补上原文用到的那个（真实输入按行业给的候选里有它）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES, planShortNameCandidates } from "../../shared/compute/plan-templates";
import type { PlanGoalKind, PlanSource } from "../../shared/contract/plan-v2";
import { checkDraftV3, type ContentCheckInputV3 } from "../../features/plans/v2/ai/schemas-v3";

interface Rejected { run: string; goalKind: PlanGoalKind; attempt: number; issues: string[]; content: Record<string, unknown> }
const FIXTURES = JSON.parse(readFileSync(new URL("../fixtures/plan-v3/r38-rejected-first-drafts.json", import.meta.url), "utf8")) as Rejected[];

function inputFor(fixture: Rejected): ContentCheckInputV3 {
  const content = fixture.content as { personTypes: Array<{ slot: string; shortLabelId: string; introRoutes?: Array<{ viaAlias: string }> }>; summary: Array<{ refs: Array<{ kind: string; sourceId?: string; questionKey?: string }> }> };
  const used = new Map(content.personTypes.map((type) => [type.slot, type.shortLabelId]));
  const slots = PLAN_GOAL_TEMPLATES[fixture.goalKind].slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => {
    const ids = new Set([...planShortNameCandidates(slot.slot, []), ...(used.has(slot.slot) ? [used.get(slot.slot)!] : [])]);
    return { allocation: slot.allocation, emoji: slot.emoji, shortNames: [...ids].map((id) => ({ id, label: id })), slot: slot.slot, targetCount: slot.targetCount };
  });
  const text = JSON.stringify(fixture.content);
  const sourceIds = [...new Set(text.match(/"S\d+"/gu) ?? [])].map((id) => id.slice(1, -1));
  const sources: PlanSource[] = sourceIds.map((id, index) => ({ id, kind: "landscape", landscapeId: `L-${index + 1}`, version: 1 }));
  const answerKeys = new Set(content.summary.flatMap((sentence) => sentence.refs.flatMap((ref) => (ref.kind === "answer" && ref.questionKey ? [ref.questionKey] : []))));
  const aliases = new Set(content.personTypes.flatMap((type) => (type.introRoutes ?? []).map((route) => route.viaAlias)));
  return { aliases, answerKeys, enforceTemplate: true, goalKind: fixture.goalKind, landscape: sources.map((source) => ({ id: (source as { landscapeId: string }).landscapeId, summary: "s", title: "t", version: 1 })), slots, sources };
}

const fixture = (run: string, goalKind: PlanGoalKind, attempt: number) => FIXTURES.find((item) => item.run === run && item.goalKind === goalKind && item.attempt === attempt)!;

for (const [run, goalKind, attempt, expectedRepair] of [
  ["run-01", "fundraising", 1, "orphan_type_attached:cfo"],
  ["run-02", "sales", 1, "orphan_type_attached:senior_seller"],
  ["run-03", "hiring", 1, "event_person_type_dropped"],
] as const) {
  test(`R38 real rejection ${run} ${goalKind} attempt ${attempt} is repaired deterministically and passes (${expectedRepair})`, () => {
    const checked = checkDraftV3(structuredClone(fixture(run, goalKind, attempt).content), inputFor(fixture(run, goalKind, attempt)));
    assert.equal(checked.ok, true, JSON.stringify((checked as { issues?: string[] }).issues));
    if (checked.ok !== true) return;
    assert.ok(checked.repairs?.includes(expectedRepair), JSON.stringify(checked.repairs));
    const stepKeys = new Set(checked.value.steps.map((_, index) => `step-${index + 1}`));
    for (const type of checked.value.personTypes) {
      assert.notEqual(type.slot, PLAN_EVENT_SLOT);
      assert.ok(stepKeys.has(type.stepKey), `${type.slot} has a step`);
      assert.ok(type.targetCount >= 1 && type.targetCount <= 5, `${type.slot} target in 1–5`);
      assert.ok(type.allocation >= 5);
      assert.ok(checked.value.steps.some((step) => step.personTypeKeys.includes(type.slot)), `${type.slot} listed in a step`);
    }
    assert.equal(checked.value.personTypes.reduce((sum, type) => sum + type.allocation, 0) + checked.value.event.allocation, 100);
  });
}

test("R38 real rejection: hiring zero-point slot comes back at the template allocation with a 1–5 target", () => {
  const checked = checkDraftV3(structuredClone(fixture("run-03", "hiring", 1).content), inputFor(fixture("run-03", "hiring", 1)));
  assert.equal(checked.ok, true, JSON.stringify((checked as { issues?: string[] }).issues));
  if (checked.ok !== true) return;
  const host = checked.value.personTypes.find((type) => type.slot === "community_host")!;
  assert.equal(host.targetCount, 1);
  assert.ok(checked.repairs?.includes("target_clamped:community_host"));
  assert.ok(checked.repairs?.includes("allocations_reset_to_template"));
});

test("R38 real rejection run-02 hiring attempt 1: the event-as-person-type and null why are repaired; the one left is a type with 2 questions (cannot be invented → retry)", () => {
  const checked = checkDraftV3(structuredClone(fixture("run-02", "hiring", 1).content), inputFor(fixture("run-02", "hiring", 1)));
  assert.equal(checked.ok, false);
  if (checked.ok !== false) return;
  assert.deepEqual(checked.issues, ["personType community_host: three questions"]);
});

test("R38 real rejection: an outcome over 20 characters is still rejected (no safe way to shorten it; the retry carries the reason)", () => {
  const checked = checkDraftV3(structuredClone(fixture("run-02", "hiring", 2).content), inputFor(fixture("run-02", "hiring", 2)));
  assert.equal(checked.ok, false);
  if (checked.ok !== false) return;
  assert.deepEqual(checked.issues, ["outcome: at most 20 characters"]);
});

test("step subtitles: kept when ≤10 characters (CJK) / ≤24 (Latin), dropped to null otherwise — never a rejection", () => {
  const base = fixture("run-01", "fundraising", 1);
  const content = structuredClone(base.content) as { steps: Array<{ why: string | null }> };
  content.steps[0]!.why = "資料の土台づくり";
  content.steps[1]!.why = "リード候補とVC・CVCの面談を進める段階";
  content.steps[2]!.why = "Close the round";
  const checked = checkDraftV3(content, inputFor(base));
  assert.equal(checked.ok, true, JSON.stringify((checked as { issues?: string[] }).issues));
  if (checked.ok !== true) return;
  assert.deepEqual(checked.value.steps.map((step) => step.why), ["資料の土台づくり", null, "Close the round"]);
  assert.ok(checked.repairs?.includes("step_why_dropped:2"));
});
