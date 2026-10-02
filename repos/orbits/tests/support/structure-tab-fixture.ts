/**
 * W0049 结构标签测试夹具：35 位联系人（名单分页只返回 30）的图 → shared/compute 分布 → 移动端 payload → 视图模型，
 * 以及一份快照视图（诊断 + 4 条洞察 + 1 条缺口块，依据里混有他人与已删除的 id）。
 */
import assert from "node:assert/strict";

import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import type { SnapshotReadView } from "../../app/(app)/app/contacts/analysis/structure-tab-model";
import type { NetworkSnapshotViewBlock } from "../../features/network-analysis/contract";
import { createConfiguredMobileContactsDashboardService } from "../../features/mobile/contacts-dashboard-service";
import { createLiveNetworkDistributionAnalyticsService } from "../../shared/compute/dashboard-distribution";
import type { DashboardGraphContact, LiveDashboardGraph } from "../../shared/compute/dashboard-graph";
import type { RelationshipTierAssignment } from "../../shared/compute/dashboard-distribution-contract";

export const NOW = "2026-10-02T03:00:00.000Z";

// ---- 35 位联系人夹具 ----
const SENIORITY = ["individual_contributor", "manager", "director", "vp", "c_level", "founder", undefined] as const;
const TIERS: RelationshipTierAssignment[] = [];

export function graph35(): LiveDashboardGraph {
  const contacts: DashboardGraphContact[] = [];
  for (let index = 0; index < 35; index += 1) {
    const id = `c${String(index).padStart(2, "0")}`;
    // 行业：0–14 科技（8 企业软件、4 AI、3 无二级）、15–24 金融、25–34 无行业。
    const primaryIndustryId = index < 15 ? "technology_internet" : index < 25 ? "finance_investment" : undefined;
    const secondaryIndustryId = index < 8 ? "technology_internet.enterprise_software" : index < 12 ? "technology_internet.ai_data" : undefined;
    // 地区：东京 12、大阪 8、新加坡 5、无 10。
    const region = index < 12 ? { countryCode: "JP", city: "Tokyo" } : index < 20 ? { countryCode: "JP", city: "Osaka" } : index < 25 ? { countryCode: "SG", city: null } : undefined;
    const seniorityLevel = SENIORITY[index % SENIORITY.length];
    contacts.push({
      id, displayName: `联系人 ${index}`, stage: "active", source: { type: "manual", id: `src:${id}` } as never,
      evidenceIds: [`e:${id}`], createdAt: NOW, updatedAt: NOW,
      ...(primaryIndustryId ? { primaryIndustryId } : {}),
      ...(secondaryIndustryId ? { secondaryIndustryId } : {}),
      ...(seniorityLevel ? { seniorityLevel } : {}),
      ...(region ? { region } : {}),
    } as DashboardGraphContact);
  }
  TIERS.length = 0;
  // 档位：新认识 15、有往来 10、核心 5、待唤醒 5（全部 35 人都有缓存行）。
  contacts.forEach((contact, index) => {
    TIERS.push({ contactId: contact.id, tier: index < 15 ? "new" : index < 25 ? "active" : "core", dormant: index >= 30 });
  });
  return { contacts, connections: [], events: [], evidence: [], tasks: [], generatedAt: NOW };
}

export function distributionService() {
  const graph = graph35();
  return createLiveNetworkDistributionAnalyticsService({
    now: () => NOW,
    provider: { source: "fixture:w0049", sourceLabel: "Fixture", readNetworkDistributionGraph: () => graph, readRelationshipTiers: () => TIERS },
  });
}

export async function analysisView(language: "zh" | "en" = "zh") {
  const service = distributionService();
  const result = await service.getDistributions();
  assert.ok(result.success);
  const mock = await createConfiguredMobileContactsDashboardService("mock").getDashboard({ actorId: "w0049" });
  assert.ok(mock.success);
  const payload = structuredClone(mock.data) as Record<string, unknown>;
  payload.distributions = result.data;
  return { service, payload, view: contactsAnalysisToView(payload, language) };
}

const block = (key: string, kind: NetworkSnapshotViewBlock["kind"], text: string, contactIds: string[]): NetworkSnapshotViewBlock => ({ key, kind, text, evidence: { contactIds, recordIds: [] } });
export function snapshotFixture(state: SnapshotReadView["state"] = "ready"): SnapshotReadView {
  return {
    state,
    generatedAt: "2026-10-01T03:00:00.000Z",
    contactCount: 35,
    freshness: { job: "none", newContactCount: 0, stale: false },
    blocks: state === "ready" ? [
      block("diagnosis", "diagnosis", "科技行业占比高，金融决策层偏少。", ["c00", "c15"]),
      block("insight-1", "insight", "东京联系人集中在科技行业。", ["c00", "c01", "bob:c99"]),
      block("insight-2", "insight", "金融行业缺少决策层。", ["c15", "deleted:c50"]),
      block("insight-3", "insight", "新认识的人还没有往来。", ["c02", "c03", "c02"]),
      block("gap-1", "gap", "缺口块不在结构标签。", ["c04"]),
      block("insight-4", "insight", "第四条洞察不显示。", ["c05"]),
    ] : [],
  };
}

