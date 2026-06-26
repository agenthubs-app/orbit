/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
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
import type {
  IndustryDistributionBucket,
  NetworkDistributionAnalyticsPayload,
  NetworkDistributionAnalyticsResult,
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
  OpportunityReminderRecomputeResult,
} from "../../../../../features/dashboard/opportunity-contract";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { createAppDashboardRouteServices } from "./dashboard-service-factory";

const appDashboardStyles = `
.app-dashboard-route {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
}

.orbit-app-shell:has(.app-dashboard-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-dashboard-route) .workbench-header .orbit-runtime-row,
.orbit-app-shell:has(.app-dashboard-route) .orbit-account-summary,
.orbit-app-shell:has(.app-dashboard-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-dashboard-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-dashboard-route,
.app-dashboard-route .workbench-surface,
.app-dashboard-route .relationship-meta,
.app-dashboard-route .chip-row,
.app-dashboard-route .dashboard-ledger,
.app-dashboard-route .dashboard-card-grid,
.app-dashboard-route .dashboard-activity-list,
.app-dashboard-route .dashboard-next-move,
.app-dashboard-route .dashboard-action-form,
.app-dashboard-route .dashboard-action-result,
.app-dashboard-route .dashboard-priority-context,
.app-dashboard-route .dashboard-review-checks,
.app-dashboard-route .evidence-cluster {
  min-width: 0;
}

.app-dashboard-route .relationship-name,
.app-dashboard-route .type-body,
.app-dashboard-route .type-caption,
.app-dashboard-route .relationship-meta dd,
.app-dashboard-route .orbit-chip,
.app-dashboard-route .dashboard-state-links a,
.app-dashboard-route .dashboard-action-result span,
.app-dashboard-route .dashboard-action-result strong {
  overflow-wrap: anywhere;
}

.app-dashboard-route .chip-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));
}

.app-dashboard-route .orbit-chip {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
}

.app-dashboard-route .dashboard-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-dashboard-route .dashboard-ledger,
.app-dashboard-route .dashboard-card-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.app-dashboard-route .dashboard-ledger div,
.app-dashboard-route .dashboard-card,
.app-dashboard-route .dashboard-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-dashboard-route .dashboard-ledger strong,
.app-dashboard-route .dashboard-card strong {
  display: block;
  font-size: 1.55rem;
  line-height: 1.05;
}

.app-dashboard-route .dashboard-card,
.app-dashboard-route .dashboard-action-form,
.app-dashboard-route .dashboard-action-result,
.app-dashboard-route .dashboard-activity-list {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-dashboard-route .dashboard-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-dashboard-route .dashboard-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-dashboard-route .dashboard-action-form {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-dashboard-route .dashboard-next-move {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-primary);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-sm);
}

.app-dashboard-route .dashboard-priority-context {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-dashboard-route .dashboard-next-move dl {
  margin: 0;
}

.app-dashboard-route .dashboard-safety-ledger {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-primary);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-dashboard-route .dashboard-review-checks {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: var(--orbit-space-md);
}

.app-dashboard-route .dashboard-action-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  max-width: 100%;
  white-space: normal;
}

.app-dashboard-route .dashboard-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-dashboard-route .dashboard-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  max-width: 100%;
  padding: 6px 10px;
  text-decoration: none;
}

.app-dashboard-route .dashboard-recovery-actions {
  align-items: center;
}

.app-dashboard-route .dashboard-activity-list article {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 3px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-dashboard-route .evidence-cluster {
  display: grid;
  gap: var(--orbit-space-xs);
}

.app-dashboard-route .technical-provenance {
  color: var(--orbit-color-muted);
  font-size: 0.86rem;
}

.app-dashboard-route .technical-provenance summary {
  cursor: pointer;
}

.app-dashboard-route .technical-provenance ul {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding-left: var(--orbit-space-md);
}

.app-dashboard-route .technical-provenance code {
  overflow-wrap: anywhere;
  white-space: normal;
}
`;

const routeStateChecks = [
  {
    href: "/app/dashboard?scenario=empty",
    label: "No signals ready",
  },
  {
    href: "/app/dashboard?scenario=pending",
    label: "Still checking signals",
  },
  {
    href: "/app/dashboard?scenario=failure",
    label: "Dashboard unavailable",
  },
] as const;

const localDashboardSafetyCopy =
  "No side effects: no saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs from this page.";

const localRouteStateSafetyCopy =
  "No saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs while this state is shown.";

const localReviewBoundaries = [
  "No saved record",
  "No audit report",
  "No compliance report",
  "No message",
  "No notification",
  "No automated writing call",
  "No outside network request",
] as const;

type AppDashboardSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";

interface AppDashboardCommandCenterProps {
  searchParams?: AppDashboardSearchParams;
}

type RouteStateResult =
  | DashboardAggregateResult
  | DashboardAggregateSummaryResult
  | NetworkDistributionAnalyticsResult
  | NetworkGapAnalysisResult
  | OpportunityReminderAnalyticsResult
  | SourceConsistencyProvenanceAuditResult;
type RouteStateFailure = Extract<RouteStateResult, { success: false }>;

const routeRecoveryActions: Record<
  RouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/dashboard",
      label: "Show active dashboard",
    },
    {
      href: "/app/dashboard?action=run-dashboard-review",
      label: "Preview dashboard review",
    },
  ],
  failure: [
    {
      href: "/app/dashboard",
      label: "Reload dashboard",
    },
    {
      href: "/app/dashboard?scenario=pending",
      label: "Check source status",
    },
  ],
  pending: [
    {
      href: "/app/dashboard",
      label: "Return to active dashboard",
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
): RouteScenario | null {
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

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sourceConfidenceLabel(evidenceIds: readonly string[]): string {
  return evidenceIds.length >= 2 ? "High" : "Reviewed";
}

function priorityLabel(priority: HighPriorityOpportunity["priority"]): string {
  return priority === "high" ? "High" : "Medium";
}

function severityLabel(severity: SourceConsistencyAuditFinding["severity"]): string {
  const labels: Record<SourceConsistencyAuditFinding["severity"], string> = {
    high: "High",
    low: "Low",
    medium: "Medium",
  };

  return labels[severity];
}

function valueTypeLabel(valueType: ValueTypeDistributionBucket["valueType"]): string {
  const labels: Record<ValueTypeDistributionBucket["valueType"], string> = {
    commercial_opportunity: "Commercial opportunity",
    investor_access: "Investor access",
    referral_path: "Referral path",
    strategic_fit: "Strategic fit",
  };

  return labels[valueType];
}

function capitalizeWord(word: string): string {
  if (!word) {
    return word;
  }

  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function evidenceLabel(evidenceId: string): string {
  const specialWords: Record<string, string> = {
    ai: "AI",
    api: "API",
    csv: "CSV",
    gmail: "Gmail",
    id: "ID",
    ocr: "OCR",
    qr: "QR",
  };
  const names = new Set([
    "aiko",
    "akari",
    "diego",
    "hana",
    "kenji",
    "maya",
    "mika",
    "omar",
    "priya",
  ]);
  const readable = evidenceId
    .replace(/^evidence[:_-]?/i, "")
    .replace(/[:_-]+/g, " ")
    .trim();

  if (!readable) {
    return "Source evidence";
  }

  return productCopy(
    readable
      .split(/\s+/)
      .map((word, index) => {
        const lowerWord = word.toLowerCase();

        if (specialWords[lowerWord]) {
          return specialWords[lowerWord];
        }

        if (index === 0 || names.has(lowerWord)) {
          return capitalizeWord(lowerWord);
        }

        return lowerWord;
      })
      .join(" "),
  );
}

function productCopy(value: string): string {
  return value
    .replace(/\bmock\b/gi, "review")
    .replace(/\blive\b/gi, "connected")
    .replace(/\bproviders?\b/gi, "services")
    .replace(/\bfixtures?\b/gi, "source records")
    .replace(/\bdatabases?\b/gi, "saved records");
}

function TechnicalProvenanceDetails({
  evidenceIds,
}: {
  evidenceIds: readonly string[];
}) {
  return (
    <details className="technical-provenance">
      <summary>Evidence source trail</summary>
      <ul>
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>
            <code>{evidenceId}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function HiddenLegacyTechnicalProvenanceDetails({
  evidenceIds,
}: {
  evidenceIds: readonly string[];
}) {
  return (
    <details className="technical-provenance" hidden>
      <summary>Technical provenance IDs</summary>
      <ul>
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>
            <code>{evidenceId}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/dashboard?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({ scenario }: { scenario: RouteScenario }) {
  return (
    <nav
      aria-label="Dashboard route recovery actions"
      className="dashboard-state-links dashboard-recovery-actions"
      data-side-effects="none"
    >
      {routeRecoveryActions[scenario].map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
}

function stateCopy(scenario: RouteScenario) {
  if (scenario === "empty") {
    return {
      description:
        "Add source-backed contacts or event context before reviewing dashboard trends.",
      emptyState:
        "No relationship activity has enough source evidence for dashboard review.",
      guardrail: localRouteStateSafetyCopy,
      nextStep: "Return after contacts, events, follow-ups, or audit records exist.",
      purpose:
        "Keep dashboard review useful when no sourced relationship activity is available.",
      title: "Dashboard has no relationship signals",
    };
  }

  if (scenario === "pending") {
    return {
      description:
        "Dashboard review stays paused while sourced activity and provenance are checked.",
      emptyState:
        "Dashboard records stay hidden until relationship evidence is ready.",
      guardrail: localRouteStateSafetyCopy,
      nextStep: "Return to the active dashboard after source evidence is available.",
      purpose:
        "Keep dashboard work visible without exposing unfinished relationship guidance.",
      title: "Dashboard is still checking relationship signals",
    };
  }

  return {
    description:
      "Dashboard summary, network gaps, opportunities, and provenance warnings are unavailable while relationship evidence is checked.",
    emptyState:
      "The dashboard review is unavailable until source evidence recovers.",
    guardrail: localRouteStateSafetyCopy,
    nextStep: "Reload the dashboard before taking action.",
    purpose:
      "Show a visible recovery path when source-backed dashboard context is unavailable.",
    title: "Dashboard could not load",
  };
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  const visibleEvidenceIds = evidenceIds.slice(0, 5);

  return (
    <div className="evidence-cluster">
      <div aria-label={label} className="chip-row">
        {visibleEvidenceIds.map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceLabel(evidenceId)}
          </Chip>
        ))}
      </div>
      <TechnicalProvenanceDetails evidenceIds={visibleEvidenceIds} />
    </div>
  );
}

function ReviewStatusLine({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <p className="type-caption">
      Source confidence: {sourceConfidenceLabel(evidenceIds)}; Review status:
      Ready for human review
    </p>
  );
}

function RouteStateBoundary({ scenario }: { scenario: RouteScenario }) {
  const services = createAppDashboardRouteServices();
  const aggregateResult = services.dashboardService.getDashboardAggregate({
    scenario,
  });
  const summaryResult = services.dashboardService.getDashboardSummary({
    scenario,
  });
  const distributionResult = services.distributionService.getDistributions({
    scenario,
  });
  const gapsResult = services.distributionService.getNetworkGaps({ scenario });
  const opportunityResult =
    services.opportunityService.getOpportunityReminderAnalytics({ scenario });
  const auditResult = services.auditService.getAuditSnapshot({ scenario });
  const results = [
    aggregateResult,
    summaryResult,
    distributionResult,
    gapsResult,
    opportunityResult,
    auditResult,
  ] as const;
  const copy = stateCopy(scenario);
  const failure = firstFailure(results);
  const evidenceIds = uniqueEvidenceIds(results);

  return (
    <RouteStateMarker scenario={scenario}>
      <div
        data-error-code={failure?.success === false ? failure.error.code : undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow="Dashboard" title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Dashboard status details" className="relationship-meta">
            <div>
              <dt>What Orbit knows</dt>
              <dd>{copy.purpose}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>{copy.emptyState}</dd>
            </div>
            <div>
              <dt>Safety check</dt>
              <dd>{copy.guardrail}</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>{copy.nextStep}</dd>
            </div>
          </dl>
          <EvidenceChips
            evidenceIds={evidenceIds}
            label="Dashboard state evidence"
          />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions scenario={scenario} />
    </RouteStateMarker>
  );
}

function DashboardLedger({
  aggregate,
  gaps,
  opportunities,
  summary,
}: {
  aggregate: DashboardAggregatePayload;
  gaps: NetworkGapAnalysisPayload;
  opportunities: OpportunityReminderAnalyticsPayload;
  summary: DashboardAggregateSummaryPayload;
}) {
  const highSeverityGaps = gaps.gaps.filter((gap) => gap.severity === "high").length;
  const warningCount =
    opportunities.highPriorityOpportunities.length +
    opportunities.dormantHighValueContacts.length;

  return (
    <dl
      aria-label="App dashboard composed summary"
      className="relationship-meta dashboard-ledger"
    >
      <div>
        <dt>Relationship assets</dt>
        <dd>
          <strong>{aggregate.relationshipAssetTotals.contacts}</strong>
          {formatCount(
            aggregate.relationshipAssetTotals.evidenceBackedRelationships,
            "evidence-backed relationship",
          )}
        </dd>
      </div>
      <div>
        <dt>Network coverage score</dt>
        <dd>
          <strong>{gaps.coverageScore}</strong>
          {formatCount(highSeverityGaps, "high-priority gap")}
        </dd>
      </div>
      <div>
        <dt>Opportunity review</dt>
        <dd>
          <strong>{opportunities.highPriorityOpportunities.length}</strong>
          {formatCount(warningCount, "review cue")}
        </dd>
      </div>
      <div>
        <dt>Dashboard metrics</dt>
        <dd>
          <strong>{summary.metrics.length}</strong>
          summary signals ready
        </dd>
      </div>
    </dl>
  );
}

function DashboardReviewForm() {
  return (
    <form
      action="/app/dashboard"
      aria-label="Run dashboard review preview"
      className="dashboard-action-form"
      method="get"
    >
      <div>
        <p className="type-caption">Core dashboard action</p>
        <h3 className="relationship-name">Run dashboard review</h3>
        <p className="type-body">
          Refresh the local opportunity prompts and source warnings from current
          relationship evidence, then stop before any saved record or outside
          account changes.
        </p>
      </div>
      <input name="action" type="hidden" value="run-dashboard-review" />
      <button type="submit">Run dashboard review</button>
    </form>
  );
}

function DashboardActionResult({
  auditRun,
  recompute,
}: {
  auditRun: SourceConsistencyProvenanceAuditRunResult;
  recompute: OpportunityReminderRecomputeResult;
}) {
  if (auditRun.success === false || recompute.success === false) {
    let errorCode = "unavailable";

    if (auditRun.success === false) {
      errorCode = auditRun.error.code;
    } else if (recompute.success === false) {
      errorCode = recompute.error.code;
    }

    return (
      <div
        aria-label="App dashboard local action result"
        className="dashboard-action-result"
        data-action-evidence="dashboard-run-review-local-preview"
        data-dashboard-result="dashboard-run-review-preview"
        data-side-effects="none"
      >
        <strong>Dashboard review could not refresh</strong>
        <span>Error: {errorCode}</span>
        <span>Review preview stayed local.</span>
        <span>What remains local</span>
        <ul className="dashboard-review-checks">
          {localReviewBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </div>
    );
  }

  const deliveryChanged = Boolean(
    recompute.data.provenance.externalNetworkRequested ||
      recompute.data.provenance.emailProviderRequested ||
      recompute.data.provenance.notificationProviderRequested ||
      auditRun.data.provenance.externalNetworkRequested ||
      auditRun.data.provenance.emailProviderRequested ||
      auditRun.data.provenance.notificationProviderRequested,
  );

  return (
    <div
      aria-label="App dashboard local action result"
      className="dashboard-action-result"
      data-action-evidence="dashboard-run-review-local-preview"
      data-dashboard-result="dashboard-run-review-preview"
      data-side-effects="none"
    >
      <strong>
        Dashboard review ready: {recompute.data.generatedOpportunityCount}{" "}
        opportunity prompts refreshed
      </strong>
      <span>Review preview refreshed local guidance.</span>
      <span>Refreshed prompts: {recompute.data.generatedOpportunityCount}</span>
      <span>
        Audit findings queued for review: {auditRun.data.generatedFindingIds.length}
      </span>
      <span>Source confidence: High</span>
      <span>
        Outside delivery requested: {deliveryChanged ? "review required" : "none"}
      </span>
      <span>What remains local</span>
      <ul className="dashboard-review-checks">
        {localReviewBoundaries.map((boundary) => (
          <li key={boundary}>{boundary}</li>
        ))}
      </ul>
      <details className="technical-provenance">
        <summary>Local action audit details</summary>
        <ul>
          <li>Dashboard command center</li>
          <li>Compliance report saved: no</li>
          <li>Production audit storage changed: no</li>
        </ul>
      </details>
    </div>
  );
}

function DashboardNextMove({
  gaps,
  opportunities,
}: {
  gaps: NetworkGapAnalysisPayload;
  opportunities: OpportunityReminderAnalyticsPayload;
}) {
  const primaryOpportunity = opportunities.highPriorityOpportunities[0] ?? null;
  const primaryGap =
    gaps.gaps.find((gap) => gap.severity === "high") ?? gaps.gaps[0] ?? null;
  const evidenceIds = [
    ...(primaryOpportunity?.evidenceIds ?? []),
    ...(primaryGap?.evidenceIds ?? []),
  ];
  const relationshipLabel = primaryOpportunity
    ? `${primaryOpportunity.contactName} at ${primaryOpportunity.organization}`
    : null;
  const whyNow =
    primaryOpportunity && primaryGap
      ? `${primaryOpportunity.title} is ready while ${primaryGap.label.toLowerCase()} remains below target.`
      : "Coverage needs attention before Orbit recommends a broader relationship move.";
  const nextMove =
    primaryOpportunity?.suggestedAction ?? primaryGap?.recommendedAction ?? null;

  if (!primaryOpportunity && !primaryGap) {
    return null;
  }

  return (
    <section
      aria-label="Recommended dashboard next move"
      className="dashboard-next-move"
      data-dashboard-next-move="relationship-action"
      data-side-effects="none"
    >
      <div className="dashboard-priority-context">
        {relationshipLabel && (
          <p className="type-caption">Current priority: {relationshipLabel}</p>
        )}
        {primaryOpportunity && (
          <h3 className="relationship-name">{primaryOpportunity.title}</h3>
        )}
        {!primaryOpportunity && primaryGap && (
          <h3 className="relationship-name">{primaryGap.label}</h3>
        )}
        <p className="type-body">
          <strong>Why it matters now</strong>
        </p>
        <p className="type-body">{whyNow}</p>
        {nextMove && (
          <>
            <p className="type-body">
              <strong>Recommended next move</strong>
            </p>
            <p className="type-body">{nextMove}</p>
          </>
        )}
      </div>
      <dl aria-label="Recommended next move context" className="relationship-meta">
        {primaryOpportunity && (
          <div>
            <dt>Relationship</dt>
            <dd>
              {primaryOpportunity.contactName}, {primaryOpportunity.organization}
            </dd>
          </div>
        )}
        {primaryOpportunity && (
          <div>
            <dt>Timing</dt>
            <dd>{primaryOpportunity.dueLabel}</dd>
          </div>
        )}
        {primaryGap && (
          <div>
            <dt>Coverage gap</dt>
            <dd>{primaryGap.label}</dd>
          </div>
        )}
        <div>
          <dt>Source confidence:</dt>
          <dd>{sourceConfidenceLabel(evidenceIds)}</dd>
        </div>
        <div>
          <dt>Review status:</dt>
          <dd>Ready for human review</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={evidenceIds}
        label="Recommended next move evidence"
      />
    </section>
  );
}

function SuccessBoundary({
  aggregate,
  audit,
  gaps,
  opportunities,
  searchParams,
  summary,
}: {
  aggregate: DashboardAggregatePayload;
  audit: SourceConsistencyProvenanceAuditPayload;
  gaps: NetworkGapAnalysisPayload;
  opportunities: OpportunityReminderAnalyticsPayload;
  searchParams: AppDashboardSearchParams | undefined;
  summary: DashboardAggregateSummaryPayload;
}) {
  const actionRequested =
    readSearchParam(searchParams, "action") === "run-dashboard-review";
  const services = actionRequested ? createAppDashboardRouteServices() : null;
  const recomputeResult = services?.opportunityService.recomputeOpportunityReminderAnalytics();
  const auditRunResult = services?.auditService.runAudit();

  return (
    <div data-state-boundary="app-dashboard-success">
      <WorkbenchSurface
        className="dashboard-command"
        elevated
        eyebrow="Relationship health"
        title="Network health priority"
      >
        <p className="type-body">
          Health-to-action workflow: act on the current relationship risk or
          opportunity first, then use the supporting metrics, coverage context,
          source confidence, and review status to decide what deserves attention
          next.
        </p>
        <DashboardNextMove gaps={gaps} opportunities={opportunities} />
        <p className="dashboard-safety-ledger">{localDashboardSafetyCopy}</p>
        <DashboardLedger
          aggregate={aggregate}
          gaps={gaps}
          opportunities={opportunities}
          summary={summary}
        />
        <DashboardReviewForm />
        {actionRequested && recomputeResult && auditRunResult && (
          <DashboardActionResult
            auditRun={auditRunResult}
            recompute={recomputeResult}
          />
        )}
        <div aria-label="App dashboard source states">
          <h3 className="relationship-name">Recovery paths</h3>
          <p className="type-body">
            Open the same dashboard when relationship signals are empty, still
            resolving, or unavailable.
          </p>
          <nav className="dashboard-state-links">
            {routeStateChecks.map((stateCheck) => (
              <a href={stateCheck.href} key={stateCheck.href}>
                {stateCheck.label}
              </a>
            ))}
          </nav>
        </div>
        <EvidenceChips
          evidenceIds={audit.provenance.evidenceIds}
          label="App dashboard provenance evidence"
        />
        <HiddenLegacyTechnicalProvenanceDetails
          evidenceIds={audit.provenance.evidenceIds.slice(0, 5)}
        />
      </WorkbenchSurface>
    </div>
  );
}

function SummaryMetricCards({
  metrics,
}: {
  metrics: readonly DashboardSummaryMetric[];
}) {
  return (
    <div aria-label="Dashboard summary metrics" className="dashboard-card-grid">
      {metrics.map((metric) => (
        <article className="dashboard-card" key={metric.id}>
          <span className="type-caption">{metric.label}</span>
          <strong>{metric.value}</strong>
          <ReviewStatusLine evidenceIds={metric.evidenceIds} />
          <EvidenceChips
            evidenceIds={metric.evidenceIds}
            label={`${metric.label} evidence`}
          />
        </article>
      ))}
    </div>
  );
}

function NewContactCard({ contact }: { contact: DashboardNewContact }) {
  return (
    <article
      aria-label={`Dashboard new contact ${contact.name}`}
      className="dashboard-card"
    >
      <span className="type-caption">{contact.sourceLabel}</span>
      <h3 className="relationship-name">{contact.name}</h3>
      <p className="type-body">{contact.organization}</p>
      <ReviewStatusLine evidenceIds={contact.evidenceIds} />
      <EvidenceChips
        evidenceIds={contact.evidenceIds}
        label={`${contact.name} dashboard evidence`}
      />
    </article>
  );
}

function HighValueRelationshipCard({
  relationship,
}: {
  relationship: DashboardHighValueRelationship;
}) {
  return (
    <article
      aria-label={`Dashboard high-value relationship ${relationship.contactName}`}
      className="dashboard-card"
    >
      <span className="type-caption">{valueTypeLabel(relationship.valueType)}</span>
      <h3 className="relationship-name">{relationship.contactName}</h3>
      <strong>{relationship.priorityScore}</strong>
      <p className="type-body">
        {relationship.organization}: {relationship.reason}
      </p>
      <ReviewStatusLine evidenceIds={relationship.evidenceIds} />
      <EvidenceChips
        evidenceIds={relationship.evidenceIds}
        label={`${relationship.contactName} value evidence`}
      />
    </article>
  );
}

function DashboardSummarySection({
  aggregate,
  summary,
}: {
  aggregate: DashboardAggregatePayload;
  summary: DashboardAggregateSummaryPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="Summary" title="Relationship health signals">
      <p className="type-body">
        {formatCount(summary.metrics.length, "dashboard signal")} summarize new
        contacts, high-value relationships, pending follow-ups, and dormant
        relationships from source evidence.
      </p>
      <SummaryMetricCards metrics={summary.metrics} />
      <div className="dashboard-card-grid">
        {aggregate.newContacts.contacts.slice(0, 2).map((contact) => (
          <NewContactCard contact={contact} key={contact.contactId} />
        ))}
        {aggregate.highValueRelationships.slice(0, 1).map((relationship) => (
          <HighValueRelationshipCard
            key={relationship.connectionId}
            relationship={relationship}
          />
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function IndustryCard({ bucket }: { bucket: IndustryDistributionBucket }) {
  return (
    <article
      aria-label={`Industry distribution ${bucket.label}`}
      className="dashboard-card"
    >
      <span className="type-caption">{bucket.label}</span>
      <strong>{bucket.contactCount}</strong>
      <p className="type-body">
        {bucket.percentage}% of sourced contacts. Top organizations:{" "}
        {bucket.topOrganizations.join(", ")}.
      </p>
      <p className="type-caption">Coverage context: {bucket.label}</p>
      <ReviewStatusLine evidenceIds={bucket.evidenceIds} />
      <EvidenceChips
        evidenceIds={bucket.evidenceIds}
        label={`${bucket.label} distribution evidence`}
      />
    </article>
  );
}

function ValueTypeRow({
  bucket,
}: {
  bucket: ValueTypeDistributionBucket;
}) {
  return (
    <div>
      <dt>{bucket.label}</dt>
      <dd>
        {formatCount(bucket.relationshipCount, "relationship")}, {bucket.percentage}
        % of the relationship set.
      </dd>
    </div>
  );
}

function StrengthRow({
  bucket,
}: {
  bucket: RelationshipStrengthDistributionBucket;
}) {
  return (
    <div>
      <dt>{bucket.strength}</dt>
      <dd>
        {formatCount(bucket.relationshipCount, "relationship")}, {bucket.percentage}
        % of the relationship set with {bucket.followupRisk} follow-up risk.
      </dd>
    </div>
  );
}

function DistributionSection({
  distributions,
}: {
  distributions: NetworkDistributionAnalyticsPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="Network map" title="Distribution and coverage">
      <p className="type-body">
        Distribution buckets keep relationship concentration visible before
        Orbit recommends where to build coverage next.
      </p>
      <div className="dashboard-card-grid">
        {distributions.industryDistribution.slice(0, 3).map((bucket) => (
          <IndustryCard bucket={bucket} key={bucket.bucketId} />
        ))}
      </div>
      <dl aria-label="Dashboard value distribution" className="relationship-meta">
        {distributions.valueTypeDistribution.slice(0, 3).map((bucket) => (
          <ValueTypeRow bucket={bucket} key={bucket.valueType} />
        ))}
      </dl>
      <dl
        aria-label="Dashboard relationship strength distribution"
        className="relationship-meta"
      >
        {distributions.relationshipStrengthDistribution.map((bucket) => (
          <StrengthRow bucket={bucket} key={bucket.strength} />
        ))}
      </dl>
    </WorkbenchSurface>
  );
}

function NetworkGapCard({ gap }: { gap: NetworkGapAnalysisItem }) {
  return (
    <article
      aria-label={`Network gap ${gap.label}`}
      className="dashboard-card"
    >
      <span className="type-caption">{gap.severity} severity</span>
      <h3 className="relationship-name">{gap.label}</h3>
      <strong>
        {gap.currentCount}/{gap.targetCount}
      </strong>
      <p className="type-body">{gap.recommendedAction}</p>
      <p className="type-caption">Coverage context: {gap.label}</p>
      <ReviewStatusLine evidenceIds={gap.evidenceIds} />
      <EvidenceChips evidenceIds={gap.evidenceIds} label={`${gap.label} evidence`} />
    </article>
  );
}

function OpportunityCard({
  opportunity,
}: {
  opportunity: HighPriorityOpportunity;
}) {
  return (
    <article
      aria-label={`Dashboard opportunity ${opportunity.contactName}`}
      className="dashboard-card"
    >
      <span className="type-caption">{priorityLabel(opportunity.priority)} priority</span>
      <h3 className="relationship-name">{opportunity.title}</h3>
      <strong>{opportunity.priorityScore}</strong>
      <p className="type-body">
        {opportunity.contactName} · {opportunity.organization}
      </p>
      <p className="type-body">{opportunity.suggestedAction}</p>
      <p className="type-caption">Coverage context: {opportunity.dueLabel}</p>
      <ReviewStatusLine evidenceIds={opportunity.evidenceIds} />
      <EvidenceChips
        evidenceIds={opportunity.evidenceIds}
        label={`${opportunity.contactName} opportunity evidence`}
      />
    </article>
  );
}

function GapAndOpportunitySection({
  gaps,
  opportunities,
}: {
  gaps: NetworkGapAnalysisPayload;
  opportunities: OpportunityReminderAnalyticsPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="Next work" title="Network gaps and opportunities">
      <p className="type-body">
        Network gaps and opportunity prompts stay side by side so the next
        relationship action has both coverage context and source evidence.
      </p>
      <div className="dashboard-card-grid">
        {gaps.gaps.slice(0, 2).map((gap) => (
          <NetworkGapCard gap={gap} key={gap.gapId} />
        ))}
        {opportunities.highPriorityOpportunities.slice(0, 2).map((opportunity) => (
          <OpportunityCard
            key={opportunity.opportunityId}
            opportunity={opportunity}
          />
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function CollectionRow({
  collection,
}: {
  collection: SourceConsistencyAuditedCollection;
}) {
  return (
    <div>
      <dt>{collection.label}</dt>
      <dd>
        {collection.consistentCount}/{collection.auditedCount} source checks clear;
        provenance complete {collection.provenanceComplete ? "yes" : "no"}.
      </dd>
    </div>
  );
}

function AuditFindingCard({
  finding,
}: {
  finding: SourceConsistencyAuditFinding;
}) {
  return (
    <article
      aria-label={`Provenance warning ${finding.findingId}`}
      className="dashboard-card"
    >
      <span className="type-caption">{severityLabel(finding.severity)} warning</span>
      <h3 className="relationship-name">{finding.title}</h3>
      <p className="type-body">{productCopy(finding.remediation)}</p>
      <ReviewStatusLine evidenceIds={finding.evidenceIds} />
      <EvidenceChips
        evidenceIds={finding.evidenceIds}
        label={`${finding.findingId} evidence`}
      />
    </article>
  );
}

function ProvenanceSection({
  audit,
}: {
  audit: SourceConsistencyProvenanceAuditPayload;
}) {
  const hasActiveFindings = audit.findings.length > 0;

  return (
    <WorkbenchSurface eyebrow="Provenance" title="Provenance warnings">
      <p className="type-body">
        {hasActiveFindings
          ? "Source checks show which dashboard cues are ready and which records need evidence cleanup before action."
          : "Source checks show reviewed relationship records retain source context with no active provenance warnings."}
      </p>
      <dl aria-label="Dashboard provenance collections" className="relationship-meta">
        {audit.auditedCollections.slice(0, 4).map((collection) => (
          <CollectionRow collection={collection} key={collection.entityKind} />
        ))}
      </dl>
      <div className="dashboard-card-grid">
        {hasActiveFindings ? (
          audit.findings.slice(0, 3).map((finding) => (
            <AuditFindingCard finding={finding} key={finding.findingId} />
          ))
        ) : (
          <article
            aria-label="Provenance warning zero active findings"
            className="dashboard-card"
          >
            <span className="type-caption">Clean audit</span>
            <h3 className="relationship-name">No active provenance warnings</h3>
            <p className="type-body">
              Contacts, connections, recommendations, tasks, conversation
              summaries, health cues, and next moves keep reviewed source context.
            </p>
            <ReviewStatusLine evidenceIds={audit.provenance.evidenceIds} />
            <EvidenceChips
              evidenceIds={audit.provenance.evidenceIds}
              label="No active provenance warning evidence"
            />
          </article>
        )}
      </div>
    </WorkbenchSurface>
  );
}

function RecentActivitySection({
  activity,
}: {
  activity: readonly DashboardRecentActivity[];
}) {
  return (
    <WorkbenchSurface eyebrow="Recent context" title="Latest sourced movement">
      <p className="type-body">
        Recent activity explains why the dashboard is highlighting these contacts
        and opportunities now.
      </p>
      <div aria-label="Dashboard recent activity" className="dashboard-activity-list">
        {activity.slice(0, 4).map((item) => (
          <article key={item.activityId}>
            <p className="type-caption">{item.sourceLabel}</p>
            <h3 className="relationship-name">{item.label}</h3>
            <p className="type-body">{item.occurredAt}</p>
            <ReviewStatusLine evidenceIds={item.evidenceIds} />
            <EvidenceChips
              evidenceIds={item.evidenceIds}
              label={`${item.activityId} evidence`}
            />
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function CompositionFailure({
  results,
}: {
  results: readonly RouteStateResult[];
}) {
  const failure = firstFailure(results);
  const evidenceIds = uniqueEvidenceIds(results);

  return (
    <div data-state-boundary="shared-ui-state-view">
      <WorkbenchSurface elevated eyebrow="Dashboard" title="Dashboard could not load">
        <p className="type-body">
          Dashboard summary, network gaps, opportunities, and provenance warnings
          are unavailable while relationship evidence is checked.
        </p>
        <dl aria-label="Dashboard status details" className="relationship-meta">
          <div>
            <dt>Current status</dt>
            <dd>Review is paused until source-backed dashboard data returns.</dd>
          </div>
          <div>
            <dt>Safety check</dt>
            <dd>No saved record, audit report, message, or notification changed.</dd>
          </div>
          <div>
            <dt>Error</dt>
            <dd>{failure?.success === false ? failure.error.code : "unavailable"}</dd>
          </div>
        </dl>
        <EvidenceChips
          evidenceIds={evidenceIds}
          label="Dashboard failure evidence"
        />
      </WorkbenchSurface>
    </div>
  );
}

export function AppDashboardCommandCenter({
  searchParams,
}: AppDashboardCommandCenterProps) {
  const services = createAppDashboardRouteServices();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return (
      <div className="app-dashboard-route">
        <style>{appDashboardStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const aggregateResult = services.dashboardService.getDashboardAggregate({
    activityLimit: 4,
  });
  const summaryResult = services.dashboardService.getDashboardSummary();
  const distributionResult = services.distributionService.getDistributions();
  const gapsResult = services.distributionService.getNetworkGaps();
  const opportunityResult =
    services.opportunityService.getOpportunityReminderAnalytics();
  const auditResult = services.auditService.getAuditSnapshot();
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
    return (
      <div className="app-dashboard-route">
        <style>{appDashboardStyles}</style>
        <CompositionFailure results={results} />
      </div>
    );
  }

  return (
    <div className="app-dashboard-route">
      <style>{appDashboardStyles}</style>
      <SuccessBoundary
        aggregate={aggregateResult.data}
        audit={auditResult.data}
        gaps={gapsResult.data}
        opportunities={opportunityResult.data}
        searchParams={searchParams}
        summary={summaryResult.data}
      />
      <DashboardSummarySection
        aggregate={aggregateResult.data}
        summary={summaryResult.data}
      />
      <DistributionSection distributions={distributionResult.data} />
      <GapAndOpportunitySection
        gaps={gapsResult.data}
        opportunities={opportunityResult.data}
      />
      <ProvenanceSection audit={auditResult.data} />
      <RecentActivitySection activity={aggregateResult.data.recentActivity} />
    </div>
  );
}
