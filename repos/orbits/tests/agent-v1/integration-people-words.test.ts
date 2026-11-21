import assert from "node:assert/strict";
import { test } from "node:test";

import { groupClue, INDEFINITE_PERSON } from "../../features/agent-v1/understand/described-clue";
import { ACTOR, fnWorld, memo, runFn } from "./functions-kit";
import { json, type ModelCall } from "./graph-kit";

/**
 * Release-2 gate 2 (AE-ANS-033/034, AE-ANS-024, AE-ANS-026, AE-REF-003): the first layer of this run tagged words for the
 * user's contacts as a whole (「人脉关系」, 「人脈」) or for the people inside two attached notes (「两位客户」) as one person to
 * look up — answered 「我不确定你说的是哪一位联系人」 — and words for someone not named (「某位人脉」, "a contact") once as a name
 * in a "not understood" question, once not at all (five notes summarised). On the live tree the first layer happened not to
 * tag them; the rules below make the answer the same whichever way it tags them.
 */

const NO_CONTACT = /我不确定你说的是哪一位联系人|どの連絡先の方のことか分からなかった|couldn't tell which of your Orbit contacts/u;
const citeAll = (text: string) => (call: ModelCall) => json({ segments: [{ cites: [...call.user.matchAll(/(s\d+) — /gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), partId: "p1", text }] });

test("the words: the whole set of contacts or the people a record is about are no person; someone not named is said as such", () => {
  for (const text of ["人脉关系", "人脉", "我的人脉", "人脈", "我的联系人", "两位客户", "这两位客户", "my contacts", "my relationships", "the two clients", "contacts"]) assert.equal(groupClue({ entity: "contact", text }), true, text);
  // A bare 「联系人」 stays a clue (AG13's own test); a name, an unnamed someone and a pronoun are never the set.
  for (const text of ["小林", "田中浩", "Emily", "某位人脉", "a contact", "她", "联系人", "連絡先"]) assert.equal(groupClue({ entity: "contact", text }), false, text);
  for (const words of ["回看与某位人脉的讨论", "Review a discussion with a contact", "ある連絡先とのやり取り"]) assert.ok(INDEFINITE_PERSON.test(words), words);
  assert.ok(!INDEFINITE_PERSON.test("整理人脉关系中接下来该做的事。"));
});

test("AE-ANS-033 「整理人脉关系中接下来该做的事。」 tagged with a contact clue 「人脉关系」: the open items are read, no question who", async () => {
  const message = "整理人脉关系中接下来该做的事。";
  let materials = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "人脉关系" }], requiredCapabilities: ["contact.read", "todo.read", "view.recentInteraction", "fn.extractFollowUps", "fn.summarize"], sourceQuote: message }], { answer: (call) => { materials = call.user; return citeAll("先补上已逾期的跟进。")(call); } });
  assert.doesNotMatch(run.result.text, NO_CONTACT, run.result.text);
  assert.match(materials, /跟进田中的分期方案/u, "the open to-dos and follow-ups are read");
  assert.ok(run.events.some((event) => event.type === "understand.group_clue"));
});

test("AE-ANS-034 「人脈との関係で次にすべきことを整理して。」 tagged with 「人脈」: the same in Japanese", async () => {
  const message = "人脈との関係で次にすべきことを整理して。";
  let materials = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "contact", text: "人脈" }], requiredCapabilities: ["contact.read", "view.recentInteraction", "todo.read", "fn.summarize"], sourceQuote: message }], { answer: (call) => { materials = call.user; return citeAll("まず期限切れのフォローアップから。")(call); }, language: "ja" });
  assert.doesNotMatch(run.result.text, NO_CONTACT, run.result.text);
  assert.match(materials, /跟进田中的分期方案/u);
});

test("AE-ANS-024 「回看与某位人脉的讨论」 (clarity none, the clue 「某位人脉」): asks which contact, the words are no name", async () => {
  const message = "回看与某位人脉的讨论";
  const run = await runFn(message, [{ clarity: "none", dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "contact", text: "某位人脉" }], requiredCapabilities: ["memo.read", "view.recentInteraction", "view.timeline"], sourceQuote: message }]);
  assert.match(run.result.text, NO_CONTACT, run.result.text);
  assert.doesNotMatch(run.result.text, /和某位人脉|关于某位人脉|给某位人脉/u);
  assert.equal(run.modelCalls.filter((call) => call.node === "answer").length, 0, "nothing is summarised");
});

test("AE-ANS-026 'Review a discussion with a contact' (no clue at all): asks which contact, summarises nothing", async () => {
  const message = "Review a discussion with a contact";
  const run = await runFn(message, [{ clarity: "missing_one", dataSources: ["orbit_records"], deliverable: "summary", requiredCapabilities: ["contact.read", "memo.read", "fn.summarize"], sourceQuote: message }], { language: "en" });
  assert.match(run.result.text, NO_CONTACT, run.result.text);
  assert.ok(run.events.some((event) => event.type === "understand.unnamed_person"));
  assert.equal(run.modelCalls.filter((call) => call.node === "answer").length, 0);
});

test("AE-REF-003 「@客户访谈 和 @客户访谈 这两篇里，两位客户各自最在意什么？」 with a clue 「两位客户」: both notes are read", async () => {
  const world = fnWorld();
  world.records.push(
    memo(ACTOR, "note:m37", "田中说他们最在意交付周期，报价可以分两期。", "2026-11-11T07:00:00.000Z", ["contact:c30"], { title: "客户访谈" }),
    memo(ACTOR, "note:m37b", "王强说他们最在意售后响应速度。", "2026-11-12T07:00:00.000Z", ["contact:c46"], { title: "客户访谈" }),
  );
  const message = "@客户访谈 和 @客户访谈 这两篇里，两位客户各自最在意什么？";
  const references = [{ id: "note:m37", name: "客户访谈", type: "memo" }, { id: "note:m37b", name: "客户访谈", type: "memo" }];
  let materials = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@客户访谈" }, { entity: "memo", referenceId: "r2", text: "@客户访谈" }, { entity: "contact", text: "两位客户" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: message }], { answer: (call) => { materials = call.user; return citeAll("田中最在意交付周期，王强最在意售后响应速度。")(call); }, references, world });
  assert.doesNotMatch(run.result.text, NO_CONTACT, run.result.text);
  assert.match(materials, /交付周期/u);
  assert.match(materials, /售后响应速度/u);
});
