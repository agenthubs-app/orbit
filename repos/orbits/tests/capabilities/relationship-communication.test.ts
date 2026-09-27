import assert from "node:assert/strict";
import test, { after } from "node:test";

import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import { createRelationshipHarness, relationshipPostgresSkip as skip, type RelationshipHarness } from "../support/relationship-message-harness";

// Sprint 0109: conversations, members and messages live in dedicated Postgres
// tables, so this capability contract runs against real PostgreSQL (one private
// schema per harness) instead of the in-memory record store.
const CONTACT_ID = "contact:recipient";
const harnesses: RelationshipHarness[] = [];
after(async () => { for (const h of harnesses) await h.close(); });

function actor(accountId: string, email: string, displayName: string) {
  return { accountId, displayName, email };
}

async function harness() {
  const h = await createRelationshipHarness({ prefix: "rel_capability" });
  harnesses.push(h);
  let nowIndex = 0;
  const timestamps = [
    "2026-09-14T10:00:00.000Z",
    "2026-09-14T10:01:00.000Z",
    "2026-09-14T10:02:00.000Z",
    "2026-09-14T10:03:00.000Z",
    "2026-09-14T10:04:00.000Z",
    "2026-09-14T10:05:00.000Z",
  ];
  const options = {
    now: () => timestamps[Math.min(nowIndex++, timestamps.length - 1)]!,
    randomToken: () => "test-token-with-enough-entropy-for-contract",
    resolveContact: async (contactId: string, accountId: string) =>
      contactId.startsWith(CONTACT_ID) && accountId === "account:sender"
        ? {
            contactId,
            displayName: "Receiver Contact",
            organization: "Orbit Test",
            recipientEmail: "receiver@example.test",
          }
        : null,
  };

  return {
    recipient: h.service(actor("account:recipient", "receiver@example.test", "Receiver"), options),
    sender: h.service(actor("account:sender", "sender@example.test", "Sender"), options),
    stranger: h.service(actor("account:stranger", "stranger@example.test", "Stranger"), options),
    h,
  };
}

test("verified invitation acceptance creates one versioned two-account conversation", { skip, timeout: 60_000 }, async () => {
  const { recipient, sender } = await harness();

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

test("invitation acceptance requires the intended signed-in email and explicit confirmation", { skip, timeout: 60_000 }, async () => {
  const { sender, stranger } = await harness();
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

test("delivery receipt is shared, idempotent, participant-scoped, and rejects stale eligibility", { skip, timeout: 60_000 }, async () => {
  const { recipient, sender, stranger } = await harness();
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

test("recipient read state is durable and does not alter the sender unread count", { skip, timeout: 60_000 }, async () => {
  const { recipient, sender } = await harness();
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

test("a conversation row without member rows cannot be read or written by the account it names", { skip, timeout: 60_000 }, async () => {
  const { recipient, sender, stranger, h } = await harness();
  const invitation = await sender.createInvitation({
    contactId: CONTACT_ID,
    recipientEmail: "receiver@example.test",
    recipientName: "Receiver",
  });
  const accepted = await recipient.acceptInvitation({
    confirmed: true,
    token: invitation.token,
  });
  // A forged conversation naming the stranger as invitee, but no membership:
  // access is decided by the caller's own member row, never by the conversation row.
  const orphanConversationId = "relationship-conversation:orphaned-race";
  await h.client.transaction(async (tx) => {
    await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
    await tx.query(
      `insert into relationship_conversations (workspace_id, conversation_id, inviter_account_id, invitee_account_id, inviter_contact_id,
         status, qualification_version, last_message_at, created_at, updated_at)
       values ($1, $2, 'account:sender', 'account:stranger', 'contact:orphan', 'active', $3, now(), now(), now())`,
      [h.workspaceId, orphanConversationId, accepted.qualificationVersion],
    );
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
  await assert.rejects(stranger.getConversation(accepted.conversationId!), /not available/i);
});

test('conversation pages reject invalid limits and preserve an account-scoped unread total', { skip, timeout: 60_000 }, async () => {
  const { sender, recipient } = await harness();
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

test('conversation cursor pages use stable ties and cannot be reused by another account', { skip, timeout: 60_000 }, async () => {
  const { h } = await harness();
  // Three conversations accepted at the same instant: ordering ties break on the conversation id.
  const at = () => "2026-09-14T10:00:00.000Z";
  const contact = async (contactId: string) => ({ contactId, displayName: "Receiver", organization: "Orbit Test", recipientEmail: "receiver@example.test" });
  const sender = h.service(actor("account:sender", "sender@example.test", "Sender"), { now: at, resolveContact: contact });
  const recipient = h.service(actor("account:recipient", "receiver@example.test", "Receiver"), { now: at, resolveContact: contact });
  for (const suffix of ["", "-b", "-c"]) {
    const invitation = await sender.createInvitation({ contactId: `${CONTACT_ID}${suffix}`, recipientEmail: 'receiver@example.test', recipientName: 'Receiver' });
    await recipient.acceptInvitation({ confirmed: true, token: invitation.token });
  }
  const seen: string[] = []; let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const page = await recipient.listConversations({ limit: 1, ...(cursor ? { cursor } : {}) });
    assert.equal(page.conversations[0]?.updatedAt, at());
    seen.push(...page.conversations.map(item => item.conversationId));
    if (page.nextCursor) await assert.rejects(sender.listConversations({ cursor: page.nextCursor }), /cursor/);
    cursor = page.nextCursor ?? undefined;
  }
  assert.equal(new Set(seen).size, 3); assert.equal(cursor, undefined);
  assert.deepEqual(seen, [...seen].sort(), "ties are ordered by conversation id");
});
