import assert from "node:assert/strict";
import test from "node:test";

import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createStorageNetworkDistributionAnalyticsProvider } from "../../features/dashboard/storage/network-distribution-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live network distribution analytics reads generated graph and remains read-only", async () => {
  const workspaceId = "workspace:network-distribution-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T07:00:00.000Z",
    store,
    workspaceId,
  });

  const originalConnection = store.getRecord({
    collectionName: "connections",
    recordId: "connection_0007",
    workspaceId,
  });
  const provider = createStorageNetworkDistributionAnalyticsProvider({
    sourceLabel: "Network distribution memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveNetworkDistributionAnalyticsService({
    provider,
  });

  const distributions = await service.getDistributions();

  assert.equal(distributions.success, true);
  assert.equal(distributions.data.state, "success");
  assert.equal(distributions.data.industryDistribution.length, 5);
  assert.equal(
    distributions.data.industryDistribution.reduce(
      (total, bucket) => total + bucket.contactCount,
      0,
    ),
    defaultMockFixtures.contacts.length,
  );
  assert.deepEqual(
    distributions.data.industryDistribution.map((bucket) => bucket.bucketId),
    [
      "industry:foods",
      "industry:technologies",
      "industry:partners",
      "industry:community",
      "industry:capital",
    ],
  );
  assert.deepEqual(
    distributions.data.valueTypeDistribution.map((bucket) => bucket.valueType),
    [
      "commercial_opportunity",
      "strategic_fit",
      "referral_path",
      "investor_access",
    ],
  );
  assert.ok(
    distributions.data.valueTypeDistribution.every(
      (bucket) => bucket.relationshipCount > 0,
    ),
  );
  assert.equal(
    distributions.data.relationshipStrengthDistribution.reduce(
      (total, bucket) => total + bucket.relationshipCount,
      0,
    ),
    defaultMockFixtures.connections.length,
  );
  assert.deepEqual(
    distributions.data.relationshipStrengthDistribution.map((bucket) => [
      bucket.strength,
      bucket.followupRisk,
    ]),
    [
      ["strong", "low"],
      ["warm", "moderate"],
      ["weak", "high"],
    ],
  );
  assert.equal(
    distributions.data.provenance.source,
    `live-record-store:network-distribution:${workspaceId}`,
  );
  assert.equal(
    distributions.data.provenance.sourceLabel,
    "Network distribution memory live storage",
  );
  assert.equal(distributions.data.provenance.generationMethod, "live-store-query");
  assert.equal(distributions.data.provenance.databaseReadExecuted, true);
  assert.equal(distributions.data.provenance.databaseWriteExecuted, false);
  assert.equal(distributions.data.provenance.graphAlgorithmExecuted, false);
  assert.equal(distributions.data.provenance.embeddingSearchExecuted, false);
  assert.equal(distributions.data.provenance.aiProviderRequested, false);

  const gaps = await service.getNetworkGaps();

  assert.equal(gaps.success, true);
  assert.equal(gaps.data.state, "success");
  assert.ok(gaps.data.coverageScore >= 0 && gaps.data.coverageScore <= 100);
  assert.ok(
    gaps.data.gaps.every(
      (gap) =>
        gap.currentCount < gap.targetCount &&
        gap.evidenceIds.length > 0,
    ),
  );
  assert.equal(gaps.data.provenance.databaseReadExecuted, true);
  assert.equal(gaps.data.provenance.databaseWriteExecuted, false);

  const distributionFailure = await service.getDistributions({
    scenario: "failure",
  });

  assert.equal(distributionFailure.success, false);
  if (!distributionFailure.success) {
    assert.equal(
      distributionFailure.error.code,
      "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED",
    );
    assert.deepEqual(distributionFailure.error.evidenceIds, [
      "evidence:network-distribution-live-failed",
    ]);
    assert.equal(distributionFailure.error.provenance.databaseReadExecuted, true);
  }

  const gapFailure = await service.getNetworkGaps({ scenario: "failure" });

  assert.equal(gapFailure.success, false);
  if (!gapFailure.success) {
    assert.equal(
      gapFailure.error.code,
      "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_FAILED",
    );
    assert.deepEqual(gapFailure.error.evidenceIds, [
      "evidence:network-distribution-live-failed",
    ]);
    assert.equal(gapFailure.error.provenance.databaseReadExecuted, true);
  }

  const empty = await service.getDistributions({ scenario: "empty" });

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.industryDistribution.length, 0);

  const emptyStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const emptyService = createLiveNetworkDistributionAnalyticsService({
    provider: createStorageNetworkDistributionAnalyticsProvider({
      sourceLabel: "Empty network distribution memory storage",
      store: emptyStore,
      workspaceId: "workspace:network-distribution-empty",
    }),
  });
  const emptyGaps = await emptyService.getNetworkGaps();

  assert.equal(emptyGaps.success, true);
  assert.equal(emptyGaps.data.state, "empty");
  assert.equal(emptyGaps.data.coverageScore, 0);
  assert.deepEqual(emptyGaps.data.gaps, []);

  const unconfigured = await createLiveNetworkDistributionAnalyticsService({
    provider: null,
  }).getDistributions();

  assert.equal(unconfigured.success, false);
  assert.equal(
    unconfigured.error.code,
    "NETWORK_DISTRIBUTION_ANALYTICS_LIVE_STORE_UNCONFIGURED",
  );

  const storedConnection = store.getRecord({
    collectionName: "connections",
    recordId: "connection_0007",
    workspaceId,
  });

  assert.deepEqual(storedConnection?.payload, originalConnection?.payload);
});
