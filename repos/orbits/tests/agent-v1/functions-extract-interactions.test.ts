import assert from "node:assert/strict";
import test from "node:test";

import { memoDateOf } from "../../features/agent-v1/functions/dates";
import { guardInteraction } from "../../features/agent-v1/functions/extract";
import { applyApprovedMemoUpdate } from "../../features/agent-v1/domains/memo/write";
import { AgentExecutionPermanentError } from "../../features/agent/runtime/service";
import { NoteServiceError } from "../../features/notes/service";
import { noul } from "./judgment-kit";
import { fnWorld, NOW, runFn } from "./functions-kit";
import { graphKit, recordAccessOf } from "./graph-kit";

/**
 * agent-design AG10-3: only an interaction that actually happened between the author and one of the memo's contacts can
 * be written. Someone only mentioned, an intention to contact later, a call between other people that someone reported:
 * never — whatever the model said — and a review that is not sure leaves it listed as doubtful. Dates are worked out
 * from the memo's own date in Asia/Tokyo.
 */

const M32 = { id: "note:m32", name: "11 月 10 日笔记", type: "memo" };
const M90 = { id: "note:m90", name: "同事转述", type: "memo" };
const cards = (run: Awaited<ReturnType<typeof runFn>>) => run.frozen.length;

test("dates come from the memo's own day: '前天' in a memo of 11-14 is 11-12; no date words, no date", () => {
  assert.deepEqual(memoDateOf("前天", "2026-11-14T12:00:00.000Z", "Asia/Tokyo"), { day: "2026-11-12", precision: "day" });
  assert.deepEqual(memoDateOf("11 月 10 日", "2026-11-10T11:00:00.000Z", "Asia/Tokyo"), { day: "2026-11-10", precision: "day" });
  assert.deepEqual(memoDateOf(undefined, "2026-11-10T11:00:00.000Z", "Asia/Tokyo"), { day: null, precision: "unknown" });
});

test("code's guard: hearsay without the author and an intention without a contact are not interactions, whatever the model said", () => {
  const happened = { channel: "phone" as const, contactClue: "田中", direction: "mutual" as const, kind: "happened" as const, precision: "day" as const, sentenceIds: [1] };
  assert.equal(guardInteraction(happened, "听同事说，田中前天和王强通过电话。"), "between_others");
  assert.equal(guardInteraction({ ...happened, contactClue: "佐藤" }, "佐藤那边我打算下周再联系。"), "planned");
  assert.equal(guardInteraction({ ...happened, contactClue: "松本" }, "松本さんには来週あたり連絡しようと思う。"), "planned");
  assert.equal(guardInteraction({ ...happened, contactClue: "小林" }, "11 月 10 日小林给我打电话，说小陈在审核。"), "happened");
  assert.equal(guardInteraction({ ...happened, contactClue: "中村" }, "11月12日、中村さんから電話。"), "happened");
});

test("AE-FN-010: hearsay and a plan only — zero write proposals, no card; the answer says why for each", async () => {
  const message = "把 @同事转述 里的往来都记到对应的联系人上。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@同事转述" }, { entity: "contact", text: "对应的联系人" }], requiredCapabilities: ["memo.read", "contact.read", "fn.extractInteractions", "contact.update"], sourceQuote: message }], {
    // The worst model: it calls both of them interactions that happened.
    extract: { interactions: [{ channel: "phone", contactClue: "田中", dateText: "前天", direction: "mutual", kind: "happened", precision: "day", sentenceIds: [1] }, { channel: "other", contactClue: "佐藤", direction: "outgoing", kind: "happened", precision: "unknown", sentenceIds: [2] }] },
    judge: () => noul(0.99),
    references: [M90],
  });
  assert.equal(cards(run), 0);
  assert.equal(run.judgeCalls.length, 0, "nothing left to review once code's guard has spoken");
  assert.match(run.result.text, /这篇笔记里没有你本人和联系人已经发生的往来，所以没有可记的/u);
  assert.match(run.result.text, /田中浩：是别人之间的事/u);
  assert.match(run.result.text, /佐藤健一：只是打算以后联系，还没有发生/u);
  assert.ok(run.events.some((event) => event.type === "fn.extractInteractions"));
});

test("AE-FN-009: '更新我和小林的往来' — one card setting the interaction on M32 (小林健, phone, incoming, 11-10); 小陈 is only mentioned", async () => {
  const message = "用 @11 月 10 日笔记 更新我和小林的往来。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read", "contact.read", "fn.extractInteractions", "memo.create"], sourceQuote: message }], {
    extract: { interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }, { channel: "other", contactClue: "小陈", direction: "mutual", kind: "mentioned_only", precision: "unknown", sentenceIds: [1] }] },
    judge: () => noul(0.95),
    references: [M32],
  });
  assert.equal(cards(run), 1);
  const [intent] = run.frozen[0].intents;
  assert.equal(intent.capability, "memo.update");
  assert.deepEqual((intent as { set: unknown }).set, { interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-10", precision: "day" } });
  const op = run.frozen[0].preview.operations[0] as unknown as { preview: string; display?: { rows: { label: string; after: string }[] } };
  assert.match(op.preview, /在笔记「11 月 10 日笔记」上补记往来：实际往来对象 小林健，11月10日（周二），对方来电（陈一鸣只是提到）/u);
  assert.ok(op.display!.rows.some((row) => row.after === "「11 月 10 日小林给我打电话，说小陈在审核。」"), "the supporting sentence on the card");
  assert.equal(run.judgeCalls.length, 1, "one review request for the memo");
  assert.ok(Object.keys(run.judgeCalls[0].body.questions).every((id) => id.startsWith("interaction_happened")));
});

test("stability run: the first layer left the write capability out ('更新…往来', deliverable change) — the user's words still make the card", async () => {
  const message = "用 @11 月 10 日笔记 更新我和小林的往来。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read", "contact.read", "fn.extractInteractions"], sourceQuote: message }], {
    extract: { interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] },
    judge: () => noul(0.95),
    references: [M32],
  });
  assert.equal(cards(run), 1);
  assert.equal(run.frozen[0].intents[0].capability, "memo.update");
  // Only reading ("里面有哪些往来") never writes.
  const read = await runFn("@11 月 10 日笔记 里有哪些往来？", [{ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.extractInteractions"], sourceQuote: "@11 月 10 日笔记 里有哪些往来？" }], {
    extract: { interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] },
    judge: () => noul(0.95),
    references: [M32],
  });
  assert.equal(cards(read), 0);
});

test("gate run 1 (AE-XL-007): dictating a new memo ('再记一次：小林今天来过电话') after a note was talked about is not an extraction from that note", async () => {
  const world = fnWorld();
  const session = graphKit(fetch, { now: NOW, records: recordAccessOf(world) });
  await session.sessionState.put("actor:a", { lastMentioned: [{ at: NOW, id: "note:m32", name: "11 月 10 日笔记", type: "memo" }], openItems: [], sessionId: "session:a", shownList: null, updatedAt: NOW });
  const message = "刚才那条来电记录没存上，再记一次：小林今天来过电话。";
  const run = await runFn(message, [{ deliverable: "change", objectClues: [{ entity: "memo", text: "那条来电记录" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: message }], { session, world });
  assert.ok(!run.events.some((event) => event.type === "fn.extractInteractions" || event.type === "fn.extractFollowUps"), "not an extraction");
  assert.ok(!run.modelCalls.some((call) => call.node === "functions"));
});

test("a review that is not sure (it does not answer in time): the interaction is only listed, as doubtful — no card", async () => {
  const message = "用 @11 月 10 日笔记 更新我和小林的往来。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read", "fn.extractInteractions", "memo.create"], sourceQuote: message }], {
    extract: { interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] },
    judgeOptions: { hang: true },
    references: [M32],
  });
  assert.equal(cards(run), 0);
  assert.match(run.result.text, /存疑：复核没有把握这是你本人已经发生的往来，所以只列出来/u);
});

test("memo.update's executor writes the interaction at the card's version; a memo changed since is a permanent failure", async () => {
  const calls: unknown[] = [];
  const ok = await applyApprovedMemoUpdate({ actorId: "actor:a", notes: { update: async (input) => { calls.push(input); return { id: input.noteId } as never; } } }, { expectedVersion: 1, interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-10", precision: "day" }, noteId: "note:m32" }, { idempotencyKey: "k1", now: "2026-11-15T01:00:00.000Z" });
  assert.equal(ok.resultRef, "notes:note:m32");
  assert.deepEqual(calls, [{ actorId: "actor:a", expectedVersion: 1, idempotencyKey: "k1", interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-10", precision: "day" }, noteId: "note:m32", now: "2026-11-15T01:00:00.000Z" }]);
  await assert.rejects(applyApprovedMemoUpdate({ actorId: "actor:a", notes: { update: async () => { throw new NoteServiceError("NOTE_VERSION_CONFLICT", "changed"); } } }, { expectedVersion: 1, interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-10", precision: "day" }, noteId: "note:m32" }, { idempotencyKey: "k2", now: "2026-11-15T01:00:00.000Z" }), AgentExecutionPermanentError);
});
