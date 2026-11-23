import assert from "node:assert/strict";
import test from "node:test";

import { handleCardDecision } from "../../../features/agent/ledger/card-routes";
import { connectionView, proposalView } from "../../../features/agent-v1/mcp/views";
import { ADDRESSES, CLAUDE_CODE, mcpKit, type McpKit } from "./kit";

/**
 * agent-design AG17-5 (设计稿 §5.4「用户怎样管理连接」, §5.2「权限撤回」, 附录 D; PLANNER 易错边界 11): revoking ends the
 * tokens at the next call and voids what nobody confirmed; what was carried out stays.
 */

const SCOPES = ["todos:read", "todos:propose", "proposals:read"];

/** What the settings page's «撤销» does: mark the connection, then void its open proposals. */
async function revoke(kit: McpKit, connectionId: string, accountId = kit.A) {
  const revoked = await kit.connections.revoke({ accountId, connectionId, reason: "user" });
  if (!revoked) return null;
  return { ...(await kit.proposals.voidOpen(revoked.connection)), connection: revoked.connection };
}

const cardsOf = async (kit: McpKit) => (await kit.cards.runtime.listActions({})).filter((action) => action.origin?.kind === "connection");
const confirm = (kit: McpKit, card: { actionId: string; payloadHash?: string; revision?: number }, key: string) =>
  handleCardDecision({ actionId: card.actionId, body: { clientDecisionId: key, payloadHash: card.payloadHash, revision: card.revision ?? 1, transition: "confirm" }, processNow: true, runtime: kit.runtimeFor(kit.A), workerId: "test" });

test("after revoking: the next call is 401, the refresh token is dead, and the unconfirmed proposal is canceled (a click gets CARD_CLOSED)", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: SCOPES });
  const proposed = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "ext-004", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "todos" })).status, 200);

  assert.equal((await revoke(kit, tokens.connectionId))?.voided, 1);

  const after = await kit.call(tokens.accessToken, "search_records", { domain: "todos", query: "小林" });
  assert.equal(after.status, 401);
  assert.ok(after.headers.get("www-authenticate")?.includes("resource_metadata="));
  assert.ok(!after.text.includes("报价"), "the 401 carries no to-do");
  const refreshed = await kit.auth.token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }), ADDRESSES);
  assert.equal(refreshed.body.error, "invalid_grant");
  assert.equal((await kit.connections.get(tokens.connectionId))?.revokedReason, "user", "a refused refresh is not treated as a reuse");

  const [card] = await cardsOf(kit);
  assert.equal(card.status, "canceled");
  // The owner opens the link: the page shows the card as canceled; a click is refused and nothing is written.
  const view = await proposalView({ now: kit.now, proposals: kit.proposals, runtime: kit.runtimeFor(kit.A) }, { accountId: kit.A, proposalId: proposed.data!.proposal_id });
  assert.equal(view!.card.status, "canceled");
  assert.match(view!.notice ?? "", /作废.*撤销/u, "the page says why nothing can be confirmed");
  const click = await confirm(kit, view!.card, "late");
  assert.equal(click.status, 409);
  assert.equal((click.body.error as { reason: string }).reason, "CARD_CLOSED");
  assert.match((click.body.error as { message: string }).message, /作废.*撤销/u);
  assert.equal((await kit.cards.listTasks()).find((item) => item.id === task.id)?.plannedDate, "2026-11-18");
  assert.equal(kit.cards.executorCalls.length, 0);
});

test("what was confirmed and carried out before the revocation stays, with its receipt", async () => {
  const kit = mcpKit();
  const done = await kit.cards.todo("已经确认的那条", "2026-11-18");
  const open = await kit.cards.todo("还没确认的那条", "2026-11-18");
  const tokens = await kit.connect({ scopes: SCOPES });
  await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "p-done", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: done.id }] });
  await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "p-open", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-21" }, target: open.id }] });
  const first = (await cardsOf(kit)).find((card) => card.operations[0].targetRef?.id === done.id)!;
  assert.equal((await confirm(kit, first, "d1")).status, 200);

  assert.equal((await revoke(kit, tokens.connectionId))?.voided, 1, "only the unconfirmed one is voided");
  const cards = await cardsOf(kit);
  assert.equal(cards.find((card) => card.actionId === first.actionId)?.status, "completed");
  assert.equal(cards.find((card) => card.actionId !== first.actionId)?.status, "canceled");
  const tasks = await kit.cards.listTasks();
  assert.equal(tasks.find((item) => item.id === done.id)?.plannedDate, "2026-11-20", "the carried-out change is kept");
  assert.equal(tasks.find((item) => item.id === open.id)?.plannedDate, "2026-11-18");
  const detail = await kit.cards.runtime.getRun(first.runId);
  assert.ok(detail?.receipts.some((receipt) => receipt.status === "completed"), "its receipt is kept");
});

test("revoking is the account's own: another account cannot revoke it, and the list shows only one's own connections", async () => {
  const kit = mcpKit();
  const mine = await kit.connect({ scopes: SCOPES });
  const code = await kit.connect({ clientId: CLAUDE_CODE, scopes: ["todos:read"] });
  const theirs = await kit.connect({ account: kit.B, scopes: ["todos:read"] });

  assert.equal(await revoke(kit, mine.connectionId, kit.B), null);
  assert.equal((await kit.rpc(mine.accessToken, "tools/list")).status, 200);

  const listed = (await kit.connections.list(kit.A)).map(connectionView);
  assert.deepEqual(listed.map((item) => [item.id, item.clientName, item.clientHost]).sort(), [[code.connectionId, "Claude Code", "claude.ai"], [mine.connectionId, "Claude", "claude.ai"]].sort());
  assert.deepEqual(listed.find((item) => item.id === mine.connectionId)?.scopes, ["todos:read", "todos:propose", "proposals:read"]);
  assert.deepEqual((await kit.connections.list(kit.B)).map((item) => item.id), [theirs.connectionId]);

  await revoke(kit, mine.connectionId);
  assert.deepEqual((await kit.connections.list(kit.A)).map((item) => item.id), [code.connectionId], "a revoked connection leaves the list");
  assert.equal((await kit.rpc(code.accessToken, "tools/list")).status, 200, "the other connection of the same account goes on");
  // Revoking twice changes nothing more.
  assert.equal((await kit.connections.revoke({ accountId: kit.A, connectionId: mine.connectionId, reason: "user" }))?.changed, false);
});

test("a proposal that is being made while the connection is revoked leaves no card that can be confirmed", async () => {
  // Order 1: the revocation lands after the card was frozen and before the proposal is recorded (its scan saw nothing).
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: SCOPES });
  const freeze = kit.cards.runtime.freezeCard!.bind(kit.cards.runtime);
  kit.cards.runtime.freezeCard = async (input) => {
    const frozen = await freeze(input);
    await revoke(kit, tokens.connectionId);
    return frozen;
  };
  const during = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "race-1", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  assert.equal(during.status, 401, "the caller learns the connection ended");
  const [card] = await cardsOf(kit);
  assert.equal(card.status, "canceled");
  assert.equal((await confirm(kit, card, "x")).status, 409);

  // Order 2: many proposals and the revocation at once; whatever the interleaving, nothing stays confirmable.
  const kit2 = mcpKit();
  const tokens2 = await kit2.connect({ scopes: SCOPES });
  const tasks = await Promise.all(Array.from({ length: 6 }, (_, index) => kit2.cards.todo(`待办 ${index}`, "2026-11-18")));
  await Promise.all([
    ...tasks.map((item, index) => kit2.call(tokens2.accessToken, "propose_change", { idempotencyKey: `race-${index}`, operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: item.id }] })),
    revoke(kit2, tokens2.connectionId),
  ]);
  for (const action of await cardsOf(kit2)) assert.equal(action.status, "canceled", "every card of the revoked connection is void");
  assert.ok((await kit2.cards.listTasks()).every((item) => item.plannedDate === "2026-11-18"));
});
