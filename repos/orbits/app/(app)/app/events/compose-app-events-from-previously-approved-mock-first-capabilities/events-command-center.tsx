/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  loadAppEventsRouteViewModel,
  type AppEventsActionResultViewModel,
  type AppEventsAttendeeRecommendationViewModel,
  type AppEventsCurrentPriorityViewModel,
  type AppEventsEventChoiceViewModel,
  type AppEventsEvidenceViewModel,
  type AppEventsLedgerViewModel,
  type AppEventsReadinessChecklistItemViewModel,
  type AppEventsReadinessViewModel,
  type AppEventsRouteStateViewModel,
  type AppEventsSearchParams,
  type AppEventsSuccessViewModel,
  type AppEventsValueRecommendationViewModel,
} from "./events-route-view-model";

const appEventsStyles = `
.app-events-route,
.app-events-route-state {
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-app-shell:has(.app-events-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-events-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-events-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-events-route,
.app-events-route-state,
.app-events-route .workbench-surface,
.app-events-route .relationship-meta,
.app-events-route .chip-row,
.app-events-route .events-ledger,
.app-events-route .events-priority-grid,
.app-events-route .events-preparation-signals,
.app-events-route .events-card-grid,
.app-events-route .events-action-result,
.app-events-route-state .events-recovery-actions {
  min-width: 0;
}

.app-events-route .events-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-events-route .events-ledger,
.app-events-route .events-card-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-events-route .events-priority-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.75fr);
}

.app-events-route .events-ledger div,
.app-events-route .events-card,
.app-events-route .events-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-events-route .events-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-events-route .events-card,
.app-events-route .events-action-result {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-events-route .events-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-events-route .events-preparation-signals {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-events-route .events-preparation-signals h2 {
  font-family: var(--orbit-font-display);
  font-size: 1.4rem;
  margin: 0;
}

.app-events-route .events-card h3,
.app-events-route .events-current-priority h3 {
  margin: 0;
}

.app-events-route .events-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-events-route-state .events-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-events-route .events-action-link,
.app-events-route .events-detail-link,
.app-events-route-state .events-recovery-actions a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-weight: 700;
  justify-self: start;
  line-height: 1.3;
  padding: 6px 10px;
  text-decoration: none;
}

.app-events-route .events-action-link,
.app-events-route .events-detail-link {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

@media (max-width: 760px) {
  .app-events-route .events-priority-grid {
    grid-template-columns: 1fr;
  }
}
`;

export interface AppEventsCommandCenterProps {
  searchParams?: AppEventsSearchParams;
}

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppEventsRouteStateViewModel;
}) {
  return (
    <div
      className="app-events-route-state"
      data-error-code={routeState.errorCode ?? undefined}
      data-route-state-url={`/app/events?scenario=${routeState.scenario}`}
    >
      <style>{appEventsStyles}</style>
      <div data-state-boundary="app-events-route-state-view">
        <WorkbenchSurface
          elevated
          eyebrow={bilingualText("活动", "Events")}
          title={routeState.copy.title}
        >
          <p className="type-body">{routeState.copy.description}</p>
          <dl
            aria-label={bilingualText("活动状态详情", "Event status details")}
            className="relationship-meta"
          >
            <div>
              <dt>{bilingualText("Orbit 已知道", "What Orbit knows")}</dt>
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
          {routeState.evidence.length > 0 && (
            <EvidenceChips
              evidence={routeState.evidence}
              label={bilingualText("活动恢复证据", "Event recovery evidence")}
            />
          )}
        </WorkbenchSurface>
      </div>
      <nav
        aria-label={bilingualText("活动恢复操作", "Events recovery actions")}
        className="events-recovery-actions"
      >
        {routeState.recoveryActions.map((action) => (
          <a key={action.href} href={action.href}>
            {action.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
  chineseUnit = singular,
) {
  return bilingualText(
    `${count} 个${chineseUnit}`,
    `${count} ${count === 1 ? singular : plural}`,
  );
}

function EvidenceChips({
  evidence,
  label,
}: {
  evidence: readonly AppEventsEvidenceViewModel[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidence.slice(0, 6).map((item) => (
        <span key={item.id} data-evidence-id={item.id}>
          <Chip tone="evidence">{item.label}</Chip>
        </span>
      ))}
    </div>
  );
}

function EventLedger({
  ledger,
}: {
  ledger: AppEventsLedgerViewModel;
}) {
  return (
    <dl className="events-ledger">
      <div>
        <dt>{bilingualText("有来源活动", "Sourced events")}</dt>
        <dd>
          <strong>{ledger.eventCount}</strong>
          {formatCount(ledger.eventCount, "event", "events", "活动")}{" "}
          {bilingualText(
            "已可用于关系准备。",
            "ready for relationship prep.",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("已导入记录", "Imported records")}</dt>
        <dd>
          <strong>{ledger.importedRecordCount}</strong>
          {bilingualText(
            "日历和主办方记录已映射到活动背景。",
            "Calendar and organizer records mapped into event context.",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("主要活动", "Primary event")}</dt>
        <dd>
          {ledger.primaryTitle} <code>{ledger.primaryStatus}</code>
        </dd>
      </div>
    </dl>
  );
}

function CurrentEventPriority({
  priority,
}: {
  priority: AppEventsCurrentPriorityViewModel | null;
}) {
  if (!priority) {
    return null;
  }

  return (
    <div data-route-priority="app-events-current-event">
      <WorkbenchSurface
        className="events-current-priority"
        elevated
        eyebrow={bilingualText("当前活动优先级", "Current event priority")}
        title={bilingualText(
          `准备 ${priority.eventTitle}`,
          `Prepare for ${priority.eventTitle}`,
        )}
      >
        <div className="events-priority-grid">
          <div className="events-card">
            <h3>{priority.venue}</h3>
            <p className="type-body">{priority.relationshipContext}</p>
            <p className="type-body">
              {bilingualText(
                `优先见 ${priority.attendeeName}。`,
                `Meet ${priority.attendeeName} there.`,
              )}{" "}
              {priority.recommendedAction}
            </p>
            <a className="events-detail-link" href={priority.detailHref}>
              {priority.detailActionLabel}
            </a>
          </div>
          <dl
            aria-label={bilingualText(
              "当前活动准备状态",
              "Current event preparation status",
            )}
            className="relationship-meta"
          >
            <div>
              <dt>{bilingualText("要见谁", "Who to meet")}</dt>
              <dd>{priority.attendeeName}</dd>
            </div>
            <div>
              <dt>{bilingualText("为什么重要", "Why it matters")}</dt>
              <dd>{priority.relationshipValue}</dd>
            </div>
            <div>
              <dt>{bilingualText("准备度", "Readiness")}</dt>
              <dd>
                {bilingualText(
                  `准备度 ${priority.readinessScore}`,
                  `Readiness ${priority.readinessScore}`,
                )}
              </dd>
            </div>
            <div>
              <dt>{bilingualText("下一步安全动作", "Next safe action")}</dt>
              <dd>
                {bilingualText(
                  `${priority.detailActionLabel}，然后再考虑任何日历、消息或保存记录动作。`,
                  `${priority.detailActionLabel} before any calendar, message, or saved-record action.`,
                )}
              </dd>
            </div>
          </dl>
        </div>
      </WorkbenchSurface>
    </div>
  );
}

function EventCards({
  events,
}: {
  events: readonly AppEventsEventChoiceViewModel[];
}) {
  return (
    <div
      className="events-card-grid"
      aria-label={bilingualText("活动选择", "Event choices")}
    >
      {events.map((event) => (
        <article
          aria-label={`Event work for ${event.title}`}
          className="events-card"
          key={event.id}
        >
          <h3>{event.title}</h3>
          <p className="type-body">
            {bilingualText("地点", "Venue")}: {event.venue}.{" "}
            {bilingualText("参会机会", "Attendee opportunity")}:{" "}
            {event.attendeeName}.
          </p>
          <p className="type-body">
            {bilingualText("准备度", "Readiness")}:{" "}
            {event.readinessScore}.{" "}
            {bilingualText("关系价值", "Relationship value")}:{" "}
            {event.relationshipValue}
          </p>
          <p className="type-body">{event.nextAction}</p>
          <a className="events-detail-link" href={event.detailHref}>
            {bilingualText(`复核 ${event.title}`, `Review ${event.title}`)}
          </a>
          <EvidenceChips
            evidence={event.evidence}
            label={bilingualText(`${event.title} 证据`, `${event.title} evidence`)}
          />
        </article>
      ))}
    </div>
  );
}

function AttendeeRecommendationPanel({
  recommendation,
  summary,
}: {
  recommendation: AppEventsAttendeeRecommendationViewModel | null;
  summary: string;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("推荐连接", "Recommended connection")}
      title={bilingualText("要见谁", "Who to meet")}
    >
      <p className="type-body">{summary}</p>
      {recommendation && (
        <article className="events-card">
          <h3>{recommendation.attendeeName}</h3>
          <p className="type-body">
            {recommendation.role} at {recommendation.organization}.{" "}
            {bilingualText("评分", "Score")} {recommendation.score}.{" "}
            {recommendation.recommendedAction}
          </p>
          <p className="type-body">{recommendation.openingLine}</p>
          <EvidenceChips
            evidence={recommendation.evidence}
            label={bilingualText(
              "首选参会人推荐证据",
              "Top attendee recommendation evidence",
            )}
          />
        </article>
      )}
    </WorkbenchSurface>
  );
}

function EventValuePanel({
  recommendation,
  summary,
}: {
  recommendation: AppEventsValueRecommendationViewModel | null;
  summary: string;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("活动价值", "Event value")}
      title={bilingualText("时间应该花在哪里", "Where to spend time")}
    >
      <p className="type-body">{summary}</p>
      {recommendation && (
        <article className="events-card">
          <h3>{recommendation.title}</h3>
          <p className="type-body">
            {bilingualText("评分", "Score")} {recommendation.valueScore}.{" "}
            {recommendation.attendeeDensity}{" "}
            {bilingualText("位相关参会人在", "relevant attendees in")}{" "}
            {recommendation.location}. {recommendation.recommendedAction}
          </p>
          <EvidenceChips
            evidence={recommendation.evidence}
            label={bilingualText("首选活动价值证据", "Top event value evidence")}
          />
        </article>
      )}
    </WorkbenchSurface>
  );
}

function ReadinessChecklist({
  items,
}: {
  items: readonly AppEventsReadinessChecklistItemViewModel[];
}) {
  return (
    <dl className="relationship-meta">
      {items.map((item) => (
        <div key={item.id}>
          <dt>{item.label}</dt>
          <dd>
            <code>{item.status}</code>{" "}
            {bilingualText("负责人", "by")} {item.owner}.{" "}
            {item.rationale}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReadinessPanel({
  readiness,
}: {
  readiness: AppEventsReadinessViewModel;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("准备度", "Readiness")}
      title={bilingualText("到达前", "Before arrival")}
    >
      <p className="type-body">
        {bilingualText(
          `准备度 ${readiness.readinessScore}。`,
          `Readiness ${readiness.readinessScore}.`,
        )}{" "}
        {readiness.nextPreparationStep}
      </p>
      <ReadinessChecklist items={readiness.checklist} />
      <EvidenceChips
        evidence={readiness.evidence}
        label={bilingualText("活动准备证据", "Event readiness evidence")}
      />
    </WorkbenchSurface>
  );
}

function EventActionResult({
  result,
}: {
  result: AppEventsActionResultViewModel;
}) {
  if (result.state === "failure") {
    return (
      <section
        className="events-action-result"
        data-side-effects="none"
        data-task-result="events-accept-top-event-preview-failed"
      >
        <h3>
          {bilingualText(
            "活动推荐动作不可用",
            "Event recommendation action is unavailable",
          )}
        </h3>
        <p className="type-body">
          {bilingualText(
            "工作区已把该动作保留为私有预览，没有联系外部服务。",
            "The workspace kept the action private and did not contact outside services.",
          )}
        </p>
      </section>
    );
  }

  return (
    <section
      className="events-action-result"
      data-action-evidence="events-accept-top-event-local-preview"
      data-side-effects={result.outsideContacted ? "unexpected" : "none"}
      data-task-result="events-accept-top-event-preview"
    >
      <h3>
        {bilingualText(
          `活动推荐已接受：${result.acceptedTitle}`,
          `Event recommendation accepted: ${result.acceptedTitle}`,
        )}
      </h3>
      <p className="type-body">{result.summary}</p>
      <p className="type-body">
        {bilingualText(
          "没有更改日历、保存记录、发送消息或通知，也没有联系外部服务。",
          "No calendar changes, saved records, messages, or notifications were made. No outside services were contacted.",
        )}
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("决策", "Decision")}</dt>
          <dd>{result.decisionLabel}</dd>
        </div>
        <div>
          <dt>{bilingualText("日历", "Calendar")}</dt>
          <dd>
            {bilingualText("日历变更", "Calendar changes")}:{" "}
            {result.calendarNeedsReview
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("已保存记录", "Saved records")}</dt>
          <dd>
            {bilingualText("已保存记录", "Saved records")}:{" "}
            {result.databaseWriteNeedsReview
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("实时在线状态", "Realtime presence")}</dt>
          <dd>
            {bilingualText("实时在线状态：无", "Realtime presence: none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("同伴通知", "Peer notifications")}</dt>
          <dd>{bilingualText("同伴通知：无", "Peer notifications: none")}</dd>
        </div>
        <div>
          <dt>{bilingualText("外部消息", "External messages")}</dt>
          <dd>{bilingualText("外部消息：无", "External messages: none")}</dd>
        </div>
        <div>
          <dt>{bilingualText("消息", "Messages")}</dt>
          <dd>
            {bilingualText("消息和通知", "Messages and notifications")}:{" "}
            {result.outsideContacted
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("通知", "Notifications")}</dt>
          <dd>
            {bilingualText("通知", "Notifications")}:{" "}
            {result.notificationNeedsReview
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("外部网络", "Outside network")}</dt>
          <dd>
            {bilingualText("外部网络请求", "Outside network requests")}:{" "}
            {result.externalNetworkNeedsReview
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
      </dl>
      <EvidenceChips
        evidence={result.evidence}
        label={bilingualText("活动动作证据", "Event action evidence")}
      />
    </section>
  );
}

function SuccessView({
  workspace,
}: {
  workspace: AppEventsSuccessViewModel;
}) {
  const topCandidate = workspace.topCandidate;

  return (
    <div className="app-events-route" data-state-boundary="app-events-success">
      <style>{appEventsStyles}</style>
      <CurrentEventPriority priority={workspace.currentPriority} />

      <WorkbenchSurface
        className="events-command"
        elevated
        eyebrow={bilingualText("活动", "Events")}
        title={bilingualText("活动简报", "Event briefing")}
      >
        <p className="type-body">
          {bilingualText(
            "选择一个有来源支撑的活动，查看那里最重要的人，并决定下一步准备什么。",
            "Choose a source-backed event, see who matters there, and decide what to prepare next.",
          )}
        </p>
        <EventLedger ledger={workspace.ledger} />
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow={bilingualText("活动选择", "Event choices")}
        title={bilingualText("活动选择", "Event choices")}
      >
        <p className="type-body">{workspace.eventSummary}</p>
        <EventCards events={workspace.eventChoices} />
      </WorkbenchSurface>

      <section
        aria-label={bilingualText("准备信号", "Preparation signals")}
        className="events-preparation-signals"
      >
        <h2>{bilingualText("准备信号", "Preparation signals")}</h2>
        <div className="events-card-grid">
          <AttendeeRecommendationPanel
            recommendation={workspace.attendeePanel.recommendation}
            summary={workspace.attendeePanel.summary}
          />
          <EventValuePanel
            recommendation={workspace.valuePanel.recommendation}
            summary={workspace.valuePanel.summary}
          />
          <ReadinessPanel readiness={workspace.readiness} />
        </div>
      </section>

      <WorkbenchSurface
        eyebrow={bilingualText("核心动作", "Core action")}
        title={bilingualText("预览活动决策", "Preview event decision")}
      >
        <p className="type-body">
          {bilingualText(
            "在任何日历、保存记录、消息或通知发生变化前，先预览首选活动决策。",
            "Preview the top event decision before anything changes calendars, saved records, messages, or notifications.",
          )}
        </p>
        <a className="events-action-link" href="/app/events?action=accept-top-event">
          {bilingualText("预览首选活动动作", "Preview top event action")}
        </a>
        {workspace.actionResult && (
          <EventActionResult result={workspace.actionResult} />
        )}
        {!workspace.actionResult && topCandidate && (
          <p className="type-body">
            {bilingualText(
              `首选候选：${topCandidate.title}，价值评分 ${topCandidate.valueScore}。`,
              `Top candidate: ${topCandidate.title} with value score ${topCandidate.valueScore}.`,
            )}
          </p>
        )}
      </WorkbenchSurface>
    </div>
  );
}

export function AppEventsCommandCenter({
  searchParams,
}: AppEventsCommandCenterProps) {
  const viewModel = loadAppEventsRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return <RouteStateBoundary routeState={viewModel.routeState} />;
  }

  return <SuccessView workspace={viewModel.workspace} />;
}
