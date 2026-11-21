import assert from "node:assert/strict";
import { test } from "node:test";

import { contactOfClue } from "../../features/agent-v1/functions/extract";
import { retractedWrites } from "../../features/agent-v1/understand/negated-writes";
import { resolvePartIntents, type ResolveContext } from "../../features/agent-v1/propose/resolve";
import { buildFirstLayerContext } from "../../features/agent-v1/context/build";
import { choice } from "./judgment-kit";
import { fnWorld, NOW, runFn } from "./functions-kit";
import { contact, memo, todo } from "./read-kit";
import { ACTOR, contactWorld, json, runContact } from "./contact-kit";
import { recordAccessOf } from "./graph-kit";
import { memoryContactAccess } from "./contact-kit";

/**
 * agent-design AG20a (independent suite first run, TRIAGE.md R11, R15, R16, R18), on this sprint's own data:
 * - R11 a note's promise made into a to-do finds the to-do already there for the same thing (with its state), even when
 *   it was not made from that note; a given name is matched to the note's own linked contact (设计稿 §3.5);
 * - R15 a record a card changes is "the one just mentioned" for 他／她 in the next turn (§3.10);
 * - R16 a change taken back in the same sentence is not sent to the write step (§3.1);
 * - R18 an explicit request for a to-do about what the other person promised is a write and gets its card (§3.2, §3.5).
 */

const owner = (byKey: Record<string, string>) => (id: string) => {
  const key = id.split("__")[1];
  return byKey[key] ? choice(byKey[key], 0.95) : undefined;
};

function noteWorld() {
  const world = fnWorld();
  world.records.push(
    contact("actor:a", "contact:hmy", "贺明远", { organization: "青石译社", role: "译审" }),
    contact("actor:a", "contact:dana", "Dana Whitfield", { organization: "Northbeam", role: "Buyer" }),
    memo("actor:a", "note:mhy", "和明远通了电话。我答应 11 月 20 日前把样稿发给明远。", "2026-11-14T03:00:00.000Z", ["contact:hmy"], { title: "明远通话" }),
    memo("actor:a", "note:mdana", "Met Dana at the fair. Dana promised to send the revised price sheet by next Wednesday.", "2026-11-14T05:00:00.000Z", ["contact:dana"], { title: "Dana at the fair" }),
    // Made by hand before the note was organized: no link to the note.
    todo("actor:a", "task:hmy1", "给明远发样稿", { plannedDate: "2026-11-19", relatedContactId: "contact:hmy", source: "manual" }),
  );
  return world;
}

test("R11: a given name is the note's linked contact (贺明远 → 明远; 4-character names too); never two of them", () => {
  const contacts = [{ id: "contact:hmy", name: "贺明远" }, { id: "contact:oy", name: "欧阳晓雯" }, { id: "contact:nk", name: "中村理沙" }];
  assert.equal(contactOfClue("明远", contacts)?.id, "contact:hmy");
  assert.equal(contactOfClue("晓雯", contacts)?.id, "contact:oy");
  assert.equal(contactOfClue("理沙さん", contacts)?.id, "contact:nk");
  assert.equal(contactOfClue("明远", [...contacts, { id: "contact:hmy2", name: "林明远" }]), null, "two people of that given name: none");
});

test("R11: the promise already has a to-do (made by hand, not from the note): it is returned with its state; no card", async () => {
  const message = "把 @明远通话 里我答应的事加到待办。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@明远通话" }, { entity: "todo", text: "待办" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
    extract: { followUps: [{ aboutClue: "明远", action: "把样稿发给明远", dueDateText: "11 月 20 日前", owner: "me", sentenceIds: [2] }] },
    judge: owner({ f1: "me" }),
    references: [{ id: "note:mhy", name: "明远通话", type: "memo" }],
    world: noteWorld(),
  });
  assert.equal(run.frozen.length, 0, "no second to-do");
  // The note says "11 月 20 日前", the to-do is planned for 11-19: the same item, its state said, the difference said, nothing changed.
  assert.match(run.result.text, /已经有这件事的待办「给明远发样稿」（现在未完成），但笔记里写的是最迟 11月20日（周五）。这次没有新增也没有改/u, run.result.text);
  assert.doesNotMatch(run.result.text, /这篇笔记已经建过/u, "it was not made from this note");
  assert.ok(run.events.some((event) => event.type === "functions.link_back" && event.link === "differs" && event.todo === "todo:task:hmy1"));
});

test("R11: only a similar title, the to-do about someone else: it is not taken as the same; the user decides", async () => {
  const world = noteWorld();
  const hand = world.records.find((record) => record.id === "task:hmy1")!;
  (hand.payload.task as Record<string, unknown>).relatedContactId = "contact:c17";
  (hand.payload.task as Record<string, unknown>).title = "发样稿";
  const message = "把 @明远通话 里我答应的事加到待办。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@明远通话" }, { entity: "todo", text: "待办" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
    extract: { followUps: [{ aboutClue: "明远", action: "把样稿发给明远", dueDateText: "11 月 20 日前", owner: "me", sentenceIds: [2] }] },
    judge: owner({ f1: "me" }),
    references: [{ id: "note:mhy", name: "明远通话", type: "memo" }],
    world,
  });
  assert.equal(run.frozen.length, 1, "another person's to-do is not this promise: the card is made");
  assert.deepEqual((run.frozen[0].intents[0] as unknown as { set: { relatedContactIds: string[] } }).set.relatedContactIds, ["contact:hmy"]);
});

test("R18: 'create a to-do to chase what Dana promised' — a card for the follow-up, about Dana, on the day the user said", async () => {
  const message = "帮我新建一条待办，周二跟进 @Dana at the fair 里 Dana 答应的报价单。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@Dana at the fair" }, { entity: "contact", text: "Dana" }, { entity: "todo", text: "待办" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
    extract: { followUps: [{ aboutClue: "Dana", action: "Send the revised price sheet", dueDateText: "by next Wednesday", owner: "other", sentenceIds: [2] }] },
    judge: owner({ f1: "other" }),
    references: [{ id: "note:mdana", name: "Dana at the fair", type: "memo" }],
    world: noteWorld(),
  });
  assert.equal(run.frozen.length, 1, run.result.text);
  const [intent] = run.frozen[0].intents as unknown as { capability: string; set: Record<string, unknown> }[];
  assert.equal(intent.capability, "todo.create");
  assert.equal(intent.set.title, "跟进 Dana Whitfield：Send the revised price sheet");
  assert.equal(intent.set.plannedDate, "2026-11-17", "the Tuesday the user said");
  assert.deepEqual(intent.set.relatedContactIds, ["contact:dana"]);
  assert.equal(intent.set.sourceNoteId, "note:mdana");
  // Without the explicit request the other's promise stays a list, never a card.
  const ask = "@Dana at the fair 里 Dana 答应了什么？";
  const read = await runFn(ask, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@Dana at the fair" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps"], sourceQuote: ask }], {
    extract: { followUps: [{ aboutClue: "Dana", action: "Send the revised price sheet", dueDateText: "by next Wednesday", owner: "other", sentenceIds: [2] }] },
    judge: owner({ f1: "other" }),
    references: [{ id: "note:mdana", name: "Dana at the fair", type: "memo" }],
    world: noteWorld(),
  });
  assert.equal(read.frozen.length, 0);
});

test("R16: a change taken back in the same sentence drops the write; a plain change, or a retraction before it, does not", () => {
  const writes = ["todo.update", "memo.read"];
  assert.deepEqual(retractedWrites("把交季度报表改到周五——算了不改了", writes), ["todo.update"]);
  assert.deepEqual(retractedWrites("把截止改到周五，算了，还是不改了", writes), ["todo.update"]);
  assert.deepEqual(retractedWrites("Move the report to Friday — actually, never mind.", writes), ["todo.update"]);
  assert.deepEqual(retractedWrites("レポートを金曜に変更して…やっぱりいいや", writes), ["todo.update"]);
  assert.deepEqual(retractedWrites("把交季度报表改到周五", writes), []);
  assert.deepEqual(retractedWrites("算了不改周四了，改到周五吧", writes), [], "the retraction comes before the change it keeps");
});

test("R16 graph: the retracted half does not reach the write step; the other half is still answered", async () => {
  const world = contactWorld((records) => records.push(todo(ACTOR, "task:qr", "交季度报表", { plannedDate: "2026-11-19" })));
  const message = "把交季度报表改到周五——算了不改了。它的计划日是哪天？";
  const run = await runContact(message, [
    { deliverable: "change", objectClues: [{ entity: "todo", text: "交季度报表" }], requiredCapabilities: ["todo.update"], sourceQuote: "把交季度报表改到周五——算了不改了" },
    { dataSources: ["orbit_records"], objectClues: [{ entity: "todo", text: "它" }], requiredCapabilities: ["todo.read"], sourceQuote: "它的计划日是哪天？" },
  ], [], { answer: () => json({ segments: [] }), world });
  assert.ok(!run.result.partResults.some((part) => part.route === "propose_write"), JSON.stringify(run.result.partResults));
  assert.equal(run.frozen.length, 0);
  assert.ok(!run.modelCalls.some((call) => call.node === "propose"), "no second-layer call");
  assert.doesNotMatch(run.result.text, /我没看出要怎么改/u);
});

test("R15: the contact a card deletes is the one just mentioned; '还是把他恢复吧' restores that contact", async () => {
  const world = contactWorld();
  const run = await runContact("把李薇从联系人里删掉。", [{ deliverable: "change", objectClues: [{ entity: "contact", text: "李薇" }], requiredCapabilities: ["contact.delete"], sourceQuote: "把李薇从联系人里删掉" }], [{ dependsOn: [], entity: "contact", localId: "w1", partId: "p1", selector: { clues: ["李薇"] }, verb: "delete" }], { world });
  assert.equal(run.frozen.length, 1);
  const state = run.state;
  assert.ok(state?.lastMentioned.some((item) => item.id === "contact:c31" && item.type === "contact"), JSON.stringify(state?.lastMentioned));
  // The next turn: the contact is deleted now (it cannot be opened), the pronoun still names it for a restore.
  const deleted = world.records.find((record) => record.id === "contact:c31")!;
  deleted.deleted = true;
  deleted.payload = { ...deleted.payload, deletedAt: "2026-11-15T00:30:00.000Z" };
  const context = buildFirstLayerContext({ inaccessible: new Set(["contact:c31"]), messages: [{ createdAt: "2026-11-15T00:59:00.000Z", role: "user", text: "把李薇从联系人里删掉。" }, { createdAt: "2026-11-15T00:59:30.000Z", role: "assistant", text: "确认卡…" }], now: NOW, references: [], state: state! });
  const message = "还是把他恢复吧";
  const ctx: ResolveContext = { asOf: NOW, asked: new Map(), context, language: "zh", message, nameOf: () => null, people: [], records: { ...recordAccessOf(world), contacts: memoryContactAccess(world) }, scope: { accountId: ACTOR, authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }, timeZone: "Asia/Tokyo" };
  const outcome = await resolvePartIntents(ctx, { localId: "p1", quote: [0, message.length], refs: [{ entity: "contact", quote: [message.indexOf("他"), message.indexOf("他") + 1], recordId: null }] } as never, { intents: [{ capability: "contact.restore", localId: "w1", relations: [], selector: [[message.indexOf("他"), message.indexOf("他") + 1]] }], picks: {} });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.equal((outcome as { ops: { targetId: string }[] }).ops[0].targetId, "contact:c31");
});

void NOW;
