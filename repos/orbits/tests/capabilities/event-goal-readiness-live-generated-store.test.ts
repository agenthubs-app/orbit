import assert from "node:assert/strict";
import test from "node:test";

import { createLiveEventGoalAndReadinessService } from "../../features/events/goal-readiness/live-service";
import { createGeneratedEventGoalReadinessProvider } from "../../features/events/goal-readiness/storage/generated-goal-readiness-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live event goal readiness generates readiness payloads from generated event attendees", async () => {
  const workspaceId = "workspace:event-goal-readiness-generated-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T22:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createGeneratedEventGoalReadinessProvider({
    now: () => "2026-07-01T22:05:00.000Z",
    sourceLabel: "Generated goal readiness memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveEventGoalAndReadinessService({
    now: () => "2026-07-01T22:10:00.000Z",
    provider,
  });

  const readiness = await service.getReadiness({ eventId: "event_01" });

  assert.equal(readiness.success, true);
  assert.equal(readiness.data.event.id, "event_01");
  assert.match(readiness.data.event.title, /東京インバウンド飲食店成長会/);
  assert.equal(readiness.data.suggestedGoals.length, 3);
  assert.equal(readiness.data.goal?.selectedSuggestionId, "goal:live:event_01:storage_pilot");
  assert.equal(readiness.data.preparationState.preEventBriefReady, true);
  assert.equal(readiness.data.provenance.source, `live-record-store:event-goal-readiness:${workspaceId}`);
  assert.equal(
    readiness.data.provenance.sourceLabel,
    "Generated goal readiness memory live storage",
  );
  assert.equal(readiness.data.provenance.generationMethod, "live-store-query");
  assert.equal(readiness.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(readiness.data.provenance.aiProviderRequested, false);
  assert.equal(readiness.data.preparationState.calendarConflictCheck.liveCalendarRequested, false);
  assert.ok(
    readiness.data.readinessChecklist.every(
      (item) =>
        item.aiProviderRequested === false &&
        item.calendarProviderRequested === false &&
        item.liveDatabaseWriteExecuted === false,
    ),
  );

  const storageGoals = await service.suggestGoals({
    eventId: "event_01",
    relationshipFocus: "storage_pilot",
  });

  assert.equal(storageGoals.success, true);
  assert.equal(storageGoals.data.suggestedGoals.length, 1);
  assert.equal(storageGoals.data.suggestedGoals[0]?.focus, "storage_pilot");
  assert.match(storageGoals.data.suggestedGoals[0]?.intent ?? "", /PoC|pilot/i);

  const updatedGoal = await service.setGoal({
    eventId: "event_01",
    goalText: "Find two restaurant CRM pilot partners from generated attendees.",
    selectedSuggestionId: "goal:live:event_01:storage_pilot",
  });

  assert.equal(updatedGoal.success, true);
  assert.equal(
    updatedGoal.data.acceptedGoalText,
    "Find two restaurant CRM pilot partners from generated attendees.",
  );
  assert.equal(updatedGoal.data.provenance.generationMethod, "live-store-goal-setting");
  assert.equal(updatedGoal.data.provenance.liveDatabaseWriteExecuted, true);
  assert.equal(updatedGoal.data.goal.liveDatabaseWriteExecuted, true);

  const persisted = await service.getReadiness({ eventId: "event_01" });

  assert.equal(persisted.success, true);
  assert.equal(
    persisted.data.goal?.intent,
    "Find two restaurant CRM pilot partners from generated attendees.",
  );
});
