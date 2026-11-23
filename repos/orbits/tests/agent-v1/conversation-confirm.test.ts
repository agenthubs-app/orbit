/**
 * r10 (lab 41c7a53d6, SPEC R34 / R35 / R37): the engine's write confirmations need records the names-only World lacks.
 * The bridge reads them through the bounded conversation read (conversation/world-read.ts confirmNeedsOf, finder/world.ts
 * conversationWorld `confirm`): only for a write part, within the same caps, the account's rows only; the ask / go run
 * at deliver gets them (bridge.ts runAskGo `extend`). Names and records are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAskGo } from "../../features/agent-v1/conversation/bridge";
import { confirmNeedsOf, enrichWorld, READ_CONTACTS, READ_RECORDS } from "../../features/agent-v1/conversation/world-read";
import type { HintPart } from "../../features/agent-v1/conversation/types";
import type { World } from "../../features/agent-v1/finder/types";
import { createWorldLoader } from "../../features/agent-v1/finder/world";
import type { GraphPart } from "../../features/agent-v1/graph/state";
import { recordAccessOf } from "./graph-kit";
import { contact, memo, schedule, todo } from "./read-kit";

const ME = "actor:a";
const NOW = "2026-11-21T14:00:00+09:00";

type Plan = GraphPart["plan"];
const PLAIN: Plan = { clarity: "clear", dataOwner: "self", dataSources: ["orbit_records"], deliverable: "change", hypothesis: false, intentBasis: "instruction", negation: false, persistence: "this_turn", readings: [] } as unknown as Plan;
function partOf(capabilities: string[], refs: { entity: string; recordId?: string | null }[] = [], plan: Partial<Plan> = {}): Pick<GraphPart, "refs" | "capabilities" | "plan"> {
  return { capabilities: capabilities as GraphPart["capabilities"], plan: { ...PLAIN, ...plan } as Plan, refs: refs.map((ref) => ({ entity: ref.entity, quote: null, recordId: ref.recordId ?? null })) };
}

test("the confirm read is asked for by plain write parts only, for their bound targets: a person a record is created for, a contact deleted, a schedule item changed", () => {
  assert.equal(confirmNeedsOf([partOf(["todo.read"]), partOf(["contact.read"], [{ entity: "contact" }])]), null, "reads never");
  assert.deepEqual(confirmNeedsOf([partOf(["todo.create"], [{ entity: "contact", recordId: "contact:wang" }])]), { creates: ["todo"], linkedTo: ["C-contact:wang"], schedules: [] });
  assert.equal(confirmNeedsOf([partOf(["todo.create"])]), null, "a create for no bound person reads nothing (not the newest records of the kind)");
  // R10-NEXT-shadow: parts that only might write (AE-AMB-010, AE-FN-010, AE-UND-010, AE-CTX-005) read nothing
  const wang = [{ entity: "contact", recordId: "contact:wang" }];
  assert.equal(confirmNeedsOf([partOf(["todo.create"], wang, { clarity: "multiple_readings" } as Partial<Plan>)]), null, "several readings");
  assert.equal(confirmNeedsOf([partOf(["memo.create"], wang, { negation: true })]), null, "a negation");
  assert.equal(confirmNeedsOf([partOf(["memo.create"], wang, { clarity: "statement" } as Partial<Plan>)]), null, "a statement");
  assert.equal(confirmNeedsOf([partOf(["todo.create"], wang, { readings: [{ capabilities: ["contact.read"], deliverable: "answer" }] } as Partial<Plan>)]), null, "other readings");
  assert.deepEqual(confirmNeedsOf([partOf(["contact.delete"], [{ entity: "contact", recordId: "contact:wang" }])]), { creates: [], linkedTo: ["C-contact:wang"], schedules: [] });
  assert.equal(confirmNeedsOf([partOf(["contact.delete"], [{ entity: "contact" }])]), null, "a target not bound yet is not read");
  assert.deepEqual(confirmNeedsOf([partOf(["schedule.update"], [{ entity: "schedule", recordId: "sched:weekly" }]), partOf(["memo.create"])]), { creates: [], linkedTo: [], schedules: ["S-sched:weekly"] });
  assert.equal(confirmNeedsOf([partOf(["contact.update"], [{ entity: "contact", recordId: "contact:wang" }])]), null, "an update of a contact confirms nothing");
});

test("the confirm read: the named contact's linked records, the series — within the caps, the account's rows only, no other records, no contact rows", async () => {
  const records = [contact(ME, "contact:wang", "王强"), contact("actor:b", "contact:theirs", "王强")];
  for (let index = 0; index < 40; index += 1) records.push(todo(ME, `task:t${index}`, `待办${index}`, index % 2 ? { status: "completed" } : {}));
  for (let index = 0; index < 12; index += 1) records.push(memo(ME, `note:w${index}`, `和王强通话${index}`, "2026-11-10T00:00:00.000Z", ["contact:wang"]));
  records.push(schedule(ME, "sched:weekly", "团队周会", "2026-11-02T10:00:00+09:00", { recurrence: { frequency: "weekly" } }), todo("actor:b", "task:theirs", "别人的待办"));
  const access = recordAccessOf({ events: [], records });
  const before = access.source.reads.length;
  const loader = createWorldLoader({ now: NOW, records: access, scope: access.scope(ME), timeZone: "Asia/Tokyo" });
  const world = await loader.conversationWorld({ confirm: { creates: ["todo"], linkedTo: ["C-contact:wang"], schedules: ["S-sched:weekly"] }, contacts: [], linkedPeople: 0, maxContacts: READ_CONTACTS, maxRecords: READ_RECORDS });
  const read = access.source.reads.slice(before);
  assert.ok(loader.reads() <= READ_RECORDS, `rows read ${loader.reads()}`);
  assert.equal(world.contacts.length, 0, "no contact rows: the people read is not asked for");
  assert.ok(world.memos.length > 0 && world.memos.every((item) => item.contactIds?.includes("C-contact:wang")), "the deleted contact's linked notes");
  assert.equal(world.schedule.find((item) => item.id === "S-sched:weekly")?.recurrence?.frequency, "weekly", "the series with its rule");
  assert.equal(world.todos.length, 0, "to-dos linked to no one named are not read");
  assert.ok(!read.includes("task:theirs") && !read.includes("contact:theirs"), "nothing of another account");
});

const hint = (quote: string, slots: HintPart["slots"], refs: HintPart["refs"] = []): HintPart[] => [{ clarity: "clear", continues: null, quote, refs, slots }];
const nextOf = (message: string, names: Record<string, { type: string; name: string }>, parts: HintPart[], read: World | null) =>
  runAskGo(null, names, { at: NOW, gone: [], hint: { parts }, message }, false, {}, "Asia/Tokyo", undefined, read ? (world) => enrichWorld(world, read) : undefined).parts.map((item) => item.next);
const emptyRead = (): World => ({ aliases: [], attendance: [], contacts: [], genders: {}, memos: [], now: NOW, platformEvents: [], privateEvents: [], schedule: [], timeZone: "Asia/Tokyo", todos: [] } as World);

test("R34: a to-do that repeats an open one of the same person asks — only with the read records; one more on purpose goes", () => {
  const names = { "C-contact:wang": { name: "王强", type: "contact" } };
  const read = { ...emptyRead(), todos: [{ account: "A", contactIds: ["C-contact:wang"], createdAt: NOW, id: "T-task:call", status: "open", title: "给王强回电话", updatedAt: NOW }] } as World;
  const message = "建个待办：给王强回电话";
  const parts = hint(message, { kind: "todo", people: ["C-contact:wang"], verb: "create" }, [{ id: "C-contact:wang", kind: "contact", said: "王强" }]);
  assert.deepEqual(nextOf(message, names, parts, null), ["go"], "names only: nothing to repeat");
  assert.deepEqual(nextOf(message, names, parts, read), ["ask"], "the open to-do read: a duplicate");
  const again = "再建一条一样的待办：给王强回电话";
  assert.deepEqual(nextOf(again, names, hint(again, { kind: "todo", people: ["C-contact:wang"], verb: "create" }, [{ id: "C-contact:wang", kind: "contact", said: "王强" }]), read), ["go"], "one more of the same on purpose");
});

test("R35: deleting a contact other records still point at asks; with nothing linked it goes", () => {
  const names = { "C-contact:wang": { name: "王强", type: "contact" } };
  const message = "把王强这个联系人删掉";
  const parts = hint(message, { kind: "contact", people: ["C-contact:wang"], verb: "delete" }, [{ id: "C-contact:wang", kind: "contact", said: "王强" }]);
  assert.deepEqual(nextOf(message, names, parts, emptyRead()), ["go"]);
  const read = { ...emptyRead(), memos: [{ account: "A", body: "通话", contactIds: ["C-contact:wang"], id: "M-note:w1", title: "和王强通话", updatedAt: NOW, writtenOn: "2026-11-10" }] } as World;
  assert.deepEqual(nextOf(message, names, parts, read), ["ask"], "a linked note: what happens to it is asked");
});

test("R37: changing a recurring item without saying which occurrence asks; the one named goes", () => {
  const names = { "S-sched:weekly": { name: "团队周会", type: "schedule" } };
  const series = { ...emptyRead(), schedule: [{ account: "A", endsAt: "2026-11-02T11:00:00+09:00", id: "S-sched:weekly", recurrence: { frequency: "weekly" }, startsAt: "2026-11-02T10:00:00+09:00", title: "团队周会" }] } as World;
  const vague = "把团队周会改到下午三点";
  const parts = (message: string) => hint(message, { kind: "schedule", verb: "update" }, [{ id: "S-sched:weekly", kind: "schedule", said: "团队周会" }]);
  assert.deepEqual(nextOf(vague, names, parts(vague), null), ["go"], "names only: not known to repeat");
  assert.deepEqual(nextOf(vague, names, parts(vague), series), ["ask"], "this one or all of them");
  const one = "下周一的团队周会改到下午三点";
  assert.deepEqual(nextOf(one, names, parts(one), series), ["go"], "the occurrence is said");
});

test("the late confirm read at deliver: a write part's person bound after understand gets their linked records, within what the first read left; a person the hint bound, or a read part, gets none", async () => {
  const { conversationLateRead } = await import("../../features/agent-v1/conversation/run");
  const records = [contact(ME, "contact:tanaka", "田中浩"), contact(ME, "contact:li", "李薇")];
  for (let index = 0; index < 8; index += 1) records.push(todo(ME, `task:k${index}`, `回复田中${index}`, { relatedContactId: "contact:tanaka" }));
  records.push(todo(ME, "task:li", "给李薇寄样片", { relatedContactId: "contact:li" }));
  const access = recordAccessOf({ events: [], records });
  const tanaka = [{ entity: "contact", recordId: "contact:tanaka" }];
  const run = (parts: Pick<GraphPart, "refs" | "capabilities" | "plan">[], hintIds: string[], firstRecords: number) => {
    const conversation = { hint: { parts: [{ clarity: "clear", continues: null, quote: "", refs: hintIds.map((id) => ({ id, kind: "contact", said: "x" })), slots: {} }] }, readWorld: null, turn: { at: NOW, gone: [], hint: null, message: "" }, world: firstRecords ? { records: firstRecords } : null } as Record<string, unknown>;
    const scope = { deps: { now: () => NOW, records: access }, input: { actorId: ME }, run: { context: null, conversation } } as never;
    return conversationLateRead(scope, { asOf: NOW, parts, timeZone: "Asia/Tokyo" } as never).then(() => conversation.readWorld as World | null);
  };
  const late = await run([partOf(["todo.create"], tanaka)], [], 0);
  assert.equal(late?.todos.length, 8, "the person's linked to-dos");
  assert.ok(!late!.todos.some((item) => item.title === "给李薇寄样片"), "nobody else's records");
  const capped = (await run([partOf(["todo.create"], tanaka)], [], READ_RECORDS - 3))!;
  assert.ok(capped.todos.length >= 1 && capped.todos.length + capped.memos.length + capped.schedule.length <= 3, "within what the first read left");
  assert.equal(await run([partOf(["todo.create"], tanaka)], [], READ_RECORDS), null, "nothing left: no read");
  assert.equal(await run([partOf(["todo.create"], tanaka)], ["C-contact:tanaka"], 0), null, "bound by the hint: read at understand already");
  assert.equal(await run([partOf(["todo.read"], tanaka)], [], 0), null, "a read part reads nothing");
  assert.equal(await run([partOf(["todo.create"], tanaka, { clarity: "multiple_readings" } as Partial<Plan>)], [], 0), null, "a part that only might write reads nothing");
});
