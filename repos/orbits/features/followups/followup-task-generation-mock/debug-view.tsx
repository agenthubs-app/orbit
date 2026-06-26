import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  FollowupTask,
  FollowupTaskGenerationPayload,
  FollowupTaskTriggerKind,
} from "../contract";
import { createMockFollowupTaskGenerationService } from "../mock-service";

export const FOLLOWUP_TASK_GENERATION_MOCK_SLUG =
  "followup-task-generation-mock";

const liveImplementationNotesPath =
  "features/followups/followup-task-generation-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.followup-task-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.followup-task-workbench .workbench-shell,
.followup-task-workbench .workbench-surface,
.followup-task-workbench .workbench-grid,
.followup-task-workbench .relationship-meta,
.followup-task-workbench .chip-row,
.followup-task-workbench .followup-task-state-matrix {
  min-width: 0;
}

.followup-task-workbench code,
.followup-task-workbench dd,
.followup-task-workbench .orbit-chip,
.followup-task-workbench .source-list li {
  overflow-wrap: anywhere;
}

.followup-task-workbench .followup-task-checkpoint-grid,
.followup-task-workbench .followup-task-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.followup-task-workbench .followup-task-checkpoint-grid div,
.followup-task-workbench .followup-task-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.followup-task-workbench .followup-task-audit-list {
  gap: var(--orbit-space-md);
}

.followup-task-workbench .followup-task-audit-item {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.followup-task-workbench .followup-task-title {
  color: var(--orbit-color-text);
  font-weight: 720;
}

.followup-task-workbench .followup-task-audit-panel {
  border-left: 3px solid var(--orbit-color-primary);
  margin-top: var(--orbit-space-sm);
  padding-left: var(--orbit-space-sm);
}
`;

export const FOLLOWUP_TASK_GENERATION_API_PROBES = [
  {
    label: "List generated followup tasks",
    method: "GET",
    path: "/api/tasks",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic source-backed followup tasks.",
  },
  {
    label: "Generate followup tasks",
    method: "POST",
    path: "/api/tasks/generate",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope generated from local relationship triggers.",
  },
  {
    label: "Empty task generation",
    method: "GET",
    path: "/api/tasks?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no local relationship triggers are eligible.",
  },
  {
    label: "Pending task generation",
    method: "GET",
    path: "/api/tasks?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local generation guard is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "GET",
    path: "/api/tasks?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with FOLLOWUP_TASK_GENERATION_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/followups/followup-task-generation-mock/.",
  "ORBIT_FOLLOWUP_TASK_GENERATION_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires a background scheduler, task persistence provider, and AI task generation provider.",
  "Calendar, email, and notification permissions stay explicit before any task scheduling or delivery.",
  "Every live task keeps source evidence, provenance, and privacy constraints from the relationship trigger.",
  "Replacement tests cover success, empty, pending, controlled failure, provider failure, and no-provider-call mock guards.",
] as const;

function apiProbeCommand(
  probe: (typeof FOLLOWUP_TASK_GENERATION_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function triggerLabel(kind: FollowupTaskTriggerKind): string {
  switch (kind) {
    case "new_connection":
      return "New connection";
    case "event_encounter":
      return "Event encounter";
    case "promised_action":
      return "Promised action";
    case "dormant_relationship":
      return "Dormant relationship";
    default:
      return kind;
  }
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Followup task generation evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function TaskList({ tasks }: { tasks: readonly FollowupTask[] }) {
  return (
    <dl
      aria-label="Generated followup tasks with task-level audits"
      className="relationship-meta followup-task-audit-list"
    >
      {tasks.map((task) => (
        <div className="followup-task-audit-item" key={task.taskId}>
          <dt>{triggerLabel(task.triggerKind)}</dt>
          <dd>
            <p className="type-body followup-task-title">
              {task.title} Due in {task.dueInDays} day
              {task.dueInDays === 1 ? "" : "s"}.
            </p>
            <p className="type-body">{task.recommendedAction}</p>
            <div
              aria-label={`Audit followup task ${task.taskId}`}
              className="followup-task-audit-panel"
            >
              <p className="type-caption">Source: {task.audit.sourceLabel}</p>
              <p className="type-caption">
                Provider boundary: {task.audit.providerBoundary}
              </p>
              <EvidenceChips evidenceIds={task.evidenceIds} />
              <button
                aria-label={`Verify evidence for ${task.taskId}`}
                className="secondary-action"
                type="button"
              >
                {task.audit.verificationAction}
              </button>
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: FollowupTaskGenerationPayload;
}) {
  return (
    <dl
      aria-label="Mock-only followup task generation execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>scheduler</dt>
        <dd>scheduler false</dd>
      </div>
      <div>
        <dt>AI task generation</dt>
        <dd>AI provider false</dd>
      </div>
      <div>
        <dt>task persistence</dt>
        <dd>database write false</dd>
      </div>
      <div>
        <dt>notification delivery</dt>
        <dd>
          <code>{String(payload.provenance.notificationDelivered)}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: FollowupTaskGenerationPayload;
}) {
  const firstTask = payload.tasks[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: followup tasks are generated from local relationship
        triggers, not background scheduling, live task persistence, or model
        work.
      </p>
      <dl
        aria-label="Followup task generation operator checkpoint"
        className="relationship-meta followup-task-checkpoint-grid"
      >
        <div>
          <dt>Task count</dt>
          <dd>{payload.tasks.length} source-backed tasks</dd>
        </div>
        <div>
          <dt>Top task</dt>
          <dd>
            {firstTask.title} <code>{firstTask.taskId}</code>
          </dd>
        </div>
        <div>
          <dt>First trigger</dt>
          <dd>{triggerLabel(firstTask.triggerKind)}</dd>
        </div>
        <div>
          <dt>Scheduler boundary</dt>
          <dd>scheduler false</dd>
        </div>
        <div>
          <dt>Model boundary</dt>
          <dd>AI provider false</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={firstTask.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: FollowupTaskGenerationPayload;
  failureCode: string;
  pending: FollowupTaskGenerationPayload;
  success: FollowupTaskGenerationPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Followup task generation state matrix"
        className="relationship-meta followup-task-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>Success: {success.tasks.length} followup tasks</dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>Empty: no eligible relationship triggers</dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>Pending: generation guard</dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            Failure: controlled error <code>{failureCode}</code>
          </dd>
        </div>
      </dl>
      <p className="privacy-note">
        Empty and pending states stay successful envelopes; controlled failures
        are explicit service-unavailable envelopes.
      </p>
      <EvidenceChips
        evidenceIds={[
          ...empty.provenance.evidenceIds,
          ...pending.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

export function FollowupTaskGenerationMockDemo() {
  const service = createMockFollowupTaskGenerationService();
  const successResult = service.listTasks();
  const emptyResult = service.listTasks({ scenario: "empty" });
  const pendingResult = service.generateTasks({ scenario: "pending" });
  const failureResult = service.listTasks({ scenario: "failure" });
  const generatedResult = service.generateTasks({
    triggerKinds: [
      "new_connection",
      "event_encounter",
      "promised_action",
      "dormant_relationship",
    ],
  });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false ||
    generatedResult.success === false
  ) {
    return (
      <WorkbenchFrame className="followup-task-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Followup task generation mock</h1>
            <p className="workbench-intro">
              The deterministic followup task fixtures did not load, so the dev
              surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "FOLLOWUP_TASK_GENERATION_MOCK_FAILED";

  return (
    <WorkbenchFrame className="followup-task-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Followup task generation mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the followup task generation
            boundary. It turns local relationship triggers into source-backed
            work without schedulers, persistence, notifications, or model calls.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="Followup task generation capability details"
        >
          <WorkbenchSurface elevated eyebrow="Generated tasks" title="Relationship work queue">
            <p className="type-body">{generatedResult.data.summary}</p>
            <TaskList tasks={generatedResult.data.tasks} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={generatedResult.data} />
            <p className="privacy-note">
              Task suggestions stay local until a confirmation guard and live
              provider switch are explicitly added.
            </p>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successResult.data}
        />

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl className="relationship-meta">
            {FOLLOWUP_TASK_GENERATION_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{apiProbeCommand(probe)}</code> Expected status:{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Mock-to-live handoff" title="Replacement notes">
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Switch mechanism</dt>
              <dd>
                <code>ORBIT_FOLLOWUP_TASK_GENERATION_PROVIDER</code> remains
                documented before any live service is wired.
              </dd>
            </div>
          </dl>
          <ul className="source-list">
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <li key={excerpt}>{excerpt}</li>
            ))}
          </ul>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
