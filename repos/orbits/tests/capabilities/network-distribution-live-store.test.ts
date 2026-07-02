import assert from "node:assert/strict";
import test from "node:test";

import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createStorageNetworkDistributionAnalyticsProvider } from "../../features/dashboard/storage/network-distribution-live-record-provider";
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
  assert.deepEqual(
    distributions.data.industryDistribution.map((bucket) => [
      bucket.bucketId,
      bucket.contactCount,
    ]),
    [
      ["industry:foods", 18],
      ["industry:technologies", 18],
      ["industry:partners", 12],
      ["industry:community", 10],
      ["industry:capital", 8],
    ],
  );
  assert.deepEqual(
    distributions.data.valueTypeDistribution.map((bucket) => [
      bucket.valueType,
      bucket.relationshipCount,
    ]),
    [
      ["commercial_opportunity", 192],
      ["strategic_fit", 192],
      ["referral_path", 192],
      ["investor_access", 14],
    ],
  );
  assert.deepEqual(
    distributions.data.relationshipStrengthDistribution.map((bucket) => [
      bucket.strength,
      bucket.relationshipCount,
      bucket.followupRisk,
    ]),
    [
      ["strong", 221, "low"],
      ["warm", 214, "moderate"],
      ["weak", 75, "high"],
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
  assert.equal(gaps.data.coverageScore, 78);
  assert.deepEqual(
    gaps.data.gaps.map((gap) => [gap.gapType, gap.currentCount, gap.targetCount]),
    [
      ["industry_underrepresented", 8, 14],
      ["value_type_underrepresented", 14, 51],
      ["strength_underrepresented", 221, 230],
    ],
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
