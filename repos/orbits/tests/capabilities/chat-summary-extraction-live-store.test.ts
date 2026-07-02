import assert from "node:assert/strict";
import test from "node:test";

import { createLiveChatSummaryExtractionService } from "../../features/chat/live-summary-service";
import {
  createChatSummaryExtractionService,
  resolveChatSummaryExtractionService,
} from "../../features/chat/service-factory";
import { createStorageChatSummaryExtractionProvider } from "../../features/chat/storage/chat-summary-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live chat summary extraction reads generated chat graph without AI or profile writes", async () => {
  const workspaceId = "workspace:chat-summary-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveChatSummaryExtractionService({
    provider: createStorageChatSummaryExtractionProvider({
      sourceLabel: "Chat summary memory live storage",
      store,
      workspaceId,
    }),
  });

  const summary = await service.summarizeConversation({
    conversationId: "conversation_001",
  });

  assert.equal(summary.success, true);
  assert.equal(summary.data.state, "success");
  assert.equal(summary.data.conversationId, "conversation_001");
  assert.equal(summary.data.participantName, "山田 千尋");
  assert.equal(summary.data.organization, "Morning Light Foods");
  assert.match(summary.data.summary?.narrative ?? "", /14 source-backed messages/);
  assert.match(
    summary.data.summary?.narrative ?? "",
    /AI workflow PoC buyer in Japanese SMB manufacturing/,
  );
  assert.equal(summary.data.summary?.source.generatedBy, "live-store-query");
  assert.equal(summary.data.summary?.generatedBy, "live-store-query");
  assert.equal(summary.data.summary?.generationMethod, "live-store-summary");
  assert.equal(summary.data.summary?.aiProviderRequested, false);
  assert.equal(summary.data.summary?.liveDatabaseReadExecuted, true);
  assert.equal(summary.data.summary?.liveDatabaseWriteExecuted, false);
  assert.equal(summary.data.summary?.automaticProfileMutationExecuted, false);
  assert.equal(summary.data.extractedNeeds[0]?.contactId, "contact_012");
  assert.equal(summary.data.extractedNeeds[0]?.priority, "high");
  assert.equal(summary.data.extractedNeeds[0]?.generatedBy, "live-store-query");
  assert.equal(summary.data.extractedTasks[0]?.title, "Review live chat follow-up for 山田 千尋");
  assert.equal(summary.data.extractedTasks[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(
    summary.data.relationshipProfileUpdates[0]?.connectionId,
    "connection_0001",
  );
  assert.equal(
    summary.data.confirmationRequiredProfileSuggestions[0]?.confirmationRequired,
    true,
  );
  assert.equal(
    summary.data.provenance.source,
    `live-record-store:chat-summary-extraction:${workspaceId}`,
  );
  assert.equal(summary.data.provenance.sourceLabel, "Chat summary memory live storage");
  assert.equal(summary.data.provenance.privacy, "live-chat-summary-extraction-preview");
  assert.equal(summary.data.provenance.generationMethod, "live-store-summary");
  assert.equal(summary.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(summary.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(summary.data.provenance.aiProviderRequested, false);
  assert.equal(summary.data.provenance.externalNetworkRequested, false);
  assert.equal(summary.data.provenance.emailProviderRequested, false);
  assert.equal(summary.data.provenance.calendarProviderRequested, false);
  assert.equal(summary.data.provenance.notificationDelivered, false);
  assert.equal(summary.data.provenance.deviceRequested, false);
  assert.equal(summary.data.provenance.automaticProfileMutationExecuted, false);

  const extraction = await service.extractConversationSignals({
    conversationId: "conversation_001",
  });

  assert.equal(extraction.success, true);
  assert.equal(extraction.data.provenance.generationMethod, "live-store-extraction");
  assert.equal(extraction.data.summary?.generationMethod, "live-store-extraction");
  assert.equal(extraction.data.extractedNeeds.length, 1);
  assert.equal(extraction.data.extractedTasks.length, 1);
  assert.equal(extraction.data.relationshipProfileUpdates.length, 1);
  assert.equal(extraction.data.confirmationRequiredProfileSuggestions.length, 1);
  assert.equal(extraction.data.extractedTasks[0]?.notificationDelivered, false);
  assert.equal(
    extraction.data.relationshipProfileUpdates[0]?.automaticProfileMutationExecuted,
    false,
  );

  const empty = await service.summarizeConversation({
    conversationId: "conversation_001",
    scenario: "empty",
  });
  const pending = await service.extractConversationSignals({
    conversationId: "conversation_001",
    scenario: "pending",
  });
  const missingId = await service.summarizeConversation({});
  const missingConversation = await service.extractConversationSignals({
    conversationId: "missing-conversation",
  });
  const unconfigured = await createLiveChatSummaryExtractionService({
    provider: null,
  }).summarizeConversation({
    conversationId: "conversation_001",
  });

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.summary, null);
  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.extractedNeeds.length, 0);
  assert.equal(missingId.success, false);
  assert.equal(missingId.error.code, "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED");
  assert.equal(missingConversation.success, false);
  assert.equal(
    missingConversation.error.code,
    "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
  );
  assert.equal(unconfigured.success, false);
  assert.equal(unconfigured.error.code, "CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED");
  assert.equal(unconfigured.error.provenance.liveDatabaseReadExecuted, false);
});

test("chat summary extraction factory registers live mode and fails closed without database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const resolution = resolveChatSummaryExtractionService("live");
    const service = createChatSummaryExtractionService("live");
    const result = await service.summarizeConversation({
      conversationId: "conversation_001",
    });

    assert.equal(resolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.code, "CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED");
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
