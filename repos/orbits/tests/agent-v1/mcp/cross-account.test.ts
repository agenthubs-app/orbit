import assert from "node:assert/strict";
import test from "node:test";

import { handleCardDecision } from "../../../features/agent/ledger/card-routes";
import type { ProposalService } from "../../../features/agent-v1/mcp/confirm-link";
import { proposalResponse } from "../../../features/agent-v1/mcp/views";
import { mcpKit, type McpKit } from "./kit";

/**
 * agent-design AG17 (approved decision D7; coordinator, after the final gate's judges):
 *   - another account opening a real link and anyone opening a mistyped one get the same answer — same status, same
 *     code, same body — after the same reads (one look-up of the id, no card read), so a link cannot be tested;
 *   - another account's session that posts the confirm transition for the card behind a proposal is refused, and
 *     nothing is written.
 */

async function proposed(kit: McpKit) {
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: ["todos:read", "todos:propose"] });
  const answer = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "x-1", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  const proposalId = String(answer.data!.proposal_id);
  const [card] = (await kit.cards.runtime.listActions({})).filter((action) => action.origin?.kind === "connection");
  return { card, proposalId, task };
}

/** The proposal service and B's ledger, counting what each answer reads. */
function counted(kit: McpKit, accountId: string) {
  const reads = { cards: 0, lookups: 0 };
  const proposals: ProposalService = { ...kit.proposals, forAccount: async (input) => { reads.lookups += 1; return kit.proposals.forAccount(input); } };
  const base = kit.runtimeFor(accountId);
  const runtime = { ...base, getAction: async (id: string) => { reads.cards += 1; return base.getAction(id); } } as typeof base;
  return { deps: { now: kit.now, proposals, runtime }, reads };
}

test("D7: another account's view of a real link and a mistyped link are the same answer, after the same reads", async () => {
  const kit = mcpKit();
  const { proposalId } = await proposed(kit);
  const other = counted(kit, kit.B);
  const real = await proposalResponse(other.deps, { accountId: kit.B, proposalId });
  const realReads = { ...other.reads };
  const nobody = counted(kit, kit.B);
  const mistyped = await proposalResponse(nobody.deps, { accountId: kit.B, proposalId: `prop_${"x".repeat(43)}` });
  assert.equal(real.status, 404);
  assert.deepEqual(real, mistyped, "same status, code and body");
  assert.deepEqual(realReads, nobody.reads, "same reads: one look-up, no card");
  assert.deepEqual(realReads, { cards: 0, lookups: 1 });
  const text = JSON.stringify(real.body);
  assert.doesNotMatch(text, /NOT_FOR_THIS_ACCOUNT|belong|another|other account|cannot be opened|Claude|prop_/u, "nothing says the link is real or whose it is");
  // The owner gets the card.
  const owner = await proposalResponse(counted(kit, kit.A).deps, { accountId: kit.A, proposalId });
  assert.equal(owner.status, 200);
});

test("another account posting the confirm transition for the card behind A's proposal is refused; nothing is written", async () => {
  const kit = mcpKit();
  const { card, task } = await proposed(kit);
  const before = (await kit.cards.listTasks()).find((item) => item.id === task.id)?.plannedDate;
  const refused = await handleCardDecision({ actionId: card.actionId, body: { clientDecisionId: "b-1", payloadHash: card.payloadHash, revision: card.revision ?? 1, transition: "confirm" }, processNow: true, runtime: kit.runtimeFor(kit.B), workerId: "test" });
  assert.notEqual(refused.status, 200);
  assert.ok(refused.status === 404 || refused.status === 403, `status ${refused.status}`);
  assert.equal((await kit.cards.runtime.getAction(card.actionId))?.status, "awaiting_confirmation", "A's card is still waiting");
  assert.equal((await kit.cards.listTasks()).find((item) => item.id === task.id)?.plannedDate, before, "the to-do is unchanged");
  assert.equal((await kit.runtimeB.listActions({})).length, 0, "B's ledger holds nothing");
});
