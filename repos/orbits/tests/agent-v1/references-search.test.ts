import assert from "node:assert/strict";
import test from "node:test";

import { checkReferences, searchReferences } from "../../features/agent-v1/references/search";
import { agentReferenceSearchResultSchema } from "../../shared/api-schema/agent-v1";
import { recordAccessOf } from "./graph-kit";
import { A, B, contact, memo, schedule, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG11-1 (设计稿 §3.6, §10「@ 选择器」; 视觉稿 D3、D4): the picker finds the account's own records of six kinds by
 * name — contacts, memos, to-dos, schedule items, events (platform and the account's own private ones) and «我去过». Each
 * kind has hits; another account's records never come back; two records with the same name come with what tells them
 * apart (company and role for people, people and date for memos).
 */

function world() {
  const base = smallWorld();
  base.records.push(
    contact(A, "contact:c46", "王强", { headline: "运营经理", company: "青松物流" }),
    contact(A, "contact:c47", "王强", { headline: "运营", company: "启航软件" }),
    memo(A, "note:m61", "王强说他们最在意售后响应速度。", "2026-11-13T08:00:00.000Z", ["contact:c46"], { title: "客户访谈" }),
    todo(A, "task:t44", "回复田中的询价", { dueAt: "2026-11-17T09:00:00.000Z" }),
    schedule(A, "personal:s11", "和田中午餐", "2026-11-19T03:00:00.000Z"),
    contact(B, "contact:cb2", "王强", { company: "乙方" }),
    memo(B, "note:mb2", "乙的客户访谈。", "2026-11-13T01:00:00.000Z", [], { title: "客户访谈" }),
  );
  const records = recordAccessOf(base);
  const privateEvents = [{ accountId: A, id: "private_event:p1", startsAt: "2026-11-08T10:00:00.000Z", title: "大学同学聚会", updatedAt: "2026-11-01T00:00:00.000Z", version: 1 }, { accountId: B, id: "private_event:pb", startsAt: "2026-11-08T10:00:00.000Z", title: "乙的聚会", updatedAt: "2026-11-01T00:00:00.000Z", version: 1 }];
  const notes = [{ accountId: A, attendedOn: "2026-11-08", eventRef: { id: "private_event:p1", kind: "private" }, id: "attendance:a1", version: 1 }, { accountId: B, attendedOn: "2026-11-08", eventRef: { id: "private_event:pb", kind: "private" }, id: "attendance:b1", version: 1 }];
  const access = {
    ...records,
    attendance: { list: async (actorId: string) => notes.filter((note) => note.accountId === actorId) as never },
    eventsByIds: async (ids: readonly string[]) => base.events.filter((event) => ids.includes(event.eventId)),
    privateEvents: { get: async () => null, list: async (actorId: string) => privateEvents.filter((event) => event.accountId === actorId) as never, references: async () => [] },
  };
  return access;
}

const byType = (result: Awaited<ReturnType<typeof searchReferences>>) => Object.fromEntries(result.groups.map((group) => [group.type, group.items]));

test("six kinds, each with hits for its own account; the result has the contract's shape", async () => {
  const access = world();
  const found = byType(await searchReferences(access, A, { query: "" }));
  assert.deepEqual(Object.keys(found), ["contact", "memo", "todo", "schedule", "event", "attendance"]);
  for (const [kind, items] of Object.entries(found)) assert.ok(items.length > 0, `${kind} has hits`);
  assert.equal(agentReferenceSearchResultSchema.safeParse(await searchReferences(access, A, { query: "田中" })).success, true);
  assert.deepEqual(byType(await searchReferences(access, A, { query: "聚会" })).attendance.map((item) => [item.id, item.name, item.detail.date]), [["attendance:a1", "大学同学聚会", "2026-11-08"]]);
  assert.deepEqual(byType(await searchReferences(access, A, { query: "聚会" })).event.map((item) => [item.id, item.eventKind]), [["private_event:p1", "private"]]);
  assert.deepEqual(byType(await searchReferences(access, A, { query: "研讨会" })).event.map((item) => [item.id, item.eventKind]), [["event:e103", "platform"]]);
  assert.deepEqual(byType(await searchReferences(access, A, { query: "午餐" })).schedule.map((item) => [item.id, item.detail.date]), [["personal:s11", "2026-11-19T03:00:00.000Z"]]);
  assert.deepEqual(byType(await searchReferences(access, A, { query: "询价" })).todo.map((item) => [item.id, item.detail.dateKind]), [["task:t44", "due"]]);
});

test("same names are told apart; another account's records never come back", async () => {
  const access = world();
  const people = byType(await searchReferences(access, A, { kind: "contact", query: "王强" })).contact;
  assert.deepEqual(people.map((item) => [item.id, item.detail.company, item.detail.role]).sort(), [["contact:c46", "青松物流", "运营经理"], ["contact:c47", "启航软件", "运营"]]);
  const memos = byType(await searchReferences(access, A, { kind: "memo", query: "客户访谈" })).memo;
  assert.deepEqual(memos.map((item) => [item.id, item.detail.people ?? [], item.detail.date]).sort(), [["note:m37", ["田中浩"], "2026-11-11T07:00:00.000Z"], ["note:m61", ["王强"], "2026-11-13T08:00:00.000Z"]]);
  const all = JSON.stringify(await searchReferences(access, A, { query: "王强" })) + JSON.stringify(await searchReferences(access, A, { query: "乙" }));
  for (const theirs of ["contact:cb2", "note:mb2", "private_event:pb", "attendance:b1", "乙方", "乙的"]) assert.equal(all.includes(theirs), false, theirs);
  const other = await searchReferences(access, B, { kind: "memo", query: "客户访谈" });
  assert.deepEqual(other.groups[0].items.map((item) => item.id), ["note:mb2"]);
});

test("one kind only with a filter; a kind that fails to read says so instead of 'none'", async () => {
  const access = world();
  const result = await searchReferences(access, A, { kind: "todo", query: "" });
  assert.deepEqual(result.groups.map((group) => group.type), ["todo"]);
  const failing = { ...access, reader: { ...access.reader, async read() { throw new Error("SOURCE_UNAVAILABLE"); } } };
  const broken = await searchReferences(failing, A, { kind: "memo", query: "x" });
  assert.deepEqual(broken.groups, [{ items: [], more: false, type: "memo", unavailable: true }]);
});

test("check: what cannot be opened now is said, with no name", async () => {
  const access = world();
  const checked = await checkReferences(access, A, [{ id: "note:m37", type: "memo" }, { id: "note:mb2", type: "memo" }]);
  assert.deepEqual(checked.references, [{ accessible: true, id: "note:m37", name: "客户访谈", type: "memo" }, { accessible: false, id: "note:mb2", name: null, type: "memo" }]);
});
