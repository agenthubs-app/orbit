import assert from "node:assert/strict";
import test from "node:test";

import { createLiveChatConversationMessageService } from "../../features/chat/live-service";
import {
  createChatConversationMessageService,
  resolveChatConversationMessageService,
} from "../../features/chat/service-factory";
import { createStorageChatConversationMessageProvider } from "../../features/chat/storage/chat-conversation-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live chat conversation service reads and records generated messages without external transport", async () => {
  const workspaceId = "workspace:chat-conversation-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveChatConversationMessageService({
    provider: createStorageChatConversationMessageProvider({
      sourceLabel: "Chat conversation memory live storage",
      store,
      workspaceId,
    }),
  });

  const listed = await service.listConversations();

  assert.equal(listed.success, true);
  assert.equal(listed.data.state, "success");
  assert.equal(
    listed.data.conversations.length,
    defaultMockFixtures.conversations.length,
  );
  assert.equal(
    listed.data.provenance.source,
    `live-record-store:chat-conversation-message:${workspaceId}`,
  );
  assert.equal(
    listed.data.provenance.sourceLabel,
    "Chat conversation memory live storage",
  );
  assert.equal(listed.data.provenance.privacy, "live-chat-conversation-preview");
  assert.equal(listed.data.provenance.generationMethod, "live-store-query");
  assert.equal(listed.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(listed.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(listed.data.provenance.realtimeTransportRequested, false);
  assert.equal(listed.data.provenance.websocketSubscriptionRequested, false);
  assert.equal(
    listed.data.provenance.productionMessageStorageRequested,
    false,
  );
  assert.equal(listed.data.provenance.externalNetworkRequested, false);
  assert.equal(listed.data.provenance.aiProviderRequested, false);
  assert.equal(listed.data.provenance.emailProviderRequested, false);
  assert.equal(listed.data.provenance.calendarProviderRequested, false);
  assert.equal(listed.data.provenance.notificationDelivered, false);
  assert.equal(listed.data.provenance.deviceRequested, false);

  const firstConversation = listed.data.conversations[0];
  const fixtureConversation = defaultMockFixtures.conversations.find(
    (conversation) => conversation.id === firstConversation?.conversationId,
  );
  const fixtureContact = defaultMockFixtures.contacts.find(
    (contact) =>
      contact.id === fixtureConversation?.participantContactIds[0],
  );
  const fixtureMessages = defaultMockFixtures.messages
    .filter(
      (message) =>
        message.conversationId === firstConversation?.conversationId,
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  assert.ok(fixtureConversation);
  assert.ok(fixtureContact);
  assert.equal(
    firstConversation?.participantContactId,
    fixtureConversation.participantContactIds[0],
  );
  assert.equal(firstConversation?.participantName, fixtureContact.displayName);
  assert.equal(firstConversation?.organization, fixtureContact.organization);
  assert.equal(firstConversation?.source.generatedBy, "live-store-query");
  assert.equal(firstConversation?.liveDatabaseReadExecuted, true);
  assert.equal(firstConversation?.liveDatabaseWriteExecuted, false);
  assert.equal(firstConversation?.realtimeTransportRequested, false);
  assert.equal(firstConversation?.websocketSubscriptionRequested, false);
  assert.equal(firstConversation?.productionMessageStorageRequested, false);

  const thread = await service.getMessageThread({
    conversationId: firstConversation?.conversationId,
  });

  assert.equal(thread.success, true);
  assert.equal(
    thread.data.conversation.conversationId,
    firstConversation?.conversationId,
  );
  assert.equal(thread.data.messages.length, fixtureMessages.length);
  assert.equal(thread.data.messages[0]?.messageId, fixtureMessages[0]?.id);
  assert.equal(thread.data.messages[0]?.body, fixtureMessages[0]?.body);
  assert.match(thread.data.messages[0]?.body ?? "", /[\u3400-\u9fff]/u);
  assert.equal(thread.data.messages[0]?.senderRole, "orbit_user");
  assert.equal(thread.data.messages[0]?.deliveryState, "mock_recorded_locally");
  assert.equal(thread.data.messages[0]?.source.generatedBy, "live-store-query");
  assert.equal(thread.data.messages[0]?.liveDatabaseReadExecuted, true);
  assert.equal(thread.data.messages[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(thread.data.provenance.generationMethod, "live-store-query");
  assert.equal(thread.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(thread.data.provenance.liveDatabaseWriteExecuted, false);

  const sent = await service.sendMessage({
    body: "Live storage note for source-evidence review.",
    conversationId: firstConversation?.conversationId,
  });

  assert.equal(sent.success, true);
  assert.equal(sent.data.conversationId, firstConversation?.conversationId);
  assert.equal(sent.data.message.body, "Live storage note for source-evidence review.");
  assert.equal(sent.data.message.senderRole, "orbit_user");
  assert.equal(sent.data.message.deliveryState, "mock_recorded_locally");
  assert.equal(sent.data.message.liveDatabaseReadExecuted, true);
  assert.equal(sent.data.message.liveDatabaseWriteExecuted, true);
  assert.equal(sent.data.provenance.generationMethod, "live-store-send");
  assert.equal(sent.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(sent.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(sent.data.provenance.realtimeTransportRequested, false);
  assert.equal(sent.data.provenance.websocketSubscriptionRequested, false);
  assert.equal(
    sent.data.provenance.productionMessageStorageRequested,
    false,
  );
  assert.equal(sent.data.provenance.externalNetworkRequested, false);
  assert.equal(sent.data.provenance.aiProviderRequested, false);
  assert.equal(sent.data.provenance.notificationDelivered, false);
  assert.equal(sent.data.messages.length, fixtureMessages.length + 1);

  const savedMessage = store.getRecord({
    collectionName: "messages",
    recordId: sent.data.message.messageId,
    workspaceId,
  });

  assert.equal(savedMessage?.payload.body, "Live storage note for source-evidence review.");
  assert.equal(savedMessage?.payload.direction, "outbound");
  assert.equal(savedMessage?.targetType, "message");
  assert.equal(savedMessage?.targetId, sent.data.message.messageId);

  const reread = await service.getMessageThread({
    conversationId: firstConversation?.conversationId,
  });

  assert.equal(reread.success, true);
  assert.equal(reread.data.messages.at(-1)?.messageId, sent.data.message.messageId);
  assert.equal(reread.data.messages.at(-1)?.liveDatabaseWriteExecuted, false);

  const missingId = await service.getMessageThread({});
  const missingBody = await service.sendMessage({
    body: " ",
    conversationId: firstConversation?.conversationId,
  });
  const missingConversation = await service.sendMessage({
    body: "Hi",
    conversationId: "missing-conversation",
  });
  const unconfigured = await createLiveChatConversationMessageService({
    provider: null,
  }).listConversations();

  assert.equal(missingId.success, false);
  assert.equal(missingId.error.code, "CHAT_CONVERSATION_ID_REQUIRED");
  assert.equal(missingBody.success, false);
  assert.equal(missingBody.error.code, "CHAT_MESSAGE_BODY_REQUIRED");
  assert.equal(missingConversation.success, false);
  assert.equal(missingConversation.error.code, "CHAT_CONVERSATION_NOT_FOUND");
  assert.equal(unconfigured.success, false);
  assert.equal(
    unconfigured.error.code,
    "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
  );
  assert.equal(
    unconfigured.error.provenance.liveDatabaseReadExecuted,
    false,
  );
});

test("chat conversation factory registers live mode and fails closed without database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const resolution = resolveChatConversationMessageService("live");
    const service = createChatConversationMessageService("live");
    const result = await service.listConversations();

    assert.equal(resolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
      assert.equal(result.error.provenance.liveDatabaseWriteExecuted, false);
    }
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.ORBIT_DATABASE_URL;
    } else {
      process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
    }

    if (previousEventDatabaseUrl === undefined) {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
    } else {
      process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    }

    if (previousLiveDatabaseUrl === undefined) {
      delete process.env.ORBIT_LIVE_DATABASE_URL;
    } else {
      process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    }
  }
});
