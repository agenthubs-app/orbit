import { mobileContactsDashboardPayloadSchema } from "../../../../../shared/api-schema/mobile-contacts-dashboard";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { RelationshipTierGroup } from "../../../../../shared/contract/relationship-strength";
import { actionLinkLabel, activitySourceLabel, activityTypeLabel, contactActionTitle, contactIdFromActivityId, dueLabelCopy, structureBucketLabel } from "./network-copy";

/**
 * 分析视图的结构维度。旧四维（industry／location／role／relationship）留给概览与 App 口径；
 * W0049 结构标签只显示 industry（两级）／region／seniority／tier（W49-4）。
 */
export type AnalysisDimension = "industry" | "location" | "role" | "relationship" | "seniority" | "region" | "tier";
export type LegacyAnalysisDimension = "industry" | "location" | "role" | "relationship";
export type AnalysisSection<T> = { state: "unavailable" | "pending" } | { state: "ready" | "empty"; data: T };
export type AnalysisLink = { label: string; href: string };
/** `children`：只在行业一级分组上，为其二级分组（W49-3；百分比分母 = 一级分组人数）。 */
export type AnalysisBucket = { id: string; label: string; count: number; percentage: number; missingData: boolean; href: string; children?: AnalysisBucket[] };
/**
 * W0043 白名单：`judgment`、`dueLabel` 只放 Web 端模板或空串（示例期由 demo-network 填示例文案）；
 * 后端句子字段（reason、suggestedAction、actionBrief.judgment／steps／evidence）不进视图。
 */
export type AnalysisAction = {
  id: string; title: string; judgment: string; contactName: string; dueLabel: string;
  primary: AnalysisLink; secondary?: AnalysisLink;
};
export type AnalysisReportView = {
  current: { analysisVersion: "contacts.analysis@1"; sourceDataVersion: string };
  report: null | {
    analysisVersion: "contacts.analysis@1";
    body: string;
    generatedAt: string;
    messageId: string;
    sessionId: string;
    sourceDataVersion: string;
  };
  stale: boolean;
};
export type ContactsAnalysisView = { state: "error" | "pending" } | {
  state: "ready";
  generatedAt: string;
  /** 结构诊断句；W0043 起真实数据无可信句子时为空串（W0049 用快照填回），组件整块不渲染。 */
  summary: string;
  metrics: { contacts: number; newContacts: number; highValue: number; pendingFollowups: number; dormant: number };
  /**
   * `contactName`：动态对应的联系人（只有引导期示例数据填，概览据此给名字挂「示例」角标；真实数据不填）。
   * `contactId`：真实「新增联系人」动态从结构化 activityId 取出的联系人 id，概览据此在名单里找姓名（W0043）。
   * `label`／`source`：真实数据只放 Web 端双语模板或任务标题（用户数据），不放后端句子。
   */
  activity: Array<{ id: string; label: string; occurredAt: string; source: string; contactName?: string; contactId?: string }>;
  analysis: { state: "unavailable" } | ({ state: "ready" } & AnalysisReportView);
  goal: AnalysisSection<{ id: string | null; text: string; updatedAt: string; canEdit: boolean }>;
  structure: AnalysisSection<{
    /** W0049 新增的 seniority／region／tier 可缺省（示例期数据不带，按空数组处理）。 */
    dimensions: Record<LegacyAnalysisDimension, AnalysisBucket[]> & Partial<Record<Exclude<AnalysisDimension, LegacyAnalysisDimension>, AnalysisBucket[]>>;
    /**
     * W0047：关系健康 = 档位分布（新认识／有往来／核心／待唤醒，只由关系时间线推出），读新增的
     * `relationshipTierDistribution`；既有 relationshipStrengthDistribution 留给 App，Web 不再读（R-1）。
     */
    health: Array<{ id: RelationshipTierGroup; count: number; percentage: number }>;
    summary: string;
  }>;
  /** W43-2：W0050 之前不显示固定阈值的覆盖度分数与缺口，视图只保留区块状态与（暂为空串的）结构洞察句。 */
  coverage: AnalysisSection<{ summary: string }>;
  opportunities: AnalysisSection<{
    summary: string; actions: AnalysisAction[];
    /** 真实数据：姓名与公司（用户数据），`reason`／`action` 为空串；后端编造的 lastTouchpointDays 不进视图。 */
    dormant: Array<{ id: string; name: string; organization?: string; reason: string; action: string; href: string }>;
  }>;
};

export function contactsAnalysisToView(input: unknown, language: OrbitLanguage): ContactsAnalysisView {
  const parsed = mobileContactsDashboardPayloadSchema.safeParse(input);
  if (!parsed.success) return { state: "error" };
  const data = parsed.data;
  if (data.aggregate.state === "pending") return { state: "pending" };
  const section = <T extends { state: "success" | "empty" | "pending" }, V>(value: T | null, map: (value: T) => V): AnalysisSection<V> =>
    !value ? { state: "unavailable" } : value.state === "pending" ? { state: "pending" } : { state: value.state === "empty" ? "empty" : "ready", data: map(value) };
  const link = (action: { kind: string; contactId?: string }, fallbackId: string): AnalysisLink => ({
    label: actionLinkLabel(action.kind, language),
    href: action.kind === "open_pipeline" ? "/app/contacts/pipeline" : action.kind === "open_contacts" ? "/app/contacts" : `/app/contacts/${encodeURIComponent(action.contactId?.trim() || fallbackId)}`,
  });
  return {
    state: "ready",
    generatedAt: data.generatedAt,
    summary: "",
    metrics: {
      contacts: data.aggregate.relationshipAssetTotals.contacts,
      newContacts: data.aggregate.newContacts.count,
      highValue: data.aggregate.highValueCount,
      pendingFollowups: data.aggregate.pendingFollowups.count,
      dormant: data.aggregate.dormantContacts.count,
    },
    activity: data.aggregate.recentActivity.map((item) => {
      const contactId = item.type === "followup_due" ? undefined : contactIdFromActivityId(item.activityId);
      return {
        id: item.activityId,
        label: item.type === "followup_due" ? item.label.trim() : activityTypeLabel(item.type, language),
        occurredAt: item.occurredAt,
        source: activitySourceLabel(item.type, language),
        ...(contactId ? { contactId } : {}),
      };
    }),
    analysis: data.analysis ? {
      state: "ready",
      current: data.analysis.current,
      report: data.analysis.report ?? null,
      stale: data.analysis.stale,
    } : { state: "unavailable" },
    goal: section(data.profile, (value) => ({ id: value.profile?.id ?? null, text: value.profile?.relationshipGoal ?? "", updatedAt: value.profile?.updatedAt ?? "", canEdit: value.editor.canSave && Boolean(value.profile) })),
    structure: section(data.distributions, (value) => {
      const href = (dimension: string, bucketId: string) => `/app/contacts/analysis/${dimension}/${encodeURIComponent(bucketId)}`;
      type Bucket = (typeof value.structureDistributions.industry)[number];
      const buckets = (dimension: Exclude<AnalysisDimension, "tier">, list: readonly Bucket[] | undefined): AnalysisBucket[] => (list ?? []).map((bucket) => ({
        id: bucket.bucketId,
        label: structureBucketLabel(dimension, bucket.bucketId, bucket.label, language),
        count: bucket.contactCount, percentage: bucket.percentage, missingData: bucket.missingData,
        href: href(dimension, bucket.bucketId),
        ...(dimension === "industry" && bucket.secondary ? {
          children: bucket.secondary.map((child) => ({
            id: child.bucketId,
            label: structureBucketLabel("industry_secondary", child.bucketId, child.bucketId, language),
            count: child.contactCount, percentage: child.percentage, missingData: child.missingData,
            href: href("industry_secondary", child.bucketId),
          })),
        } : {}),
      }));
      const tiers = value.relationshipTierDistribution ?? [];
      const distributions = value.structureDistributions;
      return {
        dimensions: {
          industry: buckets("industry", distributions.industry),
          location: buckets("location", distributions.location),
          role: buckets("role", distributions.role),
          relationship: buckets("relationship", distributions.relationship),
          seniority: buckets("seniority", distributions.seniority),
          region: buckets("region", distributions.region),
          // W0049：关系强度档维度与关系健康同源（relationshipTierDistribution），可下钻到 tier 名单。
          tier: tiers.map((item) => ({
            id: item.tier, label: structureBucketLabel("tier", item.tier, item.tier, language),
            count: item.relationshipCount, percentage: item.percentage, missingData: false, href: href("tier", item.tier),
          })),
        },
        health: tiers.map((item) => ({ id: item.tier, count: item.relationshipCount, percentage: item.percentage })),
        summary: "",
      };
    }),
    coverage: section(data.gaps, () => ({ summary: "" })),
    opportunities: section(data.opportunities, (value) => ({
      summary: "",
      actions: value.highPriorityOpportunities.map((item) => ({
        id: item.opportunityId,
        title: item.title.trim() || contactActionTitle(item.contactName, language),
        judgment: "",
        contactName: item.contactName,
        dueLabel: dueLabelCopy(item.dueLabel, language),
        primary: item.actionBrief ? link(item.actionBrief.primaryAction, item.contactId) : link({ kind: "open_contact", contactId: item.contactId }, item.contactId),
        secondary: item.actionBrief?.secondaryAction ? link(item.actionBrief.secondaryAction, item.contactId) : undefined,
      })),
      dormant: value.dormantHighValueContacts.map((item) => ({ id: item.contactId, name: item.contactName, organization: item.organization.trim(), reason: "", action: "", href: `/app/contacts/${encodeURIComponent(item.contactId)}` })),
    })),
  };
}
