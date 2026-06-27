/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  loadAppDashboardRouteViewModel,
  type AppDashboardActionResultViewModel,
  type AppDashboardAggregateViewModel,
  type AppDashboardAuditCollectionViewModel,
  type AppDashboardAuditFindingViewModel,
  type AppDashboardAuditViewModel,
  type AppDashboardDistributionViewModel,
  type AppDashboardGapViewModel,
  type AppDashboardGapsViewModel,
  type AppDashboardHighValueRelationshipViewModel,
  type AppDashboardIndustryBucketViewModel,
  type AppDashboardMetricViewModel,
  type AppDashboardNewContactViewModel,
  type AppDashboardOpportunitiesViewModel,
  type AppDashboardOpportunityViewModel,
  type AppDashboardRecentActivityViewModel,
  type AppDashboardRouteScenario,
  type AppDashboardRouteStateViewModel,
  type AppDashboardSearchParams,
  type AppDashboardStrengthBucketViewModel,
  type AppDashboardSuccessViewModel,
  type AppDashboardSummaryViewModel,
  type AppDashboardValueTypeBucketViewModel,
} from "./dashboard-route-view-model";

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
    label: bilingualText("没有可用信号", "No signals ready"),
  },
  {
    href: "/app/dashboard?scenario=pending",
    label: bilingualText("仍在检查信号", "Still checking signals"),
  },
  {
    href: "/app/dashboard?scenario=failure",
    label: bilingualText("仪表盘不可用", "Dashboard unavailable"),
  },
] as const;

const localDashboardSafetyCopy =
  bilingualText(
    "无副作用：此页面不会产生保存记录、审计报告、合规报告、消息、通知、自动写作调用或外部网络请求。",
    "No side effects: no saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs from this page.",
  );

const localReviewBoundaries = [
  bilingualText("无保存记录", "No saved record"),
  bilingualText("无审计报告", "No audit report"),
  bilingualText("无合规报告", "No compliance report"),
  bilingualText("无消息", "No message"),
  bilingualText("无通知", "No notification"),
  bilingualText("无自动写作调用", "No automated writing call"),
  bilingualText("无外部网络请求", "No outside network request"),
] as const;

type RouteScenario = AppDashboardRouteScenario;

interface AppDashboardCommandCenterProps {
  searchParams?: AppDashboardSearchParams;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sourceConfidenceLabel(evidenceIds: readonly string[]): string {
  return evidenceIds.length >= 2 ? "High" : "Reviewed";
}

function priorityLabel(priority: AppDashboardOpportunityViewModel["priority"]): string {
  return priority === "high" ? "High" : "Medium";
}

function severityLabel(severity: AppDashboardAuditFindingViewModel["severity"]): string {
  const labels: Record<AppDashboardAuditFindingViewModel["severity"], string> = {
    high: "High",
    low: "Low",
    medium: "Medium",
  };

  return labels[severity];
}

function valueTypeLabel(valueType: AppDashboardValueTypeBucketViewModel["valueType"]): string {
  const labels: Record<AppDashboardValueTypeBucketViewModel["valueType"], string> = {
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
      <summary>{bilingualText("证据来源路径", "Evidence source trail")}</summary>
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
      <summary>{bilingualText("技术来源 ID", "Technical provenance IDs")}</summary>
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

function RouteRecoveryActions({
  actions,
}: {
  actions: AppDashboardRouteStateViewModel["recoveryActions"];
}) {
  return (
    <nav
      aria-label="Dashboard route recovery actions"
      className="dashboard-state-links dashboard-recovery-actions"
      data-side-effects="none"
    >
      {actions.map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
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
      {bilingualText("来源可信度", "Source confidence")}:{" "}
      {sourceConfidenceLabel(evidenceIds)};{" "}
      {bilingualText("复核状态", "Review status")}:{" "}
      {bilingualText("可人工复核", "Ready for human review")}
    </p>
  );
}

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppDashboardRouteStateViewModel;
}) {
  return (
    <RouteStateMarker scenario={routeState.scenario}>
      <div
        data-error-code={routeState.errorCode ?? undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow={bilingualText("仪表盘", "Dashboard")} title={routeState.copy.title}>
          <p className="type-body">{routeState.copy.description}</p>
          <dl aria-label="Dashboard status details" className="relationship-meta">
            <div>
              <dt>{bilingualText("Orbit 已知", "What Orbit knows")}</dt>
              <dd>{routeState.copy.purpose}</dd>
            </div>
            <div>
              <dt>{bilingualText("当前状态", "Current status")}</dt>
              <dd>{routeState.copy.emptyState}</dd>
            </div>
            <div>
              <dt>{bilingualText("安全检查", "Safety check")}</dt>
              <dd>{routeState.copy.guardrail}</dd>
            </div>
            <div>
              <dt>{bilingualText("下一步", "Next step")}</dt>
              <dd>{routeState.copy.nextStep}</dd>
            </div>
          </dl>
          <EvidenceChips
            evidenceIds={routeState.evidenceIds}
            label="Dashboard state evidence"
          />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions actions={routeState.recoveryActions} />
    </RouteStateMarker>
  );
}

function DashboardLedger({
  aggregate,
  gaps,
  opportunities,
  summary,
}: {
  aggregate: AppDashboardAggregateViewModel;
  gaps: AppDashboardGapsViewModel;
  opportunities: AppDashboardOpportunitiesViewModel;
  summary: AppDashboardSummaryViewModel;
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
        <dt>{bilingualText("关系资产", "Relationship assets")}</dt>
        <dd>
          <strong>{aggregate.relationshipAssetTotals.contacts}</strong>
          {formatCount(
            aggregate.relationshipAssetTotals.evidenceBackedRelationships,
            "evidence-backed relationship",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("网络覆盖评分", "Network coverage score")}</dt>
        <dd>
          <strong>{gaps.coverageScore}</strong>
          {formatCount(highSeverityGaps, "high-priority gap")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("机会复核", "Opportunity review")}</dt>
        <dd>
          <strong>{opportunities.highPriorityOpportunities.length}</strong>
          {formatCount(warningCount, "review cue")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("仪表盘指标", "Dashboard metrics")}</dt>
        <dd>
          <strong>{summary.metrics.length}</strong>
          {bilingualText("摘要信号已准备", "summary signals ready")}
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
        <p className="type-caption">
          {bilingualText("核心仪表盘动作", "Core dashboard action")}
        </p>
        <h3 className="relationship-name">
          {bilingualText("运行仪表盘复核", "Run dashboard review")}
        </h3>
        <p className="type-body">
          {bilingualText(
            "根据当前关系证据刷新本地机会提示和来源警告，然后在任何保存记录或外部账号更改前停止。",
            "Refresh the local opportunity prompts and source warnings from current relationship evidence, then stop before any saved record or outside account changes.",
          )}
        </p>
      </div>
      <input name="action" type="hidden" value="run-dashboard-review" />
      <button type="submit">
        {bilingualText("运行仪表盘复核", "Run dashboard review")}
      </button>
    </form>
  );
}

function DashboardActionResult({
  result,
}: {
  result: AppDashboardActionResultViewModel;
}) {
  if (result.state === "failure") {
    return (
      <div
        aria-label="App dashboard local action result"
        className="dashboard-action-result"
        data-action-evidence="dashboard-run-review-local-preview"
        data-dashboard-result="dashboard-run-review-preview"
        data-side-effects="none"
      >
        <strong>
          {bilingualText(
            "仪表盘复核无法刷新",
            "Dashboard review could not refresh",
          )}
        </strong>
        <span>{bilingualText("错误", "Error")}: {result.errorCode}</span>
        <span>
          {bilingualText(
            "复核预览保持本地。",
            "Review preview stayed local.",
          )}
        </span>
        <span>{bilingualText("仍保持本地", "What remains local")}</span>
        <ul className="dashboard-review-checks">
          {localReviewBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      aria-label="App dashboard local action result"
      className="dashboard-action-result"
      data-action-evidence="dashboard-run-review-local-preview"
      data-dashboard-result="dashboard-run-review-preview"
      data-side-effects="none"
    >
      <strong>
        {bilingualText(
          `仪表盘复核已准备：刷新 ${result.generatedOpportunityCount} 个机会提示`,
          `Dashboard review ready: ${result.generatedOpportunityCount} opportunity prompts refreshed`,
        )}
      </strong>
      <span>
        {bilingualText(
          "复核预览已刷新本地建议。",
          "Review preview refreshed local guidance.",
        )}
      </span>
      <span>
        {bilingualText("已刷新提示", "Refreshed prompts")}:{" "}
        {result.generatedOpportunityCount}
      </span>
      <span>
        {bilingualText("排队待复核的审计发现", "Audit findings queued for review")}:{" "}
        {result.generatedFindingCount}
      </span>
      <span>{bilingualText("来源可信度：高", "Source confidence: High")}</span>
      <span>
        {bilingualText("已请求外部发送", "Outside delivery requested")}:{" "}
        {result.deliveryChanged
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <span>{bilingualText("仍保持本地", "What remains local")}</span>
      <ul className="dashboard-review-checks">
        {localReviewBoundaries.map((boundary) => (
          <li key={boundary}>{boundary}</li>
        ))}
      </ul>
      <details className="technical-provenance">
        <summary>{bilingualText("本地动作审计详情", "Local action audit details")}</summary>
        <ul>
          <li>{bilingualText("仪表盘命令中心", "Dashboard command center")}</li>
          <li>
            {bilingualText(
              "合规报告已保存：否",
              "Compliance report saved: no",
            )}
          </li>
          <li>
            {bilingualText(
              "生产审计存储已更改：否",
              "Production audit storage changed: no",
            )}
          </li>
        </ul>
      </details>
    </div>
  );
}

function DashboardNextMove({
  gaps,
  opportunities,
}: {
  gaps: AppDashboardGapsViewModel;
  opportunities: AppDashboardOpportunitiesViewModel;
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
          <p className="type-caption">
            {bilingualText("当前优先级", "Current priority")}: {relationshipLabel}
          </p>
        )}
        {primaryOpportunity && (
          <h3 className="relationship-name">{primaryOpportunity.title}</h3>
        )}
        {!primaryOpportunity && primaryGap && (
          <h3 className="relationship-name">{primaryGap.label}</h3>
        )}
        <p className="type-body">
          <strong>{bilingualText("为什么现在重要", "Why it matters now")}</strong>
        </p>
        <p className="type-body">{whyNow}</p>
        {nextMove && (
          <>
            <p className="type-body">
              <strong>
                {bilingualText("建议下一步", "Recommended next move")}
              </strong>
            </p>
            <p className="type-body">{nextMove}</p>
          </>
        )}
      </div>
      <dl aria-label="Recommended next move context" className="relationship-meta">
        {primaryOpportunity && (
          <div>
            <dt>{bilingualText("关系", "Relationship")}</dt>
            <dd>
              {primaryOpportunity.contactName}, {primaryOpportunity.organization}
            </dd>
          </div>
        )}
        {primaryOpportunity && (
          <div>
            <dt>{bilingualText("时间", "Timing")}</dt>
            <dd>{primaryOpportunity.dueLabel}</dd>
          </div>
        )}
        {primaryGap && (
          <div>
            <dt>{bilingualText("覆盖缺口", "Coverage gap")}</dt>
            <dd>{primaryGap.label}</dd>
          </div>
        )}
        <div>
          <dt>{bilingualText("来源可信度", "Source confidence")}:</dt>
          <dd>{sourceConfidenceLabel(evidenceIds)}</dd>
        </div>
        <div>
          <dt>{bilingualText("复核状态", "Review status")}:</dt>
          <dd>{bilingualText("可人工复核", "Ready for human review")}</dd>
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
  workspace,
}: {
  workspace: AppDashboardSuccessViewModel;
}) {
  return (
    <div data-state-boundary="app-dashboard-success">
      <WorkbenchSurface
        className="dashboard-command"
        elevated
        eyebrow={bilingualText("关系健康", "Relationship health")}
        title={bilingualText("关系健康优先级", "Network health priority")}
      >
        <p className="type-body">
          {bilingualText(
            "先处理当前最明确的关系风险或机会，再用指标、覆盖范围、来源可信度和复核状态判断下一步。",
            "Health-to-action workflow: act on the current relationship risk or opportunity first, then use the supporting metrics, coverage context, source confidence, and review status to decide what deserves attention next.",
          )}
        </p>
        <DashboardNextMove
          gaps={workspace.gaps}
          opportunities={workspace.opportunities}
        />
        <p className="dashboard-safety-ledger">{localDashboardSafetyCopy}</p>
        <DashboardLedger
          aggregate={workspace.aggregate}
          gaps={workspace.gaps}
          opportunities={workspace.opportunities}
          summary={workspace.summary}
        />
        <DashboardReviewForm />
        {workspace.actionResult && (
          <DashboardActionResult result={workspace.actionResult} />
        )}
        <div aria-label="App dashboard source states">
          <h3 className="relationship-name">
            {bilingualText("恢复路径", "Recovery paths")}
          </h3>
          <p className="type-body">
            {bilingualText(
              "关系信号为空、仍在解析或不可用时，打开同一个仪表盘。",
              "Open the same dashboard when relationship signals are empty, still resolving, or unavailable.",
            )}
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
          evidenceIds={workspace.audit.provenance.evidenceIds}
          label="App dashboard provenance evidence"
        />
        <HiddenLegacyTechnicalProvenanceDetails
          evidenceIds={workspace.audit.provenance.evidenceIds.slice(0, 5)}
        />
      </WorkbenchSurface>
    </div>
  );
}

function SummaryMetricCards({
  metrics,
}: {
  metrics: readonly AppDashboardMetricViewModel[];
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

function NewContactCard({ contact }: { contact: AppDashboardNewContactViewModel }) {
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
  relationship: AppDashboardHighValueRelationshipViewModel;
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
  aggregate: AppDashboardAggregateViewModel;
  summary: AppDashboardSummaryViewModel;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("摘要", "Summary")}
      title={bilingualText("关系健康信号", "Relationship health signals")}
    >
      <p className="type-body">
        {bilingualText(
          `${summary.metrics.length} 个仪表盘信号会从来源证据总结新联系人、高价值关系、待跟进事项和沉睡关系。`,
          `${formatCount(summary.metrics.length, "dashboard signal")} summarize new contacts, high-value relationships, pending follow-ups, and dormant relationships from source evidence.`,
        )}
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

function IndustryCard({ bucket }: { bucket: AppDashboardIndustryBucketViewModel }) {
  return (
    <article
      aria-label={`Industry distribution ${bucket.label}`}
      className="dashboard-card"
    >
      <span className="type-caption">{bucket.label}</span>
      <strong>{bucket.contactCount}</strong>
      <p className="type-body">
        {bilingualText(
          `${bucket.percentage}% 的有来源联系人。头部组织`,
          `${bucket.percentage}% of sourced contacts. Top organizations`,
        )}:{" "}
        {bucket.topOrganizations.join(", ")}.
      </p>
      <p className="type-caption">
        {bilingualText("覆盖上下文", "Coverage context")}: {bucket.label}
      </p>
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
  bucket: AppDashboardValueTypeBucketViewModel;
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
  bucket: AppDashboardStrengthBucketViewModel;
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
  distributions: AppDashboardDistributionViewModel;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("网络地图", "Network map")}
      title={bilingualText("分布和覆盖", "Distribution and coverage")}
    >
      <p className="type-body">
        {bilingualText(
          "在 Orbit 推荐下一步覆盖建设前，分布桶会让关系集中度保持可见。",
          "Distribution buckets keep relationship concentration visible before Orbit recommends where to build coverage next.",
        )}
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

function NetworkGapCard({ gap }: { gap: AppDashboardGapViewModel }) {
  return (
    <article
      aria-label={`Network gap ${gap.label}`}
      className="dashboard-card"
    >
      <span className="type-caption">
        {gap.severity} {bilingualText("严重度", "severity")}
      </span>
      <h3 className="relationship-name">{gap.label}</h3>
      <strong>
        {gap.currentCount}/{gap.targetCount}
      </strong>
      <p className="type-body">{gap.recommendedAction}</p>
      <p className="type-caption">
        {bilingualText("覆盖上下文", "Coverage context")}: {gap.label}
      </p>
      <ReviewStatusLine evidenceIds={gap.evidenceIds} />
      <EvidenceChips evidenceIds={gap.evidenceIds} label={`${gap.label} evidence`} />
    </article>
  );
}

function OpportunityCard({
  opportunity,
}: {
  opportunity: AppDashboardOpportunityViewModel;
}) {
  return (
    <article
      aria-label={`Dashboard opportunity ${opportunity.contactName}`}
      className="dashboard-card"
    >
      <span className="type-caption">
        {priorityLabel(opportunity.priority)} {bilingualText("优先级", "priority")}
      </span>
      <h3 className="relationship-name">{opportunity.title}</h3>
      <strong>{opportunity.priorityScore}</strong>
      <p className="type-body">
        {opportunity.contactName} · {opportunity.organization}
      </p>
      <p className="type-body">{opportunity.suggestedAction}</p>
      <p className="type-caption">
        {bilingualText("覆盖上下文", "Coverage context")}: {opportunity.dueLabel}
      </p>
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
  gaps: AppDashboardGapsViewModel;
  opportunities: AppDashboardOpportunitiesViewModel;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("下一步工作", "Next work")}
      title={bilingualText(
        "网络缺口和机会",
        "Network gaps and opportunities",
      )}
    >
      <p className="type-body">
        {bilingualText(
          "网络缺口和机会提示并排显示，让下一步关系动作同时具备覆盖上下文和来源证据。",
          "Network gaps and opportunity prompts stay side by side so the next relationship action has both coverage context and source evidence.",
        )}
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
  collection: AppDashboardAuditCollectionViewModel;
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
  finding: AppDashboardAuditFindingViewModel;
}) {
  return (
    <article
      aria-label={`Provenance warning ${finding.findingId}`}
      className="dashboard-card"
    >
      <span className="type-caption">
        {severityLabel(finding.severity)} {bilingualText("警告", "warning")}
      </span>
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
  audit: AppDashboardAuditViewModel;
}) {
  const hasActiveFindings = audit.findings.length > 0;

  return (
    <WorkbenchSurface
      eyebrow={bilingualText("来源链", "Provenance")}
      title={bilingualText("来源链警告", "Provenance warnings")}
    >
      <p className="type-body">
        {hasActiveFindings
          ? bilingualText(
              "来源检查会显示哪些仪表盘提示已准备好，哪些记录在动作前需要清理证据。",
              "Source checks show which dashboard cues are ready and which records need evidence cleanup before action.",
            )
          : bilingualText(
              "来源检查显示已复核的关系记录保留来源上下文，且没有活跃来源链警告。",
              "Source checks show reviewed relationship records retain source context with no active provenance warnings.",
            )}
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
            <span className="type-caption">
              {bilingualText("审计干净", "Clean audit")}
            </span>
            <h3 className="relationship-name">
              {bilingualText(
                "没有活跃来源链警告",
                "No active provenance warnings",
              )}
            </h3>
            <p className="type-body">
              {bilingualText(
                "联系人、连接、推荐、任务、对话摘要、健康提示和下一步动作都会保留已复核来源上下文。",
                "Contacts, connections, recommendations, tasks, conversation summaries, health cues, and next moves keep reviewed source context.",
              )}
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
  activity: readonly AppDashboardRecentActivityViewModel[];
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("最近上下文", "Recent context")}
      title={bilingualText("最新有来源动态", "Latest sourced movement")}
    >
      <p className="type-body">
        {bilingualText(
          "最近活动会说明仪表盘为什么现在突出这些联系人和机会。",
          "Recent activity explains why the dashboard is highlighting these contacts and opportunities now.",
        )}
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

export function AppDashboardCommandCenter({
  searchParams,
}: AppDashboardCommandCenterProps) {
  const viewModel = loadAppDashboardRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return (
      <div className="app-dashboard-route">
        <style>{appDashboardStyles}</style>
        <RouteStateBoundary routeState={viewModel.routeState} />
      </div>
    );
  }

  return (
    <div className="app-dashboard-route">
      <style>{appDashboardStyles}</style>
      <SuccessBoundary workspace={viewModel.workspace} />
      <DashboardSummarySection
        aggregate={viewModel.workspace.aggregate}
        summary={viewModel.workspace.summary}
      />
      <DistributionSection distributions={viewModel.workspace.distributions} />
      <GapAndOpportunitySection
        gaps={viewModel.workspace.gaps}
        opportunities={viewModel.workspace.opportunities}
      />
      <ProvenanceSection audit={viewModel.workspace.audit} />
      <RecentActivitySection activity={viewModel.workspace.aggregate.recentActivity} />
    </div>
  );
}
