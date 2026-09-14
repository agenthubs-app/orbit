import assert from "node:assert/strict";
import test from "node:test";
import { createMockProfileService } from "../../features/profile/mock-service";

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

test("dashboard omits private birth dates while preserving the profile source for its owner", async () => {
  const profile = await createMockProfileService().updateProfile({ displayName: "本人", birthDate: "2000-02-29" });
  assert.equal(profile.success, true);
  if (!profile.success) throw new Error("Profile fixture save failed");
  assert.equal(profile.data.profile?.birthDate, "2000-02-29");
  const service = createMobileContactsDashboardService(dependencies({ loadProfile: async () => profile }));
  const result = await service.getDashboard({ actorId: "actor-birth" });
  assert.equal(result.success, true);
  if (!result.success) throw new Error("Dashboard failed");
  assert.equal(result.data.profile?.profile?.displayName, "本人");
  assert.equal(Object.hasOwn(result.data.profile?.profile ?? {}, "birthDate"), false);
  assert.equal(profile.data.profile?.birthDate, "2000-02-29", "projection must not mutate the owner's source");
});

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

test("mobile contacts dashboard keeps analysis failure optional and never retries it during one GET", async () => {
  let analysisReads = 0;
  const service = createMobileContactsDashboardService(
    dependencies({
      loadAnalysis: async (_actorId, source) => {
        analysisReads += 1;
        assert.equal(source.aggregate.relationshipAssetTotals.contacts, 78);
        return { success: false, error: "storage unavailable" };
      },
    }),
  );

  const result = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.analysis, null);
  assert.equal(result.data.unavailableSections.includes("analysis"), true);
  assert.equal(analysisReads, 1);
});

test("mobile contacts dashboard keeps source version stable across GET response assembly times", async () => {
  const versions: string[] = [];
  let tick = 0;
  const service = createMobileContactsDashboardService(
    dependencies({
      loadAnalysis: async (_actorId, source) => {
        const { createContactsAnalysisSourceDataVersion } = await import(
          "../../features/mobile/contacts-analysis-report-provider"
        );
        const sourceDataVersion = createContactsAnalysisSourceDataVersion(source);
        versions.push(sourceDataVersion);
        return {
          success: true,
          data: {
            current: { analysisVersion: "contacts.analysis@1", sourceDataVersion },
            report: null,
            stale: false,
          },
        };
      },
      now: () => `2026-09-15T0${tick++}:00:00.000Z`,
    }),
  );

  const first = await service.getDashboard({ actorId: "account:xiaoyu" });
  const second = await service.getDashboard({ actorId: "account:xiaoyu" });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  if (!first.success || !second.success) return;
  assert.notEqual(first.data.generatedAt, second.data.generatedAt);
  assert.equal(first.data.analysis?.current.sourceDataVersion, second.data.analysis?.current.sourceDataVersion);
  assert.deepEqual(versions, [versions[0], versions[0]]);
});
