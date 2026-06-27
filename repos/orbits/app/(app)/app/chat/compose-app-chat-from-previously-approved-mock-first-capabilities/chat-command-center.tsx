/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import type {
  AppChatActionResultViewModel,
  AppChatAgentTurnViewModel,
  AppChatAssistViewModel,
  AppChatConversationViewModel,
  AppChatExtractionViewModel,
  AppChatMessageViewModel,
  AppChatPrivacyViewModel,
  AppChatRelationshipContextViewModel,
  AppChatRouteScenario,
  AppChatRouteStateViewModel,
  AppChatSearchParams,
  AppChatSummaryViewModel,
  AppChatWorkspaceViewModel,
} from "./chat-route-view-model";
import { loadAppChatRouteViewModel } from "./chat-route-view-model";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import {
  AgentArtifactSidePanel,
  agentArtifactSidePanelStyles,
} from "./agent-artifact-side-panel";

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

.app-chat-route .chat-agent-orchestration-layout {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
}

.app-chat-route .chat-agent-orchestration-layout[data-agent-panel="open"] {
  grid-template-columns: minmax(0, 0.95fr) minmax(min(100%, 360px), 0.8fr);
}

.app-chat-route .chat-agent-prompt-panel,
.app-chat-route .chat-agent-prompt-form,
.app-chat-route .chat-agent-response {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-chat-route .chat-agent-prompt-row {
  display: grid;
  gap: var(--orbit-space-xs);
  grid-template-columns: minmax(0, 1fr) auto;
}

.app-chat-route .chat-agent-prompt-row input {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  min-width: 0;
  padding: 9px 11px;
}

.app-chat-route .chat-agent-prompt-row button {
  background: var(--orbit-color-primary);
  border: 1px solid var(--orbit-color-primary-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-primary-text);
  padding: 9px 12px;
  white-space: nowrap;
}

.app-chat-route .chat-agent-response {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 3px solid var(--orbit-color-primary);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

@media (max-width: 900px) {
  .app-chat-route .chat-agent-orchestration-layout[data-agent-panel="open"],
  .app-chat-route .chat-agent-prompt-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

${agentArtifactSidePanelStyles}
`;

interface AppChatCommandCenterProps {
  searchParams?: AppChatSearchParams;
}

const routeStateChecks = [
  {
    href: "/app/chat?scenario=empty",
    label: bilingualText("没有对话上下文", "No chat context"),
  },
  {
    href: "/app/chat?scenario=pending",
    label: bilingualText("同意状态检查", "Consent check"),
  },
  {
    href: "/app/chat?scenario=failure",
    label: bilingualText("恢复路径", "Recovery path"),
  },
] as const;

const routeRecoveryActions: Record<
  AppChatRouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    {
      href: "/app/chat",
      label: bilingualText("显示可用对话工作区", "Show ready chat workspace"),
    },
    {
      href: "/app/chat?action=record-local-reply",
      label: bilingualText("预览本地回复", "Preview local reply"),
    },
  ],
  failure: [
    {
      href: "/app/chat",
      label: bilingualText("重新加载对话工作区", "Reload chat workspace"),
    },
    {
      href: "/app/chat?scenario=pending",
      label: bilingualText("检查同意状态", "Check consent status"),
    },
  ],
  pending: [
    {
      href: "/app/chat",
      label: bilingualText(
        "返回可用对话工作区",
        "Return to ready chat workspace",
      ),
    },
  ],
};

function publicEvidenceIds(evidenceIds: readonly string[]): string[] {
  return evidenceIds.filter(
    (evidenceId) => !evidenceId.toLowerCase().includes("mock"),
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: AppChatRouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/chat?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({ scenario }: { scenario: AppChatRouteScenario }) {
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

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  const { copy, errorCode, evidenceIds, scenario } = routeState;

  return (
    <RouteStateMarker scenario={scenario}>
      <div
        data-error-code={errorCode ?? undefined}
        data-state-boundary="shared-ui-state-view"
      >
        <WorkbenchSurface elevated eyebrow={bilingualText("对话", "Chat")} title={copy.title}>
          <p className="type-body">{copy.description}</p>
          <dl aria-label="Chat status details" className="relationship-meta">
            <div>
              <dt>{bilingualText("Orbit 已知", "What Orbit knows")}</dt>
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
      <summary>{bilingualText("来源和安全证据", "Source and safety evidence")}</summary>
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
  conversations: readonly AppChatConversationViewModel[];
}) {
  return (
    <div className="chat-conversation-list">
      {conversations.map((conversation) => (
        <article key={conversation.conversationId}>
          <p className="surface-eyebrow">{conversation.statusLabel}</p>
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

function ThreadPanel({
  messages,
  summary,
}: {
  messages: readonly AppChatMessageViewModel[];
  summary: string;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("对话复核", "Conversation review")}
      title={bilingualText("复核一个对话线程", "One thread to review")}
    >
      <p className="type-body">{summary}</p>
      <p className="type-caption">
        {bilingualText(
          "参与者标签会让私人回复复核始终基于谁说了什么，再暂存草稿。",
          "Participant labels keep the private reply review grounded in who said what before a draft is staged.",
        )}
      </p>
      <div aria-label="Private conversation messages" className="chat-message-list">
        {messages.map((message) => (
          <article
            className="chat-message"
            data-sender={message.senderRole}
            key={message.messageId}
          >
            <p className="surface-eyebrow">{message.senderLabel}</p>
            <p className="type-body">{message.body}</p>
          </article>
        ))}
      </div>
    </WorkbenchSurface>
  );
}

function RelationshipContextPanel({
  context,
}: {
  context: AppChatRelationshipContextViewModel;
}) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("关系上下文", "Relationship context")}
      title={context.participantName}
    >
      <dl aria-label="Conversation relationship context" className="relationship-meta">
        <div>
          <dt>{bilingualText("组织", "Organization")}</dt>
          <dd>{context.organization}</dd>
        </div>
        <div>
          <dt>{bilingualText("关系来源原因", "Why this connection exists")}</dt>
          <dd>{context.relationshipReason}</dd>
        </div>
        <div>
          <dt>{bilingualText("最新上下文", "Latest context")}</dt>
          <dd>{context.latestContext}</dd>
        </div>
        <div>
          <dt>{bilingualText("合理下一步", "Sensible next step")}</dt>
          <dd>{context.recommendedFollowup}</dd>
        </div>
      </dl>
    </WorkbenchSurface>
  );
}

function WritingAssistPanel({
  assist,
}: {
  assist: AppChatAssistViewModel | null;
}) {
  if (!assist) {
    return null;
  }

  return (
    <ReviewCard
      evidenceIds={assist.evidenceIds}
      eyebrow={bilingualText("写作辅助", "Writing assist")}
      title={assist.label}
    >
      <p className="type-body">{assist.suggestedText}</p>
      <p className="type-caption">
        {bilingualText(
          "复核状态：已暂存，等待人工复核。",
          "Review status: staged for human review.",
        )}
      </p>
      <p className="type-caption">{assist.rationale}</p>
    </ReviewCard>
  );
}

function SummaryPanel({ summary }: { summary: AppChatSummaryViewModel }) {
  return (
    <ReviewCard
      evidenceIds={summary.evidenceIds}
      eyebrow={bilingualText("对话摘要", "Conversation summary")}
      title={bilingualText("待复核摘要", "Summary for review")}
    >
      <p className="type-body">
        {summary.narrative
          ? summary.narrative
          : bilingualText(
              "这段对话还没有可用摘要。",
              "No summary is available for this conversation yet.",
            )}
      </p>
    </ReviewCard>
  );
}

function ExtractionPanel({
  extraction,
}: {
  extraction: AppChatExtractionViewModel;
}) {
  return (
    <ReviewCard
      evidenceIds={extraction.evidenceIds}
      eyebrow={bilingualText("对话提取", "Conversation extraction")}
      title={bilingualText("待确认的关系信号", "Relationship signals to confirm")}
    >
      {extraction.needStatement && (
        <p className="type-body">{extraction.needStatement}</p>
      )}
      {extraction.taskTitle && (
        <Chip tone="confirmation">{extraction.taskTitle}</Chip>
      )}
      {extraction.profileSuggestionValue && (
        <p className="privacy-note">
          {bilingualText(
            `${extraction.profileSuggestionValue} 需要先复核，才能修改资料。`,
            `${extraction.profileSuggestionValue} needs review before profile changes.`,
          )}
        </p>
      )}
    </ReviewCard>
  );
}

function PrivacyPanel({ privacy }: { privacy: AppChatPrivacyViewModel }) {
  return (
    <ReviewCard
      evidenceIds={privacy.evidenceIds}
      eyebrow={bilingualText("隐私控制", "Privacy controls")}
      title={`${privacy.participantName} · ${privacy.organization}`}
    >
      <p className="type-body">
        {bilingualText("同意状态", "Consent status")}:{" "}
        {privacy.analysisAllowed
          ? bilingualText("允许分析", "analysis allowed")
          : bilingualText("分析关闭", "analysis off")}
        .
      </p>
      <dl aria-label="Chat privacy controls" className="relationship-meta">
        <div>
          <dt>{bilingualText("分析状态", "Analysis status")}</dt>
          <dd>
            {privacy.analysisAllowed
              ? bilingualText("允许", "Allowed")
              : bilingualText("关闭", "Off")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("私人备注", "Private notes")}</dt>
          <dd>
            {bilingualText(
              "私人备注不会进入分析或分享。",
              "Private note hidden from analysis and sharing",
            )}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("分享", "Sharing")}</dt>
          <dd>
            {bilingualText(
              "敏感上下文需要先确认。",
              "Sensitive context needs confirmation first.",
            )}
          </dd>
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
  assist: AppChatAssistViewModel | null;
}) {
  return (
    <form action="/app/chat" className="chat-action-form" method="get">
      <input name="action" type="hidden" value="record-local-reply" />
      <p className="type-body">
        {bilingualText(
          "在把建议回复预览为本地跟进前，先复核内容。",
          "Review the suggested reply before previewing it as a local follow-up.",
        )}
      </p>
      {assist && (
        <p className="type-caption">
          {bilingualText("草稿消息", "Draft message")}: {assist.suggestedText}
        </p>
      )}
      <button type="submit">
        {bilingualText("预览本地回复", "Preview local reply")}
      </button>
    </form>
  );
}

function ChatActionResult({
  result,
}: {
  result: AppChatActionResultViewModel | null;
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
      <strong>{bilingualText("本地回复预览已准备", "Local reply preview ready")}</strong>
      <p className="type-body">
        {bilingualText("已选择对话", "Selected conversation")}:{" "}
        {result.selectedConversationLabel}
      </p>
      <p className="type-caption">
        {bilingualText("草稿来自写作辅助", "Draft selected from writing assist")}
      </p>
      <p className="type-body">{result.messageBody}</p>
      <p className="type-body">
        {bilingualText(
          "保持本地：已选择对话、回复草稿和跟进追踪都留在此页面。",
          "What remains local: Selected conversation, draft reply, and follow-up tracker stay on this page.",
        )}
      </p>
      <ul aria-label="Local reply safety ledger" className="chat-priority-ledger">
        <li>{bilingualText("无外部消息", "No external message")}</li>
        <li>{bilingualText("无通知", "No notification")}</li>
        <li>{bilingualText("无资料更新", "No profile update")}</li>
        <li>{bilingualText("无私人备注分析", "No private-note analysis")}</li>
        <li>{bilingualText("无自动写作调用", "No automated writing call")}</li>
        <li>{bilingualText("无保存记录写入", "No saved-record write")}</li>
        <li>{bilingualText("无外部网络请求", "No outside network request")}</li>
      </ul>
    </div>
  );
}

function FollowupTracker({
  actionResult,
  extraction,
}: {
  actionResult: AppChatActionResultViewModel | null;
  extraction: AppChatExtractionViewModel;
}) {
  if (!extraction.taskTitle) {
    return null;
  }

  return (
    <div
      aria-label="Local follow-up tracker"
      className="chat-followup-tracker"
      data-followup-tracker="local-chat-followup"
      data-side-effects="none"
    >
      <strong>{bilingualText("跟进追踪", "Follow-up tracker")}</strong>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("有来源支撑的任务", "Source-backed task")}</dt>
          <dd>{extraction.taskTitle}</dd>
        </div>
        <div>
          <dt>{bilingualText("本地备注", "Local note")}</dt>
          <dd>
            {actionResult
              ? bilingualText(
                  "本地回复预览已准备，可用于跟进追踪。",
                  "Local reply preview ready for follow-up tracking",
                )
              : bilingualText(
                  "追踪进展前，先记录本地回复预览。",
                  "Record a local reply preview before tracking progress",
                )}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("外部发送", "External send")}</dt>
          <dd>{bilingualText("外部发送保持关闭", "External send remains off")}</dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={extraction.taskEvidenceIds}
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

function OrbitAgentPromptPanel({
  agentTurn,
}: {
  agentTurn: AppChatAgentTurnViewModel | null;
}) {
  return (
    <WorkbenchSurface
      className="chat-agent-prompt-panel"
      eyebrow={bilingualText("Orbit Agent", "Orbit Agent")}
      title={bilingualText("自然语言请求", "Natural language request")}
    >
      <form action="/app/chat" className="chat-agent-prompt-form" method="get">
        <label className="type-caption" htmlFor="orbit-agent-prompt">
          {bilingualText(
            "输入活动推荐、人脉推荐、跟进或回复上下文请求。",
            "Ask for events, people, follow-ups, or reply context.",
          )}
        </label>
        <div className="chat-agent-prompt-row">
          <input
            defaultValue={agentTurn?.prompt ?? ""}
            id="orbit-agent-prompt"
            name="prompt"
            placeholder={bilingualText(
              "帮我推荐下周适合见 Maya 的活动",
              "Recommend events for meeting Maya next week",
            )}
            type="text"
          />
          <button type="submit">
            {bilingualText("发送给 Agent", "Send to Agent")}
          </button>
        </div>
      </form>
      {agentTurn && (
        <div
          className="chat-agent-response"
          data-agent-artifact-open={String(Boolean(agentTurn.artifactSurface))}
          role="status"
        >
          <p className="surface-eyebrow">
            {bilingualText("Agent 回复", "Agent reply")}
          </p>
          <p className="type-body">{agentTurn.assistantMessage}</p>
          {agentTurn.proposedToolLabels.length > 0 && (
            <div className="chip-row">
              {agentTurn.proposedToolLabels.map((label) => (
                <Chip key={label} tone="confirmation">
                  {label}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </WorkbenchSurface>
  );
}

function CurrentReplyPriority({
  primaryAssist,
  privacy,
  relationshipContext,
  selectedConversation,
}: {
  primaryAssist: AppChatAssistViewModel | null;
  privacy: AppChatPrivacyViewModel;
  relationshipContext: AppChatRelationshipContextViewModel;
  selectedConversation: AppChatConversationViewModel;
}) {
  return (
    <WorkbenchSurface
      className="chat-priority"
      elevated
      eyebrow={bilingualText("私密关系回复", "Private relationship reply")}
      title={bilingualText("当前回复优先级", "Current reply priority")}
    >
      <span hidden>Chat command center</span>
      <div className="chat-priority-copy">
        <p className="type-body">
          {bilingualText(
            `${selectedConversation.participantName}（${selectedConversation.organization}）是现在要先复核的一段对话，然后再准备回复。`,
            `${selectedConversation.participantName} at ${selectedConversation.organization} is the one conversation to review before staging the next response.`,
          )}
        </p>
        <p className="type-body">
          {bilingualText("为什么现在重要", "Why it matters now")}:{" "}
          {relationshipContext.latestContext}
        </p>
        <p className="type-body">
          {bilingualText("同意和隐私状态", "Consent and privacy posture")}:{" "}
          {privacy.analysisAllowed
            ? "analysis allowed for reviewed conversation context"
            : "analysis is off"}
          ; private notes stay hidden from analysis and sharing.
        </p>
        <p className="type-body">
          {bilingualText("建议回复意图", "Suggested reply intent")}:{" "}
          {primaryAssist
            ? primaryAssist.label
            : relationshipContext.recommendedFollowup}
          .
        </p>
        <p className="type-body">
          {bilingualText(
            "安全下一步：复核后再回复，草稿先留在本地。",
            "Next safe action: Reply only after review; keep the draft local.",
          )}
        </p>
        <p className="type-caption">
          {bilingualText(
            "不会发生外部消息、通知、资料更新、私人备注分析、自动写作调用、保存记录写入或外部网络请求。",
            "No external message, notification, profile update, private-note analysis, automated writing call, saved-record write, or outside network request occurs.",
          )}
        </p>
      </div>
      <StateLinks />
    </WorkbenchSurface>
  );
}

function ChatWorkspace({
  workspace,
}: {
  workspace: AppChatWorkspaceViewModel;
}) {
  return (
    <div className="app-chat-route" data-state-boundary="app-chat-success">
      <style>{appChatStyles}</style>
      <CurrentReplyPriority
        primaryAssist={workspace.primaryAssist}
        privacy={workspace.privacy}
        relationshipContext={workspace.relationshipContext}
        selectedConversation={workspace.selectedConversation}
      />

      <div
        className="chat-agent-orchestration-layout"
        data-agent-panel={workspace.agentTurn?.artifactSurface ? "open" : "closed"}
      >
        <OrbitAgentPromptPanel agentTurn={workspace.agentTurn} />
        <AgentArtifactSidePanel
          surface={workspace.agentTurn?.artifactSurface ?? null}
        />
      </div>

      <div className="chat-command-layout">
        <WorkbenchSurface
          eyebrow={bilingualText("对话队列", "Conversation queue")}
          title={bilingualText("对话清单", "Conversation inventory")}
        >
          <p className="type-body">
            {bilingualText(
              "当前回复完成复核前，更大的对话清单保持为次要内容。",
              "Broader conversation inventory stays secondary until the current reply has been reviewed.",
            )}
          </p>
          <ConversationList conversations={workspace.conversations} />
        </WorkbenchSurface>
        <RelationshipContextPanel context={workspace.relationshipContext} />
      </div>

      <section aria-labelledby="reply-review-workflow">
        <h2 id="reply-review-workflow">
          {bilingualText("回复复核流程", "Reply-review workflow")}
        </h2>
        <div className="chat-command-layout">
          <ThreadPanel
            messages={workspace.threadMessages}
            summary={workspace.threadSummary}
          />
          <WorkbenchSurface
            eyebrow={bilingualText("本地动作", "Local action")}
            title={bilingualText("已暂存回复", "Staged reply")}
          >
            <ChatActionForm assist={workspace.primaryAssist} />
            <ChatActionResult result={workspace.actionResult} />
            <FollowupTracker
              actionResult={workspace.actionResult}
              extraction={workspace.extraction}
            />
          </WorkbenchSurface>
        </div>
      </section>

      <section aria-label="Chat source review" className="chat-review-grid">
        <h2>{bilingualText("信号复核", "Signal review")}</h2>
        <p className="type-body">
          {bilingualText(
            "写作辅助、摘要、提取信号和隐私控制都会先保持复核，再进入任何外部动作。",
            "Writing help, summaries, extracted signals, and privacy controls stay in review before any outside action.",
          )}
        </p>
        <WritingAssistPanel assist={workspace.primaryAssist} />
        <SummaryPanel summary={workspace.summary} />
        <ExtractionPanel extraction={workspace.extraction} />
        <PrivacyPanel privacy={workspace.privacy} />
      </section>
    </div>
  );
}

export function AppChatCommandCenter({
  searchParams,
}: AppChatCommandCenterProps) {
  const routeViewModel = loadAppChatRouteViewModel(searchParams);

  if (routeViewModel.state === "route-state") {
    return (
      <div className="app-chat-route">
        <style>{appChatStyles}</style>
        <RouteStateBoundary routeState={routeViewModel.routeState} />
      </div>
    );
  }

  return <ChatWorkspace workspace={routeViewModel.workspace} />;
}
