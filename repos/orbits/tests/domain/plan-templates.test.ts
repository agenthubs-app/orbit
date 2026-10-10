import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_CAPABILITY_COPY, PLAN_GOAL_KIND_COPY, PLAN_QUESTION_COPY, PLAN_SHORT_NAME_COPY } from "../../shared/compute/plan-template-copy";
import {
  allPlanShortNameIds,
  checkTemplateAdjustment,
  guessGoalKindByKeywords,
  PLAN_EVENT_SLOT,
  PLAN_GOAL_KINDS,
  PLAN_GOAL_TEMPLATES,
  planCapabilityGaps,
  planShortNameCandidates,
} from "../../shared/compute/plan-templates";

// R22（DESIGN §3.4，b10 规范板）：6 类目标模板。
test("every template: 8 capabilities, 6–8 questions, allocations in steps of 5 that add up to 100, an event slot", () => {
  for (const kind of PLAN_GOAL_KINDS) {
    const template = PLAN_GOAL_TEMPLATES[kind];
    assert.equal(template.kind, kind);
    assert.equal(template.capabilities.length, 8, kind);
    assert.equal(new Set(template.capabilities).size, 8, kind);
    assert.ok(template.questions.length >= 6 && template.questions.length <= 8, kind);
    assert.equal(template.slots.reduce((sum, slot) => sum + slot.allocation, 0), 100, kind);
    for (const slot of template.slots) {
      assert.equal(slot.allocation % 5, 0, `${kind}.${slot.slot}`);
      assert.ok(slot.targetCount >= 1 && slot.targetCount <= (slot.slot === PLAN_EVENT_SLOT ? 10 : 5), `${kind}.${slot.slot}`);
    }
    assert.equal(template.slots.filter((slot) => slot.slot === PLAN_EVENT_SLOT).length, 1, kind);
  }
});

test("the launch and fundraising defaults match the b10 spec board", () => {
  const values = (kind: "launch" | "fundraising") => Object.fromEntries(PLAN_GOAL_TEMPLATES[kind].slots.map((slot) => [slot.slot, slot.allocation]));
  assert.deepEqual(values("launch"), { brand_pr: 15, event: 15, first_payer: 25, heavy_user: 5, missing_expert: 10, prior_product: 15, same_path_founder: 15 });
  assert.deepEqual(values("fundraising"), { angel: 10, cfo: 10, cvc: 15, event: 10, funded_founder: 15, lawyer: 10, vc_partner: 30 });
  assert.deepEqual(PLAN_GOAL_TEMPLATES.launch.questions.map((question) => question.id), ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]);
});

test("every id has text in three languages", () => {
  for (const kind of PLAN_GOAL_KINDS) {
    const template = PLAN_GOAL_TEMPLATES[kind];
    assert.ok(PLAN_GOAL_KIND_COPY[kind].ja);
    for (const capability of template.capabilities) assert.ok(PLAN_CAPABILITY_COPY[capability], capability);
    for (const question of template.questions) {
      const copy = PLAN_QUESTION_COPY[question.id];
      assert.ok(copy, question.id);
      for (const language of ["ja", "zh", "en"] as const) assert.ok(copy.prompt[language] && copy.topic[language], question.id);
      for (const option of question.options) assert.ok(copy.options[option]?.ja && copy.options[option]?.zh && copy.options[option]?.en, `${question.id}.${option}`);
    }
  }
  for (const id of allPlanShortNameIds()) {
    const copy = PLAN_SHORT_NAME_COPY[id];
    assert.ok(copy?.ja && copy.zh && copy.en, id);
  }
});

test("short names come from a fixed dictionary: the generic slot name plus listed industry overrides", () => {
  assert.deepEqual(planShortNameCandidates("first_payer", ["community_nonprofit"]), ["first_payer", "first_payer@community_nonprofit"]);
  assert.deepEqual(planShortNameCandidates("first_payer", ["finance_investment"]), ["first_payer"]);
  assert.equal(PLAN_SHORT_NAME_COPY["first_payer@community_nonprofit"]!.ja, "交流会の主催者");
});

test("template adjustment: ±5 at most in two places, total 100", () => {
  const base = Object.fromEntries(PLAN_GOAL_TEMPLATES.launch.slots.map((slot) => [slot.slot, slot.allocation]));
  assert.deepEqual(checkTemplateAdjustment("launch", base), { ok: true });
  // b10 ④: brand_pr 15 → 20, heavy_user 5 → 0.
  assert.deepEqual(checkTemplateAdjustment("launch", { ...base, brand_pr: 20, heavy_user: 0 }), { ok: true });
  assert.equal(checkTemplateAdjustment("launch", { ...base, brand_pr: 25, heavy_user: 0, first_payer: 20 }).ok, false);
  assert.equal(checkTemplateAdjustment("launch", { ...base, brand_pr: 20, heavy_user: 0, first_payer: 20, missing_expert: 15 }).ok, false);
  assert.equal(checkTemplateAdjustment("launch", { ...base, brand_pr: 20 }).ok, false);
});

test("capability gaps are a rule over the fixed list", () => {
  assert.deepEqual(planCapabilityGaps("launch", [{ capabilities: ["product", "ai_data", "ops_infra"] }, { capabilities: ["product", "ai_data"] }]), ["design", "brand", "sales", "marketing", "pricing"]);
});

test("keyword fallback for the goal kind", () => {
  assert.equal(guessGoalKindByKeywords("シリーズA 資金調達（3億円）"), "fundraising");
  assert.equal(guessGoalKindByKeywords("Orbit を落地して黒字化したい"), "launch");
  assert.equal(guessGoalKindByKeywords("エンジニアを 2 人採用したい"), "hiring");
  assert.equal(guessGoalKindByKeywords("なにか"), "launch");
});
