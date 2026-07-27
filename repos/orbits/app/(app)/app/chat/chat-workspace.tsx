import type { OrbitLanguage } from "../orbit-language-core";
import { AccountTopNav } from "../orbit-account-shell";
import { Icon } from "../orbit-reference-primitives";
import type { AppChatWorkspaceViewModel } from "./compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";

function copy(
  language: OrbitLanguage,
  value: { en: string; zh: string },
): string {
  return language === "en" ? value.en : value.zh;
}

function evidence(
  values: readonly string[],
  language: OrbitLanguage,
) {
  const unique = Array.from(new Set(values.filter(Boolean)));

  if (unique.length === 0) return null;

  return (
    <details className="orbit-chat-evidence">
      <summary>
        {copy(language, {
          en: `${unique.length} source reference${unique.length === 1 ? "" : "s"}`,
          zh: `${unique.length} 条来源依据`,
        })}
      </summary>
      <ul>
        {unique.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </details>
  );
}

export function ChatWorkspace({
  language,
  workspace,
}: {
  language: OrbitLanguage;
  workspace: AppChatWorkspaceViewModel;
}) {
  const selected = workspace.selectedConversation;
  const agentHref = `/app/agent?q=${encodeURIComponent(
    copy(language, {
      en: `Help me plan a source-backed follow-up with ${selected.participantName}.`,
      zh: `请根据现有来源，帮我规划与 ${selected.participantName} 的下一步跟进。`,
    }),
  )}`;

  return (
    <main
      className="orbit-chat-page"
      data-orbit-real-page="chat"
      data-selected-conversation={selected.conversationId}
    >
      <AccountTopNav active="agent" />
      <div className="orbit-chat-layout">
        <aside
          aria-label={copy(language, { en: "Conversations", zh: "会话列表" })}
          className="orbit-chat-list"
        >
          <div className="orbit-chat-list-head">
            <span className="eyebrow">
              {copy(language, { en: "Chat", zh: "消息" })}
            </span>
            <h1>{copy(language, { en: "Conversations", zh: "会话" })}</h1>
            <p>
              {copy(language, {
                en: "Source-backed records only",
                zh: "仅展示有来源的记录",
              })}
            </p>
          </div>
          <nav>
            {workspace.conversations.map((conversation) => (
              <a
                aria-current={
                  conversation.conversationId === selected.conversationId
                    ? "page"
                    : undefined
                }
                className={
                  conversation.conversationId === selected.conversationId
                    ? "is-active"
                    : undefined
                }
                href={`/app/chat?conversation=${encodeURIComponent(conversation.conversationId)}`}
                key={conversation.conversationId}
              >
                <span className="orbit-chat-list-title">
                  <strong>{conversation.participantName}</strong>
                  <small>{conversation.statusLabel}</small>
                </span>
                <span>{conversation.organization || conversation.title}</span>
                <p>{conversation.lastMessagePreview}</p>
              </a>
            ))}
          </nav>
        </aside>

        <section
          aria-label={copy(language, { en: "Message thread", zh: "消息线程" })}
          className="orbit-chat-thread"
        >
          <header>
            <div>
              <span className="eyebrow">
                {copy(language, { en: "Selected conversation", zh: "当前会话" })}
              </span>
              <h2>{selected.participantName}</h2>
              <p>{selected.organization || selected.title}</p>
            </div>
            <span className="chip">{selected.statusLabel}</span>
          </header>

          <div className="orbit-chat-messages">
            {workspace.threadMessages.length > 0 ? (
              workspace.threadMessages.map((message) => (
                <article
                  className={message.senderRole === "orbit_user" ? "is-mine" : undefined}
                  key={message.messageId}
                >
                  <div>
                    <strong>{message.senderLabel}</strong>
                    <time>{message.timestampLabel}</time>
                  </div>
                  <p>{message.body}</p>
                </article>
              ))
            ) : (
              <div className="orbit-chat-empty">
                {copy(language, {
                  en: "No messages are recorded in this conversation.",
                  zh: "这段会话还没有已记录的消息。",
                })}
              </div>
            )}
          </div>

          <footer>
            <div>
              <span className="eyebrow">
                {copy(language, { en: "Review-only suggestion", zh: "仅供复核的建议" })}
              </span>
              <p>
                {workspace.primaryAssist?.suggestedText ??
                  workspace.relationshipContext.recommendedFollowup}
              </p>
              <small>
                {copy(language, {
                  en: "Nothing is sent or saved from this page.",
                  zh: "此页面不会发送消息或保存草稿。",
                })}
              </small>
            </div>
            <a className="btn btn-soft btn-sm" href={agentHref}>
              <Icon name="sparkle" size={15} />
              {copy(language, { en: "Plan with iOrbit", zh: "让 iOrbit 帮我规划" })}
            </a>
          </footer>
        </section>

        <aside
          aria-label={copy(language, {
            en: "Relationship context",
            zh: "关系上下文",
          })}
          className="orbit-chat-context"
        >
          <section>
            <span className="eyebrow">
              {copy(language, { en: "Relationship context", zh: "关系上下文" })}
            </span>
            <h3>{workspace.relationshipContext.relationshipReason}</h3>
            <p>{workspace.relationshipContext.latestContext}</p>
          </section>
          <section>
            <span className="eyebrow">
              {copy(language, { en: "Conversation summary", zh: "会话摘要" })}
            </span>
            <p>{workspace.summary.narrative ?? workspace.threadSummary}</p>
            {evidence(
              [
                ...selected.evidenceIds,
                ...workspace.summary.evidenceIds,
                ...(workspace.primaryAssist?.evidenceIds ?? []),
              ],
              language,
            )}
          </section>
          <section>
            <span className="eyebrow">
              {copy(language, { en: "Privacy", zh: "隐私" })}
            </span>
            <p>
              {workspace.privacy.analysisAllowed
                ? copy(language, {
                    en: "Analysis is allowed for this recorded relationship context.",
                    zh: "当前已记录的关系上下文允许用于分析。",
                  })
                : copy(language, {
                    en: "Analysis is disabled for this conversation.",
                    zh: "这段会话已禁止分析。",
                  })}
            </p>
          </section>
        </aside>
      </div>
      <style>{`
        .orbit-chat-page { min-height: 100dvh; background: var(--bg); color: var(--text); }
        .orbit-chat-layout { display: grid; grid-template-columns: 284px minmax(0, 1fr) 320px; min-height: calc(100dvh - 64px); }
        .orbit-chat-list { background: var(--bg-sunken); border-right: 1px solid var(--border); min-width: 0; }
        .orbit-chat-list-head { padding: 24px 20px 14px; }
        .orbit-chat-list h1 { color: var(--ink); font-size: 22px; margin: 5px 0 4px; }
        .orbit-chat-list-head p { color: var(--text-3); font-size: 12px; margin: 0; }
        .orbit-chat-list nav { display: grid; gap: 4px; padding: 0 10px 24px; }
        .orbit-chat-list nav a { border: 1px solid transparent; border-radius: var(--r-md); color: inherit; display: grid; gap: 4px; padding: 12px; text-decoration: none; }
        .orbit-chat-list nav a:hover, .orbit-chat-list nav a.is-active { background: var(--surface); border-color: var(--border); }
        .orbit-chat-list-title { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
        .orbit-chat-list-title strong { color: var(--ink); font-size: 14px; }
        .orbit-chat-list-title small { color: var(--accent); font-size: 11px; }
        .orbit-chat-list nav a > span:not(.orbit-chat-list-title) { color: var(--text-3); font-size: 12px; }
        .orbit-chat-list nav p { color: var(--text-2); display: -webkit-box; font-size: 12px; line-height: 1.45; margin: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .orbit-chat-thread { display: flex; flex-direction: column; min-width: 0; }
        .orbit-chat-thread > header { align-items: center; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; padding: 20px 24px; }
        .orbit-chat-thread h2 { color: var(--ink); font-size: 22px; margin: 4px 0 2px; }
        .orbit-chat-thread header p { color: var(--text-3); font-size: 13px; margin: 0; }
        .orbit-chat-messages { display: flex; flex: 1; flex-direction: column; gap: 12px; overflow-y: auto; padding: 24px; }
        .orbit-chat-messages article { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px 16px 16px; max-width: min(78%, 620px); padding: 12px 14px; }
        .orbit-chat-messages article.is-mine { align-self: flex-end; background: var(--accent-softer); border-radius: 16px 4px 16px 16px; }
        .orbit-chat-messages article > div { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
        .orbit-chat-messages strong { color: var(--ink); font-size: 12px; }
        .orbit-chat-messages time { color: var(--text-4); font-family: var(--ff-mono); font-size: 11px; }
        .orbit-chat-messages p { font-size: 14px; line-height: 1.6; margin: 7px 0 0; white-space: pre-wrap; }
        .orbit-chat-empty { color: var(--text-3); margin: auto; }
        .orbit-chat-thread > footer { align-items: flex-end; background: var(--surface); border-top: 1px solid var(--border); display: flex; gap: 16px; justify-content: space-between; padding: 16px 24px; }
        .orbit-chat-thread footer p { color: var(--ink); font-size: 13px; line-height: 1.5; margin: 5px 0 3px; }
        .orbit-chat-thread footer small { color: var(--text-3); }
        .orbit-chat-context { background: var(--bg-sunken); border-left: 1px solid var(--border); padding: 20px; }
        .orbit-chat-context section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); margin-bottom: 12px; padding: 15px; }
        .orbit-chat-context h3 { color: var(--ink); font-size: 15px; line-height: 1.4; margin: 7px 0; }
        .orbit-chat-context p { color: var(--text-2); font-size: 13px; line-height: 1.55; margin: 7px 0 0; }
        .orbit-chat-evidence { color: var(--text-3); font-size: 11px; margin-top: 10px; overflow-wrap: anywhere; }
        .orbit-chat-evidence summary { cursor: pointer; }
        .orbit-chat-evidence ul { margin: 8px 0 0; padding-left: 18px; }
        @media (max-width: 1000px) {
          .orbit-chat-layout { grid-template-columns: 240px minmax(0, 1fr); }
          .orbit-chat-context { border-left: 0; border-top: 1px solid var(--border); grid-column: 1 / -1; }
        }
        @media (max-width: 700px) {
          .orbit-chat-layout { display: block; min-height: auto; }
          .orbit-chat-list { border-bottom: 1px solid var(--border); border-right: 0; }
          .orbit-chat-list nav { display: flex; overflow-x: auto; }
          .orbit-chat-list nav a { flex: 0 0 240px; }
          .orbit-chat-thread { min-height: 65dvh; }
          .orbit-chat-thread > header, .orbit-chat-thread > footer { padding: 16px 18px; }
          .orbit-chat-messages { padding: 18px; }
          .orbit-chat-messages article { max-width: 90%; }
          .orbit-chat-thread > footer { align-items: stretch; flex-direction: column; }
          .orbit-chat-context { padding: 16px 18px 36px; }
        }
      `}</style>
    </main>
  );
}
