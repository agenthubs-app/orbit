import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipInvitationRequest,
  buildRelationshipMessageDeliveryRequest,
  relationshipDeliveryReceiptMatches,
} from "../src/api/contact-communication";
import {
  isRelationshipConversationList,
  isRelationshipEligibility,
  relationshipCommunicationEligibilityToView,
  relationshipCommunicationThreadToView,
} from "../src/view-models/contact-communication";

test("conversation list validation fails closed before account-specific rendering", () => {
  assert.equal(isRelationshipConversationList({ conversations: [], refreshedAt: "2026-09-14T12:00:00.000Z" }), true);
  assert.equal(isRelationshipConversationList({ conversations: [{ conversationId: "conversation:unsafe" }] }), false);
  assert.equal(isRelationshipConversationList(null), false);
});

test("eligibility validation rejects incomplete confirmed identities", () => {
  assert.equal(isRelationshipEligibility({ canInvite: true, canSend: false, contactId: "contact:1", status: "unregistered" }), true);
  assert.equal(isRelationshipEligibility({ canInvite: false, canSend: true, contactId: "contact:1", status: "confirmed" }), false);
  assert.equal(isRelationshipEligibility({ canInvite: false, canSend: true, contactId: "contact:1", conversationId: "conversation:1", qualificationVersion: "qv:1", remoteAccount: { accountId: "account:2", displayName: "Receiver" }, status: "confirmed" }), true);
});

test("eligibility view only enables delivery for a complete confirmed server binding", () => {
  const confirmed = relationshipCommunicationEligibilityToView({
    canInvite: false,
    canSend: true,
    contactId: "contact:receiver",
    conversationId: "conversation:verified",
    qualificationVersion: "qv:1",
    remoteAccount: { accountId: "account:receiver", displayName: "Receiver" },
    status: "confirmed",
  });
  assert.equal(confirmed.canSend, true);
  assert.equal(confirmed.statusLabel, "已验证，可聊天");

  for (const status of ["unregistered", "pending", "conflict", "revoked", "expired", "forbidden"]) {
    assert.equal(
      relationshipCommunicationEligibilityToView({
        canInvite: false,
        canSend: true,
        contactId: "contact:receiver",
        conversationId: "conversation:untrusted",
        qualificationVersion: "qv:untrusted",
        status,
      }).canSend,
      false,
    );
  }
});

test("invitation and message builders preserve the explicit no-auto-send boundary", () => {
  assert.deepEqual(
    buildRelationshipInvitationRequest({
      contactId: " contact:receiver ",
      recipientEmail: " receiver@example.test ",
      recipientName: " Receiver ",
    }),
    {
      request: {
        body: {
          contactId: "contact:receiver",
          recipientEmail: "receiver@example.test",
          recipientName: "Receiver",
        },
        endpoint: "/api/relationship-communication/invitations",
      },
      success: true,
    },
  );

  const delivery = buildRelationshipMessageDeliveryRequest({
    body: " Hello ",
    conversationId: " conversation:verified ",
    qualificationVersion: " qv:1 ",
    requestId: " request:1 ",
  });
  assert.equal(delivery.success, true);
  if (!delivery.success) return;
  assert.equal(
    delivery.request.endpoint,
    "/api/relationship-communication/conversations/conversation%3Averified/messages",
  );
  assert.equal(delivery.request.headers["Idempotency-Key"], "request:1");
  assert.deepEqual(delivery.request.body, {
    body: "Hello",
    qualificationVersion: "qv:1",
  });
});

test("delivery receipt must match the current actor, conversation, version, body, and delivered message", () => {
  const receipt = {
    conversationId: "conversation:verified",
    deliveryState: "delivered",
    qualificationVersion: "qv:1",
    message: {
      body: "Hello",
      conversationId: "conversation:verified",
      deliveryState: "delivered",
      messageId: "message:1",
      senderAccountId: "account:sender",
      senderDisplayName: "Sender",
      sentAt: "2026-09-14T12:00:00.000Z",
    },
  };
  assert.equal(
    relationshipDeliveryReceiptMatches(receipt, {
      body: "Hello",
      conversationId: "conversation:verified",
      qualificationVersion: "qv:1",
      senderAccountId: "account:sender",
    }),
    true,
  );
  assert.equal(
    relationshipDeliveryReceiptMatches(
      { ...receipt, qualificationVersion: "qv:old" },
      { body: "Hello", conversationId: "conversation:verified", qualificationVersion: "qv:1", senderAccountId: "account:sender" },
    ),
    false,
  );
  assert.equal(
    relationshipDeliveryReceiptMatches(
      { ...receipt, message: { ...receipt.message, senderAccountId: "account:other" } },
      { body: "Hello", conversationId: "conversation:verified", qualificationVersion: "qv:1", senderAccountId: "account:sender" },
    ),
    false,
  );
});

test("real conversation view identifies the current actor and unread state", () => {
  const view = relationshipCommunicationThreadToView(
    {
      contactId: "contact:receiver",
      conversationId: "conversation:verified",
      createdAt: "2026-09-14T12:00:00.000Z",
      messages: [
        {
          body: "Hello",
          conversationId: "conversation:verified",
          deliveryState: "delivered",
          messageId: "message:1",
          senderAccountId: "account:sender",
          senderDisplayName: "Sender",
          sentAt: "2026-09-14T12:01:00.000Z",
        },
      ],
      participantAccountIds: ["account:sender", "account:receiver"],
      participantDisplayNames: {
        "account:sender": "Sender",
        "account:receiver": "Receiver",
      },
      qualificationVersion: "qv:1",
      status: "active",
      unreadCount: 1,
      updatedAt: "2026-09-14T12:01:00.000Z",
    },
    "account:receiver",
  );
  assert.equal(view.messages[0]?.fromMe, false);
  assert.equal(view.canSend, true);
  assert.equal(view.qualificationVersion, "qv:1");
});
