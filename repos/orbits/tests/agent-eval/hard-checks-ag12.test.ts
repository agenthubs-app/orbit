import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG12: the four CON check words (eval/README.md §3.4) — model_input_excludes, card_effects, field_history,
 * import_rows — and the contact field names of the cases (name, org) on cards and stored contacts.
 */

const ids: Record<string, string> = { C30: "contact:c30", C31: "contact:c31", C46: "contact:c46", M40: "note:m40", T45: "task:t45" };
const reverse = new Map(Object.entries(ids).map(([fixture, product]) => [product, fixture]));
const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const run = (name: string, args: unknown, observation: Observation) => CHECKS[name](args, observation, context);

function obs(extra: Partial<Observation> = {}): Observation {
  return {
    account: "A", accounts: { A: "user_a" }, answers: [], businessChanges: [], cards: [], caseId: "AE-CON-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
    fixtureIdOf: (id) => (id ? reverse.get(id) ?? null : null), idMap: ids, reads: [], requests: [], unsupported: [], ...extra,
  };
}

test("the four words are implemented", () => {
  for (const word of ["model_input_excludes", "card_effects", "field_history", "import_rows"]) assert.equal(NOT_YET[word], undefined, word);
});

test("model_input_excludes: every main and judgment request is searched", () => {
  const events = [
    { body: { messages: [{ content: "小林健 北辰软件 销售总监" }] }, seq: 3, type: "model.request" },
    { body: { input: ["王强（远帆物流 · 运营经理）"] }, seq: 5, type: "judgment.request" },
  ];
  assert.equal(run("model_input_excludes", ["kobayashi@hokushin.example.test", "+81-90-0000-0017"], obs({ events: events as never })).status, "pass");
  const leaked = [...events, { body: { messages: [{ content: "email: kobayashi@hokushin.example.test" }] }, seq: 9, type: "model.request" }];
  const result = run("model_input_excludes", ["kobayashi@hokushin.example.test"], obs({ events: leaked as never }));
  assert.equal(result.status, "fail");
  assert.deepEqual(result.evidence, [9]);
});

test("card_effects: the item's effects (product ids) cover the fixtures", () => {
  const card = { cardId: "c1", frozenSeq: 3, kind: "ledger_action" as const, observedBy: [], ops: [{ op: "contact.delete", raw: { effects: ["note:m40", "task:t45"] }, set: {}, target: "C31" }], revisions: 1, state: "awaiting_confirmation" };
  assert.equal(run("card_effects", [{ includes: ["M40", "T45"], op: 1 }], obs({ cards: [card] })).status, "pass");
  assert.equal(run("card_effects", [{ includes: ["M40", "T45"], op: 1 }], obs({ cards: [{ ...card, ops: [{ ...card.ops[0], raw: { effects: ["note:m40"] } }] }] })).status, "fail");
});

test("field_history: the entry in the record's stored history at the end", () => {
  const change = { after: { displayName: "田中浩", fieldHistory: [{ at: "x", field: "role", next: "采购部长", previous: "采购主管", source: "manual" }], role: "采购部长" }, before: {}, collection: "contacts", fields: [], id: "contact:c30", kind: "updated", owner: "user_a", workspace: "w" };
  const o = obs({ diff: { records: [change as never], tables: [] } });
  assert.equal(run("field_history", { field: "role", from: "采购主管", target: "C30", to: "采购部长" }, o).status, "pass");
  assert.equal(run("field_history", { field: "role", from: "采购主管", target: "C30", to: "購買部長" }, o).status, "fail");
  assert.equal(run("field_history", { field: "role", from: "a", target: "C30", to: "b" }, obs()).status, "fail", "no change at all");
});

test("import_rows: the classification of one revision of the last card, exactly; match only for duplicates", () => {
  const frozen = (revision: number, rows: unknown[]) => ({ card: { operations: [{ capability: "contact.import", shown: { rows } }], revision }, cardId: "c1", revision, seq: revision * 10, type: "card.frozen" });
  const events = [
    frozen(1, [{ decision: "duplicate", match: "contact:c46", outcome: "skip", row: 1 }, { decision: "create", outcome: "create", row: 2 }, { decision: "skip", outcome: "skip", reason: "missing_name", row: 3 }, { decision: "create", outcome: "create", row: 4 }]),
    frozen(2, [{ decision: "create", outcome: "create", row: 1 }, { decision: "create", outcome: "create", row: 2 }, { decision: "skip", outcome: "skip", reason: "missing_name", row: 3 }, { decision: "create", outcome: "create", row: 4 }]),
  ];
  const card = { cardId: "c1", frozenSeq: 10, kind: "ledger_action" as const, observedBy: [], ops: [], revisions: 2, state: "awaiting_confirmation" };
  const o = obs({ cards: [card], events: events as never });
  assert.equal(run("import_rows", { revision: 1, rows: [{ decision: "duplicate", match: "C46", row: 1 }, { decision: "create", row: 2 }, { decision: "skip", row: 3 }, { decision: "create", row: 4 }] }, o).status, "pass");
  assert.equal(run("import_rows", { rows: [{ decision: "create", row: 1 }, { decision: "create", row: 2 }, { decision: "skip", row: 3 }, { decision: "create", row: 4 }] }, o).status, "pass", "no revision: the last");
  assert.equal(run("import_rows", { revision: 1, rows: [{ decision: "create", row: 1 }, { decision: "create", row: 2 }, { decision: "skip", row: 3 }, { decision: "create", row: 4 }] }, o).status, "fail");
});

test("contact fields as the cases name them: name/org on a card's after and on the stored contact", () => {
  const card = { cardId: "c1", frozenSeq: 3, kind: "ledger_action" as const, observedBy: [], ops: [{ op: "contact.create", raw: {}, set: { displayName: "王强", organization: "远帆物流", role: "仓储主管" }, target: null }], revisions: 1, state: "completed" };
  const set = { name: "王强", org: "远帆物流", role: "仓储主管" };
  assert.equal(run("card_ops", [{ op: "contact.create", set }], obs({ cards: [card] })).status, "pass");
  const stored = obs({ businessChanges: [{ after: { displayName: "王强", organization: "远帆物流", primaryEmail: undefined, role: "仓储主管", version: 1 }, collection: "contacts", external: false, fields: [], fixtureId: null, id: "contact:new", kind: "created" }] as never, cards: [card] });
  assert.equal(run("writes_exact", "same_as_card", stored).status, "pass");
});

test("no_write_before_click: an import card covers the contacts it creates; another device's write (device other) is not the system's first write", () => {
  const card = { cardId: "c1", frozenSeq: 3, kind: "ledger_action" as const, observedBy: [], ops: [{ op: "contact.import", raw: {}, set: {}, target: null }], revisions: 2, state: "completed" };
  const created = { after: { displayName: "森田葵" }, collection: "contacts", external: false, fields: [], fixtureId: null, id: "contact:import:1", kind: "created" };
  const events = [{ params: ["w", "contacts", "contact:import:1"], seq: 50, tables: ["orbit_records"], type: "db.write" }];
  const decisions = [{ accepted: true, cardId: "c1", decision: "confirm", reason: null, seq: 40, status: 200, via: "click" as const }];
  assert.equal(run("no_write_before_click", true, obs({ businessChanges: [created] as never, cards: [card], decisions, events: events as never })).status, "pass");
  const restore = { ...card, ops: [{ op: "contact.restore", raw: {}, set: {}, target: "C31" }] };
  const restored = { after: { displayName: "李薇" }, collection: "contacts", external: false, fields: [], fixtureId: "C31", id: "contact:c31", kind: "updated" };
  const writes = [{ device: "other", params: ["w", "contacts", "contact:c31"], seq: 10, tables: ["orbit_records"], type: "db.write" }, { params: ["w", "contacts", "contact:c31"], seq: 50, tables: ["orbit_records"], type: "db.write" }];
  assert.equal(run("no_write_before_click", true, obs({ businessChanges: [restored] as never, cards: [restore], decisions, events: writes as never })).status, "pass");
  assert.equal(run("no_write_before_click", true, obs({ businessChanges: [restored] as never, cards: [restore], decisions, events: [{ ...writes[1], seq: 30 }] as never })).status, "fail", "a write of the system before the click");
});
