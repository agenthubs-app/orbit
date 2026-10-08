import { z } from "zod";
import { createActorScopedNetworkDistributionAnalyticsService, createNetworkDistributionAnalyticsService } from "../../../../../features/dashboard/service-factory";
import type { NetworkDistributionAnalyticsService } from "../../../../../features/dashboard/distribution-contract";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { INDUSTRY_IDS } from "../../../../../shared/domain/industries";
import type { AnalysisDimension } from "./contacts-analysis-view-model";
import { structureBucketLabel, structureDetailInsight } from "./network-copy";

/** W0049：结构标签的新维度（职级、规范地区、行业二级、关系强度档）也能下钻；与 shared/compute 的下钻白名单一致。 */
const dimensionSchema = z.enum(["industry", "location", "role", "relationship", "seniority", "region", "industry_secondary", "tier"]);
export type StructureDetailDimension = AnalysisDimension | "industry_secondary";
const count = z.number().finite().nonnegative();
const percentage = count.max(100);
const strength = z.enum(["strong", "warm", "weak"]);
const detailSchema = z.object({
  state: z.enum(["success", "empty"]), dimension: dimensionSchema,
  bucket: z.object({ bucketId: z.string().min(1), label: z.string(), contactCount: count, percentage, missingData: z.boolean(), primaryIndustryId: z.enum(INDUSTRY_IDS).optional() }),
  totalContactCount: count,
  relationshipQuality: z.array(z.object({ id: strength, label: z.string(), contactCount: count, percentage })),
  commonTags: z.array(z.object({ label: z.string(), contactCount: count })),
  insight: z.string(),
  contacts: z.array(z.object({ id: z.string().min(1), displayName: z.string(), organization: z.string(), role: z.string(), location: z.string(), relationshipStrength: strength, tags: z.array(z.string()) })),
});

export type ContactsStructureDetailView = { state: "error" } | {
  state: "ready"; dimension: StructureDetailDimension; label: string; count: number; percentage: number; total: number; missingData: boolean;
  quality: Array<{ id: "strong" | "warm" | "weak"; count: number; percentage: number }>;
  commonTags: Array<{ label: string; count: number }>; insight: string;
  contacts: Array<{ id: string; name: string; organization: string; role: string; location: string; strength: "strong" | "warm" | "weak"; tags: string[]; href: string }>;
};

export function structureDetailToView(input: unknown, dimension: string, bucketId: string, language: OrbitLanguage): ContactsStructureDetailView {
  const parsed = detailSchema.safeParse(input);
  if (!parsed.success || parsed.data.dimension !== dimension || parsed.data.bucket.bucketId !== bucketId) return { state: "error" };
  const data = parsed.data;
  // W0043：分组名用双语封闭集，洞察句由计数与主要关系质量在 Web 端重拼（后端 insight 只有中文），不用后端句子。
  const label = structureBucketLabel(data.dimension, data.bucket.bucketId, data.bucket.label, language);
  const strongest = data.relationshipQuality.reduce<(typeof data.relationshipQuality)[number] | null>((best, item) => !best || item.contactCount > best.contactCount ? item : best, null);
  return {
    state: "ready", dimension: data.dimension,
    label,
    count: data.bucket.contactCount, percentage: data.bucket.percentage, total: data.totalContactCount, missingData: data.bucket.missingData,
    quality: data.relationshipQuality.map((item) => ({ id: item.id, count: item.contactCount, percentage: item.percentage })),
    commonTags: data.commonTags.map((item) => ({ label: item.label, count: item.contactCount })),
    insight: structureDetailInsight({ label, count: data.bucket.contactCount, strongest: strongest?.id ?? "weak" }, language),
    contacts: data.contacts.map((item) => ({ id: item.id, name: item.displayName, organization: item.organization, role: item.role, location: item.location, strength: item.relationshipStrength, tags: item.tags, href: `/app/contacts/${encodeURIComponent(item.id)}` })),
  };
}

export async function loadContactsStructureDetail({ actorId, dimension, bucketId, language, service }: {
  actorId: string; dimension: string; bucketId: string; language: OrbitLanguage;
  service?: Pick<NetworkDistributionAnalyticsService, "getStructureDetail">;
}): Promise<ContactsStructureDetailView> {
  if (!actorId.trim() || !dimensionSchema.safeParse(dimension).success || !bucketId.trim()) return { state: "error" };
  try {
    const mode = resolveFeatureMode();
    const resolved = service ?? (mode === "live" ? createActorScopedNetworkDistributionAnalyticsService(actorId) : createNetworkDistributionAnalyticsService(mode));
    const result = await resolved.getStructureDetail({ dimension, bucketId });
    return result.success ? structureDetailToView(result.data, dimension, bucketId, language) : { state: "error" };
  } catch { return { state: "error" }; }
}
