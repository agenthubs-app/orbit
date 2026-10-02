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

// ---------------------------------------------------------------------------
// W0047 SC-03（R-1）：旧响应逐字段不变。
// 同一夹具（图路径，shared/compute 实算）先在改动前跑一次存成 golden（W0047_WRITE_GOLDEN=1），
// 改动后再跑：除新增可选 `distributions.relationshipTierDistribution` 外与 golden 逐字段相同；
// 既有 `relationshipStrengthDistribution` 仍按 relationshipStrength ?? businessRelevanceScore ?? 0 计算，
// 档位缓存（relationship_strengths）里的值不影响它。
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import { computeDashboardSections } from "../../shared/compute/dashboard-local";
import { createLiveNetworkDistributionAnalyticsService } from "../../shared/compute/dashboard-distribution";
import type { LiveDashboardGraph } from "../../shared/compute/dashboard-graph";
import { createMobileContactsDashboardService } from "../../features/mobile/contacts-dashboard-service";

const W0047_NOW = "2026-10-02T03:00:00.000Z";
const W0047_GOLDEN = new URL("../fixtures/mobile-contacts-dashboard-w0047-before.golden.json", import.meta.url);

function w0047Graph(): LiveDashboardGraph {
  const source = { type: "manual", id: "src:w0047", label: "手动记录" } as const;
  const at = (day: number) => new Date(Date.parse(W0047_NOW) - day * 86_400_000).toISOString();
  const contact = (id: string, name: string, location: string, day: number) => ({
    id, displayName: name, organization: `Org ${id}`, role: "CEO", location, stage: "nurture" as const,
    source, evidenceIds: [`e:${id}`] as [string], createdAt: at(day), updatedAt: at(day),
  });
  const connection = (id: string, contactId: string, fields: { relationshipStrength?: number; businessRelevanceScore?: number }) => ({
    id, accountId: "account:xiaoyu", contactId, stage: "nurture" as const, valueTypes: ["commercial_opportunity"] as const,
    summary: "", ...fields, source, evidenceIds: [`e:${id}`] as [string], createdAt: at(10), updatedAt: at(10),
  });
  return {
    contacts: [
      contact("c1", "王磊", "上海", 5), contact("c2", "李娜", "东京", 40), contact("c3", "Émile", "Paris", 80),
      contact("c4", "Ana", "東京", 120), contact("c5", "佐藤", "大阪", 3),
    ],
    connections: [
      connection("k1", "c1", { relationshipStrength: 82 }),
      connection("k2", "c2", { businessRelevanceScore: 50 }),
      connection("k3", "c3", { relationshipStrength: 20, businessRelevanceScore: 90 }),
      connection("k4", "c4", {}),
    ],
    events: [], evidence: [], tasks: [], generatedAt: W0047_NOW,
  };
}

/** 档位缓存夹具：故意与 relationshipStrength 不一致（c1 只有「新认识」、c3 是「核心」），证明旧字段不读它。 */
const W0047_TIERS = [
  { contactId: "c1", tier: "new" as const, dormant: false },
  { contactId: "c2", tier: "active" as const, dormant: true },
  { contactId: "c3", tier: "core" as const, dormant: false },
  { contactId: "c5", tier: "active" as const, dormant: false },
];

function w0047Service(withTiers: boolean) {
  const graph = w0047Graph();
  const identity = { source: "fixture:network-distribution", sourceLabel: "Fixture" };
  const sections = computeDashboardSections(graph, { actorId: "account:xiaoyu", now: W0047_NOW, activityLimit: 4 });
  const distribution = createLiveNetworkDistributionAnalyticsService({
    now: () => W0047_NOW,
    provider: {
      ...identity,
      readNetworkDistributionGraph: () => graph,
      ...(withTiers ? { readRelationshipTiers: async () => W0047_TIERS } : {}),
    },
  });
  const ok = (data: unknown) => ({ success: true as const, data });
  return createMobileContactsDashboardService({
    now: () => W0047_NOW,
    loadAggregate: async () => ok((await sections).aggregate),
    loadSummary: async () => ok((await sections).summary),
    loadOpportunities: async () => ok((await sections).opportunities),
    loadGaps: async () => ok((await sections).gaps),
    loadDistributions: () => distribution.getDistributions(),
    loadProfile: async () => ({ success: false as const, error: { code: "PROFILE_UNAVAILABLE" } }),
    loadContacts: async () => ({ success: false as const, error: { code: "CONTACTS_UNAVAILABLE" } }),
    loadContactRoleCounts: async () => [{ role: "CEO", count: 5 }],
  });
}

async function w0047Body(withTiers: boolean): Promise<Record<string, unknown>> {
  const GET = createMobileContactsDashboardGetHandler(dependencies({ createService: () => w0047Service(withTiers) }));
  const response = await GET(new Request("http://localhost/api/mobile/contacts-dashboard?capabilities=roleCounts"));
  assert.equal(response.status, 200);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * W0049：结构标签新增的可选维度（seniority、region）与行业分组上的 `secondary` 子分组。
 * 从响应里取出并删掉，余下部分必须与 W0047 前的 golden 逐字段相同（旧键 industry／location／role／relationship
 * 与 relationshipStrengthDistribution 不变）。
 */
function takeW0049Additions(distributions: Record<string, unknown>) {
  const structure = distributions.structureDistributions as Record<string, unknown>;
  const added = { region: structure.region, seniority: structure.seniority, secondary: [] as unknown[] };
  delete structure.region;
  delete structure.seniority;
  for (const bucket of [...(structure.industry as Record<string, unknown>[]), ...(distributions.industryDistribution as Record<string, unknown>[])]) {
    if ("secondary" in bucket) {
      added.secondary.push(bucket.secondary);
      delete bucket.secondary;
    }
  }
  return added;
}

test("W0047 SC-03: the mobile response is field-for-field unchanged apart from the new optional relationshipTierDistribution", async () => {
  if (process.env.W0047_WRITE_GOLDEN === "1") {
    writeFileSync(W0047_GOLDEN, `${JSON.stringify(await w0047Body(false), null, 2)}\n`);
  }
  const golden = JSON.parse(readFileSync(W0047_GOLDEN, "utf8")) as { data: { distributions: Record<string, unknown> } };
  for (const withTiers of [false, true]) {
    const body = (await w0047Body(withTiers)) as { data: { distributions: Record<string, unknown> } };
    const tiers = body.data.distributions.relationshipTierDistribution;
    delete body.data.distributions.relationshipTierDistribution;
    const added = takeW0049Additions(body.data.distributions);
    // 夹具五人都没有职级、地区与行业：新维度各一个「缺数据」分组，未分类行业没有二级子分组。
    assert.deepEqual(added.seniority, [{ bucketId: "seniority_other", label: "其他", contactCount: 5, percentage: 100, evidenceIds: [], missingData: true }]);
    assert.deepEqual(added.region, [{ bucketId: "region_unknown", label: "地区待完善", contactCount: 5, percentage: 100, evidenceIds: [], missingData: true }]);
    assert.deepEqual(added.secondary, []);
    assert.deepEqual(body, golden, `withTiers=${withTiers}`);
    if (withTiers) {
      assert.deepEqual(tiers, [
        { tier: "new", relationshipCount: 1, percentage: 25, contactIds: ["c1"] },
        { tier: "active", relationshipCount: 1, percentage: 25, contactIds: ["c5"] },
        { tier: "core", relationshipCount: 1, percentage: 25, contactIds: ["c3"] },
        { tier: "dormant", relationshipCount: 1, percentage: 25, contactIds: ["c2"] },
      ]);
    } else {
      assert.deepEqual(tiers, []);
    }
  }
  // 旧字段仍是 relationshipStrength ?? businessRelevanceScore ?? 0：c1=82 strong、c2=50 warm、c3=20 weak（不看 90）、c4=0 weak。
  assert.deepEqual(
    (golden.data.distributions.relationshipStrengthDistribution as { strength: string; relationshipCount: number }[])
      .map((bucket) => [bucket.strength, bucket.relationshipCount]),
    [["strong", 1], ["warm", 1], ["weak", 2]],
  );
});
