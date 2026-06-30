/**
 * 消息草稿生成 mock 的开发者面板。
 *
 * 面板展示不同 draft kind 的来源、正文和确认边界；草稿不会被自动发送。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  MessageDraft,
  MessageDraftGeneratorPayload,
  MessageDraftKind,
} from "../message-draft-contract";
import { createMockMessageDraftGeneratorService } from "../mock-message-draft-service";

export const MESSAGE_DRAFT_GENERATOR_MOCK_SLUG =
  "message-draft-generator-mock";

const liveImplementationNotesPath =
  "features/followups/message-draft-generator-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.message-draft-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.message-draft-workbench .workbench-shell,
.message-draft-workbench .workbench-surface,
.message-draft-workbench .workbench-grid,
.message-draft-workbench .relationship-meta,
.message-draft-workbench .chip-row,
.message-draft-workbench .message-draft-state-matrix {
  min-width: 0;
}

.message-draft-workbench code,
.message-draft-workbench dd,
.message-draft-workbench .orbit-chip,
.message-draft-workbench .source-list li {
  overflow-wrap: anywhere;
}

.message-draft-workbench .message-draft-checkpoint-grid,
.message-draft-workbench .message-draft-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr));
}

.message-draft-workbench .message-draft-checkpoint-grid div,
.message-draft-workbench .message-draft-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.message-draft-workbench .message-draft-audit-list {
  gap: var(--orbit-space-md);
}

.message-draft-workbench .message-draft-audit-item {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.message-draft-workbench .message-draft-title {
  color: var(--orbit-color-text);
  font-weight: 720;
}

.message-draft-workbench .message-draft-body {
  white-space: pre-wrap;
}

.message-draft-workbench .message-draft-audit-panel {
  border-left: 3px solid var(--orbit-color-primary);
  margin-top: var(--orbit-space-sm);
  padding-left: var(--orbit-space-sm);
}
`;

export const MESSAGE_DRAFT_GENERATOR_API_PROBES = [
  {
    label: "Create message draft",
    method: "POST",
    path: "/api/message-drafts",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic source-backed message draft copy.",
  },
  {
    label: "Update message draft",
    method: "PATCH",
    path: "/api/message-drafts/demo-draft-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with a local draft revision and no external send.",
  },
  {
    label: "Empty message draft generation",
    method: "POST",
    path: "/api/message-drafts?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no source-backed relationship context is available.",
  },
  {
    label: "Pending message draft generation",
    method: "POST",
    path: "/api/message-drafts?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local confirmation guard is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "POST",
    path: "/api/message-drafts?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with MESSAGE_DRAFT_GENERATOR_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/followups/message-draft-generator-mock/.",
  "ORBIT_MESSAGE_DRAFT_GENERATOR_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires an AI writing provider and explicit external send adapters.",
  "Email, calendar, and notification permissions stay separate from draft generation.",
  "Every live draft keeps source evidence, provenance, privacy constraints, and confirmation requirements.",
  "Replacement tests cover success, empty, pending, controlled failure, provider failure, and no-provider-call mock guards.",
] as const;

function apiProbeCommand(
  probe: (typeof MESSAGE_DRAFT_GENERATOR_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function draftKindLabel(kind: MessageDraftKind): string {
  switch (kind) {
    case "greeting":
      return "Greeting";
    case "follow_up":
      return "Follow-up";
    case "appointment":
      return "Appointment";
    case "introduction_request":
      return "Introduction request";
    case "invitation":
      return "Invitation";
    case "thank_you":
      return "Thank-you";
    default:
      return kind;
  }
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Message draft generator evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function DraftList({ drafts }: { drafts: readonly MessageDraft[] }) {
  return (
    <dl
      aria-label="Generated message drafts with draft-level audits"
      className="relationship-meta message-draft-audit-list"
    >
      {drafts.map((draft) => (
        <div className="message-draft-audit-item" key={draft.draftId}>
          <dt>{draftKindLabel(draft.kind)}</dt>
          <dd>
            <p className="type-body message-draft-title">
              {draft.subject} <code>{draft.channel}</code>
            </p>
            <p className="type-body message-draft-body">{draft.body}</p>
            <div
              aria-label={`Audit message draft ${draft.draftId}`}
              className="message-draft-audit-panel"
            >
              <p className="type-caption">Source: {draft.audit.sourceLabel}</p>
              <p className="type-caption">
                Provider boundary: {draft.audit.providerBoundary}
              </p>
              <EvidenceChips evidenceIds={draft.evidenceIds} />
              <button
                aria-label={`Review source evidence for ${draft.draftId}`}
                className="secondary-action"
                type="button"
              >
                {draft.audit.verificationAction}
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
  payload: MessageDraftGeneratorPayload;
}) {
  return (
    <dl
      aria-label="Mock-only message draft generator execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>AI writing</dt>
        <dd>AI provider false</dd>
      </div>
      <div>
        <dt>External delivery</dt>
        <dd>external send false</dd>
      </div>
      <div>
        <dt>Draft persistence</dt>
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
  payload: MessageDraftGeneratorPayload;
}) {
  const firstDraft = payload.drafts[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: message drafts are generated from local relationship
        evidence, not AI writing providers, external send channels, live
        persistence, email, calendar, or notification services.
      </p>
      <dl
        aria-label="Message draft generator operator checkpoint"
        className="relationship-meta message-draft-checkpoint-grid"
      >
        <div>
          <dt>Draft count</dt>
          <dd>{payload.drafts.length} source-backed drafts</dd>
        </div>
        <div>
          <dt>Top draft</dt>
          <dd>
            {firstDraft.subject} <code>{firstDraft.draftId}</code>
          </dd>
        </div>
        <div>
          <dt>First draft kind</dt>
          <dd>{draftKindLabel(firstDraft.kind)}</dd>
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
      <EvidenceChips evidenceIds={firstDraft.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: MessageDraftGeneratorPayload;
  failureCode: string;
  pending: MessageDraftGeneratorPayload;
  success: MessageDraftGeneratorPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Message draft generator state matrix"
        className="relationship-meta message-draft-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            <span className="type-caption">
              Success probe: POST /api/message-drafts
            </span>
            <br />
            Success: {success.drafts.length} message drafts
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>
            <span className="type-caption">
              Empty probe: POST /api/message-drafts?scenario=empty
            </span>
            <br />
            Empty: no source-backed message context
          </dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>
            <span className="type-caption">
              Pending probe: POST /api/message-drafts?scenario=pending
            </span>
            <br />
            Pending: confirmation guard
          </dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            <span className="type-caption">
              Failure probe: POST /api/message-drafts?scenario=failure
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

export function MessageDraftGeneratorMockDemo() {
  const service = createMockMessageDraftGeneratorService();
  const successResult = service.createDraft();
  const emptyResult = service.createDraft({ scenario: "empty" });
  const pendingResult = service.createDraft({ scenario: "pending" });
  const failureResult = service.createDraft({ scenario: "failure" });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="message-draft-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Message draft generator mock</h1>
            <p className="workbench-intro">
              The deterministic message draft fixtures did not load, so the dev
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
      : "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED";

  return (
    <WorkbenchFrame className="message-draft-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Message draft generator mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the message draft generator boundary.
            It turns relationship evidence into draft copy without AI writing,
            external send channels, live persistence, or delivery services.
          </p>
        </header>

        <OperatorCheckpoint payload={successResult.data} />

        <section
          className="workbench-grid"
          aria-label="Message draft generator capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow="Generated draft fixtures"
            title="Six relationship message drafts"
          >
            <p className="type-body">{successResult.data.summary}</p>
            <DraftList drafts={successResult.data.drafts} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={successResult.data} />
            <p className="privacy-note">
              Draft copy stays local until a confirmation guard and live
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
            {MESSAGE_DRAFT_GENERATOR_API_PROBES.map((probe) => (
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
                <code>ORBIT_MESSAGE_DRAFT_GENERATOR_PROVIDER</code> remains
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
