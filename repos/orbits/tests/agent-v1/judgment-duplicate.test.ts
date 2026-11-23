import assert from "node:assert/strict";
import test from "node:test";

import { resumeAgentGraph, runAgentGraph } from "../../features/agent-v1/graph/build";
import type { AgentCardAccess } from "../../features/agent-v1/graph/deps";
import { newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { judgeDuplicate, possibleDuplicates } from "../../features/agent-v1/judgment/duplicate";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { access, choice, judgeStub } from "./judgment-kit";
import { memo, smallWorld } from "./read-kit";

/**
 * agent-design AG08-3: 重复判断 — code finds the memos of the same contact, day and way of contact; the judgment
 * says same / different / unsure; never merged: unsure, below threshold or unavailable ask the user, with
 * "不是同一次，仍然新增" among the choices; a sure "same" points at the existing memo and adds nothing.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";
const M41 = memo(ACTOR, "note:m41", "早上和小林在车站碰到，约了下周对报价。", "2026-11-15T00:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-15", precision: "day" } });

function world(extra = [M41]) {
  const records = smallWorld();
  for (const record of records.records) if (record.userId === "user:a") record.userId = ACTOR;
  records.records.push(...extra);
  return records;
}

const entry = (channel = "meeting", day = "2026-11-15") => ({ body: "今天早上在车站碰到了小林", contactIds: ["contact:c17"], interaction: { actualContactIds: ["contact:c17"], channel, occurredOn: day } });

test("AG08-3 suspected duplicates: same contact, same day, same way of contact (unknown counts as the same)", async () => {
  const records = recordAccessOf(world([M41, memo(ACTOR, "note:old", "上周和小林见面。", "2026-11-08T00:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-08", precision: "day" } })]));
  const scope = records.scope(ACTOR);
  assert.deepEqual((await possibleDuplicates(records, scope, entry(), "Asia/Tokyo")).map((view) => view.id), ["note:m41"]);
  assert.deepEqual((await possibleDuplicates(records, scope, entry("other"), "Asia/Tokyo")).map((view) => view.id), ["note:m41"], "a way of contact not known is not a difference");
  assert.deepEqual(await possibleDuplicates(records, scope, entry("phone"), "Asia/Tokyo"), [], "a call is not the meeting");
  assert.deepEqual(await possibleDuplicates(records, scope, entry("meeting", "2026-11-14"), "Asia/Tokyo"), []);
});

test("AG08-3 the judgment's answer: sure different → new; sure same → same; unsure, below threshold, unavailable → ask", async () => {
  const records = recordAccessOf(world());
  const existing = await possibleDuplicates(records, records.scope(ACTOR), entry(), "Asia/Tokyo");
  const decide = async (fetchImplementation: typeof fetch | null) => judgeDuplicate(fetchImplementation ? access(fetchImplementation) : undefined, newJudgmentBudget(), { entry: entry(), existing, language: "zh" });
  assert.equal((await decide(judgeStub(() => choice("different", 0.95)).fetchImplementation)).kind, "new");
  assert.equal((await decide(judgeStub(() => choice("same", 0.95)).fetchImplementation)).kind, "same");
  assert.equal((await decide(judgeStub(() => choice("unsure", 0.95)).fetchImplementation)).kind, "ask");
  assert.equal((await decide(judgeStub(() => choice("same", 0.5)).fetchImplementation)).kind, "ask", "same below the threshold (0.7)");
  assert.equal((await decide(judgeStub(() => choice("different", 0.5)).fetchImplementation)).kind, "ask", "different below the threshold");
  assert.equal((await decide(null)).kind, "ask", "unavailable");
});

const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

function kitFor(judgment: ReturnType<typeof access> | undefined) {
  const message = "记一下：今天早上在车站碰到了小林。";
  const frozen: unknown[] = [];
  const cards: AgentCardAccess = { async freeze(input) { frozen.push(input); return { actionId: "card:1", operations: input.intents.map((intent, index) => ({ ...intent, operationId: `op${index + 1}`, text: "新增往来笔记" })), payloadHash: "h", revision: 1 } as never; } };
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ channel: "meeting", dateText: "今天", dependsOn: [], direction: "mutual", entity: "memo", fields: [{ name: "body", valueText: "今天早上在车站碰到了小林" }], localId: "w1", partId: "p1", relations: [{ clue: "小林", entity: "contact", role: "actual_contact" }], verb: "create" }] }),
    understand: () => json({ language: "zh", parts: [part({ deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: "记一下：今天早上在车站碰到了小林。" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world()) });
  kit.deps.cards = cards;
  if (judgment) kit.deps.judgment = judgment;
  return { frozen, input: kit.input(message), kit };
}

test("AG08-3 graph: not sure it is the same occasion → no card, one question with 'not the same, add it anyway'", async () => {
  const { frozen, input, kit } = kitFor(access(judgeStub(() => choice("same", 0.4)).fetchImplementation));
  const result = await runAgentGraph(kit.deps, input);
  assert.equal(frozen.length, 0, "nothing on a card, nothing merged");
  assert.equal(result.status, "waiting_user");
  assert.equal(result.partResults[0].status, "awaiting_clarification");
  const question = result.clarifications.find((set) => set.kind === "question")!;
  assert.deepEqual(question.options.map((option) => option.label), ["是同一次（11月15日的笔记）", "不是同一次，仍然新增"]);
  assert.match(result.text, /早上和小林在车站碰到/u, "the existing memo is shown");
  // The user says it is another occasion: then the card is made.
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: question.clarificationId, kind: "select", optionId: question.options[1].optionId });
  assert.equal(frozen.length, 1);
  assert.ok(resumed.actionPreview);
});

test("AG08-3 graph: the user says it is the same occasion → nothing is added", async () => {
  const { frozen, input, kit } = kitFor(undefined);
  const result = await runAgentGraph(kit.deps, input);
  const question = result.clarifications.find((set) => set.kind === "question")!;
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: question.clarificationId, kind: "select", optionId: question.options[0].optionId });
  assert.equal(frozen.length, 0);
  assert.match(resumed.text, /当作同一次，没有另外新增/u);
});

test("AG08-3 graph: sure it is the same → no card; the existing memo is pointed at with an 'add anyway' entry", async () => {
  const { frozen, input, kit } = kitFor(access(judgeStub(() => choice("same", 0.95)).fetchImplementation));
  const result = await runAgentGraph(kit.deps, input);
  assert.equal(frozen.length, 0);
  assert.match(result.text, /看起来是同一次，所以这次没有另外新增/u);
  const entries = result.clarifications.filter((set) => set.kind === "entry");
  assert.equal(entries.length, 1);
  assert.ok(entries[0].options.some((option) => option.label === "不是同一次，仍然新增"));
});

test("AG08-3 graph: sure it is another occasion → the card is made as before", async () => {
  const { frozen, input, kit } = kitFor(access(judgeStub(() => choice("different", 0.95)).fetchImplementation));
  await runAgentGraph(kit.deps, input);
  assert.equal(frozen.length, 1);
});
