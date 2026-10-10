import assert from "node:assert/strict";
import test from "node:test";

import {
  allocationSlotsOf,
  answersBody,
  editChanges,
  flowStage,
  goalGuessReady,
  initialAnswers,
  pickActiveV2Plan,
  planErrorView,
  stepsOf,
  teamDraftOf,
  teamGaps,
  toggleCapability,
  unitsOf,
  type PlanApiError,
} from "../../app/(app)/app/orbit-2026/plan/plan-model";
import { changeAllocation, removeSlot } from "../../shared/compute/plan-allocation";
import { draftFixture, intakeFixture, questionsIntake } from "./support/plan-flow-fixtures";

// R23 Web: the pure rules behind the plan screens (stage, errors, gaps, manual edit).
const error = (reason: string | null, extra: Partial<PlanApiError> = {}): PlanApiError => ({ code: "CONFLICT", limit: null, network: false, reason, retryOn: null, status: 409, ...extra });

test("stage: background / questions + premise / draft / AI 修正 once a revision is used", () => {
  assert.equal(flowStage({ status: "drafting" }, null), "background");
  assert.equal(flowStage({ status: "background" }, null), "background");
  assert.equal(flowStage({ status: "questions" }, null), "questions");
  assert.equal(flowStage({ status: "premise" }, null), "questions");
  assert.equal(flowStage({ status: "drafted" }, { aiFixUsed: 0 }), "draft");
  assert.equal(flowStage({ status: "drafted" }, { aiFixUsed: 2 }), "fix");
});

test("errors: a limit is never a failure; known reasons are notices; the rest is a failure of that step", () => {
  assert.deepEqual(planErrorView(error("AI_LIMIT", { limit: "monthly" }), "fix"), { limit: "monthly", tone: "limit" });
  assert.deepEqual(planErrorView(error("AI_LIMIT"), "draft"), { limit: "daily", tone: "limit" });
  assert.deepEqual(planErrorView(error("AI_FAILED", { status: 503 }), "draft"), { op: "draft", tone: "failure" });
  assert.deepEqual(planErrorView(error("GOAL_MONTHLY_LIMIT"), "other"), { notice: "goalsMonth", tone: "notice" });
  assert.deepEqual(planErrorView(error("PLAN_GOAL_LIMIT"), "other"), { notice: "activeGoals", tone: "notice" });
  assert.deepEqual(planErrorView(error("STALE"), "other"), { notice: "stale", tone: "notice" });
  for (const reason of ["FIX_LIMIT", "MANUAL_EDIT_USED", "LADDER_LIMIT"]) assert.deepEqual(planErrorView(error(reason), "fix"), { notice: "used", tone: "notice" });
  assert.deepEqual(planErrorView(error(null, { network: true, status: 0 }), "other"), { op: "other", tone: "failure" });
});

test("goal-kind guess waits for 6 characters (code points, trimmed)", () => {
  assert.equal(goalGuessReady("  資金調達  "), false);
  assert.equal(goalGuessReady("資金調達したい"), true);
  assert.equal(goalGuessReady("🚀🚀🚀🚀🚀🚀"), true);
});

test("空き is the rule over the visible members; solo counts only you", () => {
  const intake = intakeFixture();
  let team = teamDraftOf(intake.background.team.value);
  assert.deepEqual(teamGaps("launch", team, "self"), ["design", "brand", "sales", "marketing", "pricing"]);
  team = toggleCapability(team, "self", "design");
  assert.deepEqual(teamGaps("launch", team, "self"), ["brand", "sales", "marketing", "pricing"]);
  assert.deepEqual(teamGaps("launch", { ...team, mode: "solo" }, "self"), ["ops_infra", "brand", "sales", "marketing", "pricing"]);
  assert.deepEqual(teamGaps("unknown", team, "self"), []);
});

test("answers: untouched blanks go to the server's guess; touched ones are sent as chosen", () => {
  const intake = questionsIntake();
  const answers = initialAnswers(intake);
  assert.deepEqual(answers.R1, { text: "", touched: false, values: ["beta"] });
  answers.R2 = { text: " Organisers ", touched: true, values: ["businesses"] };
  assert.deepEqual(answersBody(intake, answers), [
    { questionId: "R1", text: null, values: [] },
    { questionId: "R2", text: "Organisers", values: ["businesses"] },
    { questionId: "R7", text: null, values: [] },
  ]);
});

test("the active v2 card: the current goal, else the first active one, else none", () => {
  const score = { overflow: 0, remainingToFull: 88, segments: [], skipped: 0, talked: 12, todayDelta: 0, total: 12 };
  assert.equal(pickActiveV2Plan(null), null);
  assert.equal(pickActiveV2Plan({ current: null, goals: [] }), null);
  assert.deepEqual(pickActiveV2Plan({ current: { goal: "G", goalKind: "sales", planId: "p1", score }, goals: [] }), { goal: "G", goalKind: "sales", planId: "p1", total: 12 });
  assert.deepEqual(pickActiveV2Plan({ current: null, goals: [{ goal: "Done", goalKind: "sales", planId: "p0", status: "achieved", talkedPeople: 3, total: 100 }, { goal: "H", goalKind: "hiring", planId: "p2", status: "active", talkedPeople: 0, total: 0 }] }), { goal: "H", goalKind: "hiring", planId: "p2", total: 0 });
});

test("manual edit: the change list names renames, explicit moves, points, counts with the remainder rule, and removed types", () => {
  const draft = draftFixture();
  const typeName = (key: string) => key;
  let slots = allocationSlotsOf(draft.goalKind, draft.content);
  const steps = stepsOf(draft.content);
  assert.deepEqual(editChanges({ content: draft.content, moved: new Set(), slots, steps, typeName }), []);
  const moved = changeAllocation(slots, "same_path_founder", 15);
  assert.ok(moved.ok);
  slots = moved.slots;
  assert.equal(slots.reduce((sum, slot) => sum + slot.allocation, 0), 100);
  slots = slots.map((slot) => (slot.key === "first_payer" ? { ...slot, targetCount: 2 } : slot));
  const reordered = [steps[1]!, steps[0]!, { ...steps[2]!, title: "Find a designer" }];
  const changes = editChanges({ content: draft.content, moved: new Set(["step-2"]), slots, steps: reordered, typeName });
  assert.deepEqual(changes.map((change) => change.kind), ["order", "name", "points", "count", "points"]);
  const count = changes.find((change) => change.kind === "count");
  assert.deepEqual(count && { ...count, anchor: undefined }, { allocation: 25, anchor: undefined, from: 5, kind: "count", to: 2, type: "first_payer" });
  assert.deepEqual(unitsOf(25, 2), { even: false, last: 13, points: 12 });
  assert.deepEqual(unitsOf(20, 2), { even: true, points: 10 });
  const removed = removeSlot(slots, "prior_product");
  assert.ok(removed.ok);
  const after = editChanges({ content: draft.content, moved: new Set(), slots: removed.slots, steps, typeName });
  assert.ok(after.some((change) => change.kind === "removeType" && change.type === "prior_product"));
});
