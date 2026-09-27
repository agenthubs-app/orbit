import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createReadCostLedger } from "../performance/read-cost-ledger";
import { connect, createRelationshipHarness, relationshipPostgresSkip } from "../support/relationship-message-harness";

// Sprint 0109: previews and message windows read the relationship message tables.
test("conversation previews and message windows match the oracle without histories or N+1 transfer", { skip: relationshipPostgresSkip, timeout: 60000 }, async (t) => {
  const ledger = createReadCostLedger();
  const h = await createRelationshipHarness({ prefix: "relationship_page", readMetrics: { observer: ledger.observer }, resolveContact: async contactId => ({ contactId, displayName: "Recipient", organization: "Test" }) });
  t.after(() => h.close());
  let bytes = 0, queries = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await h.client.query<T>(sql, values);
    bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++;
    return { rows: result.rows as T[] };
  } };
  const person = (id: string) => ({ accountId: id, displayName: id, email: `${id}@example.test` });
  const a = h.service(person("a"), { now: () => "2026-09-25T00:00:00.000Z" }), b = h.service(person("b"));
  const binding = await connect(h, person("a"), person("b"), "c");
  for (let n = 0; n < 6; n++) await a.sendMessage({ conversationId: binding.conversationId, qualificationVersion: binding.qualificationVersion, requestId: `r${n}`, body: `message ${n} ` + "私密".repeat(3000) });
  const oracle = await b.getConversation(binding.conversationId);
  const reader = createRelationshipBoundedReader({ client, workspaceId: h.workspaceId, actorId: "b", cursorSecret: "test-secret-".repeat(4) });
  bytes = 0; queries = 0;
  const summaries = await reader.conversations({ limit: 1 });
  assert.equal(queries, 1); assert.ok(bytes < 4000);
  assert.equal(summaries.items[0]?.unreadCount, oracle.unreadCount);
  assert.equal(summaries.items[0]?.lastMessage?.messageId, oracle.messages.at(-1)?.messageId);
  assert.ok(!JSON.stringify(summaries).includes('"messages"'));
  const first = await reader.messages(binding.conversationId, { limit: 2 });
  assert.deepEqual(first.items, oracle.messages.slice(-2)); assert.equal(first.hasMore, true);
  const second = await reader.messages(binding.conversationId, { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items, oracle.messages.slice(-4, -2));
  const byteBounded = await reader.messages(binding.conversationId, { limit: 50 });
  assert.ok(byteBounded.items.length < 6, "large legal bodies also respect a byte window");
  assert.equal(byteBounded.hasMore, true);
  assert.ok(Buffer.byteLength(JSON.stringify(byteBounded)) < 128000);
  assert.ok(byteBounded.items.every(message => message.body.length === oracle.messages[0]!.body.length), "no silent truncation of a legal body");
  await assert.rejects(reader.messages(binding.conversationId, { cursor: `${first.nextCursor}x` }), /RELATIONSHIP_CURSOR_INVALID/);
  const outsider = createRelationshipBoundedReader({ client, workspaceId: h.workspaceId, actorId: "x", cursorSecret: "test-secret-".repeat(4) });
  assert.equal((await outsider.conversations({})).items.length, 0);
  await assert.rejects(outsider.messages(binding.conversationId, {}), /RELATIONSHIP_NOT_FOUND/);

  const markRead = (messageId: string) => ledger.measure("mark-read", () => b.markConversationRead({ conversationId: binding.conversationId, lastReadMessageId: messageId }));
  const readSmall = await markRead(oracle.messages[2]!.messageId);
  assert.ok(readSmall.cost.bytes < 8000, `read marker returned ${readSmall.cost.bytes} bytes`);
  assert.equal((await reader.conversations({})).items[0]?.unreadCount, (await b.getConversation(binding.conversationId)).unreadCount);

  // 10 000 more messages in another conversation of other accounts: the caller's reads do not grow.
  const foreign = await connect(h, person("p"), person("q"), "c-foreign");
  await h.client.transaction(async (tx) => {
    await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
    await tx.query(`insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
      select $1, $2, n, 'copy:'||n, 'p', 'p', repeat('x', 2000), now(), $3, 'copy:'||n from generate_series(1, 10000) n`, [h.workspaceId, foreign.conversationId, foreign.qualificationVersion]);
    await tx.query("update relationship_conversations set last_message_seq = 10000 where conversation_id = $1", [foreign.conversationId]);
  });
  bytes = 0; queries = 0;
  const grown = await reader.conversations({});
  assert.equal(queries, 1); assert.equal(grown.items.length, 1); assert.ok(bytes < 4000);
  console.info(JSON.stringify({ metric: "conversation_summary_growth", foreignMessages: 10000, queries, returnedJsonBytes: bytes }));
  const readGrown = await markRead(oracle.messages.at(-1)!.messageId);
  assert.ok(readGrown.cost.bytes <= readSmall.cost.bytes + 64, "marking read does not read the history");
  console.info(JSON.stringify({ metric: "conversation_mark_read_growth", foreignMessages: 10000, cost: readGrown.cost }));
  // The table refuses an over-long body, so an invalid page can no longer be stored.
  await assert.rejects(h.client.transaction(async (tx) => {
    await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
    await tx.query("update relationship_messages set body = repeat('x', 10001) where conversation_id = $1", [binding.conversationId]);
  }), /check constraint/);
  await a.revokeContactBinding("c");
  await assert.rejects(reader.messages(binding.conversationId, {}), /RELATIONSHIP_NOT_FOUND/);
});
