import assert from "node:assert/strict";
import test from "node:test";

import { createLiveEventRecommendationService } from "../../features/recommendations/live-service";
import { createStorageEventRecommendationProvider } from "../../features/recommendations/storage/event-recommendation-live-record-provider";
import {
  createEventRecommendationService,
  resolveEventRecommendationService,
} from "../../features/recommendations/service-factory";
import { POST as composeOpeningLine } from "../../app/api/recommendations/event/[id]/opening-line/route";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live event recommendations read generated matches from shared storage", async () => {
  const workspaceId = "workspace:event-recommendation-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T20:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageEventRecommendationProvider({
    sourceLabel: "Event recommendation memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveEventRecommendationService({
    provider,
  });

  const recommendations = await service.listEventRecommendations({
    eventId: "event_02",
    limit: 2,
  });

  assert.equal(recommendations.success, true);
  assert.equal(recommendations.data.event.id, "event_02");
  assert.match(recommendations.data.event.title, /日中AI業務自動化PoC/);
  assert.equal(recommendations.data.recommendations.length, 2);
  assert.deepEqual(
    recommendations.data.recommendations.map((item) => item.recommendationId),
    ["recommendation_0041", "recommendation_0131"],
  );
  assert.deepEqual(
    recommendations.data.recommendations.map((item) => item.rank),
    [1, 2],
  );

  const topRecommendation = recommendations.data.recommendations[0];

  assert.equal(topRecommendation?.attendee.attendeeId, "participant_489");
  assert.equal(topRecommendation?.attendee.displayName, "Daniel Ahmed");
  assert.equal(topRecommendation?.attendee.databaseQueryExecuted, true);
  assert.equal(topRecommendation?.generatedBy, "live-store-ranking");
  assert.equal(topRecommendation?.databaseQueryExecuted, true);
  assert.equal(topRecommendation?.aiProviderRequested, false);
  assert.equal(topRecommendation?.vectorSearchExecuted, false);
  assert.deepEqual(topRecommendation?.evidenceIds, ["evidence:recommendation:0041"]);
  assert.equal(
    recommendations.data.provenance.source,
    `live-record-store:event-recommendations:${workspaceId}`,
  );
  assert.equal(
    recommendations.data.provenance.sourceLabel,
    "Event recommendation memory live storage",
  );
  assert.equal(recommendations.data.provenance.privacy, "live-event-recommendation-only");
  assert.equal(recommendations.data.provenance.generationMethod, "live-store-ranking");
  assert.equal(recommendations.data.provenance.databaseQueryExecuted, true);
  assert.equal(recommendations.data.provenance.databaseWriteExecuted, false);
  assert.equal(recommendations.data.provenance.aiProviderRequested, false);

  const openingLine = await service.composeOpeningLine({
    attendeeId: "participant_453",
    eventId: "event_02",
    style: "context_question",
  });

  assert.equal(openingLine.success, true);
  assert.equal(openingLine.data.recommendation.recommendationId, "recommendation_0221");
  assert.equal(openingLine.data.openingLine.attendeeId, "participant_453");
  assert.equal(openingLine.data.openingLine.generatedBy, "live-opening-line-rule");
  assert.equal(openingLine.data.openingLine.aiProviderRequested, false);
  assert.match(openingLine.data.openingLine.text, /田中 健太/);
  assert.match(openingLine.data.openingLine.text, /AI workflow PoC buyer/);
  assert.equal(openingLine.data.provenance.generationMethod, "live-store-opening-line");
  assert.equal(openingLine.data.provenance.databaseQueryExecuted, true);
});

test("event recommendation live factory and routes fail closed without live database config", async () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    process.env.ORBIT_FEATURE_MODE = "live";
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const liveResolution = resolveEventRecommendationService("live");
    const liveService = createEventRecommendationService("live");
    const result = await liveService.listEventRecommendations({
      eventId: "event_02",
    });
    const routeResponse = await composeOpeningLine(
      new Request(
        "https://orbit.local/api/recommendations/event/event_02/opening-line?attendeeId=participant_453",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "event_02" }) },
    );
    const body = await routeResponse.json();

    assert.equal(liveResolution.success, true);
    assert.equal(result.success, false);
    assert.equal(routeResponse.status, 503);
    assert.equal(routeResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.deepEqual(body, {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The live event recommendation store is not configured.",
        context: {
          boundary: "developer-admin",
          eventRecommendationErrorCode: "EVENT_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
          mode: "live",
          privacy: "no-relationship-data",
          provenance:
            "Live event recommendation failure came from the configured live provider boundary.",
          service: "event-recommendation",
        },
      },
    });

    if (!result.success) {
      assert.equal(result.error.code, "EVENT_RECOMMENDATION_LIVE_STORE_UNCONFIGURED");
      assert.equal(result.error.provenance.generationMethod, "live-store-ranking");
      assert.equal(result.error.provenance.databaseQueryExecuted, false);
    }
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
