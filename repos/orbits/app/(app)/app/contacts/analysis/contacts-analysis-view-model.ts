import { mobileContactsDashboardPayloadSchema } from "../../../../../shared/api-schema/mobile-contacts-dashboard";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { industryLabel } from "../../../../../shared/domain/industries";
import { actionLinkLabel, activitySourceLabel, activityTypeLabel, contactActionTitle, contactIdFromActivityId, dueLabelCopy, systemBucketName } from "./network-copy";

export type AnalysisDimension = "industry" | "location" | "role" | "relationship";
export type AnalysisSection<T> = { state: "unavailable" | "pending" } | { state: "ready" | "empty"; data: T };
export type AnalysisLink = { label: string; href: string };
export type AnalysisBucket = { id: string; label: string; count: number; percentage: number; missingData: boolean; href: string };
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
    dimensions: Record<AnalysisDimension, AnalysisBucket[]>;
    health: Array<{ id: "strong" | "warm" | "weak"; count: number; percentage: number; risk: "low" | "moderate" | "high" }>;
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
    structure: section(data.distributions, (value) => ({
      dimensions: Object.fromEntries(Object.entries(value.structureDistributions).map(([dimension, buckets]) => [dimension, buckets.map((bucket) => ({
        id: bucket.bucketId,
        label: bucket.primaryIndustryId ? industryLabel(bucket.primaryIndustryId, language) : systemBucketName(bucket.bucketId, language) ?? bucket.label,
        count: bucket.contactCount, percentage: bucket.percentage, missingData: bucket.missingData,
        href: `/app/contacts/analysis/${dimension}/${encodeURIComponent(bucket.bucketId)}`,
      }))])) as Record<AnalysisDimension, AnalysisBucket[]>,
      health: value.relationshipStrengthDistribution.map((item) => ({ id: item.strength, count: item.relationshipCount, percentage: item.percentage, risk: item.followupRisk })),
      summary: "",
    })),
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
