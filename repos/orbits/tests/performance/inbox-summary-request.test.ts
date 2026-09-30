import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createInboxSummaryGetHandler } from "../../app/api/inbox/summary/handler";
import { resolveAuthenticatedApiActorIdentity } from "../../app/api/_shared/authenticated-actor";
import { createStorageAccountSessionProvider } from "../../features/account/storage/account-live-record-provider";
import { createRelationshipMessageStore } from "../../features/relationship-communication/message-store";
import { RELATIONSHIP_MESSAGE_SCHEMA_SQL } from "../../features/relationship-communication/message-tables";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { readLegacyNotificationUnreadSummary } from "../../features/notifications/legacy-unread-summary";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("complete legacy summary includes persisted identity and nonempty message/notification histories", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, timeout: 60000 }, async () => {
  const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const schema = `inbox_request_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  let bytes = 0, queries = 0, rows = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++; rows += result.rows.length;
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(RELATIONSHIP_MESSAGE_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const writer = createTransactionalPostgresClient({ connectionString: url, pool: pool as never });
    const workspaceId = "w", at = "2026-09-25T00:00:00.000Z";
    const common = { workspaceId, userId: "recipient", sourceType: "manual", sourceId: "s", evidenceIds: [], createdAt: at, updatedAt: at, lifecycleState: "active" as const };
    await store.upsertRecord({ ...common, collectionName: "accounts", recordId: "recipient", payload: { id: "recipient", name: "Recipient", createdAt: at, updatedAt: at } });
    await store.upsertRecord({ ...common, collectionName: "profiles", recordId: "profile", payload: { id: "profile", accountId: "recipient", displayName: "Recipient", createdAt: at, updatedAt: at } });
    const service = (id: string) => createRelationshipCommunicationService({ workspaceId, store, messages: createRelationshipMessageStore({ client: writer, workspaceId }),
      actor: { accountId: id, displayName: id, email: `${id}@example.test` }, invitationBaseUrl: "https://example.test/invitations", now: () => at,
      resolveContact: async contactId => ({ contactId, displayName: "Recipient", organization: "Test" }),
    });
    const sender = service("sender"), recipient = service("recipient");
    const invitation = await sender.createInvitation({ contactId: "contact", recipientName: "Recipient", recipientEmail: "recipient@example.test" });
    const binding = await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
    await sender.sendMessage({ conversationId: binding.conversationId!, qualificationVersion: binding.qualificationVersion!, requestId: "seed", body: "Private body ".repeat(100) });
    await store.upsertRecord({ ...common, collectionName: "notifications", recordId: "seed", payload: { id: "seed", channel: "in_app", title: "Title", body: "Private notification ".repeat(100), status: "pending", source: { type: "system", id: "s" }, evidenceIds: ["e"], createdAt: at } });
    const identity = createStorageAccountSessionProvider({ store, workspaceId, requireIdentity: true });
    const handler = createInboxSummaryGetHandler({
      resolveActor: async () => resolveAuthenticatedApiActorIdentity({ workspaceId, mode: "live", session: { userId: "profile" }, graph: await identity.readAccountSessionGraph({ userId: "profile" }) }),
      typedEnabled: () => false,
      readMessages: async actor => (await readRelationshipUnreadSummary({ client, workspaceId, actorId: actor.id })).unreadTotal,
      readLegacy: async actor => (await readLegacyNotificationUnreadSummary({ client, workspaceId, actorId: actor.id })).unreadTotal,
      now: () => at,
    });
    let previous = 0, baseline = 0;
    for (const size of [100, 10_000]) {
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,target_id,source_type,source_id,payload,created_at,updated_at)
        select workspace_id,collection_name,'copy:'||n,user_id,target_id,source_type,source_id,payload || jsonb_build_object('id','copy:'||n),
          created_at,updated_at from orbit_records cross join generate_series($1::integer,$2::integer)n
        where collection_name='notifications' and record_id='seed'`, [previous + 1, size]);
      // Same-actor message growth in the message tables; the member row keeps the unread count.
      await writer.transaction(async (tx) => {
        await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
        await tx.query(`insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
          select workspace_id, conversation_id, seq + n, 'copy:'||n, sender_account_id, sender_display_name, body, sent_at, qualification_version, 'copy:'||n
          from relationship_messages cross join generate_series($1::integer,$2::integer) n where request_id='seed'`, [previous + 1, size]);
        await tx.query("update relationship_conversations set last_message_seq = $1 + 1", [size]);
        await tx.query("update relationship_conversation_members set unread_count = unread_count + $1 where account_id = 'recipient'", [size - previous]);
      });
      const actualMessages = Number((await pool.query("select count(*) from relationship_messages")).rows[0].count);
      assert.equal(actualMessages, size + 1, "fixture must contain nonempty same-actor growth");
      bytes = 0; queries = 0; rows = 0;
      const response = await handler();
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.data.messagesUnread, size + 1);
      assert.equal(body.data.notificationsUnread, size + 1);
      assert.doesNotMatch(JSON.stringify(body), /Private body|Private notification/);
      assert.ok(bytes < 8000, `complete request ${bytes} bytes exceeds cold budget`);
      baseline ||= bytes;
      assert.ok(bytes <= baseline * 1.1);
      console.info(JSON.stringify({ metric: "inbox_summary_request", recordsPerSource: size + 1, queries, rows, returnedJsonBytes: bytes, includes: "persisted identity + both readers", excludes: "Auth.js cookie CPU, PG wire/TLS" }));
      previous = size;
    }
    const before = await identity.readAccountSessionGraph({ userId: "profile" });
    // Imported avatars, documents and raw profile fields must not hitchhike on
    // every authenticated badge read. The public session projection is intact.
    await pool.query(`update orbit_records set payload=payload||jsonb_build_object('rawImportedDocument',repeat('x',2000000)),search_text=repeat('y',2000000)
      where collection_name in ('profiles','accounts')`);
    assert.deepEqual(await identity.readAccountSessionGraph({ userId: "profile" }), before);
    bytes = 0; queries = 0; rows = 0;
    assert.equal((await handler()).status, 200);
    assert.ok(bytes < 8000, `large unrelated profile fields escaped the identity projection: ${bytes}`);
    console.info(JSON.stringify({ metric: "inbox_summary_request_large_identity", extraStoredBytes: 8000000, queries, rows, returnedJsonBytes: bytes }));
  } finally { await pool.query(`drop schema ${schema} cascade`); await pool.end(); }
});
