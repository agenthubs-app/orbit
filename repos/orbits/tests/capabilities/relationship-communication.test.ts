import assert from "node:assert/strict";
import test from "node:test";

import {
  createRelationshipCommunicationService,
  RELATIONSHIP_COMMUNICATION_COLLECTIONS,
} from "../../features/relationship-communication/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:relationship-communication-test";
const CONTACT_ID = "contact:recipient";

function actor(accountId: string, email: string, displayName: string) {
  return { accountId, displayName, email };
}

function harness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  let nowIndex = 0;
  const timestamps = [
    "2026-09-14T10:00:00.000Z",
    "2026-09-14T10:01:00.000Z",
    "2026-09-14T10:02:00.000Z",
    "2026-09-14T10:03:00.000Z",
    "2026-09-14T10:04:00.000Z",
    "2026-09-14T10:05:00.000Z",
  ];
  const options = (currentActor: ReturnType<typeof actor>) => ({
    actor: currentActor,
    invitationBaseUrl: "https://orbit.example/invitations",
    now: () => timestamps[Math.min(nowIndex++, timestamps.length - 1)]!,
    randomToken: () => "test-token-with-enough-entropy-for-contract",
    resolveContact: async (contactId: string, accountId: string) =>
      contactId === CONTACT_ID && accountId === "account:sender"
        ? {
            contactId,
            displayName: "Receiver Contact",
            organization: "Orbit Test",
            recipientEmail: "receiver@example.test",
          }
        : null,
    store,
    workspaceId: WORKSPACE_ID,
  });

  return {
    recipient: createRelationshipCommunicationService(
      options(actor("account:recipient", "receiver@example.test", "Receiver")),
    ),
    sender: createRelationshipCommunicationService(
      options(actor("account:sender", "sender@example.test", "Sender")),
    ),
    stranger: createRelationshipCommunicationService(
      options(actor("account:stranger", "stranger@example.test", "Stranger")),
    ),
    store,
  };
}

test("verified invitation acceptance creates one versioned two-account conversation", async () => {
  const { recipient, sender } = harness();

  assert.equal((await sender.getEligibility(CONTACT_ID)).status, "unregistered");

  const invitation = await sender.createInvitation({
    contactId: CONTACT_ID,
    recipientEmail: "receiver@example.test",
    recipientName: "Receiver",
  });
  assert.equal(invitation.status, "pending");
  assert.match(invitation.invitationUrl, /test-token-with-enough-entropy/);
  assert.equal(invitation.externalSendRequested, false);
  assert.equal((await sender.getEligibility(CONTACT_ID)).status, "pending");

  const preview = await recipient.getInvitationPreview(invitation.token);
  assert.equal(preview.inviterDisplayName, "Sender");
  assert.equal(preview.recipientName, "Receiver");
  assert.equal(preview.status, "pending");
  assert.equal(preview.canAccept, true);

  const accepted = await recipient.acceptInvitation({
    confirmed: true,
    token: "test-token-with-enough-entropy-for-contract",
  });
  assert.equal(accepted.status, "confirmed");
  assert.ok(accepted.conversationId);
  assert.ok(accepted.qualificationVersion);

  const repeated = await recipient.acceptInvitation({
    confirmed: true,
    token: "test-token-with-enough-entropy-for-contract",
  });
  assert.equal(repeated.conversationId, accepted.conversationId);
  assert.equal(repeated.qualificationVersion, accepted.qualificationVersion);

  const senderEligibility = await sender.getEligibility(CONTACT_ID);
  assert.equal(senderEligibility.status, "confirmed");
  assert.equal(senderEligibility.conversationId, accepted.conversationId);
  assert.equal(senderEligibility.remoteAccount.displayName, "Receiver");
});

test("invitation acceptance requires the intended signed-in email and explicit confirmation", async () => {
  const { sender, stranger } = harness();
  const invitation = await sender.createInvitation({
    contactId: CONTACT_ID,
    recipientEmail: "receiver@example.test",
    recipientName: "Receiver",
  });

  await assert.rejects(
    stranger.getInvitationPreview(invitation.token),
    /intended account/i,
  );
  await assert.rejects(
    stranger.acceptInvitation({ confirmed: true, token: invitation.token }),
    /intended account/i,
  );
  await assert.rejects(
    stranger.acceptInvitation({ confirmed: false, token: invitation.token }),
    /confirmation/i,
  );
});

test("delivery receipt is shared, idempotent, participant-scoped, and rejects stale eligibility", async () => {
  const { recipient, sender, stranger } = harness();
  const invitation = await sender.createInvitation({
    contactId: CONTACT_ID,
    recipientEmail: "receiver@example.test",
    recipientName: "Receiver",
  });
  const accepted = await recipient.acceptInvitation({
    confirmed: true,
    token: invitation.token,
  });

  const first = await sender.sendMessage({
    body: "A real two-account message",
    conversationId: accepted.conversationId!,
    qualificationVersion: accepted.qualificationVersion!,
    requestId: "request:send-once",
  });
  const repeated = await sender.sendMessage({
    body: "A real two-account message",
    conversationId: accepted.conversationId!,
    qualificationVersion: accepted.qualificationVersion!,
    requestId: "request:send-once",
  });

  assert.equal(first.deliveryState, "delivered");
  assert.equal(repeated.message.messageId, first.message.messageId);
  assert.equal((await recipient.getConversation(accepted.conversationId!)).messages.length, 1);
  await assert.rejects(
    stranger.getConversation(accepted.conversationId!),
    /not available/i,
  );

  const revoked = await sender.revokeContactBinding(CONTACT_ID);
  assert.equal(revoked.status, "revoked");
  await assert.rejects(
    sender.sendMessage({
      body: "Must not be delivered",
      conversationId: accepted.conversationId!,
      qualificationVersion: accepted.qualificationVersion!,
      requestId: "request:after-revoke",
    }),
    /revoked|eligibility/i,
  );
  await assert.rejects(
    recipient.getConversation(accepted.conversationId!),
    /not available/i,
  );
});

test("recipient read state is durable and does not alter the sender unread count", async () => {
  const { recipient, sender } = harness();
  const invitation = await sender.createInvitation({
    contactId: CONTACT_ID,
    recipientEmail: "receiver@example.test",
    recipientName: "Receiver",
  });
  const accepted = await recipient.acceptInvitation({
    confirmed: true,
    token: invitation.token,
  });
  const delivered = await sender.sendMessage({
    body: "Read me",
    conversationId: accepted.conversationId!,
    qualificationVersion: accepted.qualificationVersion!,
    requestId: "request:read-state",
  });

  assert.equal((await recipient.listConversations()).conversations[0]?.unreadCount, 1);
  const read = await recipient.markConversationRead({
    conversationId: accepted.conversationId!,
    lastReadMessageId: delivered.message.messageId,
  });
  assert.equal(read.lastReadMessageId, delivered.message.messageId);
  assert.equal((await recipient.listConversations()).conversations[0]?.unreadCount, 0);
  assert.equal((await sender.listConversations()).conversations[0]?.unreadCount, 0);
});

test("an orphaned conversation cannot bypass the current binding after an acceptance race", async () => {
  const { recipient, sender, stranger, store } = harness();
  const invitation = await sender.createInvitation({
    contactId: CONTACT_ID,
    recipientEmail: "receiver@example.test",
    recipientName: "Receiver",
  });
  const accepted = await recipient.acceptInvitation({
    confirmed: true,
    token: invitation.token,
  });
  const bindingRecord = (
    await store.listRecords({
      collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings,
      workspaceId: WORKSPACE_ID,
    })
  )[0]!;
  const orphanConversationId = "relationship-conversation:orphaned-race";
  const timestamp = "2026-09-14T10:06:00.000Z";
  await store.upsertRecord({
    collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
    createdAt: timestamp,
    evidenceIds: ["evidence:orphaned-race"],
    lifecycleState: "active",
    occurredAt: timestamp,
    payload: {
      bindingId: bindingRecord.payload.bindingId,
      contactId: CONTACT_ID,
      conversationId: orphanConversationId,
      createdAt: timestamp,
      kind: "relationship_conversation",
      participantAccountIds: ["account:sender", "account:stranger"],
      participantDisplayNames: {
        "account:sender": "Sender",
        "account:stranger": "Stranger",
      },
      qualificationVersion: accepted.qualificationVersion,
      status: "active",
      updatedAt: timestamp,
    },
    provider: "orbit-relationship-communication",
    providerRecordId: orphanConversationId,
    recordId: orphanConversationId,
    searchText: orphanConversationId,
    sourceId: orphanConversationId,
    sourceLabel: "Orbit relationship communication",
    sourceType: "system",
    targetId: orphanConversationId,
    targetType: "conversation",
    updatedAt: timestamp,
    workspaceId: WORKSPACE_ID,
  });

  assert.equal((await stranger.listConversations()).conversations.length, 0);
  await assert.rejects(
    stranger.getConversation(orphanConversationId),
    /not available/i,
  );
  await assert.rejects(
    stranger.sendMessage({
      body: "Must not escape the authoritative binding",
      conversationId: orphanConversationId,
      qualificationVersion: accepted.qualificationVersion!,
      requestId: "request:orphaned-race",
    }),
    /not available|eligibility/i,
  );
});

test('conversation pages reject invalid limits and preserve an account-scoped unread total', async () => {
  const { sender, recipient } = harness();
  const invitation = await sender.createInvitation({ contactId: CONTACT_ID, recipientEmail: 'receiver@example.test', recipientName: 'Receiver' });
  const eligibility = await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
  await sender.sendMessage({ conversationId: eligibility.conversationId!, qualificationVersion: eligibility.qualificationVersion!, body: '页内原文', requestId: 'page-test-send' });
  const page = await recipient.listConversations({ limit: 1 } as never);
  assert.equal((page as any).unreadTotal, 1);
  assert.equal(page.conversations.length, 1);
  assert.equal((page as any).nextCursor, null);
  await assert.rejects(recipient.listConversations({ limit: 0 } as never));
  await assert.rejects(recipient.listConversations({ limit: 101 } as never));
  await assert.rejects(recipient.listConversations({ cursor: 'invalid-cursor' } as never));
});

test('conversation cursor pages use stable ties and cannot be reused by another account', async () => {
  const { sender, recipient, store } = harness();
  const invitation = await sender.createInvitation({ contactId: CONTACT_ID, recipientEmail: 'receiver@example.test', recipientName: 'Receiver' });
  await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
  const original = (await store.listRecords({ workspaceId: WORKSPACE_ID, collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations }))[0]!;
  const binding = (await store.listRecords({ workspaceId: WORKSPACE_ID, collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings }))[0]!;
  for (const suffix of ['b', 'c']) {
    const id = String(original.payload.conversationId) + suffix;
    const bindingId = binding.recordId + suffix;
    await store.upsertRecord({ ...binding, recordId: bindingId, payload: { ...binding.payload, bindingId, conversationId: id } });
    await store.upsertRecord({ ...original, recordId: id, payload: { ...original.payload, conversationId: id, bindingId } });
  }
  const seen: string[] = []; let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const page = await recipient.listConversations({ limit: 1, ...(cursor ? { cursor } : {}) });
    seen.push(...page.conversations.map(item => item.conversationId));
    if (page.nextCursor) await assert.rejects(sender.listConversations({ cursor: page.nextCursor }), /cursor/);
    cursor = page.nextCursor ?? undefined;
  }
  assert.equal(new Set(seen).size, 3); assert.equal(cursor, undefined);
});
