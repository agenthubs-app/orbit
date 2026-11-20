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
  // The three listed events were read again by id and given to the answer step.
  assert.equal(calls.length, 1);
  for (const title of ["SaaS 定价研讨会", "东京街头摄影展", "设计师之夜"]) assert.match(calls[0].user ?? "", new RegExp(title, "u"));
  const blocks = run.result.blocks;
  assert.equal(blocks[0].type, "conclusion");
  assert.equal(blocks.some((block) => block.type === "points"), true);
  assert.equal(blocks.some((block) => block.type === "note"), false, "nothing is turned down or left waiting");
  const cards = blocks.find((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");
  assert.deepEqual([cards?.size, cards?.caption], ["mini", "提到的活动"]);
  assert.equal(cards?.items.every((item) => item.kind === "event"), true);
  assert.doesNotMatch(run.result.text, /活动目录|这次先不做|哪一位/u);
  assert.equal(hasMarkdownSymbols(run.result.text), false);
});
