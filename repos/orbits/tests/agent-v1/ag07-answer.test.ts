import assert from "node:assert/strict";
import test from "node:test";

import { basisOf } from "../../features/agent-v1/answer/basis";
import { localizeAnswerDates } from "../../features/agent-v1/answer/dates";
import { groundedAnswerSystemPrompt } from "../../features/agent-v1/answer/prompt";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import type { AgentSessionState } from "../../features/agent-v1/context/session-state";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { smallWorld } from "./read-kit";

/**
 * agent-design AG07, the three items carried from AG06's review:
 * 1. Dates follow the reply language: a date the model writes in another language's form ("11月10日（周二）" in an
 *    English answer) is rewritten by code; the prompt's example is in the reply language.
 * 2. AE-CTX-003: a clue bound to a handle of another kind (a memo clue bound to the contact handle) is not a record
 *    that "can no longer be read".
 * 3. Sources you can open: the answer carries a basis line and one link per cited record, written by code.
 */

test("dates in an English answer are written the English way, with the weekday and the year when given", () => {
  assert.equal(localizeAnswerDates("On the call on 11月10日（周二）, he said 11月27日（周五） at the latest.", "en"), "On the call on Tue, Nov 10, he said Fri, Nov 27 at the latest.");
  assert.equal(localizeAnswerDates("at a trade show on 2024年6月18日（周二）— he was", "en"), "at a trade show on Tue, Jun 18, 2024 — he was");
  assert.equal(localizeAnswerDates("due 11月10日（火）18:00 and 12月5日.", "en"), "due Tue, Nov 10 18:00 and Dec 5.");
  assert.equal(localizeAnswerDates("on 11月20日（周五）", "en"), "on Fri, Nov 20");
});

test("dates in a Japanese answer get Japanese weekdays; dates in a Chinese answer get Chinese ones", () => {
  assert.equal(localizeAnswerDates("期限は11月10日（周二）18:00です。", "ja"), "期限は11月10日（火）18:00です。");
  assert.equal(localizeAnswerDates("期限は11月10日（星期二）です。", "ja"), "期限は11月10日（火）です。");
  assert.equal(localizeAnswerDates("截止是 11月10日（火）。", "zh"), "截止是 11月10日（周二）。");
  assert.equal(localizeAnswerDates("11月10日（周二）不变", "zh"), "11月10日（周二）不变");
  assert.equal(localizeAnswerDates("Nothing to change on Tue, Nov 10.", "en"), "Nothing to change on Tue, Nov 10.");
});

test("the answer prompt's date example is in the reply language", () => {
  assert.match(groundedAnswerSystemPrompt("en"), /e\.g\. Thu, Nov 12/u);
  assert.doesNotMatch(groundedAnswerSystemPrompt("en"), /11月12日/u);
  assert.match(groundedAnswerSystemPrompt("ja"), /11月12日（木）/u);
  assert.match(groundedAnswerSystemPrompt("zh"), /11月12日（周四）/u);
});

const notePart = (quote: string, clues: Record<string, unknown>[]) => part({ goal: "what he said", localId: "p1", objectClues: clues, requiredCapabilities: ["memo.read"], sourceQuote: quote });

test("an English answer from the graph carries English dates even when the model wrote Chinese ones", async () => {
  const quote = "What did 小林 and I talk about last time?";
  const model = deepseekStub([
    json({ language: "en", parts: [notePart(quote, [{ entity: "contact", text: "小林" }])], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "On 11月12日（周四） you went over the first quote." }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(smallWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input(quote, { actorId: "user:a", locale: "en" }));
  assert.match(result.text, /On Thu, Nov 12 you went over the first quote\./u);
  assert.doesNotMatch(result.text, /11月12日/u);
});

const STATE: AgentSessionState = { lastMentioned: [{ at: "2026-11-15T09:59:00.000Z", id: "contact:c17", name: "小林健", type: "contact" }], openItems: [], sessionId: "session:a", shownList: null, updatedAt: "2026-11-15T09:59:00.000Z" };

test("AE-CTX-003: a memo clue bound to the contact's handle reads that person's notes and says nothing is unreadable", async () => {
  const quote = "他上次说要发什么给我？";
  const model = deepseekStub([
    json({ language: "zh", parts: [notePart(quote, [{ entity: "contact", referenceId: "r1", text: "他" }, { entity: "memo", referenceId: "r1", text: "他" }])], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [2], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "他说下周再对一次报价。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(smallWorld()) });
  await kit.sessionState.put("user:a", STATE);
  const result = await runAgentGraph(kit.deps, kit.input(quote, { actorId: "user:a" }));
  assert.match(result.text, /下周再对一次报价/u);
  assert.doesNotMatch(result.text, /读不到/u);
  assert.equal(result.partResults[0].status, "answered");
  assert.ok(!(result.partResults[0].gaps ?? []).includes("unreadable"), "no unreadable gap is reported for a record that was read");
});

test("the basis line and links come from the cited records, in the reply language", async () => {
  const quote = "上次和小林聊了什么？";
  const model = deepseekStub([
    json({ language: "zh", parts: [notePart(quote, [{ entity: "contact", text: "小林" }])], plainChat: false }),
    (call) => {
      const memo = /(s\d+) — memo[^\n]*\n\s+1\. 和小林聊了报价初稿/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: memo }], partId: "p1", text: "你们聊了报价初稿。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(smallWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input(quote, { actorId: "user:a" }));
  assert.deepEqual(result.sourceRefs, ["memo:note:m31"]);
  assert.deepEqual(result.basis, { links: [{ contactId: "contact:c17", id: "note:m31", label: "11月12日的笔记", type: "memo" }], text: "按你11月12日记的笔记回答" });
});

test("coordinator note: with a basis line the code-written footnote （以上出自你的笔记。） is not said again", async () => {
  const quote = "上次和小林聊了什么？";
  const understand = json({ language: "zh", parts: [part({ goal: "last time", localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: quote })], plainChat: false });
  const cite = (call: { user: string }) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo[^\n]*\n\s+1\. 和小林聊了报价初稿/u.exec(call.user)![1] }], partId: "p1", text: "你们聊了报价初稿。" }] });
  const cited = deepseekStub([understand, cite]);
  const kit = graphKit(cited.fetchImplementation, { records: recordAccessOf(smallWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input(quote, { actorId: "user:a" }));
  assert.ok(result.basis, "the basis line is there");
  assert.doesNotMatch(result.text, /以上出自你的笔记/u);
  // No citation verified → no basis line → the footnote is not dropped by this rule (nothing else says where it came from).
  const none = deepseekStub([understand, json({ segments: [{ cites: [], partId: "p1", text: "你们聊了报价初稿。" }] }), json({ segments: [{ cites: [], partId: "p1", text: "你们聊了报价初稿。" }] })]);
  const kit2 = graphKit(none.fetchImplementation, { records: recordAccessOf(smallWorld()) });
  const without = await runAgentGraph(kit2.deps, kit2.input(quote, { actorId: "user:a" }));
  assert.equal(without.basis, null);
});

test("the footnote the clients drop is the server's own footnote, word for word, in three languages", async () => {
  const { gapWords } = await import("../../features/agent-v1/answer/gap-copy");
  const { zh } = await import("../../shared/copy/zh");
  const { ja } = await import("../../shared/copy/ja");
  const { en } = await import("../../shared/copy/en");
  assert.deepEqual([gapWords("zh").fromNotes(), gapWords("ja").fromNotes(), gapWords("en").fromNotes()], [zh.aiCard.notesFootnote, ja.aiCard.notesFootnote, en.aiCard.notesFootnote]);
});

test("basisOf: one record of each kind, several records, three languages; nothing cited, no basis", () => {
  const sources = new Map([
    ["memo:note:m31", { contactId: "contact:c17", day: "2026-11-12", id: "note:m31", kind: "memo" as const }],
    ["memo:note:m32", { contactId: "contact:c17", day: "2026-11-10", id: "note:m32", kind: "memo" as const, title: "电话" }],
    ["todo:task:t42", { id: "task:t42", kind: "todo" as const, title: "给小林发修订报价" }],
    ["contact:contact:c17", { id: "contact:c17", kind: "contact" as const, title: "小林健" }],
  ]);
  assert.equal(basisOf(["memo:note:m31"], sources, "ja")?.text, "11月12日のメモをもとに回答");
  assert.equal(basisOf(["memo:note:m31"], sources, "en")?.text, "Based on your note from Nov 12");
  assert.equal(basisOf(["todo:task:t42"], sources, "zh")?.text, "按你的待办「给小林发修订报价」回答");
  assert.equal(basisOf(["contact:contact:c17"], sources, "en")?.text, 'Based on your contact "小林健"');
  const many = basisOf(["memo:note:m31", "memo:note:m32"], sources, "zh");
  assert.equal(many?.text, "按你的2条笔记回答");
  assert.deepEqual(many?.links.map((link) => link.label), ["11月12日的笔记", "11月10日的笔记"], "notes are named by their day, as the draft shows");
  assert.equal(basisOf(["memo:note:m33"], new Map([["memo:note:m33", { id: "note:m33", kind: "memo" as const, title: "电话" }]]), "zh")?.links[0].label, "笔记「电话」", "a note without a day keeps its title");
  assert.equal(basisOf(["memo:note:m31", "todo:task:t42"], sources, "en")?.text, "Based on 2 of your records");
  assert.equal(basisOf([], sources, "zh"), null);
  assert.equal(basisOf(["memo:note:gone"], sources, "zh"), null, "a ref with nothing known about it gets no link");
});
