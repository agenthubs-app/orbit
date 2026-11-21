import assert from "node:assert/strict";
import test from "node:test";

import { optionNamedIn } from "../../features/agent-v1/clarify/attribution";
import type { FirstLayerContext } from "../../features/agent-v1/context/build";
import { importTableOf, ImportTableRejected, previewImport, withHeader } from "../../features/agent-v1/domains/contact/import-preview";
import { boundContactReader } from "../../features/agent-v1/domains/contact/types";
import { reviseImportByWords } from "../../features/agent-v1/entry/import-revision";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { companyNamedIn, findContacts, oneCharOff, partialContacts } from "../../features/agent-v1/graph/nodes/resolve";
import { newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { access, graded, judgeStub } from "./judgment-kit";
import { resolvePartIntents } from "../../features/agent-v1/propose/resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ctxOf, partOf } from "./ag20b-kit";
import { contactWorld, memoryContactAccess } from "./contact-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, memo, todo } from "./read-kit";

/**
 * agent-design AG20b (TRIAGE R10, R12, R13): people and pasted lists. This sprint's own data, not the independent suite's.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

function peopleWorld() {
  return { events: [], records: [
    contact(ACTOR, "contact:mara", "Mara Lindqvist", { organization: "Fjord Atelier", role: "Producer" }),
    contact(ACTOR, "contact:zl1", "周岚", { organization: "青柠童书", role: "版权编辑" }),
    contact(ACTOR, "contact:zl2", "周岚", { organization: "Northlight Press", role: "编辑" }),
    contact(ACTOR, "contact:k1", "小林健", { organization: "小林设计" }),
    contact(ACTOR, "contact:k2", "小林健", { organization: "北辰软件" }),
    contact(ACTOR, "contact:shiraishi", "白石遥", { organization: "東山工務店" }),
    memo(ACTOR, "note:quote-fjord", "给 Fjord Atelier 的同传报价：每天 12 万日元，含半天准备。", "2026-11-02T03:00:00.000Z", ["contact:mara"], { title: "同传报价" }),
    todo(ACTOR, "task:f1", "白石さんへのフォロー", { relatedContactId: "contact:shiraishi", relatedContactIds: ["contact:shiraishi"] }),
    todo(ACTOR, "task:f2", "黒田さんへのフォロー"),
    todo(ACTOR, "task:f3", "青木さんへのフォロー"),
  ] };
}

const span = (message: string, words: string): [number, number] => {
  const at = message.indexOf(words);
  assert.ok(at >= 0, `"${words}" in the message`);
  return [at, at + words.length];
};

function contextWith(item: Record<string, unknown>): FirstLayerContext {
  return { handles: new Map(), idle: false, idleMinutes: 2, lastMentioned: [], lastMentionedForCode: [], messages: [], openItemHandles: new Map(), openItems: [{ createdAt: NOW, handle: "o1", kind: "clarification", partId: "p1", ref: "clarification:req0:p1", requestId: "req0", summary: "asked", unrelatedMessages: 0, ...item }], promptText: "", references: [], shownList: [] } as unknown as FirstLayerContext;
}

/* ── R10 ── */

test("R10 a company's distinctive words name it; the person's own name never does", () => {
  assert.equal(companyNamedIn("青柠童书", "周岚（青柠那个）"), true);
  assert.equal(companyNamedIn("Northlight Press", "the Northlight one"), true);
  assert.equal(companyNamedIn("北辰软件", "上次的报价"), false);
  assert.equal(companyNamedIn("株式会社東山工務店", "東山の件"), true, "the generic words do not count, the name does");
});

test("R10 a company in the sentence tells two people of the same name apart before any question", async () => {
  const records = recordAccessOf(peopleWorld());
  const scope = records.scope(ACTOR);
  const message = "周岚（青柠那个）那边的版权进展怎么样？";
  const found = await findContacts(records, scope, "周岚", message, message);
  assert.deepEqual(found.matches.map((item) => item.id), ["contact:zl1"]);
  const both = await findContacts(records, scope, "小林健", "小林健上次的报价", "小林健上次的报价");
  assert.equal(both.matches.length, 2, "小林健 does not name 小林设计: still a question");
});

test("R10 a contact is found by company; a write offers them in a question, never picks one", async () => {
  const records = recordAccessOf(peopleWorld());
  const found = await findContacts(records, records.scope(ACTOR), "Fjord", "Fjord 那边", "Fjord 那边");
  assert.deepEqual(found.matches.map((item) => item.id), ["contact:mara"]);
  assert.equal(found.matches[0].byCompany, true);
  const message = "记一下：今天给 Fjord 那边打了电话";
  const intent: StoredIntent = { body: span(message, "今天给 Fjord 那边打了电话"), capability: "memo.create", localId: "o1", relations: [{ quote: span(message, "Fjord 那边"), role: "actual_contact" }], selector: [] };
  const outcome = await resolvePartIntents(ctxOf(records, message), partOf(message, message, { capabilities: ["memo.create"] }), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "ask", JSON.stringify(outcome));
  assert.deepEqual(outcome.kind === "ask" && outcome.question.type === "contact" ? outcome.question.candidates.map((item) => item.id) : [], ["contact:mara"]);
});

test("R10 a question naming a company reads the notes of the person there (no dead end)", async () => {
  const message = "Fjord 那边的同传我现在一天报多少？";
  let materials = "";
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "Fjord 那边" }], readFilter: { text: "同传" }, requiredCapabilities: ["memo.read"], sourceQuote: message })], plainChat: false });
    materials = call.user;
    const handle = /(s\d+) — memo "同传报价"/u.exec(call.user)?.[1];
    return json({ segments: [{ cites: handle ? [{ sentenceIds: [1], sourceRef: handle }] : [], partId: "p1", text: "现在给 Fjord Atelier 的同传报价是每天 12 万日元。" }] });
  });
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(peopleWorld()) });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.match(materials, /12 万日元/u, "the note is read");
  assert.ok(result.sourceRefs.includes("memo:note:quote-fjord"), result.text);
  assert.doesNotMatch(result.text, /哪一位联系人|没有找到/u);
});

/* ── R13 ── */

const OPTIONS = [{ id: "contact:zl1", label: "周岚（青柠童书 · 版权编辑）", type: "contact" }, { id: "contact:zl2", label: "周岚（Northlight Press · 编辑）", type: "contact" }];

test("R13 a typed answer names an offered option by what tells it apart; shared words and two names pick nothing", () => {
  assert.equal(optionNamedIn({ options: OPTIONS }, "青柠那个。")?.id, "contact:zl1");
  assert.equal(optionNamedIn({ options: OPTIONS }, "Northlight 的那位")?.id, "contact:zl2");
  assert.equal(optionNamedIn({ options: OPTIONS }, "周岚"), null, "the name both share");
  assert.equal(optionNamedIn({ options: OPTIONS }, "青柠还是 Northlight 都行"), null, "two named");
  assert.equal(optionNamedIn({ options: [{ id: "a", label: "現場の立ち会い", type: "reading" }, { id: "b", label: "見積もりの確認", type: "reading" }] }, "現場の立ち会いのほう")?.id, "a");
});

test("R13 '青柠那个' after 'which 周岚' picks that one for the card", async () => {
  const message = "青柠那个，记一下今天和她通了电话";
  const records = recordAccessOf(peopleWorld());
  const ctx = { ...ctxOf(records, message), context: contextWith({ clues: [{ entity: "contact", text: "周岚" }], options: OPTIONS, quote: "记一下今天和周岚通了电话" }) };
  const intent: StoredIntent = { body: span(message, "今天和她通了电话"), capability: "memo.create", localId: "o1", relations: [{ quote: span(message, "青柠那个"), role: "actual_contact" }], selector: [] };
  const outcome = await resolvePartIntents(ctx, partOf(message, message, { capabilities: ["memo.create"], continues: { kind: "clarification", ref: "clarification:req0:p1" } }), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.deepEqual(outcome.kind === "ready" ? (outcome.ops[0] as { set: { contactIds: string[] } }).set.contactIds : [], ["contact:zl1"]);
});

test("R13 'フォローを完了にして' after '白石さんの件…' goes on with 白石's follow-up, not a second question over everyone's", async () => {
  const message = "フォローを完了にして";
  const records = recordAccessOf(peopleWorld());
  const ctx = { ...ctxOf(records, message, "ja"), context: contextWith({ clues: [{ entity: "contact", text: "白石さん" }], quote: "白石さんの件、片付けておいて" }) };
  const intent: StoredIntent = { capability: "todo.complete", localId: "o1", relations: [], selector: [span(message, "フォロー")] };
  const outcome = await resolvePartIntents(ctx, partOf(message, message, { capabilities: ["todo.complete"], continues: { kind: "clarification", ref: "clarification:req0:p1" } }), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.equal(outcome.kind === "ready" ? (outcome.ops[0] as { targetId?: string }).targetId : null, "task:f1");
  // Without the question it is still asked which (no guess).
  const fresh = await resolvePartIntents(ctxOf(records, message, "ja"), partOf(message, message, { capabilities: ["todo.complete"] }), { intents: [intent], picks: {} });
  assert.equal(fresh.kind, "ask");
});

/* ── owner decision 4: a name one character off ── */

test("decision 4: a name one character off two real contacts offers both to pick; a name with no close one is still not found", async () => {
  const world = peopleWorld();
  world.records.push(contact(ACTOR, "contact:jh1", "林嘉禾", { organization: "南岸印刷" }), contact(ACTOR, "contact:jh2", "林佳禾", { organization: "北岸纸业" }));
  const records = recordAccessOf(world);
  const scope = records.scope(ACTOR);
  assert.deepEqual((await partialContacts(records, scope, "林家禾")).map((item) => [item.id, item.partial]).sort(), [["contact:jh1", true], ["contact:jh2", true]]);
  assert.deepEqual(await partialContacts(records, scope, "王大锤"), []);
  assert.equal(oneCharOff("林家禾", "林嘉禾"), true);
  assert.equal(oneCharOff("林家禾", "林嘉和"), false);
  // A write never picks: both are offered, nothing is logged on a guessed person.
  const message = "记一下：今天和林家禾通了电话";
  const intent: StoredIntent = { body: span(message, "今天和林家禾通了电话"), capability: "memo.create", localId: "o1", relations: [{ quote: span(message, "林家禾"), role: "actual_contact" }], selector: [] };
  const outcome = await resolvePartIntents(ctxOf(records, message), partOf(message, message, { capabilities: ["memo.create"] }), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "ask", JSON.stringify(outcome));
  assert.deepEqual(outcome.kind === "ask" && outcome.question.type === "contact" ? outcome.question.candidates.map((item) => item.id).sort() : [], ["contact:jh1", "contact:jh2"]);
});

/* ── owner decision 6: a to-do named in another language ── */

test("decision 6: 'NDA' against 「签署供应商保密协议」 offers that to-do (done) as a candidate to click, never a match", async (t) => {
  // Record finder port: owner decision 6 (to-dos by meaning, judgment match.level) is the legacy lookup's; the new finder asks
  // DeepSeek once for other words instead (finder/live.ts reformulate). Kept under the rollback flag.
  const finder = process.env.ORBIT_AGENT_FINDER;
  process.env.ORBIT_AGENT_FINDER = "legacy";
  t.after(() => { if (finder === undefined) delete process.env.ORBIT_AGENT_FINDER; else process.env.ORBIT_AGENT_FINDER = finder; });
  const world = peopleWorld();
  world.records.push(todo(ACTOR, "task:nda", "签署供应商保密协议", { completedAt: "2026-11-10T01:00:00.000Z", status: "completed" }), todo(ACTOR, "task:photos", "整理样品照片"));
  const records = recordAccessOf(world);
  const judge = judgeStub((id, _question, call) => {
    const key = /t\d+/u.exec(id)?.[0] ?? "";
    const line = call.body.input.map((item) => item.text).join("\n").split("\n").find((text) => text.startsWith(`[${key}]`)) ?? "";
    return line.includes("保密协议") ? graded(0.02, 0.05, 0.93) : graded(0.9, 0.08, 0.02);
  });
  const message = "把 supplier NDA 那条改到周五";
  const intent: StoredIntent = { capability: "todo.update", date: span(message, "周五"), localId: "o1", relations: [], selector: [span(message, "supplier NDA 那条")] };
  const ctx = { ...ctxOf(records, message), judgment: access(judge.fetchImplementation), judgmentBudget: newJudgmentBudget() };
  const outcome = await resolvePartIntents(ctx, partOf(message, message), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "ask", JSON.stringify(outcome));
  const question = outcome.kind === "ask" && outcome.question.type === "todo" ? outcome.question : null;
  assert.deepEqual(question?.candidates.map((item) => [item.id, item.detail]), [["task:nda", "已完成"]]);
  assert.ok(question?.notFound !== undefined, "said as not found by the words");
  assert.equal(judge.calls.length, 1, "one judgment request");
  // No judgment available: still "not found", nothing offered.
  const plain = await resolvePartIntents(ctxOf(records, message), partOf(message, message), { intents: [intent], picks: {} });
  assert.equal(plain.kind, "stop");
});

/* ── R12 ── */

const LEDGER_NOW = "2026-11-15T01:00:00.000Z";
function ledgerOver(world: ReturnType<typeof contactWorld>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  return createAgentRuntimeService({ cardReader: { read: async () => null, contacts: boundContactReader(memoryContactAccess(world), ACTOR) }, executors: createAgentExecutorRegistry([]), now: () => LEDGER_NOW, repository });
}

const PASTED = "帮我把这几个人导进联系人：\n林小雨,青柠童书,编辑\n森田葵,东和商事,采购\n王强,远帆物流,运营经理";

test("R12 a pasted list with no header row is one person per line (name, company, title); a header row still works", () => {
  const table = importTableOf(PASTED)!;
  const preview = previewImport(withHeader(table), [], ACTOR);
  assert.deepEqual(preview.rows.map((row) => row.name), ["林小雨", "森田葵", "王强"]);
  assert.deepEqual(preview.rows.map((row) => row.organization), ["青柠童书", "东和商事", "远帆物流"]);
  assert.ok(preview.rows.every((row) => row.reason !== "missing_name"));
  const headed = "姓名,公司,职位\n林小雨,青柠童书,编辑";
  assert.equal(withHeader(headed), headed, "a table with its own header is left as it is");
  assert.equal(withHeader(withHeader(table)), withHeader(table));
  const withEmail = previewImport(withHeader("林小雨,lin@example.test,青柠童书\n森田葵,morita@example.test,东和商事"), [], ACTOR);
  assert.deepEqual(withEmail.rows.map((row) => [row.name, row.organization]), [["林小雨", "青柠童书"], ["森田葵", "东和商事"]]);
});

test("R12 a format this version cannot read is refused, never a card whose rows all have no name", () => {
  assert.throws(() => withHeader("a,b,c,d,e\nf,g,h,i,j"), ImportTableRejected, "more unnamed columns than name, company, title");
  assert.throws(() => previewImport("公司,职位\n青柠童书,编辑\n东和商事,采购", [], ACTOR), ImportTableRejected, "no row has a name");
});

test("R12 '第 2 行也新建' on a pasted list changes that row; a row that cannot change is said so, never claimed", async () => {
  const world = contactWorld();
  const runtime = ledgerOver(world);
  const text = withHeader("王强,远帆物流,运营经理\n高桥凉,山手出版,营业\n,青叶设计,实习生");
  await runtime.freezeCard!({ actionId: "card:imp2", intents: [{ capability: "contact.import", overrides: {}, text }], locale: "zh", origin: { conversationId: "session:a", kind: "conversation", requestId: "req:imp2" } });
  const revised = await reviseImportByWords({ actorId: ACTOR, message: "第1行也新建", now: () => LEDGER_NOW, runtime, sessionId: "session:a", store: null });
  assert.ok(revised);
  assert.match(revised!.text, /第1行改为新建/u);
  const stuck = await reviseImportByWords({ actorId: ACTOR, message: "第3行也新建", now: () => LEDGER_NOW, runtime, sessionId: "session:a", store: null });
  assert.ok(stuck);
  assert.doesNotMatch(stuck!.text, /第3行改为新建/u);
  assert.match(stuck!.text, /第3行没法改/u);
});
