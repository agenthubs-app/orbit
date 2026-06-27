/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type {
  EventListPayload,
  EventListResult,
  EventRecord,
  ImportedEventRecord,
} from "../../../../../features/events/contract";
import type {
  EventGoalReadinessPayload,
  EventGoalReadinessResult,
  EventReadinessChecklistItem,
} from "../../../../../features/events/goal-contract";
import type {
  EventAttendeeRecommendation,
  EventRecommendationsPayload,
  EventRecommendationsResult,
} from "../../../../../features/recommendations/contract";
import type {
  EventValueRecommendation,
  EventValueRecommendationAcceptanceResult,
  EventValueRecommendationsPayload,
  EventValueRecommendationsResult,
} from "../../../../../features/recommendations/event-value-contract";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  createAppEventsRouteServices,
  type AppEventsRouteServices,
} from "./events-service-factory";

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

const routeRecoveryActions: Record<
  RouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/events",
      label: bilingualText("显示有来源活动", "Show sourced events"),
    },
    {
      href: "/app/events?action=accept-top-event",
      label: bilingualText("预览首选活动动作", "Preview top event action"),
    },
  ],
  failure: [
    {
      href: "/app/events",
      label: bilingualText("重新加载活动", "Reload events"),
    },
    {
      href: "/app/events?scenario=pending",
      label: bilingualText("检查准备状态", "Check readiness status"),
    },
  ],
  pending: [
    {
      href: "/app/events",
      label: bilingualText("返回已准备活动", "Return to ready events"),
    },
  ],
};

type AppEventsSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";
type RouteResult =
  | EventListResult
  | EventRecommendationsResult
  | EventValueRecommendationsResult
  | EventGoalReadinessResult;

interface RouteFailure {
  code: string;
  message: string;
  recovery: string;
  evidenceIds?: readonly string[];
}

export interface AppEventsCommandCenterProps {
  searchParams?: AppEventsSearchParams;
}

function readSearchParam(
  searchParams: AppEventsSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppEventsSearchParams | undefined,
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstFailure(results: readonly RouteResult[]): RouteFailure | null {
  for (const result of results) {
    if (result.success === false) {
      return result.error;
    }
  }

  return null;
}

function anyResultState(
  results: readonly RouteResult[],
  state: "empty" | "pending",
): boolean {
  return results.some(
    (result) => result.success === true && result.data.state === state,
  );
}

function stateCopy(
  scenario: RouteScenario,
): {
  title: string;
  description: string;
  purpose: string;
  emptyState: string;
  guardrail: string;
  nextStep: string;
} {
  if (scenario === "empty") {
    return {
      description: bilingualText(
        "先创建或导入有来源的活动，再复核推荐和准备度。",
        "Create or import a sourced event before reviewing recommendations and readiness.",
      ),
      emptyState: bilingualText(
        "还没有活动、价值推荐、参会人推荐或准备记录可用。",
        "No event, value recommendation, attendee recommendation, or readiness record is ready.",
      ),
      guardrail: bilingualText(
        "此屏幕不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
        "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone from this screen.",
      ),
      nextStep: bilingualText(
        "返回有来源活动，或通过已批准的活动流程添加活动。",
        "Return to sourced events or add an event through the approved event workflow.",
      ),
      purpose: bilingualText(
        "仅在来源证据存在后展示活动准备。",
        "Show event preparation only after source evidence exists.",
      ),
      title: bilingualText("没有可用活动背景", "No event context is ready"),
    };
  }

  if (scenario === "pending") {
    return {
      description: bilingualText(
        "活动来源、推荐规则和准备检查仍在准备中。",
        "Event sources, recommendation rules, and readiness checks are still being prepared.",
      ),
      emptyState: bilingualText(
        "当前来源复核完成前，活动准备会保持隐藏。",
        "Event preparation stays hidden until the current source review finishes.",
      ),
      guardrail: bilingualText(
        "复核待处理期间，不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
        "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while review is pending.",
      ),
      nextStep: bilingualText(
        "来源复核完成后返回已准备活动。",
        "Return to ready events after the source review completes.",
      ),
      purpose: bilingualText(
        "活动准备数据仍在加载时，保持工作区稳定。",
        "Keep the workspace stable while event preparation data is still loading.",
      ),
      title: bilingualText("活动背景加载中", "Event context is loading"),
    };
  }

  return {
    description: bilingualText(
      "活动来源无法加载，因此推荐和准备状态已暂停。",
      "Event sources could not be loaded, so recommendations and readiness are paused.",
    ),
    emptyState: bilingualText(
      "活动简报会在活动来源恢复前保持不可用。",
      "The event briefing is unavailable until event sources recover.",
    ),
    guardrail: bilingualText(
      "不可用期间，不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
      "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while this is unavailable.",
    ),
    nextStep: bilingualText(
      "采取动作前，重新加载活动或检查准备状态。",
      "Reload events or check readiness status before taking action.",
    ),
    purpose: bilingualText(
      "当有来源支撑的活动背景不可用时，展示可见恢复路径。",
      "Show a visible recovery path when source-backed event context is unavailable.",
    ),
    title: bilingualText("活动无法加载", "Events could not load"),
  };
}

function RouteStateBoundary({
  failure,
  scenario,
}: {
  failure?: RouteFailure | null;
  scenario: RouteScenario;
}) {
  const copy = stateCopy(scenario);

  return (
    <div
      className="app-events-route-state"
      data-error-code={failure?.code}
      data-route-state-url={`/app/events?scenario=${scenario}`}
    >
      <style>{appEventsStyles}</style>
      <div data-state-boundary="app-events-route-state-view">
        <WorkbenchSurface
          elevated
          eyebrow={bilingualText("活动", "Events")}
          title={copy.title}
        >
          <p className="type-body">{copy.description}</p>
          <dl
            aria-label={bilingualText("活动状态详情", "Event status details")}
            className="relationship-meta"
          >
            <div>
              <dt>{bilingualText("Orbit 已知道", "What Orbit knows")}</dt>
              <dd>{copy.purpose}</dd>
            </div>
            <div>
              <dt>{bilingualText("当前状态", "Current status")}</dt>
              <dd>{copy.emptyState}</dd>
            </div>
            <div>
              <dt>{bilingualText("安全检查", "Safety check")}</dt>
              <dd>{copy.guardrail}</dd>
            </div>
            <div>
              <dt>{bilingualText("下一步", "Next step")}</dt>
              <dd>{copy.nextStep}</dd>
            </div>
          </dl>
          {failure?.evidenceIds && (
            <EvidenceChips
              evidenceIds={failure.evidenceIds}
              label={bilingualText("活动恢复证据", "Event recovery evidence")}
            />
          )}
        </WorkbenchSurface>
      </div>
      <nav
        aria-label={bilingualText("活动恢复操作", "Events recovery actions")}
        className="events-recovery-actions"
      >
        {routeRecoveryActions[scenario].map((action) => (
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

function eventDetailHref(event: EventRecord): string {
  return `/app/events/${encodeURIComponent(event.id)}`;
}

function relationshipValueCopy(event: EventRecord): string {
  const context = productCopy(event.relationshipContext);

  if (/storage pilot/i.test(context)) {
    return "storage pilot relationship goals.";
  }

  return context;
}

const productCopyReplacements: readonly [RegExp, string][] = [
  [/\blocal mock decision\b/gi, "private preview"],
  [
    /\bwithout live ranking, vector, or model calls\b/gi,
    "from the approved attendee evidence",
  ],
  [/\bwithout live feeds\b/gi, "from the approved event evidence"],
  [/\bwithout live writes\b/gi, "without changing any connected account"],
  [/\blocal event records\b/gi, "event sources"],
  [/\blocal ranking rules\b/gi, "Relationship signals"],
  [/\blocal rules\b/gi, "Relationship signals"],
  [/\blocal evidence\b/gi, "Source evidence"],
  [/\bdeterministic local suggestions\b/gi, "relationship suggestions"],
  [/\bdeterministic local rule\b/gi, "readiness check"],
  [/\blocal route\b/gi, "workspace"],
  [/\bfixtures?\b/gi, "source record"],
  [/\bmanual event source records?\b/gi, "manual notes"],
  [/\bsource records has\b/gi, "source record has"],
  [/\bwriting calendars\b/gi, "changing calendars"],
  [/\bdatabases\b/gi, "saved records"],
  [/\bdatabase\b/gi, "saved record"],
  [/\bproviders?\b/gi, "connections"],
  [/\bboundary\b/gi, "check"],
  [/\broute\b/gi, "workspace"],
  [/\bmock\b/gi, "preview"],
  [/\blive\b/gi, "connected"],
  [/\bmodel calls?\b/gi, "automated calls"],
  [/\bvector\b/gi, "search"],
  [/\bdeterministic\b/gi, "reviewed"],
  [/\blocally\b/gi, "for this event"],
];

function productCopy(value: string): string {
  return productCopyReplacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value);
}

function evidenceLabel(evidenceId: string): string {
  const words = evidenceId
    .replace(/^evidence:/, "")
    .split(/[-_:]+/)
    .filter((word) => !["fixture", "mock", "local"].includes(word))
    .map((word) => {
      if (word === "rec") {
        return "recommendation";
      }

      if (word === "evt") {
        return "event";
      }

      return word;
    });

  const label = words.join(" ");

  const englishLabel = label.charAt(0).toUpperCase() + label.slice(1);

  return bilingualText(`证据 ${englishLabel}`, englishLabel);
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidenceIds.slice(0, 6).map((evidenceId) => (
        <span key={evidenceId} data-evidence-id={evidenceId}>
          <Chip tone="evidence">{evidenceLabel(evidenceId)}</Chip>
        </span>
      ))}
    </div>
  );
}

function EventLedger({
  events,
  importedRecords,
}: {
  events: readonly EventRecord[];
  importedRecords: readonly ImportedEventRecord[];
}) {
  return (
    <dl className="events-ledger">
      <div>
        <dt>{bilingualText("有来源活动", "Sourced events")}</dt>
        <dd>
          <strong>{events.length}</strong>
          {formatCount(events.length, "event", "events", "活动")}{" "}
          {bilingualText(
            "已可用于关系准备。",
            "ready for relationship prep.",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("已导入记录", "Imported records")}</dt>
        <dd>
          <strong>{importedRecords.length}</strong>
          {bilingualText(
            "日历和主办方记录已映射到活动背景。",
            "Calendar and organizer records mapped into event context.",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("主要活动", "Primary event")}</dt>
        <dd>
          {events[0]?.title ?? bilingualText("没有有来源活动", "No sourced event")}{" "}
          <code>{events[0]?.status ?? bilingualText("不可用", "unavailable")}</code>
        </dd>
      </div>
    </dl>
  );
}

function CurrentEventPriority({
  attendeePayload,
  eventPayload,
  readinessPayload,
}: {
  attendeePayload: EventRecommendationsPayload;
  eventPayload: EventListPayload;
  readinessPayload: EventGoalReadinessPayload;
}) {
  const currentEvent = eventPayload.events[0];
  const topAttendee = attendeePayload.recommendations[0];

  if (!currentEvent || !topAttendee) {
    return null;
  }

  const detailActionLabel = bilingualText(
    `打开 ${currentEvent.title} 工作区`,
    `Open ${currentEvent.title} workspace`,
  );

  return (
    <div data-route-priority="app-events-current-event">
      <WorkbenchSurface
        className="events-current-priority"
        elevated
        eyebrow={bilingualText("当前活动优先级", "Current event priority")}
        title={bilingualText(
          `准备 ${currentEvent.title}`,
          `Prepare for ${currentEvent.title}`,
        )}
      >
        <div className="events-priority-grid">
          <div className="events-card">
            <h3>{currentEvent.venue}</h3>
            <p className="type-body">
              {productCopy(currentEvent.relationshipContext)}
            </p>
            <p className="type-body">
              {bilingualText(
                `优先见 ${topAttendee.attendee.displayName}。`,
                `Meet ${topAttendee.attendee.displayName} there.`,
              )}{" "}
              {productCopy(topAttendee.recommendedAction)}
            </p>
            <a className="events-detail-link" href={eventDetailHref(currentEvent)}>
              {detailActionLabel}
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
              <dd>{topAttendee.attendee.displayName}</dd>
            </div>
            <div>
              <dt>{bilingualText("为什么重要", "Why it matters")}</dt>
              <dd>{relationshipValueCopy(currentEvent)}</dd>
            </div>
            <div>
              <dt>{bilingualText("准备度", "Readiness")}</dt>
              <dd>
                {bilingualText(
                  `准备度 ${readinessPayload.preparationState.readinessScore}`,
                  `Readiness ${readinessPayload.preparationState.readinessScore}`,
                )}
              </dd>
            </div>
            <div>
              <dt>{bilingualText("下一步安全动作", "Next safe action")}</dt>
              <dd>
                {bilingualText(
                  `${detailActionLabel}，然后再考虑任何日历、消息或保存记录动作。`,
                  `${detailActionLabel} before any calendar, message, or saved-record action.`,
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
  readinessPayload,
  topRecommendation,
}: {
  events: readonly EventRecord[];
  readinessPayload: EventGoalReadinessPayload;
  topRecommendation: EventAttendeeRecommendation | undefined;
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
            {topRecommendation?.attendee.displayName ??
              bilingualText("复核参会人名单", "review attendee roster")}
            .
          </p>
          <p className="type-body">
            {bilingualText("准备度", "Readiness")}:{" "}
            {readinessPayload.preparationState.readinessScore}.{" "}
            {bilingualText("关系价值", "Relationship value")}:{" "}
            {relationshipValueCopy(event)}
          </p>
          <p className="type-body">
            {productCopy(event.nextAction)} {productCopy(event.recommendedPreparation)}
          </p>
          <a className="events-detail-link" href={eventDetailHref(event)}>
            {bilingualText(`复核 ${event.title}`, `Review ${event.title}`)}
          </a>
          <EvidenceChips
            evidenceIds={event.evidence.map((item) => item.evidenceId)}
            label={bilingualText(`${event.title} 证据`, `${event.title} evidence`)}
          />
        </article>
      ))}
    </div>
  );
}

function AttendeeRecommendationPanel({
  payload,
}: {
  payload: EventRecommendationsPayload;
}) {
  const topRecommendation = payload.recommendations[0];

  return (
    <WorkbenchSurface
      eyebrow={bilingualText("推荐连接", "Recommended connection")}
      title={bilingualText("要见谁", "Who to meet")}
    >
      <p className="type-body">{productCopy(payload.summary)}</p>
      {topRecommendation && (
        <article className="events-card">
          <h3>{topRecommendation.attendee.displayName}</h3>
          <p className="type-body">
            {topRecommendation.attendee.role} at{" "}
            {topRecommendation.attendee.organization}.{" "}
            {bilingualText("评分", "Score")} {topRecommendation.score}.{" "}
            {topRecommendation.recommendedAction}
          </p>
          <p className="type-body">{topRecommendation.openingLine.text}</p>
          <EvidenceChips
            evidenceIds={topRecommendation.evidenceIds}
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
  payload,
}: {
  payload: EventValueRecommendationsPayload;
}) {
  const topRecommendation = payload.recommendations[0];

  return (
    <WorkbenchSurface
      eyebrow={bilingualText("活动价值", "Event value")}
      title={bilingualText("时间应该花在哪里", "Where to spend time")}
    >
      <p className="type-body">{productCopy(payload.summary)}</p>
      {topRecommendation && (
        <article className="events-card">
          <h3>{topRecommendation.title}</h3>
          <p className="type-body">
            {bilingualText("评分", "Score")} {topRecommendation.valueScore}.{" "}
            {topRecommendation.attendeeDensity}{" "}
            {bilingualText("位相关参会人在", "relevant attendees in")}{" "}
            {topRecommendation.location}. {topRecommendation.recommendedAction}
          </p>
          <EvidenceChips
            evidenceIds={topRecommendation.evidenceIds}
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
  items: readonly EventReadinessChecklistItem[];
}) {
  return (
    <dl className="relationship-meta">
      {items.map((item) => (
        <div key={item.itemId}>
          <dt>{productCopy(item.label)}</dt>
          <dd>
            <code>{item.status}</code>{" "}
            {bilingualText("负责人", "by")} {item.owner}.{" "}
            {productCopy(item.rationale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReadinessPanel({
  payload,
}: {
  payload: EventGoalReadinessPayload;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("准备度", "Readiness")}
      title={bilingualText("到达前", "Before arrival")}
    >
      <p className="type-body">
        {bilingualText(
          `准备度 ${payload.preparationState.readinessScore}。`,
          `Readiness ${payload.preparationState.readinessScore}.`,
        )}{" "}
        {productCopy(payload.preparationState.nextPreparationStep)}
      </p>
      <ReadinessChecklist items={payload.readinessChecklist} />
      <EvidenceChips
        evidenceIds={payload.provenance.evidenceIds}
        label={bilingualText("活动准备证据", "Event readiness evidence")}
      />
    </WorkbenchSurface>
  );
}

function outsideServicesContacted(
  result: EventValueRecommendationAcceptanceResult,
): boolean {
  if (result.success === false) {
    return false;
  }

  return (
    result.data.action.externalNetworkRequested ||
    result.data.action.calendarProviderRequested ||
    result.data.action.notificationDelivered ||
    result.data.action.databaseWriteExecuted ||
    result.data.action.productionAuditLogWriteExecuted
  );
}

function EventActionResult({
  result,
}: {
  result: EventValueRecommendationAcceptanceResult;
}) {
  if (result.success === false) {
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

  const outsideContacted = outsideServicesContacted(result);

  return (
    <section
      className="events-action-result"
      data-action-evidence="events-accept-top-event-local-preview"
      data-side-effects={outsideContacted ? "unexpected" : "none"}
      data-task-result="events-accept-top-event-preview"
    >
      <h3>
        {bilingualText(
          `活动推荐已接受：${result.data.acceptedEvent.title}`,
          `Event recommendation accepted: ${result.data.acceptedEvent.title}`,
        )}
      </h3>
      <p className="type-body">{productCopy(result.data.summary)}</p>
      <p className="type-body">
        {bilingualText(
          "没有更改日历、保存记录、发送消息或通知，也没有联系外部服务。",
          "No calendar changes, saved records, messages, or notifications were made. No outside services were contacted.",
        )}
      </p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("决策", "Decision")}</dt>
          <dd>{result.data.action.label}</dd>
        </div>
        <div>
          <dt>{bilingualText("日历", "Calendar")}</dt>
          <dd>
            {bilingualText("日历变更", "Calendar changes")}:{" "}
            {result.data.action.calendarProviderRequested
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("已保存记录", "Saved records")}</dt>
          <dd>
            {bilingualText("已保存记录", "Saved records")}:{" "}
            {result.data.action.databaseWriteExecuted
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
            {outsideContacted
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("通知", "Notifications")}</dt>
          <dd>
            {bilingualText("通知", "Notifications")}:{" "}
            {result.data.action.notificationDelivered
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("外部网络", "Outside network")}</dt>
          <dd>
            {bilingualText("外部网络请求", "Outside network requests")}:{" "}
            {result.data.action.externalNetworkRequested
              ? bilingualText("需复核", "review")
              : bilingualText("无", "none")}
          </dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={result.data.action.evidenceIds}
        label={bilingualText("活动动作证据", "Event action evidence")}
      />
    </section>
  );
}

function actionResultFor(
  action: string | null,
  services: AppEventsRouteServices,
  topRecommendation: EventValueRecommendation | undefined,
): EventValueRecommendationAcceptanceResult | null {
  if (action !== "accept-top-event" || !topRecommendation) {
    return null;
  }

  return services.eventValues.acceptRecommendedEvent({
    eventId: topRecommendation.eventId,
  });
}

function SuccessView({
  actionResult,
  attendeePayload,
  eventPayload,
  readinessPayload,
  valuePayload,
}: {
  actionResult: EventValueRecommendationAcceptanceResult | null;
  attendeePayload: EventRecommendationsPayload;
  eventPayload: EventListPayload;
  readinessPayload: EventGoalReadinessPayload;
  valuePayload: EventValueRecommendationsPayload;
}) {
  const topValueEvent = valuePayload.recommendations[0];

  return (
    <div className="app-events-route" data-state-boundary="app-events-success">
      <style>{appEventsStyles}</style>
      <CurrentEventPriority
        attendeePayload={attendeePayload}
        eventPayload={eventPayload}
        readinessPayload={readinessPayload}
      />

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
        <EventLedger
          events={eventPayload.events}
          importedRecords={eventPayload.importedRecords}
        />
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow={bilingualText("活动选择", "Event choices")}
        title={bilingualText("活动选择", "Event choices")}
      >
        <p className="type-body">{productCopy(eventPayload.summary)}</p>
        <EventCards
          events={eventPayload.events}
          readinessPayload={readinessPayload}
          topRecommendation={attendeePayload.recommendations[0]}
        />
      </WorkbenchSurface>

      <section
        aria-label={bilingualText("准备信号", "Preparation signals")}
        className="events-preparation-signals"
      >
        <h2>{bilingualText("准备信号", "Preparation signals")}</h2>
        <div className="events-card-grid">
          <AttendeeRecommendationPanel payload={attendeePayload} />
          <EventValuePanel payload={valuePayload} />
          <ReadinessPanel payload={readinessPayload} />
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
        {actionResult && <EventActionResult result={actionResult} />}
        {!actionResult && topValueEvent && (
          <p className="type-body">
            {bilingualText(
              `首选候选：${topValueEvent.title}，价值评分 ${topValueEvent.valueScore}。`,
              `Top candidate: ${topValueEvent.title} with value score ${topValueEvent.valueScore}.`,
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
  const scenario = readRouteScenario(searchParams);
  const services = createAppEventsRouteServices();
  const eventResult = services.events.listEvents({ scenario });
  const attendeeResult = services.attendeeRecommendations.listEventRecommendations({
    limit: 3,
    scenario,
  });
  const valueResult = services.eventValues.listRecommendedEvents({
    limit: 3,
    scenario,
  });
  const readinessResult = services.readiness.getReadiness({ scenario });
  const results = [
    eventResult,
    attendeeResult,
    valueResult,
    readinessResult,
  ] as const;
  const failure = firstFailure(results);

  if (failure || scenario === "failure") {
    return <RouteStateBoundary failure={failure} scenario="failure" />;
  }

  if (scenario === "empty" || anyResultState(results, "empty")) {
    return <RouteStateBoundary scenario="empty" />;
  }

  if (scenario === "pending" || anyResultState(results, "pending")) {
    return <RouteStateBoundary scenario="pending" />;
  }

  if (
    eventResult.success === false ||
    attendeeResult.success === false ||
    valueResult.success === false ||
    readinessResult.success === false
  ) {
    return <RouteStateBoundary scenario="failure" />;
  }

  const actionResult = actionResultFor(
    readSearchParam(searchParams, "action"),
    services,
    valueResult.data.recommendations[0],
  );

  return (
    <SuccessView
      actionResult={actionResult}
      attendeePayload={attendeeResult.data}
      eventPayload={eventResult.data}
      readinessPayload={readinessResult.data}
      valuePayload={valueResult.data}
    />
  );
}
