/**
 * agent-design AG02-4 through the ledger routes: a card past its 7-day expiry, a rejected and a
 * canceled card are refused at the click (CARD_EXPIRED / CARD_CLOSED) with zero business writes and
 * zero outbox events; regenerating an expired card gives revision 2, back in awaiting_confirmation;
 * the single-card GET returns the current revision and hash; the old body shape cannot decide a card
 * that has an origin.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { GET as readCardRoute } from "../../app/api/agent/ledger/[id]/route";
import { POST as regenerateRoute } from "../../app/api/agent/ledger/[id]/regenerate/route";
import { POST as transitionRoute } from "../../app/api/agent/ledger/[id]/transition/route";
import { handleCardDecision, handleCardRegenerate } from "../../features/agent/ledger/card-routes";
import { resetSharedMockAgentLedgerServiceForTests } from "../../features/agent/ledger/mock-runtime-service";
import { AGENT_CARD_TTL_MS } from "../../features/agent/runtime/decision";
import { createOrbitAgentRuntimeService, resetOrbitAgentRuntimeServicesForTests } from "../../features/agent/runtime/service-factory";
import { createCardKit, freeze } from "../services/agent-ledger-card-kit";

test.beforeEach(() => {
  resetSharedMockAgentLedgerServiceForTests();
  resetOrbitAgentRuntimeServicesForTests();
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });

async function mockCard(createdAt = new Date().toISOString()) {
  const runtime = createOrbitAgentRuntimeService("mock");
  const actionId = `action:route-test:${Math.random().toString(36).slice(2)}`;
  const frozen = await runtime.freezeCard!({ actionId, createdAt, intents: [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "续签办公室租约" } }], locale: "zh", origin: { conversationId: "session:route", kind: "conversation", requestId: `request:${actionId}` } });
  return { action: frozen.action!, runtime };
}

async function cardOf(id: string) {
  const response = await readCardRoute(new Request(`http://localhost/api/agent/ledger/${id}`), context(id));
  assert.equal(response.status, 200);
  return (await response.json()).data.card;
}

test("GET /api/agent/ledger/[id] returns the card's current revision, hash and items", async () => {
  const { action } = await mockCard();
  const card = await cardOf(action.actionId);
  assert.equal(card.revision, 1);
  assert.equal(card.payloadHash, action.payloadHash);
  assert.match(card.payloadHash, /^sha256:/u);
  assert.equal(card.status, "awaiting_confirmation");
  assert.equal(card.operations[0].capability, "todo.create");
  assert.match(card.operations[0].text, /续签办公室租约.*11月30日（周一）/u);
  const missing = await readCardRoute(new Request("http://localhost/api/agent/ledger/nope"), context("nope"));
  assert.equal(missing.status, 404);
});

test("the old body shape is refused for a card with an origin and changes nothing", async () => {
  const { action, runtime } = await mockCard();
  const response = await transitionRoute(post(`/api/agent/ledger/${action.actionId}/transition`, { selectedOperationIds: [action.operations[0].operationId], transition: "confirm" }), context(action.actionId));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.reason, "DECISION_FIELDS_REQUIRED");
  assert.equal((await runtime.getAction(action.actionId))?.status, "awaiting_confirmation");
  assert.equal((await runtime.getRun(action.runId))?.outbox.length, 0);
});

test("a card past 7 days: CARD_EXPIRED, no outbox; regenerating gives revision 2 awaiting confirmation", async () => {
  const createdAt = new Date(Date.now() - AGENT_CARD_TTL_MS - 24 * 60 * 60 * 1000).toISOString();
  const { action, runtime } = await mockCard(createdAt);
  assert.equal((await cardOf(action.actionId)).status, "expired", "expiry is judged when the card is read");
  const response = await transitionRoute(post(`/api/agent/ledger/${action.actionId}/transition`, { clientDecisionId: "decision:expired", payloadHash: action.payloadHash, revision: 1, transition: "confirm" }), context(action.actionId));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "CONFLICT");
  assert.equal(body.error.reason, "CARD_EXPIRED");
  assert.equal(body.data.card.status, "expired");
  assert.match(body.error.message, /放太久/u);
  assert.equal((await runtime.getRun(action.runId))?.outbox.length, 0);
  assert.equal((await runtime.getAction(action.actionId))?.status, "expired");

  const regenerated = await regenerateRoute(post(`/api/agent/ledger/${action.actionId}/regenerate`, {}), context(action.actionId));
  assert.equal(regenerated.status, 200);
  const card = (await regenerated.json()).data.card;
  assert.equal(card.revision, 2);
  assert.equal(card.status, "awaiting_confirmation");
  assert.ok(Date.parse(card.expiresAt) > Date.now(), "a fresh expiry");
  assert.equal(card.operations[0].after.title, "续签办公室租约", "the same intent");
  assert.equal((await runtime.getRun(action.runId))?.outbox.length, 0, "regenerating is not a decision");
  const stale = await transitionRoute(post(`/api/agent/ledger/${action.actionId}/transition`, { clientDecisionId: "decision:stale", payloadHash: action.payloadHash, revision: 1, transition: "confirm" }), context(action.actionId));
  assert.equal((await stale.json()).error.reason, "CARD_REVISION_CHANGED");
});

test("rejected and canceled cards: CARD_CLOSED, no outbox", async () => {
  const { action, runtime } = await mockCard();
  const reject = await transitionRoute(post(`/api/agent/ledger/${action.actionId}/transition`, { clientDecisionId: "decision:reject", payloadHash: action.payloadHash, revision: 1, transition: "reject" }), context(action.actionId));
  assert.equal(reject.status, 200);
  assert.equal((await reject.json()).data.decision.outcome, "accepted");
  const confirm = await transitionRoute(post(`/api/agent/ledger/${action.actionId}/transition`, { clientDecisionId: "decision:confirm", payloadHash: action.payloadHash, revision: 1, transition: "confirm" }), context(action.actionId));
  assert.equal(confirm.status, 409);
  const body = await confirm.json();
  assert.equal(body.error.reason, "CARD_CLOSED");
  assert.equal(body.data.card.status, "rejected");
  assert.equal((await runtime.getRun(action.runId))?.outbox.length, 0);

  const other = await mockCard();
  await other.runtime.cancelAction(other.action.actionId);
  const canceled = await transitionRoute(post(`/api/agent/ledger/${other.action.actionId}/transition`, { clientDecisionId: "decision:c", payloadHash: other.action.payloadHash, revision: 1, transition: "confirm" }), context(other.action.actionId));
  assert.equal((await canceled.json()).error.reason, "CARD_CLOSED");
  assert.equal((await other.runtime.getAction(other.action.actionId))?.status, "canceled");
  assert.equal((await other.runtime.getRun(other.action.runId))?.outbox.length, 0);
});

test("with a fixed clock past 7 days, expired, rejected and canceled clicks leave the to-dos and the outbox untouched", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("约山本吃饭");
  const expired = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: todo.id }]);
  const rejected = await freeze(kit, [{ capability: "todo.create", set: { title: "見積書のドラフトを見直す" } }], undefined, "ja");
  const canceled = await freeze(kit, [{ capability: "todo.create", set: { title: "续订域名" } }]);
  const before = JSON.stringify(await kit.listTasks());
  await handleCardDecision({ actionId: rejected.actionId, body: { clientDecisionId: "r", payloadHash: rejected.payloadHash, revision: 1, transition: "reject" }, processNow: true, runtime: kit.runtime, workerId: "test" });
  await kit.runtime.cancelAction(canceled.actionId);
  kit.advance(AGENT_CARD_TTL_MS + 60_000);
  const results = [];
  for (const card of [expired, rejected, canceled]) {
    results.push(await handleCardDecision({ actionId: card.actionId, body: { clientDecisionId: `c:${card.actionId}`, payloadHash: card.payloadHash, revision: 1, transition: "confirm" }, now: kit.now, processNow: true, runtime: kit.runtime, workerId: "test" }));
  }
  assert.deepEqual(results.map((result) => [result.status, (result.body.error as { reason: string }).reason]), [[409, "CARD_EXPIRED"], [409, "CARD_CLOSED"], [409, "CARD_CLOSED"]]);
  assert.equal(JSON.stringify(await kit.listTasks()), before);
  for (const card of [expired, rejected, canceled]) assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 0);
  assert.equal(kit.executorCalls.length, 0);
  const regenerated = await handleCardRegenerate({ actionId: expired.actionId, now: kit.now, runtime: kit.runtime });
  assert.equal(regenerated.status, 200);
  const card = (regenerated.body.data as { card: { revision: number; status: string } }).card;
  assert.deepEqual([card.revision, card.status], [2, "awaiting_confirmation"]);
});
