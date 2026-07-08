import type { AppAsyncChatCommandCenterViewModel } from "./chat-route-view-model";

export function ChatCommandCenter({
  model,
}: {
  model: AppAsyncChatCommandCenterViewModel;
}) {
  return (
    <main
      className="app-chat-command-center"
      data-chat-state={model.chatState}
      data-selected-conversation={model.selectedConversationId}
    >
      <style>{`
        .app-chat-command-center {
          --chat-canvas: #f7f6f2;
          --chat-panel: #ffffff;
          --chat-ink: #22251f;
          --chat-muted: #65706a;
          --chat-border: #d9d2c2;
          --chat-line: #ece6da;
          --chat-slate: #31454f;
          --chat-green: #2f6b55;
          --chat-amber: #a9632d;
          --chat-blue: #315c91;
          background: var(--chat-canvas);
          color: var(--chat-ink);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: 0;
          min-height: 100vh;
          padding: 28px;
        }

        .app-chat-shell {
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(240px, 310px) minmax(0, 1fr) minmax(260px, 340px);
          margin: 0 auto;
          max-width: 1480px;
        }

        .app-chat-header {
          border-bottom: 1px solid var(--chat-border);
          grid-column: 1 / -1;
          padding: 0 0 18px;
        }

        .app-chat-eyebrow,
        .app-chat-label,
        .app-chat-source,
        .app-chat-meta {
          color: var(--chat-muted);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0;
        }

        .app-chat-header h1 {
          color: var(--chat-ink);
          font-size: clamp(2rem, 5vw, 4.7rem);
          font-weight: 760;
          line-height: 0.96;
          margin: 6px 0 8px;
          max-width: 980px;
        }

        .app-chat-header p {
          color: var(--chat-slate);
          font-size: 1rem;
          line-height: 1.55;
          margin: 0;
          max-width: 760px;
        }

        .app-chat-panel {
          background: var(--chat-panel);
          border: 1px solid var(--chat-border);
          border-radius: 8px;
          min-width: 0;
        }

        .app-chat-panel-header {
          border-bottom: 1px solid var(--chat-line);
          display: grid;
          gap: 5px;
          padding: 16px;
        }

        .app-chat-panel-header h2 {
          font-size: 1rem;
          line-height: 1.25;
          margin: 0;
        }

        .app-chat-inbox-list {
          display: grid;
        }

        .app-chat-inbox-item {
          border-bottom: 1px solid var(--chat-line);
          color: inherit;
          display: grid;
          gap: 8px;
          min-width: 0;
          padding: 14px 16px;
          text-decoration: none;
        }

        .app-chat-inbox-item:last-child {
          border-bottom: 0;
        }

        .app-chat-inbox-item[aria-current="page"] {
          background: #edf3ee;
          box-shadow: inset 4px 0 0 var(--chat-green);
        }

        .app-chat-inbox-title {
          align-items: baseline;
          display: flex;
          gap: 8px;
          justify-content: space-between;
          min-width: 0;
        }

        .app-chat-inbox-title strong,
        .app-chat-message strong {
          overflow-wrap: anywhere;
        }

        .app-chat-inbox-item p,
        .app-chat-message p,
        .app-chat-context-value,
        .app-chat-draft-note,
        .app-chat-action p,
        .app-chat-notice p,
        .app-chat-stage p {
          color: var(--chat-slate);
          font-size: 0.92rem;
          line-height: 1.48;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .app-chat-source-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .app-chat-source-chip {
          background: #f7efe7;
          border: 1px solid #e4c7ad;
          border-radius: 999px;
          color: #794715;
          display: inline-flex;
          font-size: 0.74rem;
          font-weight: 700;
          line-height: 1.2;
          padding: 4px 8px;
        }

        .app-chat-proactive-inbox {
          border-top: 1px solid var(--chat-border);
          display: grid;
        }

        .app-chat-proactive-item {
          border-top: 1px solid var(--chat-line);
          color: inherit;
          display: grid;
          gap: 8px;
          padding: 14px 16px;
          text-decoration: none;
        }

        .app-chat-proactive-link {
          align-items: center;
          color: var(--chat-green);
          display: inline-flex;
          font-size: 0.84rem;
          font-weight: 760;
        }

        .app-chat-thread {
          display: grid;
          gap: 16px;
        }

        .app-chat-thread-title {
          display: grid;
          gap: 8px;
          padding: 18px;
        }

        .app-chat-thread-title h2 {
          font-size: clamp(1.6rem, 3vw, 2.4rem);
          line-height: 1.05;
          margin: 0;
        }

        .app-chat-summary {
          border-top: 1px solid var(--chat-line);
          color: var(--chat-slate);
          font-size: 0.98rem;
          line-height: 1.55;
          padding-top: 12px;
        }

        .app-chat-messages,
        .app-chat-context-list,
        .app-chat-actions {
          display: grid;
          gap: 12px;
          padding: 0 18px 18px;
        }

        .app-chat-message {
          border: 1px solid var(--chat-line);
          border-radius: 8px;
          display: grid;
          gap: 7px;
          padding: 14px;
        }

        .app-chat-message:nth-child(even) {
          background: #faf9f5;
        }

        .app-chat-context {
          display: grid;
          gap: 18px;
        }

        .app-chat-context-row {
          border-bottom: 1px solid var(--chat-line);
          display: grid;
          gap: 5px;
          padding-bottom: 12px;
        }

        .app-chat-context-row:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .app-chat-action-zone {
          display: grid;
          gap: 18px;
          grid-column: 2 / -1;
          grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
        }

        .app-chat-draft,
        .app-chat-action,
        .app-chat-notice-body,
        .app-chat-stage-body {
          display: grid;
          gap: 10px;
          padding: 16px;
        }

        .app-chat-draft-text {
          background: #fbfaf6;
          border: 1px solid var(--chat-line);
          border-radius: 8px;
          color: var(--chat-ink);
          font: inherit;
          line-height: 1.5;
          min-height: 138px;
          padding: 12px;
          resize: vertical;
          width: 100%;
        }

        .app-chat-draft-tools {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .app-chat-local-button {
          background: #f4f0e7;
          border: 1px solid var(--chat-border);
          border-radius: 8px;
          color: var(--chat-ink);
          cursor: default;
          display: inline-flex;
          font: inherit;
          font-size: 0.86rem;
          font-weight: 760;
          gap: 6px;
          min-height: 38px;
          padding: 8px 10px;
        }

        .app-chat-local-button span {
          color: var(--chat-muted);
          font-size: 0.76rem;
          font-weight: 700;
        }

        .app-chat-action-link {
          align-items: center;
          background: var(--chat-green);
          border-radius: 8px;
          color: #ffffff;
          display: inline-flex;
          font-size: 0.92rem;
          font-weight: 760;
          justify-content: center;
          min-height: 42px;
          padding: 9px 12px;
          text-decoration: none;
          width: fit-content;
        }

        .app-chat-action-link:focus-visible,
        .app-chat-inbox-item:focus-visible,
        .app-chat-proactive-item:focus-visible,
        .app-chat-draft-text:focus-visible,
        .app-chat-local-button:focus-visible {
          outline: 2px solid var(--chat-blue);
          outline-offset: 2px;
        }

        .app-chat-notice,
        .app-chat-stage {
          grid-column: 2 / -1;
        }

        .app-chat-notice {
          border-color: #9e7f46;
          background: #fffaf0;
        }

        .app-chat-stage {
          border-color: #bf9a53;
          background: #fff8eb;
        }

        .app-chat-stage-list {
          display: grid;
          gap: 7px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .app-chat-notice h2,
        .app-chat-stage h2 {
          font-size: 1.08rem;
          line-height: 1.25;
          margin: 0;
        }

        .app-chat-notice-list,
        .app-chat-stage-list li {
          color: var(--chat-slate);
          font-size: 0.88rem;
          line-height: 1.35;
        }

        .app-chat-notice-list {
          display: grid;
          gap: 7px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        @media (max-width: 1080px) {
          .app-chat-command-center {
            padding: 18px;
          }

          .app-chat-shell,
          .app-chat-action-zone {
            grid-template-columns: 1fr;
          }

          .app-chat-action-zone {
            grid-column: 1;
          }

          .app-chat-notice,
          .app-chat-stage {
            grid-column: 1;
          }
        }
      `}</style>

      <div className="app-chat-shell">
        <header className="app-chat-header">
          <span className="app-chat-eyebrow">Orbit correspondence</span>
          <h1>Relationship inbox</h1>
          <p>
            Review the thread, why it exists, and the next local action before
            anything leaves Orbit.
          </p>
        </header>

        <aside className="app-chat-panel" aria-label="Relationship inbox">
          <div className="app-chat-panel-header">
            <span className="app-chat-label">Inbox</span>
            <h2>Conversations</h2>
          </div>
          <div className="app-chat-inbox-list">
            {model.inbox.map((item) => (
              <a
                aria-current={item.isSelected ? "page" : undefined}
                className="app-chat-inbox-item"
                href={item.href}
                key={item.conversationId}
              >
                <span className="app-chat-inbox-title">
                  <strong>{item.participantName}</strong>
                  <span className="app-chat-meta">{item.unreadLabel}</span>
                </span>
                <span className="app-chat-meta">{item.organization}</span>
                <p>{item.preview}</p>
                <span className="app-chat-source-row">
                  {item.sourceContextLabels.map((label) => (
                    <span className="app-chat-source-chip" key={label}>
                      {label}
                    </span>
                  ))}
                </span>
              </a>
            ))}
          </div>
          {model.proactiveInbox.length > 0 ? (
            <section
              className="app-chat-proactive-inbox"
              data-orbit-proactive-inbox="calendar-one-hour"
              data-side-effects="none"
            >
              <div className="app-chat-panel-header">
                <span className="app-chat-label">Orbit Agent</span>
                <h2>Upcoming from Orbit Agent</h2>
              </div>
              {model.proactiveInbox.map((item) => (
                <a
                  className="app-chat-proactive-item"
                  href={item.href}
                  key={item.messageId}
                >
                  <span className="app-chat-inbox-title">
                    <strong>{item.subject}</strong>
                    <span className="app-chat-meta">{item.timeLabel}</span>
                  </span>
                  <p>{item.peopleContext}</p>
                  <p>{item.preparationPrompt}</p>
                  <span className="app-chat-source-row">
                    <span className="app-chat-source-chip">
                      {item.sourceLabel}
                    </span>
                    <span className="app-chat-source-chip">Local inbox only</span>
                  </span>
                  <span className="app-chat-proactive-link">
                    Open in Orbit Agent
                  </span>
                </a>
              ))}
            </section>
          ) : null}
        </aside>

        <section className="app-chat-panel app-chat-thread">
          <div className="app-chat-thread-title">
            <span className="app-chat-label">Selected correspondence</span>
            <h2>{model.selectedTitle}</h2>
            <span className="app-chat-meta">{model.selectedSubtitle}</span>
            <div className="app-chat-summary">{model.threadSummary}</div>
            <span className="app-chat-source-row">
              {model.sourceContextLabels.map((label) => (
                <span className="app-chat-source-chip" key={label}>
                  {label}
                </span>
              ))}
            </span>
          </div>
          <div className="app-chat-messages">
            {model.threadMessages.map((message) => (
              <article className="app-chat-message" key={message.messageId}>
                <span className="app-chat-meta">
                  {message.senderLabel} · {message.timestampLabel}
                </span>
                <p>{message.body}</p>
                <span className="app-chat-source">
                  Source context: {message.sourceContextLabel}
                </span>
              </article>
            ))}
          </div>
        </section>

        <aside className="app-chat-context">
          <section className="app-chat-panel">
            <div className="app-chat-panel-header">
              <span className="app-chat-label">Why this thread matters</span>
              <h2>Relationship context</h2>
            </div>
            <div className="app-chat-context-list">
              {model.contextItems.map((item) => (
                <div className="app-chat-context-row" key={item.label}>
                  <span className="app-chat-label">{item.label}</span>
                  <span className="app-chat-context-value">{item.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="app-chat-panel">
            <div className="app-chat-panel-header">
              <span className="app-chat-label">Schedule context</span>
              <h2>Schedule context</h2>
            </div>
            <div className="app-chat-context-list">
              {model.scheduleItems.map((item) => (
                <div className="app-chat-context-row" key={item.label}>
                  <span className="app-chat-label">{item.label}</span>
                  <span className="app-chat-context-value">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {model.notice ? (
          <section
            className="app-chat-panel app-chat-notice"
            data-chat-notice={model.notice.code}
            data-side-effects="none"
          >
            <div className="app-chat-panel-header">
              <span className="app-chat-label">Local status</span>
              <h2>{model.notice.title}</h2>
            </div>
            <div className="app-chat-notice-body">
              <p>{model.notice.message}</p>
              <p>{model.notice.recovery}</p>
              <ul className="app-chat-notice-list">
                <li>{model.notice.sendLabel}</li>
                <li>{model.notice.calendarLabel}</li>
                <li>{model.notice.networkLabel}</li>
              </ul>
            </div>
          </section>
        ) : null}

        <section className="app-chat-action-zone" aria-label="Next action">
          <section className="app-chat-panel app-chat-draft">
            <label className="app-chat-label" htmlFor="app-chat-draft-reply">
              Draft reply
            </label>
            <textarea
              aria-label="Draft reply text"
              className="app-chat-draft-text"
              defaultValue={model.draftBody}
              id="app-chat-draft-reply"
            />
            <span className="app-chat-source">{model.draftMeta}</span>
            <div
              aria-label="Local draft controls"
              className="app-chat-draft-tools"
            >
              {model.draftControls.map((control) => (
                <button
                  className="app-chat-local-button"
                  data-local-action={control.action}
                  data-side-effects="none"
                  key={control.action}
                  type="button"
                >
                  {control.label}
                  <span>{control.sideEffectLabel}</span>
                </button>
              ))}
            </div>
            <p className="app-chat-draft-note">
              External send stays off. Draft edits, copied text, and reviewed
              status stay in this local preview.
            </p>
          </section>

          <section className="app-chat-panel app-chat-actions">
            <div className="app-chat-panel-header">
              <span className="app-chat-label">Next action</span>
              <h2>Next action</h2>
            </div>
            {model.nextActions.map((action) => (
              <article className="app-chat-action" key={action.href}>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
                <span className="app-chat-source">
                  Source context: {action.sourceContextLabel}
                </span>
                <a className="app-chat-action-link" href={action.href}>
                  Stage preview
                </a>
              </article>
            ))}
          </section>
        </section>

        {model.stage ? (
          <section
            className="app-chat-panel app-chat-stage"
            data-side-effects="none"
            data-stage-status={model.stage.status}
          >
            <div className="app-chat-panel-header">
              <span className="app-chat-label">Local status</span>
              <h2>Staged preview</h2>
            </div>
            <div className="app-chat-stage-body">
              <p>{model.stage.previewBody}</p>
              <strong>{model.stage.noSideEffectStatement}</strong>
              <ul className="app-chat-stage-list">
                <li>{model.stage.sendLabel}</li>
                <li>{model.stage.calendarLabel}</li>
                <li>{model.stage.networkLabel}</li>
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
