import assert from "node:assert/strict";
import test from "node:test";
import type { MobileContactsDashboardPayload } from "../../shared/api-schema/mobile-contacts-dashboard";

import {
  createMobileContactsDashboardGetHandler,
  type MobileContactsDashboardRouteDependencies,
} from "../../app/api/mobile/contacts-dashboard/handler";

const aggregate = {
  state: "success" as const,
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

const payload: MobileContactsDashboardPayload = {
  schemaVersion: 1 as const,
  generatedAt: "2026-08-31T00:00:00.000Z",
  aggregate,
  summary: null,
  opportunities: null,
  gaps: null,
  distributions: null,
  profile: null,
  contacts: null,
  unavailableSections: [
    "summary",
    "opportunities",
    "gaps",
    "distributions",
    "profile",
    "contacts",
  ],
};

function dependencies(
  overrides: Partial<MobileContactsDashboardRouteDependencies> = {},
): MobileContactsDashboardRouteDependencies {
  return {
    resolveActor: async () => ({ id: "account:xiaoyu" }),
    resolveMode: () => "live",
    createService: () => ({
      getDashboard: async () => ({ success: true, data: payload }),
    }),
    ...overrides,
  };
}

test("mobile contacts dashboard route rejects unauthenticated requests before service creation", async () => {
  let serviceCreated = false;
  const GET = createMobileContactsDashboardGetHandler(
    dependencies({
      resolveActor: async () => null,
      createService: () => {
        serviceCreated = true;
        throw new Error("must not run");
      },
    }),
  );

  const response = await GET(new Request("http://localhost/api/mobile/contacts-dashboard"));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "UNAUTHORIZED");
  assert.equal(serviceCreated, false);
});

test("mobile contacts dashboard route returns one standard actor-scoped envelope", async () => {
  let receivedActorId = "";
  const GET = createMobileContactsDashboardGetHandler(
    dependencies({
      createService: () => ({
        getDashboard: async ({ actorId }) => {
          receivedActorId = actorId;
          return { success: true, data: payload };
        },
      }),
    }),
  );

  const response = await GET(new Request("http://localhost/api/mobile/contacts-dashboard"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Orbit-Feature-Mode"), "live");
  assert.equal(receivedActorId, "account:xiaoyu");
  assert.deepEqual(body, { success: true, data: payload });
});

test("mobile contacts dashboard route maps a server contract mismatch to a visible 500", async () => {
  const GET = createMobileContactsDashboardGetHandler(
    dependencies({
      createService: () => ({
        getDashboard: async () => ({
          success: false,
          error: {
            code: "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH",
            section: "aggregate",
          },
        }),
      }),
    }),
  );

  const response = await GET(new Request("http://localhost/api/mobile/contacts-dashboard"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.context.section, "aggregate");
});
