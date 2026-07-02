import type {
  SourceConsistencyAuditedCollection,
  SourceConsistencyAuditFinding,
  SourceConsistencyProvenanceAuditPayload,
  SourceConsistencyProvenanceAuditResult,
  SourceConsistencyProvenanceAuditRunResult,
} from "../../../../../features/audit/provenance-contract";
import type {
  DashboardAggregatePayload,
  DashboardAggregateResult,
  DashboardAggregateSummaryPayload,
  DashboardAggregateSummaryResult,
  DashboardHighValueRelationship,
  DashboardNewContact,
  DashboardRecentActivity,
  DashboardSummaryMetric,
} from "../../../../../features/dashboard/contract";
import type { DashboardAggregateServiceResult } from "../../../../../features/dashboard/service";
import type {
  IndustryDistributionBucket,
  NetworkDistributionAnalyticsPayload,
  NetworkDistributionAnalyticsResult,
  NetworkDistributionAnalyticsServiceResult,
  NetworkGapAnalysisItem,
  NetworkGapAnalysisPayload,
  NetworkGapAnalysisResult,
  RelationshipStrengthDistributionBucket,
  ValueTypeDistributionBucket,
} from "../../../../../features/dashboard/distribution-contract";
import type {
  HighPriorityOpportunity,
  OpportunityReminderAnalyticsPayload,
  OpportunityReminderAnalyticsResult,
  OpportunityReminderAnalyticsServiceResult,
  OpportunityReminderRecomputeResult,
} from "../../../../../features/dashboard/opportunity-contract";
import { createAppDashboardRouteServices } from "./dashboard-service-factory";

export type AppDashboardSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppDashboardRouteScenario = "empty" | "pending" | "failure";

export type AppDashboardAggregateViewModel = DashboardAggregatePayload;
export type AppDashboardAuditCollectionViewModel =
  SourceConsistencyAuditedCollection;
export type AppDashboardAuditFindingViewModel = SourceConsistencyAuditFinding;
export type AppDashboardAuditViewModel = SourceConsistencyProvenanceAuditPayload;
export type AppDashboardDistributionViewModel =
  NetworkDistributionAnalyticsPayload;
export type AppDashboardGapViewModel = NetworkGapAnalysisItem;
export type AppDashboardGapsViewModel = NetworkGapAnalysisPayload;
export type AppDashboardHighValueRelationshipViewModel =
  DashboardHighValueRelationship;
export type AppDashboardIndustryBucketViewModel = IndustryDistributionBucket;
export type AppDashboardMetricViewModel = DashboardSummaryMetric;
export type AppDashboardNewContactViewModel = DashboardNewContact;
export type AppDashboardOpportunityViewModel = HighPriorityOpportunity;
export type AppDashboardOpportunitiesViewModel =
  OpportunityReminderAnalyticsPayload;
export type AppDashboardRecentActivityViewModel = DashboardRecentActivity;
export type AppDashboardStrengthBucketViewModel =
  RelationshipStrengthDistributionBucket;
export type AppDashboardSummaryViewModel = DashboardAggregateSummaryPayload;
export type AppDashboardValueTypeBucketViewModel = ValueTypeDistributionBucket;

type RouteStateResult =
  | DashboardAggregateResult
  | DashboardAggregateSummaryResult
  | NetworkDistributionAnalyticsResult
  | NetworkGapAnalysisResult
  | OpportunityReminderAnalyticsResult
  | SourceConsistencyProvenanceAuditResult;
type RouteStateFailure = Extract<RouteStateResult, { success: false }>;

export interface AppDashboardRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly { href: string; label: string }[];
  scenario: AppDashboardRouteScenario;
}

export type AppDashboardActionResultViewModel =
  | {
      state: "failure";
      errorCode: string;
    }
  | {
      deliveryChanged: boolean;
      generatedFindingCount: number;
      generatedOpportunityCount: number;
      state: "success";
    };

export interface AppDashboardSuccessViewModel {
  actionResult: AppDashboardActionResultViewModel | null;
  aggregate: AppDashboardAggregateViewModel;
  audit: AppDashboardAuditViewModel;
  distributions: AppDashboardDistributionViewModel;
  gaps: AppDashboardGapsViewModel;
  opportunities: AppDashboardOpportunitiesViewModel;
  summary: AppDashboardSummaryViewModel;
}

export type AppDashboardRouteViewModel =
  | {
      routeState: AppDashboardRouteStateViewModel;
      state: "route-state";
    }
  | {
      state: "success";
      workspace: AppDashboardSuccessViewModel;
    };

function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

const localRouteStateSafetyCopy = bilingualText(
  "显示此状态时，不会产生保存记录、审计报告、合规报告、消息、通知、自动写作调用或外部网络请求。",
  "No saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs while this state is shown.",
);

const routeRecoveryActions: Record<
  AppDashboardRouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/dashboard",
      label: bilingualText("显示活跃仪表盘", "Show active dashboard"),
    },
    {
      href: "/app/dashboard?action=run-dashboard-review",
      label: bilingualText("预览仪表盘复核", "Preview dashboard review"),
    },
  ],
  failure: [
    {
      href: "/app/dashboard",
      label: bilingualText("重新加载仪表盘", "Reload dashboard"),
    },
    {
      href: "/app/dashboard?scenario=pending",
      label: bilingualText("检查来源状态", "Check source status"),
    },
  ],
  pending: [
    {
      href: "/app/dashboard",
      label: bilingualText("返回活跃仪表盘", "Return to active dashboard"),
    },
  ],
};

function readSearchParam(
  searchParams: AppDashboardSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppDashboardSearchParams | undefined,
): AppDashboardRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function isRouteStateFailure(result: RouteStateResult): result is RouteStateFailure {
  return result.success === false;
}

function evidenceIdsForResult(result: RouteStateResult): readonly string[] {
  if (result.success === true) {
    return result.data.provenance.evidenceIds;
  }

  return result.error.evidenceIds;
}

function uniqueEvidenceIds(results: readonly RouteStateResult[]): string[] {
  return Array.from(
    new Set(results.flatMap((result) => evidenceIdsForResult(result))),
  );
}

function firstFailure(results: readonly RouteStateResult[]): RouteStateFailure | null {
  return results.find(isRouteStateFailure) ?? null;
}

async function resolveDashboardAggregateResult(
  result: DashboardAggregateServiceResult<DashboardAggregateResult>,
): Promise<DashboardAggregateResult> {
  return await result;
}

async function resolveDashboardAggregateSummaryResult(
  result: DashboardAggregateServiceResult<DashboardAggregateSummaryResult>,
): Promise<DashboardAggregateSummaryResult> {
  return await result;
}

async function resolveNetworkDistributionResult(
  result: NetworkDistributionAnalyticsServiceResult<NetworkDistributionAnalyticsResult>,
): Promise<NetworkDistributionAnalyticsResult> {
  return await result;
}

async function resolveNetworkGapAnalysisResult(
  result: NetworkDistributionAnalyticsServiceResult<NetworkGapAnalysisResult>,
): Promise<NetworkGapAnalysisResult> {
  return await result;
}

async function resolveOpportunityReminderResult(
  result: OpportunityReminderAnalyticsServiceResult<OpportunityReminderAnalyticsResult>,
): Promise<OpportunityReminderAnalyticsResult> {
  return await result;
}

async function resolveOpportunityRecomputeResult(
  result: OpportunityReminderAnalyticsServiceResult<OpportunityReminderRecomputeResult>,
): Promise<OpportunityReminderRecomputeResult> {
  return await result;
}

function stateCopy(scenario: AppDashboardRouteScenario) {
  if (scenario === "empty") {
    return {
      description: bilingualText(
        "复核仪表盘趋势前，先添加有来源的联系人或活动上下文。",
        "Add source-backed contacts or event context before reviewing dashboard trends.",
      ),
      emptyState: bilingualText(
        "还没有关系活动具备足够来源证据可供仪表盘复核。",
        "No relationship activity has enough source evidence for dashboard review.",
      ),
      guardrail: localRouteStateSafetyCopy,
      nextStep: bilingualText(
        "联系人、活动、跟进或审计记录存在后再返回。",
        "Return after contacts, events, follow-ups, or audit records exist.",
      ),
      purpose: bilingualText(
        "没有有来源关系活动时，仍让仪表盘复核保持可用。",
        "Keep dashboard review useful when no sourced relationship activity is available.",
      ),
      title: bilingualText(
        "仪表盘没有关系信号",
        "Dashboard has no relationship signals",
      ),
    };
  }

  if (scenario === "pending") {
    return {
      description: bilingualText(
        "有来源活动和来源链检查期间，仪表盘复核保持暂停。",
        "Dashboard review stays paused while sourced activity and provenance are checked.",
      ),
      emptyState: bilingualText(
        "关系证据准备好之前，仪表盘记录保持隐藏。",
        "Dashboard records stay hidden until relationship evidence is ready.",
      ),
      guardrail: localRouteStateSafetyCopy,
      nextStep: bilingualText(
        "来源证据可用后返回活跃仪表盘。",
        "Return to the active dashboard after source evidence is available.",
      ),
      purpose: bilingualText(
        "保持仪表盘工作可见，但不暴露未完成的关系建议。",
        "Keep dashboard work visible without exposing unfinished relationship guidance.",
      ),
      title: bilingualText(
        "仪表盘仍在检查关系信号",
        "Dashboard is still checking relationship signals",
      ),
    };
  }

  return {
    description: bilingualText(
      "关系证据检查期间，仪表盘摘要、网络缺口、机会和来源警告暂不可用。",
      "Dashboard summary, network gaps, opportunities, and provenance warnings are unavailable while relationship evidence is checked.",
    ),
    emptyState: bilingualText(
      "来源证据恢复前，仪表盘复核不可用。",
      "The dashboard review is unavailable until source evidence recovers.",
    ),
    guardrail: localRouteStateSafetyCopy,
    nextStep: bilingualText(
      "采取动作前重新加载仪表盘。",
      "Reload the dashboard before taking action.",
    ),
    purpose: bilingualText(
      "有来源仪表盘上下文不可用时，显示可见恢复路径。",
      "Show a visible recovery path when source-backed dashboard context is unavailable.",
    ),
    title: bilingualText("仪表盘无法加载", "Dashboard could not load"),
  };
}

function routeStateViewModel(input: {
  results?: readonly RouteStateResult[];
  scenario: AppDashboardRouteScenario;
}): AppDashboardRouteStateViewModel {
  const results = input.results ?? [];
  const failure = firstFailure(results);

  return {
    copy: stateCopy(input.scenario),
    errorCode: failure?.success === false ? failure.error.code : null,
    evidenceIds: uniqueEvidenceIds(results),
    recoveryActions: routeRecoveryActions[input.scenario],
    scenario: input.scenario,
  };
}

function actionResultViewModel(
  recompute: OpportunityReminderRecomputeResult,
  auditRun: SourceConsistencyProvenanceAuditRunResult,
): AppDashboardActionResultViewModel {
  if (auditRun.success === false || recompute.success === false) {
    if (auditRun.success === false) {
      return { errorCode: auditRun.error.code, state: "failure" };
    }

    if (recompute.success === false) {
      return { errorCode: recompute.error.code, state: "failure" };
    }

    return { errorCode: "unavailable", state: "failure" };
  }

  const deliveryChanged = Boolean(
    recompute.data.provenance.externalNetworkRequested ||
      recompute.data.provenance.emailProviderRequested ||
      recompute.data.provenance.notificationProviderRequested ||
      auditRun.data.provenance.externalNetworkRequested ||
      auditRun.data.provenance.emailProviderRequested ||
      auditRun.data.provenance.notificationProviderRequested,
  );

  return {
    deliveryChanged,
    generatedFindingCount: auditRun.data.generatedFindingIds.length,
    generatedOpportunityCount: recompute.data.generatedOpportunityCount,
    state: "success",
  };
}

export async function loadAppDashboardRouteViewModel(
  searchParams?: AppDashboardSearchParams,
): Promise<AppDashboardRouteViewModel> {
  const services = createAppDashboardRouteServices();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    const [
      aggregateResult,
      summaryResult,
      distributionResult,
      gapsResult,
      opportunityResult,
      auditResult,
    ] = await Promise.all([
      resolveDashboardAggregateResult(
        services.dashboardService.getDashboardAggregate({
          scenario: requestedScenario,
        }),
      ),
      resolveDashboardAggregateSummaryResult(
        services.dashboardService.getDashboardSummary({
          scenario: requestedScenario,
        }),
      ),
      resolveNetworkDistributionResult(
        services.distributionService.getDistributions({
          scenario: requestedScenario,
        }),
      ),
      resolveNetworkGapAnalysisResult(
        services.distributionService.getNetworkGaps({
          scenario: requestedScenario,
        }),
      ),
      resolveOpportunityReminderResult(
        services.opportunityService.getOpportunityReminderAnalytics({
          scenario: requestedScenario,
        }),
      ),
      services.auditService.getAuditSnapshot({
        scenario: requestedScenario,
      }),
    ]);

    return {
      routeState: routeStateViewModel({
        results: [
          aggregateResult,
          summaryResult,
          distributionResult,
          gapsResult,
          opportunityResult,
          auditResult,
        ],
        scenario: requestedScenario,
      }),
      state: "route-state",
    };
  }

  const [
    aggregateResult,
    summaryResult,
    distributionResult,
    gapsResult,
    opportunityResult,
    auditResult,
  ] = await Promise.all([
    resolveDashboardAggregateResult(
      services.dashboardService.getDashboardAggregate({
        activityLimit: 4,
      }),
    ),
    resolveDashboardAggregateSummaryResult(
      services.dashboardService.getDashboardSummary(),
    ),
    resolveNetworkDistributionResult(
      services.distributionService.getDistributions(),
    ),
    resolveNetworkGapAnalysisResult(services.distributionService.getNetworkGaps()),
    resolveOpportunityReminderResult(
      services.opportunityService.getOpportunityReminderAnalytics(),
    ),
    services.auditService.getAuditSnapshot(),
  ]);
  const results = [
    aggregateResult,
    summaryResult,
    distributionResult,
    gapsResult,
    opportunityResult,
    auditResult,
  ] as const;

  if (
    aggregateResult.success === false ||
    summaryResult.success === false ||
    distributionResult.success === false ||
    gapsResult.success === false ||
    opportunityResult.success === false ||
    auditResult.success === false
  ) {
    return {
      routeState: routeStateViewModel({
        results,
        scenario: "failure",
      }),
      state: "route-state",
    };
  }

  const actionRequested =
    readSearchParam(searchParams, "action") === "run-dashboard-review";
  const recomputeResult = actionRequested
    ? await resolveOpportunityRecomputeResult(
        services.opportunityService.recomputeOpportunityReminderAnalytics(),
      )
    : null;
  const auditRunResult = actionRequested
    ? await services.auditService.runAudit()
    : null;

  return {
    state: "success",
    workspace: {
      actionResult:
        recomputeResult && auditRunResult
          ? actionResultViewModel(recomputeResult, auditRunResult)
          : null,
      aggregate: aggregateResult.data,
      audit: auditResult.data,
      distributions: distributionResult.data,
      gaps: gapsResult.data,
      opportunities: opportunityResult.data,
      summary: summaryResult.data,
    },
  };
}
