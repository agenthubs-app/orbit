import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { handleCardDecision } from "../../../features/agent/ledger/card-routes";
import { addressesFor, CONNECT_PATH, MCP_PATH, mcpAddresses, PROPOSAL_PAGE_PATH } from "../../../features/agent-v1/mcp/auth/config";
import { protectedResourceMetadata } from "../../../features/agent-v1/mcp/auth/server";
import { externalProposalInboxEntry } from "../../../features/agent-v1/mcp/inbox";
import { accountKeyOf, connectionView, consentView } from "../../../features/agent-v1/mcp/views";
import { agentCardView } from "../../../shared/compute/agent-card-view";
import { standardCopyFor } from "../../../app/(app)/app/orbit-2026/copy/standard";
import { ADDRESSES, CLAUDE, CLAUDE_CALLBACK, CLAUDE_CODE, mcpKit, ORIGIN, type McpKit } from "./kit";

/**
 * agent-design AG17 (approved visual draft, boards 3, 7, 8, 9; the four server changes the draft needs):
 *   1. one connection per client per account — a second authorisation by the same client changes it in place, and
 *      may lower a level as well as raise one;
 *   2. the consent view carries what the connection may do now, so the page marks only what is new;
 *   3. the connection list says how many proposals of each connection are waiting;
 *   4. the short address: the endpoint is `/connect`, and tokens are bound to it.
 */

const DAY = 24 * 60 * 60 * 1000;
const verifier = () => randomBytes(32).toString("base64url");

/** The first half of the flow: the client asks, the page reads the request (signed in as `account`). */
async function ask(kit: McpKit, scope: string, clientId = CLAUDE) {
  const secret = verifier();
  const redirectUri = clientId === CLAUDE_CODE ? "http://127.0.0.1:53111/callback" : CLAUDE_CALLBACK;
  const outcome = await kit.auth.authorize(kit.authorizeParams({ challenge: kit.s256(secret), clientId, redirectUri, scope }), ADDRESSES);
  if (outcome.kind !== "consent") throw new Error(JSON.stringify(outcome));
  return { outcome, redirectUri, secret };
}

async function agree(kit: McpKit, asked: Awaited<ReturnType<typeof ask>>, scopes: string[], clientId = CLAUDE) {
  const decided = await kit.auth.decide({ account: { accountId: kit.A, userId: `auth:${kit.A}` }, decision: "allow", scopes, ticket: asked.outcome.ticket }, ADDRESSES);
  if (decided.ok === false) throw new Error(decided.reason);
  const code = new URL(decided.redirectTo).searchParams.get("code")!;
  const token = await kit.auth.token(new URLSearchParams({ client_id: clientId, code, code_verifier: asked.secret, grant_type: "authorization_code", redirect_uri: asked.redirectUri, resource: ADDRESSES.resource }), ADDRESSES);
  assert.equal(token.status, 200, JSON.stringify(token.body));
  const accessToken = String(token.body.access_token);
  return { accessToken, connectionId: JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")).sub as string };
}

const toolNames = async (kit: McpKit, token: string) => ((await kit.rpc(token, "tools/list")).body?.result?.tools as { name: string }[]).map((tool) => tool.name).sort();

test("the same client authorised again changes its one connection in place: more, and less, in the same step", async () => {
  const kit = mcpKit();
  const first = await kit.connect({ scopes: ["todos:read", "memos:read"] });
  assert.deepEqual(await toolNames(kit, first.accessToken), ["get_record", "search_records"]);

  // Board 3: Claude asks for more — the to-dos it may now propose; the user also turns notes off in the same step.
  const asked = await ask(kit, "todos:read memos:read proposals:read");
  const second = await agree(kit, asked, ["todos:read", "todos:propose", "proposals:read"]);
  assert.equal(second.connectionId, first.connectionId, "no second connection");
  const listed = await kit.connections.list(kit.A);
  assert.equal(listed.length, 1);
  assert.deepEqual([...listed[0].scopes].sort(), ["proposals:read", "todos:propose", "todos:read"]);
  assert.equal(listed[0].createdAt, (await kit.connections.get(first.connectionId))!.createdAt, "connected since the first time");

  // What the connection may do is read on every call: the token issued before the change sees the change too.
  assert.deepEqual(await toolNames(kit, first.accessToken), ["get_proposal", "get_record", "propose_change", "search_records"]);
  const notes = await kit.call(second.accessToken, "search_records", { domain: "memos" });
  assert.equal(notes.status, 403, "notes were turned off in the same step");

  // Lowering only: propose → read.
  const third = await agree(kit, await ask(kit, "todos:read"), ["todos:read"]);
  assert.equal(third.connectionId, first.connectionId);
  assert.deepEqual(await toolNames(kit, third.accessToken), ["get_record", "search_records"]);
  assert.equal((await kit.call(third.accessToken, "propose_change", { idempotencyKey: "k", operations: [{ op: "todo.create", set: { title: "x" } }] })).status, 403);
});

test("another client has its own connection; after a disconnect the same client gets a new one", async () => {
  const kit = mcpKit();
  const claude = await kit.connect({ scopes: ["todos:read"] });
  const code = await kit.connect({ clientId: CLAUDE_CODE, scopes: ["todos:read"] });
  assert.notEqual(code.connectionId, claude.connectionId);
  // Another account's connection of the same client is never the one changed.
  const theirs = await kit.connect({ account: kit.B, scopes: ["todos:read"] });
  assert.notEqual(theirs.connectionId, claude.connectionId);
  await kit.connections.revoke({ accountId: kit.A, connectionId: claude.connectionId, reason: "user" });
  const again = await kit.connect({ scopes: ["todos:read"] });
  assert.notEqual(again.connectionId, claude.connectionId, "a disconnected connection stays disconnected");
  assert.equal((await kit.rpc(claude.accessToken, "tools/list")).status, 401);
  assert.equal((await kit.connections.list(kit.A)).length, 2);
});

test("the consent view: who is signed in, what the connection may do now, and what is pre-set (reading only, never «可以提修改»)", async () => {
  const kit = mcpKit();
  const account = { email: "a@example.test", id: kit.A, name: "测试用户L" };
  const fresh = await ask(kit, "contacts:read todos:read memos:read proposals:read");
  const firstView = consentView(fresh.outcome.request, { account, current: null });
  assert.equal(firstView.current, null);
  assert.deepEqual([...firstView.preselectedScopes].sort(), ["contacts:read", "memos:read", "proposals:read", "todos:read"]);
  assert.deepEqual(firstView.account, { email: "a@example.test", key: accountKeyOf(kit.A), name: "测试用户L" });
  assert.notEqual(firstView.account.key, kit.A, "the page gets a key, not the account id");

  await kit.connect({ scopes: ["contacts:read", "todos:read", "todos:propose", "memos:read", "proposals:read"] });
  const current = await kit.connections.findActive(kit.A, CLAUDE);
  const more = await ask(kit, "contacts:read todos:read memos:read schedule:read proposals:read todos:propose memos:propose");
  const view = consentView(more.outcome.request, { account, current });
  assert.ok(view.current);
  assert.deepEqual([...view.current.scopes].sort(), ["contacts:read", "memos:read", "proposals:read", "todos:propose", "todos:read"]);
  assert.equal(view.current.connectedAt, current!.createdAt);
  // What it has stays; the newly asked reading is pre-set; the newly asked «可以提修改» for notes is only marked.
  assert.deepEqual([...view.preselectedScopes].sort(), ["contacts:read", "memos:read", "proposals:read", "schedule:read", "todos:propose", "todos:read"]);
  assert.ok(view.requestedScopes.includes("memos:propose"));
  assert.ok(!view.preselectedScopes.includes("memos:propose"));
});

test("the list says how many proposals of a connection wait for the user: confirmed, expired and voided ones are not counted", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: ["todos:read", "todos:propose", "proposals:read"] });
  const other = await kit.connect({ clientId: CLAUDE_CODE, scopes: ["todos:read", "todos:propose"] });
  const propose = (token: string, key: string) => kit.call(token, "propose_change", { idempotencyKey: key, operations: [{ op: "todo.create", set: { title: `待办 ${key}` } }] });
  await propose(tokens.accessToken, "a");
  await propose(tokens.accessToken, "b");
  await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "c", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  await propose(other.accessToken, "z");
  const waiting = async () => Object.fromEntries(await Promise.all((await kit.connections.list(kit.A)).map(async (connection) => [connection.clientName, connectionView({ ...connection, waitingProposals: await kit.proposals.waitingCount(connection) }).waitingProposals] as const)));
  assert.deepEqual(await waiting(), { Claude: 3, "Claude Code": 1 });

  const cards = (await kit.cards.runtime.listActions({})).filter((action) => action.origin?.kind === "connection" && action.origin.connectionId === tokens.connectionId);
  const confirmed = await handleCardDecision({ actionId: cards[0].actionId, body: { clientDecisionId: "d1", payloadHash: cards[0].payloadHash, revision: cards[0].revision ?? 1, transition: "confirm" }, processNow: true, runtime: kit.runtimeFor(kit.A), workerId: "test" });
  assert.equal(confirmed.status, 200);
  assert.equal((await waiting()).Claude, 2);
  kit.cards.advance(DAY + 60_000);
  assert.deepEqual(await waiting(), { Claude: 0, "Claude Code": 0 }, "past 24 hours nothing waits");
});

test("what disconnecting will void is the same number the card shows", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read", "todos:propose"] });
  for (const key of ["a", "b"]) await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: key, operations: [{ op: "todo.create", set: { title: key } }] });
  const connection = (await kit.connections.get(tokens.connectionId))!;
  assert.equal(await kit.proposals.waitingCount(connection), 2);
  const revoked = (await kit.connections.revoke({ accountId: kit.A, connectionId: tokens.connectionId, reason: "user" }))!;
  assert.equal((await kit.proposals.voidOpen(revoked.connection)).voided, 2);
  assert.equal(await kit.proposals.waitingCount(revoked.connection), 0);
});

test("the short address: the endpoint the user pastes is /connect, its metadata says so, and tokens are bound to it", async () => {
  assert.equal(MCP_PATH, "/connect");
  assert.equal(CONNECT_PATH, MCP_PATH, "the address shown in settings is the endpoint itself, not an alias");
  const addresses = addressesFor("https://orbitailink.com");
  assert.equal(addresses.resource, "https://orbitailink.com/connect");
  assert.equal(addresses.resourceMetadataUrl, "https://orbitailink.com/.well-known/oauth-protected-resource/connect");
  assert.equal(protectedResourceMetadata(addresses).resource, "https://orbitailink.com/connect");

  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const claims = JSON.parse(Buffer.from(tokens.accessToken.split(".")[1], "base64url").toString("utf8")) as { aud: string };
  assert.equal(claims.aud, `${ORIGIN}/connect`);
  // The old technical address is no resource of this server.
  const asked = await kit.auth.authorize(kit.authorizeParams({ challenge: kit.s256(verifier()), resource: `${ORIGIN}/mcp` }), ADDRESSES);
  assert.equal(asked.kind, "redirect");
  assert.match((asked as { location: string }).location, /error=invalid_target/u);
});

test("with no public address configured (eval, local): a route handler and a page derive the same addresses from the address the browser used", () => {
  const env = { NODE_ENV: "development" };
  // Next hands a route handler request.url on its own host name, a page only the Host header: both must agree.
  const routeRequest = new Request("http://localhost:3190/oauth/authorize", { headers: { host: "127.0.0.1:3190" } });
  const pageRequest = new Request("http://127.0.0.1:3190/app/settings/agent-connections/authorize");
  assert.equal(mcpAddresses(routeRequest, env)?.authorizeUrl, "http://127.0.0.1:3190/oauth/authorize");
  assert.deepEqual(mcpAddresses(routeRequest, env), mcpAddresses(pageRequest, env));
  // Configured, the request plays no part at all (production).
  assert.equal(mcpAddresses(routeRequest, { AUTH_URL: "https://orbitailink.com", NODE_ENV: "production" })?.resource, "https://orbitailink.com/connect");
  assert.equal(mcpAddresses(routeRequest, { NODE_ENV: "production" }), null);
});

test("the inbox line of a proposal: «Claude 想改 2 项，等你确认», the card's count line, and it opens the confirm page", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: ["todos:read", "todos:propose"] });
  const proposed = await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "two", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }, { op: "todo.create", set: { title: "准备下周的报价单" } }] });
  const proposalId = String(proposed.data!.proposal_id);
  const [action] = (await kit.cards.runtime.listActions({})).filter((item) => item.origin?.kind === "connection");
  const connection = (await kit.connections.get(tokens.connectionId))!;
  const proposal = (await kit.proposals.forAccount({ accountId: kit.A, proposalId }))!;
  const entry = externalProposalInboxEntry({ action, connection, now: kit.now(), proposal });
  assert.equal(entry.title, "Claude 想改 2 项，等你确认");
  assert.equal(entry.reason, action.title);
  assert.deepEqual(entry.target, { href: `${PROPOSAL_PAGE_PATH}/${proposalId}`, id: action.actionId, kind: "card", status: "available" });
  assert.equal(externalProposalInboxEntry({ action, connection: { ...connection, locale: "en" }, now: kit.now(), proposal }).title, "Claude wants to change 2 items — waiting for you");
  assert.equal(externalProposalInboxEntry({ action, connection: { ...connection, locale: "ja" }, now: kit.now(), proposal }).title, "Claude が 2 件の変更を提案しています。確認をお待ちしています");
});

test("an expired card an outside agent proposed offers no «重新生成»: the agent has to propose again (both ends run this rule)", () => {
  const words = standardCopyFor("zh").aiCard;
  const base = { actionId: "card:mcp:x", operations: [], payloadHash: "h", revision: 1, revisions: [], status: "expired" as const, summary: "", title: "修改1项", updatedAt: "2026-11-16T01:00:00.000Z" };
  const regenerate = (view: ReturnType<typeof agentCardView>) => (view.kind === "card" ? view.regenerate : "offline");
  assert.ok(regenerate(agentCardView({ ...base, origin: { conversationId: "c", kind: "conversation", requestId: "r" } }, { online: true, pendingTargets: [] }, words)), "a card from a conversation still offers it");
  assert.equal(regenerate(agentCardView({ ...base, origin: { connectionId: "conn_1", externalRequestKey: "k", kind: "connection" } }, { online: true, pendingTargets: [] }, words)), null);
});
