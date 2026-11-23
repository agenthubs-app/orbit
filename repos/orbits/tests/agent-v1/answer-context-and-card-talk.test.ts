import assert from "node:assert/strict";
import test from "node:test";

import { stripCardTalk } from "../../features/agent-v1/entry/approval-claims";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { answerSystemPrompt } from "../../features/agent-v1/understand/prompt";
import { captureTrace, deepseekStub, graphKit, json, part } from "./graph-kit";

/**
 * agent-design AG04 run-02 repair round 1:
 * 1. The answer step sees the same conversation window the first layer saw (设计稿 §3.10): recent
 *    messages as text only, long replies cut, nothing after 60 idle minutes, no record bodies — so a
 *    discussion part that points back ("这封邮件") can be answered (AE-AMB-011 R2).
 * 2. A model answer sentence about a confirmation card is not delivered when the turn shows no card
 *    (stray card talk in AE-AMB-011, AE-BND-008, AE-UND-002).
 */

const TURN1 = "帮我想想回访邮件的开头怎么写比较自然";
const LONG_REPLY = `开头可以写：感谢您上次抽时间和我们聊产品试用的情况。${"后面是很长的建议。".repeat(40)}只在原文末尾出现的句子`;

function history(at: string) {
  return [{ createdAt: at, role: "user" as const, text: TURN1 }, { createdAt: at, role: "assistant" as const, text: LONG_REPLY, recordRefs: ["memo:note:m37"] }];
}

const TITLE = (call: { user: string }, index: number) => (index === 0
  ? json({ parts: [part({ goal: "给前面讨论的回访邮件起标题", sourceQuote: "顺便再给这封邮件起个标题" })], plainChat: false })
  : json({ segments: [{ partId: "p1", text: "标题：感谢您上次的试用反馈" }] }));

test("the answer call gets the recent conversation as text (long replies cut), no record bodies", async () => {
  const model = deepseekStub(TITLE);
  const kit = graphKit(model.fetchImplementation, { messages: history("2026-11-15T09:58:00.000Z"), now: "2026-11-15T10:00:00.000Z" });
  await runAgentGraph(kit.deps, kit.input("顺便再给这封邮件起个标题。"));
  const answer = model.calls.find((call) => call.node === "answer")!;
  assert.ok(answer, "an answer call was made");
  assert.match(answer.user, /帮我想想回访邮件的开头怎么写比较自然/u, "turn 1's words are there");
  assert.match(answer.user, /感谢您上次抽时间/u, "the opening of the earlier reply is there");
  assert.doesNotMatch(answer.user, /只在原文末尾出现的句子/u, "a long reply is cut");
  assert.doesNotMatch(answer.user, /note:m37|memo:/u, "record refs are not passed on; bodies never are");
  assert.doesNotMatch(answerSystemPrompt("zh"), /You do not see the earlier conversation/u);
});

test("after more than 60 idle minutes the answer call gets no earlier messages", async () => {
  const model = deepseekStub(TITLE);
  const kit = graphKit(model.fetchImplementation, { messages: history("2026-11-15T08:50:00.000Z"), now: "2026-11-15T10:00:00.000Z" });
  await runAgentGraph(kit.deps, kit.input("顺便再给这封邮件起个标题。"));
  const answer = model.calls.find((call) => call.node === "answer")!;
  assert.doesNotMatch(answer.user, /帮我想想回访邮件的开头/u);
  assert.doesNotMatch(answer.user, /感谢您上次抽时间/u);
});

test("stripCardTalk drops the sentences about a confirmation card (zh, ja, en) and keeps the rest", () => {
  assert.deepEqual(stripCardTalk("明白，这次不做改动。改期需要你在确认卡上点确认才会生效。等你想好再说。"), { dropped: ["改期需要你在确认卡上点确认才会生效。"], text: "明白，这次不做改动。等你想好再说。" });
  assert.equal(stripCardTalk("実行は言葉だけでは行われません。変更は確認カードの「Confirm」を押した時点で反映されます。").text, "実行は言葉だけでは行われません。");
  assert.equal(stripCardTalk("Here is a title. Changes only happen after you press Confirm on a confirmation card. Good luck!").text, "Here is a title. Good luck!");
  assert.deepEqual(stripCardTalk("先确认一下对方的时间，再发邮件。").dropped, [], "confirming a time is not card talk");
  assert.doesNotMatch(answerSystemPrompt("zh"), /press(es)? Confirm on a confirmation card/u, "the prompt no longer invites card talk");
});

const CARD_TALK = "标题：感谢您上次的试用反馈。具体改标题的操作需要你在确认卡片上按确认才会生效，我不会在对话里直接改。";

test("no card in this turn: a card sentence of the answer is not delivered, and the drop is traced", async () => {
  const model = deepseekStub([json({ parts: [part({ sourceQuote: "给这封邮件起个标题" })], plainChat: false }), json({ segments: [{ partId: "p1", text: CARD_TALK }] })]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation);
    const result = await runAgentGraph(kit.deps, kit.input("给这封邮件起个标题"));
    assert.equal(result.text, "标题：感谢您上次的试用反馈。");
    assert.ok(trace.events.some((event) => event.type === "model.card_talk_dropped"));
  } finally {
    trace.restore();
  }
  const plain = deepseekStub([json({ parts: [part({ sourceQuote: "给这封邮件起个标题" })], plainChat: true, reply: CARD_TALK })]);
  const kit = graphKit(plain.fetchImplementation);
  assert.equal((await runAgentGraph(kit.deps, kit.input("给这封邮件起个标题"))).text, "标题：感谢您上次的试用反馈。", "the first layer's plain reply too");
});

test("an answer that is nothing but card talk counts as unusable and gets the one repair", async () => {
  const model = deepseekStub([
    json({ parts: [part({ sourceQuote: "好的" })], plainChat: false }),
    json({ segments: [{ partId: "p1", text: "请在确认卡上按确认。" }] }),
    json({ segments: [{ partId: "p1", text: "好的，有需要再告诉我。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input("好的"));
  assert.equal(model.calls.length, 3);
  assert.equal(result.text, "好的，有需要再告诉我。");
});

test("a turn that shows its card keeps what the answer says about it", async () => {
  const model = deepseekStub([json({ parts: [part({ sourceQuote: "给这封邮件起个标题" })], plainChat: false }), json({ segments: [{ partId: "p1", text: CARD_TALK }] })]);
  const kit = graphKit(model.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input("给这封邮件起个标题", { cardPrepared: true }));
  assert.equal(result.text, CARD_TALK);
});
