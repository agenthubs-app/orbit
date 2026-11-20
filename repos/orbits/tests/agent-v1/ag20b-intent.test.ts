import assert from "node:assert/strict";
import test from "node:test";

import { imperativeForm, needsIntentReview } from "../../features/agent-v1/judgment/intent-review";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import { withoutAbilityDenials } from "../../features/agent-v1/answer/claims";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { access, judgeStub, noul } from "./judgment-kit";
import { smallWorld } from "./read-kit";

/**
 * agent-design AG20b R3 (TRIAGE.md R3; 设计稿 §3.11 "读起来像陈述或假设" 才复核): a plain instruction is not sent to the
 * write-intent review just because its verb is missing from the list. What decides is the form of the sentence — an
 * instruction ("把…删了", "…を…にして", "把…记成一条笔记") — never a lower threshold. Statements and hypotheses with the
 * same verbs still go to the review (the mirror cases), so they still get no card.
 */

const base = { capabilities: ["todo.update"] as const, clarity: "clear" as const, hypothesis: false, intentBasis: "instruction" as const, negation: false };
const asks = (quote: string, extra: Partial<Parameters<typeof needsIntentReview>[0]> = {}) => needsIntentReview({ ...base, capabilities: [...base.capabilities], quote, ...extra });

test("R3 imperatives with no listed verb are not reviewed (zh, ja)", () => {
  for (const quote of [
    "把茶话会删了",
    "把这条差异记成一条笔记",
    "把周会挪一下",
    "那就把它也勾了吧",
    "帮我把样品寄送那条勾了",
    "定例会議（川辺）を隔週にして",
    "窯の点検を来週に回しておいて",
    "例会を月一にしといて",
  ]) {
    assert.equal(imperativeForm(quote), true, `${quote} is an instruction by its form`);
    assert.equal(asks(quote), false, `${quote} is not reviewed`);
  }
});

test("R3 mirror cases: statements and hypotheses with the same verbs are still reviewed (they still get no card)", () => {
  for (const [quote, extra] of [
    ["我把茶话会删了。", {}],
    ["昨天把周会挪了一下。", {}],
    ["我已经把这条差异记成一条笔记了", {}],
    ["要是把茶话会删了，大家会不会有意见？", {}],
    ["如果把周会改成隔周呢", {}],
    ["把茶话会删了会怎样？", {}],
    ["川辺さんが定例会議を隔週にした。", {}],
    ["定例会議を隔週にしたらどうかな", {}],
    ["定例会議を隔週にしてもいいですか？", {}],
    ["小林今天来电话了。", { capabilities: ["memo.create"] }],
    ["把茶话会删了", { clarity: "statement" }],
    ["把茶话会删了", { hypothesis: true }],
  ] as const) {
    assert.equal(asks(quote, extra as Partial<Parameters<typeof needsIntentReview>[0]>), true, `${quote} is still reviewed`);
  }
  assert.equal(imperativeForm("我把茶话会删了。"), false, "a subject before 把 makes it a report");
  assert.equal(imperativeForm("川辺さんが定例会議を隔週にした。"), false, "the past form is a report");
});

test("R3 what was not reviewed before is still not reviewed", () => {
  assert.equal(asks("把报价待办改到周五"), false);
  assert.equal(asks("记一下：今天早上在车站碰到了小林。", { capabilities: ["memo.create"] }), false);
  assert.equal(asks("ToDo、11月20日に予定を入れて"), false);
  assert.equal(asks("把茶话会删了", { intentBasis: "selection" }), false, "a click");
  assert.equal(asks("先别删", { negation: true }), false);
});

/* ── R4: a part treated as a statement is answered from what Orbit can do ── */

const R4_NOW = "2026-11-15T01:00:00.000Z";

async function reviewedTurn(message: string, understand: Record<string, unknown>, answer: string, language: "zh" | "ja" = "zh") {
  const frozen: unknown[] = [];
  const cards: AgentCardAccess = { async freeze(input) { frozen.push(input); return null; } };
  const calls: string[] = [];
  const model = deepseekStub((call: ModelCall) => {
    calls.push(call.node ?? "");
    if (call.node === "understand") return json({ language, parts: [part({ deliverable: "change", sourceQuote: message, ...understand })], plainChat: false });
    if (call.node === "answer") return json({ segments: [{ partId: "p1", text: answer }] });
    throw new Error(`unexpected model call in ${call.node}`);
  });
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  const kit = graphKit(model.fetchImplementation, { now: R4_NOW, records: recordAccessOf(world) });
  kit.deps.cards = cards;
  kit.deps.judgment = access(judgeStub(() => noul(0.05)).fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: language }));
  return { calls, frozen, result };
}

test("R4 a write tag the review did not confirm: code says nothing was changed, never an invented limit; no card", async () => {
  const { calls, frozen, result } = await reviewedTurn("下周的茶话会不办了。", { clarity: "clear", objectClues: [{ entity: "schedule", text: "下周的茶话会" }], requiredCapabilities: ["schedule.delete"] }, "这一步我没有访问你的日程数据，删除需要你在日历应用里手动操作。");
  assert.equal(frozen.length, 0);
  assert.ok(!calls.includes("answer"), "no model writes this answer");
  assert.match(result.text, /没有改动任何记录/u);
  assert.doesNotMatch(result.text, /没有访问|手动操作/u);
});

test("R4 a hypothesis is still answered by the model, without a sentence inventing a limit", async () => {
  const { frozen, result } = await reviewedTurn("要是把茶话会挪到周五，大家会不会来不及？", { clarity: "clear", constraints: ["要是"], objectClues: [{ entity: "schedule", text: "茶话会" }], requiredCapabilities: ["schedule.update"] }, "周五的话时间会比较紧。这一步我没有访问你的日程数据，需要你在日历应用里手动修改。");
  assert.equal(frozen.length, 0);
  assert.match(result.text, /周五的话时间会比较紧/u);
  assert.doesNotMatch(result.text, /没有访问|手动修改/u);
});

test("R4 the strip rule: limits Orbit does not have go, ordinary sentences stay (zh, ja, en)", () => {
  for (const denial of [
    "这一步我没有访问你的日程数据。",
    "删除需要你在日程/日历应用里手动操作。",
    "笔记里的具体数字在这段对话里被截断了。",
    "この場では予定の変更は反映されません。",
    "この場では記録を参照できないため、実行はできません。",
    "I can't access your calendar.",
    "You'll need to delete it manually in your calendar app.",
  ]) assert.equal(withoutAbilityDenials(`好的。${denial}`).dropped.length, 1, denial);
  for (const fine of ["周五的话时间会比较紧。", "这条待办的截止时间是 11 月 17 日。", "笔记里没有写具体金额。", "今回は何も変更していません。", "Nothing was changed."]) assert.equal(withoutAbilityDenials(fine).dropped.length, 0, fine);
});
