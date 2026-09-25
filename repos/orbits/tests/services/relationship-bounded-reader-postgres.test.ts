import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("conversation previews and message windows match the oracle without histories or N+1 transfer", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, timeout: 60000 }, async () => {
  const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const schema = `relationship_page_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url, max: 1, options: `-c search_path=${schema}` });
  let bytes = 0, queries = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++;
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client }), workspaceId = "w";
    const service = (id: string) => createRelationshipCommunicationService({ store, workspaceId, actor: { accountId: id, displayName: id, email: `${id}@example.test` }, invitationBaseUrl: "https://example.test/invitations", now: () => "2026-09-25T00:00:00.000Z", resolveContact: async contactId => ({ contactId, displayName: "Recipient", organization: "Test" }) });
    const a = service("a"), b = service("b");
    const invitation = await a.createInvitation({ contactId: "c", recipientName: "b", recipientEmail: "b@example.test" });
    const binding = await b.acceptInvitation({ confirmed: true, token: invitation.token });
    for (let n = 0; n < 6; n++) await a.sendMessage({ conversationId: binding.conversationId!, qualificationVersion: binding.qualificationVersion!, requestId: `r${n}`, body: `message ${n} ` + "私密".repeat(3000) });
    const oracle = await b.getConversation(binding.conversationId!);
    const reader = createRelationshipBoundedReader({ client, workspaceId, actorId: "b", cursorSecret: "test-secret-".repeat(4) });
    bytes = 0; queries = 0;
    const summaries = await reader.conversations({ limit: 1 });
    assert.equal(queries, 1); assert.ok(bytes < 4000);
    assert.equal(summaries.items[0]?.unreadCount, oracle.unreadCount);
    assert.equal(summaries.items[0]?.lastMessage?.messageId, oracle.messages.at(-1)?.messageId);
    assert.ok(!JSON.stringify(summaries).includes('"messages"'));
    const first = await reader.messages(binding.conversationId!, { limit: 2 });
    assert.deepEqual(first.items, oracle.messages.slice(-2)); assert.equal(first.hasMore, true);
    const second = await reader.messages(binding.conversationId!, { limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.items, oracle.messages.slice(-4, -2));
    const byteBounded = await reader.messages(binding.conversationId!, { limit: 50 });
    assert.ok(byteBounded.items.length < 6, "large legal bodies also respect a byte window");
    assert.equal(byteBounded.hasMore, true);
    assert.ok(Buffer.byteLength(JSON.stringify(byteBounded)) < 128000);
    assert.ok(byteBounded.items.every(message => message.body.length === oracle.messages[0]!.body.length), "no silent truncation of a legal body");
    await assert.rejects(reader.messages(binding.conversationId!, { cursor: `${first.nextCursor}x` }), /RELATIONSHIP_CURSOR_INVALID/);
    const outsider = createRelationshipBoundedReader({ client, workspaceId, actorId: "x", cursorSecret: "test-secret-".repeat(4) });
    assert.equal((await outsider.conversations({})).items.length, 0);
    await assert.rejects(outsider.messages(binding.conversationId!, {}), /RELATIONSHIP_NOT_FOUND/);
    bytes = 0; queries = 0;
    await b.markConversationRead({ conversationId: binding.conversationId!, lastReadMessageId: oracle.messages[2]!.messageId });
    assert.equal(queries, 4, "read marker must not fetch a full conversation snapshot");
    assert.ok(bytes < 8000, `read marker returned ${bytes} bytes`);
    assert.equal((await reader.conversations({})).items[0]?.unreadCount, (await b.getConversation(binding.conversationId!)).unreadCount);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,target_id,source_type,source_id,payload,created_at,updated_at)
      select workspace_id,collection_name,'copy:'||n,target_id,source_type,source_id,payload||jsonb_build_object('messageId','copy:'||n,'body',repeat('x',2000)),created_at,updated_at
      from (select * from orbit_records where collection_name='relationship_communication_messages' order by record_id limit 1) seed
      cross join generate_series(1,10000)n`);
    bytes = 0; queries = 0;
    const grown = await reader.conversations({});
    assert.equal(queries, 1); assert.equal(grown.items.length, 1); assert.ok(bytes < 4000);
    console.info(JSON.stringify({ metric: "conversation_summary_growth", messages: 10006, queries, returnedJsonBytes: bytes }));
    bytes = 0; queries = 0;
    await b.markConversationRead({ conversationId: binding.conversationId!, lastReadMessageId: oracle.messages.at(-1)!.messageId });
    assert.equal(queries, 4); assert.ok(bytes < 8000);
    console.info(JSON.stringify({ metric: "conversation_mark_read_growth", messages: 10006, queries, returnedJsonBytes: bytes }));
    await pool.query(`update orbit_records set payload=jsonb_set(payload,'{body}',to_jsonb(repeat('x',10001))) where collection_name='relationship_communication_messages'`, []);
    await assert.rejects(reader.messages(binding.conversationId!), /RELATIONSHIP_PAGE_RESULT_INVALID/);
    await a.revokeContactBinding("c");
    await assert.rejects(reader.messages(binding.conversationId!, {}), /RELATIONSHIP_NOT_FOUND/);
  } finally { await pool.query(`drop schema ${schema} cascade`); await pool.end(); }
});
