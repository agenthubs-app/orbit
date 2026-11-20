import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { asksWhatToPrepare } from "../../features/agent-v1/graph/nodes/prepare";
import { fnWorld, runFn } from "./functions-kit";
import { graphKit, recordAccessOf } from "./graph-kit";
import { schedule } from "./read-kit";

/**
 * Hotfix 2026-11-20 part 2 (the App's suggested question todayVm.questionPreparation, live site): 「接下来的会面或活动，该准备什么？」
 * picked one event "by the topic" of the whole sentence and read no schedule item. Code's answer: the next schedule items and
 * the next events the user is registered for, nearest first, each as its card with what the user's records hold about it —
 * or plainly that nothing is linked. No model call after the first layer, no judgment.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";
const records = (blocks: readonly AnswerBlock[]) => blocks.filter((block): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records");

test("which words ask what to prepare for the user's next meetings or events (zh, ja, en)", () => {
  for (const words of ["接下来的会面或活动，该准备什么？", "次の面会やイベントに何を準備しますか？", "What should I prepare for upcoming meetings or events?", "下一个会议要准备什么", "What do I need to prepare for my next meeting?"]) assert.equal(asksWhatToPrepare(words), true, words);
  for (const words of ["下周要第一次拜访一家新客户，帮我想想要准备什么，分几点说。", "帮我准备一份报价", "接下来有哪些活动？", "最近有哪些活动适合我？"]) assert.equal(asksWhatToPrepare(words), false, words);
});

function world() {
  const base = fnWorld();
  base.records.push(
    // Tomorrow with 田中 (who has an overdue follow-up and an open inquiry to-do, and a note), then a meeting with no one linked.
    schedule(ACTOR, "personal:lunch", "和田中午餐", "2026-11-19T03:00:00.000Z", { contactIds: ["contact:c30"], endsAt: "2026-11-19T04:00:00.000Z" }),
    schedule(ACTOR, "personal:solo", "季度复盘", "2026-11-17T01:00:00.000Z", { endsAt: "2026-11-17T02:00:00.000Z" }),
    schedule(ACTOR, "personal:past", "上个月的会", "2026-10-01T01:00:00.000Z"),
  );
  base.records.push({ collection: "notes", id: "note:m37", payload: { note: { accountId: ACTOR, body: "田中说他们最在意交付周期，报价可以分两期。", contactIds: ["contact:c30"], createdAt: "2026-11-11T07:00:00.000Z", eventIds: [], id: "note:m37", ownerUserId: ACTOR, title: "客户访谈", updatedAt: "2026-11-11T07:00:00.000Z", version: 1 } }, searchText: "客户访谈 田中", userId: ACTOR, workspaceId: "workspace:test" });
  return base;
}

function session(base = world(), registered: string[] = ["event:e103"]) {
  const kit = graphKit((async () => { throw new Error("replaced"); }) as never, { now: NOW, records: recordAccessOf(base) });
  kit.deps.records!.registeredEventIds = async () => registered;
  return kit;
}

for (const [label, understood] of [
  ["tagged as an event ranking over the sentence (live site)", { deliverable: "ranked_list", rank: { basis: "接下来的会面或活动，该准备什么？" }, requiredCapabilities: ["event.read", "fn.rank"] }],
  ["tagged as a schedule and event read", { deliverable: "list", requiredCapabilities: ["schedule.read", "event.read"] }],
  ["tagged as a discussion", { deliverable: "answer", requiredCapabilities: [] }],
] as const) {
  test(`「接下来的会面或活动，该准备什么？」 — ${label}: the next meetings and the registered event, each with what is linked`, async () => {
    const message = "接下来的会面或活动，该准备什么？";
    const run = await runFn(message, [{ dataSources: ["orbit_records"], sourceQuote: message, ...understood }], { session: session() });
    assert.equal(run.modelCalls.filter((call) => call.node !== "understand").length, 0, "no answer or ranking call");
    assert.equal(run.judgeCalls.length, 0);
    const full = records(run.result.blocks).filter((block) => (block.size ?? "full") === "full").flatMap((block) => block.items.map((item) => item.id));
    assert.deepEqual(full, ["personal:solo", "personal:lunch", "event:e103"], "nearest first; the past meeting is not there");
    const text = run.result.text;
    assert.match(text, /^接下来有 3 个会面或活动/u);
    assert.match(text, /对方：田中浩。还没完成的待办：跟进田中的分期方案[^\n]*；回复田中的询价/u, text);
    // His latest note (Nov 14), its first sentence only.
    assert.match(text, /田中浩的最新笔记（11月14日（周六））：听同事说，田中前天和王强通过电话。/u);
    assert.equal((text.match(/你的记录里没有和它相关的待办或笔记/gu) ?? []).length, 2, "the solo meeting and the event have nothing linked, said plainly");
    assert.doesNotMatch(text, /主题|记录里看不出/u);
    assert.ok(run.events.some((event) => event.type === "functions.prepared"));
  });
}

test("English and Japanese: the App's question in both", async () => {
  for (const [language, message, lead] of [["en", "What should I prepare for upcoming meetings or events?", /^Your next 3 meetings and events/u], ["ja", "次の面会やイベントに何を準備しますか？", /^これからの面会・イベントは3件です/u]] as const) {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", requiredCapabilities: ["schedule.read"], sourceQuote: message }], { language, session: session() });
    assert.match(run.result.text, lead, run.result.text);
  }
});

test("an account with nothing coming: it says there is nothing to prepare yet", async () => {
  const empty = fnWorld();
  const message = "接下来的会面或活动，该准备什么？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", requiredCapabilities: ["schedule.read"], sourceQuote: message }], { session: session(empty, []) });
  assert.match(run.result.text, /^接下来 30 天里没有安排的会面，也没有报名的活动，所以现在还没有要准备的事。$/u);
  assert.deepEqual(run.result.partResults[0].gaps, ["no_record"]);
});
