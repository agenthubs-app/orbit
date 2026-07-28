import assert from "node:assert/strict";
import test from "node:test";

import { createMockBusinessCardScanOcrService } from "../../features/acquisition/mock-business-card-service";
import { createStorageContactArchiveActionWriter } from "../../features/contacts/action-writer";
import { createAgentDomainExecutors } from "../../features/agent/runtime/domain-executors";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { projectLedgerEntriesToTodayWorkItems } from "../../features/agent/runtime/today-projection";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMockExternalActionSandboxService } from "../../features/agent/mock-external-action-sandbox";
import { createRuntimeBackedAgentLedgerService } from "../../features/agent/ledger/runtime-adapter";
import { createStorageEventActionWriter } from "../../features/events/action-writer";
import { createEventMatchmakingService } from "../../features/events/matchmaking/service";
import { createStorageFollowupActionWriter } from "../../features/followups/action-writer";
import { createStorageReminderActionWriter } from "../../features/notifications/action-writer";
import { createPostEventFollowupWorkflow } from "../../features/orbit-ai/workflows/post-event-followup-v1";
import { createMockAiProviderService } from "../../shared/ai/mock-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function createMockMvpHarness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "mock-mvp-integration";
  const actorId = "account:mock-mvp-user";
  const runtime = createAgentRuntimeService({
    repository: createStorageAgentRuntimeRepository({ store, workspaceId }),
    executors: createAgentExecutorRegistry(
      createAgentDomainExecutors({
        contacts: createStorageContactArchiveActionWriter({
          store,
          workspaceId,
        }),
        events: createStorageEventActionWriter({
          store,
          userId: actorId,
          workspaceId,
        }),
        followups: createStorageFollowupActionWriter({
          store,
          userId: actorId,
          workspaceId,
        }),
        notifications: createStorageReminderActionWriter({
          store,
          userId: actorId,
          workspaceId,
        }),
        matchmaking: createEventMatchmakingService({ store, workspaceId }),
      }),
    ),
    now: () => "2026-07-28T01:00:00.000Z",
    id: (() => {
      let value = 0;
      return () => `mock-mvp-${++value}`;
    })(),
  });

  return { actorId, runtime, store, workspaceId };
}

async function records(
  harness: ReturnType<typeof createMockMvpHarness>,
  collectionName: string,
) {
  return harness.store.listRecords({
    collectionName,
    userId: harness.actorId,
    workspaceId: harness.workspaceId,
  });
}

test("mock MVP runs intake → post-event workflow → persisted work → Today projection without external effects", async () => {
  const cardScan = createMockBusinessCardScanOcrService().scanBusinessCard({
    imageName: "lin-mei-card.txt",
    imageText:
      "林玫\n投资合伙人\n星河资本\nlin.mei@example.test\n+86 138 0000 0101",
  });
  assert.equal(cardScan.success, true);
  if (!cardScan.success) return;
  assert.equal(cardScan.data.ocr.ocrProviderCalled, false);
  assert.equal(cardScan.data.capture.deviceCameraAccessed, false);
  assert.equal(cardScan.data.capture.uploadStorageExecuted, false);
  assert.equal(cardScan.data.draft?.contactWriteExecuted, false);

  const draft = cardScan.data.draft;
  assert.ok(draft);
  const harness = createMockMvpHarness();
  const result = await createPostEventFollowupWorkflow(harness.runtime).run({
    eventId: "event:mock-ai-investment-forum",
    eventTitle: "人工智能投资闭门会",
    contactId: draft.id,
    contactName: draft.displayName,
    organization: draft.organization,
    conversationId: "conversation:mock-lin-mei",
    noteText: "林玫希望下周继续讨论人工智能项目的联合投资机会。",
    noteSource: "typed",
    evidenceIds: cardScan.data.provenance.evidenceIds,
    relationshipContext: "通过闭门会认识，双方关注早期人工智能投资。",
    followupDueAt: "2026-07-30T01:00:00.000Z",
    reminderDueAt: "2026-07-29T01:00:00.000Z",
  });

  assert.equal(result.run.status, "waiting_for_confirmation");
  assert.equal(result.actions.length, 4);
  assert.equal(result.artifact.rawAudioPersisted, false);
  assert.equal(result.artifact.contactResolution, "resolved");
  assert.deepEqual(
    result.artifact.evidenceIds,
    cardScan.data.provenance.evidenceIds,
  );

  for (const action of result.actions) {
    if (action.status === "awaiting_confirmation") {
      await harness.runtime.approveAction({
        actionId: action.actionId,
        actorLabel: "Mock MVP acceptance user",
      });
    }
  }
  await harness.runtime.processOutbox();

  assert.equal((await records(harness, "encounterNotes")).length, 1);
  assert.equal((await records(harness, "messageDrafts")).length, 1);
  assert.equal((await records(harness, "tasks")).length, 1);
  assert.equal((await records(harness, "notifications")).length, 1);
  for (const collection of [
    "encounterNotes",
    "messageDrafts",
    "tasks",
    "notifications",
  ]) {
    const scopedRecords = await records(harness, collection);
    assert.ok(scopedRecords.every((record) => record.userId === harness.actorId));
  }

  const ledgerResult = await createRuntimeBackedAgentLedgerService({
    runtime: harness.runtime,
  }).listEntries({});
  assert.equal(ledgerResult.success, true);
  if (!ledgerResult.success) return;
  const todayItems = projectLedgerEntriesToTodayWorkItems(
    ledgerResult.data.entries,
  );
  assert.equal(todayItems.length, result.actions.length);
  assert.deepEqual(
    new Set(todayItems.map((item) => item.actionId)),
    new Set(result.actions.map((action) => action.actionId)),
  );
});

test("mock MVP AI and outbound-action boundaries expose provenance and execute no provider request", () => {
  const aiResult = createMockAiProviderService().draftMessage({
    promptTemplateId: "orbit.message-draft.followup.v1",
    recipientName: "林玫",
    relationshipContext: "闭门会后讨论人工智能联合投资机会。",
    desiredOutcome: "约下周继续交流。",
    sourceEvidenceIds: ["evidence:mock-mvp-lin-mei"],
  });
  assert.equal(aiResult.success, true);
  if (!aiResult.success) return;
  assert.equal(aiResult.data.provenance.liveAiProviderRequested, false);
  assert.equal(aiResult.data.provenance.externalNetworkRequested, false);
  assert.ok(aiResult.data.runs[0]?.provenance.evidenceIds.length);

  const outbound = createMockExternalActionSandboxService().sendMessage({
    actorLabel: "Mock MVP acceptance user",
    targetLabel: "林玫",
  });
  assert.equal(outbound.success, true);
  if (!outbound.success) return;
  assert.equal(outbound.data.providerRequestIssued, false);
  assert.equal(outbound.data.externalSideEffectExecuted, false);
  assert.equal(outbound.data.auditRecord.sideEffectExecuted, false);
});
