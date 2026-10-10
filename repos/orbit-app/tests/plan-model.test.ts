import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PlanDraftView, PlanIntakeView } from "../src/api/contract/plan-v2";
import { planDraftViewSchema, planIntakeViewSchema } from "../src/api/schema/plan-v2";
import { planFailureOf } from "../src/screens/plan/plan-failure";
import {
  addType,
  allocationTotal,
  changeCount,
  currentBlock,
  editAllocation,
  editTargetCount,
  flowStage,
  manualEditReady,
  manualEditRequest,
  manualEditStateOf,
  moveStep,
  rankCandidates,
  removeType,
  stepTypeChips,
  teamDraftOf,
  teamGaps,
  toggleCapability,
  turnChipText,
  typeLetters,
  unusedTemplateSlots,
} from "../src/screens/plan/plan-model";
import { unitPoints } from "../src/api/compute/plan-allocation";

// R23 App plan screens: the pure rules the screens use (UI-SPEC ②③). The fixture is
// the orbits mock service's own answers, read through the synced schemas.
const mock = JSON.parse(readFileSync(new URL("./fixtures/plan-flow-mock.json", import.meta.url), "utf8"));
const intake = planIntakeViewSchema.parse(mock.intakeBackground) as PlanIntakeView;
const draft = planDraftViewSchema.parse(mock.draft) as PlanDraftView;

test("progress: background → questions → first draft → AI revisions", () => {
  assert.equal(flowStage({ status: "background" }, null), 0);
  assert.equal(flowStage({ status: "questions" }, null), 1);
  assert.equal(flowStage({ status: "premise" }, null), 1);
  assert.equal(flowStage({ status: "drafted" }, { aiFixUsed: 0 }), 2);
  assert.equal(flowStage({ status: "drafted" }, { aiFixUsed: 1 }), 3);
});

test("background blocks are confirmed in order: わたし, then チーム, then 目的", () => {
  assert.equal(currentBlock(intake), "me");
  const meDone = { ...intake, background: { ...intake.background, me: { ...intake.background.me, confirmedAt: "x" } } };
  assert.equal(currentBlock(meDone), "team");
  const teamDone = { ...meDone, background: { ...meDone.background, team: { ...meDone.background.team, confirmedAt: "x" } } };
  assert.equal(currentBlock(teamDone), "purpose");
  assert.equal(currentBlock({ ...teamDone, background: { ...teamDone.background, purpose: { ...teamDone.background.purpose, confirmedAt: "x" } } }), null);
});

test("空き is the template rule over the local ticks; 一人 counts only you", () => {
  const members = intake.background.team.value.members;
  let draftTicks = teamDraftOf(members);
  const before = teamGaps("launch", "team", members, draftTicks);
  assert.ok(before.includes("design") === false, "the co-founder covers design in the mock");
  assert.ok(before.includes("brand"));
  draftTicks = toggleCapability(draftTicks, "self", "brand");
  assert.equal(teamGaps("launch", "team", members, draftTicks).includes("brand"), false);
  assert.ok(teamGaps("launch", "solo", members, draftTicks).includes("design"), "solo drops the co-founder's design");
});

test("人脈から選ぶ: co-founders first, then people who fill a gap; members already in the team are left out", () => {
  const ranked = rankCandidates([
    { id: "a", name: "A", organization: "Acme", role: "Engineer", tags: [] },
    { id: "b", name: "B", organization: "", role: "UI デザイナー", tags: [] },
    { id: "c", name: "C", organization: "", role: "", tags: ["共同創業者"] },
    { id: "d", name: "D", organization: "", role: "Designer", tags: [] },
  ], ["design", "brand"], new Set(["d"]));
  assert.deepEqual(ranked.map((item) => item.id), ["c", "b", "a"]);
  assert.deepEqual(ranked[1]!.fills, ["design"]);
});

test("plan card: types are lettered in order; a step shows emoji + letter, the event slot only 🎟️", () => {
  const letters = typeLetters(draft.content.personTypes);
  assert.equal(letters.get("first_payer"), "A");
  assert.equal(letters.get("heavy_user"), "F");
  assert.deepEqual(stepTypeChips(["first_payer", "brand_pr", "event"], draft.content.personTypes), ["🎪 A", "🎨 B", "🎟️"]);
  assert.equal(turnChipText("営業は当面 2人でやる。仲間はデザイン"), "営業は当面 2人でやる。…");
});

test("manual edit: an allocation change takes 5 at a time from the highest types and the total stays 100", () => {
  const origin = manualEditStateOf(draft.content);
  assert.equal(allocationTotal(origin), 100);
  // missing_expert 10 → 15: the 5 points come from first_payer (25, the highest).
  const edited = editAllocation(origin, "launch", "missing_expert", 15);
  assert.ok(edited.ok);
  assert.equal(allocationTotal(edited.state), 100);
  assert.equal(edited.state.types.find((type) => type.key === "first_payer")!.allocation, 20);
  assert.deepEqual(edited.moves.map((move) => [move.key, move.from, move.to]).sort(), [["first_payer", 25, 20], ["missing_expert", 10, 15]]);
  assert.equal(changeCount(origin, edited.state), 2);
  // Not a multiple of 5 → refused, nothing changes.
  const bad = editAllocation(origin, "launch", "missing_expert", 12);
  assert.equal(bad.ok, false);
});

test("manual edit: the count stepper stays in range and each person's points add up to the allocation", () => {
  const origin = manualEditStateOf(draft.content);
  const two = editTargetCount(origin, "launch", "same_path_founder", 2);
  assert.ok(two.ok);
  assert.equal(two.state.types.find((type) => type.key === "same_path_founder")!.targetCount, 2);
  assert.deepEqual(unitPoints(15, 2), [7, 8], "15 ÷ 2: the remainder goes to the last person");
  assert.equal(editTargetCount(origin, "launch", "same_path_founder", 6).ok, false);
  assert.equal(editTargetCount(origin, "launch", "event", 10).ok, true);
});

test("manual edit: removing a type gives its points back 5 at a time from the highest, and drops it from steps", () => {
  const origin = manualEditStateOf(draft.content);
  const removed = removeType(origin, "launch", "prior_product");
  assert.ok(removed.ok);
  assert.equal(allocationTotal(removed.state), 100);
  assert.equal(removed.state.types.some((type) => type.key === "prior_product"), false);
  // 15 points: first_payer 25 → 30, then brand_pr 15 → 20, same_path_founder 15 → 20 (template order on ties).
  assert.deepEqual(removed.moves.filter((move) => move.key !== "prior_product").map((move) => [move.key, move.from, move.to]), [["first_payer", 25, 30], ["brand_pr", 15, 20], ["same_path_founder", 15, 20]]);
  assert.equal(removed.state.steps.some((step) => step.personTypeKeys.includes("prior_product")), false);
  assert.equal(removeType(origin, "launch", "event").ok, false, "the event slot cannot be removed");
});

test("manual edit: adding an unused template slot, reordering, and the request body", () => {
  const origin = manualEditStateOf(draft.content);
  const slots = unusedTemplateSlots(origin, "launch");
  assert.deepEqual(slots, [], "the mock plan already uses every launch slot");
  const removed = removeType(origin, "launch", "heavy_user");
  assert.ok(removed.ok);
  assert.deepEqual(unusedTemplateSlots(removed.state, "launch").map((slot) => slot.slot), ["heavy_user"]);
  const added = addType(removed.state, "launch", "heavy_user", "ja");
  assert.ok(added.ok);
  assert.equal(allocationTotal(added.state), 100);
  const moved = moveStep(added.state, "step-2", -1);
  assert.deepEqual(moved.steps.map((step) => step.key), ["step-2", "step-1", "step-3", "step-4"]);
  assert.ok(manualEditReady(moved));
  const body = manualEditRequest(moved, draft.revision, "key-1");
  assert.equal(body.expectedRevision, draft.revision);
  assert.deepEqual(body.personTypes.find((type) => type.slot === "heavy_user"), { allocation: 5, key: null, slot: "heavy_user", targetCount: 1 });
  assert.equal(body.personTypes.reduce((sum, type) => sum + type.allocation, 0) + body.event.allocation, 100);
});

test("AI_LIMIT maps to the limit explanation (with the limit kind), AI_FAILED to the failure card", () => {
  const meta = { featureMode: null, privacy: null, runtimeBoundary: null };
  assert.deepEqual(planFailureOf({ error: { code: "CONFLICT", context: { limit: "monthly", reason: "AI_LIMIT", retryOn: "2026-11-01" }, message: "x" }, meta, status: 409, success: false }), { kind: "aiLimit", limit: "monthly", retryOn: "2026-11-01" });
  assert.deepEqual(planFailureOf({ error: { code: "SERVICE_UNAVAILABLE", context: { reason: "AI_FAILED" }, message: "x" }, meta, status: 503, success: false }), { kind: "aiFailed" });
  assert.deepEqual(planFailureOf({ error: { code: "SERVICE_UNAVAILABLE", context: { reason: "NOT_IMPLEMENTED" }, message: "x" }, meta, status: 503, success: false }), { kind: "notImplemented" });
  assert.deepEqual(planFailureOf({ error: { code: "ORBIT_APP_NETWORK_ERROR", message: "x" }, meta, status: 0, success: false }), { kind: "network" });
});

test("routes: the plan pages need sign-in, keep their id in the path on the way back from login, and return to Task › プラン", async () => {
  const { isPrivateMobileRoute, mobileAuthReturnHref } = await import("../src/view-models/mobile-route-access");
  const { parentForPath } = await import("../src/view-models/app-navigation");
  const { createTranslator } = await import("../src/i18n/messages");
  assert.equal(isPrivateMobileRoute("/plans/flow/intake_1"), true);
  assert.equal(isPrivateMobileRoute("/plans/drafts/draft_1/edit"), true);
  assert.equal(mobileAuthReturnHref("/plans/flow/intake_1", { intakeId: "intake_1" }), "/plans/flow/intake_1");
  assert.equal(mobileAuthReturnHref("/plans/drafts/draft_1/edit", { draftId: "draft_1" }), "/plans/drafts/draft_1/edit");
  assert.deepEqual(parentForPath("/plans/flow/intake_1", createTranslator("ja")), { href: "/task?seg=plan", label: "プラン" });
});
