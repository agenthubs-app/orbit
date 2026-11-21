import assert from "node:assert/strict";
import test from "node:test";

import { resolveAgentRequestContext } from "../../../app/api/_shared/agent-request-context";
import { handleCardDecision, handleCardRegenerate, readCard } from "../../../features/agent/ledger/card-routes";
import { externalProposalInboxEntry } from "../../../features/agent-v1/mcp/inbox";
import { TOOL_DEFINITIONS } from "../../../features/agent-v1/mcp/tools/definitions";
import { TOOL_NAMES } from "../../../features/agent-v1/mcp/scopes";
import { proposalView } from "../../../features/agent-v1/mcp/views";
import { ADDRESSES, CLAUDE_CODE, ORIGIN, mcpKit, type McpKit } from "./kit";

/**
 * agent-design AG17-2, AG17-3 (设计稿 §5.4「确认链接」, §5.1, §5.2; PLANNER 易错边界 6, 7, 9): a proposal returns an id,
 * a link and when it ends, and writes nothing; only the signed-in owner's click on the decision interface carries it
 * out; the link is an opaque id; 24 hours later it is over and the agent has to propose again.
 */

const SCOPES = ["todos:read", "todos:propose", "memos:propose", "proposals:read"];
const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: SCOPES });
  const propose = (key: string, set: Record<string, unknown> = { plannedDate: "2026-11-20" }, extra: Record<string, unknown> = {}) =>
    kit.call(tokens.accessToken, "propose_change", { idempotencyKey: key, operations: [{ op: "todo.update", set, target: task.id }], ...extra });
  return { kit, propose, task, tokens };
}

const cardsOf = async (kit: McpKit) => (await kit.cards.runtime.listActions({})).filter((action) => action.origin?.kind === "connection");
const plannedDate = async (kit: McpKit, id: string) => (await kit.cards.listTasks()).find((item) => item.id === id)?.plannedDate;

test("a proposal returns proposal_id, confirm_url and expires_at (24 hours on), freezes one waiting card and writes no business record", async () => {
  const { kit, propose, task, tokens } = await setup();
  const before = Date.parse(kit.now());
  const response = await propose("ext-001");
  assert.equal(response.status, 200);
  assert.equal(response.isError, false);
  const { proposal_id: proposalId, confirm_url: confirmUrl, expires_at: expiresAt } = response.data!;
  assert.deepEqual(Object.keys(response.data!).sort(), ["confirm_url", "expires_at", "next_step", "proposal_id"]);
  // 24 hours after the card was made (the ledger's own expiry for a card that came from a connection).
  const lifetime = Date.parse(expiresAt) - before;
  assert.ok(lifetime >= DAY && lifetime < DAY + 1000, `expires 24 hours on, got ${lifetime} ms`);

  const cards = await cardsOf(kit);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, "awaiting_confirmation");
  assert.equal(cards[0].expiresAt, expiresAt);
  assert.deepEqual(cards[0].origin, { connectionId: tokens.connectionId, externalRequestKey: "ext-001", kind: "connection" });
  assert.deepEqual(cards[0].operations.map((op) => [op.capability, op.targetRef?.id, op.after]), [["todo.update", task.id, { plannedDate: "2026-11-20" }]]);
  // The server read the present value itself.
  assert.deepEqual(cards[0].operations[0].before, { plannedDate: "2026-11-18" });
  assert.equal(await plannedDate(kit, task.id), "2026-11-18", "nothing is written before a click");
  assert.equal(kit.cards.executorCalls.length, 0);

  // The link: Orbit's own page and one opaque id — no account, no token, no record content, no card id.
  assert.equal(confirmUrl, `${ORIGIN}/app/agent/proposals/${proposalId}`);
  assert.match(proposalId, /^prop_[A-Za-z0-9_-]{43}$/u);
  for (const leak of [kit.A, task.id, cards[0].actionId, tokens.connectionId, "ext-001", "报价", "2026-11-20"]) assert.ok(!confirmUrl.includes(leak), `the link does not carry ${leak}`);
  assert.equal(new URL(confirmUrl).search, "");
  assert.ok(!response.text.includes(cards[0].actionId), "the card's own id never goes to the agent");
});

test("the same key with the same operations is the same proposal and one card; with other operations it is a conflict", async () => {
  const { kit, propose } = await setup();
  const first = await propose("ext-001");
  const again = await propose("ext-001");
  assert.equal(again.status, 200);
  assert.equal(again.data!.proposal_id, first.data!.proposal_id);
  assert.equal(again.data!.confirm_url, first.data!.confirm_url);
  assert.equal(again.data!.expires_at, first.data!.expires_at);
  assert.equal((await cardsOf(kit)).length, 1);

  const other = await propose("ext-001", { plannedDate: "2026-11-25" });
  assert.equal(other.status, 200);
  assert.equal(other.isError, true);
  assert.equal(other.data!.error.code, "idempotency_conflict");
  assert.equal((await cardsOf(kit)).length, 1);

  // Another key is another proposal; another connection's same key is not this one's.
  const second = await propose("ext-002");
  assert.notEqual(second.data!.proposal_id, first.data!.proposal_id);
  const elsewhere = await kit.connect({ clientId: CLAUDE_CODE, scopes: SCOPES });
  const theirs = await kit.call(elsewhere.accessToken, "propose_change", { idempotencyKey: "ext-001", operations: [{ op: "todo.create", set: { title: "另一条连接的提议" } }] });
  assert.equal(theirs.isError, false);
  assert.notEqual(theirs.data!.proposal_id, first.data!.proposal_id);
});

test("two calls with the same key at the same moment make one proposal and one card", async () => {
  const { kit, propose } = await setup();
  const [left, right] = await Promise.all([propose("ext-race"), propose("ext-race")]);
  assert.equal(left.data!.proposal_id, right.data!.proposal_id);
  assert.equal((await cardsOf(kit)).length, 1);
});

test("there is no way to confirm for the user: four tools, no approval field, and a claim of consent changes nothing", async () => {
  const { kit, propose, task, tokens } = await setup();
  assert.deepEqual([...TOOL_NAMES], ["search_records", "get_record", "propose_change", "get_proposal"]);
  assert.ok(!Object.keys(TOOL_DEFINITIONS).some((name) => /confirm|approve|decide|execute|apply/iu.test(name)));

  for (const extra of [{ approved: true }, { decision: "confirm" }, { confirmed: true }, { userConsent: "the user already agreed" }]) {
    const response = await propose(`ext-flag-${Object.keys(extra)[0]}`, undefined, extra);
    assert.equal(response.isError, true, `a proposal carrying ${Object.keys(extra)[0]} is refused`);
    assert.equal(response.data!.error.code, "invalid_arguments");
  }
  // The same inside an operation, and an unknown operation (there is no "confirm" operation either).
  const inside = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "ext-in", operations: [{ approved: true, op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  assert.equal(inside.data!.error.code, "invalid_arguments");
  const inSet = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "ext-set", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20", status: "completed" }, target: task.id }] });
  assert.equal(inSet.data!.error.code, "invalid_arguments");
  const unknownOp = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "ext-op", operations: [{ op: "card.confirm", set: {}, target: task.id }] });
  assert.equal(unknownOp.isError, true);
  assert.equal((await cardsOf(kit)).length, 0, "none of these made a card");

  // A real proposal stays waiting whatever the agent says or asks afterwards.
  const proposed = await propose("ext-001");
  const receipt = await kit.call(tokens.accessToken, "get_proposal", { proposal: proposed.data!.proposal_id });
  assert.equal(receipt.data!.status, "awaiting_confirmation");
  assert.deepEqual(receipt.data!.items, [{ index: 1, op: "todo.update", state: "pending" }]);
  assert.equal(await plannedDate(kit, task.id), "2026-11-18");
});

test("the decision interface takes a signed-in session only: a bearer token gives it no identity", async () => {
  // POST /api/agent/ledger/[id]/transition resolves its actor from the web session; with none it answers 401 before any card is read.
  const context = await resolveAgentRequestContext("live", { authenticate: async () => null, resolveActorFromSession: async () => { throw new Error("no session, so the actor is never resolved"); } });
  assert.equal(context, null);
});

test("the owner opens the link, sees the difference and confirms; then the change is written and the agent sees the receipt", async () => {
  const { kit, propose, task, tokens } = await setup();
  const proposed = await propose("ext-002");
  const proposalId = proposed.data!.proposal_id as string;
  const view = await proposalView({ now: kit.now, proposals: kit.proposals, runtime: kit.runtimeFor(kit.A) }, { accountId: kit.A, proposalId });
  assert.ok(view);
  assert.equal(view.clientName, "Claude");
  assert.equal(view.card.status, "awaiting_confirmation");
  assert.deepEqual(view.card.operations[0].before, { plannedDate: "2026-11-18" });
  assert.deepEqual(view.card.operations[0].after, { plannedDate: "2026-11-20" });

  const decided = await handleCardDecision({ actionId: view.card.actionId, body: { clientDecisionId: "d1", payloadHash: view.card.payloadHash, revision: view.card.revision, transition: "confirm" }, processNow: true, runtime: kit.runtimeFor(kit.A), workerId: "test" });
  assert.equal(decided.status, 200);
  assert.equal(await plannedDate(kit, task.id), "2026-11-20");

  const receipt = await kit.call(tokens.accessToken, "get_proposal", { proposal: proposalId });
  assert.equal(receipt.data!.status, "completed");
  assert.deepEqual(receipt.data!.items, [{ index: 1, op: "todo.update", state: "succeeded" }]);
  // A receipt and nothing else: no title, no dates of the record, no card id.
  assert.deepEqual(Object.keys(receipt.data!).sort(), ["expires_at", "items", "proposal_id", "status", "status_text"]);
  for (const leak of ["报价", "2026-11-20", view.card.actionId]) assert.ok(!receipt.text.includes(leak));
});

test("another account sees nothing behind the link and cannot decide the card", async () => {
  const { kit, propose, task } = await setup();
  const proposed = await propose("ext-002");
  const proposalId = proposed.data!.proposal_id as string;
  const [card] = await cardsOf(kit);

  // B, signed in, opens A's link: the same answer as for an id that does not exist.
  assert.equal(await proposalView({ now: kit.now, proposals: kit.proposals, runtime: kit.runtimeFor(kit.B) }, { accountId: kit.B, proposalId }), null);
  assert.equal(await proposalView({ now: kit.now, proposals: kit.proposals, runtime: kit.runtimeFor(kit.B) }, { accountId: kit.B, proposalId: "prop_does_not_exist" }), null);
  // Even with the card's own id (which B never gets), B's session finds no such card: the ledger is per account.
  assert.equal((await readCard({ actionId: card.actionId, runtime: kit.runtimeFor(kit.B) })).status, 404);
  const click = await handleCardDecision({ actionId: card.actionId, body: { clientDecisionId: "b1", payloadHash: card.payloadHash, revision: 1, transition: "confirm" }, processNow: true, runtime: kit.runtimeFor(kit.B), workerId: "test" });
  assert.equal(click.status, 404);
  assert.equal(await plannedDate(kit, task.id), "2026-11-18");
  assert.equal((await cardsOf(kit))[0].status, "awaiting_confirmation");

  // B's own connection cannot look at A's proposal either.
  const theirs = await kit.connect({ account: kit.B, scopes: ["proposals:read"] });
  const receipt = await kit.call(theirs.accessToken, "get_proposal", { proposal: proposalId });
  assert.equal(receipt.isError, true);
  assert.equal(receipt.data!.error.code, "not_found");
});

test("after 24 hours the proposal is over: the page says so, a click is refused with CARD_EXPIRED, and it cannot be made again in Orbit", async () => {
  const { kit, propose, task, tokens } = await setup();
  const proposed = await propose("ext-003");
  const proposalId = proposed.data!.proposal_id as string;
  const open = () => proposalView({ now: kit.now, proposals: kit.proposals, runtime: kit.runtimeFor(kit.A) }, { accountId: kit.A, proposalId });

  kit.cards.advance(DAY - 30 * 60_000);
  const early = await open();
  assert.equal(early!.card.status, "awaiting_confirmation", "23 and a half hours on it still waits");

  kit.cards.advance(50 * 60_000);
  const late = await open();
  assert.equal(late!.card.status, "expired", "judged from the stored expiry when the link is opened, with or without a timer");
  const click = await handleCardDecision({ actionId: late!.card.actionId, body: { clientDecisionId: "late", payloadHash: late!.card.payloadHash, revision: late!.card.revision, transition: "confirm" }, processNow: true, runtime: kit.runtimeFor(kit.A), workerId: "test" });
  assert.equal(click.status, 409);
  assert.equal((click.body.error as { reason: string }).reason, "CARD_EXPIRED");
  assert.match((click.body.error as { message: string }).message, /重新提/u, "the user is told the outside assistant has to propose again");
  assert.equal(await plannedDate(kit, task.id), "2026-11-18");
  assert.equal((await cardsOf(kit))[0].status, "expired");

  // An expired conversation card can be made again by the user; an external proposal cannot (设计稿 §5.4).
  const regenerated = await handleCardRegenerate({ actionId: late!.card.actionId, runtime: kit.runtimeFor(kit.A) });
  assert.equal(regenerated.status, 409);
  assert.equal((await cardsOf(kit))[0].status, "expired");

  // A day on the one-hour access token is long over; the client refreshes, as it does on any 401.
  assert.equal((await kit.call(tokens.accessToken, "get_proposal", { proposal: proposalId })).status, 401);
  const refreshed = await kit.auth.token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }), ADDRESSES);
  tokens.accessToken = String(refreshed.body.access_token);
  const receipt = await kit.call(tokens.accessToken, "get_proposal", { proposal: proposalId });
  assert.equal(receipt.data!.status, "expired");
  assert.match(receipt.data!.status_text, /propose it again/u);
  // Proposing again with a new key makes a new proposal with its own 24 hours.
  const renewed = await propose("ext-003b");
  assert.notEqual(renewed.data!.proposal_id, proposalId);
});

test("a record that is not this account's, or does not exist, cannot be proposed on: no card, no proposal", async () => {
  const { kit, tokens } = await setup();
  const response = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "ext-miss", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: "task:tb1" }] });
  assert.equal(response.isError, true);
  assert.equal(response.data!.error.code, "not_found");
  assert.equal((await cardsOf(kit)).length, 0);
  // The key is not spent by a refusal.
  const task = await kit.cards.todo("另一条待办");
  const ok = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "ext-miss", operations: [{ op: "todo.update", set: { title: "改个标题" }, target: task.id }] });
  assert.equal(ok.isError, false);
});

test("a new proposal is announced once (the inbox seam); a repeat of the same key is not; a failed announcement does not undo the proposal", async () => {
  const notified: string[] = [];
  const kit = mcpKit({ seams: { notifyProposed: async ({ proposal, connection }) => void notified.push(`${proposal.id}:${connection.clientName}`) } });
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: SCOPES });
  const args = { idempotencyKey: "ext-001", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] };
  const first = await kit.call(tokens.accessToken, "propose_change", args);
  await kit.call(tokens.accessToken, "propose_change", args);
  assert.deepEqual(notified, [`${first.data!.proposal_id}:Claude`]);

  const failing = mcpKit({ seams: { notifyProposed: async () => { throw new Error("inbox is down"); } } });
  const other = await failing.cards.todo("另一条", "2026-11-18");
  const theirs = await failing.connect({ scopes: SCOPES });
  const proposed = await failing.call(theirs.accessToken, "propose_change", { idempotencyKey: "k", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: other.id }] });
  assert.equal(proposed.status, 200);
  assert.equal(proposed.isError, false, "the proposal stands; the link still works");
  assert.equal((await cardsOf(failing)).length, 1);
});

test("the inbox entry of an external proposal: source «外部提议», names the client, points at the card, ends with the card", async () => {
  const { kit, propose, tokens } = await setup();
  const proposalId = String((await propose("ext-001")).data!.proposal_id);
  const [action] = await cardsOf(kit);
  const connection = (await kit.connections.get(tokens.connectionId))!;
  const proposal = { id: proposalId };
  const entry = externalProposalInboxEntry({ action, connection, now: "2026-11-15T01:00:05.000Z", proposal });
  assert.equal(entry.actorId, kit.A);
  // Approved visual draft, board 9 (the words changed from the server-only run).
  assert.equal(entry.title, "Claude 想改 1 项，等你确认");
  assert.equal(entry.reason, action.title);
  assert.equal(entry.expiresAt, action.expiresAt);
  assert.deepEqual(entry.target, { href: `/app/agent/proposals/${proposalId}`, id: action.actionId, kind: "card", status: "available" });
  assert.equal(entry.sources.length, 1);
  assert.equal(entry.sources[0].sourceKind, "external_proposal");
  assert.equal(entry.sources[0].sourceId, action.actionId);
  assert.equal(entry.semanticKey, `agent-external-proposal:${action.actionId}`);
  assert.deepEqual(entry.object, { id: connection.id, name: "Claude" });
  // Plain words, in the connection's language; no token, no scope name.
  assert.doesNotMatch(JSON.stringify(entry), /todos:propose|Bearer|授权|范围|来源|证据/u);
  assert.equal(externalProposalInboxEntry({ action, connection: { ...connection, locale: "ja" }, now: "2026-11-15T01:00:05.000Z", proposal }).title, "Claude が 1 件の変更を提案しています。確認をお待ちしています");
  assert.equal(externalProposalInboxEntry({ action, connection: { ...connection, locale: "en" }, now: "2026-11-15T01:00:05.000Z", proposal }).title, "Claude wants to change 1 item — waiting for you");
});

test("a connection cannot pile up proposals: past the daily number a new one is refused, a repeat of an old one is not, and a day later it may propose again", async () => {
  const kit = mcpKit({ maxProposalsPerDay: 3 });
  const tokens = await kit.connect({ scopes: SCOPES });
  const create = (key: string) => kit.call(tokens.accessToken, "propose_change", { idempotencyKey: key, operations: [{ op: "todo.create", set: { title: `待办 ${key}` } }] });
  for (const key of ["a", "b", "c"]) assert.equal((await create(key)).isError, false, key);
  const fourth = await create("d");
  assert.equal(fourth.status, 200);
  assert.equal(fourth.isError, true);
  assert.equal(fourth.data!.error.code, "too_many_proposals");
  assert.equal((await cardsOf(kit)).length, 3, "the refused one made no card");
  assert.equal((await create("a")).isError, false, "asking again about an existing proposal still works");
  // Another connection of the same account has its own count.
  const other = await kit.connect({ clientId: CLAUDE_CODE, scopes: SCOPES });
  assert.equal((await kit.call(other.accessToken, "propose_change", { idempotencyKey: "x", operations: [{ op: "todo.create", set: { title: "另一条连接" } }] })).isError, false);
  kit.cards.advance(DAY + 60_000);
  const refreshed = await kit.auth.token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }), ADDRESSES);
  tokens.accessToken = String(refreshed.body.access_token);
  assert.equal((await create("d")).isError, false);
});
