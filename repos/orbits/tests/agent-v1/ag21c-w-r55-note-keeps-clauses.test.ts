/**
 * AG21c R55 (W): a note made from what the user said dropped part of it ("记一下：她今天来电话，说一月要调去东京办公室" → body
 * "She called me today."), depending on the model. Code now checks that every clause of the user's own words is in the body,
 * else uses those words; the pronoun becomes the linked contact's name; the title drops the relative day (the date field
 * holds it). Names and sentences are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { memoBodyKeepingClauses, replacePronoun, withoutRelativeDay } from "../../features/agent-v1/propose/resolve";
import { ACTOR, byNode, cardKit, fnWorld, json, NOW } from "./functions-kit";
import { deepseekStub, graphKit, part, recordAccessOf } from "./graph-kit";
import { contact } from "./read-kit";

test("R55 the body keeps every clause of the user's words (zh, ja, en); another write's clause is not the note's", () => {
  assert.equal(memoBodyKeepingClauses("She called me today.", "她今天来电话，说一月要调去东京办公室"), "她今天来电话，说一月要调去东京办公室");
  assert.equal(memoBodyKeepingClauses("她今天来电话，说一月要调去东京办公室", "她今天来电话，说一月要调去东京办公室"), "她今天来电话，说一月要调去东京办公室");
  assert.equal(memoBodyKeepingClauses("彼女から電話", "彼女から電話があった。来月から大阪支社だそうだ"), "彼女から電話があった。来月から大阪支社だそうだ");
  assert.equal(memoBodyKeepingClauses("He called.", "he called today, said the samples ship on Monday"), "he called today, said the samples ship on Monday");
  assert.equal(memoBodyKeepingClauses("", "她来过电话，再建个待办周五回她"), "她来过电话", "the to-do clause belongs to the to-do");
  assert.equal(withoutRelativeDay("林美咲今天来电话"), "林美咲来电话");
  assert.equal(withoutRelativeDay("今日の電話"), "電話");
  assert.equal(withoutRelativeDay("Emily called today"), "Emily called");
  assert.equal(replacePronoun("她今天来电话", "她", "林美咲"), "林美咲今天来电话");
  assert.equal(replacePronoun("She called me today", "she", "Emily Park"), "Emily Park called me today");
});

test("R55 '记一下：她今天来电话，说一月要调去东京办公室' with a model body of one clause: the card's note keeps both, named", async () => {
  const world = fnWorld();
  world.records.push(contact(ACTOR, "contact:lm", "林美咲", { organization: "朝凪设计" }));
  const message = "记一下：她今天来电话，说一月要调去东京办公室";
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ channel: "phone", dateText: "今天", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "她今天来电话" }], localId: "w1", partId: "p1", relations: [{ clue: "她", entity: "contact", role: "actual_contact" }], verb: "create" }] }),
    understand: () => json({ language: "zh", parts: [part({ deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", referenceId: "r1", text: "她" }], requiredCapabilities: ["memo.create"], sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(world), references: [{ accessible: true, id: "contact:lm", name: "林美咲", type: "contact" }] as never });
  const card = cardKit(world);
  kit.deps.cards = card.cards;
  const result = await runAgentGraph(kit.deps, kit.input(message));
  const set = (card.frozen.flatMap((item) => item.intents)[0] as unknown as { set?: { body: string; title: string; interaction?: { occurredOn: string } } } | undefined)?.set;
  assert.ok(set, result.text);
  assert.match(set!.body, /一月要调去东京办公室/u, set!.body);
  assert.doesNotMatch(set!.body, /^她/u, "the pronoun is the contact's name");
  assert.doesNotMatch(set!.title, /今天/u, set!.title);
  assert.equal(set!.interaction?.occurredOn, "2026-11-15");
});
