/**
 * GET /api/changes：每个区域一个不可逆的指纹；没变化时 304、无正文；不含任何内容；只看本人的行；
 * 出错时 503 且不缓存；未登录 401。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createChangesGetHandler } from "../../app/api/changes/handler";
import { readChangeTokens } from "../../shared/storage/change-tokens";

type Row = Record<string, unknown>;

function fakeClient(records: Row[], members: Row | Error) {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  return {
    calls,
    async query<T = Row>(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      if (text.includes("changes:messages")) {
        if (members instanceof Error) throw members;
        return { rows: [members] as unknown as T[] };
      }
      return { rows: records as unknown as T[] };
    },
  };
}

const actor = { id: "actor-1", accountId: "account-1", workspaceId: "ws-1", userId: "user-1" };

test("tokens move only for the area whose watermark moved, and carry no content", async () => {
  const base = [{ collection_name: "contacts", max_updated_at: "2026-10-28 10:00:00+00", count: "3" }, { collection_name: "notes", max_updated_at: "2026-10-28 09:00:00+00", count: "1" }];
  const read = (records: Row[], members: Row | Error = { max_revision: "7", count: "2" }) => readChangeTokens({ client: fakeClient(records, members), workspaceId: "ws-1", actorId: "actor-1", accountId: "account-1", agentWorkspaceId: "ws-1:actor:actor-1" });
  const before = await read(base);
  const contactAdded = await read([{ ...base[0], max_updated_at: "2026-10-28 10:05:00+00", count: "4" }, base[1]]);
  assert.notEqual(contactAdded.contacts, before.contacts);
  for (const area of ["inbox", "tasks", "calendar", "memo", "agent"] as const) assert.equal(contactAdded[area], before[area], area);

  const newMessage = await read(base, { max_revision: "8", count: "2" });
  assert.notEqual(newMessage.inbox, before.inbox);
  assert.equal(newMessage.contacts, before.contacts);

  const noMessageTables = await read(base, new Error('relation "relationship_conversation_members" does not exist'));
  assert.equal(typeof noMessageTables.inbox, "string", "no message tables: the inbox keeps its records' token");

  for (const value of Object.values(before)) assert.match(value, /^[0-9a-f]{32}$/u, "an opaque hash, nothing readable");
});

test("the statements are scoped to this person: own user_id, own sub-workspace, own conversation memberships", async () => {
  const client = fakeClient([], { max_revision: null, count: "0" });
  await readChangeTokens({ client, workspaceId: "ws-1", actorId: "actor-1", accountId: "account-1", agentWorkspaceId: "ws-1:actor:actor-1" });
  const [records, members] = client.calls;
  assert.match(records!.text, /user_id = \$2/u);
  assert.deepEqual([records!.values[0], records!.values[1], records!.values[3]], ["ws-1", "actor-1", "ws-1:actor:actor-1"]);
  assert.match(members!.text, /account_id = \$2/u);
  assert.deepEqual(members!.values, ["ws-1", "account-1"]);
});

test("route: 401 signed out; 200 with ETag and poll interval; 304 without a body when nothing moved; 503 not cached", async () => {
  const signedOut = await createChangesGetHandler({ resolveActor: async () => null })(new Request("https://orbit.test/api/changes"));
  assert.equal(signedOut.status, 401);

  let tokens = { inbox: "a", contacts: "b", tasks: "c", calendar: "d", memo: "e", agent: "f" };
  const handler = createChangesGetHandler({
    resolveActor: async () => actor as never,
    storage: () => ({ client: fakeClient([], { max_revision: null, count: "0" }), workspaceId: "ws-1" }),
    readTokens: async () => tokens,
  });
  const first = await handler(new Request("https://orbit.test/api/changes"));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "private, no-cache");
  assert.equal(first.headers.get("vary"), "Cookie");
  assert.equal(first.headers.get("x-poll-interval"), "30");
  const etag = first.headers.get("etag")!;
  assert.deepEqual((await first.json()).data.tokens, tokens);

  const same = await handler(new Request("https://orbit.test/api/changes", { headers: { "if-none-match": etag } }));
  assert.equal(same.status, 304);
  assert.equal(await same.text(), "");

  tokens = { ...tokens, inbox: "a2" };
  const moved = await handler(new Request("https://orbit.test/api/changes", { headers: { "if-none-match": etag } }));
  assert.equal(moved.status, 200);
  assert.notEqual(moved.headers.get("etag"), etag);

  const broken = await createChangesGetHandler({ resolveActor: async () => actor as never, storage: () => null })(new Request("https://orbit.test/api/changes"));
  assert.equal(broken.status, 503);
  assert.equal(broken.headers.get("cache-control"), "private, no-store");
});
