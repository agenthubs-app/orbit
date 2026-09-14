import assert from "node:assert/strict";
import test from "node:test";

import {
  createConversationGetHandler,
  createConversationMessagesPostHandler,
  createEligibilityGetHandler,
  createInvitationGetHandler,
  createInvitationAcceptPostHandler,
  createInvitationsPostHandler,
} from "../../app/api/relationship-communication/handler";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const workspaceId = "workspace:relationship-route-test";

test("relationship communication routes expose authenticated invite, accept, and delivery receipts", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const sender = {
    accountId: "account:sender",
    email: "sender@example.test",
    id: "account:sender",
    name: "Sender",
    workspaceId,
  };
  const recipient = {
    accountId: "account:recipient",
    email: "receiver@example.test",
    id: "account:recipient",
    name: "Receiver",
    workspaceId,
  };
  const createService = (actor: typeof sender, invitationBaseUrl: string) =>
    createRelationshipCommunicationService({
      actor: {
        accountId: actor.id,
        displayName: actor.name,
        email: actor.email,
      },
      invitationBaseUrl,
      now: () => "2026-09-14T12:00:00.000Z",
      randomToken: () => "route-test-invitation-token",
      resolveContact: async (contactId, accountId) =>
        contactId === "contact:receiver" && accountId === sender.id
          ? {
              contactId,
              displayName: "Receiver",
              organization: "Orbit",
              recipientEmail: recipient.email,
            }
          : null,
      store,
      workspaceId,
    });

  const createInvitation = createInvitationsPostHandler({
    createService,
    resolveActor: async () => sender,
  });
  const invitationResponse = await createInvitation(
    new Request("https://orbit.example/api/relationship-communication/invitations", {
      body: JSON.stringify({
        contactId: "contact:receiver",
        recipientEmail: recipient.email,
        recipientName: "Receiver",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const invitationBody = await invitationResponse.json();
  assert.equal(invitationResponse.status, 201);
  assert.equal(invitationBody.success, true);
  assert.equal(invitationBody.data.externalSendRequested, false);
  assert.match(invitationBody.data.invitationUrl, /^https:\/\/orbit\.example\/app\/invitations\//u);

  const previewInvitation = createInvitationGetHandler({
    createService,
    resolveActor: async () => recipient,
  });
  const previewResponse = await previewInvitation(
    new Request("https://orbit.example/api/relationship-communication/invitations/token"),
    { params: Promise.resolve({ token: invitationBody.data.token }) },
  );
  const previewBody = await previewResponse.json();
  assert.equal(previewResponse.status, 200);
  assert.equal(previewBody.data.canAccept, true);
  assert.equal(previewBody.data.inviterDisplayName, "Sender");

  const acceptInvitation = createInvitationAcceptPostHandler({
    createService,
    resolveActor: async () => recipient,
  });
  const acceptedResponse = await acceptInvitation(
    new Request("https://orbit.example/api/relationship-communication/invitations/token/accept", {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ token: invitationBody.data.token }) },
  );
  const acceptedBody = await acceptedResponse.json();
  assert.equal(acceptedResponse.status, 200);
  assert.equal(acceptedBody.data.status, "confirmed");

  const sendMessage = createConversationMessagesPostHandler({
    createService,
    resolveActor: async () => sender,
  });
  const sentResponse = await sendMessage(
    new Request("https://orbit.example/api/relationship-communication/conversations/id/messages", {
      body: JSON.stringify({
        body: "Delivered through the authenticated route",
        qualificationVersion: acceptedBody.data.qualificationVersion,
      }),
      headers: {
        "content-type": "application/json",
        "idempotency-key": "route-request-once",
      },
      method: "POST",
    }),
    { params: Promise.resolve({ id: acceptedBody.data.conversationId }) },
  );
  const sentBody = await sentResponse.json();
  assert.equal(sentResponse.status, 201);
  assert.equal(sentBody.data.deliveryState, "delivered");

  const readAsRecipient = createConversationGetHandler({
    createService,
    resolveActor: async () => recipient,
  });
  const threadResponse = await readAsRecipient(
    new Request("https://orbit.example/api/relationship-communication/conversations/id"),
    { params: Promise.resolve({ id: acceptedBody.data.conversationId }) },
  );
  const threadBody = await threadResponse.json();
  assert.equal(threadResponse.status, 200);
  assert.equal(threadBody.data.messages[0].messageId, sentBody.data.message.messageId);
});

test("relationship eligibility route rejects unauthenticated requests before service creation", async () => {
  let created = false;
  const handler = createEligibilityGetHandler({
    createService: () => {
      created = true;
      throw new Error("must not create");
    },
    resolveActor: async () => null,
  });
  const response = await handler(
    new Request("https://orbit.example/api/relationship-communication/eligibility?contactId=contact:receiver"),
  );
  assert.equal(response.status, 401);
  assert.equal(created, false);
});
