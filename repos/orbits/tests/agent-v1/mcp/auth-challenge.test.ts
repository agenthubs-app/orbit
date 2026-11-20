import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ACCESS_TOKEN_TTL_SECONDS } from "../../../features/agent-v1/mcp/auth/config";
import { authorizationServerMetadata, protectedResourceMetadata } from "../../../features/agent-v1/mcp/auth/server";
import { SUPPORTED_VERSIONS } from "../../../features/agent-v1/mcp/transport";
import { ADDRESSES, mcpKit, ORIGIN } from "./kit";

/**
 * agent-design AG17-1 (设计稿 §5.4「传输与授权」; PLANNER 易错边界 1, 4): the challenge an unauthorised client gets, the
 * 403 for a scope it lacks, the Origin check and both protocol eras.
 */

const RECORD_WORDS = ["小林", "报价", "task:t42", "note:m31"];

function assertChallenge(response: { status: number; headers: Headers; text: string }) {
  assert.equal(response.status, 401);
  const challenge = response.headers.get("www-authenticate") ?? "";
  assert.match(challenge, /^Bearer /u);
  assert.ok(challenge.includes(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/connect"`), challenge);
  for (const word of RECORD_WORDS) assert.ok(!response.text.includes(word), `a 401 carries no record content (${word})`);
}

test("no token: 401 with the resource-metadata challenge and no record content", async () => {
  const kit = mcpKit();
  const response = await kit.rpc(null, "tools/call", { arguments: { domain: "todos", query: "小林" }, name: "search_records" });
  assertChallenge(response);
  assert.ok(!(response.headers.get("www-authenticate") ?? "").includes("invalid_token"), "nothing was presented, so no token error is named");
});

test("an expired token: 401 with the challenge; the same token worked before it expired", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "todos" })).status, 200);
  kit.cards.advance((ACCESS_TOKEN_TTL_SECONDS + 5) * 1000);
  const response = await kit.call(tokens.accessToken, "search_records", { domain: "todos" });
  assertChallenge(response);
  assert.match(response.headers.get("www-authenticate") ?? "", /error="invalid_token"/u);
});

test("a revoked connection: the very next call is 401, although the token's signature and time are still good", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "todos" })).status, 200);
  await kit.connections.revoke({ accountId: kit.A, connectionId: tokens.connectionId, reason: "user" });
  assertChallenge(await kit.call(tokens.accessToken, "search_records", { domain: "todos" }));
  assertChallenge(await kit.rpc(tokens.accessToken, "tools/list"));
});

test("an account that is closed (being deleted) is closed to its connections too", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  kit.closedAccounts.add(kit.A);
  assertChallenge(await kit.call(tokens.accessToken, "search_records", { domain: "todos" }));
});

test("a scope the connection lacks: 403 insufficient_scope naming the scope, and no record content", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["memos:read", "todos:read"] });
  const response = await kit.call(tokens.accessToken, "get_record", { id: "contact:c17", type: "contact" });
  assert.equal(response.status, 403);
  const challenge = response.headers.get("www-authenticate") ?? "";
  assert.match(challenge, /error="insufficient_scope"/u);
  assert.match(challenge, /scope="contacts:read"/u);
  assert.ok(challenge.includes("resource_metadata="));
  assert.match(response.body?.error.message, /contacts:read/u);
  assert.deepEqual(response.body?.error.data.required_scopes, ["contacts:read"]);
  for (const word of ["小林健", "北辰软件", "销售总监"]) assert.ok(!response.text.includes(word));
});

test("Origin: a browser page on another origin is refused before anything else; no Origin and Orbit's own origin pass", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const foreign = await kit.rpc(tokens.accessToken, "tools/list", {}, { headers: { origin: "https://evil.example.test" } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("www-authenticate"), null);
  // Even without a token the foreign origin is refused as such (the Origin check comes first).
  assert.equal((await kit.rpc(null, "tools/list", {}, { headers: { origin: "https://evil.example.test" } })).status, 403);
  assert.equal((await kit.rpc(tokens.accessToken, "tools/list", {}, { headers: { origin: ORIGIN } })).status, 200);
  assert.equal((await kit.rpc(tokens.accessToken, "tools/list")).status, 200);
});

test("2025-11-25: the initialize handshake is answered with that version; the client's later requests work without _meta; no session id is issued", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const init = await kit.rpc(tokens.accessToken, "initialize", { capabilities: {}, clientInfo: { name: "old-client", version: "1" }, protocolVersion: "2025-11-25" }, { era: "legacy" });
  assert.equal(init.status, 200);
  assert.equal(init.body?.result.protocolVersion, "2025-11-25");
  assert.equal(init.body?.result.serverInfo.name, "Orbit");
  assert.ok(init.body?.result.capabilities.tools);
  assert.equal(init.headers.get("mcp-session-id"), null);
  assert.equal(init.body?.result.resultType, undefined, "a legacy result has no resultType");
  const list = await kit.rpc(tokens.accessToken, "tools/list", {}, { era: "legacy" });
  assert.deepEqual(list.body?.result.tools.map((tool: { name: string }) => tool.name), ["search_records", "get_record"]);
  const call = await kit.call(tokens.accessToken, "search_records", { domain: "todos", query: "小林" }, { era: "legacy" });
  assert.equal(call.data?.records[0].id, "task:t42");
  // A version this server does not have: it answers with the newest handshake version it speaks.
  const older = await kit.rpc(tokens.accessToken, "initialize", { capabilities: {}, clientInfo: { name: "x", version: "1" }, protocolVersion: "2024-11-05" }, { era: "legacy" });
  assert.equal(older.body?.result.protocolVersion, "2025-11-25");
});

test("2026-07-28: stateless requests; the mirrored headers must agree with the body; an unknown version lists the supported ones", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const discover = await kit.rpc(tokens.accessToken, "server/discover");
  assert.equal(discover.status, 200);
  assert.deepEqual(discover.body?.result.supportedVersions, [...SUPPORTED_VERSIONS]);
  assert.equal(discover.body?.result.resultType, "complete");
  assert.equal(discover.body?.result._meta["io.modelcontextprotocol/serverInfo"].name, "Orbit");

  const noHeader = await kit.rpc(tokens.accessToken, "tools/list", {}, { dropHeaders: ["mcp-protocol-version"] });
  assert.equal(noHeader.status, 400);
  assert.equal(noHeader.body?.error.code, -32020);
  const wrongMethod = await kit.rpc(tokens.accessToken, "tools/list", {}, { headers: { "mcp-method": "tools/call" } });
  assert.equal(wrongMethod.status, 400);
  assert.equal(wrongMethod.body?.error.code, -32020);
  const wrongName = await kit.call(tokens.accessToken, "search_records", { domain: "todos" }, { headers: { "mcp-name": "get_record" } });
  assert.equal(wrongName.status, 400);
  assert.equal(wrongName.body?.error.code, -32020);

  const future = await kit.endpoint.post(new Request(ADDRESSES.resource, {
    body: JSON.stringify({ id: 9, jsonrpc: "2.0", method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2099-01-01" } } }),
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json", "mcp-method": "tools/list", "mcp-protocol-version": "2099-01-01" },
    method: "POST",
  }));
  assert.equal(future.status, 400);
  const body = await future.json();
  assert.equal(body.error.code, -32022);
  assert.deepEqual(body.error.data, { requested: "2099-01-01", supported: [...SUPPORTED_VERSIONS] });

  const unknown = await kit.rpc(tokens.accessToken, "resources/list");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body?.error.code, -32601);
  assert.equal(kit.endpoint.methodNotAllowed().status, 405);
});

test("every tool call is recorded with the connection, the tool, the scopes, the count and the agreed version; last use is kept", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read", "memos:read"] });
  assert.equal((await kit.connections.list(kit.A))[0].lastUsedAt, null);
  await kit.call(tokens.accessToken, "search_records", { domain: "memos" });
  await kit.call(tokens.accessToken, "get_record", { id: "contact:c17", type: "contact" }, { era: "legacy" });
  const calls = (await kit.cards.store.listRecords({ collectionName: "agentConnectionCalls", limit: 50, workspaceId: kit.cards.workspaceId })).map((row) => row.payload as Record<string, unknown>).sort((left, right) => String(left.at).localeCompare(String(right.at)));
  assert.deepEqual(calls.map((item) => [item.tool, item.outcome, item.count, item.protocolVersion]), [["search_records", "ok", 3, "2026-07-28"], ["get_record", "insufficient_scope", 0, "2025-11-25"]]);
  assert.ok(calls.every((item) => item.connectionId === tokens.connectionId && Array.isArray(item.scopes)));
  assert.ok((await kit.connections.list(kit.A))[0].lastUsedAt);
});

test("the metadata documents name this endpoint, this issuer, S256 only, public clients and client-id documents", () => {
  const resource = protectedResourceMetadata(ADDRESSES);
  assert.equal(resource.resource, `${ORIGIN}/connect`);
  assert.deepEqual(resource.authorization_servers, [ORIGIN]);
  assert.ok((resource.scopes_supported as string[]).includes("todos:propose"));
  assert.ok(!(resource.scopes_supported as string[]).some((scope) => /memory|conversation|email|phone/u.test(scope)), "no scope for memory, conversations or contact methods");
  const server = authorizationServerMetadata(ADDRESSES);
  assert.equal(server.issuer, ORIGIN);
  assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(server.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(server.client_id_metadata_document_supported, true);
  assert.equal(server.registration_endpoint, undefined, "no dynamic registration");
});

test("the proxy does not stand in front of the MCP endpoints, and opens nothing under /api/ for them", () => {
  const proxy = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
  // The session check covers /app and /api only: /connect, /oauth and /.well-known reach their handlers, which answer with the challenge.
  assert.match(proxy, /matcher:\s*\["\/app\/:path\*",\s*"\/api\/:path\*"\]/u);
  // Nothing under /api/agent became public: the connection list, the consent decision and the card decision need a session.
  assert.doesNotMatch(proxy, /\/api\/agent/u);
  assert.doesNotMatch(proxy, /mcp|oauth\/|["'`]\/connect/iu);
});

test("a request body larger than the endpoint takes is refused before it is parsed", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["todos:read"] });
  const huge = await kit.call(tokens.accessToken, "search_records", { domain: "todos", query: "x".repeat(300_000) });
  assert.equal(huge.status, 413);
  assert.equal(huge.body?.error.code, -32600);
});

test("the challenge asks for read scopes only: a client that follows it requests no «可以提修改» on its own", async () => {
  const kit = mcpKit();
  const response = await kit.rpc(null, "tools/list");
  const scope = /scope="([^"]+)"/u.exec(response.headers.get("www-authenticate") ?? "")?.[1] ?? "";
  const asked = scope.split(" ");
  assert.ok(asked.includes("todos:read") && asked.includes("memos:read") && asked.includes("proposals:read"), scope);
  assert.ok(!asked.some((item) => item.endsWith(":propose")), "no propose scope is suggested");
  assert.ok(!asked.includes("offline_access"));
});
