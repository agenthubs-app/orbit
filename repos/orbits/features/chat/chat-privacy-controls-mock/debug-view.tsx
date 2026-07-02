/**
 * Chat 隐私控制 mock 的开发者面板。
 *
 * 这里展示分析开关、私密 note 和隐私边界状态，确保聊天 UI 能解释哪些内容不会被分析。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  ChatPrivateNote,
  ChatPrivacyControlsPayload,
  ChatPrivacyControlsResult,
} from "../privacy-contract";
import { createMockChatPrivacyControlsService } from "../mock-privacy-service";

export const CHAT_PRIVACY_CONTROLS_MOCK_SLUG =
  "chat-privacy-controls-mock";

const liveImplementationNotesPath =
  "features/chat/chat-privacy-controls-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.chat-privacy-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.chat-privacy-workbench .workbench-shell,
.chat-privacy-workbench .workbench-surface,
.chat-privacy-workbench .workbench-grid,
.chat-privacy-workbench .relationship-meta,
.chat-privacy-workbench .button-row,
.chat-privacy-workbench .chip-row,
.chat-privacy-workbench .chat-privacy-state-matrix {
  min-width: 0;
}

.chat-privacy-workbench code,
.chat-privacy-workbench dd,
.chat-privacy-workbench .orbit-chip,
.chat-privacy-workbench .source-list li {
  overflow-wrap: anywhere;
}

.chat-privacy-workbench .chat-privacy-checkpoint-grid,
.chat-privacy-workbench .chat-privacy-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.chat-privacy-workbench .button-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 188px), 1fr));
}

.chat-privacy-workbench .button-row form,
.chat-privacy-workbench .button-row button {
  min-width: 0;
  width: 100%;
}

.chat-privacy-workbench .chat-privacy-checkpoint-grid div,
.chat-privacy-workbench .chat-privacy-state-matrix div,
.chat-privacy-workbench .chat-privacy-note-item {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.chat-privacy-workbench .chat-privacy-note-list {
  gap: var(--orbit-space-md);
}

.chat-privacy-workbench .chat-privacy-title {
  color: var(--orbit-color-text);
  font-weight: 720;
}
`;

export const CHAT_PRIVACY_CONTROLS_API_PROBES = [
  {
    label: "Privacy controls",
    method: "GET",
    path: "/api/chat/privacy",
    expectedStatus: 200,
    ariaLabel: "Run chat privacy success API probe",
    submitLabel: "Run privacy probe",
    expectation:
      "Expect 200 success envelope with deterministic analysis opt-in, deletion, hidden private-note, and sensitive-share confirmation controls.",
  },
  {
    label: "Analysis opt-in toggle",
    method: "POST",
    path: "/api/chat/privacy/analysis-toggle",
    expectedStatus: 200,
    ariaLabel: "Run chat analysis opt-in toggle API probe",
    submitLabel: "Run toggle probe",
    expectation:
      "Expect 200 success envelope toggled to opted_out without live persistence or privacy audit logs.",
  },
  {
    label: "Empty privacy controls",
    method: "GET",
    path: "/api/chat/privacy?scenario=empty",
    expectedStatus: 200,
    ariaLabel: "Run empty chat privacy API probe",
    submitLabel: "Run empty probe",
    expectation:
      "Expect 200 empty envelope when no source-backed chat conversation is available.",
  },
  {
    label: "Pending privacy controls",
    method: "GET",
    path: "/api/chat/privacy?scenario=pending",
    expectedStatus: 200,
    ariaLabel: "Run pending chat privacy API probe",
    submitLabel: "Run pending probe",
    expectation:
      "Expect 200 pending envelope while local privacy confirmation is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "GET",
    path: "/api/chat/privacy?scenario=failure",
    expectedStatus: 503,
    ariaLabel: "Run controlled failure chat privacy API probe",
    submitLabel: "Run controlled failure probe",
    expectation:
      "Expect 503 failure envelope with CHAT_PRIVACY_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/chat/live-privacy-service.ts and features/chat/storage/.",
  "ORBIT_MODULE_MODE=live switches mock fixtures to the shared live storage provider.",
  "Current live mode reads chat context and returns privacy previews without deletion workers or audit-log writes.",
  "AI provider and external share adapters remain blocked until source evidence, provenance, and privacy constraints are preserved.",
  "Database env vars come from the shared live storage config instead of a privacy-specific provider switch.",
  "Replacement tests cover success, empty, pending, controlled failure, unconfigured storage, redaction, confirmation, and no-provider-call mock guards.",
] as const;

function apiProbeCommand(
  probe: (typeof CHAT_PRIVACY_CONTROLS_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function apiProbeFormAction(
  probe: (typeof CHAT_PRIVACY_CONTROLS_API_PROBES)[number],
): string {
  return probe.path.split("?")[0];
}

function apiProbeScenario(
  probe: (typeof CHAT_PRIVACY_CONTROLS_API_PROBES)[number],
): string | null {
  const [, queryString] = probe.path.split("?");

  if (!queryString) {
    return null;
  }

  return new URLSearchParams(queryString).get("scenario");
}

function ApiProbeForm({
  probe,
}: {
  probe: (typeof CHAT_PRIVACY_CONTROLS_API_PROBES)[number];
}) {
  const scenario = apiProbeScenario(probe);
  const isToggleProbe = probe.path === "/api/chat/privacy/analysis-toggle";

  return (
    <form
      action={apiProbeFormAction(probe)}
      aria-label={probe.ariaLabel}
      method={probe.method.toLowerCase()}
    >
      {scenario && <input type="hidden" name="scenario" value={scenario} />}
      {isToggleProbe && <input type="hidden" name="enabled" value="false" />}
      <button className="secondary-action" type="submit">
        {probe.submitLabel}
      </button>
    </form>
  );
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Chat privacy controls evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function requireSyncChatPrivacyControlsResult(
  result: ChatPrivacyControlsResult | Promise<ChatPrivacyControlsResult>,
  label: string,
): ChatPrivacyControlsResult {
  const isAsyncResult = (
    value: ChatPrivacyControlsResult | Promise<ChatPrivacyControlsResult>,
  ): value is Promise<ChatPrivacyControlsResult> =>
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function";

  if (isAsyncResult(result)) {
    throw new Error(`${label} returned async chat privacy controls result.`);
  }

  return result;
}

function PrivateNoteList({
  privateNotes,
}: {
  privateNotes: readonly ChatPrivateNote[];
}) {
  return (
    <dl
      aria-label="Hidden private notes"
      className="relationship-meta chat-privacy-note-list"
    >
      {privateNotes.map((note) => (
        <div className="chat-privacy-note-item" key={note.noteId}>
          <dt>Private notes hidden</dt>
          <dd>
            <p className="type-body chat-privacy-title">
              {note.redactedPreview}
            </p>
            <p className="type-caption">body redacted true</p>
            <p className="type-caption">visible to AI analysis false</p>
            <p className="type-caption">visible in share preview false</p>
            <EvidenceChips evidenceIds={note.evidenceIds} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: ChatPrivacyControlsPayload;
}) {
  return (
    <dl
      aria-label="Mock-only chat privacy execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>AI analysis provider</dt>
        <dd>AI provider false</dd>
      </div>
      <div>
        <dt>External network</dt>
        <dd>external network false</dd>
      </div>
      <div>
        <dt>Settings persistence</dt>
        <dd>database write false</dd>
      </div>
      <div>
        <dt>Production audit</dt>
        <dd>privacy audit log false</dd>
      </div>
      <div>
        <dt>Deletion worker</dt>
        <dd>production deletion false</dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ChatPrivacyControlsPayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: chat privacy controls use deterministic local fixtures
        for Maya Chen and do not call AI providers, live databases, production
        deletion workers, privacy audit logs, external share actions, email,
        calendar, notification, network, or device services.
      </p>
      <dl
        aria-label="Chat privacy controls operator checkpoint"
        className="relationship-meta chat-privacy-checkpoint-grid"
      >
        <div>
          <dt>Relationship</dt>
          <dd>
            {payload.participantName} at {payload.organization}
          </dd>
        </div>
        <div>
          <dt>AI analysis opt-in</dt>
          <dd>{payload.analysisOptIn.status}</dd>
        </div>
        <div>
          <dt>Delete-analysis state</dt>
          <dd>
            {payload.analysisDeletion.status}; production deletion false
          </dd>
        </div>
        <div>
          <dt>Private notes hidden</dt>
          <dd>
            body redacted true; visible to AI analysis false
          </dd>
        </div>
        <div>
          <dt>Sensitive share confirmation</dt>
          <dd>confirmation required true</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={payload.provenance.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: ChatPrivacyControlsPayload;
  failureCode: string;
  pending: ChatPrivacyControlsPayload;
  success: ChatPrivacyControlsPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Chat privacy controls state matrix"
        className="relationship-meta chat-privacy-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            <span className="type-caption">
              Success probe: GET /api/chat/privacy
            </span>
            <br />
            Success: opted in with hidden private notes
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>
            <span className="type-caption">
              Empty probe: GET /api/chat/privacy?scenario=empty
            </span>
            <br />
            Empty: no source-backed chat conversation
          </dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>
            <span className="type-caption">
              Pending probe: GET /api/chat/privacy?scenario=pending
            </span>
            <br />
            Pending: local privacy confirmation
          </dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            <span className="type-caption">
              Failure probe: GET /api/chat/privacy?scenario=failure
            </span>
            <br />
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
          ...success.provenance.evidenceIds,
          ...empty.provenance.evidenceIds,
          ...pending.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

export function ChatPrivacyControlsMockDemo() {
  const service = createMockChatPrivacyControlsService();
  const successResult = requireSyncChatPrivacyControlsResult(
    service.getPrivacyControls(),
    "getPrivacyControls",
  );
  const emptyResult = requireSyncChatPrivacyControlsResult(
    service.getPrivacyControls({ scenario: "empty" }),
    "getPrivacyControls",
  );
  const pendingResult = requireSyncChatPrivacyControlsResult(
    service.getPrivacyControls({ scenario: "pending" }),
    "getPrivacyControls",
  );
  const failureResult = requireSyncChatPrivacyControlsResult(
    service.getPrivacyControls({ scenario: "failure" }),
    "getPrivacyControls",
  );

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="chat-privacy-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Chat privacy controls mock</h1>
            <p className="workbench-intro">
              The deterministic chat privacy controls fixtures did not load, so
              the dev surface stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "CHAT_PRIVACY_MOCK_FAILED";

  return (
    <WorkbenchFrame className="chat-privacy-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Chat privacy controls mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying chat AI analysis opt-in,
            delete-analysis state, hidden private notes, and confirmation
            before sharing sensitive chat data. This page consumes the typed
            mock service and does not own privacy business logic.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="Chat privacy controls capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow="Privacy fixture"
            title="Controls stay source-backed"
          >
            <p className="type-body">{successResult.data.nextAction}</p>
            <PrivateNoteList privateNotes={successResult.data.privateNotes} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={successResult.data} />
            <p className="privacy-note">
              Analysis opt-in changes, deletion state, private-note hiding, and
              sensitive-share confirmation are all deterministic mock outcomes.
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
          <p className="type-body">
            Browser-submit these probes to collect real envelopes.
          </p>
          <dl className="relationship-meta">
            {CHAT_PRIVACY_CONTROLS_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{apiProbeCommand(probe)}</code> Expected status:{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
          <div className="button-row">
            {CHAT_PRIVACY_CONTROLS_API_PROBES.map((probe) => (
              <ApiProbeForm key={`${probe.method}-${probe.path}`} probe={probe} />
            ))}
          </div>
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
                <code>ORBIT_MODULE_MODE=live</code> uses the shared live
                database provider when database configuration is present.
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
