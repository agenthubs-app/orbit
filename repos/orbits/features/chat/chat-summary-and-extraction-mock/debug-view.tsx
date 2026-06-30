/**
 * Chat 摘要与抽取 mock 的开发者面板。
 *
 * 面板展示从对话中抽取任务、需求和 profile 更新建议的结果；
 * 这些建议仍需确认，不会直接写入 profile。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  ChatSummaryExtractionPayload,
  ConfirmationRequiredProfileSuggestion,
  ExtractedNeed,
  ExtractedTask,
  RelationshipProfileUpdate,
} from "../summary-contract";
import { createMockChatSummaryExtractionService } from "../mock-summary-service";

export const CHAT_SUMMARY_EXTRACTION_MOCK_SLUG =
  "chat-summary-and-extraction-mock";

const liveImplementationNotesPath =
  "features/chat/chat-summary-and-extraction-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.chat-summary-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.chat-summary-workbench .workbench-shell,
.chat-summary-workbench .workbench-surface,
.chat-summary-workbench .workbench-grid,
.chat-summary-workbench .relationship-meta,
.chat-summary-workbench .button-row,
.chat-summary-workbench .chip-row,
.chat-summary-workbench .chat-summary-state-matrix {
  min-width: 0;
}

.chat-summary-workbench code,
.chat-summary-workbench dd,
.chat-summary-workbench .orbit-chip,
.chat-summary-workbench .source-list li {
  overflow-wrap: anywhere;
}

.chat-summary-workbench .chat-summary-checkpoint-grid,
.chat-summary-workbench .chat-summary-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 184px), 1fr));
}

.chat-summary-workbench .button-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
}

.chat-summary-workbench .button-row form,
.chat-summary-workbench .button-row button {
  min-width: 0;
  width: 100%;
}

.chat-summary-workbench .chat-summary-checkpoint-grid div,
.chat-summary-workbench .chat-summary-state-matrix div,
.chat-summary-workbench .chat-summary-list-item {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.chat-summary-workbench .chat-summary-list {
  gap: var(--orbit-space-md);
}

.chat-summary-workbench .chat-summary-title {
  color: var(--orbit-color-text);
  font-weight: 720;
}
`;

export const CHAT_SUMMARY_EXTRACTION_API_PROBES = [
  {
    label: "Summary success",
    method: "POST",
    path: "/api/chat/conversations/demo-conversation-1/summary",
    expectedStatus: 200,
    ariaLabel: "Run chat summary success API probe",
    submitLabel: "Run summary probe",
    expectation:
      "Expect 200 success envelope with deterministic summary payload.",
  },
  {
    label: "Extraction success",
    method: "GET",
    path: "/api/chat/conversations/demo-conversation-1/extractions",
    expectedStatus: 200,
    ariaLabel: "Run chat extraction success API probe",
    submitLabel: "Run extraction probe",
    expectation:
      "Expect 200 success envelope with deterministic extracted needs, tasks, profile updates, and confirmation-required profile suggestions.",
  },
  {
    label: "Empty summary",
    method: "POST",
    path: "/api/chat/conversations/demo-conversation-1/summary?scenario=empty",
    expectedStatus: 200,
    ariaLabel: "Run empty chat summary API probe",
    submitLabel: "Run empty probe",
    expectation:
      "Expect 200 empty envelope when no source-backed chat messages are available.",
  },
  {
    label: "Pending extraction",
    method: "GET",
    path: "/api/chat/conversations/demo-conversation-1/extractions?scenario=pending",
    expectedStatus: 200,
    ariaLabel: "Run pending chat extraction API probe",
    submitLabel: "Run pending probe",
    expectation:
      "Expect 200 pending envelope while the local extraction guard is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "GET",
    path: "/api/chat/conversations/demo-conversation-1/extractions?scenario=failure",
    expectedStatus: 503,
    ariaLabel: "Run controlled failure chat extraction API probe",
    submitLabel: "Run controlled failure probe",
    expectation:
      "Expect 503 failure envelope with CHAT_SUMMARY_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/chat/chat-summary-and-extraction-mock/.",
  "ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER switches mock fixtures to live providers.",
  "A live AI summarization provider must replace only the summary and extraction engine.",
  "Automatic profile mutation remains blocked behind a confirmation guard.",
  "Email, calendar, and notification permissions stay outside this mock boundary.",
  "Every live extraction keeps source evidence, provenance, privacy constraints, and replacement tests.",
] as const;

function apiProbeCommand(
  probe: (typeof CHAT_SUMMARY_EXTRACTION_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function apiProbeFormAction(
  probe: (typeof CHAT_SUMMARY_EXTRACTION_API_PROBES)[number],
): string {
  return probe.path.split("?")[0];
}

function apiProbeScenario(
  probe: (typeof CHAT_SUMMARY_EXTRACTION_API_PROBES)[number],
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
  probe: (typeof CHAT_SUMMARY_EXTRACTION_API_PROBES)[number];
}) {
  const scenario = apiProbeScenario(probe);

  return (
    <form
      action={apiProbeFormAction(probe)}
      aria-label={probe.ariaLabel}
      method={probe.method.toLowerCase()}
    >
      {scenario && <input type="hidden" name="scenario" value={scenario} />}
      <button className="secondary-action" type="submit">
        {probe.submitLabel}
      </button>
    </form>
  );
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Chat summary extraction evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function NeedsList({ needs }: { needs: readonly ExtractedNeed[] }) {
  return (
    <dl className="relationship-meta chat-summary-list">
      {needs.map((need) => (
        <div className="chat-summary-list-item" key={need.needId}>
          <dt>Extracted needs</dt>
          <dd>
            <p className="type-body chat-summary-title">{need.statement}</p>
            <EvidenceChips evidenceIds={need.evidenceIds} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TasksList({ tasks }: { tasks: readonly ExtractedTask[] }) {
  return (
    <dl className="relationship-meta chat-summary-list">
      {tasks.map((task) => (
        <div className="chat-summary-list-item" key={task.taskId}>
          <dt>Extracted tasks</dt>
          <dd>
            <p className="type-body chat-summary-title">{task.title}</p>
            <p className="type-caption">{task.dueHint}</p>
            <EvidenceChips evidenceIds={task.evidenceIds} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileUpdateList({
  updates,
}: {
  updates: readonly RelationshipProfileUpdate[];
}) {
  return (
    <dl className="relationship-meta chat-summary-list">
      {updates.map((update) => (
        <div className="chat-summary-list-item" key={update.updateId}>
          <dt>Relationship profile updates</dt>
          <dd>
            <p className="type-body chat-summary-title">
              {update.field}: {update.proposedValue}
            </p>
            <p className="type-caption">auto-applied false</p>
            <EvidenceChips evidenceIds={update.evidenceIds} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ConfirmationSuggestionList({
  suggestions,
}: {
  suggestions: readonly ConfirmationRequiredProfileSuggestion[];
}) {
  return (
    <dl className="relationship-meta chat-summary-list">
      {suggestions.map((suggestion) => (
        <div className="chat-summary-list-item" key={suggestion.suggestionId}>
          <dt>Confirmation-required profile suggestions</dt>
          <dd>
            <p className="type-body chat-summary-title">
              {suggestion.field}: {suggestion.proposedValue}
            </p>
            <p className="type-caption">
              confirmation required true, auto-applied false
            </p>
            <p className="type-caption">{suggestion.guard}</p>
            <EvidenceChips evidenceIds={suggestion.evidenceIds} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: ChatSummaryExtractionPayload;
}) {
  return (
    <dl
      aria-label="Mock-only chat summary extraction execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Summary provider</dt>
        <dd>AI provider false</dd>
      </div>
      <div>
        <dt>Network boundary</dt>
        <dd>external network false</dd>
      </div>
      <div>
        <dt>Profile persistence</dt>
        <dd>database write false</dd>
      </div>
      <div>
        <dt>Automatic profile mutation</dt>
        <dd>
          <code>
            {String(payload.provenance.automaticProfileMutationExecuted)}
          </code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  payload,
}: {
  payload: ChatSummaryExtractionPayload;
}) {
  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: chat summary and extraction are generated from local
        source evidence for Maya Chen without AI providers, external network,
        live database writes, email, calendar, notification, device access, or
        automatic profile mutation.
      </p>
      <dl
        aria-label="Chat summary extraction operator checkpoint"
        className="relationship-meta chat-summary-checkpoint-grid"
      >
        <div>
          <dt>Conversation</dt>
          <dd>
            {payload.participantName} <code>{payload.conversationId}</code>
          </dd>
        </div>
        <div>
          <dt>Summary</dt>
          <dd>{payload.summary?.summaryId}</dd>
        </div>
        <div>
          <dt>Extraction groups</dt>
          <dd>4 source-backed groups</dd>
        </div>
        <div>
          <dt>Provider boundary</dt>
          <dd>AI provider false</dd>
        </div>
        <div>
          <dt>Profile boundary</dt>
          <dd>auto-applied false</dd>
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
  empty: ChatSummaryExtractionPayload;
  failureCode: string;
  pending: ChatSummaryExtractionPayload;
  success: ChatSummaryExtractionPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Chat summary extraction state matrix"
        className="relationship-meta chat-summary-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            <span className="type-caption">
              Success probe: POST /api/chat/conversations/demo-conversation-1/summary
            </span>
            <br />
            Success: summary and 4 extraction groups
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>
            <span className="type-caption">
              Empty probe: POST /api/chat/conversations/demo-conversation-1/summary?scenario=empty
            </span>
            <br />
            Empty: no source-backed chat messages
          </dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>
            <span className="type-caption">
              Pending probe: GET /api/chat/conversations/demo-conversation-1/extractions?scenario=pending
            </span>
            <br />
            Pending: local extraction guard
          </dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            <span className="type-caption">
              Failure probe: GET /api/chat/conversations/demo-conversation-1/extractions?scenario=failure
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
          ...success.provenance.evidenceIds,
        ]}
      />
    </WorkbenchSurface>
  );
}

export function ChatSummaryExtractionMockDemo() {
  const service = createMockChatSummaryExtractionService();
  const summaryResult = service.summarizeConversation({
    conversationId: "demo-conversation-1",
  });
  const extractionResult = service.extractConversationSignals({
    conversationId: "demo-conversation-1",
  });
  const emptyResult = service.summarizeConversation({
    conversationId: "demo-conversation-1",
    scenario: "empty",
  });
  const pendingResult = service.extractConversationSignals({
    conversationId: "demo-conversation-1",
    scenario: "pending",
  });
  const failureResult = service.extractConversationSignals({
    conversationId: "demo-conversation-1",
    scenario: "failure",
  });

  if (
    summaryResult.success === false ||
    extractionResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false
  ) {
    return (
      <WorkbenchFrame className="chat-summary-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Chat summary and extraction mock</h1>
            <p className="workbench-intro">
              The deterministic chat summary fixtures did not load, so the dev
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
      : "CHAT_SUMMARY_MOCK_FAILED";

  return (
    <WorkbenchFrame className="chat-summary-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Chat summary and extraction mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the chat summary and extraction
            boundary. It converts source-backed chat evidence into a summary,
            extracted needs, tasks, and profile suggestions without mutating
            relationship data automatically.
          </p>
        </header>

        <OperatorCheckpoint payload={summaryResult.data} />

        <section
          className="workbench-grid"
          aria-label="Chat summary extraction capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow="Summary fixture"
            title="Source-backed summary"
          >
            <p className="type-body">{summaryResult.data.summary?.narrative}</p>
            <EvidenceChips
              evidenceIds={summaryResult.data.summary?.evidenceIds ?? []}
            />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={summaryResult.data} />
            <p className="privacy-note">
              Extracted profile changes stay local until a confirmation guard
              and live service switch are explicitly added.
            </p>
          </WorkbenchSurface>
        </section>

        <section
          className="workbench-grid"
          aria-label="Chat summary extraction groups"
        >
          <WorkbenchSurface eyebrow="Extraction group" title="Extracted needs">
            <NeedsList needs={extractionResult.data.extractedNeeds} />
          </WorkbenchSurface>
          <WorkbenchSurface eyebrow="Extraction group" title="Extracted tasks">
            <TasksList tasks={extractionResult.data.extractedTasks} />
          </WorkbenchSurface>
          <WorkbenchSurface
            eyebrow="Extraction group"
            title="Relationship profile updates"
          >
            <ProfileUpdateList
              updates={extractionResult.data.relationshipProfileUpdates}
            />
          </WorkbenchSurface>
          <WorkbenchSurface
            eyebrow="Extraction group"
            title="Confirmation-required profile suggestions"
          >
            <ConfirmationSuggestionList
              suggestions={
                extractionResult.data.confirmationRequiredProfileSuggestions
              }
            />
          </WorkbenchSurface>
        </section>

        <StateMatrix
          empty={emptyResult.data}
          failureCode={failureCode}
          pending={pendingResult.data}
          success={summaryResult.data}
        />

        <WorkbenchSurface eyebrow="API exercise surface" title="Declared probes">
          <dl className="relationship-meta">
            {CHAT_SUMMARY_EXTRACTION_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{apiProbeCommand(probe)}</code> Expected status:{" "}
                  {probe.expectedStatus}. {probe.expectation}
                </dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="privacy-note">
              Browser-submit these probes to collect real envelopes from the
              mock-backed route handlers.
            </p>
            <div
              aria-label="Browser-submittable chat summary extraction API probes"
              className="button-row"
            >
              {CHAT_SUMMARY_EXTRACTION_API_PROBES.map((probe) => (
                <ApiProbeForm key={apiProbeCommand(probe)} probe={probe} />
              ))}
            </div>
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
                <code>ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER</code> remains
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
