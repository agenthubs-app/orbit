import type {
  DashboardAggregatePayload,
  DashboardAggregateSummaryPayload,
} from "./dashboard-contract";
import type {
  NetworkDistributionAnalyticsPayload,
  NetworkGapAnalysisPayload,
} from "./dashboard-distribution-contract";
import type { OpportunityReminderAnalyticsPayload } from "./dashboard-opportunity-contract";
import { createLiveDashboardAggregateService } from "./dashboard-aggregate";
import { createLiveNetworkDistributionAnalyticsService } from "./dashboard-distribution";
import { createLiveOpportunityReminderAnalyticsService } from "./dashboard-opportunity";
import { dashboardContactRoleCounts, type LiveDashboardGraph } from "./dashboard-graph";

/**
 * Sprint 0117 (dashboard D3): every dashboard and contacts-analysis section the
 * App shows, computed from one graph by the server's own services — the same
 * functions the server's graph oracle and snapshot recompute run — so each
 * number and list equals the server's answer for the same data
 * (tests/services/sync-dashboard-graph-postgres.test.ts compares them with the
 * server's SQL read model and snapshot).
 *
 * `source`/`sourceLabel` only fill each section's provenance; the server's
 * values are passed by the parity test, the App passes its own.
 */
export interface DashboardSectionIdentity {
  source: string;
  sourceLabel: string;
}

export interface DashboardLocalSectionsInput {
  actorId: string;
  /** The request time, ISO (the device's clock on the App). */
  now: string;
  /** Recent activity items (the App's dashboard and contacts analysis ask for 4). */
  activityLimit?: number;
  aggregate?: DashboardSectionIdentity;
  distribution?: DashboardSectionIdentity;
  opportunity?: DashboardSectionIdentity;
}

export interface DashboardLocalSections {
  aggregate: DashboardAggregatePayload;
  summary: DashboardAggregateSummaryPayload;
  distributions: NetworkDistributionAnalyticsPayload;
  gaps: NetworkGapAnalysisPayload;
  opportunities: OpportunityReminderAnalyticsPayload;
  roleCounts: { role: string; count: number }[];
}

export const DASHBOARD_DEVICE_IDENTITY = {
  aggregate: { source: "device-mirror:dashboard", sourceLabel: "Dashboard device copy" },
  distribution: { source: "device-mirror:network-distribution", sourceLabel: "Dashboard device copy" },
  opportunity: { source: "device-mirror:opportunity-reminder", sourceLabel: "Dashboard device copy" },
} as const satisfies Record<"aggregate" | "distribution" | "opportunity", DashboardSectionIdentity>;

function expectSuccess<T>(result: { success: true; data: T } | { success: false; error: { code: string } }, section: string): T {
  if (result.success === false) throw new Error(`DASHBOARD_LOCAL_${section.toUpperCase()}_FAILED: ${result.error.code}`);
  return result.data;
}

export async function computeDashboardSections(graph: LiveDashboardGraph, input: DashboardLocalSectionsInput): Promise<DashboardLocalSections> {
  const aggregateIdentity = input.aggregate ?? DASHBOARD_DEVICE_IDENTITY.aggregate;
  const distributionIdentity = input.distribution ?? DASHBOARD_DEVICE_IDENTITY.distribution;
  const opportunityIdentity = input.opportunity ?? DASHBOARD_DEVICE_IDENTITY.opportunity;
  const now = () => input.now;
  const dashboard = createLiveDashboardAggregateService({
    provider: { ...aggregateIdentity, readDashboardGraph: () => graph, readDashboardGraphForAccount: () => graph },
  });
  const distribution = createLiveNetworkDistributionAnalyticsService({
    now,
    provider: { ...distributionIdentity, readNetworkDistributionGraph: () => graph },
  });
  const opportunity = createLiveOpportunityReminderAnalyticsService({
    now,
    provider: { ...opportunityIdentity, readOpportunityGraph: () => graph },
  });
  const [aggregate, summary, distributions, gaps, opportunities] = await Promise.all([
    dashboard.getDashboardAggregate({ actorId: input.actorId, ...(input.activityLimit === undefined ? {} : { activityLimit: input.activityLimit }) }),
    dashboard.getDashboardSummary({ actorId: input.actorId }),
    distribution.getDistributions(),
    distribution.getNetworkGaps(),
    opportunity.getOpportunityReminderAnalytics(),
  ]);
  return {
    aggregate: expectSuccess(aggregate, "aggregate"),
    summary: expectSuccess(summary, "summary"),
    distributions: expectSuccess(distributions, "distributions"),
    gaps: expectSuccess(gaps, "gaps"),
    opportunities: expectSuccess(opportunities, "opportunities"),
    roleCounts: dashboardContactRoleCounts(graph),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Contact ids that the contacts-analysis page (App and web) displays or links (moved from features/mobile/contacts-dashboard-service.ts, sprint 0117). */
export function referencedContactIds(sections: {
  aggregate: unknown;
  opportunities: unknown;
}): readonly string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = stringValue(value);
    if (id) ids.add(id);
  };
  const list = (value: unknown): readonly Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      : [];
  const aggregate = (sections.aggregate ?? {}) as Record<string, any>;
  for (const item of list(aggregate.newContacts?.contacts)) add(item.contactId);
  for (const item of list(aggregate.dormantContacts?.contacts)) add(item.contactId);
  const opportunities = (sections.opportunities ?? {}) as Record<string, any>;
  for (const item of list(opportunities.highPriorityOpportunities)) {
    add(item.contactId);
    const brief = (item.actionBrief ?? {}) as Record<string, any>;
    add(brief.primaryAction?.contactId);
    add(brief.secondaryAction?.contactId);
  }
  for (const item of list(opportunities.dormantHighValueContacts)) add(item.contactId);
  return [...ids];
}
