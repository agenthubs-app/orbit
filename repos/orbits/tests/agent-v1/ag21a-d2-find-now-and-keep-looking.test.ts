/**
 * AG21a, coordinator's decision 2: a message that asks to find something now and to keep looking ("先找…再一直找…", "find … and
 * keep watching") gets both — the one-off search is answered now, and the ongoing part goes to the scheduled-task path (the
 * rule card, or its question for when to run) instead of only an offer to accept first. Keeping looking only on finding
 * nothing ("没有合适的就一直找下去，找到我满意为止", AE-UND-011) is still AG03's bounded alternative.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { keepsLookingAt, keepsLookingIn } from "../../features/agent-v1/rule/parse";
import { json, runFn } from "./functions-kit";
import type { ModelCall } from "./graph-kit";

const NO_ALTERNATIVE = /没办法一直不停地找下去|can't keep searching|探し続けることはできません/u;
// The rule step's pointers into the words (the model's part); code reads the schedule and scope from them.
const draft = (_call: ModelCall, scheduleText: string | null) => json({ basisText: null, count: null, domain: "event", schedule: null, scheduleText, scopeText: null, target: null, until: null, untilText: null, verb: "create" });

test("the words: find now and keep looking — where the ongoing part starts; a keep-looking that is a condition is not one", () => {
  for (const [quote, rest] of [
    ["先帮我列出这周末的活动，再一直帮我留意新的活动", "再一直帮我留意新的活动"],
    ["先帮我找摄影活动再一直帮我盯着新的", "再一直帮我盯着新的"],
    ["Find events this weekend and keep watching for new ones", "and keep watching for new ones"],
    ["今週末のイベントを探して、これからもチェックして", "これからもチェックして"],
  ] as const) {
    const at = keepsLookingAt(quote);
    assert.ok(at !== null, quote);
    assert.equal(quote.slice(at!), rest, quote);
  }
  for (const quote of ["帮我找摄影主题的活动，这次没有合适的就一直找下去，找到我满意为止", "一直帮我留意摄影活动", "keep looking until I'm satisfied"]) assert.equal(keepsLookingAt(quote), null, quote);
  assert.ok(keepsLookingIn("再一直帮我留意新的活动"));
  assert.ok(!keepsLookingIn("没有合适的就一直找下去，找到我满意为止"));
});

for (const [label, message, understood] of [
  ["one part from the first layer", "先帮我列出这周末的活动，再一直帮我留意新的活动。", [{ dataSources: ["orbit_records"], deliverable: "list", persistence: "until_satisfied", readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: "先帮我列出这周末的活动，再一直帮我留意新的活动。" }]],
  ["two parts from the first layer", "先帮我列出这周末的活动，再一直帮我留意新的活动。", [
    { dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: "先帮我列出这周末的活动" },
    { dataSources: ["orbit_records"], deliverable: "list", persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: "再一直帮我留意新的活动" },
  ]],
] as const) {
  test(`zh, ${label}: this weekend's events are listed now, and the keep-looking goes to AG15's question for when to run`, async () => {
    const run = await runFn(message, understood as never, { extractReply: (call) => draft(call, null) });
    assert.match(run.result.text, /东京街头摄影展/u, `the search is answered now: ${run.result.text}`);
    assert.match(run.result.text, /没看出多久跑一次、几点跑/u, `the ongoing part is AG15's question for when to run: ${run.result.text}`);
    assert.doesNotMatch(run.result.text, NO_ALTERNATIVE, run.result.text);
    assert.equal(run.frozen.length, 0, "no card before a time to run is said");
  });
}

test("zh, with a time to run: the search now, and the scheduled task's own question (what to pick by)", async () => {
  const message = "先帮我列出这周末的活动，再每周五上午九点一直帮我留意新的活动。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", persistence: "until_satisfied", readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: message }], { extractReply: (call) => draft(call, "每周五上午九点") });
  assert.match(run.result.text, /东京街头摄影展/u, run.result.text);
  assert.match(run.result.text, /每次按什么来挑/u, `a new task with no basis gets AG15's one question: ${run.result.text}`);
  assert.doesNotMatch(run.result.text, NO_ALTERNATIVE, run.result.text);
});

test("en: 'Find events this weekend and keep watching for new ones' — both", async () => {
  const message = "Find events this weekend and keep watching for new ones.";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", persistence: "until_satisfied", readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read"], sourceQuote: message }], { extractReply: (call) => draft(call, null), language: "en" });
  assert.match(run.result.text, /东京街头摄影展/u, run.result.text);
  assert.match(run.result.text, /how often and at what time/u, run.result.text);
  assert.doesNotMatch(run.result.text, NO_ALTERNATIVE, run.result.text);
});

test("keeping looking only on finding nothing (AE-UND-011's shape) is still the bounded alternative, offered first", async () => {
  const message = "帮我找摄影主题的活动，这次没有合适的就一直找下去，找到我满意为止。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: message }]);
  assert.match(run.result.text, /定期留意/u, run.result.text);
  assert.ok(!run.events.some((event) => event.type === "understand.find_now_and_keep_looking" || event.type === "understand.keep_looking_is_a_task"));
  assert.equal(run.frozen.length, 0);
});
