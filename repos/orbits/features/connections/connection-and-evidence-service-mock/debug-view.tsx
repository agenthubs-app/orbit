/**
 * 连接与证据服务 mock 的开发者面板。
 *
 * 面板展示 connection 详情、证据时间线和新增证据结果，
 * 用来验证关系来源解释和 add-evidence no-op 语义。
 */
import {
  Chip,
  Field,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import { failure, success } from "../../../shared/api/envelope";
import {
  CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS,
  CONNECTION_EVIDENCE_SOURCE_TYPES,
  type ConnectionEvidenceAddResult,
  type ConnectionEvidenceDetailPayload,
  type ConnectionEvidenceDetailResult,
  type ConnectionEvidenceListResult,
  type ConnectionEvidenceProvenance,
  type ConnectionEvidenceTimelineItem,
  type ConnectionRecord,
} from "../contract";
import { createMockConnectionEvidenceService } from "../mock-service";
import {
  connectionEvidenceFailureContext,
  connectionEvidenceFailureToAppError,
  type ConnectionEvidenceServiceResult,
} from "../service";

export const CONNECTION_EVIDENCE_SERVICE_MOCK_SLUG =
  "connection-and-evidence-service-mock";

const liveImplementationNotesPath =
  "features/connections/connection-and-evidence-service-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;
const responsiveWorkbenchStyles = `
.connection-evidence-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.connection-evidence-workbench .workbench-shell,
.connection-evidence-workbench .workbench-surface,
.connection-evidence-workbench .workbench-grid,
.connection-evidence-workbench .relationship-meta,
.connection-evidence-workbench .control-stack,
.connection-evidence-workbench .chip-row,
.connection-evidence-workbench .button-row,
.connection-evidence-workbench form {
  min-width: 0;
}

.connection-evidence-workbench input,
.connection-evidence-workbench select,
.connection-evidence-workbench textarea {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.connection-evidence-workbench code,
.connection-evidence-workbench dd,
.connection-evidence-workbench .orbit-chip {
  overflow-wrap: anywhere;
}

.connection-evidence-workbench .chip-row,
.connection-evidence-workbench .button-row {
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, 148px), max-content)
  );
}

.connection-evidence-workbench .operator-checkpoint-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.connection-evidence-workbench .operator-checkpoint-grid div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.connection-evidence-workbench .response-preview-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
}

.connection-evidence-workbench .response-preview-card {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  display: grid;
  gap: var(--orbit-space-sm);
  min-width: 0;
  padding: var(--orbit-space-md);
}

.connection-evidence-workbench .response-preview-card pre {
  background: var(--orbit-color-ink);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-canvas);
  font: inherit;
  margin: 0;
  max-width: 100%;
  overflow-x: auto;
  padding: var(--orbit-space-sm);
  white-space: pre-wrap;
}

.connection-evidence-workbench .evidence-timeline {
  display: grid;
  gap: var(--orbit-space-md);
}

.connection-evidence-workbench .evidence-timeline-row {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: var(--orbit-space-sm);
  min-width: 0;
  padding-left: var(--orbit-space-md);
}
`;

const connectionEvidenceApiProbes = [
  {
    label: "List connections",
    command: "GET /api/connections",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with connection records, source links, evidence timelines, and provenance.",
  },
  {
    label: "Read connection",
    command: "GET /api/connections/demo-connection-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with one source-backed connection detail.",
  },
  {
    label: "Add evidence",
    command: "POST /api/connections/demo-connection-1/evidence",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with a deterministic added evidence item and no database write.",
  },
  {
    label: "Empty list",
    command: "GET /api/connections?scenario=empty",
    expectedStatus: 200,
    expectation: "Expect 200 empty envelope with no selected connections.",
  },
  {
    label: "Pending detail",
    command: "GET /api/connections/demo-connection-1?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while connection evidence fixture review waits.",
  },
  {
    label: "Controlled failure",
    command: "GET /api/connections?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/connections/connection-and-evidence-service-mock/.",
  "ORBIT_CONNECTION_EVIDENCE_PROVIDER switches from mock to live.",
  "Live replacement wires a connection persistence service and evidence store behind the same service interface.",
  "Connection detail keeps source links, evidence timeline, relationship reason, next action, and provenance together.",
  "Replacement tests cover list, detail, add-evidence, malformed add-evidence bodies, empty, pending, validation, not-found, and provider failure paths.",
] as const;

function formatPreviewObject(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function requireSyncConnectionEvidenceResult<TResult>(
  result: ConnectionEvidenceServiceResult<TResult>,
): TResult {
  const maybePromise = result as { then?: unknown };

  if (typeof maybePromise.then === "function") {
    throw new Error(
      "Connection evidence mock debug view requires a synchronous service.",
    );
  }

  return result as TResult;
}

function AddEvidenceResponsePreviews({
  controlledFailure,
  successfulAdd,
}: {
  controlledFailure: ConnectionEvidenceAddResult;
  successfulAdd: ConnectionEvidenceAddResult;
}) {
  const successEnvelope =
    successfulAdd.success === true ? success(successfulAdd.data) : null;
  const failureEnvelope =
    controlledFailure.success === false
      ? failure(
          connectionEvidenceFailureToAppError(controlledFailure),
          connectionEvidenceFailureContext(controlledFailure, "mock"),
        )
      : null;
  const addedEvidenceId =
    successfulAdd.success === true
      ? successfulAdd.data.evidenceTimeline.at(-1)?.evidenceId
      : null;

  return (
    <div
      aria-label="Deterministic add-evidence response previews"
      className="response-preview-grid"
    >
      <article className="response-preview-card">
        <p className="type-caption">Add-evidence success envelope</p>
        <dl className="relationship-meta">
          <div>
            <dt>Status</dt>
            <dd>status 201</dd>
          </div>
          <div>
            <dt>Added evidence</dt>
            <dd>{addedEvidenceId}</dd>
          </div>
        </dl>
        {successfulAdd.success === true && (
          <p className="type-body">{successfulAdd.data.addEvidenceSummary}</p>
        )}
        {successEnvelope && (
          <details>
            <summary>View success response object</summary>
            <pre>{formatPreviewObject(successEnvelope)}</pre>
          </details>
        )}
      </article>

      <article className="response-preview-card">
        <p className="type-caption">Add-evidence controlled failure envelope</p>
        <dl className="relationship-meta">
          <div>
            <dt>Status</dt>
            <dd>status 409</dd>
          </div>
          <div>
            <dt>Failure code</dt>
            <dd>
              {controlledFailure.success === false
                ? controlledFailure.error.code
                : "No failure returned"}
            </dd>
          </div>
        </dl>
        {controlledFailure.success === false && (
          <p className="type-body">{controlledFailure.error.recovery}</p>
        )}
        {failureEnvelope && (
          <details>
            <summary>View failure response object</summary>
            <pre>{formatPreviewObject(failureEnvelope)}</pre>
          </details>
        )}
      </article>
    </div>
  );
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Connection evidence ids">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function SourceLinkChips({ connection }: { connection: ConnectionRecord }) {
  return (
    <div className="chip-row" aria-label="Connection source links">
      {connection.sourceLinks.map((sourceLink) => (
        <Chip key={sourceLink.id} tone="confirmation">
          {sourceLink.label}
        </Chip>
      ))}
    </div>
  );
}

function ConnectionSummary({ connection }: { connection: ConnectionRecord }) {
  return (
    <dl className="relationship-meta">
      <div>
        <dt>Connection</dt>
        <dd>
          {connection.displayName}, {connection.role} at{" "}
          {connection.organization}.
        </dd>
      </div>
      <div>
        <dt>Reason</dt>
        <dd>{connection.connectionReason}</dd>
      </div>
      <div>
        <dt>Stage</dt>
        <dd>{connection.relationshipStage}</dd>
      </div>
      <div>
        <dt>Next action</dt>
        <dd>{connection.nextAction}</dd>
      </div>
    </dl>
  );
}

function TimelineRow({ item }: { item: ConnectionEvidenceTimelineItem }) {
  return (
    <article className="relationship-record evidence-timeline-row">
      <header>
        <p className="type-caption">{item.contribution}</p>
        <h3 className="relationship-name">{item.title}</h3>
        <p className="type-caption">{item.occurredAt}</p>
      </header>
      <p className="type-body">{item.excerpt}</p>
      <dl className="relationship-meta">
        <div>
          <dt>Source</dt>
          <dd>Source: {item.sourceLink.label}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>Evidence: {item.evidenceId}</dd>
        </div>
      </dl>
    </article>
  );
}

function EvidenceTimeline({ connection }: { connection: ConnectionRecord }) {
  return (
    <div
      aria-label={`Evidence timeline for ${connection.displayName}`}
      className="evidence-timeline"
    >
      <p className="type-caption">
        {`Evidence timeline for ${connection.displayName}`}
      </p>
      {connection.evidenceTimeline.map((item) => (
        <TimelineRow key={item.evidenceId} item={item} />
      ))}
    </div>
  );
}

function MockOnlyExecutionChecks({
  connection,
  provenance,
}: {
  connection: ConnectionRecord;
  provenance: ConnectionEvidenceProvenance;
}) {
  const databaseReads =
    provenance.databaseReadExecuted === false &&
    connection.databaseReadExecuted === false
      ? "false"
      : "unexpected true";
  const databaseWrites =
    provenance.databaseWriteExecuted === false &&
    connection.databaseWriteExecuted === false
      ? "false"
      : "unexpected true";
  const auditLogWrites =
    provenance.productionAuditLogWriteExecuted === false &&
    connection.productionAuditLogWriteExecuted === false
      ? "false"
      : "unexpected true";

  return (
    <dl className="relationship-meta" aria-label="Mock-only execution checks">
      <div>
        <dt>Database reads</dt>
        <dd>
          <code>{databaseReads}</code>
        </dd>
      </div>
      <div>
        <dt>Database writes</dt>
        <dd>
          <code>{databaseWrites}</code>
        </dd>
      </div>
      <div>
        <dt>Audit log writes</dt>
        <dd>
          <code>{auditLogWrites}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ConnectionEvidenceDetailPayload;
}) {
  const connection = payload.connection;
  const databaseReads =
    payload.provenance.databaseReadExecuted === false ? "false" : "true";
  const databaseWrites =
    payload.provenance.databaseWriteExecuted === false ? "false" : "true";

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Connection evidence stays fixture-backed"
    >
      <p className="type-body">
        Scan this first: the connection record keeps source links beside the
        evidence timeline and follow-up action while persistence and audit
        execution flags remain false.
      </p>
      <dl
        aria-label="Connection evidence operator checkpoint"
        className="relationship-meta operator-checkpoint-grid"
      >
        <div>
          <dt>Connection represented</dt>
          <dd>{connection ? connection.displayName : "No connection selected"}.</dd>
        </div>
        <div>
          <dt>Evidence timeline</dt>
          <dd>{payload.evidenceTimeline.length} evidence items are rendered.</dd>
        </div>
        <div>
          <dt>Source links</dt>
          <dd>
            {payload.sourceLinks.length} source links are exposed from the
            contract.
          </dd>
        </div>
        <div>
          <dt>Mock execution</dt>
          <dd>
            database reads {databaseReads}; database writes {databaseWrites}.
          </dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function AddEvidencePanel() {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Evidence capture"
      title="Attach a source-linked evidence item"
    >
      <p className="type-body">
        This boundary applies deterministic local rules to a fixture connection
        so add-evidence behavior can be tested before a live evidence store
        exists.
      </p>
      <form
        action="/api/connections/demo-connection-1/evidence"
        aria-label="Mock connection add-evidence form"
        className="control-stack"
        method="post"
      >
        <Field label="Source type" helper="Local source-link options only.">
          <select name="sourceType" defaultValue="manual">
            {CONNECTION_EVIDENCE_SOURCE_TYPES.map((sourceType) => (
              <option key={sourceType} value={sourceType}>
                {sourceType}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" helper="Stored only in the deterministic response.">
          <input
            name="title"
            defaultValue="Operator confirmed warm introduction path"
          />
        </Field>
        <Field label="Excerpt" helper="No live evidence store is written.">
          <textarea
            name="excerpt"
            defaultValue="Kenji wants the storage pilot operator intro before the partner review call."
            rows={3}
          />
        </Field>
        <button className="primary-action" type="submit">
          Preview evidence add
        </button>
      </form>
      <div className="chip-row" aria-label="Connection evidence guardrails">
        <Chip tone="evidence">source links</Chip>
        <Chip tone="privacy">no live persistence</Chip>
        <Chip tone="confirmation">timeline context</Chip>
      </div>
    </WorkbenchSurface>
  );
}

function ApiProbeActions() {
  return (
    <div
      className="control-stack"
      aria-label="Connection evidence API probe actions"
    >
      <p className="type-body">
        These probes exercise list, detail, add-evidence, empty, pending, and
        controlled failure paths inside the connection evidence mock boundary.
      </p>
      <div className="button-row">
        <form action="/api/connections" aria-label="Run connections list probe">
          <button className="secondary-action" type="submit">
            Run list probe
          </button>
        </form>
        <form
          action="/api/connections/demo-connection-1"
          aria-label="Run connection detail probe"
        >
          <button className="secondary-action" type="submit">
            Run detail probe
          </button>
        </form>
        <form
          action="/api/connections"
          aria-label="Run empty connections probe"
        >
          <input name="scenario" type="hidden" value="empty" />
          <button className="secondary-action" type="submit">
            Run empty probe
          </button>
        </form>
        <form
          action="/api/connections?scenario=failure"
          aria-label="Run controlled failure connections probe"
        >
          <button className="secondary-action" type="submit">
            Run controlled failure probe
          </button>
        </form>
      </div>
    </div>
  );
}

export function ConnectionEvidenceServiceMockDemo() {
  const connectionService = createMockConnectionEvidenceService();
  const successState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceDetailResult>(
      connectionService.getConnection({
        connectionId: "demo-connection-1",
      }),
    );
  const listState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceListResult>(
      connectionService.listConnections(),
    );
  const addedState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceAddResult>(
      connectionService.addEvidence({
        connectionId: "demo-connection-1",
        contribution: "follow_up_signal",
        occurredAt: "2026-06-25T19:20:00.000Z",
        sourceLabel: "Operator follow-up note",
        sourceType: "manual",
        title: "Operator confirmed warm introduction path",
        excerpt:
          "Kenji wants the storage pilot operator intro before the partner review call.",
      }),
    );
  const pendingAddState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceAddResult>(
      connectionService.addEvidence({
        connectionId: "demo-connection-1",
        scenario: "pending",
      }),
    );
  const emptyState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceListResult>(
      connectionService.listConnections({ scenario: "empty" }),
    );
  const pendingState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceDetailResult>(
      connectionService.getConnection({
        connectionId: "demo-connection-1",
        scenario: "pending",
      }),
    );
  const failureState =
    requireSyncConnectionEvidenceResult<ConnectionEvidenceDetailResult>(
      connectionService.getConnection({
        connectionId: "demo-connection-1",
        scenario: "failure",
      }),
    );
  const successPayload = successState.success ? successState.data : null;
  const listPayload = listState.success ? listState.data : null;
  const addedPayload = addedState.success ? addedState.data : null;

  return (
    <WorkbenchFrame className="connection-evidence-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Connection and evidence service mock</h1>
          <p className="workbench-intro">
            Mock-first boundary for understanding who a connection is, why it
            exists, what context created it, which source links prove that
            context, and which follow-up action is sensible before live
            persistence exists.
          </p>
        </header>

        {successPayload && <OperatorCheckpoint payload={successPayload} />}

        <AddEvidencePanel />

        <section
          className="workbench-grid"
          aria-label="Connection evidence service states"
        >
          <WorkbenchSurface
            elevated
            eyebrow={CONNECTION_EVIDENCE_SERVICE_MOCK_SLUG}
            title="Success state"
          >
            {successPayload?.connection && (
              <>
                <p className="type-body">{successPayload.summary}</p>
                <ConnectionSummary connection={successPayload.connection} />
                <EvidenceChips
                  evidenceIds={successPayload.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="No connection selected" title="Empty state">
            {emptyState.success && (
              <>
                <p className="type-body">{emptyState.data.nextAction}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Connections</dt>
                    <dd>No connection evidence is selected.</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>
                      <code>{emptyState.data.state}</code>
                    </dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={emptyState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Fixture review" title="Pending state">
            {pendingState.success && (
              <>
                <p className="type-body">{pendingState.data.summary}</p>
                <dl className="relationship-meta">
                  <div>
                    <dt>Connection status</dt>
                    <dd>
                      <code>{pendingState.data.state}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Connection</dt>
                    <dd>Evidence rendering waits for local fixture review.</dd>
                  </div>
                </dl>
                <EvidenceChips
                  evidenceIds={pendingState.data.provenance.evidenceIds}
                />
              </>
            )}
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Controlled failure" title="Failure state">
            {failureState.success === false && (
              <>
                <dl className="relationship-meta">
                  <div>
                    <dt>Error code</dt>
                    <dd>
                      <code>{failureState.error.code}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Message</dt>
                    <dd>{failureState.error.message}</dd>
                  </div>
                  <div>
                    <dt>Recovery</dt>
                    <dd>{failureState.error.recovery}</dd>
                  </div>
                </dl>
                <EvidenceChips evidenceIds={failureState.error.evidenceIds} />
              </>
            )}
          </WorkbenchSurface>
        </section>

        <WorkbenchSurface
          eyebrow="Evidence timeline"
          title="Relationship context stays explainable"
        >
          {successPayload?.connection && (
            <>
              <p className="type-body">
                The selected connection keeps source links, evidence ids,
                relationship reason, timeline order, and next action together.
              </p>
              <SourceLinkChips connection={successPayload.connection} />
              <EvidenceTimeline connection={successPayload.connection} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock evidence add"
          title="Rule-based evidence attachment is deterministic"
        >
          {addedPayload?.connection && (
            <>
              <p className="type-body">{addedPayload.addEvidenceSummary}</p>
              <AddEvidenceResponsePreviews
                controlledFailure={pendingAddState}
                successfulAdd={addedState}
              />
              <ConnectionSummary connection={addedPayload.connection} />
              <EvidenceTimeline connection={addedPayload.connection} />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-only execution"
          title="No live persistence happens in the mock"
        >
          {successPayload?.connection && (
            <>
              <p className="privacy-note">
                The mock sets database reads, database writes, production audit
                log writes, external network requests, AI calls, calendar/email
                requests, and notifications to false.
              </p>
              <MockOnlyExecutionChecks
                connection={successPayload.connection}
                provenance={successPayload.provenance}
              />
            </>
          )}
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="API exercise surface"
          title="Connection routes use shared envelopes"
        >
          <p className="type-body">
            The declared probes cover connection list, detail, and evidence add
            routes. Empty, pending, validation, not-found, malformed body, and
            controlled failure probes document non-success product states
            without leaving the mock boundary.
          </p>
          <dl className="relationship-meta">
            <div>
              <dt>Failure mapping</dt>
              <dd>
                <code>
                  {
                    CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS
                      .CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED.code
                  }
                </code>{" "}
                maps to a shared failure envelope.
              </dd>
            </div>
            <div>
              <dt>List fixture</dt>
              <dd>
                {listPayload?.connections.length ?? 0} connections are available
                from local fixture state.
              </dd>
            </div>
          </dl>
          <ApiProbeActions />
          <dl
            className="relationship-meta"
            aria-label="Connection evidence API probes"
          >
            {connectionEvidenceApiProbes.map((probe) => (
              <div key={probe.command}>
                <dt>{probe.label}</dt>
                <dd>
                  <code style={pathWrapStyle}>{probe.command}</code>{" "}
                  returns {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow="Mock-to-live handoff"
          title="Replacement notes stay with the capability"
        >
          <dl className="relationship-meta">
            <div>
              <dt>Handoff doc</dt>
              <dd>
                <code style={pathWrapStyle}>{liveImplementationNotesPath}</code>
              </dd>
            </div>
            <div>
              <dt>Required coverage</dt>
              <dd>
                Live service and provider files, switch mechanism, required env
                vars and permissions, privacy and provenance constraints, and
                replacement tests are documented before live providers are wired.
              </dd>
            </div>
          </dl>
          <div
            className="chip-row"
            aria-label="Connection evidence live handoff excerpts"
          >
            {liveHandoffEvidenceExcerpts.map((excerpt) => (
              <Chip key={excerpt} tone="privacy">
                {excerpt}
              </Chip>
            ))}
          </div>
        </WorkbenchSurface>
      </div>
    </WorkbenchFrame>
  );
}
