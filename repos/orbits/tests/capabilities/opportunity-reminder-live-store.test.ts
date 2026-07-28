import assert from "node:assert/strict";
import test from "node:test";

import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import { createStorageOpportunityReminderAnalyticsProvider } from "../../features/dashboard/storage/opportunity-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
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

  const fixtureTask = defaultMockFixtures.tasks[0];
  const fixtureConnection = defaultMockFixtures.connections[0];

  assert.ok(fixtureTask);
  assert.ok(fixtureConnection);

  const originalTask = store.getRecord({
    collectionName: "tasks",
    recordId: fixtureTask.id,
    workspaceId,
  });
  const originalConnection = store.getRecord({
    collectionName: "connections",
    recordId: fixtureConnection.id,
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
  assert.equal(reminders.data.highPriorityOpportunities.length, 3);
  assert.ok(
    reminders.data.highPriorityOpportunities.every(
      (opportunity) =>
        opportunity.priority === "high" &&
        defaultMockFixtures.tasks.some(
          (task) => `opportunity:${task.id}` === opportunity.opportunityId,
        ) &&
        defaultMockFixtures.contacts.some(
          (contact) => contact.displayName === opportunity.contactName,
        ),
    ),
  );
  assert.deepEqual(
    reminders.data.highPriorityOpportunities.map(
      (opportunity) => opportunity.priorityScore,
    ),
    [...reminders.data.highPriorityOpportunities]
      .map((opportunity) => opportunity.priorityScore)
      .sort((left, right) => right - left),
  );
  assert.equal(reminders.data.dormantHighValueContacts.length, 3);
  assert.ok(
    reminders.data.dormantHighValueContacts.every((contact) =>
      defaultMockFixtures.contacts.some(
        (fixtureContact) =>
          fixtureContact.id === contact.contactId &&
          fixtureContact.displayName === contact.contactName,
      ),
    ),
  );
  assert.deepEqual(
    reminders.data.currentGoalMatches[0]?.matchedOpportunityIds,
    reminders.data.highPriorityOpportunities.map(
      (opportunity) => opportunity.opportunityId,
    ),
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
  assert.equal(
    recompute.data.evaluatedContacts,
    defaultMockFixtures.contacts.length,
  );
  assert.equal(recompute.data.generatedOpportunityCount, 3);
  assert.deepEqual(
    recompute.data.changedOpportunityIds,
    reminders.data.highPriorityOpportunities.map(
      (opportunity) => opportunity.opportunityId,
    ),
  );
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
    recordId: fixtureTask.id,
    workspaceId,
  });
  const storedConnection = store.getRecord({
    collectionName: "connections",
    recordId: fixtureConnection.id,
    workspaceId,
  });

  assert.deepEqual(storedTask?.payload, originalTask?.payload);
  assert.deepEqual(storedConnection?.payload, originalConnection?.payload);
});
