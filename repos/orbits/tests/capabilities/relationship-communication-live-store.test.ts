import assert from "node:assert/strict";
import test from "node:test";

import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const config = resolveLiveDatabaseConnectionConfig();

test("two accounts persist, reopen, read, and revoke one shared relationship conversation", { skip: !config }, async () => {
  assert.ok(config);
  const workspaceId = `workspace:e-line-0008:${Date.now()}`;
  const firstClient = createPgLiveRecordSqlClient({ connectionString: config.connectionString, max: 1 });
  const firstStore = createPostgresLiveRecordStore<Record<string, unknown>>({ client: firstClient });
  const contactId = "contact:e-line-recipient";
  const options = (actor: { accountId: string; displayName: string; email: string }, store = firstStore) => ({
    actor,
    invitationBaseUrl: "https://orbit.example/app/invitations",
    resolveContact: async (requestedContactId: string, accountId: string) => requestedContactId === contactId && accountId === "account:e-line-sender" ? {
      contactId,
      displayName: "E Line Recipient",
      organization: "Orbit QA",
      recipientEmail: "e-line-recipient@orbit.test",
    } : null,
    store,
    workspaceId,
  });

  try {
    const sender = createRelationshipCommunicationService(options({ accountId: "account:e-line-sender", displayName: "E Line Sender", email: "e-line-sender@orbit.test" }));
    const recipient = createRelationshipCommunicationService(options({ accountId: "account:e-line-recipient", displayName: "E Line Recipient", email: "e-line-recipient@orbit.test" }));
    const stranger = createRelationshipCommunicationService(options({ accountId: "account:e-line-stranger", displayName: "E Line Stranger", email: "e-line-stranger@orbit.test" }));
    const invitation = await sender.createInvitation({ contactId, recipientEmail: "e-line-recipient@orbit.test", recipientName: "E Line Recipient" });
    assert.equal((await recipient.getInvitationPreview(invitation.token)).canAccept, true);
    await assert.rejects(stranger.getInvitationPreview(invitation.token), /intended account/i);
    const eligibility = await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
    const delivered = await sender.sendMessage({ body: "E-line live delivery", conversationId: eligibility.conversationId!, qualificationVersion: eligibility.qualificationVersion!, requestId: "e-line-live-once" });
    assert.equal(delivered.deliveryState, "delivered");
    assert.equal((await recipient.getConversation(eligibility.conversationId!)).messages[0]?.messageId, delivered.message.messageId);

    await firstClient.close();
    const reopenedClient = createPgLiveRecordSqlClient({ connectionString: config.connectionString, max: 1 });
    try {
      const reopenedStore = createPostgresLiveRecordStore<Record<string, unknown>>({ client: reopenedClient });
      const reopenedRecipient = createRelationshipCommunicationService(options({ accountId: "account:e-line-recipient", displayName: "E Line Recipient", email: "e-line-recipient@orbit.test" }, reopenedStore));
      const reopenedSender = createRelationshipCommunicationService(options({ accountId: "account:e-line-sender", displayName: "E Line Sender", email: "e-line-sender@orbit.test" }, reopenedStore));
      const reopened = await reopenedRecipient.getConversation(eligibility.conversationId!);
      assert.equal(reopened.messages[0]?.body, "E-line live delivery");
      assert.equal(reopened.unreadCount, 1);
      await reopenedRecipient.markConversationRead({ conversationId: reopened.conversationId, lastReadMessageId: delivered.message.messageId });
      assert.equal((await reopenedRecipient.getConversation(reopened.conversationId)).unreadCount, 0);
      await reopenedSender.revokeContactBinding(contactId);
      await assert.rejects(reopenedSender.sendMessage({ body: "must remain blocked", conversationId: reopened.conversationId, qualificationVersion: eligibility.qualificationVersion!, requestId: "e-line-after-revoke" }), /revoked|eligibility/i);
    } finally {
      await reopenedClient.query("delete from orbit_records where workspace_id = $1", [workspaceId]);
      await reopenedClient.close();
    }
  } catch (error) {
    await firstClient.query("delete from orbit_records where workspace_id = $1", [workspaceId]).catch(() => undefined);
    await firstClient.close().catch(() => undefined);
    throw error;
  }
});
