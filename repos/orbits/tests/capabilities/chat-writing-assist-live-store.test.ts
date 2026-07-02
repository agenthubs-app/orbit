import assert from "node:assert/strict";
import test from "node:test";

import { createLiveChatWritingAssistService } from "../../features/chat/live-assist-service";
import {
  createChatWritingAssistService,
  resolveChatWritingAssistService,
} from "../../features/chat/service-factory";
import { createStorageChatWritingAssistProvider } from "../../features/chat/storage/chat-writing-assist-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live chat writing assist drafts from generated chat graph without AI, send, or writes", async () => {
  const workspaceId = "workspace:chat-writing-assist-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveChatWritingAssistService({
    provider: createStorageChatWritingAssistProvider({
      sourceLabel: "Chat writing assist memory live storage",
      store,
      workspaceId,
    }),
  });

  const followup = await service.draftFollowup({
    conversationId: "conversation_001",
  });

  assert.equal(followup.success, true);
  assert.equal(followup.data.state, "success");
  assert.equal(followup.data.assists.length, 1);
  assert.equal(followup.data.assists[0]?.kind, "follow_up_draft");
  assert.equal(followup.data.assists[0]?.conversationId, "conversation_001");
  assert.equal(followup.data.assists[0]?.participantName, "山田 千尋");
  assert.equal(followup.data.assists[0]?.organization, "Morning Light Foods");
  assert.match(
    followup.data.assists[0]?.originalText ?? "",
    /AI workflow PoC buyer in Japanese SMB manufacturing/,
  );
  assert.match(followup.data.assists[0]?.suggestedText ?? "", /山田 千尋/);
  assert.match(
    followup.data.assists[0]?.suggestedText ?? "",
    /Morning Light Foods/,
  );
  assert.match(
    followup.data.assists[0]?.suggestedText ?? "",
    /AI workflow PoC buyer in Japanese SMB manufacturing/,
  );
  assert.equal(followup.data.assists[0]?.source.generatedBy, "live-store-query");
  assert.equal(followup.data.assists[0]?.generatedBy, "live-store-query");
  assert.equal(followup.data.assists[0]?.sendActionRequiresConfirmation, true);
  assert.equal(followup.data.assists[0]?.aiProviderRequested, false);
  assert.equal(followup.data.assists[0]?.externalSendRequested, false);
  assert.equal(followup.data.assists[0]?.externalNetworkRequested, false);
  assert.equal(followup.data.assists[0]?.emailProviderRequested, false);
  assert.equal(followup.data.assists[0]?.calendarProviderRequested, false);
  assert.equal(followup.data.assists[0]?.notificationDelivered, false);
  assert.equal(followup.data.assists[0]?.deviceRequested, false);
  assert.equal(followup.data.assists[0]?.liveDatabaseReadExecuted, true);
  assert.equal(followup.data.assists[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(
    followup.data.assists[0]?.productionMessageStorageRequested,
    false,
  );
  assert.equal(
    followup.data.assists[0]?.productionAuditLogWriteExecuted,
    false,
  );
  assert.equal(
    followup.data.provenance.source,
    `live-record-store:chat-writing-assist:${workspaceId}`,
  );
  assert.equal(
    followup.data.provenance.sourceLabel,
    "Chat writing assist memory live storage",
  );
  assert.equal(
    followup.data.provenance.privacy,
    "live-chat-writing-assist-preview",
  );
  assert.equal(
    followup.data.provenance.generationMethod,
    "rule-based-follow-up-draft",
  );
  assert.equal(followup.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(followup.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(followup.data.provenance.aiProviderRequested, false);
  assert.equal(followup.data.provenance.externalSendRequested, false);
  assert.equal(followup.data.provenance.externalNetworkRequested, false);

  const rewrite = await service.rewritePolitely({
    conversationId: "conversation_001",
    sourceText: "send me the AI workflow PoC buyer notes",
  });
  const appointment = await service.suggestAppointment({
    conversationId: "conversation_001",
    preferredWindow: "Thursday morning",
  });
  const greeting = await service.createQuickGreeting({
    conversationId: "conversation_001",
  });

  assert.equal(rewrite.success, true);
  assert.equal(rewrite.data.assists[0]?.kind, "polite_rewrite");
  assert.equal(
    rewrite.data.assists[0]?.originalText,
    "send me the AI workflow PoC buyer notes",
  );
  assert.match(rewrite.data.assists[0]?.suggestedText ?? "", /山田 千尋/);
  assert.match(
    rewrite.data.assists[0]?.suggestedText ?? "",
    /AI workflow PoC buyer/,
  );
  assert.equal(appointment.success, true);
  assert.equal(appointment.data.assists[0]?.kind, "appointment_suggestion");
  assert.match(
    appointment.data.assists[0]?.suggestedText ?? "",
    /Thursday morning/,
  );
  assert.equal(greeting.success, true);
  assert.equal(greeting.data.assists[0]?.kind, "quick_greeting");
  assert.match(greeting.data.assists[0]?.suggestedText ?? "", /山田 千尋/);

  const empty = await service.draftFollowup({
    conversationId: "conversation_001",
    scenario: "empty",
  });
  const pending = await service.rewritePolitely({
    conversationId: "conversation_001",
    scenario: "pending",
  });
  const missingContext = await service.draftFollowup({});
  const missingConversation = await service.draftFollowup({
    conversationId: "missing-conversation",
  });
  const unconfigured = await createLiveChatWritingAssistService({
    provider: null,
  }).draftFollowup({
    conversationId: "conversation_001",
  });

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.assists.length, 0);
  assert.equal(empty.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.assists.length, 0);
  assert.equal(missingContext.success, false);
  assert.equal(missingContext.error.code, "CHAT_WRITING_ASSIST_INPUT_REQUIRED");
  assert.equal(missingConversation.success, false);
  assert.equal(missingConversation.error.code, "CHAT_WRITING_ASSIST_EMPTY");
  assert.equal(unconfigured.success, false);
  assert.equal(
    unconfigured.error.code,
    "CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED",
  );
  assert.equal(unconfigured.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(unconfigured.error.provenance.liveDatabaseWriteExecuted, false);
});

test("chat writing assist factory registers live mode and fails closed without database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const resolution = resolveChatWritingAssistService("live");
    const service = createChatWritingAssistService("live");
    const result = await service.draftFollowup({
      conversationId: "conversation_001",
    });

    assert.equal(resolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED",
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
