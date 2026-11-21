import assert from "node:assert/strict";
import { test } from "node:test";

import { hasMarkdownSymbols, type AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { followsShownList } from "../../features/agent-v1/understand/follow-list";
import { fnWorld, NOW, runFn } from "./functions-kit";
import { graphKit, json, recordAccessOf, type ModelCall } from "./graph-kit";

/**
 * agent-design AG19-6 (the user, 2026-11-19): right after "最近有哪些活动适合我？" listed events, "哪些活动？你觉得有必要参加？
 * 为什么？" was split at the question marks — one part turned down as a search of the event directory, one left waiting for
 * it. Code's rule: a question right after a list, about the list's kind of records, is one question about that list; the
 * listed records are read again by id and the answer step answers from them. Not a search, not a person to find.
 */

const EVENTS = [{ id: "event:e103", type: "event" }, { id: "event:e101", type: "event" }, { id: "event:e104", type: "event" }];
const rule = (message: string, extra: Partial<Parameters<typeof followsShownList>[0]> = {}) => followsShownList({ hasReferences: false, message, namesPerson: false, shown: EVENTS, writesOrContinues: false, ...extra });

test("the rule: an opinion or a choice about the list's kind of records, right after the list", () => {
  for (const message of ["哪些活动？你觉得有必要参加？为什么？", "那些活动你觉得有必要参加，为什么", "这几场哪场最值得去？", "Which of these events should I go to, and why?", "この中でおすすめのイベントはどれ？なぜ？"]) assert.equal(rule(message), "event", message);
  // No list, an idle session (the list is not given then), a list of one: nothing to go on from.
  assert.equal(rule("哪些活动值得去？", { shown: [] }), null);
  assert.equal(rule("哪些活动值得去？", { shown: EVENTS.slice(0, 1) }), null);
  // Asking for other or newer ones is a new list; so is a message with an @ record, a change, or a named person.
  assert.equal(rule("还有哪些活动值得去？"), null);
  assert.equal(rule("最近有哪些摄影活动值得去？"), null);
  assert.equal(rule("哪些活动值得去？", { hasReferences: true }), null);
  assert.equal(rule("把值得去的活动加到待办", { writesOrContinues: true }), null);
  assert.equal(rule("哪些活动值得带田中去？", { namesPerson: true }), null);
  // Not about the list at all, or no opinion asked.
  assert.equal(rule("帮我想想下周见客户前要准备什么"), null);
  assert.equal(rule("第二场活动在哪里？"), null);
  // A list of people is followed the same way.
  assert.equal(rule("这些人里你建议我先联系谁？", { shown: [{ id: "contact:c17", type: "contact" }, { id: "contact:c30", type: "contact" }] }), "contact");
  assert.equal(rule("哪些活动值得去？", { shown: [{ id: "contact:c17", type: "contact" }, { id: "event:e101", type: "event" }] }), null, "a mixed list is not followed");
});

test("after the list of events, 「哪些活动？你觉得有必要参加？为什么？」 is one part answered from that list — not a search, no one to find", async () => {
  const world = fnWorld();
  const session = graphKit((async () => { throw new Error("no model call expected here"); }) as never, { now: NOW, records: recordAccessOf(world) });
  const first = "最近有哪些活动适合我？";
  const listed = await runFn(first, [{ dataSources: ["orbit_records"], deliverable: "list", rank: { count: 3 }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: first }], { session, world });
  const list = listed.result.blocks.find((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");
  assert.deepEqual(list?.items.map((item) => item.id), ["event:e103", "event:e101", "event:e104"]);

  const second = "哪些活动？你觉得有必要参加？为什么？";
  const calls: ModelCall[] = [];
  // The first layer splits it the way it did for the user: a search, an opinion that waits for it, a "why".
  const run = await runFn(second, [
    { dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["event.read"], sourceQuote: "哪些活动？" },
    { deliverable: "answer", dependsOn: ["p1"], objectClues: [{ entity: "contact", text: "你" }], sourceQuote: "你觉得有必要参加？" },
    { deliverable: "answer", dependsOn: ["p2"], sourceQuote: "为什么？" },
  ], {
    answer: (call) => {
      calls.push(call);
      return json({ segments: [{ body: [{ points: [{ head: "SaaS 定价研讨会", text: "和你最近关心的定价有关。" }, { head: "东京街头摄影展", text: "周末上午，时间宽松。" }] }], cites: [{ sentenceIds: [1], sourceRef: "s1" }, { sentenceIds: [1], sourceRef: "s2" }], lead: "建议先去 SaaS 定价研讨会，摄影展可以作为补充。", partId: "p1" }] });
    },
    session,
    world,
  });
  assert.ok(run.events.some((event) => event.type === "understand.follows_shown_list"));
  assert.deepEqual(run.result.partResults.map((item) => [item.partId, item.status, item.route, item.sourceQuote]), [["p1", "answered", "read", second]]);
  // Release-2 gate 2 (AE-ANS-003; coordinator, 2026-11-20): which of them are worth going to, and why, is hotfix part 3's
  // recommendation with reasons over the three listed events — code writes each one's reason from its themes and the user's
  // note; no answer-model call. (Before: the three were given to the answer step, which wrote an opinion — assertions
  // changed here; the one-part follow-up and the rest are kept.)
  assert.equal(calls.length, 0, "no answer-model call");
  const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
  assert.deepEqual([...(ranked?.listed ?? [])].sort(), ["event:event:e101", "event:event:e103", "event:event:e104"], "the three listed events, read again by id");
  assert.match(run.result.text, /东京街头摄影展[^\n]*——主题是摄影；你的笔记「兴趣笔记」里写了摄影/u, run.result.text);
  const blocks = run.result.blocks;
  assert.equal(blocks.some((block) => block.type === "note"), false, "nothing is turned down or left waiting");
  const cards = blocks.find((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");
  assert.equal(cards?.items.every((item) => item.kind === "event"), true);
  assert.doesNotMatch(run.result.text, /活动目录|这次先不做|哪一位/u);
  assert.equal(hasMarkdownSymbols(run.result.text), false);
});

// AG14 merge (AE-SCL-028 in the AG14 stability runs): a message that names its own period is a new lookup over that period
// (where saved memory ranks it), not a question about the list shown before; words pointing back keep it on the list.
test("a message naming its own period is a new lookup, not a question about the list shown last", () => {
  for (const message of ["下周（11 月 16 日到 22 日）有什么值得去的活动？挑三场。", "这个周末有什么活动值得去？", "来週おすすめのイベントは？", "Which events next week are worth going to?"]) assert.equal(rule(message), null, message);
  assert.equal(rule("这些活动里周末那场值得去吗？"), "event", "words pointing back keep it on the list");
});
