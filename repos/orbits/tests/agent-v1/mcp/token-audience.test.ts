import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { SignJWT } from "jose";
import { encode } from "next-auth/jwt";

import { createClientRegistry, redirectUriAllowed } from "../../../features/agent-v1/mcp/auth/clients";
import { addressesFor, derivedKey } from "../../../features/agent-v1/mcp/auth/config";
import { ADDRESSES, CLAUDE, CLAUDE_CALLBACK, CLAUDE_CODE, CLIENT_DOCUMENTS, mcpKit, ORIGIN, SECRET } from "./kit";

/**
 * agent-design AG17-1 (设计稿 §5.4「授权」「客户端登记」; PLANNER 易错边界 2, 3): tokens are good for this MCP endpoint
 * only; refresh tokens rotate and a reused one ends the connection; PKCE is required; only listed client documents are
 * read, and under the eval nothing is fetched at all.
 */

const verifier = () => randomBytes(32).toString("base64url");

async function mint(claims: { aud: string; iss?: string; sub: string; key?: Uint8Array; typ?: string; exp?: number }) {
  const now = Math.floor(Date.parse("2026-11-15T01:00:00.000Z") / 1000);
  return new SignJWT({ scope: "todos:read" })
    .setProtectedHeader({ alg: "HS256", typ: claims.typ ?? "at+jwt" })
    .setIssuer(claims.iss ?? ORIGIN)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(claims.exp ?? now + 3600)
    .sign(claims.key ?? derivedKey(SECRET, "access-token"));
}

test("a token is accepted only when it was issued for this MCP endpoint", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  assert.equal((await kit.rpc(tokens.accessToken, "tools/list")).status, 200);
  // The same key and the same connection, but minted for another audience (another resource of the same deployment).
  const otherAudience = await mint({ aud: `${ORIGIN}/api`, sub: tokens.connectionId });
  assert.equal((await kit.rpc(otherAudience, "tools/list")).status, 401);
  // Another deployment's endpoint as audience, another issuer, another signing key, a ticket passed off as a token.
  assert.equal((await kit.rpc(await mint({ aud: "https://other.example.test/mcp", sub: tokens.connectionId }), "tools/list")).status, 401);
  assert.equal((await kit.rpc(await mint({ aud: ADDRESSES.resource, iss: "https://other.example.test", sub: tokens.connectionId }), "tools/list")).status, 401);
  assert.equal((await kit.rpc(await mint({ aud: ADDRESSES.resource, key: derivedKey("another-secret-0123456789", "access-token"), sub: tokens.connectionId }), "tools/list")).status, 401);
  assert.equal((await kit.rpc(await mint({ aud: ADDRESSES.resource, key: derivedKey(SECRET, "authorization-request"), sub: tokens.connectionId }), "tools/list")).status, 401);
  assert.equal((await kit.rpc(await mint({ aud: ADDRESSES.resource, sub: tokens.connectionId, typ: "JWT" }), "tools/list")).status, 401);
  // A well-formed token of ours for a connection that does not exist.
  assert.equal((await kit.rpc(await mint({ aud: ADDRESSES.resource, sub: "conn_does_not_exist" }), "tools/list")).status, 401);
});

test("a web session cookie, a Google token and a refresh token are not access tokens here", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const session = await encode({ maxAge: 3600, salt: "authjs.session-token", secret: SECRET, token: { email: "a@example.test", name: "A", sub: `auth:${kit.A}` } });
  assert.equal((await kit.rpc(session, "tools/list")).status, 401);
  assert.equal((await kit.rpc("ya29.a0AfH6SMBx-google-access-token-looks-like-this", "tools/list")).status, 401);
  assert.equal((await kit.rpc(tokens.refreshToken, "tools/list")).status, 401);
  // A session cookie sent as a cookie (and no bearer token) is no credential for the endpoint either.
  const viaCookie = await kit.rpc(null, "tools/list", {}, { headers: { cookie: `authjs.session-token=${session}` } });
  assert.equal(viaCookie.status, 401);
  assert.ok(viaCookie.headers.get("www-authenticate")?.includes("resource_metadata="));
});

test("an access token says which connection it is for and nothing about the user", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const claims = JSON.parse(Buffer.from(tokens.accessToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(claims).sort(), ["aud", "client_id", "exp", "iat", "iss", "jti", "scope", "sub"]);
  assert.equal(claims.aud, ADDRESSES.resource);
  assert.equal(claims.sub, tokens.connectionId);
  assert.ok(!JSON.stringify(claims).includes(kit.A), "no account id in the token");
});

test("refresh tokens rotate; presenting a spent one ends the whole connection and voids its open proposals", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const first = await kit.connect({ scopes: ["todos:read", "todos:propose", "proposals:read"] });
  const proposed = await kit.call(first.accessToken, "propose_change", { idempotencyKey: "k1", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  assert.equal(proposed.status, 200);

  const refresh = (token: string) => kit.auth.token(new URLSearchParams({ client_id: CLAUDE, grant_type: "refresh_token", refresh_token: token, resource: ADDRESSES.resource }), ADDRESSES);
  const second = await refresh(first.refreshToken);
  assert.equal(second.status, 200);
  assert.notEqual(second.body.refresh_token, first.refreshToken, "a new refresh token every time");
  assert.equal((await kit.rpc(String(second.body.access_token), "tools/list")).status, 200);

  // The spent refresh token comes back (stolen, or replayed): invalid_grant, and the connection ends for everyone holding its tokens.
  const replay = await refresh(first.refreshToken);
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, "invalid_grant");
  assert.equal((await kit.rpc(String(second.body.access_token), "tools/list")).status, 401);
  assert.equal((await kit.rpc(first.accessToken, "tools/list")).status, 401);
  assert.equal((await refresh(String(second.body.refresh_token))).body.error, "invalid_grant");
  assert.equal((await kit.connections.get(first.connectionId))?.revokedReason, "refresh_reuse");
  // What it proposed and nobody confirmed is voided with it.
  const card = (await kit.cards.runtime.listActions({})).find((action) => action.origin?.kind === "connection");
  assert.equal(card?.status, "canceled");
});

test("PKCE is required: no challenge, a plain challenge, a missing or wrong verifier are all refused", async () => {
  const kit = mcpKit();
  const code = verifier();
  const none = await kit.auth.authorize(kit.authorizeParams({ scope: "todos:read" }), ADDRESSES);
  assert.equal(none.kind, "redirect");
  assert.equal(new URL((none as { location: string }).location).searchParams.get("error"), "invalid_request");
  const plain = await kit.auth.authorize(kit.authorizeParams({ challenge: code, method: "plain" }), ADDRESSES);
  assert.equal(new URL((plain as { location: string }).location).searchParams.get("error"), "invalid_request");

  const ok = await kit.auth.authorize(kit.authorizeParams({ challenge: kit.s256(code), scope: "todos:read", state: "xyz" }), ADDRESSES);
  assert.equal(ok.kind, "consent");
  const ticket = (ok as { ticket: string }).ticket;
  const decide = async () => {
    const decided = await kit.auth.decide({ account: { accountId: kit.A, userId: "auth:a" }, decision: "allow", scopes: ["todos:read"], ticket }, ADDRESSES);
    assert.equal(decided.ok, true);
    const back = new URL((decided as { redirectTo: string }).redirectTo);
    assert.equal(`${back.origin}${back.pathname}`, CLAUDE_CALLBACK);
    assert.equal(back.searchParams.get("state"), "xyz");
    assert.equal(back.searchParams.get("iss"), ORIGIN);
    return back.searchParams.get("code")!;
  };
  const exchange = (authCode: string, extra: Record<string, string>) => kit.auth.token(new URLSearchParams({ client_id: CLAUDE, code: authCode, grant_type: "authorization_code", redirect_uri: CLAUDE_CALLBACK, ...extra }), ADDRESSES);
  assert.equal((await exchange(await decide(), {})).body.error, "invalid_grant");
  assert.equal((await exchange(await decide(), { code_verifier: verifier() })).body.error, "invalid_grant");
  assert.equal((await exchange(await decide(), { code_verifier: code, redirect_uri: "https://claude.ai/other" })).body.error, "invalid_grant");
  assert.equal((await exchange(await decide(), { client_id: CLAUDE_CODE, code_verifier: code })).body.error, "invalid_grant");
  assert.equal((await exchange(await decide(), { code_verifier: code, resource: "https://other.example.test/mcp" })).body.error, "invalid_target");
  assert.equal((await kit.connections.list(kit.A)).length, 0, "no refused exchange left a connection behind");

  // The right verifier works once; the same code a second time ends the connection the first exchange made.
  const good = await decide();
  const issued = await exchange(good, { code_verifier: code });
  assert.equal(issued.status, 200);
  assert.equal(issued.body.token_type, "Bearer");
  assert.equal((await kit.rpc(String(issued.body.access_token), "tools/list")).status, 200);
  assert.equal((await exchange(good, { code_verifier: code })).body.error, "invalid_grant");
  assert.equal((await kit.rpc(String(issued.body.access_token), "tools/list")).status, 401);
});

test("an authorization code expires after five minutes; a consent ticket after ten", async () => {
  const kit = mcpKit();
  const code = verifier();
  const ok = await kit.auth.authorize(kit.authorizeParams({ challenge: kit.s256(code) }), ADDRESSES);
  const ticket = (ok as { ticket: string }).ticket;
  const decided = await kit.auth.decide({ account: { accountId: kit.A, userId: "auth:a" }, decision: "allow", scopes: ["memos:read"], ticket }, ADDRESSES);
  const authCode = new URL((decided as { redirectTo: string }).redirectTo).searchParams.get("code")!;
  kit.cards.advance(5 * 60_000 + 1000);
  assert.equal((await kit.auth.token(new URLSearchParams({ client_id: CLAUDE, code: authCode, code_verifier: code, grant_type: "authorization_code", redirect_uri: CLAUDE_CALLBACK }), ADDRESSES)).body.error, "invalid_grant");
  kit.cards.advance(5 * 60_000);
  assert.deepEqual(await kit.auth.decide({ account: { accountId: kit.A, userId: "auth:a" }, decision: "allow", scopes: ["memos:read"], ticket }, ADDRESSES), { ok: false, reason: "TICKET_INVALID" });
  // A ticket signed for another deployment is not this one's.
  assert.equal(await kit.auth.readTicket(ticket, addressesFor("https://other.example.test")), null);
});

test("the request must name this MCP endpoint as its resource, a registered redirect address and known scopes", async () => {
  const kit = mcpKit();
  const challenge = kit.s256(verifier());
  const errorOf = async (params: URLSearchParams) => {
    const outcome = await kit.auth.authorize(params, ADDRESSES);
    return outcome.kind === "redirect" ? new URL(outcome.location).searchParams.get("error") : outcome.kind === "refused" ? `refused:${outcome.error}` : "consent";
  };
  assert.equal(await errorOf(kit.authorizeParams({ challenge, resource: null })), "invalid_target");
  assert.equal(await errorOf(kit.authorizeParams({ challenge, resource: "https://other.example.test/mcp" })), "invalid_target");
  assert.equal(await errorOf(kit.authorizeParams({ challenge, resource: `${ORIGIN}/connect/` })), "consent");
  // The technical address of the server-only run is no resource here any more (the short address is the endpoint).
  assert.equal(await errorOf(kit.authorizeParams({ challenge, resource: `${ORIGIN}/mcp` })), "invalid_target");
  assert.equal(await errorOf(kit.authorizeParams({ challenge, scope: "todos:read memory:read" })), "invalid_scope");
  assert.equal(await errorOf(kit.authorizeParams({ challenge, scope: "todos:read offline_access" })), "consent");
  // An address the client never registered: no redirect at all (it could be an attacker's).
  assert.equal(await errorOf(kit.authorizeParams({ challenge, redirectUri: "https://evil.example.test/cb" })), "refused:invalid_request");
  // The user must choose something, and only what exists.
  const ok = await kit.auth.authorize(kit.authorizeParams({ challenge }), ADDRESSES);
  const ticket = (ok as { ticket: string }).ticket;
  assert.deepEqual(await kit.auth.decide({ account: { accountId: kit.A, userId: "auth:a" }, decision: "allow", scopes: [], ticket }, ADDRESSES), { ok: false, reason: "SCOPES_INVALID" });
  assert.deepEqual(await kit.auth.decide({ account: { accountId: kit.A, userId: "auth:a" }, decision: "allow", scopes: ["memory:read"], ticket }, ADDRESSES), { ok: false, reason: "SCOPES_INVALID" });
  const denied = await kit.auth.decide({ account: { accountId: kit.A, userId: "auth:a" }, decision: "deny", scopes: [], ticket }, ADDRESSES);
  assert.equal(new URL((denied as { redirectTo: string }).redirectTo).searchParams.get("error"), "access_denied");
});

test("only listed client documents are read: an unlisted client_id is refused before any fetch", async () => {
  const kit = mcpKit();
  const outcome = await kit.auth.authorize(kit.authorizeParams({ challenge: kit.s256(verifier()), clientId: "https://evil.example.test/client.json", redirectUri: "https://evil.example.test/cb" }), ADDRESSES);
  assert.equal(outcome.kind, "refused");
  assert.equal((outcome as { error: string }).error, "invalid_client");
  assert.deepEqual(kit.documentLoads, [], "nothing was fetched for a client that is not on the list");
  // A look-alike on the listed host, and the listed URL with a query, are not the listed document.
  assert.equal(await kit.clients.resolve("https://claude.ai/oauth/mcp-oauth-client-metadata?x=1"), null);
  assert.equal(await kit.clients.resolve("https://claude.ai/oauth/other-client"), null);
  assert.deepEqual(kit.documentLoads, []);
});

test("a listed document is used only when it is valid: its client_id is its own URL and it is a public client", async () => {
  const load = (doc: unknown) => createClientRegistry({ load: async () => doc });
  assert.equal(await load({ ...(CLIENT_DOCUMENTS[CLAUDE] as object), client_id: "https://claude.ai/oauth/another" }).resolve(CLAUDE), null);
  assert.equal(await load({ ...(CLIENT_DOCUMENTS[CLAUDE] as object), redirect_uris: [] }).resolve(CLAUDE), null);
  assert.equal(await load({ ...(CLIENT_DOCUMENTS[CLAUDE] as object), token_endpoint_auth_method: "client_secret_basic" }).resolve(CLAUDE), null);
  assert.equal(await load("not json").resolve(CLAUDE), null);
  assert.equal(await createClientRegistry({ load: async () => { throw new Error("timeout"); } }).resolve(CLAUDE), null);
  // The name shown is Orbit's own for the listed client, not what the document calls itself.
  const renamed = await load({ ...(CLIENT_DOCUMENTS[CLAUDE] as object), client_name: "Orbit Official Support" }).resolve(CLAUDE);
  assert.equal(renamed?.name, "Claude");
});

test("under the eval nothing goes out: the recorded copy is used, and a URL with no copy is refused without a fetch", async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown) => { calls.push(String(input)); throw new Error("no outbound connection in the eval"); }) as typeof fetch;
  const hook = globalThis as { __orbitAgentEval?: unknown };
  const before = hook.__orbitAgentEval;
  hook.__orbitAgentEval = { clientDocument: (clientId: string) => (clientId === CLAUDE ? CLIENT_DOCUMENTS[CLAUDE] : undefined), emit: () => undefined };
  try {
    const registry = createClientRegistry();
    assert.deepEqual(await registry.resolve(CLAUDE), { clientId: CLAUDE, name: "Claude", redirectUris: [CLAUDE_CALLBACK] });
    assert.equal(await registry.resolve(CLAUDE_CODE), null, "listed, but no recorded copy: refused, not fetched");
    assert.equal(await registry.resolve("https://evil.example.test/client.json"), null);
    assert.deepEqual(calls, []);
  } finally {
    hook.__orbitAgentEval = before;
    globalThis.fetch = realFetch;
  }
});

test("redirect addresses match exactly; a loopback address matches with its port ignored", () => {
  const code = ["http://localhost/callback", "http://127.0.0.1/callback"];
  assert.equal(redirectUriAllowed("http://127.0.0.1:53111/callback", code), true);
  assert.equal(redirectUriAllowed("http://localhost:3118/callback", code), true);
  assert.equal(redirectUriAllowed("http://127.0.0.1:53111/other", code), false);
  assert.equal(redirectUriAllowed("https://127.0.0.1:53111/callback", code), false);
  assert.equal(redirectUriAllowed("http://127.0.0.1.evil.example.test/callback", code), false);
  assert.equal(redirectUriAllowed("http://user@127.0.0.1:1/callback", code), false);
  assert.equal(redirectUriAllowed(CLAUDE_CALLBACK, [CLAUDE_CALLBACK]), true);
  assert.equal(redirectUriAllowed(`${CLAUDE_CALLBACK}/`, [CLAUDE_CALLBACK]), false);
  assert.equal(redirectUriAllowed("https://claude.ai:8443/api/mcp/auth_callback", [CLAUDE_CALLBACK]), false, "the port is ignored for loopback only");
});
