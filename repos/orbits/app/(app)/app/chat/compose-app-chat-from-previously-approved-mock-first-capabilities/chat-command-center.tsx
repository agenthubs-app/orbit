/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import type {
  ChatConversationListPayload,
  ChatConversationListResult,
  ChatConversationStatus,
  ChatMessageThreadPayload,
  ChatMessageThreadResult,
  ChatSendMessagePayload,
  ChatSendMessageResult,
} from "../../../../../features/chat/contract";
import type {
  ChatWritingAssistPayload,
  ChatWritingAssistResult,
  ChatWritingAssistSuggestion,
} from "../../../../../features/chat/assist-contract";
import type {
  ChatPrivacyControlsPayload,
  ChatPrivacyControlsResult,
} from "../../../../../features/chat/privacy-contract";
import type {
  ChatSummaryExtractionPayload,
  ChatSummaryExtractionResult,
} from "../../../../../features/chat/summary-contract";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { createAppChatRouteServices } from "./chat-service-factory";

const appChatStyles = `
.app-chat-route {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
}

.orbit-app-shell:has(.app-chat-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-chat-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-chat-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-chat-route,
.app-chat-route .workbench-surface,
.app-chat-route .relationship-meta,
.app-chat-route .chip-row,
.app-chat-route .chat-priority-ledger,
.app-chat-route .chat-command-layout,
.app-chat-route .chat-conversation-list,
.app-chat-route .chat-message-list,
.app-chat-route .chat-review-grid,
.app-chat-route .chat-action-form,
.app-chat-route .chat-action-result,
.app-chat-route .chat-followup-tracker,
.app-chat-route .chat-state-links {
  min-width: 0;
}

.app-chat-route .chat-priority {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-chat-route .chat-priority-copy {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-chat-route .chat-priority-copy p {
  margin: 0;
}

.app-chat-route .chat-priority-ledger {
  display: grid;
  gap: var(--orbit-space-xs);
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-chat-route .chat-priority-ledger li {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: 6px 10px;
}

.app-chat-route .relationship-name,
.app-chat-route .type-body,
.app-chat-route .type-caption,
.app-chat-route .relationship-meta dd,
.app-chat-route .orbit-chip,
.app-chat-route .chat-state-links a,
.app-chat-route .chat-message,
.app-chat-route .chat-action-result span,
.app-chat-route .chat-action-result strong,
.app-chat-route .chat-followup-tracker strong {
  overflow-wrap: anywhere;
}

.app-chat-route .chat-evidence-details {
  min-width: 0;
}

.app-chat-route .chat-evidence-details summary {
  color: var(--orbit-color-muted);
  cursor: pointer;
  font-size: 0.88rem;
}

.app-chat-route .chip-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 136px), 1fr));
}

.app-chat-route .orbit-chip {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
}

.app-chat-route .chat-command-layout,
.app-chat-route .chat-review-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
}

.app-chat-route .chat-conversation-list,
.app-chat-route .chat-message-list,
.app-chat-route .chat-signal-stack,
.app-chat-route .chat-action-form,
.app-chat-route .chat-action-result,
.app-chat-route .chat-followup-tracker,
.app-chat-route .chat-state-panel {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-chat-route .chat-conversation-list article,
.app-chat-route .chat-message,
.app-chat-route .chat-review-card,
.app-chat-route .chat-action-form,
.app-chat-route .chat-action-result,
.app-chat-route .chat-followup-tracker,
.app-chat-route .chat-state-panel {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-chat-route .chat-conversation-list article,
.app-chat-route .chat-review-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-chat-route .chat-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-chat-route .chat-followup-tracker {
  border-left: 3px solid var(--orbit-color-confirmation);
}

.app-chat-route .chat-action-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  max-width: 100%;
  white-space: normal;
}

.app-chat-route .chat-message[data-sender="contact"] {
  border-left: 3px solid var(--orbit-color-primary);
}

.app-chat-route .chat-message[data-sender="orbit_user"] {
  border-left: 3px solid var(--orbit-color-confirmation);
}

.app-chat-route .chat-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-chat-route .chat-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  max-width: 100%;
  padding: 6px 10px;
  text-decoration: none;
}

.app-chat-route .chat-recovery-actions {
  align-items: center;
}
`;

type AppChatSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";

interface AppChatCommandCenterProps {
  searchParams?: AppChatSearchParams;
}

type ChatRouteResult =
  | ChatConversationListResult
  | ChatMessageThreadResult
  | ChatSendMessageResult
  | ChatWritingAssistResult
  | ChatSummaryExtractionResult
  | ChatPrivacyControlsResult;
type ChatRouteSuccess = Extract<ChatRouteResult, { success: true }>;
type ChatRouteFailure = Extract<ChatRouteResult, { success: false }>;

const routeStateChecks = [
  {
    href: "/app/chat?scenario=empty",
    label: "No chat context",
  },
  {
    href: "/app/chat?scenario=pending",
    label: "Consent check",
  },
  {
    href: "/app/chat?scenario=failure",
    label: "Recovery path",
  },
] as const;

const routeRecoveryActions: Record<
  RouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/chat",
      label: "Show ready chat workspace",
    },
    {
      href: "/app/chat?action=record-local-reply",
      label: "Preview local reply",
    },
  ],
  failure: [
    {
      href: "/app/chat",
      label: "Reload chat workspace",
    },
    {
      href: "/app/chat?scenario=pending",
      label: "Check consent status",
    },
  ],
  pending: [
    {
      href: "/app/chat",
      label: "Return to ready chat workspace",
    },
  ],
};

const productCopyReplacements: readonly [RegExp, string][] = [
  [/\bfixtures?\b/gi, "source record"],
  [/\bmock\b/gi, "review"],
  [/\bproviders?\b/gi, "connections"],
  [/\bboundary\b/gi, "check"],
  [/\broute\b/gi, "page"],
  [/\blive\b/gi, "connected"],
  [/\bmodel calls?\b/gi, "automated calls"],
  [/\bvector\b/gi, "search"],
  [/\bdeterministic\b/gi, "reviewed"],
  [/\bdatabases?\b/gi, "saved records"],
];

function productCopy(value: string): string {
  return productCopyReplacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value);
}

function readSearchParam(
  searchParams: AppChatSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppChatSearchParams | undefined,
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function isRouteStateSuccess(result: ChatRouteResult): result is ChatRouteSuccess {
  return result.success === true;
}

function isRouteStateFailure(result: ChatRouteResult): result is ChatRouteFailure {
  return result.success === false;
}

function evidenceIdsForResult(result: ChatRouteResult): readonly string[] {
  if (isRouteStateSuccess(result)) {
    return result.data.provenance.evidenceIds;
  }

  if (isRouteStateFailure(result)) {
    return result.error.evidenceIds;
  }

  return [];
}

function uniqueEvidenceIds(results: readonly ChatRouteResult[]): string[] {
  return publicEvidenceIds(
    Array.from(new Set(results.flatMap((result) => evidenceIdsForResult(result)))),
  );
}

function publicEvidenceIds(evidenceIds: readonly string[]): string[] {
  return evidenceIds.filter(
    (evidenceId) => !evidenceId.toLowerCase().includes("mock"),
  );
}

function firstFailure(results: readonly ChatRouteResult[]): ChatRouteFailure | null {
  return results.find(isRouteStateFailure) ?? null;
}

function statusLabel(status: ChatConversationStatus): string {
  const labels: Record<ChatConversationStatus, string> = {
    active: "Active",
    needs_followup: "Needs follow-up",
    paused: "Paused",
  };

  return labels[status];
}

function participantMessageLabel(message: {
  senderName: string;
  senderRole: "contact" | "orbit_user";
}): string {
  return message.senderRole === "orbit_user"
    ? "You wrote"
    : `${message.senderName} wrote`;
}

function shortTimestamp(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

function stateCopy(scenario: RouteScenario) {
  if (scenario === "empty") {
    return {
      description:
        "Add source-backed relationship context before reviewing conversations, assists, summaries, and privacy controls.",
      emptyState:
        "No conversation has enough source evidence for chat review.",
      guardrail:
        "Orbit cannot prepare replies, summaries, profile updates, or sharing previews from an empty conversation queue.",
      nextStep: "Return when a conversation has source evidence and consent.",
      purpose:
        "Keep chat review useful when no sourced relationship context is available.",
      title: "No chat context is ready",
    };
  }

  if (scenario === "pending") {
    return {
      description:
        "Conversation review stays paused while local consent and source evidence are checked.",
      emptyState:
        "Conversation records stay hidden while consent is still being checked.",
      guardrail:
        "Orbit will not prepare replies, summarize context, update profiles, or share private notes while review is pending.",
      nextStep: "Return to chat after consent and source evidence are ready.",
      purpose:
        "Keep chat work visible without exposing an unfinished conversation review.",
      title: "Chat context is still checking consent",
    };
  }

  return {
    description:
      "Conversation review is unavailable while source evidence and privacy controls are checked.",
    emptyState:
      "The chat workspace is unavailable until source evidence recovers.",
    guardrail:
      "Orbit will not prepare replies, summarize context, update profiles, or share private notes while this is unavailable.",
    nextStep: "Reload chat before taking action.",
    purpose:
      "Show a visible recovery path when source-backed chat context is unavailable.",
    title: "Chat workspace could not load",
  };
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/chat?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({ scenario }: { scenario: RouteScenario }) {
  return (
    <nav
      aria-label="Chat route recovery actions"
      className="chat-state-links chat-recovery-actions"
      data-side-effects="none"
    >
      {routeRecoveryActions[scenario].map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
}

function RouteStateBoundary({ scenario }: { scenario: RouteScenario }) {
  const services = createAppChatRouteServices();
  const conversationResult = services.conversationService.listConversations({
    scenario,
  });
  const threadResult = services.conversationService.getMessageThread({
    conversationId: "demo-conversation-1",
    scenario,
  });
  const assistResult = services.writingAssistService.draftFollowup({
    conversationId: "demo-conversation-1",
    scenario,
  });
  const summaryResult =
    services.summaryExtractionService.summarizeConversation({
      conversationId: "demo-conversation-1",
      scenario,
    });
  const extractionResult =
    services.summaryExtractionService.extractConversationSignals({
      conversationId: "demo-conversation-1",
      scenario,
    });
  const privacyResult = services.privacyControlsService.getPrivacyControls({
    scenario,
  });
  const results: ChatRouteResult[] = [
    conversationResult,
    threadResult,
    assistResult,
    summaryResult,
    extractionResult,
    privacyResult,
  ];
  const copy = stateCopy(scenario);
  const failure = firstFailure(results);
  const evidenceIds = uniqueEvidenceIds(results);

  return (
    <RouteStateMarker scenario={scenario}>
      <div
        data-error-code={failure ? failure.error.code : undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow="Chat" title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Chat status details" className="relationship-meta">
            <div>
              <dt>What Orbit knows</dt>
              <dd>{copy.purpose}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>{copy.emptyState}</dd>
            </div>
            <div>
              <dt>Safety check</dt>
              <dd>{copy.guardrail}</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>{copy.nextStep}</dd>
            </div>
          </dl>
          <EvidenceChips evidenceIds={evidenceIds} label="Chat state evidence" />
        </WorkbenchSurface>
      </div>
      <RouteRecoveryActions scenario={scenario} />
    </RouteStateMarker>
  );
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  const publicIds = publicEvidenceIds(evidenceIds).slice(0, 5);

  return (
    <details className="chat-evidence-details">
      <summary>Source and safety evidence</summary>
      <div aria-label={label} className="chip-row">
        {publicIds.map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceId}
          </Chip>
        ))}
      </div>
    </details>
  );
}

function ConversationList({
  conversations,
}: {
  conversations: ChatConversationListPayload;
}) {
  return (
    <div className="chat-conversation-list">
      {conversations.conversations.map((conversation) => (
        <article key={conversation.conversationId}>
          <p className="surface-eyebrow">{statusLabel(conversation.status)}</p>
          <h3 className="relationship-name">{conversation.title}</h3>
          <p className="type-body">
            {conversation.participantName} · {conversation.organization}
          </p>
          <p className="type-caption">{conversation.lastMessagePreview}</p>
          <EvidenceChips
            evidenceIds={conversation.evidenceIds}
            label={`${conversation.participantName} source evidence`}
          />
        </article>
      ))}
    </div>
  );
}

function ThreadPanel({ thread }: { thread: ChatMessageThreadPayload }) {
  return (
    <WorkbenchSurface eyebrow="Conversation review" title="One thread to review">
      <p className="type-body">{productCopy(thread.summary)}</p>
      <p className="type-caption">
        Participant labels keep the private reply review grounded in who said
        what before a draft is staged.
      </p>
      <div aria-label="Private conversation messages" className="chat-message-list">
        {thread.messages.map((message) => (
          <article
            className="chat-message"
            data-sender={message.senderRole}
            key={message.messageId}
          >
            <p className="surface-eyebrow">
              {participantMessageLabel(message)} · {message.senderName} ·{" "}
              {shortTimestamp(message.createdAt)}
            </p>
            <p className="type-body">{message.body}</p>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function RelationshipContextPanel({
  thread,
}: {
  thread: ChatMessageThreadPayload;
}) {
  return (
    <WorkbenchSurface
      eyebrow="Relationship context"
      title={thread.oneToOneContext.participantName}
    >
      <dl aria-label="Conversation relationship context" className="relationship-meta">
        <div>
          <dt>Organization</dt>
          <dd>{thread.oneToOneContext.organization}</dd>
        </div>
        <div>
          <dt>Why this connection exists</dt>
          <dd>{thread.oneToOneContext.relationshipReason}</dd>
        </div>
        <div>
          <dt>Latest context</dt>
          <dd>{thread.oneToOneContext.latestContext}</dd>
        </div>
        <div>
          <dt>Sensible next step</dt>
          <dd>{thread.oneToOneContext.recommendedFollowup}</dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function WritingAssistPanel({
  assist,
}: {
  assist: ChatWritingAssistPayload;
}) {
  const primaryAssist = assist.assists[0];

  if (!primaryAssist) {
    return null;
  }

  return (
    <ReviewCard
      evidenceIds={primaryAssist.evidenceIds}
      eyebrow="Writing assist"
      title={primaryAssist.label}
    >
      <p className="type-body">{primaryAssist.suggestedText}</p>
      <p className="type-caption">Review status: staged for human review.</p>
      <p className="type-caption">{primaryAssist.rationale}</p>
    </ReviewCard>
  );
}

function SummaryPanel({ summary }: { summary: ChatSummaryExtractionPayload }) {
  return (
    <ReviewCard
      evidenceIds={summary.provenance.evidenceIds}
      eyebrow="Conversation summary"
      title="Summary for review"
    >
      <p className="type-body">
        {summary.summary
          ? summary.summary.narrative
          : "No summary is available for this conversation yet."}
      </p>
    </ReviewCard>
  );
}

function ExtractionPanel({
  extraction,
}: {
  extraction: ChatSummaryExtractionPayload;
}) {
  const need = extraction.extractedNeeds[0];
  const task = extraction.extractedTasks[0];
  const profileSuggestion = extraction.confirmationRequiredProfileSuggestions[0];

  return (
    <ReviewCard
      evidenceIds={extraction.provenance.evidenceIds}
      eyebrow="Conversation extraction"
      title="Relationship signals to confirm"
    >
      {need && <p className="type-body">{need.statement}</p>}
      {task && <Chip tone="confirmation">{task.title}</Chip>}
      {profileSuggestion && (
        <p className="privacy-note">
          {profileSuggestion.proposedValue} needs review before profile changes.
        </p>
      )}
    </ReviewCard>
  );
}

function PrivacyPanel({ privacy }: { privacy: ChatPrivacyControlsPayload }) {
  return (
    <ReviewCard
      evidenceIds={privacy.provenance.evidenceIds}
      eyebrow="Privacy controls"
      title={`${privacy.participantName} · ${privacy.organization}`}
    >
      <p className="type-body">
        Consent status: {privacy.analysisOptIn.enabled ? "analysis allowed" : "analysis off"}.
      </p>
      <dl aria-label="Chat privacy controls" className="relationship-meta">
        <div>
          <dt>Analysis status</dt>
          <dd>{privacy.analysisOptIn.enabled ? "Allowed" : "Off"}</dd>
        </div>
        <div>
          <dt>Private notes</dt>
          <dd>Private note hidden from analysis and sharing</dd>
        </div>
        <div>
          <dt>Sharing</dt>
          <dd>Sensitive context needs confirmation first.</dd>
        </div>
      </dl>
    </ReviewCard>
  );
}

function ReviewCard({
  children,
  evidenceIds,
  eyebrow,
  title,
}: {
  children: ReactNode;
  evidenceIds: readonly string[];
  eyebrow: string;
  title: string;
}) {
  return (
    <article className="chat-review-card">
      <p className="surface-eyebrow">{eyebrow}</p>
      <h3 className="relationship-name">{title}</h3>
      <div className="chat-signal-stack">{children}</div>
      <EvidenceChips evidenceIds={evidenceIds} label={`${title} evidence`} />
    </article>
  );
}

function ChatActionForm({
  assist,
}: {
  assist: ChatWritingAssistSuggestion | undefined;
}) {
  return (
    <form action="/app/chat" className="chat-action-form" method="get">
      <input name="action" type="hidden" value="record-local-reply" />
      <p className="type-body">
        Review the suggested reply before previewing it as a local follow-up.
      </p>
      {assist && (
        <p className="type-caption">Draft message: {assist.suggestedText}</p>
      )}
      <button type="submit">Preview local reply</button>
    </form>
  );
}

function ChatActionResult({
  conversation,
  result,
}: {
  conversation: ChatConversationListPayload["conversations"][number];
  result: ChatSendMessagePayload | null;
}) {
  if (!result) {
    return null;
  }

  return (
    <div
      className="chat-action-result"
      data-action-evidence="chat-record-local-reply-local-preview"
      data-message-result="chat-record-local-reply-preview"
      data-side-effects="none"
      role="status"
    >
      <strong>Local reply preview ready</strong>
      <p className="type-body">
        Selected conversation: {conversation.participantName} at{" "}
        {conversation.organization}
      </p>
      <p className="type-caption">Draft selected from writing assist</p>
      <p className="type-body">{result.message.body}</p>
      <p className="type-body">
        What remains local: Selected conversation, draft reply, and follow-up
        tracker stay on this page.
      </p>
      <ul aria-label="Local reply safety ledger" className="chat-priority-ledger">
        <li>No external message</li>
        <li>No notification</li>
        <li>No profile update</li>
        <li>No private-note analysis</li>
        <li>No automated writing call</li>
        <li>No saved-record write</li>
        <li>No outside network request</li>
      </ul>
    </div>
  );
}

function FollowupTracker({
  actionResult,
  extraction,
}: {
  actionResult: ChatSendMessagePayload | null;
  extraction: ChatSummaryExtractionPayload;
}) {
  const task = extraction.extractedTasks[0];

  if (!task) {
    return null;
  }

  return (
    <div
      aria-label="Local follow-up tracker"
      className="chat-followup-tracker"
      data-followup-tracker="local-chat-followup"
      data-side-effects="none"
    >
      <strong>Follow-up tracker</strong>
      <dl className="relationship-meta">
        <div>
          <dt>Source-backed task</dt>
          <dd>{task.title}</dd>
        </div>
        <div>
          <dt>Local note</dt>
          <dd>
            {actionResult
              ? "Local reply preview ready for follow-up tracking"
              : "Record a local reply preview before tracking progress"}
          </dd>
        </div>
        <div>
          <dt>External send</dt>
          <dd>External send remains off</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={task.evidenceIds}
        label="Local follow-up tracker evidence"
      />
    </div>
  );
}

function StateLinks() {
  return (
    <nav
      aria-label="Chat route state checks"
      className="chat-state-links"
      data-side-effects="none"
    >
      {routeStateChecks.map((state) => (
        <a href={state.href} key={state.href}>
          {state.label}
        </a>
      ))}
    </nav>
  );
}

function CurrentReplyPriority({
  assist,
  privacy,
  thread,
}: {
  assist: ChatWritingAssistPayload;
  privacy: ChatPrivacyControlsPayload;
  thread: ChatMessageThreadPayload;
}) {
  const primaryAssist = assist.assists[0];
  const conversation = thread.conversation;
  const context = thread.oneToOneContext;

  return (
    <WorkbenchSurface
      className="chat-priority"
      elevated
      eyebrow="Private relationship reply"
      title="Current reply priority"
    >
      <span hidden>Chat command center</span>
      <div className="chat-priority-copy">
        <p className="type-body">
          {conversation.participantName} at {conversation.organization} is the
          one conversation to review before staging the next response.
        </p>
        <p className="type-body">
          Why it matters now: {context.latestContext}
        </p>
        <p className="type-body">
          Consent and privacy posture:{" "}
          {privacy.analysisOptIn.enabled
            ? "analysis allowed for reviewed conversation context"
            : "analysis is off"}
          ; private notes stay hidden from analysis and sharing.
        </p>
        <p className="type-body">
          Suggested reply intent:{" "}
          {primaryAssist
            ? primaryAssist.label
            : context.recommendedFollowup}
          .
        </p>
        <p className="type-body">
          Next safe action: Reply only after review; keep the draft local.
        </p>
        <p className="type-caption">
          No external message, notification, profile update, private-note
          analysis, automated writing call, saved-record write, or outside
          network request occurs.
        </p>
      </div>
      <StateLinks />
    </WorkbenchSurface>
  );
}

function ChatWorkspace({
  actionResult,
  assist,
  conversations,
  extraction,
  privacy,
  summary,
  thread,
}: {
  actionResult: ChatSendMessagePayload | null;
  assist: ChatWritingAssistPayload;
  conversations: ChatConversationListPayload;
  extraction: ChatSummaryExtractionPayload;
  privacy: ChatPrivacyControlsPayload;
  summary: ChatSummaryExtractionPayload;
  thread: ChatMessageThreadPayload;
}) {
  const selectedConversation = thread.conversation;

  return (
    <div className="app-chat-route" data-state-boundary="app-chat-success">
      <style>{appChatStyles}</style>
      <CurrentReplyPriority assist={assist} privacy={privacy} thread={thread} />

      <div className="chat-command-layout">
        <WorkbenchSurface eyebrow="Conversation queue" title="Conversation inventory">
          <p className="type-body">
            Broader conversation inventory stays secondary until the current
            reply has been reviewed.
          </p>
          <ConversationList conversations={conversations} />
        </WorkbenchSurface>
        <RelationshipContextPanel thread={thread} />
      </div>

      <section aria-labelledby="reply-review-workflow">
        <h2 id="reply-review-workflow">Reply-review workflow</h2>
        <div className="chat-command-layout">
          <ThreadPanel thread={thread} />
          <WorkbenchSurface eyebrow="Local action" title="Staged reply">
            <ChatActionForm assist={assist.assists[0]} />
            <ChatActionResult
              conversation={selectedConversation}
              result={actionResult}
            />
            <FollowupTracker
              actionResult={actionResult}
              extraction={extraction}
            />
          </WorkbenchSurface>
        </div>
      </section>

      <section aria-label="Chat source review" className="chat-review-grid">
        <h2>Signal review</h2>
        <p className="type-body">
          Writing help, summaries, extracted signals, and privacy controls stay
          in review before any outside action.
        </p>
        <WritingAssistPanel assist={assist} />
        <SummaryPanel summary={summary} />
        <ExtractionPanel extraction={extraction} />
        <PrivacyPanel privacy={privacy} />
      </section>
    </div>
  );
}

export function AppChatCommandCenter({
  searchParams,
}: AppChatCommandCenterProps) {
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return (
      <div className="app-chat-route">
        <style>{appChatStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const services = createAppChatRouteServices();
  const conversationsResult = services.conversationService.listConversations();

  if (conversationsResult.success === false) {
    return (
      <div className="app-chat-route">
        <style>{appChatStyles}</style>
        <RouteStateBoundary scenario="failure" />
      </div>
    );
  }

  const conversation = conversationsResult.data.conversations[0];

  if (!conversation) {
    return (
      <div className="app-chat-route">
        <style>{appChatStyles}</style>
        <RouteStateBoundary scenario="empty" />
      </div>
    );
  }

  const threadResult = services.conversationService.getMessageThread({
    conversationId: conversation.conversationId,
  });
  const assistResult = services.writingAssistService.draftFollowup({
    contextNote: conversation.oneToOneContext.recommendedFollowup,
    conversationId: conversation.conversationId,
    organization: conversation.organization,
    participantName: conversation.participantName,
  });
  const summaryResult = services.summaryExtractionService.summarizeConversation({
    conversationId: conversation.conversationId,
  });
  const extractionResult =
    services.summaryExtractionService.extractConversationSignals({
      conversationId: conversation.conversationId,
    });
  const privacyResult = services.privacyControlsService.getPrivacyControls();
  const results: ChatRouteResult[] = [
    conversationsResult,
    threadResult,
    assistResult,
    summaryResult,
    extractionResult,
    privacyResult,
  ];

  if (firstFailure(results)) {
    return (
      <div className="app-chat-route">
        <style>{appChatStyles}</style>
        <RouteStateBoundary scenario="failure" />
      </div>
    );
  }

  if (
    threadResult.success === false ||
    assistResult.success === false ||
    summaryResult.success === false ||
    extractionResult.success === false ||
    privacyResult.success === false
  ) {
    return (
      <div className="app-chat-route">
        <style>{appChatStyles}</style>
        <RouteStateBoundary scenario="failure" />
      </div>
    );
  }

  const action = readSearchParam(searchParams, "action");
  const selectedAssist = assistResult.data.assists[0];
  const sendResult =
    action === "record-local-reply"
      ? services.conversationService.sendMessage({
          body:
            selectedAssist?.suggestedText ??
            conversation.oneToOneContext.recommendedFollowup,
          conversationId: conversation.conversationId,
        })
      : null;
  const actionResult =
    sendResult?.success === true ? sendResult.data : null;

  return (
    <ChatWorkspace
      actionResult={actionResult}
      assist={assistResult.data}
      conversations={conversationsResult.data}
      extraction={extractionResult.data}
      privacy={privacyResult.data}
      summary={summaryResult.data}
      thread={threadResult.data}
    />
  );
}
