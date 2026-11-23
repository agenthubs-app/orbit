/**
 * AG21a R26 (independent suite, final run): an answer to Orbit's question started the request over. 「把给石楠寄样书那条挪到下周三」
 * → "改计划日还是截止时间" → 「计划日」: the second layer saw only 「计划日」, took it for the record's name and found no to-do of
 * that name. 「把季朗的报价待办改到周四」 → "哪位季朗" → 「柏舟那个」: the person was picked, but the to-do was searched by 「柏舟」
 * and the date was lost. A write question now keeps the asked part (its words, its operations as offsets into them, its
 * clues); a typed answer that names an option picks it and that part goes on — its object and its date — to the card.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { optionPickedIn, resumeOf } from "../../features/agent-v1/propose/asked";
import { resolveSaidDate } from "../../features/agent-v1/propose/dates";
import { partOf } from "./ag20b-kit";
import { ACTOR, byNode, cardKit, contact, fnWorld, json, NOW, todo } from "./functions-kit";
import { captureTrace, deepseekStub, graphKit, part, recordAccessOf, type ModelCall } from "./graph-kit";

function world() {
  const base = fnWorld();
  base.records.push(
    contact(ACTOR, "contact:sn", "石楠", { organization: "白鹭印务", role: "客户经理" }),
    contact(ACTOR, "contact:jl1", "季朗", { organization: "白鹭印务", role: "采购" }),
    contact(ACTOR, "contact:jl2", "季朗", { organization: "柏舟设计", role: "项目经理" }),
    todo(ACTOR, "task:sample", "给石楠寄样书", { dueAt: "2026-11-20T09:00:00.000Z", plannedDate: "2026-11-17", relatedContactId: "contact:sn", source: "manual" }),
    todo(ACTOR, "task:quote1", "给季朗发报价", { plannedDate: "2026-11-16", relatedContactId: "contact:jl1", source: "manual" }),
    todo(ACTOR, "task:quote2", "给季朗发报价", { plannedDate: "2026-11-17", relatedContactId: "contact:jl2", source: "manual" }),
  );
  return base;
}

const day = (words: string) => resolveSaidDate(words, NOW, "Asia/Tokyo")!.day;

/** One turn of a session: the first layer's parts and the second layer's operations as given; every other model call fails. */
async function turn(session: ReturnType<typeof graphKit>, base: ReturnType<typeof world>, message: string, parts: Record<string, unknown>[], operations: unknown[], language: "zh" | "ja" | "en" = "zh") {
  const proposeCalls: ModelCall[] = [];
  const model = deepseekStub(byNode({
    propose: (call) => { proposeCalls.push(call); return json({ operations }); },
    understand: () => json({ language, parts: parts.map((item, index) => part({ localId: `p${index + 1}`, ...item })), plainChat: false }),
  }));
  session.deps.fetchImplementation = model.fetchImplementation;
  const card = cardKit(base);
  session.deps.cards = card.cards;
  await session.seeded;
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(session.deps, session.input(message, { locale: language }));
    return { events: trace.events, frozen: card.frozen, proposeCalls, result };
  } finally {
    trace.restore();
  }
}

test("the asked part is kept with its offsets in its own words; an answer names a field by its word, a person by what tells them apart", () => {
  const message = "好的。把给石楠寄样书那条挪到下周三";
  const at = (words: string): [number, number] => [message.indexOf(words), message.indexOf(words) + words.length];
  const asked = partOf(message, "把给石楠寄样书那条挪到下周三", { refs: [{ entity: "todo", quote: at("给石楠寄样书那条"), recordId: null }], write: { intents: [{ capability: "todo.update", date: at("下周三"), localId: "w1", relations: [], selector: [at("给石楠寄样书那条")] }], picks: {} } });
  const resume = resumeOf(asked, message)!;
  assert.equal(resume.quote, "把给石楠寄样书那条挪到下周三");
  assert.equal(resume.quote.slice(...resume.intents[0].date!), "下周三");
  assert.equal(resume.quote.slice(...resume.intents[0].selector[0]), "给石楠寄样书那条");
  assert.equal(resume.quote.slice(...resume.refs[0].quote!), "给石楠寄样书那条");
  const fields = { options: [{ id: "plannedDate", label: "改计划日期（现在是11月17日）", type: "field" }, { id: "dueAt", label: "改截止时间（现在是11月20日 18:00）", type: "field" }], resume };
  assert.equal(optionPickedIn(fields, "计划日")?.id, "plannedDate");
  assert.equal(optionPickedIn(fields, "截止的那个")?.id, "dueAt");
  assert.equal(optionPickedIn(fields, "期限で")?.id, "dueAt");
  assert.equal(optionPickedIn(fields, "the planned date")?.id, "plannedDate");
  assert.equal(optionPickedIn(fields, "都改"), null, "names neither: nothing is guessed");
  const people = { options: [{ id: "contact:jl1", label: "季朗（白鹭印务 · 采购）", type: "contact" }, { id: "contact:jl2", label: "季朗（柏舟设计 · 项目经理）", type: "contact" }], resume };
  assert.equal(optionPickedIn(people, "柏舟那个")?.id, "contact:jl2");
  assert.equal(optionPickedIn({ options: people.options }, "柏舟那个"), null, "an open item without the asked part keeps the old path");
});

test("「计划日」 after 「改计划日还是截止时间」: the to-do asked about gets next Wednesday as its planned day, on a card", async () => {
  const base = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: recordAccessOf(base) });
  const first = "把给石楠寄样书那条挪到下周三";
  const one = await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "todo", text: "给石楠寄样书那条" }], requiredCapabilities: ["todo.update"], sourceQuote: first }], [{ dateText: "下周三", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", selector: { clues: ["给石楠寄样书那条"] }, verb: "update" }]);
  assert.match(one.result.text, /计划日期|截止时间/u, one.result.text);
  assert.equal(one.frozen.length, 0);
  // The answer: the second layer, if it were asked, would read 「计划日」 as the record's name (what R26 saw).
  const two = await turn(session, base, "计划日", [{ continues: { kind: "clarification", ref: "o1" }, deliverable: "change", objectClues: [{ entity: "todo", text: "计划日" }], requiredCapabilities: ["todo.update"], sourceQuote: "计划日" }], [{ dateText: null, dependsOn: [], entity: "todo", localId: "w1", partId: "p1", selector: { clues: ["计划日"] }, verb: "update" }]);
  assert.doesNotMatch(two.result.text, /没找到|没有找到/u, two.result.text);
  assert.equal(two.proposeCalls.length, 0, "the few words of the answer are not a request of their own");
  const intents = two.frozen.flatMap((card) => card.intents) as { capability: string; targetId?: string; set?: Record<string, unknown> }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId, intent.set]), [["todo.update", "task:sample", { plannedDate: day("下周三") }]]);
  assert.ok(two.events.some((event) => event.type === "propose.answer_picks_option"));
});

test("「柏舟那个」 after 「哪位季朗」: that 季朗's quote to-do, with the original Thursday, on a card — no second question", async () => {
  const base = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: recordAccessOf(base) });
  const first = "把季朗的报价待办改到周四";
  const one = await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "contact", text: "季朗" }, { entity: "todo", text: "报价待办" }], requiredCapabilities: ["todo.update"], sourceQuote: first }], [{ dateText: "周四", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "季朗", entity: "contact", role: "about" }], selector: { clues: ["报价待办"] }, verb: "update" }]);
  assert.match(one.result.text, /柏舟设计/u, one.result.text);
  const two = await turn(session, base, "柏舟那个", [{ continues: { kind: "clarification", ref: "o1" }, deliverable: "change", objectClues: [{ entity: "contact", text: "柏舟那个" }], requiredCapabilities: ["todo.update"], sourceQuote: "柏舟那个" }], [{ dateText: null, dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "柏舟那个", entity: "contact", role: "about" }], selector: { clues: ["柏舟"] }, verb: "update" }]);
  assert.equal(two.result.clarifications.length, 0, `no second question: ${two.result.text}`);
  const intents = two.frozen.flatMap((card) => card.intents) as { capability: string; targetId?: string; set?: Record<string, unknown> }[];
  assert.deepEqual(intents.map((intent) => [intent.capability, intent.targetId, intent.set]), [["todo.update", "task:quote2", { plannedDate: day("周四") }]]);
});

test("en: 'the due date' after 'planned date or due time?' changes the due time", async () => {
  const base = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: recordAccessOf(base) });
  const first = "Move the 给石楠寄样书 to-do to next Wednesday";
  await turn(session, base, first, [{ deliverable: "change", objectClues: [{ entity: "todo", text: "给石楠寄样书" }], requiredCapabilities: ["todo.update"], sourceQuote: first }], [{ dateText: "next Wednesday", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", selector: { clues: ["给石楠寄样书"] }, verb: "update" }], "en");
  const two = await turn(session, base, "the due date", [{ continues: { kind: "clarification", ref: "o1" }, deliverable: "change", requiredCapabilities: ["todo.update"], sourceQuote: "the due date" }], [], "en");
  const intents = two.frozen.flatMap((card) => card.intents) as { capability: string; targetId?: string; set?: Record<string, unknown> }[];
  assert.equal(intents.length, 1, two.result.text);
  assert.equal(intents[0].targetId, "task:sample");
  assert.ok(typeof intents[0].set?.dueAt === "string" && String(intents[0].set.dueAt).startsWith(day("next Wednesday").slice(0, 8)), JSON.stringify(intents[0].set));
});
