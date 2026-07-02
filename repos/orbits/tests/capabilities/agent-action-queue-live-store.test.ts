import assert from "node:assert/strict";
import test from "node:test";

import { createLiveAgentActionQueueService } from "../../features/agent/live-service";
import { createStorageAgentActionQueueProvider } from "../../features/agent/storage/agent-action-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live agent action queue reads and updates generated actions without external side effects", async () => {
  const workspaceId = "workspace:agent-action-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveAgentActionQueueService({
    provider: createStorageAgentActionQueueProvider({
      store,
      workspaceId,
    }),
  });

  const list = await service.listActions();

  assert.equal(list.success, true);
  assert.equal(list.data.state, "success");
  assert.equal(list.data.actions.length, 60);
  assert.equal(list.data.provenance.generationMethod, "live-store-query");
  assert.equal(list.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(list.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(list.data.provenance.autonomousExecutionStarted, false);
  assert.equal(list.data.provenance.externalSideEffectExecuted, false);
  assert.equal(list.data.provenance.externalNetworkRequested, false);
  assert.equal(list.data.provenance.aiProviderRequested, false);
  assert.equal(list.data.provenance.calendarProviderRequested, false);
  assert.equal(list.data.provenance.emailProviderRequested, false);
  assert.equal(list.data.provenance.notificationProviderRequested, false);
  assert.equal(list.data.provenance.deviceRequested, false);
  assert.deepEqual(
    list.data.actions.slice(0, 4).map((action) => [
      action.actionId,
      action.actionType,
      action.priority,
      action.confirmationRequired,
    ]),
    [
      ["agent_action_001", "event_reminder", "high", true],
      ["agent_action_002", "post_event_followup", "high", true],
      ["agent_action_003", "dormant_activation", "high", true],
      ["agent_action_004", "message_draft_suggestion", "high", true],
    ],
  );
  assert.match(
    list.data.actions[0].recommendedAction,
    /review source evidence|ask the introducer/i,
  );
  assert.notEqual(
    list.data.actions[0].contactName,
    "Live generated relationship context",
  );

  const filtered = await service.listActions({
    actionType: "post_event_followup",
  });

  assert.equal(filtered.success, true);
  assert.equal(filtered.data.actions.length, 15);
  assert.equal(
    filtered.data.actions.every(
      (action) => action.actionType === "post_event_followup",
    ),
    true,
  );

  const accepted = await service.acceptAction({
    actionId: "agent_action_001",
    actorLabel: "Live evaluator",
  });

  assert.equal(accepted.success, true);
  assert.equal(accepted.data.actionId, "agent_action_001");
  assert.equal(accepted.data.decision, "accepted");
  assert.equal(accepted.data.actorLabel, "Live evaluator");
  assert.equal(accepted.data.externalSideEffectExecuted, false);
  assert.equal(accepted.data.autonomousExecutionStarted, false);
  assert.equal(accepted.data.provenance.generationMethod, "live-store-decision");
  assert.equal(accepted.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(accepted.data.provenance.liveDatabaseWriteExecuted, true);

  const updatedRecord = store.getRecord({
    collectionName: "agentActions",
    recordId: "agent_action_001",
    workspaceId,
  });

  assert.equal(updatedRecord?.payload.status, "approved");
  assert.equal(updatedRecord?.payload.updatedAt, accepted.data.decidedAt);

  const dismissed = await service.dismissAction({
    actionId: "agent_action_002",
  });

  assert.equal(dismissed.success, true);
  assert.equal(dismissed.data.decision, "dismissed");
  assert.equal(
    store.getRecord({
      collectionName: "agentActions",
      recordId: "agent_action_002",
      workspaceId,
    })?.payload.status,
    "rejected",
  );

  const missingId = await service.acceptAction({});
  const missingAction = await service.dismissAction({
    actionId: "missing-agent-action",
  });
  const unconfigured = await createLiveAgentActionQueueService({
    provider: null,
  }).listActions();

  assert.equal(missingId.success, false);
  assert.equal(
    missingId.error.code,
    "AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED",
  );
  assert.equal(missingAction.success, false);
  assert.equal(
    missingAction.error.code,
    "AGENT_ACTION_QUEUE_ACTION_NOT_FOUND",
  );
  assert.equal(unconfigured.success, false);
  assert.equal(
    unconfigured.error.code,
    "AGENT_ACTION_QUEUE_LIVE_STORE_UNCONFIGURED",
  );
});
