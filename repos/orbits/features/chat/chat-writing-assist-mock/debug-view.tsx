/**
 * Chat 写作辅助 mock 的开发者面板。
 *
 * 这里展示 rewrite、follow-up draft 等建议如何带着来源和确认边界返回给 UI。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  ChatWritingAssistPayload,
  ChatWritingAssistResult,
  ChatWritingAssistSuggestion,
} from "../assist-contract";
import { createMockChatWritingAssistService } from "../mock-assist-service";

export const CHAT_WRITING_ASSIST_MOCK_SLUG = "chat-writing-assist-mock";

const liveImplementationNotesPath =
  "features/chat/chat-writing-assist-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.chat-assist-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.chat-assist-workbench .workbench-shell,
.chat-assist-workbench .workbench-surface,
.chat-assist-workbench .workbench-grid,
.chat-assist-workbench .relationship-meta,
.chat-assist-workbench .chip-row,
.chat-assist-workbench .chat-assist-state-matrix {
  min-width: 0;
}

.chat-assist-workbench code,
.chat-assist-workbench dd,
.chat-assist-workbench .orbit-chip,
.chat-assist-workbench .source-list li {
  overflow-wrap: anywhere;
}

.chat-assist-workbench .chat-assist-checkpoint-grid,
.chat-assist-workbench .chat-assist-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.chat-assist-workbench .chat-assist-checkpoint-grid div,
.chat-assist-workbench .chat-assist-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.chat-assist-workbench .chat-assist-audit-list {
  gap: var(--orbit-space-md);
}

.chat-assist-workbench .chat-assist-audit-item {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.chat-assist-workbench .chat-assist-title {
  color: var(--orbit-color-text);
  font-weight: 720;
}

.chat-assist-workbench .chat-assist-body {
  white-space: pre-wrap;
}

.chat-assist-workbench .chat-assist-audit-panel {
  border-left: 3px solid var(--orbit-color-primary);
  margin-top: var(--orbit-space-sm);
  padding-left: var(--orbit-space-sm);
}
`;

export const CHAT_WRITING_ASSIST_API_PROBES = [
  {
    label: "Polite rewrite",
    method: "POST",
    path: "/api/chat/assist/rewrite",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic polite rewrite copy.",
  },
  {
    label: "Follow-up draft",
    method: "POST",
    path: "/api/chat/assist/followup-draft",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic source-backed follow-up copy.",
  },
  {
    label: "Empty follow-up draft",
    method: "POST",
    path: "/api/chat/assist/followup-draft?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no source-backed chat context is available.",
  },
  {
    label: "Pending polite rewrite",
    method: "POST",
    path: "/api/chat/assist/rewrite?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local writing guard is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "POST",
    path: "/api/chat/assist/rewrite?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CHAT_WRITING_ASSIST_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/chat/live-assist-service.ts and features/chat/storage/.",
  "ORBIT_MODULE_MODE=live switches mock fixtures to the shared live storage provider.",
  "Current live mode is deterministic storage-backed drafting, not an AI writing provider.",
  "Email, calendar, and notification permissions stay separate from chat writing assistance.",
  "Every live assist keeps source evidence, provenance, privacy constraints, and confirmation requirements.",
  "Replacement tests cover success, empty, pending, controlled failure, unconfigured storage, and no-provider-call mock guards.",
] as const;

function apiProbeCommand(
  probe: (typeof CHAT_WRITING_ASSIST_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function assistKindLabel(kind: ChatWritingAssistSuggestion["kind"]): string {
  switch (kind) {
    case "polite_rewrite":
      return "Polite rewrite";
    case "follow_up_draft":
      return "Follow-up draft";
    case "appointment_suggestion":
      return "Appointment suggestion";
    case "quick_greeting":
      return "Quick greeting";
    default:
      return kind;
  }
}

function requireSyncChatWritingAssistResult(
  result: ChatWritingAssistResult | Promise<ChatWritingAssistResult>,
  label: string,
): ChatWritingAssistResult {
  const isAsyncResult = (
    value: ChatWritingAssistResult | Promise<ChatWritingAssistResult>,
  ): value is Promise<ChatWritingAssistResult> =>
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function";

  if (isAsyncResult(result)) {
    throw new Error(`${label} returned async chat writing assist result.`);
  }

  return result;
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Chat writing assist evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function AssistList({
  assists,
}: {
  assists: readonly ChatWritingAssistSuggestion[];
}) {
  return (
    <dl
      aria-label="Generated chat assists with assist-level audits"
      className="relationship-meta chat-assist-audit-list"
    >
      {assists.map((assist) => (
        <div className="chat-assist-audit-item" key={assist.assistId}>
          <dt>{assistKindLabel(assist.kind)}</dt>
          <dd>
            <p className="type-body chat-assist-title">
              {assist.label} <code>{assist.conversationId}</code>
            </p>
            <p className="type-body chat-assist-body">
              {assist.suggestedText}
            </p>
            <div
              aria-label={`Audit chat assist ${assist.assistId}`}
              className="chat-assist-audit-panel"
            >
              <p className="type-caption">Source: {assist.audit.sourceLabel}</p>
              <p className="type-caption">
                Provider boundary: {assist.audit.providerBoundary}
              </p>
              <EvidenceChips evidenceIds={assist.evidenceIds} />
              <button
                aria-label={`${assist.audit.verificationAction} for ${assist.assistId}`}
                className="secondary-action"
                type="button"
              >
                {assist.audit.verificationAction}
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
  payload: ChatWritingAssistPayload;
}) {
  return (
    <dl
      aria-label="Mock-only chat writing assist execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Writing provider</dt>
        <dd>AI provider false</dd>
      </div>
      <div>
        <dt>External delivery</dt>
        <dd>external send false</dd>
      </div>
      <div>
        <dt>Message persistence</dt>
        <dd>database write false</dd>
      </div>
      <div>
        <dt>Notification delivery</dt>
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
  payload: ChatWritingAssistPayload;
}) {
  const firstAssist = payload.assists[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: chat writing assistance is generated from local
        relationship evidence, not AI writing providers, external send channels,
        live persistence, email, calendar, or notification services.
      </p>
      <dl
        aria-label="Chat writing assist operator checkpoint"
        className="relationship-meta chat-assist-checkpoint-grid"
      >
        <div>
          <dt>Assist count</dt>
          <dd>{payload.assists.length} source-backed assists</dd>
        </div>
        <div>
          <dt>Top assist</dt>
          <dd>
            {firstAssist.label} <code>{firstAssist.assistId}</code>
          </dd>
        </div>
        <div>
          <dt>First assist kind</dt>
          <dd>{assistKindLabel(firstAssist.kind)}</dd>
        </div>
        <div>
          <dt>Writing boundary</dt>
          <dd>AI provider false</dd>
        </div>
        <div>
          <dt>Delivery boundary</dt>
          <dd>external send false</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={firstAssist.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: ChatWritingAssistPayload;
  failureCode: string;
  pending: ChatWritingAssistPayload;
  success: ChatWritingAssistPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Chat writing assist state matrix"
        className="relationship-meta chat-assist-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            <span className="type-caption">
              Success probe: POST /api/chat/assist/rewrite
            </span>
            <br />
            Success: {success.assists.length} chat assists
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>
            <span className="type-caption">
              Empty probe: POST /api/chat/assist/followup-draft?scenario=empty
            </span>
            <br />
            Empty: no source-backed chat context
          </dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>
            <span className="type-caption">
              Pending probe: POST /api/chat/assist/rewrite?scenario=pending
            </span>
            <br />
            Pending: local writing guard
          </dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            <span className="type-caption">
              Failure probe: POST /api/chat/assist/rewrite?scenario=failure
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
          ...empty.provenance.evidenceIds,
          ...pending.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

function combinedPayloadFromService(): ChatWritingAssistPayload | null {
  const service = createMockChatWritingAssistService();
  const rewrite = requireSyncChatWritingAssistResult(
    service.rewritePolitely(),
    "rewritePolitely",
  );
  const followup = requireSyncChatWritingAssistResult(
    service.draftFollowup(),
    "draftFollowup",
  );
  const appointment = requireSyncChatWritingAssistResult(
    service.suggestAppointment(),
    "suggestAppointment",
  );
  const greeting = requireSyncChatWritingAssistResult(
    service.createQuickGreeting(),
    "createQuickGreeting",
  );

  if (
    rewrite.success === false ||
    followup.success === false ||
    appointment.success === false ||
    greeting.success === false
  ) {
    return null;
  }

  const assists = [
    ...rewrite.data.assists,
    ...followup.data.assists,
    ...appointment.data.assists,
    ...greeting.data.assists,
  ];

  return {
    ...rewrite.data,
    assists,
    summary:
      "Local rules prepared polite rewrite, follow-up draft, appointment suggestion, and quick greeting assists from source-backed chat context.",
    provenance: {
      ...rewrite.data.provenance,
      evidenceIds: [
        ...new Set(assists.flatMap((assist) => assist.evidenceIds)),
      ],
      generationMethod: "fixture",
      sourceLabel: "Mock chat writing assist fixture",
    },
  };
}

export function ChatWritingAssistMockDemo() {
  const service = createMockChatWritingAssistService();
  const successPayload = combinedPayloadFromService();
  const emptyResult = requireSyncChatWritingAssistResult(
    service.draftFollowup({ scenario: "empty" }),
    "draftFollowup",
  );
  const pendingResult = requireSyncChatWritingAssistResult(
    service.rewritePolitely({ scenario: "pending" }),
    "rewritePolitely",
  );
  const failureResult = requireSyncChatWritingAssistResult(
    service.rewritePolitely({ scenario: "failure" }),
    "rewritePolitely",
  );

  if (
    !successPayload ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="chat-assist-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Chat writing assist mock</h1>
            <p className="workbench-intro">
              The deterministic chat writing assist fixtures did not load, so
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
      : "CHAT_WRITING_ASSIST_MOCK_FAILED";

  return (
    <WorkbenchFrame className="chat-assist-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Chat writing assist mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the chat writing assist boundary. It
            turns relationship evidence into chat assistance without AI writing,
            external send channels, live persistence, or delivery services.
          </p>
        </header>

        <OperatorCheckpoint payload={successPayload} />

        <section
          className="workbench-grid"
          aria-label="Chat writing assist capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow="Generated assist fixtures"
            title="Four chat assists"
          >
            <p className="type-body">{successPayload.summary}</p>
            <AssistList assists={successPayload.assists} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={successPayload} />
            <p className="privacy-note">
              Chat copy stays local until a confirmation guard and live provider
              switch are explicitly added.
            </p>
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={successPayload}
        />

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl className="relationship-meta">
            {CHAT_WRITING_ASSIST_API_PROBES.map((probe) => (
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
