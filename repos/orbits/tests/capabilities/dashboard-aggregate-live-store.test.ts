import assert from "node:assert/strict";
import test from "node:test";

import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { dashboardAggregateFailureContext } from "../../features/dashboard/contract";
import {
  createDashboardAggregateService,
  resolveDashboardAggregateService,
} from "../../features/dashboard/service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live dashboard aggregate reads generated relationship graph from shared live storage", async () => {
  const workspaceId = "workspace:dashboard-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T20:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageDashboardAggregateProvider({
    sourceLabel: "Dashboard memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveDashboardAggregateService({
    provider,
  });

  const aggregate = await service.getDashboardAggregate({ activityLimit: 3 });

  assert.equal(aggregate.success, true);
  assert.equal(
    aggregate.data.relationshipAssetTotals.contacts,
    defaultMockFixtures.contacts.length,
  );
  assert.equal(
    aggregate.data.relationshipAssetTotals.connections,
    defaultMockFixtures.connections.length,
  );
  assert.equal(
    aggregate.data.relationshipAssetTotals.eventsRepresented,
    defaultMockFixtures.events.length,
  );
  assert.equal(aggregate.data.pendingFollowups.count, defaultMockFixtures.tasks.length);
  assert.equal(aggregate.data.highValueCount, 240);
  assert.equal(aggregate.data.dormantContacts.count, 13);
  assert.equal(aggregate.data.recentActivity.length, 3);
  assert.equal(aggregate.data.provenance.source, `live-record-store:dashboard:${workspaceId}`);
  assert.equal(aggregate.data.provenance.sourceLabel, "Dashboard memory live storage");
  assert.equal(aggregate.data.provenance.privacy, "live-dashboard-aggregate");
  assert.equal(aggregate.data.provenance.generationMethod, "live-store-query");
  assert.equal(aggregate.data.provenance.databaseReadExecuted, true);
  assert.equal(aggregate.data.provenance.databaseWriteExecuted, false);
  assert.equal(aggregate.data.provenance.liveAnalyticsQueryExecuted, false);
  assert.equal(aggregate.data.provenance.productionAggregateReadExecuted, false);

  const sato = aggregate.data.newContacts.contacts.find(
    (contact) => contact.contactId === "contact_001",
  );

  assert.ok(sato);
  assert.equal(sato.name, "佐藤 健一");
  assert.equal(sato.organization, "North Star Foods");
  assert.deepEqual(sato.evidenceIds, ["evidence:contact:001"]);

  const summary = await service.getDashboardSummary();

  assert.equal(summary.success, true);
  assert.equal(summary.data.metrics[0]?.id, "relationship-assets");
  assert.equal(summary.data.metrics[0]?.value, defaultMockFixtures.contacts.length);
  assert.equal(summary.data.provenance.source, `live-record-store:dashboard:${workspaceId}`);
  assert.equal(summary.data.provenance.databaseReadExecuted, true);

  const failure = await service.getDashboardAggregate({ scenario: "failure" });

  assert.equal(failure.success, false);
  if (!failure.success) {
    assert.equal(failure.error.code, "DASHBOARD_AGGREGATE_LIVE_FAILED");
    assert.equal(failure.error.provenance.sourceLabel, "Live dashboard controlled failure");
    assert.equal(failure.error.provenance.databaseReadExecuted, true);
    assert.equal(
      dashboardAggregateFailureContext(failure, "live").service,
      "dashboard-aggregate-live",
    );
  }
});

test("dashboard aggregate factory registers live mode and fails closed without live database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const liveResolution = resolveDashboardAggregateService("live");
    const liveService = createDashboardAggregateService("live");
    const result = await liveService.getDashboardAggregate();

    assert.equal(liveResolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.code, "DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED");
      assert.equal(result.error.provenance.databaseReadExecuted, false);
      assert.equal(result.error.provenance.generationMethod, "live-store-query");
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
