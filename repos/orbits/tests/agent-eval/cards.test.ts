import assert from "node:assert/strict";
import test from "node:test";

import { cardOpsOf, decisionRecord, intentsFor, seedSpecFor } from "./lib/cards";
import type { EvalCase } from "./lib/cases";

/** AG02 `--seed-cards`: which card a case seeds, and how its card_ops become operation intents. */

const base = { design: [], invariant: true, locale: "zh", requirement: [], rubric: [], split: "dev", sprint: "AG02", title: "", world: "base-v1" };
const withOps = { ...base, hard: [{ no_business_writes: true }, { card_ops: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: "T42" }] }], id: "AE-BND-005", steps: [{ user: "把给小林发修订报价这条待办改到周五。" }] } as EvalCase;
const withoutOps = { ...base, hard: [{ no_business_writes: true }], id: "AE-BND-001", steps: [{ user: "把给小林发修订报价这条待办改到周五。" }, { user: "确认" }] } as EvalCase;
const unrelated = { ...base, hard: [], id: "AE-BND-008", steps: [{ user: "「見積書のドラフトを見直す」というタスクを追加してください。" }] } as EvalCase;

test("a case seeds its own card_ops", () => {
  assert.deepEqual(seedSpecFor(withOps, [withOps, withoutOps]), { from: "AE-BND-005", ops: cardOpsOf(withOps) });
});

test("a case without card_ops borrows them only from a case with the same first message", () => {
  assert.deepEqual(seedSpecFor(withoutOps, [withOps, withoutOps, unrelated])?.from, "AE-BND-005");
  assert.equal(seedSpecFor(unrelated, [withOps, withoutOps, unrelated]), null, "nothing to seed: the Agent's own card is used");
});

test("card_ops become to-do intents against product ids; other operations are refused", () => {
  assert.deepEqual(intentsFor([{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: "T42" }, { op: "todo.create", set: { plannedDate: "2026-11-30", title: "续订域名" } }], (id) => (id === "T42" ? "task:42" : undefined)), [
    { capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: "task:42" },
    { capability: "todo.create", set: { plannedDate: "2026-11-30", title: "续订域名" } },
  ]);
  assert.throws(() => intentsFor([{ op: "memo.create", set: {} }], () => undefined), /cannot be seeded in AG02/u);
  assert.throws(() => intentsFor([{ op: "todo.update", set: {}, target: "T99" }], () => undefined), /no product record/u);
});

test("the runner's record of a click says what the server said, a resent one included (AG02 BND-003 seq 331/332)", () => {
  const body = { clientDecisionId: "decision:1", payloadHash: "h", revision: 1, transition: "confirm" };
  const first = decisionRecord({ body, cardId: "card-1", client: "web", result: { body: { data: { card: { revision: 1 }, decision: { accepted: true, outcome: "accepted", replayed: false } } }, status: 200 } });
  assert.equal(first.accepted, true);
  assert.equal(first.replayed, false);
  const resent = decisionRecord({ body, cardId: "card-1", client: "web", result: { body: { data: { card: { revision: 1 }, decision: { accepted: true, outcome: "accepted", replayed: true } } }, status: 200 } });
  assert.equal(resent.accepted, true, "the server accepted it (as a replay of the first decision)");
  assert.equal(resent.replayed, true);
  assert.equal(resent.outcome, "accepted");
  const refused = decisionRecord({ body, cardId: "card-1", client: "web", result: { body: { data: { decision: { accepted: false, outcome: "refused", reason: "CARD_CLOSED" } }, error: { reason: "CARD_CLOSED" } }, status: 409 } });
  assert.deepEqual([refused.accepted, refused.replayed, refused.reason], [false, false, "CARD_CLOSED"]);
});
