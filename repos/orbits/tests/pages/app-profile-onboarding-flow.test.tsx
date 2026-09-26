import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingFlow } from "../../app/(app)/app/profile/onboarding-0918/onboarding-flow";
import {
  GOAL_GROUPS,
  ONBOARDING_STEPS,
  SEEK_OPTIONS,
  addCustomValue,
  composeRelationshipGoal,
  suggestedSeekOptions,
  toggleValue,
} from "../../app/(app)/app/profile/onboarding-0918/onboarding-model";
import { firstIncompleteStep } from "../../app/(app)/app/profile/onboarding-0918/onboarding-previews";
import { profileOnboardingFlowPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

test("onboarding has five steps with the AI introduction between persona and import", () => {
  assert.deepEqual(ONBOARDING_STEPS, ["profile", "goals", "persona", "intro", "import"]);
});

test("goal badges are grouped and every goal's seek suggestion exists in the seek options", () => {
  const goals = GOAL_GROUPS.flatMap(group => group.options);
  assert.ok(goals.length >= 15);
  for (const goal of goals) {
    assert.ok(suggestedSeekOptions([goal.zh]).length > 0, `no seek suggestion for ${goal.zh}`);
    assert.deepEqual(suggestedSeekOptions([goal.en]), suggestedSeekOptions([goal.zh]), "language-independent");
  }
  assert.ok(SEEK_OPTIONS.length >= 20);
});

test("relationship goal text combines chips, focus sentence and horizon", () => {
  assert.equal(
    composeRelationshipGoal({ goals: ["寻找合作伙伴", "开拓新市场"], focus: " 找到 5 家试用企业 ", horizon: "本季度" }, "zh"),
    "寻找合作伙伴、开拓新市场：找到 5 家试用企业（本季度）",
  );
  assert.equal(composeRelationshipGoal({ goals: ["Raise funding"], focus: "", horizon: "This year" }, "en"), "Raise funding (This year)");
  assert.equal(composeRelationshipGoal({ goals: [], focus: "", horizon: "本月" }, "zh"), "");
});

test("tag helpers respect limits and de-duplicate custom tags", () => {
  assert.deepEqual(toggleValue(["a", "b"], "c", 2), ["a", "b"]);
  assert.deepEqual(toggleValue(["a", "b"], "a", 2), ["b"]);
  assert.deepEqual(addCustomValue(["AI Agent"], "  ai   agent "), ["AI Agent"]);
  assert.deepEqual(addCustomValue([], "  会议 纪要 "), ["会议 纪要"]);
  assert.deepEqual(addCustomValue(["x"], "y", 1), ["x"]);
});

test("preview clicks fall through to the first unfinished step", () => {
  const done = { profileDone: true, goalsDone: true, personaDone: true, introDone: true };
  assert.equal(firstIncompleteStep({ ...done, profileDone: false }), "profile");
  assert.equal(firstIncompleteStep({ ...done, personaDone: false }), "persona");
  assert.equal(firstIncompleteStep(done), "import");
});

test("gate target is the onboarding route and keeps a safe next", () => {
  assert.equal(profileOnboardingFlowPath("/app/contacts?from=x"), "/app/profile/onboarding?next=%2Fapp%2Fcontacts%3Ffrom%3Dx");
  assert.equal(profileOnboardingFlowPath("/app/profile/onboarding"), "/app/profile/onboarding?next=%2Fapp%2Fhome");
});

test("welcome screen renders the five steps and the real nav (no calendar, no LinkedIn)", () => {
  const html = renderToStaticMarkup(<OnboardingFlow actorKey="u1" cardScanAvailable next="/app/home" todayIso="2026-09-26" />);
  assert.match(html, /欢迎来到 Orbit。/);
  for (const label of ["告诉我们你是谁", "你最近想推进什么", "你能提供什么、在找什么", "iOrbit 帮你写好自我介绍", "带入已有人脉"]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, />iOrbit</);
  assert.match(html, />活动</);
  assert.match(html, />人脉</);
  assert.doesNotMatch(html, /日历|领英|LinkedIn/);
});
