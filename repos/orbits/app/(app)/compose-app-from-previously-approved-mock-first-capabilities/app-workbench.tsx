/**
 * `/app` 工作台的聚合组件。
 *
 * 这里从多个 mock-first service 读取首屏关系工作数据：bootstrap、profile、
 * events、followups、dashboard、notifications 和 agent queue。它只生成可复核
 * 的页面预览和本地 action 结果，不发送消息、写数据库或触发外部网络。
 */
import { createAgentActionQueueService } from "../../../features/agent/service-factory";
import type {
  AppBootstrapPayload,
  AppBootstrapScenario,
} from "../../../features/bootstrap/contract";
import { createAppBootstrapService } from "../../../features/bootstrap/service-factory";
import type { AppBootstrapFailure } from "../../../features/bootstrap/service";
import { createDashboardAggregateService } from "../../../features/dashboard/service-factory";
import { createEventCrudAndImportService } from "../../../features/events/service-factory";
import { createFollowupTaskGenerationService } from "../../../features/followups/service-factory";
import { createReminderScheduleNotificationService } from "../../../features/notifications/service-factory";
import { createProfileService } from "../../../features/profile/service-factory";
import { Chip, WorkbenchSurface } from "../../../shared/ui/primitives";
import { StateView } from "../../../shared/ui/state-view";

const appWorkbenchStyles = `
/* 工作台样式只约束这个 route 的聚合布局，避免影响共享组件。 */
.app-workbench-route {
  display: grid;
  gap: var(--orbit-space-md);
}

.app-workbench-route,
.app-workbench-route .workbench-surface,
.app-workbench-route .relationship-meta,
.app-workbench-route .chip-row,
.app-workbench-route .app-workbench-priority-grid,
.app-workbench-route .app-workbench-priority-facts,
.app-workbench-route .app-workbench-primary-actions,
.app-workbench-route .app-workbench-outcome-grid,
.app-workbench-route .app-workbench-outcome-card,
.app-workbench-route .app-workbench-action-result {
  min-width: 0;
}

.app-workbench-route .app-workbench-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-workbench-route .app-workbench-command .surface-heading h2 {
  max-width: 820px;
}

.app-workbench-route .app-workbench-priority-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1.35fr) minmax(min(100%, 240px), 0.65fr);
}

.app-workbench-route .app-workbench-priority-copy {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-priority-facts,
.app-workbench-route .app-workbench-outcome-grid {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-priority-facts {
  align-content: start;
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-priority-facts dl {
  display: grid;
  gap: var(--orbit-space-sm);
  margin: 0;
}

.app-workbench-route .app-workbench-priority-facts div,
.app-workbench-route .app-workbench-action-result {
  border-top: 1px solid var(--orbit-color-border);
  padding-top: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-priority-facts div:first-child,
.app-workbench-route .app-workbench-action-result:first-child {
  border-top: 0;
  padding-top: 0;
}

.app-workbench-route .app-workbench-priority-facts dt,
.app-workbench-route .app-workbench-outcome-card span {
  color: var(--orbit-color-muted);
  font-size: 0.78rem;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.35;
  text-transform: uppercase;
}

.app-workbench-route .app-workbench-priority-facts dd {
  color: var(--orbit-color-text);
  display: block;
  font-size: 0.94rem;
  line-height: 1.35;
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}

.app-workbench-route .app-workbench-primary-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-primary-action,
.app-workbench-route .app-workbench-secondary-link {
  align-items: center;
  border-radius: var(--orbit-radius-control);
  display: inline-flex;
  font-weight: 760;
  justify-content: center;
  line-height: 1.25;
  min-height: 42px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 9px 13px;
  text-align: center;
  text-decoration: none;
  white-space: normal;
}

.app-workbench-route .app-workbench-primary-action {
  background: var(--orbit-color-primary);
  border: 1px solid var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

.app-workbench-route .app-workbench-secondary-link {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  color: var(--orbit-color-text);
}

.app-workbench-route .app-workbench-outcome-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
}

.app-workbench-route .app-workbench-outcome-card {
  border-top: 1px solid var(--orbit-color-border);
  display: grid;
  gap: 7px;
  padding-top: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-outcome-card h3,
.app-workbench-route .app-workbench-outcome-card p {
  margin: 0;
  overflow-wrap: anywhere;
}

.app-workbench-route .app-workbench-outcome-card h3 {
  color: var(--orbit-color-text);
  font-size: 1rem;
  line-height: 1.25;
}

.app-workbench-route .app-workbench-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 3px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: 6px;
  padding: var(--orbit-space-sm);
}

.app-workbench-route .app-workbench-source-line {
  color: var(--orbit-color-muted);
  font-size: 0.88rem;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .app-workbench-route .app-workbench-priority-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-workbench-route .app-workbench-primary-action,
  .app-workbench-route .app-workbench-secondary-link {
    width: 100%;
  }
}
`;

type AppWorkbenchSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = Exclude<AppBootstrapScenario, "success">;

export interface AppWorkbenchProps {
  searchParams?: AppWorkbenchSearchParams;
}

function readSearchParam(
  searchParams: AppWorkbenchSearchParams | undefined,
  key: string,
): string | null {
  // Next.js searchParams 可能是字符串或字符串数组，这里统一取第一个值。
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppWorkbenchSearchParams | undefined,
): RouteScenario | null {
  // scenario 只允许 empty/pending/failure；success 是默认主路径，不通过 query 显式触发。
  const scenario = readSearchParam(searchParams, "scenario");

  if (
    scenario === "empty" ||
    scenario === "pending" ||
    scenario === "failure"
  ) {
    return scenario;
  }

  return null;
}

function readTaskLimit(
  searchParams: AppWorkbenchSearchParams | undefined,
): number | null {
  // taskLimit 用来演示“只聚焦一个跟进任务”的首屏模式，无效值会被忽略。
  const rawLimit = readSearchParam(searchParams, "taskLimit");

  if (!rawLimit) {
    return null;
  }

  const parsedLimit = Number(rawLimit);

  if (!Number.isFinite(parsedLimit)) {
    return null;
  }

  return Math.max(0, Math.floor(parsedLimit));
}

function formatCount(
  count: number | undefined,
  singular: string,
  plural = `${singular}s`,
): string {
  const safeCount = count ?? 0;

  return `${safeCount} ${safeCount === 1 ? singular : plural}`;
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function formatSourceLabel(label: string): string {
  const readableLabel = label.replace(/^Mock\s+/i, "");

  if (readableLabel === "agent action queue") {
    return "next-move review";
  }

  return readableLabel;
}

function uniqueSourceLabels(
  records: readonly ({ sourceRefs?: readonly { label: string }[] } | null | undefined)[],
): string[] {
  // 从多个业务对象提取 source label，给首屏展示“为什么这个关系优先”。
  return [
    ...new Set(
      records.flatMap((record) =>
        record?.sourceRefs?.map((sourceRef) => formatSourceLabel(sourceRef.label)) ??
        [],
      ),
    ),
  ];
}

function sourceLine(labels: readonly string[]): string {
  const visibleLabels = labels.length > 0 ? labels : ["reviewed Orbit source"];

  return `Source context: ${visibleLabels.slice(0, 3).join(" + ")}`;
}

function TechnicalEvidenceDetails({
  evidenceIds,
}: {
  evidenceIds: readonly string[];
}) {
  return (
    <details aria-label="App workbench source details">
      <summary>Technical source details</summary>
      <div aria-label="App workbench evidence" className="chip-row">
        {evidenceIds.slice(0, 5).map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceId}
          </Chip>
        ))}
      </div>
    </details>
  );
}

function RouteStateBoundary({
  failure,
  payload,
  scenario,
}: {
  failure: AppBootstrapFailure;
  payload?: AppBootstrapPayload;
  scenario: RouteScenario;
}) {
  // App workbench 的 empty/pending/failure 都通过 StateView 展示，并明确说明不会执行副作用。
  if (scenario === "empty" && payload) {
    return (
      <div data-route-recovery-copy="Add a sourced contact or import an event attendee roster.">
        <StateView
          description="No relationship source is ready yet, so the workspace starts with adding one."
          emptyState="People, events, follow-ups, health signals, reminders, and next moves are waiting for reviewed source context."
          evidence={[firstEvidence(payload.provenance.evidenceIds)]}
          eyebrow="No sources yet"
          guardrail="Orbit can point to contact or event intake, but it will not infer relationships without a source."
          nextStep="Source details explain why Add a relationship source is the safe recovery path."
          purpose="Choose the first source to review before planning follow-up."
          recoveryActions={[
            {
              id: "app-empty-add-source",
              href: "/app/contacts/new",
              label: "Add a relationship source",
              recoveryCopy:
                "Add a relationship source to start from reviewed context.",
            },
          ]}
          title="Orbit relationship command center is empty"
        />
      </div>
    );
  }

  if (scenario === "pending" && payload) {
    return (
      <div data-route-recovery-copy="Keep the app shell visible and retry loading the workspace.">
        <StateView
          description="Orbit is checking the reviewed evidence set before showing relationship work."
          emptyState="Profile, event, follow-up, and next-move evidence are still being checked."
          evidence={[firstEvidence(payload.provenance.evidenceIds)]}
          eyebrow="Checking sources"
          guardrail="Orbit keeps record writes, reminder delivery, message sends, and outside connections disabled until the reviewed source set is ready."
          nextStep="Source details show which relationship records are still under review."
          purpose="Keep the first screen readable while the workspace evidence set finishes review."
          recoveryActions={[
            {
              id: "app-pending-check-again",
              href: "/app",
              label: "Return to relationship cockpit",
              recoveryCopy:
                "Return to relationship cockpit to recheck the reviewed source queue after profile, event, follow-up, and next-move evidence finish review.",
            },
          ]}
          title="Orbit relationship command center is loading"
        />
      </div>
    );
  }

  return (
    <StateView
      description="Orbit could not load the relationship workspace."
      emptyState="No relationship data changed, and follow-up actions stay off."
      evidence={[failure.error.code, firstEvidence(failure.error.evidenceIds)]}
      eyebrow="Needs attention"
      guardrail="Trying again does not send messages, deliver reminders, write records, or contact outside tools."
      nextStep="Source details explain why relationship actions stay off until a reviewed source loads."
      purpose="Show a recovery path without side effects."
      recoveryActions={[
        {
          id: "app-failure-return",
          href: "/app",
          label: "Return to relationship cockpit",
          recoveryCopy:
            "Return to relationship cockpit without writing records, delivering reminders, sending messages, or contacting outside tools.",
        },
      ]}
      title="Orbit relationship command center could not load"
    />
  );
}

interface OutcomeSummary {
  description: string;
  href: string;
  label: string;
  linkLabel: string;
  sourceContext: string;
  value: string;
}

function OutcomeSummaries({ outcomes }: { outcomes: readonly OutcomeSummary[] }) {
  return (
    <div className="app-workbench-outcome-grid">
      {outcomes.map((outcome) => (
        <article className="app-workbench-outcome-card" key={outcome.href}>
          <span>{outcome.label}</span>
          <h3>{outcome.value}</h3>
          <p className="type-body">{outcome.description}</p>
          <p className="app-workbench-source-line">{outcome.sourceContext}</p>
          <a className="app-workbench-secondary-link" href={outcome.href}>
            {outcome.linkLabel}
          </a>
        </article>
      ))}
    </div>
  );
}

export function AppWorkbench({ searchParams }: AppWorkbenchProps = {}) {
  // 主聚合路径：先实例化各 capability service，再读取首屏所需的最小数据集。
  const bootstrapService = createAppBootstrapService();
  const profileService = createProfileService();
  const eventService = createEventCrudAndImportService();
  const taskService = createFollowupTaskGenerationService();
  const dashboardService = createDashboardAggregateService();
  const notificationService = createReminderScheduleNotificationService();
  const agentService = createAgentActionQueueService();

  const requestedScenario = readRouteScenario(searchParams);
  const requestedTaskLimit = readTaskLimit(searchParams);
  const actionRequested = requestedTaskLimit !== null;
  const bootstrap = bootstrapService.getAppBootstrap();
  const profile = profileService.getProfile();
  const events = eventService.listEvents();
  const generatedTasks = taskService.generateTasks({ limit: 1 });
  const dashboard = dashboardService.getDashboardSummary();
  const notifications = notificationService.listNotifications({ limit: 1 });
  const agentQueue = agentService.listActions();

  if (bootstrap.success === false) {
    return (
      <StateView
        description="Orbit could not prepare the relationship workspace."
        emptyState="The workspace returned an unexpected state before any relationship work changed."
        evidence={["app-workbench-bootstrap-state-mismatch"]}
        eyebrow="Relationship cockpit"
        guardrail="Orbit keeps every outside action off when the workspace cannot be prepared."
        nextStep="Source details explain why this screen stays unchanged."
        purpose="Stop relationship planning when source checks are inconsistent."
        title="Orbit relationship command center could not load"
      />
    );
  }

  if (requestedScenario) {
    // scenario route 用于开发/测试恢复状态，不参与正常首屏推荐排序。
    const scenarioBootstrap = bootstrapService.getAppBootstrap({
      scenario: requestedScenario,
    });

    if (requestedScenario === "failure") {
      if (scenarioBootstrap.success === true) {
        return (
          <StateView
            description="Orbit could not show the requested recovery state."
            emptyState="The workspace returned an unexpected state before any relationship work changed."
            evidence={["app-workbench-bootstrap-state-mismatch"]}
            eyebrow="Relationship cockpit"
            guardrail="Orbit keeps every outside action off when the workspace cannot be prepared."
            nextStep="Source details explain why this screen stays unchanged."
            purpose="Stop relationship planning when source checks are inconsistent."
            title="Orbit relationship command center could not load"
          />
        );
      }

      return (
        <div className="app-workbench-route">
          <style>{appWorkbenchStyles}</style>
          <RouteStateBoundary failure={scenarioBootstrap} scenario="failure" />
        </div>
      );
    }

    if (scenarioBootstrap.success === false) {
      return (
        <StateView
          description="Orbit could not show the requested relationship state."
          emptyState="The workspace returned an unexpected state before any relationship work changed."
          evidence={["app-workbench-bootstrap-state-mismatch"]}
          eyebrow="Relationship cockpit"
          guardrail="Orbit keeps every outside action off when the workspace cannot be prepared."
          nextStep="Source details explain why this screen stays unchanged."
          purpose="Stop relationship planning when source checks are inconsistent."
          title="Orbit relationship command center could not load"
        />
      );
    }

    return (
      <div className="app-workbench-route">
        <style>{appWorkbenchStyles}</style>
        <RouteStateBoundary
          failure={{
            success: false,
            error: {
              code: "APP_BOOTSTRAP_MOCK_FAILED",
              appCode: "SERVICE_UNAVAILABLE",
              message: "Route state failure was not requested.",
              recovery: "Choose the failure state to inspect failure handling.",
              state: "failure",
              provenance: scenarioBootstrap.data.provenance,
              evidenceIds: scenarioBootstrap.data.provenance.evidenceIds,
            },
          }}
          payload={scenarioBootstrap.data}
          scenario={requestedScenario}
        />
      </div>
    );
  }

  const payload = bootstrap.data;
  const focusQueue = actionRequested
    ? bootstrapService.getAppBootstrap({ taskLimit: requestedTaskLimit })
    : null;
  const focusPayload = focusQueue?.success ? focusQueue.data : null;
  const profileName =
    payload.profile?.displayName ??
    (profile.success && profile.data.profile
      ? profile.data.profile.displayName
      : "Profile unavailable");
  const eventRecords = events.success ? events.data.events : payload.upcomingEvents;
  const taskRecords = generatedTasks.success
    ? generatedTasks.data.tasks
    : payload.pendingTasks;
  const notificationCount = notifications.success
    ? notifications.data.notificationQueue.length
    : payload.notificationSummary.pendingDeliveryCount;
  const agentActionCount = agentQueue.success
    ? agentQueue.data.actions.length
    : payload.topAgentActions.length;
  const priorityTask = payload.pendingTasks[0];
  const priorityEvent = payload.upcomingEvents[0];
  const priorityAgentAction = payload.topAgentActions[0];
  const priorityPerson = priorityTask?.contactName ?? profileName;
  const prioritySourceLabels = uniqueSourceLabels([
    payload.profile,
    priorityEvent,
    priorityTask,
    priorityAgentAction,
  ]);
  const prioritySourceLine = sourceLine(prioritySourceLabels);
  const generatedTaskCount = taskRecords.length;
  const outcomeSummaries: OutcomeSummary[] = [
    {
      description: `${payload.connectionSummary.evidenceBackedConnections} people have reviewed relationship context, including ${payload.connectionSummary.highValueRelationships} high-priority relationships.`,
      href: "/app/contacts",
      label: "People",
      linkLabel: "See people",
      sourceContext: sourceLine(uniqueSourceLabels([payload.profile])),
      value: `${payload.connectionSummary.totalContacts} people tracked`,
    },
    {
      description: `${priorityEvent?.readinessLabel ?? "No attendee readiness loaded"} for ${priorityEvent?.title ?? "the next event"}.`,
      href: "/app/events",
      label: "Event opportunities",
      linkLabel: "Review event opportunities",
      sourceContext: sourceLine(uniqueSourceLabels([priorityEvent])),
      value: formatCount(eventRecords.length, "event opportunity", "event opportunities"),
    },
    {
      description: `${generatedTaskCount} ready follow-up can be reviewed first without sending messages or changing records.`,
      href: "/app/followups",
      label: "Follow-ups",
      linkLabel: "Open follow-ups",
      sourceContext: sourceLine(uniqueSourceLabels([priorityTask])),
      value: `${payload.pendingTasks.length} follow-ups need a decision`,
    },
    {
      description: "Conversation context stays attached to relationship evidence before any message is drafted or sent.",
      href: "/app/chat",
      label: "Conversations",
      linkLabel: "Read conversation context",
      sourceContext: sourceLine(
        uniqueSourceLabels([payload.pendingTasks[1], priorityEvent]),
      ),
      value: "Recent context ready for review",
    },
    {
      description: `${payload.dashboardSummary.dormantContacts} dormant relationships and ${payload.dashboardSummary.pendingFollowups} pending follow-ups need attention.`,
      href: "/app/dashboard",
      label: "Relationship health",
      linkLabel: "Check relationship health",
      sourceContext: sourceLine(prioritySourceLabels),
      value: `${payload.dashboardSummary.highValueRelationships} high-value relationships`,
    },
    {
      description: `${notificationCount} reminder ${notificationCount === 1 ? "item is" : "items are"} staged for review before delivery.`,
      href: "/app/agent",
      label: "Agent review",
      linkLabel: "Review next moves",
      sourceContext: sourceLine(uniqueSourceLabels([priorityAgentAction])),
      value: formatCount(agentActionCount, "next move"),
    },
  ];
  const actionResult = actionRequested
    // 点击 focus queue 只接受 mock agent action，返回 provenance；不触发外部动作。
    ? agentService.acceptAction({
        actionId: "demo-action-1",
        actorLabel: "Orbit workspace reviewer",
      })
    : null;
  const externalNetworkRequested =
    actionResult?.success === true
      ? actionResult.data.provenance.externalNetworkRequested
      : payload.provenance.externalNetworkRequested;
  const externalSideEffectExecuted =
    actionResult?.success === true
      ? actionResult.data.externalSideEffectExecuted
      : false;
  const actionTaskCount = focusPayload?.pendingTasks.length ?? 0;

  return (
    <div className="app-workbench-route">
      <style>{appWorkbenchStyles}</style>
      <div data-state-boundary="app-workbench-success">
        <div hidden>
          <h2>Orbit relationship command center</h2>
          <span>Preview one-task focus queue</span>
        </div>
        <WorkbenchSurface
          className="app-workbench-command"
          elevated
          eyebrow="Relationship cockpit"
          title="One relationship priority"
        >
          <div
            className="app-workbench-priority-grid"
            data-relationship-priority="primary"
          >
            <div className="app-workbench-priority-copy">
              <p className="type-body">
                Orbit is putting {priorityPerson} first because this relationship
                work is due {priorityTask?.dueLabel.toLowerCase() ?? "now"} and
                connects directly to {priorityEvent?.title ?? "the next event"}.
              </p>
              <p className="type-body">
                <strong>Why it matters now:</strong>{" "}
                {priorityEvent?.readinessLabel ?? "Source context is ready"} for
                {priorityEvent ? ` ${priorityEvent.title}` : " the next meeting"},
                and the follow-up window is still open.
              </p>
              <p className="type-body">
                <strong>Next safe action:</strong>{" "}
                {priorityTask?.recommendedAction ?? payload.nextAction}
              </p>
              <p className="app-workbench-source-line">{prioritySourceLine}</p>
              <div className="app-workbench-primary-actions">
                <a
                  className="app-workbench-primary-action"
                  href="/app?taskLimit=1"
                  data-primary-next-move="true"
                >
                  Review Akari follow-up
                </a>
              </div>
            </div>
            <aside
              aria-label="Relationship priority facts"
              className="app-workbench-priority-facts"
            >
              <dl>
                <div>
                  <dt>Person in focus</dt>
                  <dd>{priorityPerson}</dd>
                </div>
                <div>
                  <dt>Workspace owner</dt>
                  <dd>{profileName}</dd>
                </div>
                <div>
                  <dt>Event context</dt>
                  <dd>
                    {priorityEvent
                      ? `${priorityEvent.title}, ${priorityEvent.locationLabel}`
                      : "No event context loaded"}
                  </dd>
                </div>
                <div>
                  <dt>Source posture</dt>
                  <dd>{prioritySourceLine.replace("Source context: ", "")}</dd>
                </div>
              </dl>
            </aside>
          </div>
          {actionRequested && (
            <div
              aria-label="App workbench focus queue result"
              aria-live="polite"
              className="app-workbench-action-result"
              role="status"
            >
              <strong>Next move ready: {actionTaskCount} task found</strong>
              <span>Staged review: no live message or record change has run.</span>
              <span>
                Focus source: {prioritySourceLine.replace("Source context: ", "")}
              </span>
              <span hidden>Focus queue ready: {actionTaskCount} task queued</span>
              <span>
                {focusPayload?.pendingTasks[0]?.title ??
                  "No eligible follow-up is ready."}
              </span>
              <span>{formatCount(agentActionCount, "next move")} available</span>
              <span>
                {externalSideEffectExecuted
                  ? "An outside change was recorded"
                  : "No outside change was recorded"}
              </span>
              <span hidden>
                {externalSideEffectExecuted
                  ? "External side effect recorded"
                  : "No external side effects recorded"}
              </span>
              <span>
                {externalNetworkRequested
                  ? "An outside connection was requested"
                  : "No outside connection was requested"}
              </span>
              <span hidden>
                {externalNetworkRequested
                  ? "External network requested"
                  : "No external network requested"}
              </span>
            </div>
          )}
          <TechnicalEvidenceDetails evidenceIds={payload.provenance.evidenceIds} />
        </WorkbenchSurface>
      </div>

      <WorkbenchSurface eyebrow="Relationship outcomes" title="Where to go next">
        <p className="type-body">
          The rest of the home screen keeps each route framed by the relationship
          outcome a returning user would choose next.
        </p>
        <OutcomeSummaries outcomes={outcomeSummaries} />
        <p className="privacy-note">
          Source review confirms no database write, device access, reminder
          delivery, message send, or outside network request ran for this
          preview.
        </p>
      </WorkbenchSurface>
    </div>
  );
}
