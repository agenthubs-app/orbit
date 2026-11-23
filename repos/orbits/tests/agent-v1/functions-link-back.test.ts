import assert from "node:assert/strict";
import test from "node:test";

import { linkFollowUp, linkInteraction, type ExistingTodo } from "../../features/agent-v1/functions/link-back";
import { localDayOf } from "../../features/agent-v1/propose/dates";
import { choice, noul } from "./judgment-kit";
import { ACTOR, fnWorld, memo, runFn, todo } from "./functions-kit";

/**
 * agent-design AG10-5: organizing the same memo again goes back to what is already recorded. The key is the source memo
 * and its sentence (and the action in it), never the user's words: asked again in other words, the same record is found.
 * Same → pointed at, with its status, no card; other dates → the differences only; only a similar title → unsure.
 */

const day = (instant: string) => localDayOf(instant, "Asia/Tokyo");
const existing = (extra: Partial<ExistingTodo>): ExistingTodo => ({ dueAt: null, id: "task:x", notes: null, plannedDate: null, ref: "todo:task:x", sourceNoteId: "note:m91", status: "open", title: "把合同草稿发给王强", ...extra });

test("an interaction already on the memo with the same fields is 'recorded'; a different one is a conflict, never overwritten", () => {
  const interaction = { actualContactIds: ["contact:c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-10" };
  assert.deepEqual(linkInteraction({ ...interaction, precision: "day" } as never, interaction), { kind: "recorded" });
  assert.equal(linkInteraction({ ...interaction, occurredOn: "2026-11-09", precision: "day" } as never, interaction).kind, "conflict");
  assert.equal(linkInteraction(null, interaction).kind, "new");
});

test("a to-do from the same memo sentence is found again — the action reworded, the user's words different — and two actions of one sentence are told apart", () => {
  const sentence = "我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。";
  const todos = [existing({ id: "task:a", notes: `「${sentence}」（王强通话）`, plannedDate: "2026-11-20", ref: "todo:task:a", title: "把合同草稿发给王强" }), existing({ dueAt: "2026-11-25T14:59:00.000Z", id: "task:b", notes: `「${sentence}」（王强通话）`, ref: "todo:task:b", title: "补齐发票" })];
  const first = linkFollowUp({ action: "把合同草稿发给王强", dueDate: null, plannedDate: "2026-11-20", sentence }, todos, day);
  assert.deepEqual([first.kind, first.kind === "same" ? first.todo.id : null], ["same", "task:a"]);
  const reworded = linkFollowUp({ action: "给王强发合同草稿", dueDate: null, plannedDate: "2026-11-20", sentence }, todos, day);
  assert.deepEqual([reworded.kind, reworded.kind === "same" ? reworded.todo.id : null], ["same", "task:a"]);
  const second = linkFollowUp({ action: "把发票补齐", dueDate: "2026-11-25", plannedDate: null, sentence }, todos, day);
  assert.deepEqual([second.kind, second.kind === "same" ? second.todo.id : null], ["same", "task:b"]);
});

test("the memo changed its date: only the difference is said (no card, nothing changed)", () => {
  const sentence = "我答应 11 月 21 日把合同草稿发给他。";
  const link = linkFollowUp({ action: "把合同草稿发给王强", dueDate: null, plannedDate: "2026-11-21", sentence }, [existing({ notes: "「我答应 11 月 20 日把合同草稿发给他。」", plannedDate: "2026-11-20" })], day);
  assert.equal(link.kind, "differs");
  assert.deepEqual(link.kind === "differs" ? link.differences : [], ["plannedDate"]);
});

test("a seeded to-do with no sentence kept (AE-SCL-018's RT06): the same action of the same memo is it; a similar title alone is unsure", () => {
  const rt06 = existing({ dueAt: "2026-11-18T14:59:00.000Z", id: "task:rt06", ref: "todo:task:rt06", sourceNoteId: "note:rm15", title: "出品リストを中村さんに送る" });
  const same = linkFollowUp({ action: "出品リストを中村さんに送る", dueDate: "2026-11-18", plannedDate: null, sentence: "私は11月18日までに出品リストを中村さんに送ると約束した。" }, [rt06], day);
  assert.equal(same.kind, "same");
  const unsure = linkFollowUp({ action: "中村さんに資料を送る", dueDate: null, plannedDate: null, sentence: "x" }, [rt06], day);
  assert.notEqual(unsure.kind, "same");
});

test("graph (AE-FN-009 third step): the memo already records this call — '已记录', the memo cited, no card", async () => {
  const world = fnWorld();
  const index = world.records.findIndex((record) => record.id === "note:m32");
  world.records[index] = memo(ACTOR, "note:m32", "11 月 10 日小林给我打电话，说小陈在审核。我答应 11 月 13 日给小林发报价。", "2026-11-10T11:00:00.000Z", ["contact:c17", "contact:c21"], { interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-10", precision: "day" }, title: "11 月 10 日笔记", version: 2 });
  const message = "再用 @11 月 10 日笔记 更新一次我和小林的往来。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }, { entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "memo.create"], sourceQuote: message }], {
    extract: { interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] },
    judge: () => noul(0.95),
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
    world,
  });
  assert.equal(run.frozen.length, 0);
  assert.match(run.result.text, /已经记过了：这次往来（小林健，11月10日（周二），对方来电）已经记在笔记「11 月 10 日笔记」上/u);
  assert.ok(run.result.sourceRefs.includes("memo:note:m32"));
  assert.ok(run.events.some((event) => event.type === "fn.extractInteractions"));
});

test("graph (AE-FN-013 third step): both to-dos already made from the memo — pointed at with their status, no new card", async () => {
  const world = fnWorld();
  const sentence = "我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。";
  world.records.push(todo(ACTOR, "task:new1", "把合同草稿发给王强", { notes: `「${sentence}」（王强通话）`, plannedDate: "2026-11-20", relatedContactId: "contact:c46", sourceNoteId: "note:m91", sourceNoteVersion: 1 }));
  world.records.push(todo(ACTOR, "task:new2", "补齐发票", { dueAt: "2026-11-25T14:59:00.000Z", notes: `「${sentence}」（王强通话）`, relatedContactId: "contact:c46", sourceNoteId: "note:m91", sourceNoteVersion: 1 }));
  const message = "把 @王强通话 里我答应的事再加到待办一次。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@王强通话" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
    extract: { followUps: [{ action: "给王强发合同草稿", owner: "me", plannedDateText: "11 月 20 日", sentenceIds: [2] }, { action: "补齐发票", dueDateText: "最迟 11 月 25 日", owner: "me", sentenceIds: [2] }] },
    judge: (id) => choice("me", 0.95),
    references: [{ id: "note:m91", name: "王强通话", type: "memo" }],
    world,
  });
  assert.equal(run.frozen.length, 0);
  assert.match(run.result.text, /已经有这条待办：「把合同草稿发给王强」（计划 11月20日（周五） 做），现在未完成。这次没有再新增。/u);
  assert.match(run.result.text, /已经有这条待办：「补齐发票」（最迟 11月25日（周三）），现在未完成。/u);
  assert.ok(run.result.sourceRefs.includes("todo:task:new1") && run.result.sourceRefs.includes("todo:task:new2"));
});
