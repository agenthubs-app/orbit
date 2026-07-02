import type {
  AppDashboardGapViewModel,
  AppDashboardIndustryBucketViewModel,
  AppDashboardMetricViewModel,
  AppDashboardOpportunityViewModel,
  AppDashboardRecentActivityViewModel,
  AppDashboardRouteViewModel,
} from "./dashboard-route-view-model";

type AppDashboardSuccessRouteViewModel = Extract<
  AppDashboardRouteViewModel,
  { state: "success" }
>;

export interface OrbitDashboardMetricView {
  caption: string;
  id: string;
  label: string;
  value: number;
}

export interface OrbitDashboardPriorityView {
  contactName: string;
  dueLabel: string;
  organization: string;
  score: number;
  title: string;
  action: string;
}

export interface OrbitDashboardCoverageView {
  currentCount: number;
  label: string;
  severity: string;
  targetCount: number;
  action: string;
}

export interface OrbitDashboardIndustryView {
  count: number;
  label: string;
  organizations: readonly string[];
  percentage: number;
}

export interface OrbitDashboardActivityView {
  id: string;
  label: string;
  occurredAt: string;
  sourceLabel: string;
  type: string;
}

export interface OrbitDashboardViewModel {
  audit: {
    checkedCollections: number;
    openWarnings: number;
    readyCollections: number;
  };
  coverageScore: number;
  currentGoal: string;
  industries: readonly OrbitDashboardIndustryView[];
  metrics: readonly OrbitDashboardMetricView[];
  nextAction: string;
  priority: OrbitDashboardPriorityView | null;
  recentActivity: readonly OrbitDashboardActivityView[];
  topGaps: readonly OrbitDashboardCoverageView[];
  totals: {
    contacts: number;
    connections: number;
    evidenceBackedRelationships: number;
    eventsRepresented: number;
  };
}

function metricCaption(metric: AppDashboardMetricViewModel): string {
  if (metric.id === "relationship-assets") {
    return "Evidence-backed network";
  }

  if (metric.id === "pending-followups") {
    return "Needs review";
  }

  if (metric.id === "dormant-contacts") {
    return "Needs reactivation";
  }

  return "Source-backed signal";
}

function priorityView(
  opportunities: readonly AppDashboardOpportunityViewModel[],
): OrbitDashboardPriorityView | null {
  const opportunity = opportunities[0];

  if (!opportunity) {
    return null;
  }

  return {
    action: opportunity.suggestedAction,
    contactName: opportunity.contactName,
    dueLabel: opportunity.dueLabel,
    organization: opportunity.organization,
    score: opportunity.priorityScore,
    title: opportunity.title,
  };
}

function gapView(gap: AppDashboardGapViewModel): OrbitDashboardCoverageView {
  return {
    action: gap.recommendedAction,
    currentCount: gap.currentCount,
    label: gap.label,
    severity: gap.severity,
    targetCount: gap.targetCount,
  };
}

function industryView(
  bucket: AppDashboardIndustryBucketViewModel,
): OrbitDashboardIndustryView {
  return {
    count: bucket.contactCount,
    label: bucket.label,
    organizations: bucket.topOrganizations,
    percentage: bucket.percentage,
  };
}

function activityView(
  activity: AppDashboardRecentActivityViewModel,
): OrbitDashboardActivityView {
  return {
    id: activity.activityId,
    label: activity.label,
    occurredAt: activity.occurredAt,
    sourceLabel: activity.sourceLabel,
    type: activity.type,
  };
}

export function dashboardRouteToOrbitDashboardViewModel(
  model: AppDashboardSuccessRouteViewModel,
): OrbitDashboardViewModel {
  const workspace = model.workspace;
  const readyCollections = workspace.audit.auditedCollections.filter(
    (collection) => collection.provenanceComplete,
  ).length;
  const currentGoal =
    workspace.opportunities.currentGoalMatches[0]?.label ??
    workspace.gaps.gaps[0]?.label ??
    "Relationship coverage";

  return {
    audit: {
      checkedCollections: workspace.audit.auditedCollections.length,
      openWarnings: workspace.audit.findings.length,
      readyCollections,
    },
    coverageScore: workspace.gaps.coverageScore,
    currentGoal,
    industries: workspace.distributions.industryDistribution
      .slice(0, 4)
      .map(industryView),
    metrics: workspace.summary.metrics.map((metric) => ({
      caption: metricCaption(metric),
      id: metric.id,
      label: metric.label,
      value: metric.value,
    })),
    nextAction:
      workspace.opportunities.nextAction ||
      workspace.gaps.nextAction ||
      workspace.aggregate.nextAction,
    priority: priorityView(workspace.opportunities.highPriorityOpportunities),
    recentActivity: workspace.aggregate.recentActivity.slice(0, 5).map(activityView),
    topGaps: workspace.gaps.gaps.slice(0, 3).map(gapView),
    totals: workspace.aggregate.relationshipAssetTotals,
  };
}
