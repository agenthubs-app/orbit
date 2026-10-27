import assert from "node:assert/strict";
import test from "node:test";
import { homeAppTargetHref } from "../src/screens/home/home-target";

test("home targets retain source details while switching Web Task tabs to native segments", () => {
  assert.equal(homeAppTargetHref("/app/tasks?tab=plan&plan=one"), "/task?seg=plan&plan=one");
  assert.equal(homeAppTargetHref("/app/tasks?tab=memo&memo=note%3Aone"), "/task?seg=memo&memo=note%3Aone");
  assert.equal(homeAppTargetHref("/app/events/one/prep"), "/events/one/prep");
  assert.equal(homeAppTargetHref("/app/contacts/person"), "/contacts/person");
  assert.equal(homeAppTargetHref("/notes/note%3Aone"), "/notes/note%3Aone");
  assert.equal(homeAppTargetHref("https://outside.test/"), null);
  assert.equal(homeAppTargetHref("/app/admin"), null);
});

test("a bare /plans target opens the Task 计划 segment (there is no /plans page), plan detail routes stay", () => {
  assert.equal(homeAppTargetHref("/plans"), "/task?seg=plan");
  assert.equal(homeAppTargetHref("/plans?from=home"), "/task?seg=plan");
  assert.equal(homeAppTargetHref("/plans/plan%3Aone/done"), "/plans/plan%3Aone/done");
});
