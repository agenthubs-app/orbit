/**
 * Chat 会话与消息 mock 的开发者面板。
 *
 * 面板展示会话列表、线程消息和发送状态，帮助验证关系上下文聊天的基础数据契约。
 */
import {
  Chip,
  WorkbenchFrame,
  WorkbenchSurface,
} from "../../../shared/ui/primitives";
import type {
  ChatConversationListPayload,
  ChatConversationSummary,
  ChatMessage,
  ChatMessageThreadPayload,
  ChatSendMessagePayload,
} from "../contract";
import { CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY } from "../contract";
import { createMockChatConversationMessageService } from "../mock-service";

export const CHAT_CONVERSATION_AND_MESSAGE_MOCK_SLUG =
  "chat-conversation-and-message-mock";

const liveImplementationNotesPath =
  "features/chat/chat-conversation-and-message-mock/LIVE_IMPLEMENTATION.md";
const pathWrapStyle = { overflowWrap: "anywhere" } as const;

const responsiveWorkbenchStyles = `
.chat-conversation-workbench {
  grid-template-columns: minmax(0, 1fr);
  overflow-x: clip;
}

.chat-conversation-workbench .workbench-shell,
.chat-conversation-workbench .workbench-surface,
.chat-conversation-workbench .workbench-grid,
.chat-conversation-workbench .relationship-meta,
.chat-conversation-workbench .chip-row,
.chat-conversation-workbench .chat-state-matrix {
  min-width: 0;
}

.chat-conversation-workbench code,
.chat-conversation-workbench dd,
.chat-conversation-workbench .orbit-chip,
.chat-conversation-workbench .source-list li {
  overflow-wrap: anywhere;
}

.chat-conversation-workbench .chat-checkpoint-grid,
.chat-conversation-workbench .chat-state-matrix {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 176px), 1fr));
}

.chat-conversation-workbench .chat-checkpoint-grid div,
.chat-conversation-workbench .chat-state-matrix div {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.chat-conversation-workbench .chat-thread-item,
.chat-conversation-workbench .chat-conversation-item {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.chat-conversation-workbench .chat-message-body {
  white-space: pre-wrap;
}

.chat-conversation-workbench .chat-context-panel {
  border-left: 3px solid var(--orbit-color-primary);
  margin-top: var(--orbit-space-sm);
  padding-left: var(--orbit-space-sm);
}

.chat-conversation-workbench .chat-probe-guidance {
  margin-top: var(--orbit-space-xs);
}
`;

export const CHAT_CONVERSATION_AND_MESSAGE_API_PROBES = [
  {
    label: "List conversations",
    method: "GET",
    path: "/api/chat/conversations",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with deterministic one-to-one conversation summaries.",
  },
  {
    label: "Read message thread",
    method: "GET",
    path: "/api/chat/conversations/demo-conversation-1",
    expectedStatus: 200,
    expectation:
      "Expect 200 success envelope with source-backed messages and send-message state.",
  },
  {
    label: "Record local mock message",
    method: "POST",
    path: "/api/chat/conversations/demo-conversation-1/messages",
    expectedStatus: 201,
    expectation:
      "Expect 201 success envelope with a deterministic local message and no live storage.",
    requestBody: `{"body":"${CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY}"}`,
    fallback:
      "Default demo body: body-less harness POST records the deterministic mock reply.",
    recovery:
      "Blank body recovery: send an explicit blank body to verify CHAT_MESSAGE_BODY_REQUIRED.",
  },
  {
    label: "Empty conversation list",
    method: "GET",
    path: "/api/chat/conversations?scenario=empty",
    expectedStatus: 200,
    expectation:
      "Expect 200 empty envelope when no one-to-one relationship context is available.",
  },
  {
    label: "Pending local transport",
    method: "GET",
    path: "/api/chat/conversations?scenario=pending",
    expectedStatus: 200,
    expectation:
      "Expect 200 pending envelope while the local transport handshake fixture is unresolved.",
  },
  {
    label: "Controlled failure",
    method: "GET",
    path: "/api/chat/conversations?scenario=failure",
    expectedStatus: 503,
    expectation:
      "Expect 503 failure envelope with CHAT_CONVERSATION_MOCK_FAILED context.",
  },
] as const;

const liveHandoffEvidenceExcerpts = [
  "Live service files live under features/chat/chat-conversation-and-message-mock/.",
  "ORBIT_CHAT_CONVERSATION_PROVIDER switches mock fixtures to live providers.",
  "Live replacement requires real-time transport, provider subscription adapters, and durable message storage.",
  "Email, calendar, and notification permissions stay separate from chat conversation rendering.",
  "Every live message keeps source evidence, provenance, privacy constraints, and confirmation rules for external delivery.",
  "Replacement tests cover success, empty, pending, controlled failure, provider failure, and no-provider-call mock guards.",
] as const;

function apiProbeCommand(
  probe: (typeof CHAT_CONVERSATION_AND_MESSAGE_API_PROBES)[number],
): string {
  return `${probe.method} ${probe.path}`;
}

function ApiProbeGuidance({
  probe,
}: {
  probe: (typeof CHAT_CONVERSATION_AND_MESSAGE_API_PROBES)[number];
}) {
  if (!("requestBody" in probe)) {
    return null;
  }

  return (
    <p className="type-caption chat-probe-guidance">
      {probe.fallback} Request body: <code>{probe.requestBody}</code>.{" "}
      {probe.recovery} <code>CHAT_MESSAGE_BODY_REQUIRED</code>
    </p>
  );
}

function stageLabel(stage: string): string {
  return stage.replaceAll("_", " ");
}

function EvidenceChips({ evidenceIds }: { evidenceIds: readonly string[] }) {
  return (
    <div className="chip-row" aria-label="Chat conversation evidence">
      {evidenceIds.map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

function ConversationList({
  conversations,
}: {
  conversations: readonly ChatConversationSummary[];
}) {
  return (
    <dl
      aria-label="Chat conversation summaries"
      className="relationship-meta"
    >
      {conversations.map((conversation) => (
        <div className="chat-conversation-item" key={conversation.conversationId}>
          <dt>{conversation.participantName}</dt>
          <dd>
            <p className="type-body">
              {conversation.title} <code>{conversation.status}</code>
            </p>
            <p className="type-caption">
              {conversation.organization}: {conversation.lastMessagePreview}
            </p>
            <div className="chat-context-panel">
              <p className="type-caption">
                One-to-one context:{" "}
                {stageLabel(conversation.oneToOneContext.relationshipStage)}
              </p>
              <p className="type-caption">
                {conversation.oneToOneContext.relationshipReason}
              </p>
              <EvidenceChips evidenceIds={conversation.evidenceIds} />
            </div>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MessageThread({ thread }: { thread: ChatMessageThreadPayload }) {
  return (
    <dl aria-label="Chat message thread" className="relationship-meta">
      {thread.messages.map((message: ChatMessage) => (
        <div className="chat-thread-item" key={message.messageId}>
          <dt>
            {message.senderName} <code>{message.senderRole}</code>
          </dt>
          <dd>
            <p className="type-body chat-message-body">{message.body}</p>
            <p className="type-caption">
              Source: {message.source.label}. Delivery: {message.deliveryState}
            </p>
            <EvidenceChips evidenceIds={message.evidenceIds} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockOnlyExecutionChecks({
  payload,
}: {
  payload: ChatConversationListPayload;
}) {
  return (
    <dl
      aria-label="Mock-only chat conversation execution checks"
      className="relationship-meta"
    >
      <div>
        <dt>Realtime boundary</dt>
        <dd>realtime transport false</dd>
      </div>
      <div>
        <dt>Subscription boundary</dt>
        <dd>websocket subscription false</dd>
      </div>
      <div>
        <dt>Storage boundary</dt>
        <dd>production message storage false</dd>
      </div>
      <div>
        <dt>Notification boundary</dt>
        <dd>
          <code>{String(payload.provenance.notificationDelivered)}</code>
        </dd>
      </div>
    </dl>
  );
}

function OperatorCheckpoint({
  list,
  sent,
  thread,
}: {
  list: ChatConversationListPayload;
  sent: ChatSendMessagePayload;
  thread: ChatMessageThreadPayload;
}) {
  const topConversation = list.conversations[0];

  return (
    <WorkbenchSurface
      elevated
      eyebrow="Operator checkpoint"
      title="Ready for verifier review"
    >
      <p className="type-body">
        Scan this first: chat conversations and messages are assembled from
        local relationship evidence, not live transport, subscription channels,
        production message storage, AI, email, calendar, device, or notification
        services.
      </p>
      <dl
        aria-label="Chat conversation operator checkpoint"
        className="relationship-meta chat-checkpoint-grid"
      >
        <div>
          <dt>Conversation count</dt>
          <dd>{list.conversations.length} source-backed conversations</dd>
        </div>
        <div>
          <dt>Top conversation</dt>
          <dd>
            {topConversation.title} <code>{topConversation.conversationId}</code>
          </dd>
        </div>
        <div>
          <dt>One-to-one contact</dt>
          <dd>{thread.oneToOneContext.participantName}</dd>
        </div>
        <div>
          <dt>Send-message state</dt>
          <dd>{sent.sendMessageState.status}</dd>
        </div>
        <div>
          <dt>Storage boundary</dt>
          <dd>production message storage false</dd>
        </div>
      </dl>
      <EvidenceChips evidenceIds={topConversation.evidenceIds} />
    </WorkbenchSurface>
  );
}

function StateMatrix({
  empty,
  failureCode,
  pending,
  success,
}: {
  empty: ChatConversationListPayload;
  failureCode: string;
  pending: ChatConversationListPayload;
  success: ChatConversationListPayload;
}) {
  return (
    <WorkbenchSurface eyebrow="State matrix" title="Harness-visible states">
      <dl
        aria-label="Chat conversation state matrix"
        className="relationship-meta chat-state-matrix"
      >
        <div>
          <dt>Success state</dt>
          <dd>
            <span className="type-caption">
              Success probe: GET /api/chat/conversations
            </span>
            <br />
            Success: {success.conversations.length} conversations
          </dd>
        </div>
        <div>
          <dt>Empty state</dt>
          <dd>
            <span className="type-caption">
              Empty probe: GET /api/chat/conversations?scenario=empty
            </span>
            <br />
            Empty: no one-to-one chat context
          </dd>
        </div>
        <div>
          <dt>Pending state</dt>
          <dd>
            <span className="type-caption">
              Pending probe: GET /api/chat/conversations?scenario=pending
            </span>
            <br />
            Pending: local transport handshake
          </dd>
        </div>
        <div>
          <dt>Failure state</dt>
          <dd>
            <span className="type-caption">
              Failure probe: GET /api/chat/conversations?scenario=failure
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

export function ChatConversationAndMessageMockDemo() {
  const service = createMockChatConversationMessageService();
  const successResult = service.listConversations();
  const emptyResult = service.listConversations({ scenario: "empty" });
  const pendingResult = service.listConversations({ scenario: "pending" });
  const failureResult = service.listConversations({ scenario: "failure" });
  const threadResult = service.getMessageThread({
    conversationId: "demo-conversation-1",
  });
  const sendResult = service.sendMessage({
    body: "Let's compare pilot windows next week.",
    conversationId: "demo-conversation-1",
  });

  if (
    successResult.success === false ||
    emptyResult.success === false ||
    pendingResult.success === false ||
    threadResult.success === false ||
    sendResult.success === false
  ) {
    return (
      <WorkbenchFrame className="chat-conversation-workbench">
        <div className="workbench-shell">
          <header className="workbench-header">
            <p className="workbench-kicker">Developer capability runtime</p>
            <h1>Chat conversation and message mock</h1>
            <p className="workbench-intro">
              The deterministic chat fixtures did not load, so the dev surface
              stopped inside a controlled local state.
            </p>
          </header>
        </div>
      </WorkbenchFrame>
    );
  }

  const failureCode =
    failureResult.success === false
      ? failureResult.error.code
      : "CHAT_CONVERSATION_MOCK_FAILED";

  return (
    <WorkbenchFrame className="chat-conversation-workbench">
      <style>{responsiveWorkbenchStyles}</style>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Developer capability runtime</p>
          <h1>Chat conversation and message mock</h1>
          <p className="workbench-intro">
            Dev-only surface for verifying the chat conversation boundary. It
            renders conversation lists, a message thread, one-to-one context,
            and send-message state from deterministic local fixtures.
          </p>
        </header>

        <OperatorCheckpoint
          list={successResult.data}
          sent={sendResult.data}
          thread={threadResult.data}
        />

        <section
          className="workbench-grid"
          aria-label="Chat conversation capability details"
        >
          <WorkbenchSurface
            elevated
            eyebrow="Conversation fixtures"
            title="Two source-backed one-to-one chats"
          >
            <p className="type-body">{successResult.data.summary}</p>
            <ConversationList conversations={successResult.data.conversations} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Thread fixture" title="Maya Chen messages">
            <p className="type-body">{threadResult.data.summary}</p>
            <MessageThread thread={threadResult.data} />
          </WorkbenchSurface>

          <WorkbenchSurface eyebrow="Mock-only checks" title="Provider boundaries">
            <MockOnlyExecutionChecks payload={successResult.data} />
            <p className="privacy-note">
              Message previews stay local until live provider files,
              confirmation rules, and replacement tests are explicitly added.
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
            {CHAT_CONVERSATION_AND_MESSAGE_API_PROBES.map((probe) => (
              <div key={apiProbeCommand(probe)}>
                <dt>{probe.label}</dt>
                <dd>
                  <code>{apiProbeCommand(probe)}</code> Expected status:{" "}
                  {probe.expectedStatus}. {probe.expectation}
                  <ApiProbeGuidance probe={probe} />
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
                <code>ORBIT_CHAT_CONVERSATION_PROVIDER</code> remains
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
