import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { needsIntentReview, reviewWriteIntent } from "../../features/agent-v1/judgment/intent-review";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { access, judgeStub, noul } from "./judgment-kit";
import { smallWorld } from "./read-kit";

/**
 * agent-design AG08-5: 写入意图复核. A write tag on words that read like a statement, a question or a hypothesis,
 * or with no registered write verb, is checked once; "no", not sure and unavailable all give no card and nothing
 * written, with one registered entry. The model stubs play a first layer that wrongly tags a write.
 */

const NOW = "2026-11-15T01:00:00.000Z";
const base = { capabilities: ["memo.create"] as const, clarity: "clear" as const, hypothesis: false, intentBasis: "instruction" as const, negation: false };

test("AG08-5 when the review is asked, and when it is not", () => {
  const asks = (quote: string, extra: Partial<Parameters<typeof needsIntentReview>[0]> = {}) => needsIntentReview({ ...base, capabilities: [...base.capabilities], quote, ...extra });
  // Asked: a statement, a question, a hypothesis, no write verb.
  assert.equal(asks("小林今天来电话了。"), true, "no write verb");
  assert.equal(asks("小林今天来电话了。", { clarity: "statement" }), true);
  assert.equal(asks("要是把给小林发修订报价那条待办改到周五，会不会来不及？", { capabilities: ["todo.update"], hypothesis: true }), true);
  assert.equal(asks("把报价待办改到周五会不会太晚？", { capabilities: ["todo.update"] }), true, "a question");
  assert.equal(asks("If Emily doesn't send it by Friday, I should probably add a to-do.", { capabilities: ["todo.create"] }), true);
  // Not asked: an explicit request, a polite request with a verb, a click, a negation, an answer to an open item, no write.
  assert.equal(asks("记一下：今天早上在车站碰到了小林。"), false);
  assert.equal(asks("把报价待办改到周五", { capabilities: ["todo.update"] }), false);
  assert.equal(asks("Can you push the to-do about sending Li Wei the sample prints to November 17?", { capabilities: ["todo.update"] }), false);
  assert.equal(asks("ToDo、11月20日に予定を入れて", { capabilities: ["todo.update"] }), false);
  assert.equal(asks("小林今天来电话了。", { intentBasis: "selection" }), false, "a click is the user's own request");
  assert.equal(asks("先别改", { negation: true }), false);
  assert.equal(asks("好，那就按你说的定期留意吧。", { capabilities: ["rule.create"], continues: true }), false);
  assert.equal(asks("小林今天来电话了。", { capabilities: ["contact.read"] }), false);
});

test("AG08-5 reviewWriteIntent: only a sure yes is explicit", async () => {
  const sure = judgeStub(() => noul(0.95));
  assert.equal((await reviewWriteIntent(access(sure.fetchImplementation), newJudgmentBudget(), { language: "zh", message: "m", quote: "m" })).explicit, true);
  const unsure = judgeStub(() => noul(0.7));
  assert.equal((await reviewWriteIntent(access(unsure.fetchImplementation), newJudgmentBudget(), { language: "zh", message: "m", quote: "m" })).explicit, false, "yes below the threshold (0.8)");
  const no = judgeStub(() => noul(0.05));
  assert.equal((await reviewWriteIntent(access(no.fetchImplementation), newJudgmentBudget(), { language: "zh", message: "m", quote: "m" })).explicit, false);
});

function world() {
  const records = smallWorld();
  for (const record of records.records) if (record.userId === "user:a") record.userId = "actor:a";
  return records;
}

const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

async function mistagged(message: string, understand: Record<string, unknown>, judgment: ReturnType<typeof access> | undefined) {
  const frozen: unknown[] = [];
  const cards: AgentCardAccess = { async freeze(input) { frozen.push(input); return null; } };
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ partId: "p1", text: "好的，知道了。" }] }),
    propose: () => { throw new Error("no second layer for a statement"); },
    understand: () => json({ language: "zh", parts: [part({ deliverable: "change", sourceQuote: message, ...understand })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world()) });
  kit.deps.cards = cards;
  if (judgment) kit.deps.judgment = judgment;
  const result = await runAgentGraph(kit.deps, kit.input(message));
  return { frozen, model, result };
}

for (const [name, judgment] of [
  ["the review says no", () => access(judgeStub(() => noul(0.04)).fetchImplementation)],
  ["the review is not sure (yes below threshold)", () => access(judgeStub(() => noul(0.7)).fetchImplementation)],
  ["the judgment is unavailable (no key)", () => undefined],
] as const) {
  test(`AG08-5 "小林今天来电话了。" tagged memo.create, ${name}: no card, nothing written, one entry to log the call`, async () => {
    const { frozen, model, result } = await mistagged("小林今天来电话了。", { clarity: "clear", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"] }, judgment());
    assert.equal(frozen.length, 0, "no card is frozen");
    assert.equal(result.actionPreview, null);
    assert.ok(!model.calls.some((call) => call.node === "propose"), "the second layer is never asked");
    assert.equal(result.partResults[0].route, "answer");
    const entries = result.clarifications.filter((set) => set.kind === "entry");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].options.length, 1);
    assert.equal(entries[0].options[0].capability, "memo.create");
    assert.match(entries[0].options[0].label, /记到小林的往来里/u);
  });
}

test("AG08-5 a hypothesis tagged as a to-do change, judgment unavailable: no card; the entry moves that to-do to the day said", async () => {
  const message = "要是把给小林发修订报价那条待办改到周五，会不会来不及？";
  const { frozen, result } = await mistagged(message, { clarity: "clear", constraints: ["要是"], objectClues: [{ entity: "todo", text: "给小林发修订报价那条待办" }], requiredCapabilities: ["todo.update"] }, access(judgeStub(() => noul(0.9), { status: 500 }).fetchImplementation));
  assert.equal(frozen.length, 0);
  const entry = result.clarifications.find((set) => set.kind === "entry")!;
  assert.equal(entry.options[0].capability, "todo.update");
  assert.match(entry.options[0].label, /把「给小林发修订报价」改到周五/u);
});
