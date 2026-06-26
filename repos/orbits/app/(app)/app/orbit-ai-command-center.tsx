import { createOrbitAiCommandService } from "../../../features/orbit-ai/service-factory";
import { Chip } from "../../../shared/ui/primitives";

type OrbitAiCommandSearchParams = Record<string, string | string[] | undefined>;

export interface OrbitAiCommandCenterProps {
  searchParams?: OrbitAiCommandSearchParams;
}

function readSearchParam(
  searchParams: OrbitAiCommandSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

const orbitAiCommandStyles = `
.orbit-ai-command-center,
.orbit-ai-chat,
.orbit-ai-side-stage,
.orbit-ai-command-center .orbit-ai-stage-grid,
.orbit-ai-stage-grid,
.orbit-ai-stage-row,
.orbit-ai-command-row,
.orbit-ai-chat-input,
.orbit-ai-orbit-panel,
.orbit-ai-orbit-stage,
.orbit-ai-task-panel,
.orbit-ai-action-bar {
  min-width: 0;
}

.orbit-ai-screen-reader-only {
  clip: rect(0 0 0 0);
  border: 0;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

.orbit-ai-command-center {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 247, 245, 0.92) 48%, rgba(246, 246, 241, 0.96)),
    var(--orbit-color-surface);
  border: 1px solid rgba(23, 33, 31, 0.12);
  border-radius: 10px;
  box-shadow: 0 26px 60px rgba(23, 33, 31, 0.14);
  display: grid;
  grid-template-columns: minmax(min(100%, 360px), 0.92fr) minmax(min(100%, 420px), 1.08fr);
  min-height: calc(100vh - 160px);
  overflow: hidden;
}

.orbit-ai-chat {
  align-content: stretch;
  background: rgba(255, 255, 255, 0.84);
  border-right: 1px solid rgba(23, 33, 31, 0.12);
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.orbit-ai-chat-header,
.orbit-ai-chat-feed,
.orbit-ai-command-dock {
  padding: var(--orbit-space-lg);
}

.orbit-ai-chat-header {
  border-bottom: 1px solid rgba(23, 33, 31, 0.1);
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-ai-chat-topline {
  align-items: center;
  display: flex;
  gap: var(--orbit-space-sm);
  justify-content: space-between;
}

.orbit-ai-live-row {
  align-items: center;
  color: var(--orbit-color-primary);
  display: flex;
  font-family: var(--orbit-font-mono);
  font-size: 0.76rem;
  font-weight: 760;
  gap: var(--orbit-space-xs);
  letter-spacing: 0;
  text-transform: uppercase;
}

.orbit-ai-language-switch {
  display: inline-flex;
  gap: 6px;
}

.orbit-ai-language-link {
  border: 1px solid rgba(23, 33, 31, 0.14);
  border-radius: 999px;
  color: var(--orbit-color-muted);
  font-size: 0.76rem;
  font-weight: 720;
  line-height: 1.2;
  padding: 5px 8px;
  text-decoration: none;
}

.orbit-ai-language-link[aria-current="true"] {
  background: #17211f;
  color: var(--orbit-color-text);
  color: #ffffff;
}

.orbit-ai-live-dot {
  background: var(--orbit-color-success, #166534);
  border-radius: 999px;
  display: inline-block;
  height: 9px;
  width: 9px;
}

.orbit-ai-chat h2,
.orbit-ai-stage-heading h2,
.orbit-ai-orbit-copy strong {
  color: var(--orbit-color-text);
  font-family: var(--orbit-font-display);
  letter-spacing: 0;
  margin: 0;
}

.orbit-ai-chat h2 {
  font-size: clamp(2rem, 4.8vw, 3.4rem);
  line-height: 1.04;
}

.orbit-ai-chat-header p,
.orbit-ai-message p,
.orbit-ai-stage-heading p,
.orbit-ai-stage-row p,
.orbit-ai-orbit-copy p,
.orbit-ai-function-note {
  color: var(--orbit-color-muted);
  line-height: 1.55;
  margin: 0;
}

.orbit-ai-chat-feed {
  align-content: start;
  display: grid;
  gap: var(--orbit-space-sm);
}

.orbit-ai-message {
  border-radius: 10px;
  display: grid;
  gap: var(--orbit-space-xs);
  max-width: 34rem;
  padding: 14px 16px;
}

.orbit-ai-message-user {
  justify-self: end;
  background: #17211f;
  color: #ffffff;
}

.orbit-ai-message-user p,
.orbit-ai-message-user span {
  color: #ffffff;
}

.orbit-ai-message-assistant {
  background: transparent;
  border-left: 3px solid var(--orbit-color-primary);
  border-radius: 0;
  justify-self: start;
  padding-left: 14px;
}

.orbit-ai-message span,
.orbit-ai-command-label,
.orbit-ai-stage-row span,
.orbit-ai-orbit-copy span {
  color: var(--orbit-color-muted);
  font-family: var(--orbit-font-mono);
  font-size: 0.74rem;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1.35;
}

.orbit-ai-command-dock {
  background: rgba(249, 251, 250, 0.92);
  border-top: 1px solid rgba(23, 33, 31, 0.1);
  display: grid;
  gap: var(--orbit-space-sm);
}

.orbit-ai-command-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-sm);
}

.orbit-ai-command-center .orbit-ai-command-link,
.orbit-ai-stage-action {
  align-items: center;
  border-radius: var(--orbit-radius-control);
  display: inline-flex;
  font-weight: 760;
  justify-content: center;
  line-height: 1.25;
  min-height: 40px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 8px 12px;
  text-align: center;
  text-decoration: none;
  white-space: normal;
}

.orbit-ai-command-link {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(23, 33, 31, 0.14);
  color: #17211f;
}

.orbit-ai-command-link:hover {
  border-color: var(--orbit-color-primary);
  color: var(--orbit-color-primary);
}

.orbit-ai-chat-input {
  align-items: center;
  background: var(--orbit-color-surface);
  border: 1px solid rgba(23, 33, 31, 0.18);
  border-radius: 999px;
  display: flex;
  gap: var(--orbit-space-sm);
  padding: 7px 8px 7px 14px;
}

.orbit-ai-chat-input input {
  background: transparent;
  border: 0;
  min-height: 42px;
  padding-inline: 0;
}

.orbit-ai-chat-input button {
  background: #17211f;
  border-color: #17211f;
  border-radius: 999px;
  color: var(--orbit-color-primary-text);
  min-width: 84px;
}

.orbit-ai-side-stage {
  align-content: start;
  display: grid;
  gap: 14px;
  grid-template-rows: auto 1fr;
  padding: 14px;
}

.orbit-ai-orbit-panel {
  align-items: center;
  background:
    linear-gradient(135deg, rgba(23, 33, 31, 0.98), rgba(25, 68, 68, 0.96));
  border-radius: 10px;
  color: #ffffff;
  display: grid;
  gap: var(--orbit-space-lg);
  grid-template-columns: minmax(0, 0.68fr) minmax(240px, 1fr);
  overflow: hidden;
  padding: 18px;
}

.orbit-ai-orbit-copy {
  display: grid;
  gap: var(--orbit-space-sm);
}

.orbit-ai-orbit-copy strong {
  color: #ffffff;
  font-size: clamp(1.7rem, 3.4vw, 2.8rem);
  line-height: 1.08;
}

.orbit-ai-orbit-copy p,
.orbit-ai-orbit-copy span {
  color: rgba(255, 255, 255, 0.72);
}

.orbit-ai-orbit-stage {
  aspect-ratio: 1;
  margin: 0 auto;
  max-width: 320px;
  position: relative;
  width: min(100%, 320px);
}

.orbit-ai-ring {
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  inset: var(--ring-inset);
  position: absolute;
}

.orbit-ai-ring-1 { --ring-inset: 34%; }
.orbit-ai-ring-2 { --ring-inset: 21%; border-color: rgba(232, 242, 240, 0.2); }
.orbit-ai-ring-3 { --ring-inset: 8%; border-color: rgba(197, 181, 151, 0.32); }

.orbit-ai-source-line {
  background: rgba(255, 255, 255, 0.18);
  height: 1px;
  left: 50%;
  position: absolute;
  top: 50%;
  transform: rotate(var(--line-rotation));
  transform-origin: left center;
  width: 38%;
}

.orbit-ai-source-line-1 { --line-rotation: -32deg; }
.orbit-ai-source-line-2 { --line-rotation: 8deg; }
.orbit-ai-source-line-3 { --line-rotation: 52deg; }
.orbit-ai-source-line-4 { --line-rotation: 168deg; width: 34%; }

.orbit-ai-center-node,
.orbit-ai-contact-node {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-family: var(--orbit-font-mono);
  font-weight: 800;
  justify-content: center;
  position: absolute;
}

.orbit-ai-center-node {
  background: #ffffff;
  color: #17211f;
  height: 72px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 72px;
}

.orbit-ai-contact-node {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.58);
  color: #17211f;
  height: 44px;
  left: var(--node-x);
  top: var(--node-y);
  transform: translate(-50%, -50%);
  width: 44px;
}

.orbit-ai-task-panel {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(23, 33, 31, 0.1);
  border-radius: 10px;
  display: grid;
  gap: var(--orbit-space-md);
  padding: 16px;
}

.orbit-ai-stage-heading {
  display: grid;
  gap: var(--orbit-space-xs);
}

.orbit-ai-stage-heading h2 {
  font-size: clamp(1.35rem, 3vw, 1.95rem);
  line-height: 1.1;
}

.orbit-ai-stage-grid {
  display: grid;
  gap: 0;
}

.orbit-ai-status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.orbit-ai-status-strip span {
  background: rgba(232, 242, 240, 0.82);
  border: 1px solid rgba(21, 94, 117, 0.18);
  border-radius: 999px;
  color: var(--orbit-color-primary);
  font-size: 0.78rem;
  font-weight: 760;
  padding: 5px 9px;
}

.orbit-ai-stage-row {
  align-items: start;
  border-top: 1px solid rgba(23, 33, 31, 0.1);
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 13px 0;
}

.orbit-ai-stage-row h3 {
  color: var(--orbit-color-text);
  font-size: 1rem;
  line-height: 1.25;
  margin: 0;
}

.orbit-ai-stage-index {
  align-items: center;
  background: rgba(23, 33, 31, 0.06);
  border-radius: 999px;
  color: var(--orbit-color-text);
  display: inline-flex;
  font-family: var(--orbit-font-mono);
  font-size: 0.74rem;
  font-weight: 820;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.orbit-ai-stage-action {
  background: transparent;
  border: 1px solid rgba(23, 33, 31, 0.18);
  color: #17211f;
  min-height: 36px;
  width: fit-content;
}

.orbit-ai-function-note {
  border-left: 3px solid rgba(21, 94, 117, 0.28);
  padding-left: var(--orbit-space-sm);
}

.orbit-ai-action-bar {
  align-items: center;
  background: #17211f;
  border-radius: 10px;
  color: #ffffff;
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 12px;
}

.orbit-ai-action-bar p {
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.45;
  margin: 0;
}

.orbit-ai-action-bar strong {
  color: #ffffff;
  display: block;
  line-height: 1.3;
}

.orbit-ai-action-primary {
  background: #ffffff;
  border: 1px solid #ffffff;
  border-radius: 999px;
  color: #17211f;
  display: inline-flex;
  font-weight: 800;
  justify-content: center;
  min-height: 40px;
  padding: 9px 14px;
  text-align: center;
  text-decoration: none;
  white-space: normal;
}

@media (max-width: 900px) {
  .orbit-ai-command-center,
  .orbit-ai-orbit-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .orbit-ai-chat {
    border-right: 0;
    border-bottom: 1px solid var(--orbit-color-border);
  }

  .orbit-ai-stage-action,
  .orbit-ai-command-link {
    width: 100%;
  }

  .orbit-ai-stage-row,
  .orbit-ai-action-bar {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

const orbitNodePositions = [
  { x: "70%", y: "22%" },
  { x: "83%", y: "58%" },
  { x: "33%", y: "78%" },
  { x: "18%", y: "36%" },
] as const;

const orbitAiUiCopy = {
  en: {
    actionBarBody: "No external action runs until you review the source and confirm the next step.",
    actionBarTitle: "Reviewed preview",
    assistantTimestamp: "Orbit AI - now",
    chatAriaLabel: "Orbit AI chat",
    commandLabel: "Suggested commands",
    conversationAriaLabel: "Orbit AI conversation",
    functionNote:
      "Function panels connect chat to events, people, follow-ups, conversations, health, and next moves while keeping every action in reviewed preview.",
    headerBody:
      "Start with a goal. Orbit opens the right function panel beside the conversation so you can inspect sources and act from the same place.",
    heading: "Ask Orbit AI",
    inputLabel: "Ask Orbit",
    inputPlaceholder: "Ask Orbit...",
    languageAriaLabel: "Language",
    orbitAriaLabel: "Live relationship orbit",
    orbitBody:
      "The orbit shows who can be pulled into the current task while the panel keeps the concrete workflow visible.",
    orbitLabel: "Live relationship orbit",
    orbitMetric: "142 nodes connected",
    sendLabel: "Send",
    sideStageAriaLabel: "Orbit functional side stage",
    sourceDetailsLabel: "Orbit AI source details",
    sourceSummary: "Source details",
    stageEyebrow: "Function panels",
    statusEvidence: "Source linked",
    statusHeld: "Needs review",
    statusPreview: "No external action",
    taskPanelAriaLabel: "Current task panel",
  },
  zh: {
    actionBarBody: "确认来源和下一步之前，Orbit 不会执行任何外部动作。",
    actionBarTitle: "预览待确认",
    assistantTimestamp: "Orbit AI - 现在",
    chatAriaLabel: "Orbit AI 对话",
    commandLabel: "可以直接问",
    conversationAriaLabel: "Orbit AI 对话记录",
    functionNote:
      "功能面板会把聊天接到活动、人脉、跟进、对话、关系健康和下一步；所有动作先停在预览里。",
    headerBody:
      "先说目标。Orbit 会把合适的功能面板打开在旁边，来源和下一步放在同一屏。",
    heading: "问 Orbit AI",
    inputLabel: "问 Orbit",
    inputPlaceholder: "例如：帮我找下周该见的人",
    languageAriaLabel: "语言",
    orbitAriaLabel: "实时关系轨道",
    orbitBody:
      "关系轨道显示哪些人能被拉进当前任务，右侧面板保留具体工作流。",
    orbitLabel: "实时关系轨道",
    orbitMetric: "142 个关系节点",
    sendLabel: "发送",
    sideStageAriaLabel: "Orbit 功能侧栏",
    sourceDetailsLabel: "Orbit AI 来源详情",
    sourceSummary: "来源详情",
    stageEyebrow: "功能面板",
    statusEvidence: "来源已绑定",
    statusHeld: "待确认",
    statusPreview: "未执行外部动作",
    taskPanelAriaLabel: "当前任务面板",
  },
} as const;

export function OrbitAiCommandCenter({
  searchParams,
}: OrbitAiCommandCenterProps = {}) {
  const service = createOrbitAiCommandService();
  const result = service.getCommandCenter({
    language: readSearchParam(searchParams, "lang"),
    panel: readSearchParam(searchParams, "panel"),
    prompt: readSearchParam(searchParams, "prompt"),
  });
  const data = result.data;
  const copy = orbitAiUiCopy[data.language];
  const primaryStageItem = data.stageItems[0];

  return (
    <div
      className="orbit-ai-command-center"
      data-orbit-ai-command-center="true"
      data-orbit-ai-layout="relationship-console"
      lang={data.language === "zh" ? "zh-Hans" : "en"}
    >
      <style>{orbitAiCommandStyles}</style>
      <section aria-label={copy.chatAriaLabel} className="orbit-ai-chat">
        <header className="orbit-ai-chat-header">
          <div className="orbit-ai-chat-topline">
            <div className="orbit-ai-live-row">
              <span className="orbit-ai-live-dot" />
              Orbit AI
            </div>
            <nav aria-label={copy.languageAriaLabel} className="orbit-ai-language-switch">
              {data.languageOptions.map((option) => (
                <a
                  aria-current={option.active ? "true" : undefined}
                  className="orbit-ai-language-link"
                  href={option.href}
                  key={option.language}
                >
                  {option.label}
                </a>
              ))}
            </nav>
          </div>
          <h2>{copy.heading}</h2>
          <p>{copy.headerBody}</p>
        </header>

        <div
          aria-label={copy.conversationAriaLabel}
          className="orbit-ai-chat-feed"
          role="log"
        >
          <article className="orbit-ai-message orbit-ai-message-user">
            <p>{data.prompt}</p>
            <span>10:42 AM</span>
          </article>
          <article className="orbit-ai-message orbit-ai-message-assistant">
            <p>{data.assistantMessage}</p>
            <span>{copy.assistantTimestamp}</span>
          </article>
        </div>

        <div className="orbit-ai-command-dock">
          <span className="orbit-ai-command-label">{copy.commandLabel}</span>
          <nav aria-label={copy.commandLabel} className="orbit-ai-command-row">
            {data.commandLinks.map((link) => (
              <a
                className="orbit-ai-command-link"
                href={link.href}
                key={link.panel}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <form action="/app" className="orbit-ai-chat-input" method="get">
            <label className="orbit-ai-screen-reader-only" htmlFor="orbit-ai-prompt">
              {copy.inputLabel}
            </label>
            {data.language === "en" && <input name="lang" type="hidden" value="en" />}
            <input
              id="orbit-ai-prompt"
              name="prompt"
              placeholder={copy.inputPlaceholder}
              type="search"
            />
            <button type="submit">{copy.sendLabel}</button>
          </form>
        </div>
      </section>

      <aside aria-label={copy.sideStageAriaLabel} className="orbit-ai-side-stage">
        <section
          aria-label={copy.orbitAriaLabel}
          className="orbit-ai-orbit-panel"
          data-visual-signature="relationship-field"
        >
          <div className="orbit-ai-orbit-copy">
            <span>{copy.orbitLabel}</span>
            <strong>{copy.orbitMetric}</strong>
            <p>{copy.orbitBody}</p>
          </div>
          <div className="orbit-ai-orbit-stage" aria-hidden="true">
            <span className="orbit-ai-ring orbit-ai-ring-1" />
            <span className="orbit-ai-ring orbit-ai-ring-2" />
            <span className="orbit-ai-ring orbit-ai-ring-3" />
            <span className="orbit-ai-source-line orbit-ai-source-line-1" />
            <span className="orbit-ai-source-line orbit-ai-source-line-2" />
            <span className="orbit-ai-source-line orbit-ai-source-line-3" />
            <span className="orbit-ai-source-line orbit-ai-source-line-4" />
            <span className="orbit-ai-center-node">OD</span>
            {data.orbitContacts.map((contact, index) => (
              <span
                className="orbit-ai-contact-node"
                key={contact.label}
                style={{
                  "--node-x": orbitNodePositions[index]?.x ?? "50%",
                  "--node-y": orbitNodePositions[index]?.y ?? "50%",
                } as Record<string, string>}
                title={contact.label}
              >
                {contact.initials}
              </span>
            ))}
          </div>
        </section>

        <section
          aria-label={copy.taskPanelAriaLabel}
          className="orbit-ai-task-panel"
          data-side-effects="none"
        >
          <header className="orbit-ai-stage-heading">
            <p className="surface-eyebrow">{copy.stageEyebrow}</p>
            <h2>{data.stageTitle}</h2>
            <p>{data.stageSubtitle}</p>
          </header>
          <div className="orbit-ai-status-strip">
            <span>{copy.statusHeld}</span>
            <span>{copy.statusEvidence}</span>
            <span>{copy.statusPreview}</span>
          </div>
          <div className="orbit-ai-stage-grid">
            {data.stageItems.map((item, index) => (
              <article className="orbit-ai-stage-row" key={`${data.panel}:${item.title}`}>
                <span className="orbit-ai-stage-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <a className="orbit-ai-stage-action" href={item.href}>
                  {item.actionLabel}
                </a>
              </article>
            ))}
          </div>
          <p className="orbit-ai-function-note">{copy.functionNote}</p>
          <details aria-label={copy.sourceDetailsLabel}>
            <summary>{copy.sourceSummary}</summary>
            <div className="chip-row">
              {data.evidenceIds.slice(0, 5).map((evidenceId) => (
                <Chip key={evidenceId} tone="evidence">
                  {evidenceId}
                </Chip>
              ))}
            </div>
          </details>
          <footer className="orbit-ai-action-bar" data-action-bar="reviewed-preview">
            <p>
              <strong>{copy.actionBarTitle}</strong>
              {copy.actionBarBody}
            </p>
            <a
              className="orbit-ai-action-primary"
              href={primaryStageItem?.href ?? data.stageCtaHref}
            >
              {primaryStageItem?.actionLabel ?? data.stageCtaLabel}
            </a>
          </footer>
        </section>
      </aside>
    </div>
  );
}
