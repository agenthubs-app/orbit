import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG10 (CHANGES.md 2026-11-18): functions_called counts the product's fn.* events; listed reads the list a
 * function delivered (fn.rank) in the request of the last answer, else the answer's citations; null in an expected set
 * means "no value"; relatedContactIds matches a to-do's single relatedContactId.
 */

const ids: Record<string, string> = { C46: "contact:c46", E101: "event:e101", E102: "event:e102", E105: "event:e105", M36: "note:m36" };
const reverse = new Map(Object.entries(ids).map(([fixture, product]) => [product, fixture]));
const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const run = (name: string, args: unknown, observation: Observation) => CHECKS[name](args, observation, context);

function obs(extra: Partial<Observation> = {}): Observation {
  return {
    account: "A", accounts: { A: "user_a" }, answers: [], businessChanges: [], cards: [], caseId: "AE-T-010", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
    fixtureIdOf: (id) => (id ? reverse.get(id) ?? null : null), idMap: ids, reads: [], requests: [], unsupported: [], ...extra,
  };
}

test("functions_called: exactly the fn.* events the product traced; none traced is the empty list", () => {
  assert.equal(NOT_YET.functions_called, undefined);
  const traced = obs({ events: [{ seq: 4, type: "fn.rank" }, { seq: 9, type: "fn.rank" }, { seq: 2, type: "judgment.decided" }] as never });
  assert.equal(run("functions_called", ["fn.rank"], traced).status, "pass");
  assert.equal(run("functions_called", ["fn.rank", "fn.extractFollowUps"], traced).status, "fail");
  assert.equal(run("functions_called", [], obs()).status, "pass");
  assert.equal(run("functions_called", [], traced).status, "fail");
});

test("listed: the function's list of the last answer's request (not the basis memo it cites); without one, the citations", () => {
  const answer = { citations: ["E101", "M36", "E102", "E105"], seq: 30, text: "先看是不是周末上午…" };
  const entry = { acks: [], clients: {}, requests: [{ document: { answer: { text: answer.text } }, requestId: "agreq_1" }] } as never;
  const withList = obs({ answers: [answer], entry, events: [{ listed: ["event:event:e102", "event:event:e101", "event:event:e105"], requestId: "agreq_1", seq: 20, type: "fn.rank" }] as never });
  assert.equal(run("listed", { count: 3, includes: ["E101", "E102", "E105"] }, withList).status, "pass");
  assert.equal(run("listed", { exact: ["E102", "E101", "E105"] }, withList).status, "pass");
  const without = obs({ answers: [answer], entry });
  assert.equal(run("listed", { count: 3 }, without).status, "fail", "the citations include M36");
});

test("duplicate_effects: two different to-dos from one card are not duplicates (their titles are inside the stored task)", () => {
  const change = (title: string) => ({ after: { task: { title } }, collection: "tasks", external: false, fields: [], fixtureId: null, id: `task:${title}`, kind: "created" });
  assert.equal(run("duplicate_effects", 0, obs({ businessChanges: [change("把合同草稿发给王强"), change("补齐发票")] as never })).status, "pass");
  assert.equal(run("duplicate_effects", 0, obs({ businessChanges: [change("补齐发票"), change("补齐发票")] as never })).status, "fail");
});

test("card values: null matches a field left out; relatedContactIds matches the single relatedContactId", () => {
  const card = { cardId: "c1", frozenSeq: 3, kind: "ledger_action" as const, observedBy: [], ops: [{ op: "todo.create", raw: {}, set: { dueAt: "2026-11-25T14:59:00.000Z", relatedContactIds: ["contact:c46"], title: "补齐发票" }, target: null }], revisions: 1, state: "succeeded" };
  const o = obs({ cards: [card] });
  assert.equal(run("card_ops", [{ op: "todo.create", set: { dueAt: "2026-11-25", plannedDate: null, relatedContactIds: ["C46"] } }], o).status, "pass");
  const stored = obs({ businessChanges: [{ after: { task: { dueAt: "2026-11-25T14:59:00.000Z", relatedContactId: "contact:c46", title: "补齐发票" } }, collection: "tasks", external: false, fields: [], fixtureId: null, id: "task:new", kind: "created" }] as never, cards: [{ ...card, ops: [{ ...card.ops[0], set: { ...card.ops[0].set, plannedDate: null } }] }] });
  assert.equal(run("writes_exact", "same_as_card", stored).status, "pass");
});
