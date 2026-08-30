import assert from "node:assert/strict";
import test from "node:test";

import {
  createMobileContactsDashboardService,
  type MobileContactsDashboardDependencies,
} from "../../features/mobile/contacts-dashboard-service";

const requiredAggregate = {
  state: "success",
  relationshipAssetTotals: {
    contacts: 78,
    connections: 78,
    evidenceBackedRelationships: 78,
    eventsRepresented: 16,
  },
  newContacts: { count: 3, windowLabel: "30 days", contacts: [] },
  highValueCount: 12,
  highValueRelationships: [],
  pendingFollowups: { count: 4, tasks: [] },
  dormantContacts: { count: 5, contacts: [] },
  recentActivity: [],
  summary: "当前人脉概览",
  nextAction: "查看优先事项",
};

function dependencies(
  overrides: Partial<MobileContactsDashboardDependencies> = {},
): MobileContactsDashboardDependencies {
  const unavailable = async () => ({ success: false as const, error: "unavailable" });

  return {
    loadAggregate: async () => ({ success: true, data: requiredAggregate }),
    loadSummary: unavailable,
    loadOpportunities: unavailable,
    loadGaps: unavailable,
    loadDistributions: unavailable,
    loadProfile: unavailable,
    loadContacts: unavailable,
    now: () => "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

test("mobile contacts dashboard passes one actor id to every section loader", async () => {
  const actorIds: string[] = [];
  const recordActor = async (actorId: string) => {
    actorIds.push(actorId);
    return { success: false as const, error: "unavailable" };
  };
  const service = createMobileContactsDashboardService(
    dependencies({
      loadAggregate: async (actorId) => {
        actorIds.push(actorId);
        return { success: true, data: requiredAggregate };
      },
      loadSummary: recordActor,
      loadOpportunities: recordActor,
      loadGaps: recordActor,
      loadDistributions: recordActor,
      loadProfile: recordActor,
      loadContacts: recordActor,
    }),
  );

  const result = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.equal(result.success, true);
  assert.deepEqual(actorIds, Array(7).fill("account:xiaoyu"));
});

test("mobile contacts dashboard fails when its required aggregate is unavailable", async () => {
  const service = createMobileContactsDashboardService(
    dependencies({
      loadAggregate: async () => ({ success: false, error: "database down" }),
    }),
  );

  const result = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.deepEqual(result, {
    success: false,
    error: {
      code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED",
      section: "aggregate",
    },
  });
});

test("mobile contacts dashboard keeps optional section failures visible without failing the screen", async () => {
  const service = createMobileContactsDashboardService(dependencies());

  const result = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.aggregate.relationshipAssetTotals.contacts, 78);
  assert.equal(result.data.summary, null);
  assert.deepEqual(result.data.unavailableSections, [
    "summary",
    "opportunities",
    "gaps",
    "distributions",
    "profile",
    "contacts",
  ]);
});

test("mobile contacts dashboard fails visibly when composed data violates the shared schema", async () => {
  const service = createMobileContactsDashboardService(
    dependencies({
      loadAggregate: async () => ({
        success: true,
        data: {
          ...requiredAggregate,
          relationshipAssetTotals: { contacts: "78" },
        },
      }),
    }),
  );

  const result = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.deepEqual(result, {
    success: false,
    error: {
      code: "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH",
      section: "aggregate",
    },
  });
});

test("mobile contacts dashboard degrades a malformed optional section", async () => {
  const service = createMobileContactsDashboardService(
    dependencies({
      loadDistributions: async () => ({
        success: true,
        data: { state: "success", structureDistributions: "invalid" },
      }),
    }),
  );

  const result = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.distributions, null);
  assert.equal(result.data.unavailableSections.includes("distributions"), true);
});
