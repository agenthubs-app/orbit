import assert from "node:assert/strict";
import test from "node:test";

import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import { createStorageOpportunityReminderAnalyticsProvider } from "../../features/dashboard/storage/opportunity-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live opportunity reminder analytics reads generated graph and recomputes without writes", async () => {
  const workspaceId = "workspace:opportunity-reminder-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T08:00:00.000Z",
    store,
    workspaceId,
  });

  const originalTask = store.getRecord({
    collectionName: "tasks",
    recordId: "task_007",
    workspaceId,
  });
  const originalConnection = store.getRecord({
    collectionName: "connections",
    recordId: "connection_for_contact_039",
    workspaceId,
  });
  const provider = createStorageOpportunityReminderAnalyticsProvider({
    sourceLabel: "Opportunity reminder memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveOpportunityReminderAnalyticsService({
    now: () => "2026-07-02T08:05:00.000Z",
    provider,
  });

  const reminders = await service.getOpportunityReminderAnalytics();

  assert.equal(reminders.success, true);
  assert.equal(reminders.data.state, "success");
  assert.deepEqual(
    reminders.data.highPriorityOpportunities.map((opportunity) => [
      opportunity.opportunityId,
      opportunity.contactName,
      opportunity.priorityScore,
      opportunity.priority,
    ]),
    [
      ["opportunity:task_007", "西村 大地", 94, "high"],
      ["opportunity:task_033", "郑思远", 92, "high"],
      ["opportunity:task_006", "遠藤 悠斗", 91, "high"],
    ],
  );
  assert.deepEqual(
    reminders.data.dormantHighValueContacts.map((contact) => [
      contact.contactId,
      contact.contactName,
      contact.valueScore,
    ]),
    [
      ["contact_039", "西村 大地", 94],
      ["contact_114", "郭亦辰", 89],
      ["contact_078", "曾伟", 88],
    ],
  );
  assert.deepEqual(
    reminders.data.currentGoalMatches.map((match) => [
      match.goalId,
      match.coverageScore,
      match.matchedOpportunityIds,
    ]),
    [
      [
        "goal:live-top-followups",
        92,
        ["opportunity:task_007", "opportunity:task_033", "opportunity:task_006"],
      ],
      [
        "goal:live-dormant-recovery",
        90,
        ["dormant:connection_for_contact_039", "dormant:connection_for_contact_114"],
      ],
    ],
  );
  assert.deepEqual(
    reminders.data.suggestedContactReasons.map((reason) => reason.reasonType),
    ["goal_match", "dormancy", "event_context", "referral_path"],
  );
  assert.equal(
    reminders.data.provenance.source,
    `live-record-store:opportunity-reminder:${workspaceId}`,
  );
  assert.equal(
    reminders.data.provenance.sourceLabel,
    "Opportunity reminder memory live storage",
  );
  assert.equal(reminders.data.provenance.generationMethod, "live-store-query");
  assert.equal(reminders.data.provenance.databaseReadExecuted, true);
  assert.equal(reminders.data.provenance.databaseWriteExecuted, false);
  assert.equal(reminders.data.provenance.notificationProviderRequested, false);
  assert.equal(reminders.data.provenance.aiProviderRequested, false);

  const recompute = await service.recomputeOpportunityReminderAnalytics();

  assert.equal(recompute.success, true);
  assert.equal(recompute.data.state, "success");
  assert.equal(recompute.data.evaluatedContacts, 66);
  assert.equal(recompute.data.generatedOpportunityCount, 3);
  assert.deepEqual(recompute.data.changedOpportunityIds, [
    "opportunity:task_007",
    "opportunity:task_033",
    "opportunity:task_006",
  ]);
  assert.equal(recompute.data.provenance.generationMethod, "rule-based-recompute");
  assert.equal(recompute.data.provenance.databaseWriteExecuted, false);

  const reminderFailure = await service.getOpportunityReminderAnalytics({
    scenario: "failure",
  });

  assert.equal(reminderFailure.success, false);
  if (!reminderFailure.success) {
    assert.equal(
      reminderFailure.error.code,
      "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED",
    );
    assert.deepEqual(reminderFailure.error.evidenceIds, [
      "evidence:opportunity-reminder-live-failed",
    ]);
    assert.equal(reminderFailure.error.provenance.databaseReadExecuted, true);
  }

  const recomputeFailure = await service.recomputeOpportunityReminderAnalytics({
    scenario: "failure",
  });

  assert.equal(recomputeFailure.success, false);
  if (!recomputeFailure.success) {
    assert.equal(
      recomputeFailure.error.code,
      "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_FAILED",
    );
    assert.deepEqual(recomputeFailure.error.evidenceIds, [
      "evidence:opportunity-reminder-live-failed",
    ]);
    assert.equal(recomputeFailure.error.provenance.databaseReadExecuted, true);
  }

  const empty = await service.getOpportunityReminderAnalytics({
    scenario: "empty",
  });

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.highPriorityOpportunities.length, 0);

  const unconfigured = await createLiveOpportunityReminderAnalyticsService({
    provider: null,
  }).getOpportunityReminderAnalytics();

  assert.equal(unconfigured.success, false);
  assert.equal(
    unconfigured.error.code,
    "OPPORTUNITY_REMINDER_ANALYTICS_LIVE_STORE_UNCONFIGURED",
  );

  const storedTask = store.getRecord({
    collectionName: "tasks",
    recordId: "task_007",
    workspaceId,
  });
  const storedConnection = store.getRecord({
    collectionName: "connections",
    recordId: "connection_for_contact_039",
    workspaceId,
  });

  assert.deepEqual(storedTask?.payload, originalTask?.payload);
  assert.deepEqual(storedConnection?.payload, originalConnection?.payload);
});
