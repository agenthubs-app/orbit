import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { createRelationshipMessageStore } from "../../features/relationship-communication/message-store";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createRelationshipHarness, relationshipPostgresSkip, relationshipTestDatabaseUrl } from "../support/relationship-message-harness";

// Sprint 0109: runs on the explicit local test database (private schema) and
// never on the configured application database. "Reopen" is a second pool on
// the same schema, so nothing is served from the first connection's state.
test("two accounts persist, reopen, read, and revoke one shared relationship conversation", { skip: relationshipPostgresSkip, timeout: 60_000 }, async (t) => {
  const contactId = "contact:e-line-recipient";
  const resolveContact = async (requestedContactId: string, accountId: string) => requestedContactId === contactId && accountId === "account:e-line-sender" ? {
    contactId,
    displayName: "E Line Recipient",
    organization: "Orbit QA",
    recipientEmail: "e-line-recipient@orbit.test",
  } : null;
  const h = await createRelationshipHarness({ prefix: "rel_live_store", resolveContact });
  t.after(() => h.close());
  const sender = h.service({ accountId: "account:e-line-sender", displayName: "E Line Sender", email: "e-line-sender@orbit.test" });
  const recipient = h.service({ accountId: "account:e-line-recipient", displayName: "E Line Recipient", email: "e-line-recipient@orbit.test" });
  const stranger = h.service({ accountId: "account:e-line-stranger", displayName: "E Line Stranger", email: "e-line-stranger@orbit.test" });
  const invitation = await sender.createInvitation({ contactId, recipientEmail: "e-line-recipient@orbit.test", recipientName: "E Line Recipient" });
  assert.equal((await recipient.getInvitationPreview(invitation.token)).canAccept, true);
  await assert.rejects(stranger.getInvitationPreview(invitation.token), /intended account/i);
  const eligibility = await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
  const delivered = await sender.sendMessage({ body: "E-line live delivery", conversationId: eligibility.conversationId!, qualificationVersion: eligibility.qualificationVersion!, requestId: "e-line-live-once" });
  assert.equal(delivered.deliveryState, "delivered");
  assert.equal((await recipient.getConversation(eligibility.conversationId!)).messages[0]?.messageId, delivered.message.messageId);

  const pool = new Pool({ connectionString: relationshipTestDatabaseUrl, max: 2, options: `-c search_path=${h.schema}` });
  const reopenedClient = createTransactionalPostgresClient({ connectionString: relationshipTestDatabaseUrl!, pool });
  try {
    const reopened = (accountId: string, displayName: string, email: string) => createRelationshipCommunicationService({
      actor: { accountId, displayName, email }, invitationBaseUrl: "https://orbit.example/app/invitations", resolveContact, workspaceId: h.workspaceId,
      store: createPostgresLiveRecordStore<Record<string, unknown>>({ client: reopenedClient }),
      messages: createRelationshipMessageStore({ client: reopenedClient, workspaceId: h.workspaceId }),
    });
    const reopenedRecipient = reopened("account:e-line-recipient", "E Line Recipient", "e-line-recipient@orbit.test");
    const reopenedSender = reopened("account:e-line-sender", "E Line Sender", "e-line-sender@orbit.test");
    const conversation = await reopenedRecipient.getConversation(eligibility.conversationId!);
    assert.equal(conversation.messages[0]?.body, "E-line live delivery");
    assert.equal(conversation.unreadCount, 1);
    await reopenedRecipient.markConversationRead({ conversationId: conversation.conversationId, lastReadMessageId: delivered.message.messageId });
    assert.equal((await reopenedRecipient.getConversation(conversation.conversationId)).unreadCount, 0);
    await reopenedSender.revokeContactBinding(contactId);
    await assert.rejects(reopenedSender.sendMessage({ body: "must remain blocked", conversationId: conversation.conversationId, qualificationVersion: eligibility.qualificationVersion!, requestId: "e-line-after-revoke" }), /revoked|eligibility/i);
  } finally {
    await reopenedClient.close();
  }
});
