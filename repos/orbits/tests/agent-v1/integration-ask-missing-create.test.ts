import assert from "node:assert/strict";
import { test } from "node:test";

import { runFn } from "./functions-kit";

/**
 * Release-2 gate 2 (AE-ANS-036; on the live tree too): 「帮我为新目标制定计划。」, tagged todo.create + schedule.create with
 * the goal not said, was asked 「要改的是哪一条？」. A part whose writes are all creates is missing what to create; a change
 * missing its record is still asked which one.
 */

test("AE-ANS-036 「帮我为新目标制定计划。」: asks what the new thing is about, never which one to change; nothing is made", async () => {
  const message = "帮我为新目标制定计划。";
  const run = await runFn(message, [{ clarity: "missing_one", dataSources: ["turn_material"], deliverable: "change", goal: "为新目标制定计划（目标内容尚未说明）", requiredCapabilities: ["todo.create", "schedule.create"], sourceQuote: message }]);
  assert.match(run.result.text, /具体是什么内容（要新建什么、写什么）/u, run.result.text);
  assert.doesNotMatch(run.result.text, /要改的是哪一条/u);
  assert.equal(run.frozen.length, 0);
});

test("AE-ANS-036 solo run 1: the first layer named 「新目标」 as a clue — still what to create, not 「我不确定指的是哪一个」", async () => {
  const message = "帮我为新目标制定计划。";
  const run = await runFn(message, [{ clarity: "missing_one", dataSources: ["turn_material"], deliverable: "change", objectClues: [{ entity: "todo", text: "新目标" }], requiredCapabilities: ["todo.create"], sourceQuote: message }]);
  assert.match(run.result.text, /具体是什么内容/u, run.result.text);
  assert.doesNotMatch(run.result.text, /我不确定指的是哪一个|要改的是哪一条/u);
});

test("the same in Japanese and English", async () => {
  const ja = "新しい目標の計画を立てて。";
  const jaRun = await runFn(ja, [{ clarity: "missing_one", dataSources: ["turn_material"], deliverable: "change", requiredCapabilities: ["todo.create"], sourceQuote: ja }], { language: "ja" });
  assert.match(jaRun.result.text, /具体的な内容/u, jaRun.result.text);
  const en = "Help me make a plan for a new goal.";
  const enRun = await runFn(en, [{ clarity: "missing_one", dataSources: ["turn_material"], deliverable: "change", requiredCapabilities: ["todo.create"], sourceQuote: en }], { language: "en" });
  assert.match(enRun.result.text, /what it is about/u, enRun.result.text);
  assert.doesNotMatch(enRun.result.text, /which one it is/u);
});

test("a real change missing its record is still asked which one", async () => {
  const message = "把那条改到周五。";
  const run = await runFn(message, [{ clarity: "missing_one", dataSources: ["orbit_records"], deliverable: "change", requiredCapabilities: ["todo.update"], sourceQuote: message }]);
  assert.match(run.result.text, /要改的是哪一条/u, run.result.text);
});
