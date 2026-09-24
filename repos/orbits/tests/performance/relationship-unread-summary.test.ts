import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createReadCostLedger } from "./read-cost-ledger";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;

test("message badge is one narrow SQL result with binding, participant and read-pointer equivalence", {
  skip: !databaseUrl, timeout: 60_000,
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local PostgreSQL only");
  const schema = `unread_cost_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const ledger = createReadCostLedger();
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool, readMetrics: ledger.observer });
  const workspaceId = "workspace:unread-test";
  const store = createPostgresLiveRecordStore({ client });
  const service = (accountId: string) => createRelationshipCommunicationService({
    actor: { accountId, displayName: accountId, email: `${accountId}@example.test` },
    invitationBaseUrl: "https://example.test/invitations", workspaceId, store,
    now: () => "2026-09-25T00:00:00.000Z",
    resolveContact: async contactId => ({ contactId, displayName: "Recipient", organization: "Test" }),
  });
  const summary = (actorId: string, scope = workspaceId) => readRelationshipUnreadSummary({ client, workspaceId: scope, actorId });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const sender = service("sender"), recipient = service("recipient");
    const invitation = await sender.createInvitation({ contactId: "contact:one", recipientName: "Recipient", recipientEmail: "recipient@example.test" });
    const binding = await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
    const conversationId = binding.conversationId!;
    for (let index = 0; index < 4; index++) {
      await sender.sendMessage({ conversationId, qualificationVersion: binding.qualificationVersion!, requestId: `send:${index}`, body: "Private message ".repeat(300) });
    }
    await recipient.sendMessage({ conversationId, qualificationVersion: binding.qualificationVersion!, requestId: "own", body: "Self message" });
    const before = await ledger.measure("badge.before", () => summary("recipient"));
    assert.equal(before.result.unreadTotal, 4);
    assert.equal(before.result.actorId, "recipient");
    assert.equal(before.cost.queries, 1);
    assert.equal(before.cost.rows, 1);
    assert.ok(before.cost.bytes < 100);
    assert.equal((await summary("stranger")).unreadTotal, 0);
    assert.equal((await summary("recipient", "another-workspace")).unreadTotal, 0);
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{participantAccountIds}','["sender","recipient","stranger"]') where workspace_id=$1 and record_id=$2`, [workspaceId,conversationId]);
    assert.equal((await summary("stranger")).unreadTotal,0,"An extra participant cannot widen a bilateral binding");
    assert.equal((await summary("recipient")).unreadTotal,0);
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{participantAccountIds}','["sender","recipient"]') where workspace_id=$1 and record_id=$2`, [workspaceId,conversationId]);
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{qualificationVersion}','"stale"') where workspace_id=$1 and record_id=$2`, [workspaceId,conversationId]);
    assert.equal((await summary("recipient")).unreadTotal,0,"Binding and conversation qualifications must agree");
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{qualificationVersion}',$3::jsonb) where workspace_id=$1 and record_id=$2`, [workspaceId,conversationId,JSON.stringify(binding.qualificationVersion)]);
    const conversation = await recipient.getConversation(conversationId);
    await recipient.markConversationRead({ conversationId, lastReadMessageId: conversation.messages[1]!.messageId });
    assert.equal((await summary("recipient")).unreadTotal, (await recipient.getConversation(conversationId)).unreadCount);
    // Unknown pointers must match the existing service: all incoming messages unread.
    await client.query(`update orbit_records set payload=jsonb_set(payload,'{lastReadMessageId}','"missing"') where collection_name='relationship_communication_reads'`);
    assert.equal((await summary("recipient")).unreadTotal, 4);
    // Histories with the same timestamp are ordered by messageId, not readAt.
    await recipient.markConversationRead({ conversationId, lastReadMessageId: conversation.messages.at(-1)!.messageId });
    assert.equal((await summary("recipient")).unreadTotal, 0);
    await client.query(`insert into orbit_records (workspace_id,collection_name,record_id,target_id,source_type,source_id,payload,created_at,updated_at)
      select $1,'relationship_communication_messages','foreign:'||n,'foreign-thread','system','test',
      jsonb_build_object('kind','relationship_message','messageId','foreign:'||n,'conversationId','foreign-thread','senderAccountId','stranger','sentAt','2026-09-25T00:00:00.000Z','body',repeat('x',10000)),now(),now()
      from generate_series(1,1000) n`, [workspaceId]);
    const after = await ledger.measure("badge.foreign-growth", () => summary("recipient"));
    assert.equal(after.result.unreadTotal, 0);
    assert.equal(after.cost.queries, 1);
    assert.equal(after.cost.rows, 1);
    assert.ok(after.cost.bytes < 100, "No message body or other actor payload leaves PostgreSQL");
    await sender.revokeContactBinding("contact:one");
    assert.equal((await summary("sender")).unreadTotal, 0);
    assert.equal((await summary("recipient")).unreadTotal, 0);
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
