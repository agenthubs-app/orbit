import assert from "node:assert/strict";
import test from "node:test";

import { importTableOf, previewImport, withHeader } from "../../features/agent-v1/domains/contact/import-preview";
import { boundContactReader } from "../../features/agent-v1/domains/contact/types";
import { reviseImportByWords } from "../../features/agent-v1/entry/import-revision";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { endsInActionVerb, needsIntentReview, readsAsWriteRequest } from "../../features/agent-v1/judgment/intent-review";
import { resolveEventIntent } from "../../features/agent-v1/propose/events-resolve";
import type { ResolveContext } from "../../features/agent-v1/propose/resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { contactWorld, memoryContactAccess } from "./contact-kit";
import { recordAccessOf } from "./graph-kit";
import { contact, memo } from "./read-kit";

/**
 * agent-design AG21b (independent suite, final run: R27–R43, writes and memory). This line's own sentences, not the suite's.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-20T01:00:00.000Z";

function withShinan() {
  return contactWorld((records) => {
    records.push(contact(ACTOR, "contact:sn", "石楠", { organization: "白鹭印务", primaryEmail: "shinan@example.test", role: "印务主管" }));
  });
}

const NUMBERED = "帮我导入这几位：\n1. 石楠，白鹭印务，shinan@example.test\n2. （名字忘了），柏舟设计，010-0000-0000\n3. 季朗，柏舟设计，项目经理";

test("R27 a numbered list with no header: markers off, each cell typed by its own shape, a placeholder name is no name", async () => {
  const table = importTableOf(NUMBERED)!;
  const existing = await memoryContactAccess(withShinan()).listActive(ACTOR);
  const preview = previewImport(table, existing, ACTOR);
  assert.deepEqual(preview.rows.map((row) => [row.row, row.name, row.organization, row.role, row.decision, row.reason ?? null]), [
    [1, "石楠", "白鹭印务", "", "duplicate", null],
    [2, "", "柏舟设计", "", "skip", "missing_name"],
    [3, "季朗", "柏舟设计", "项目经理", "create", null],
  ]);
  assert.equal(preview.rows[0].match?.id, "contact:sn", "the row whose e-mail and name match the existing contact");
  // Other markers and shapes; a column that mixes e-mails, phones and titles is typed per cell.
  const mixed = previewImport(withHeader("- 林小雨,青柠童书,lin@example.test\n2) 森田葵,东和商事,+81 90 1234 5678\n・王强,远帆物流,运营经理\n?,无名公司,实习生"), [], ACTOR);
  assert.deepEqual(mixed.rows.map((row) => [row.name, row.organization, row.role, row.reason ?? null]), [["林小雨", "青柠童书", "", null], ["森田葵", "东和商事", "", null], ["王强", "远帆物流", "运营经理", null], ["", "无名公司", "实习生", "missing_name"]]);
  assert.equal(withHeader(withHeader(table)), withHeader(table), "the header code writes is read back as a header");
});

function ledgerOver(world: ReturnType<typeof contactWorld>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  return createAgentRuntimeService({ cardReader: { read: async () => null, contacts: boundContactReader(memoryContactAccess(world), ACTOR) }, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
}

test("R27 a revision that sets a row to the decision it already has says so and leaves the card as it is", async () => {
  const world = withShinan();
  const runtime = ledgerOver(world);
  await runtime.freezeCard!({ actionId: "card:imp", intents: [{ capability: "contact.import", overrides: {}, text: importTableOf(NUMBERED)! }], locale: "zh", origin: { conversationId: "session:a", kind: "conversation", requestId: "req:imp" } });
  const same = await reviseImportByWords({ actorId: ACTOR, message: "第3行也新建", now: () => NOW, runtime, sessionId: "session:a", store: null });
  assert.ok(same);
  assert.match(same!.text, /第3行本来就是新增/u);
  assert.doesNotMatch(same!.text, /改为新建/u);
  assert.equal(same!.actionPreview?.revision, 1, "no new revision");
  const mixed = await reviseImportByWords({ actorId: ACTOR, message: "第1行和第3行都新建", now: () => NOW, runtime, sessionId: "session:a", store: null });
  assert.match(mixed!.text, /第1行改为新建/u);
  assert.match(mixed!.text, /第3行本来就是新增/u);
  assert.equal(mixed!.actionPreview?.revision, 2);
});

// ---------------------------------------------------------------------------------------------------------------------
// R28: an event named for a delete or a change is looked for among the user's private events when no schedule item matches.

const TEA = { accountId: ACTOR, createdAt: "2026-10-01T00:00:00.000Z", id: "private_event:tea", startsAt: "2026-10-18T05:00:00.000Z", title: "校友茶会", updatedAt: "2026-10-01T00:00:00.000Z", version: 2 };

function teaWorld() {
  const records = [memo(ACTOR, "note:tea", "茶会上和石楠聊了印刷排期。", "2026-10-18T09:00:00.000Z", [], { eventRefs: [{ id: "private_event:tea", kind: "private" }], title: "茶会纪要" })];
  const base = recordAccessOf({ events: [], records });
  return {
    ...base,
    attendance: { list: async () => [{ attendedOn: "2026-10-18", eventRef: { id: "private_event:tea", kind: "private" }, id: "attendance:tea", version: 1 }] },
    privateEvents: {
      get: async (_account: string, id: string) => (id === TEA.id ? TEA : null),
      list: async () => [TEA],
      references: async () => [{ id: "attendance:tea", kind: "attendance", label: "2026-10-18", version: "1" }, { id: "note:tea", kind: "memo", label: "茶会纪要", version: "1" }],
    },
  };
}

function eventCtx(message: string): ResolveContext & { deleting?: boolean } {
  return { asOf: NOW, asked: new Map(), context: null, language: "zh", message, nameOf: () => null, people: [], records: teaWorld() as never, scope: { accountId: ACTOR, authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }, timeZone: "Asia/Tokyo" };
}
const span = (message: string, words: string): [number, number] => [message.indexOf(words), message.indexOf(words) + words.length];
const eventPart = (message: string) => ({ localId: "p1", quote: [0, message.length], refs: [] }) as never;

test("R28 a delete tagged as a schedule item finds the user's private event and reaches its delete plan (links listed)", async () => {
  const message = "把上个月的校友茶会删了";
  const ctx = eventCtx(message);
  const intent: StoredIntent = { capability: "schedule.delete", localId: "w1", relations: [], selector: [span(message, "上个月的校友茶会")] };
  const outcome = await resolveEventIntent(ctx, eventPart(message), { intents: [], picks: {} }, intent) as unknown as { kind: string; question?: { type: string; line: string } };
  assert.equal(outcome.kind, "ask", JSON.stringify(outcome));
  assert.equal(outcome.question?.type, "event_plan");
  assert.match(outcome.question!.line, /茶会纪要/u, "the plan lists the linked note");
  assert.doesNotMatch(JSON.stringify(outcome), /日程里没找到/u);
  assert.equal(ctx.deleting, true, "other parts of the message (\"笔记只解除关联\") are made by the plan");
  // With the plan's words in the same message, the card: the «我去过» deleted, the note unlinked, the event last.
  const said = "把上个月的校友茶会删了，参加记录也删掉，笔记只解除关联";
  const ready = await resolveEventIntent(eventCtx(said), eventPart(said), { intents: [], picks: {} }, { capability: "schedule.delete", localId: "w1", relations: [], selector: [span(said, "上个月的校友茶会")] }) as unknown as { kind: string; ops: { capability: string }[] };
  assert.equal(ready.kind, "ready", JSON.stringify(ready));
  assert.deepEqual(ready.ops.map((op) => op.capability), ["attendance.delete", "memo.update", "privateEvent.delete"]);
});

test("R28 a change tagged as a schedule item goes to the private event; a note unlink outside a plan is the unlink", async () => {
  const message = "把校友茶会改到11月22日下午三点";
  const moved = await resolveEventIntent(eventCtx(message), eventPart(message), { intents: [], picks: {} }, { capability: "schedule.update", localId: "w1", relations: [], selector: [span(message, "校友茶会")] }) as unknown as { kind: string; ops: { capability: string; targetId: string }[] };
  assert.equal(moved.kind, "ready", JSON.stringify(moved));
  assert.deepEqual([moved.ops[0].capability, moved.ops[0].targetId], ["privateEvent.update", TEA.id]);
  const unlinkSaid = "把茶会纪要和校友茶会的关联解除";
  const unlink = await resolveEventIntent(eventCtx(unlinkSaid), eventPart(unlinkSaid), { intents: [], picks: {} }, { capability: "memo.update", events: [span(unlinkSaid, "校友茶会")], localId: "w2", relations: [], selector: [span(unlinkSaid, "茶会纪要")] }) as unknown as { kind: string; ops: { capability: string; targetId: string; set: { eventRefs: unknown[] } }[] };
  assert.equal(unlink.kind, "ready", JSON.stringify(unlink));
  assert.deepEqual([unlink.ops[0].capability, unlink.ops[0].targetId, unlink.ops[0].set.eventRefs], ["memo.update", "note:tea", []]);
});

// ---------------------------------------------------------------------------------------------------------------------
// R29: a clause ending in a bare action verb, next to a write or continuing one, is an instruction without review.

test("R29 '那条也删' / '备注也改' with another write in the message or right after one is not reviewed; alone or as a report it is", () => {
  const base = { capabilities: ["todo.delete"] as never, clarity: "clear" as const, hypothesis: false, intentBasis: "instruction" as const, negation: false };
  const asks = (quote: string, withWrite: boolean) => needsIntentReview({ ...base, quote, withWrite });
  assert.equal(asks("寄样书那条也删", true), false);
  assert.equal(asks("和石楠的那两条一起删", true), false);
  assert.equal(asks("备注也改", true), false);
  assert.equal(asks("それも消して", true), false);
  assert.equal(asks("that one too, delete it", true), false);
  // Without a write around it, the bare verb is still reviewed (as before); a report or a question always is.
  assert.equal(asks("寄样书那条也删", false), true);
  assert.equal(asks("我昨天已经删了", true), true);
  assert.equal(asks("那条也删吗？", true), true);
  assert.equal(endsInActionVerb("季朗的报价也挪一下"), true);
  assert.equal(endsInActionVerb("今天和季朗聊了报价"), false);
  assert.equal(readsAsWriteRequest("把给石楠寄样书的待办删掉"), true);
  assert.equal(readsAsWriteRequest("石楠下周来东京吗？"), false);
});
