import { z } from "zod";
import { mobileContactsDashboardPayloadSchema } from "../../../../../shared/api-schema/mobile-contacts-dashboard";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { industryLabel } from "../../../../../shared/domain/industries";

export type AnalysisDimension = "industry" | "location" | "role" | "relationship";
export type AnalysisSection<T> = { state: "unavailable" | "pending" } | { state: "ready" | "empty"; data: T };
export type AnalysisLink = { label: string; href: string };
export type AnalysisBucket = { id: string; label: string; count: number; percentage: number; missingData: boolean; href: string };
export type AnalysisAction = {
  id: string; title: string; judgment: string; contactName: string; dueLabel: string;
  evidence: string[]; steps: string[]; primary: AnalysisLink; secondary?: AnalysisLink;
};
export type ContactsAnalysisView = { state: "error" | "pending" } | {
  state: "ready";
  generatedAt: string;
  summary: string;
  metrics: { contacts: number; newContacts: number; highValue: number; pendingFollowups: number; dormant: number };
  activity: Array<{ id: string; label: string; occurredAt: string; source: string }>;
  goal: AnalysisSection<{ id: string | null; text: string; canEdit: boolean }>;
  structure: AnalysisSection<{
    dimensions: Record<AnalysisDimension, AnalysisBucket[]>;
    health: Array<{ id: "strong" | "warm" | "weak"; count: number; percentage: number; risk: "low" | "moderate" | "high" }>;
    summary: string;
  }>;
  coverage: AnalysisSection<{
    score: number; summary: string;
    gaps: Array<{ id: string; label: string; severity: "high" | "medium" | "low"; current: number; target: number; action: string }>;
  }>;
  opportunities: AnalysisSection<{
    summary: string; actions: AnalysisAction[];
    dormant: Array<{ id: string; name: string; reason: string; action: string; href: string }>;
  }>;
};

export function contactsAnalysisToView(input: unknown, language: OrbitLanguage): ContactsAnalysisView {
  const parsed = mobileContactsDashboardPayloadSchema.safeParse(input);
  if (!parsed.success) return { state: "error" };
  const data = parsed.data;
  if (data.aggregate.state === "pending") return { state: "pending" };
  const section = <T extends { state: "success" | "empty" | "pending" }, V>(value: T | null, map: (value: T) => V): AnalysisSection<V> =>
    !value ? { state: "unavailable" } : value.state === "pending" ? { state: "pending" } : { state: value.state === "empty" ? "empty" : "ready", data: map(value) };
  const link = (action: { kind: string; label: string; contactId?: string }, fallbackId: string): AnalysisLink => ({
    label: action.label,
    href: action.kind === "open_pipeline" ? "/app/contacts/pipeline" : action.kind === "open_contacts" ? "/app/contacts" : `/app/contacts/${encodeURIComponent(action.contactId?.trim() || fallbackId)}`,
  });
  return {
    state: "ready",
    generatedAt: data.generatedAt,
    summary: data.aggregate.summary,
    metrics: {
      contacts: data.aggregate.relationshipAssetTotals.contacts,
      newContacts: data.aggregate.newContacts.count,
      highValue: data.aggregate.highValueCount,
      pendingFollowups: data.aggregate.pendingFollowups.count,
      dormant: data.aggregate.dormantContacts.count,
    },
    activity: data.aggregate.recentActivity.map((item) => ({ id: item.activityId, label: item.label, occurredAt: item.occurredAt, source: item.sourceLabel })),
    goal: section(data.profile, (value) => ({ id: value.profile?.id ?? null, text: value.profile?.relationshipGoal ?? "", canEdit: value.editor.canSave && Boolean(value.profile) })),
    structure: section(data.distributions, (value) => ({
      dimensions: Object.fromEntries(Object.entries(value.structureDistributions).map(([dimension, buckets]) => [dimension, buckets.map((bucket) => ({
        id: bucket.bucketId,
        label: bucket.primaryIndustryId ? industryLabel(bucket.primaryIndustryId, language) : bucket.label,
        count: bucket.contactCount, percentage: bucket.percentage, missingData: bucket.missingData,
        href: `/app/contacts/analysis/${dimension}/${encodeURIComponent(bucket.bucketId)}`,
      }))])) as Record<AnalysisDimension, AnalysisBucket[]>,
      health: value.relationshipStrengthDistribution.map((item) => ({ id: item.strength, count: item.relationshipCount, percentage: item.percentage, risk: item.followupRisk })),
      summary: value.summary,
    })),
    coverage: section(data.gaps, (value) => ({ score: value.coverageScore, summary: value.summary, gaps: value.gaps.map((gap) => ({ id: gap.gapId, label: gap.label, severity: gap.severity, current: gap.currentCount, target: gap.targetCount, action: gap.recommendedAction })) })),
    opportunities: section(data.opportunities, (value) => ({
      summary: value.summary,
      actions: value.highPriorityOpportunities.map((item) => {
        const sources = z.array(z.object({ id: z.string().min(1), label: z.string().trim().min(1) })).safeParse(item.sourceRefs);
        return {
        id: item.opportunityId, title: item.actionBrief?.title ?? item.title,
        judgment: item.actionBrief?.judgment ?? item.reason, contactName: item.contactName, dueLabel: item.dueLabel,
        evidence: item.actionBrief?.evidence ?? (sources.success ? sources.data.map((source) => source.label) : []), steps: item.actionBrief?.steps ?? (item.suggestedAction ? [item.suggestedAction] : []),
        primary: item.actionBrief ? link(item.actionBrief.primaryAction, item.contactId) : { label: { zh: "查看联系人", en: "View contact", ja: "連絡先を見る" }[language], href: `/app/contacts/${encodeURIComponent(item.contactId)}` },
        secondary: item.actionBrief?.secondaryAction ? link(item.actionBrief.secondaryAction, item.contactId) : undefined,
      }; }),
      dormant: value.dormantHighValueContacts.map((item) => ({ id: item.contactId, name: item.contactName, reason: item.reason, action: item.suggestedAction, href: `/app/contacts/${encodeURIComponent(item.contactId)}` })),
    })),
  };
}
