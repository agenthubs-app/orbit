import assert from "node:assert/strict";
import test from "node:test";

import { capabilityLabel, GENERIC_DIRECTIONS, optionsFor } from "../../features/agent-v1/clarify/options";
import { DEFAULT_READINGS, readingLabel } from "../../features/agent-v1/clarify/default-readings";
import { CAPABILITIES, CAPABILITY_TABLE } from "../../features/agent-v1/route/capabilities";
import type { SessionOpenItem } from "../../features/agent-v1/context/session-state";

/**
 * agent-design AG04-1 and AG04-3 (易错边界 1, 2): clickable directions come from code only, from three
 * places — this turn's @ references and page, the session's open items, the record kind's registered
 * actions — and with no context at all they are exactly the three generic entries. Labels are code's
 * fixed copy (zh, ja, en) plus the object's clue; a model reading's label is never shown, and a
 * capability outside Appendix A is dropped.
 */

const registered = (options: { capability: string }[]) => options.every((option) => option.capability in CAPABILITY_TABLE);

test("no context: exactly the three generic entries — look something up, make a note, set a reminder", () => {
  for (const language of ["zh", "ja", "en"] as const) {
    const options = optionsFor({ language, purpose: "directions" });
    assert.equal(options.length, 3);
    assert.deepEqual(options.map((option) => option.capability), GENERIC_DIRECTIONS);
    assert.ok(registered(options));
  }
  assert.deepEqual(optionsFor({ language: "zh", purpose: "directions" }).map((option) => option.label), ["查我的资料", "记一笔", "设个提醒"]);
});

test("a text clue only: directions carry the words, without looking up who it is", () => {
  const options = optionsFor({ language: "zh", object: { kind: "contact", name: null, text: "小林" }, purpose: "directions" });
  assert.ok(options.length >= 2 && options.length <= 3);
  assert.ok(options.every((option) => option.label.includes("小林")));
  assert.ok(options.every((option) => !option.ref), "a text clue is not bound to any record");
  assert.ok(registered(options));
});

test("source order: @ references and the page first, then open items, then the kind's registered actions; at most three", () => {
  const alternative: SessionOpenItem = { createdAt: "2026-11-15T09:00:00.000Z", kind: "alternative", leadsTo: "rule.create", partId: "p2", ref: "alternative:agreq_1:p2", requestId: "agreq_1", summary: "s", unrelatedMessages: 0 };
  const options = optionsFor({
    language: "zh",
    object: { kind: "contact", name: null, text: "小林" },
    openItems: [alternative],
    purpose: "directions",
    references: [{ id: "contact:c41", name: "山本直子", type: "contact" }],
  });
  assert.equal(options.length, 3);
  assert.ok(options[0].label.includes("山本直子"), "the @ reference comes first");
  assert.equal(options[0].ref?.id, "contact:c41");
  assert.ok(options.some((option) => option.capability === "rule.create"), "the open alternative is offered");
  const page = optionsFor({ language: "en", pageKind: "event", purpose: "directions" });
  assert.ok(page.length >= 2 && page.every((option) => option.capability.startsWith("event.") || option.capability.startsWith("attendance.") || option.capability.startsWith("todo.")));
});

test("readings: code's labels per capability with the object; model labels are not used; unregistered and empty readings dropped", () => {
  const options = optionsFor({
    language: "en",
    object: { kind: "contact", name: null, text: "Emily" },
    purpose: "readings",
    readings: [
      { capabilities: ["view.recentInteraction"], deliverable: "summary" },
      { capabilities: ["todo.update"], deliverable: "change" },
      { capabilities: ["external.deepResearch"], deliverable: "answer" },
      { capabilities: [], deliverable: "answer" },
    ],
  });
  assert.deepEqual(options.map((option) => option.capability), ["view.recentInteraction", "todo.update", "memo.create"], "padded to three from the contact's registered actions");
  assert.ok(options.every((option) => option.label.includes("Emily")));
  assert.equal(options[1].label, capabilityLabel("todo.update", "en", "Emily"));
});

test("labels read naturally for a person: functions over notes are about the interactions with them", () => {
  const options = optionsFor({
    language: "en",
    object: { kind: "contact", name: null, text: "Emily" },
    purpose: "readings",
    readings: [{ capabilities: ["fn.summarize"], deliverable: "summary" }, { capabilities: ["fn.extractFollowUps"], deliverable: "list" }, { capabilities: ["privateEvent.create"], deliverable: "change" }],
  });
  assert.deepEqual(options.map((option) => option.label), ["See a summary of your interactions with Emily", "Find follow-ups with Emily", "Create an event of my own about Emily"]);
  assert.equal(capabilityLabel("fn.extractFollowUps", "zh", "小林", "contact"), "找出和小林要跟进的事");
  assert.equal(capabilityLabel("fn.extractFollowUps", "zh", "这篇笔记", "memo"), "找出这篇笔记里要跟进的事");
  assert.equal(capabilityLabel("memo.read", "zh", "竞品笔记 A", "memo"), "看竞品笔记 A的全文", "reading a note itself, not 'notes about' it");
  assert.equal(capabilityLabel("memo.read", "zh", "小林", "contact"), "看小林的笔记");
});

test("Japanese lists of choices quote each label", async () => {
  const { CLARIFY_WORDS } = await import("../../features/agent-v1/clarify/copy");
  assert.equal(CLARIFY_WORDS.notUnderstood("ja", null, ["自分の記録を調べる", "メモを残す", "リマインダーを設定する"]), "何をすればよいか分かりませんでした。「自分の記録を調べる」「メモを残す」「リマインダーを設定する」のどれでしょうか？");
  assert.match(CLARIFY_WORDS.askReadings("ja", "X", ["a", "b"]), /「a」「b」のどれにしますか？/u);
});

test("an object question offers the session's candidates, the one mentioned last first", () => {
  const options = optionsFor({
    candidates: [{ id: "contact:c17", name: "小林健", type: "contact" }, { id: "contact:c31", name: "李薇", type: "contact" }],
    capability: "todo.update",
    language: "zh",
    purpose: "object",
  });
  assert.deepEqual(options.map((option) => option.label), ["小林健", "李薇"]);
  assert.deepEqual(options.map((option) => option.ref?.id), ["contact:c17", "contact:c31"]);
  assert.ok(registered(options));
});

test("other readings of a read-only part: at most two, read-only, the chosen one left out", () => {
  const options = optionsFor({
    exclude: DEFAULT_READINGS.memo,
    language: "zh",
    object: { kind: "memo", name: null, text: null },
    purpose: "other_readings",
    readings: [
      { capabilities: ["memo.read", "fn.summarize"], deliverable: "summary" },
      { capabilities: ["memo.read", "fn.extractFollowUps"], deliverable: "list" },
      { capabilities: ["memo.read", "fn.compare"], deliverable: "comparison" },
      { capabilities: ["memo.read", "fn.extractInteractions"], deliverable: "list" },
      { capabilities: ["memo.update"], deliverable: "change" },
    ],
  });
  assert.equal(options.length, 2);
  assert.ok(options.every((option) => CAPABILITY_TABLE[option.capability].kind !== "write"));
  assert.ok(options.every((option) => option.capability !== "fn.summarize"));
});

test("an entry for a statement and the accept option of an alternative are one option each", () => {
  const entry = optionsFor({ capability: "memo.create", language: "zh", object: { kind: "contact", name: null, text: "小林" }, purpose: "entry" });
  assert.equal(entry.length, 1);
  assert.equal(entry[0].capability, "memo.create");
  assert.match(entry[0].label, /小林/u);
  const accept = optionsFor({ capability: "rule.create", language: "zh", purpose: "alternative" });
  assert.equal(accept.length, 1);
  assert.equal(accept[0].capability, "rule.create");
});

test("the alternative to 'keep searching' (AE-UND-011): its topic is the clue's words, never the whole sentence; accepting it is clickable", async () => {
  const { runAgentGraph } = await import("../../features/agent-v1/graph/build");
  const { deepseekStub, graphKit, json, part } = await import("./graph-kit");
  const message = "帮我找摄影主题的活动，这次没有合适的就一直找下去，找到我满意为止。";
  const withoutClue = deepseekStub([json({ parts: [part({ deliverable: "list", persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: message })], plainChat: false })]);
  const kit = graphKit(withoutClue.fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(result.partResults[0].status, "awaiting_acceptance");
  assert.equal(result.text.split(message).length - 1, 1, "the user's sentence is quoted once, as the matter, not again as the topic");
  assert.doesNotMatch(result.text, /与「[^」]*」相符的内容/u);
  assert.match(result.text, /Orbit 的活动目录/u);
  const accept = result.clarifications.flatMap((set) => set.options);
  assert.deepEqual(accept.map((option) => option.capability), ["rule.create"]);
  const withClue = deepseekStub([json({ parts: [part({ deliverable: "list", objectClues: [{ entity: "event", text: "摄影主题的活动" }], persistence: "until_satisfied", requiredCapabilities: ["event.read"], sourceQuote: message })], plainChat: false })]);
  const second = graphKit(withClue.fetchImplementation);
  assert.match((await runAgentGraph(second.deps, second.input(message))).text, /新出现的摄影主题的活动/u);
});

test("every Appendix A capability has a label in three languages; the defaults have their understanding words", () => {
  for (const capability of CAPABILITIES) {
    for (const language of ["zh", "ja", "en"] as const) {
      const label = capabilityLabel(capability, language, "X");
      assert.ok(label.trim().length > 0, `${capability} ${language}`);
      assert.doesNotMatch(label, /\{|\}|undefined/u);
    }
  }
  assert.equal(readingLabel(DEFAULT_READINGS.memo, "zh", null), "看这篇笔记的摘要");
  assert.equal(readingLabel(DEFAULT_READINGS.contact, "zh", "山本直子"), "看和山本直子最近的往来、还有没做完的事");
  assert.match(readingLabel(DEFAULT_READINGS.contact, "ja", "山本直子"), /山本直子/u);
  assert.match(readingLabel(DEFAULT_READINGS.event, "en", null), /time and place/u);
  assert.match(readingLabel(DEFAULT_READINGS.todo, "zh", null), /状态/u);
});
