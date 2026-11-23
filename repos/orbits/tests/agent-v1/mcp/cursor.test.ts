import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createCursorSealer } from "../../../features/agent-v1/mcp/tools/cursor";
import { contact, CURSOR_KEY, memo, WORKSPACE } from "../read-kit";
import { SECRET } from "./kit";
import { A, B, CLAUDE_CODE, mcpKit, world } from "./kit";

/**
 * agent-design AG17 (设计稿 §5.4「工具结果里不放什么」; coordinator's review of run 01b): the paging cursor.
 *
 * Part 1 — is the cursor a way in? The read adapters' own cursor (AG05) is a signed, readable claim set. Whatever a
 * client writes into it, the account and the workspace of the next page come from the connection the token names,
 * never from the cursor: a cursor that names another account is refused, even when it carries a valid signature.
 *
 * Part 2 — what the outside sees is opaque: encrypted, bound to the connection and the kind of record, refused when
 * altered. Nothing in it can be read: no account, workspace, record id, time or query text.
 */

const many = (owner: string, prefix: string, count: number) => Array.from({ length: count }, (_, index) => memo(owner, `note:${prefix}${String(index).padStart(2, "0")}`, `${prefix} 第 ${index} 篇`, new Date(Date.UTC(2026, 0, 1 + index)).toISOString()));
const bigWorld = () => world([...many(A, "minememo", 25), ...many(B, "theirsmemo", 25), contact(B, "contact:cb2", "乙的另一位联系人")]);

const sign = (payload: string) => createHmac("sha256", CURSOR_KEY).update(payload).digest("base64url");
/** The adapters' cursor with its claims rewritten; `resign` signs it with the real key (the worst case: the key leaked). */
function rewrite(cursor: string, change: (claims: Record<string, any>) => void, resign: boolean): string {
  const [payload, signature] = cursor.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, any>;
  change(claims);
  const next = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${next}.${resign ? sign(next) : signature}`;
}

test("part 1: the account and workspace of a page never come from the cursor — a rewritten cursor is refused or reads only the caller's own records", async () => {
  const kit = mcpKit({ records: bigWorld() });
  const scopeA = { accountId: A, authorizationEpoch: "agent-v1", workspaceId: WORKSPACE };
  const first = await kit.registry.read("memo", scopeA, {});
  assert.ok(first.nextCursor, "there is a second page");
  const theirs = (ids: readonly string[]) => ids.filter((id) => id.includes("theirs") || id === "note:mb1");

  const attempts: Record<string, string> = {
    "another account, old signature": rewrite(first.nextCursor!, (claims) => { claims.scope.actorId = B; }, false),
    "another account, validly signed": rewrite(first.nextCursor!, (claims) => { claims.scope.actorId = B; }, true),
    "another workspace, validly signed": rewrite(first.nextCursor!, (claims) => { claims.scope.workspaceId = "workspace:other"; }, true),
    "position moved, old signature": rewrite(first.nextCursor!, (claims) => { claims.position = JSON.stringify(["2026-01-01T00:00:00.000Z", "note:theirsmemo00"]); }, false),
    "position moved to another account's record, validly signed": rewrite(first.nextCursor!, (claims) => { claims.position = JSON.stringify(["2026-01-20T00:00:00.000Z", "note:theirsmemo19"]); }, true),
    "filter hash changed, validly signed": rewrite(first.nextCursor!, (claims) => { claims.filterHash = "0".repeat(64); }, true),
    "not base64": "%%%not-base64%%%.###",
    "empty parts": ".",
    "one part": first.nextCursor!.split(".")[0],
  };
  for (const [name, cursor] of Object.entries(attempts)) {
    let ids: string[] = [];
    let refused = false;
    try {
      ids = (await kit.registry.read("memo", scopeA, { cursor })).items.map((item) => item.id);
    } catch {
      refused = true;
    }
    assert.deepEqual(theirs(ids), [], `${name}: nothing of account B comes back`);
    // Only a validly signed cursor that still names the caller's own scope may be read at all.
    if (!name.startsWith("position moved to another account's record")) assert.equal(refused, true, `${name}: refused`);
  }
  // The honest cursor still works, and the whole walk stays inside account A.
  const second = await kit.registry.read("memo", scopeA, { cursor: first.nextCursor! });
  assert.equal(second.items.length, 10);
  assert.deepEqual(theirs(second.items.map((item) => item.id)), []);
});

/** Everything a client could try to read out of a cursor: the text itself, its base64 decoding, and each dot-separated part decoded. */
function readings(cursor: string): string[] {
  const decode = (value: string) => Buffer.from(value, "base64url").toString("latin1");
  return [cursor, decode(cursor), ...cursor.split(".").map(decode), Buffer.from(cursor, "base64").toString("latin1")];
}

test("part 2: what the client gets is opaque — no account, workspace, record id, time, query text or field name can be read out of it", async () => {
  const kit = mcpKit({ records: bigWorld() });
  const tokens = await kit.connect({ scopes: ["memos:read"] });
  const page = await kit.call(tokens.accessToken, "search_records", { domain: "memos", query: "minememo" });
  const cursor = page.data!.next_cursor as string;
  assert.match(cursor, /^[A-Za-z0-9_-]+$/u, "one run of URL-safe characters, no readable structure");
  const ids = (page.data!.records as { id: string }[]).map((record) => record.id);
  const forbidden = [A, B, WORKSPACE, "workspace", "user_", "note:", "minememo", "scope", "actorId", "filterHash", "position", "snapshot", "notes.query", "2026-", tokens.connectionId, ...ids];
  for (const text of readings(cursor)) for (const word of forbidden) assert.ok(!text.includes(word), `the cursor does not reveal ${word}`);
  // Two cursors for the same place are not the same text (a fresh nonce each time), so they cannot be compared either.
  const again = await kit.call(tokens.accessToken, "search_records", { domain: "memos", query: "minememo" });
  assert.notEqual(again.data!.next_cursor, cursor);
});

test("part 2: a cursor works only for the connection, the kind of record and the query it was issued for; altered, it is refused", async () => {
  const kit = mcpKit({ records: bigWorld() });
  const mine = await kit.connect({ scopes: ["memos:read", "todos:read"] });
  // One connection per client per account: the account's other connection is another client's.
  const sameAccount = await kit.connect({ clientId: CLAUDE_CODE, scopes: ["memos:read", "todos:read"] });
  const otherAccount = await kit.connect({ account: B, scopes: ["memos:read"] });
  const first = await kit.call(mine.accessToken, "search_records", { domain: "memos" });
  const cursor = first.data!.next_cursor as string;
  const refused = async (token: string, args: Record<string, unknown>, why: string) => {
    const answer = await kit.call(token, "search_records", args);
    assert.equal(answer.status, 200, why);
    assert.equal(answer.isError, true, why);
    assert.equal(answer.data!.error.code, "invalid_arguments", why);
    assert.equal(answer.data!.records, undefined, why);
    assert.ok(!answer.text.includes("theirs") && !answer.text.includes("minememo 第"), `${why}: no record content in the refusal`);
  };

  const next = await kit.call(mine.accessToken, "search_records", { cursor, domain: "memos" });
  assert.equal(next.isError, false, "the connection it was issued to walks on");
  assert.equal(next.data!.records.length, 10);

  await refused(sameAccount.accessToken, { cursor, domain: "memos" }, "another connection of the same account");
  await refused(otherAccount.accessToken, { cursor, domain: "memos" }, "a connection of another account");
  await refused(mine.accessToken, { cursor, domain: "todos" }, "another kind of record");
  await refused(mine.accessToken, { cursor, domain: "memos", query: "theirs" }, "another query");
  const flipped = `${cursor.slice(0, 30)}${cursor[30] === "A" ? "B" : "A"}${cursor.slice(31)}`;
  await refused(mine.accessToken, { cursor: flipped, domain: "memos" }, "one character changed");
  await refused(mine.accessToken, { cursor: cursor.slice(0, -6), domain: "memos" }, "cut short");
  await refused(mine.accessToken, { cursor: `${cursor}AAAA`, domain: "memos" }, "extended");
  await refused(mine.accessToken, { cursor: "%%%not-base64%%%", domain: "memos" }, "not base64");
  await refused(mine.accessToken, { cursor: "AAAA", domain: "memos" }, "too short to be a cursor");

  // The adapters' own signed cursor is never accepted from outside, even an honest one for this very account.
  const inner = (await kit.registry.read("memo", { accountId: A, authorizationEpoch: "agent-v1", workspaceId: WORKSPACE }, {})).nextCursor!;
  await refused(mine.accessToken, { cursor: inner, domain: "memos" }, "the inner cursor passed in directly");
  const naming = rewrite(inner, (claims) => { claims.scope.actorId = B; }, true);
  await refused(mine.accessToken, { cursor: naming, domain: "memos" }, "an inner cursor naming another account");

  // Revoked: the cursor dies with the connection (the call itself is refused).
  await kit.connections.revoke({ accountId: A, connectionId: mine.connectionId, reason: "user" });
  assert.equal((await kit.call(mine.accessToken, "search_records", { cursor, domain: "memos" })).status, 401);
});

test("part 2: without a deployment secret nothing is sealed — there is no plain fallback", () => {
  for (const secret of ["", "short", "   "]) assert.throws(() => createCursorSealer(secret), /secret/u, JSON.stringify(secret));
  const sealer = createCursorSealer(SECRET);
  const binding = { connectionId: "conn_a", domain: "memos", query: "" };
  const sealed = sealer.seal("inner-cursor-text", binding);
  assert.equal(sealer.open(sealed, binding), "inner-cursor-text");
  assert.equal(sealer.open(sealed, { ...binding, connectionId: "conn_b" }), null);
  assert.equal(createCursorSealer(`${SECRET}-another`).open(sealed, binding), null, "another deployment's key opens nothing");
});
