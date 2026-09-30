import assert from "node:assert/strict";
import test from "node:test";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import { connect, createRelationshipHarness, relationshipPostgresSkip } from "../support/relationship-message-harness";
import { createReadCostLedger } from "./read-cost-ledger";

// Sprint 0109: the badge sums the caller's own member rows; other accounts'
// conversations and message bodies never leave PostgreSQL, however many there are.
test("message badge is one narrow SQL result over the caller's member rows and follows reads and revocation", {
  skip: relationshipPostgresSkip, timeout: 60_000,
}, async (t) => {
  const ledger = createReadCostLedger();
  const h = await createRelationshipHarness({ prefix: "unread_cost", workspaceId: "workspace:unread-test", readMetrics: { observer: ledger.observer } });
  t.after(() => h.close());
  const person = (id: string) => ({ accountId: id, displayName: id, email: `${id}@example.test` });
  const summary = (actorId: string, scope = h.workspaceId) => readRelationshipUnreadSummary({ client: h.client, workspaceId: scope, actorId });
  const binding = await connect(h, person("sender"), person("recipient"), "contact:one");
  const sender = h.service(person("sender")), recipient = h.service(person("recipient"));
  for (let index = 0; index < 4; index++) {
    await sender.sendMessage({ conversationId: binding.conversationId, qualificationVersion: binding.qualificationVersion, requestId: `send:${index}`, body: "Private message ".repeat(300) });
  }
  const before = await ledger.measure("badge.before", () => summary("recipient"));
  assert.equal(before.result.unreadTotal, 4);
  assert.equal(before.result.actorId, "recipient");
  assert.equal(before.cost.queries, 1);
  assert.equal(before.cost.rows, 1);
  assert.ok(before.cost.bytes < 100);
  assert.equal((await summary("stranger")).unreadTotal, 0);
  assert.equal((await summary("recipient", "another-workspace")).unreadTotal, 0);
  await recipient.sendMessage({ conversationId: binding.conversationId, qualificationVersion: binding.qualificationVersion, requestId: "own", body: "Self message" });
  assert.equal((await summary("recipient")).unreadTotal, 0, "replying reads up to the reply (message plan step 6)");
  await sender.sendMessage({ conversationId: binding.conversationId, qualificationVersion: binding.qualificationVersion, requestId: "send:4", body: "One more" });
  const conversation = await recipient.getConversation(binding.conversationId);
  await recipient.markConversationRead({ conversationId: binding.conversationId, lastReadMessageId: conversation.messages[1]!.messageId });
  assert.equal((await summary("recipient")).unreadTotal, (await recipient.getConversation(binding.conversationId)).unreadCount);
  assert.equal((await summary("recipient")).unreadTotal, 3, "messages 3, 4 and 6 from the sender are after the marker");
  await recipient.markConversationRead({ conversationId: binding.conversationId, lastReadMessageId: conversation.messages.at(-1)!.messageId });
  assert.equal((await summary("recipient")).unreadTotal, 0);

  // 1000 conversations of other accounts, each with unread messages for their members.
  await h.client.transaction(async (tx) => {
    await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
    await tx.query(`insert into relationship_conversations (workspace_id, conversation_id, inviter_account_id, invitee_account_id, inviter_contact_id, status, qualification_version, last_message_seq, last_message_at, created_at, updated_at)
      select $1, 'foreign:'||n, 'stranger:'||n, 'other:'||n, 'c', 'active', 'q', 1, now(), now(), now() from generate_series(1,1000) n`, [h.workspaceId]);
    await tx.query(`insert into relationship_conversation_members (workspace_id, conversation_id, account_id, display_name, unread_count, last_message_at, updated_at)
      select $1, 'foreign:'||n, a, a, 7, now(), now() from generate_series(1,1000) n, lateral (values ('stranger:'||n), ('other:'||n)) v(a)`, [h.workspaceId]);
    await tx.query(`insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
      select $1, 'foreign:'||n, 1, 'foreign-message:'||n, 'stranger:'||n, 's', repeat('x',10000), now(), 'q', 'r' from generate_series(1,1000) n`, [h.workspaceId]);
  });
  const after = await ledger.measure("badge.foreign-growth", () => summary("recipient"));
  assert.equal(after.result.unreadTotal, 0);
  assert.equal(after.cost.queries, 1);
  assert.equal(after.cost.rows, 1);
  assert.ok(after.cost.bytes < 100, "No message body or other actor row leaves PostgreSQL");
  await h.client.query("analyze relationship_conversation_members; analyze relationship_conversations");
  const plan = (await h.client.query<{ "QUERY PLAN": string }>(`explain select coalesce(sum(me.unread_count),0) from relationship_conversation_members me
    join relationship_conversations c on c.workspace_id=me.workspace_id and c.conversation_id=me.conversation_id and c.status='active'
    where me.workspace_id='workspace:unread-test' and me.account_id='recipient' and me.state='active'`)).rows.map((row) => row["QUERY PLAN"]).join("\n");
  assert.match(plan, /relationship_members_inbox_idx/, plan);
  await sender.sendMessage({ conversationId: binding.conversationId, qualificationVersion: binding.qualificationVersion, requestId: "before-revoke", body: "Unread before revoke" });
  assert.equal((await summary("recipient")).unreadTotal, 1);
  await sender.revokeContactBinding("contact:one");
  assert.equal((await summary("sender")).unreadTotal, 0);
  assert.equal((await summary("recipient")).unreadTotal, 0);
});
