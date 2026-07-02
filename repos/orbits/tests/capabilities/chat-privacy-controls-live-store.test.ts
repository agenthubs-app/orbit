import assert from "node:assert/strict";
import test from "node:test";

import { createLiveChatPrivacyControlsService } from "../../features/chat/live-privacy-service";
import {
  createChatPrivacyControlsService,
  resolveChatPrivacyControlsService,
} from "../../features/chat/service-factory";
import { createStorageChatPrivacyControlsProvider } from "../../features/chat/storage/chat-privacy-controls-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live chat privacy controls read generated chat context without AI, deletion, share, or writes", async () => {
  const workspaceId = "workspace:chat-privacy-controls-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveChatPrivacyControlsService({
    provider: createStorageChatPrivacyControlsProvider({
      sourceLabel: "Chat privacy controls memory live storage",
      store,
      workspaceId,
    }),
  });

  const controls = await service.getPrivacyControls({
    conversationId: "conversation_001",
  });

  assert.equal(controls.success, true);
  assert.equal(controls.data.state, "success");
  assert.equal(controls.data.conversationId, "conversation_001");
  assert.equal(controls.data.participantName, "山田 千尋");
  assert.equal(controls.data.organization, "Morning Light Foods");
  assert.equal(controls.data.analysisOptIn.enabled, true);
  assert.equal(controls.data.analysisOptIn.status, "opted_in");
  assert.equal(controls.data.analysisOptIn.source.generatedBy, "live-store-query");
  assert.equal(controls.data.analysisOptIn.generatedBy, "live-store-query");
  assert.equal(controls.data.analysisOptIn.aiProviderRequested, false);
  assert.equal(controls.data.analysisOptIn.liveDatabaseReadExecuted, true);
  assert.equal(controls.data.analysisOptIn.liveDatabaseWriteExecuted, false);
  assert.equal(controls.data.analysisDeletion.status, "available");
  assert.equal(controls.data.analysisDeletion.generatedBy, "live-store-query");
  assert.equal(
    controls.data.analysisDeletion.productionDataDeletionExecuted,
    false,
  );
  assert.equal(
    controls.data.analysisDeletion.productionPrivacyAuditLogWritten,
    false,
  );
  assert.equal(controls.data.privateNotes.length, 1);
  assert.equal(controls.data.privateNotes[0]?.visibility, "hidden");
  assert.equal(controls.data.privateNotes[0]?.bodyRedacted, true);
  assert.equal(controls.data.privateNotes[0]?.visibleToAiAnalysis, false);
  assert.equal(controls.data.privateNotes[0]?.visibleInSharePreview, false);
  assert.equal(
    controls.data.sensitiveShareConfirmation.confirmationRequired,
    true,
  );
  assert.equal(
    controls.data.sensitiveShareConfirmation.canShareWithoutConfirmation,
    false,
  );
  assert.equal(
    controls.data.sensitiveShareConfirmation.externalActionExecuted,
    false,
  );
  assert.equal(
    controls.data.provenance.source,
    `live-record-store:chat-privacy-controls:${workspaceId}`,
  );
  assert.equal(
    controls.data.provenance.sourceLabel,
    "Chat privacy controls memory live storage",
  );
  assert.equal(
    controls.data.provenance.privacy,
    "live-chat-privacy-controls-preview",
  );
  assert.equal(controls.data.provenance.generationMethod, "fixture");
  assert.equal(controls.data.provenance.aiProviderRequested, false);
  assert.equal(controls.data.provenance.externalNetworkRequested, false);
  assert.equal(controls.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(controls.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(
    controls.data.provenance.productionDataDeletionExecuted,
    false,
  );
  assert.equal(
    controls.data.provenance.productionPrivacyAuditLogWritten,
    false,
  );
  assert.equal(controls.data.provenance.emailProviderRequested, false);
  assert.equal(controls.data.provenance.calendarProviderRequested, false);
  assert.equal(controls.data.provenance.notificationDelivered, false);
  assert.equal(controls.data.provenance.deviceRequested, false);

  const toggleOff = await service.setAnalysisOptIn({
    conversationId: "conversation_001",
    enabled: false,
  });
  const toggleOn = await service.setAnalysisOptIn({
    conversationId: "conversation_001",
    enabled: true,
  });
  const deleted = await service.requestAnalysisDeletion({
    conversationId: "conversation_001",
  });
  const blockedShare = await service.prepareSensitiveShare({
    conversationId: "conversation_001",
    confirmed: false,
  });
  const confirmedShare = await service.prepareSensitiveShare({
    conversationId: "conversation_001",
    confirmed: true,
  });

  assert.equal(toggleOff.success, true);
  assert.equal(toggleOff.data.analysisOptIn.enabled, false);
  assert.equal(toggleOff.data.analysisOptIn.status, "opted_out");
  assert.equal(
    toggleOff.data.provenance.generationMethod,
    "rule-based-analysis-toggle",
  );
  assert.equal(toggleOff.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(toggleOn.success, true);
  assert.equal(toggleOn.data.analysisOptIn.enabled, true);
  assert.equal(deleted.success, true);
  assert.equal(deleted.data.analysisDeletion.status, "deleted_mock_only");
  assert.equal(deleted.data.analysisDeletion.deletedInMock, true);
  assert.equal(
    deleted.data.analysisDeletion.productionDataDeletionExecuted,
    false,
  );
  assert.equal(blockedShare.success, false);
  assert.equal(
    blockedShare.error.code,
    "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
  );
  assert.equal(confirmedShare.success, true);
  assert.equal(
    confirmedShare.data.sensitiveShareConfirmation.status,
    "confirmed_mock_only",
  );
  assert.equal(
    confirmedShare.data.sensitiveShareConfirmation.externalActionExecuted,
    false,
  );

  const empty = await service.getPrivacyControls({
    conversationId: "conversation_001",
    scenario: "empty",
  });
  const pending = await service.getPrivacyControls({
    conversationId: "conversation_001",
    scenario: "pending",
  });
  const missingId = await service.getPrivacyControls({
    conversationId: " ",
  });
  const missingConversation = await service.getPrivacyControls({
    conversationId: "missing-conversation",
  });
  const missingToggleValue = await service.setAnalysisOptIn({
    conversationId: "conversation_001",
  });
  const unconfigured = await createLiveChatPrivacyControlsService({
    provider: null,
  }).getPrivacyControls({
    conversationId: "conversation_001",
  });

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.privateNotes.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.analysisOptIn.status, "pending_confirmation");
  assert.equal(missingId.success, false);
  assert.equal(missingId.error.code, "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED");
  assert.equal(missingConversation.success, false);
  assert.equal(
    missingConversation.error.code,
    "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
  );
  assert.equal(missingToggleValue.success, false);
  assert.equal(
    missingToggleValue.error.code,
    "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
  );
  assert.equal(unconfigured.success, false);
  assert.equal(unconfigured.error.code, "CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED");
  assert.equal(unconfigured.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(unconfigured.error.provenance.liveDatabaseWriteExecuted, false);
});

test("chat privacy controls factory registers live mode and fails closed without database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const resolution = resolveChatPrivacyControlsService("live");
    const service = createChatPrivacyControlsService("live");
    const result = await service.getPrivacyControls({
      conversationId: "conversation_001",
    });

    assert.equal(resolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.code, "CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED");
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
