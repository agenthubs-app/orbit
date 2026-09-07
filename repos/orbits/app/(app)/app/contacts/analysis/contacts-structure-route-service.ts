import { z } from "zod";
import { createActorScopedNetworkDistributionAnalyticsService, createNetworkDistributionAnalyticsService } from "../../../../../features/dashboard/service-factory";
import type { NetworkDistributionAnalyticsService } from "../../../../../features/dashboard/distribution-contract";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { INDUSTRY_IDS, industryLabel } from "../../../../../shared/domain/industries";
import type { AnalysisDimension } from "./contacts-analysis-view-model";

const dimensionSchema = z.enum(["industry", "location", "role", "relationship"]);
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
  state: "ready"; dimension: AnalysisDimension; label: string; count: number; percentage: number; total: number; missingData: boolean;
  quality: Array<{ id: "strong" | "warm" | "weak"; count: number; percentage: number }>;
  commonTags: Array<{ label: string; count: number }>; insight: string;
  contacts: Array<{ id: string; name: string; organization: string; role: string; location: string; strength: "strong" | "warm" | "weak"; tags: string[]; href: string }>;
};

export function structureDetailToView(input: unknown, dimension: string, bucketId: string, language: OrbitLanguage): ContactsStructureDetailView {
  const parsed = detailSchema.safeParse(input);
  if (!parsed.success || parsed.data.dimension !== dimension || parsed.data.bucket.bucketId !== bucketId) return { state: "error" };
  const data = parsed.data;
  return {
    state: "ready", dimension: data.dimension,
    label: data.bucket.primaryIndustryId ? industryLabel(data.bucket.primaryIndustryId, language) : data.bucket.label,
    count: data.bucket.contactCount, percentage: data.bucket.percentage, total: data.totalContactCount, missingData: data.bucket.missingData,
    quality: data.relationshipQuality.map((item) => ({ id: item.id, count: item.contactCount, percentage: item.percentage })),
    commonTags: data.commonTags.map((item) => ({ label: item.label, count: item.contactCount })), insight: data.insight,
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
