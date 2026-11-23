import assert from "node:assert/strict";
import { test } from "node:test";

import { asksWhichAreWorthIt } from "../../features/agent-v1/graph/nodes/reasons";
import { runFn } from "./functions-kit";

/**
 * Release-2 gate 2 (AE-ANS-003, coordinator's item 8): after 「最近有哪些活动适合我？」 the follow-up 「哪些活动？你觉得有必要参加？为什么？」
 * about the three events listed was answered 「我无法替你判断哪场算有必要」 and named none. Asking which are worth going to, and
 * why, is hotfix part 3's recommendation with reasons (each event's own themes and the user's note that mentions one), over
 * the events the question is about. Code writes it; no model call decides "worth it".
 */

test("the words: which are worth going to, and why (zh, ja, en); a plain why or a plain list is not it", () => {
  for (const words of ["哪些活动？你觉得有必要参加？为什么？", "这几场值不值得去？为什么？", "どれが行く価値がありますか？理由も教えて。", "Which of these are worth going to, and why?"]) assert.equal(asksWhichAreWorthIt(words), true, words);
  for (const words of ["为什么排第一？", "接下来有哪些活动？", "有必要参加吗"]) assert.equal(asksWhichAreWorthIt(words), false, words);
});

test("AE-ANS-003 「哪些活动？你觉得有必要参加？为什么？」 about the three listed: each with its reason from its themes and the interest note", async () => {
  const message = "哪些活动？你觉得有必要参加？为什么？";
  const references = [{ id: "event:e103", name: "SaaS 定价研讨会", type: "event" }, { id: "event:e101", name: "东京街头摄影展", type: "event" }, { id: "event:e104", name: "设计师之夜", type: "event" }];
  // As the follow-up rule hands it over: an event read about the three records under the last answer.
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: references.map((reference, index) => ({ entity: "event", referenceId: `r${index + 1}`, text: "哪些活动" })), requiredCapabilities: ["event.read"], sourceQuote: message }], { references });
  const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
  assert.deepEqual([...(ranked?.listed ?? [])].sort(), ["event:event:e101", "event:event:e103", "event:event:e104"], `the three it is about, no other: ${JSON.stringify(run.events.filter((event) => /first_layer|understand\.|functions|fn\./u.test(String(event.type))).map((event) => [event.type, event.parts ?? ""]))}`);
  assert.match(run.result.text, /东京街头摄影展[^\n]*——主题是摄影；你的笔记「兴趣笔记」里写了摄影/u, run.result.text);
  assert.match(run.result.text, /设计师之夜[^\n]*——主题是设计/u);
  assert.doesNotMatch(run.result.text, /无法替你判断/u);
  assert.equal(run.modelCalls.filter((call) => call.node !== "understand").length, 0, "code writes it");
  assert.equal(run.judgeCalls.length, 0);
});
