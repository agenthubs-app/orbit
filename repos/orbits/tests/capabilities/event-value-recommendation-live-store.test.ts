import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventValueRecommendationService,
  resolveEventValueRecommendationService,
} from "../../features/recommendations/service-factory";
import { createLiveEventValueRecommendationService } from "../../features/recommendations/live-event-value-service";
import { createStorageEventValueRecommendationProvider } from "../../features/recommendations/storage/event-value-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;

async function withUnconfiguredLiveEventValue<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    process.env.ORBIT_FEATURE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    if (previousFeatureMode === undefined) {
      delete process.env.ORBIT_FEATURE_MODE;
    } else {
      process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("live event value recommendations rank sourced events from shared storage", async () => {
  const workspaceId = "workspace:event-value-recommendation-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T20:00:00.000Z",
    store,
    workspaceId,
  });

  const service = createLiveEventValueRecommendationService({
    provider: createStorageEventValueRecommendationProvider({
      sourceLabel: "Event value memory live storage",
      store,
      workspaceId,
    }),
  });

  const recommendations = await service.listRecommendedEvents({
    industryPreference: "AI",
    limit: 2,
    location: "Shanghai",
    profileGoal: "AI workflow PoC buyer",
  });

  assert.equal(recommendations.success, true);
  assert.equal(recommendations.data.state, "success");
  assert.equal(recommendations.data.recommendations.length, 2);
  assert.equal(recommendations.data.recommendations[0]?.eventId, "event_02");
  assert.match(
    recommendations.data.recommendations[0]?.title ?? "",
    /日中AI業務自動化PoC/,
  );
  assert.equal(
    recommendations.data.recommendations[0]?.generatedBy,
    "live-store-event-value",
  );
  assert.equal(
    recommendations.data.recommendations[0]?.databaseQueryExecuted,
    true,
  );
  assert.equal(
    recommendations.data.recommendations[0]?.liveEventDiscoveryFeedRequested,
    false,
  );
  assert.equal(recommendations.data.provenance.databaseQueryExecuted, true);
  assert.equal(recommendations.data.provenance.databaseWriteExecuted, false);
  assert.equal(
    recommendations.data.provenance.privacy,
    "live-event-value-recommendation-only",
  );
  assert.equal(
    recommendations.data.provenance.generationMethod,
    "live-store-event-value",
  );
  assert.equal(
    recommendations.data.provenance.source,
    `live-record-store:event-value-recommendations:${workspaceId}`,
  );

  const acceptance = await service.acceptRecommendedEvent({
    eventId: "event_02",
  });

  assert.equal(acceptance.success, true);
  assert.equal(acceptance.data.acceptedEvent.eventId, "event_02");
  assert.equal(acceptance.data.action.generatedBy, "live-event-value-service");
  assert.equal(acceptance.data.action.databaseWriteExecuted, false);
  assert.equal(acceptance.data.action.notificationDelivered, false);
  assert.equal(
    acceptance.data.provenance.generationMethod,
    "live-store-acceptance",
  );
});

test("event value recommendation live factory fails closed without live database config", async () => {
  await withUnconfiguredLiveEventValue(async () => {
    const resolution = resolveEventValueRecommendationService("live");
    const service = createEventValueRecommendationService("live");
    const result = await service.listRecommendedEvents({
      profileGoal: "AI workflow PoC buyer",
    });

    assert.equal(
      resolution.success,
      true,
      resolution.success === false ? resolution.error.message : "",
    );
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.equal(result.error.provenance.databaseQueryExecuted, false);
      assert.equal(
        result.error.provenance.generationMethod,
        "live-store-event-value",
      );
    }
  });
});
