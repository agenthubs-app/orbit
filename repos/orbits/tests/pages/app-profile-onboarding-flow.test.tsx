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
  parseRelationshipGoal,
  seekOptionsFromLabels,
  toggleValue,
} from "../../app/(app)/app/profile/onboarding-0918/onboarding-model";
import { firstIncompleteStep } from "../../app/(app)/app/profile/onboarding-0918/onboarding-previews";
import { profileOnboardingFlowPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

test("onboarding has five steps with the AI introduction between persona and import", () => {
  assert.deepEqual(ONBOARDING_STEPS, ["profile", "goals", "persona", "intro", "import"]);
});

test("goal badges are grouped and AI seek labels map back to seek options in either language", () => {
  assert.ok(GOAL_GROUPS.flatMap(group => group.options).length >= 15);
  assert.ok(SEEK_OPTIONS.length >= 20);
  const mapped = seekOptionsFromLabels(["Investors", "渠道合作伙伴", "不存在的标签", "投资人"]);
  assert.deepEqual(mapped.map(option => option.zh), ["投资人", "渠道合作伙伴"]);
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

test("saved goal text round-trips back into chips, focus and horizon when the local draft is gone", () => {
  const draft = { goals: ["寻找合作伙伴", "开拓新市场"], focus: "把产品推到日本：先找 5 家试用", horizon: "本季度" };
  assert.deepEqual(parseRelationshipGoal(composeRelationshipGoal(draft, "zh")), draft);
  const en = { goals: ["Raise funding"], focus: "Close a seed round", horizon: "This year" };
  assert.deepEqual(parseRelationshipGoal(composeRelationshipGoal(en, "en")), en);
  // 不是引导写出的格式（例如个人中心手写的目标）：整段保留为「一句话」，不丢内容。
  assert.deepEqual(parseRelationshipGoal("三个月内认识 3 位日本渠道伙伴"), { goals: [], focus: "三个月内认识 3 位日本渠道伙伴", horizon: "" });
});
