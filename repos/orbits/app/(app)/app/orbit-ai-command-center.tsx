import type {
  AppOrbitAiPanel,
  OrbitAiCommandSearchParams,
} from "./orbit-ai-route-view-model";
import { loadOrbitAiCommandViewModel } from "./orbit-ai-route-view-model";
import { bilingualText } from "../../../shared/ui/bilingual";
import { Chip } from "../../../shared/ui/primitives";

// OrbitAiCommandCenter 是旧 Orbit AI command 面板的纯展示组件。
// 真实 Chat Agent 对话在 /app/chat 的 Orbit Agent 区域和 conversation service 中处理；
// 这里只展示导航、命令建议、来源证据和“待确认预览”状态。
export interface OrbitAiCommandCenterProps {
  searchParams?: OrbitAiCommandSearchParams;
}

// 这段 CSS 只属于 command center，避免全局 app shell 样式污染其它页面。
const orbitAiCommandStyles = `
.orbit-ai-command-center {
  --orbit-ai-dark: #16181d;
  --orbit-ai-ink: #16171a;
  --orbit-ai-line: #24262c;
  --orbit-ai-teal: #6fe3c0;
  --orbit-ai-teal-deep: #0e8b6b;
  --orbit-ai-panel: #ffffff;
  --orbit-ai-canvas: #f3f4f6;
  --orbit-ai-canvas-strong: #ecedf0;
  --orbit-ai-copy: #2c2e34;
  --orbit-ai-muted: #6b6f78;
  --orbit-ai-warning: #c0863a;
  --orbit-ai-radius: 8px;
  background: var(--orbit-ai-dark);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.36);
  color: #f3f4f6;
  display: grid;
  grid-template-columns: 76px minmax(min(100%, 390px), 0.82fr) minmax(min(100%, 520px), 1.18fr);
  min-height: calc(100vh - 24px);
  overflow: hidden;
}

.orbit-ai-command-center,
.orbit-ai-rail,
.orbit-ai-nav,
.orbit-ai-chat,
.orbit-ai-side-stage,
.orbit-ai-stage-grid,
.orbit-ai-stage-row,
.orbit-ai-command-row,
.orbit-ai-chat-input,
.orbit-ai-orbit-panel,
.orbit-ai-orbit-stage,
.orbit-ai-task-panel,
.orbit-ai-action-bar,
.orbit-ai-rail-foot {
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

.orbit-ai-rail {
  align-content: start;
  background: var(--orbit-ai-ink);
  border-right: 1px solid var(--orbit-ai-line);
  display: grid;
  gap: 16px;
  grid-template-rows: auto 1fr auto;
  padding: 13px 8px;
}

.orbit-ai-rail-brand {
  align-items: center;
  background: rgba(111, 227, 192, 0.12);
  border: 1px solid rgba(111, 227, 192, 0.2);
  border-radius: var(--orbit-ai-radius);
  color: var(--orbit-ai-teal);
  display: inline-flex;
  font-family: var(--orbit-font-mono);
  font-size: 0.78rem;
  font-weight: 820;
  height: 46px;
  justify-content: center;
  line-height: 1;
  text-decoration: none;
  width: 60px;
}

.orbit-ai-nav {
  align-content: start;
  display: grid;
  gap: 8px;
}

.orbit-ai-nav-link {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--orbit-ai-radius);
  color: rgba(255, 255, 255, 0.52);
  display: inline-flex;
  flex-direction: column;
  font-size: 0.7rem;
  font-weight: 650;
  gap: 5px;
  justify-content: center;
  min-height: 58px;
  padding: 7px 3px;
  text-align: center;
  text-decoration: none;
  width: 60px;
}

.orbit-ai-nav-link svg {
  flex: none;
}

.orbit-ai-nav-link:hover,
.orbit-ai-nav-link[aria-current="page"] {
  background: rgba(111, 227, 192, 0.12);
  border-color: rgba(111, 227, 192, 0.16);
  color: var(--orbit-ai-teal);
}

.orbit-ai-rail-foot {
  align-items: center;
  color: rgba(255, 255, 255, 0.58);
  display: grid;
  font-size: 0.7rem;
  gap: 7px;
  justify-items: center;
  line-height: 1.35;
  margin: 0;
  text-align: center;
}

.orbit-ai-rail-foot span:first-child {
  background: var(--orbit-ai-warning);
  border-radius: 999px;
  box-shadow: 0 0 0 4px rgba(192, 134, 58, 0.16);
  height: 7px;
  width: 7px;
}

.orbit-ai-chat {
  align-content: stretch;
  background: #ffffff;
  border-right: 1px solid var(--orbit-ai-canvas-strong);
  color: var(--orbit-ai-copy);
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.orbit-ai-chat-header,
.orbit-ai-chat-feed,
.orbit-ai-command-dock {
  padding: var(--orbit-space-lg);
}

.orbit-ai-chat-header {
  border-bottom: 1px solid var(--orbit-ai-canvas-strong);
  display: grid;
  gap: 16px;
}

.orbit-ai-chat-topline {
  align-items: center;
  display: flex;
  gap: var(--orbit-space-sm);
  justify-content: space-between;
}

.orbit-ai-live-row {
  align-items: center;
  color: var(--orbit-ai-teal-deep);
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
  border: 1px solid #e6e7eb;
  border-radius: 999px;
  color: #82868f;
  font-size: 0.76rem;
  font-weight: 720;
  line-height: 1.2;
  padding: 5px 8px;
  text-decoration: none;
}

.orbit-ai-language-link[aria-current="true"] {
  background: var(--orbit-ai-dark);
  color: #ffffff;
}

.orbit-ai-live-dot {
  background: var(--orbit-ai-teal);
  border-radius: 999px;
  display: inline-block;
  height: 9px;
  width: 9px;
}

.orbit-ai-chat h2,
.orbit-ai-stage-heading h2,
.orbit-ai-orbit-copy strong {
  color: var(--orbit-ai-copy);
  font-family: var(--orbit-font-display);
  letter-spacing: 0;
  margin: 0;
}

.orbit-ai-chat h2 {
  font-size: clamp(1.85rem, 4vw, 2.45rem);
  line-height: 1.18;
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
  border-radius: 14px;
  display: grid;
  gap: var(--orbit-space-xs);
  max-width: 34rem;
  padding: 14px 16px;
}

.orbit-ai-message-user {
  justify-self: end;
  background: var(--orbit-ai-dark);
  border-radius: 14px 14px 4px 14px;
  color: #f2f4f1;
}

.orbit-ai-message-user p,
.orbit-ai-message-user span {
  color: #ffffff;
}

.orbit-ai-message-assistant {
  background: #ffffff;
  border: 1px solid var(--orbit-ai-canvas-strong);
  border-radius: 14px 14px 14px 4px;
  box-shadow: 0 1px 2px rgba(17, 18, 34, 0.04);
  justify-self: start;
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
  background: #fafafb;
  border-top: 1px solid var(--orbit-ai-canvas-strong);
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
  background: #ffffff;
  border: 1px solid #e4e5e9;
  color: #3b3e45;
}

.orbit-ai-command-link:hover {
  border-color: var(--orbit-ai-teal-deep);
  color: var(--orbit-ai-teal-deep);
}

.orbit-ai-chat-input {
  align-items: center;
  background: #ffffff;
  border: 1px solid #d4d6dc;
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
  background: var(--orbit-ai-dark);
  border-color: var(--orbit-ai-dark);
  border-radius: 999px;
  color: var(--orbit-color-primary-text);
  min-width: 84px;
}

.orbit-ai-side-stage {
  align-content: start;
  background: var(--orbit-ai-canvas);
  color: var(--orbit-ai-copy);
  display: grid;
  gap: 13px;
  grid-template-rows: auto 1fr;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 16px;
}

.orbit-ai-orbit-panel {
  align-items: center;
  background: #16181d;
  border: 1px solid #24262c;
  border-radius: var(--orbit-ai-radius);
  color: #f3f4f6;
  display: grid;
  gap: var(--orbit-space-lg);
  grid-template-columns: minmax(0, 0.72fr) minmax(220px, 1fr);
  overflow: hidden;
  padding: 18px;
}

.orbit-ai-orbit-copy {
  display: grid;
  gap: var(--orbit-space-sm);
}

.orbit-ai-orbit-copy strong {
  color: #ffffff;
  font-size: clamp(1.55rem, 3vw, 2.45rem);
  line-height: 1.08;
}

.orbit-ai-orbit-copy p,
.orbit-ai-orbit-copy span {
  color: rgba(255, 255, 255, 0.72);
}

.orbit-ai-orbit-stage {
  aspect-ratio: 1;
  margin: 0 auto;
  max-width: 280px;
  position: relative;
  width: min(100%, 280px);
}

.orbit-ai-ring {
  border: 1px solid rgba(111, 227, 192, 0.24);
  border-radius: 999px;
  inset: var(--ring-inset);
  position: absolute;
}

.orbit-ai-ring-1 { --ring-inset: 34%; }
.orbit-ai-ring-2 { --ring-inset: 21%; border-color: rgba(95, 224, 192, 0.2); }
.orbit-ai-ring-3 { --ring-inset: 8%; border-color: rgba(79, 164, 126, 0.34); }

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
  background: var(--orbit-ai-teal);
  box-shadow: 0 0 36px rgba(111, 227, 192, 0.36);
  color: #10221d;
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
  background: #ffffff;
  border: 1px solid var(--orbit-ai-canvas-strong);
  border-radius: var(--orbit-ai-radius);
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
  background: #e7f5ef;
  border: 1px solid rgba(14, 139, 107, 0.16);
  border-radius: 999px;
  color: #0e8b6b;
  font-size: 0.78rem;
  font-weight: 760;
  padding: 5px 9px;
}

.orbit-ai-stage-row {
  align-items: start;
  border-top: 1px solid var(--orbit-ai-canvas-strong);
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 13px 0;
}

.orbit-ai-stage-row h3 {
  color: var(--orbit-ai-copy);
  font-size: 1rem;
  line-height: 1.25;
  margin: 0;
}

.orbit-ai-stage-index {
  align-items: center;
  background: #f1f2f4;
  border-radius: 999px;
  color: var(--orbit-ai-copy);
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
  border: 1px solid #d4d6dc;
  color: var(--orbit-ai-copy);
  min-height: 36px;
  width: fit-content;
}

.orbit-ai-function-note {
  border-left: 3px solid rgba(14, 139, 107, 0.24);
  padding-left: var(--orbit-space-sm);
}

.orbit-ai-action-bar {
  align-items: center;
  background: var(--orbit-ai-dark);
  border-radius: var(--orbit-ai-radius);
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
  color: var(--orbit-ai-dark);
  display: inline-flex;
  font-weight: 800;
  justify-content: center;
  min-height: 40px;
  padding: 9px 14px;
  text-align: center;
  text-decoration: none;
  white-space: normal;
}

@media (max-width: 980px) {
  .orbit-ai-command-center {
    grid-template-columns: minmax(0, 1fr);
  }

  .orbit-ai-rail {
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: auto;
    overflow-x: auto;
  }

  .orbit-ai-nav {
    display: flex;
    gap: 7px;
    overflow-x: auto;
  }

  .orbit-ai-rail-foot {
    min-width: 92px;
  }

  .orbit-ai-orbit-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .orbit-ai-chat {
    border-right: 0;
    border-bottom: 1px solid var(--orbit-ai-canvas-strong);
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

@media (max-width: 620px) {
  .orbit-ai-command-center {
    border-radius: 0;
    min-height: 100vh;
  }

  .orbit-ai-chat-header,
  .orbit-ai-chat-feed,
  .orbit-ai-command-dock,
  .orbit-ai-side-stage {
    padding: 16px;
  }

  .orbit-ai-rail {
    padding-inline: 10px;
  }

  .orbit-ai-nav-link {
    min-width: 58px;
  }
}
`;

const orbitNodePositions = [
  { x: "70%", y: "22%" },
  { x: "83%", y: "58%" },
  { x: "33%", y: "78%" },
  { x: "18%", y: "36%" },
] as const;

// rail 中的 panel 顺序是产品信息架构；不是 service 调用顺序。
const orbitAiNavPanels = [
  "home",
  "people",
  "events",
  "schedule",
  "followups",
  "dashboard",
  "agent",
] as const satisfies readonly AppOrbitAiPanel[];

const orbitAiNavLabels: Record<
  "zh" | "en",
  Record<(typeof orbitAiNavPanels)[number], string>
> = {
  en: {
    agent: "Review",
    dashboard: "Health",
    events: "Events",
    followups: "Follow",
    home: "Orbit AI",
    people: "People",
    schedule: "Schedule",
  },
  zh: {
    agent: "下一步",
    dashboard: "健康",
    events: "活动",
    followups: "跟进",
    home: "Orbit AI",
    people: "人脉",
    schedule: "日程",
  },
};

// 根据 panel/lang 生成同页导航 URL，保持 command center 是 search-param 驱动。
function orbitPanelHref(language: "zh" | "en", panel: AppOrbitAiPanel): string {
  const params = new URLSearchParams();

  if (panel !== "home") {
    params.set("panel", panel);
  }

  if (language === "en") {
    params.set("lang", "en");
  }

  const queryString = params.toString();

  return queryString ? `/app?${queryString}` : "/app";
}

// 这里用内联 SVG 保持 command center 独立；其它页面可继续使用共享 icon 体系。
function OrbitAiNavIcon({ panel }: { panel: AppOrbitAiPanel }) {
  if (panel === "events") {
    return (
      <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
        <rect height="15" rx="2" stroke="currentColor" strokeWidth="1.7" width="17" x="3.5" y="5" />
        <path d="M7 3v4M17 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (panel === "people") {
    return (
      <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
        <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.8 20a5.4 5.4 0 0 1 10.4 0M16.4 10.4a2.6 2.6 0 1 0 0-5.2M17.4 14.6c1.9.5 3.1 1.9 3.6 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (panel === "schedule") {
    return (
      <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
        <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="4.5" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <circle cx="8" cy="13.5" fill="currentColor" r="1.1" />
        <circle cx="12" cy="13.5" fill="currentColor" r="1.1" />
      </svg>
    );
  }

  if (panel === "followups") {
    return (
      <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
        <path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M8 9h8M8 12.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (panel === "dashboard") {
    return (
      <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
        <path d="M4 17l4.3-4.3 3.2 3.2L19.5 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M4 20h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (panel === "agent") {
    return (
      <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
        <path d="m5 12 4 4 10-10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M4 20h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
      <ellipse cx="12" cy="12" rx="8" ry="3.8" stroke="currentColor" strokeWidth="1.5" transform="rotate(30 12 12)" />
      <ellipse cx="12" cy="12" rx="8" ry="3.8" stroke="currentColor" strokeWidth="1.5" transform="rotate(-32 12 12)" />
      <circle cx="12" cy="12" fill="currentColor" r="2.4" />
    </svg>
  );
}

const orbitAiUiCopy = {
  en: {
    actionBarBody: "No external action runs until you review the source and confirm the next step.",
    actionBarTitle: "Reviewed preview",
    assistantTimestamp: "Orbit AI - now",
    chatAriaLabel: "Orbit AI chat",
    commandLabel: "Suggested commands",
    conversationAriaLabel: "Orbit AI conversation",
    functionNote:
      "Function panels connect chat to events, people, schedule, follow-ups, conversations, health, and next moves while keeping every action in reviewed preview.",
    headerBody:
      "Start with a goal. Orbit opens the right function panel beside the conversation so you can inspect sources and act from the same place.",
    heading: "Ask Orbit AI",
    inputLabel: "Ask Orbit",
    inputPlaceholder: "Ask Orbit...",
    languageAriaLabel: "Language",
    navigationAriaLabel: "Orbit AI navigation",
    orbitAriaLabel: "Live relationship orbit",
    orbitBody:
      "The orbit shows who can be pulled into the current task while the panel keeps the concrete workflow visible.",
    orbitLabel: "Live relationship orbit",
    orbitMetric: "142 nodes connected",
    railSafety: "Review only",
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
      "功能面板会把聊天接到活动、人脉、日程、跟进、对话、关系健康和下一步；所有动作先停在预览里。",
    headerBody:
      "先说目标。Orbit 会把合适的功能面板打开在旁边，来源和下一步放在同一屏。",
    heading: "问 Orbit AI",
    inputLabel: "问 Orbit",
    inputPlaceholder: "例如：帮我找下周该见的人",
    languageAriaLabel: "语言",
    navigationAriaLabel: "Orbit AI 导航",
    orbitAriaLabel: "实时关系轨道",
    orbitBody:
      "关系轨道显示哪些人能被拉进当前任务，右侧面板保留具体工作流。",
    orbitLabel: "实时关系轨道",
    orbitMetric: "142 个关系节点",
    railSafety: "确认后才执行",
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

type OrbitAiUiCopy = Record<keyof typeof orbitAiUiCopy.en, string>;

// 中文主界面仍保留英文 fallback，便于中英双语审核同一屏 UI 文案。
const orbitAiEnglishStageTitles: Record<AppOrbitAiPanel, string> = {
  agent: "Review-before-action queue",
  dashboard: "Network signal",
  events: "Recommended events",
  followups: "Follow-up queue",
  home: "Open a function panel from chat",
  people: "People to prioritize",
  schedule: "Schedule timeline",
};

const orbitAiEnglishCommandLabels: Record<
  Exclude<AppOrbitAiPanel, "home" | "dashboard">,
  string
> = {
  agent: "Review next moves",
  events: "Recommend events",
  followups: "Prepare follow-up",
  people: "Recommend people",
  schedule: "Check schedule",
};

// bilingualOrbitAiCopy 只处理 UI 文案，不修改 service 返回的数据。
function bilingualOrbitAiCopy(copy: typeof orbitAiUiCopy.zh): OrbitAiUiCopy {
  return {
    actionBarBody: bilingualText(
      copy.actionBarBody,
      orbitAiUiCopy.en.actionBarBody,
    ),
    actionBarTitle: bilingualText(
      copy.actionBarTitle,
      orbitAiUiCopy.en.actionBarTitle,
    ),
    assistantTimestamp: bilingualText(
      copy.assistantTimestamp,
      orbitAiUiCopy.en.assistantTimestamp,
    ),
    chatAriaLabel: copy.chatAriaLabel,
    commandLabel: bilingualText(copy.commandLabel, orbitAiUiCopy.en.commandLabel),
    conversationAriaLabel: copy.conversationAriaLabel,
    functionNote: bilingualText(copy.functionNote, orbitAiUiCopy.en.functionNote),
    headerBody: bilingualText(copy.headerBody, orbitAiUiCopy.en.headerBody),
    heading: bilingualText(copy.heading, orbitAiUiCopy.en.heading),
    inputLabel: copy.inputLabel,
    inputPlaceholder: bilingualText(
      copy.inputPlaceholder,
      orbitAiUiCopy.en.inputPlaceholder,
    ),
    languageAriaLabel: copy.languageAriaLabel,
    navigationAriaLabel: copy.navigationAriaLabel,
    orbitAriaLabel: copy.orbitAriaLabel,
    orbitBody: bilingualText(copy.orbitBody, orbitAiUiCopy.en.orbitBody),
    orbitLabel: bilingualText(copy.orbitLabel, orbitAiUiCopy.en.orbitLabel),
    orbitMetric: bilingualText(copy.orbitMetric, orbitAiUiCopy.en.orbitMetric),
    railSafety: bilingualText(copy.railSafety, orbitAiUiCopy.en.railSafety),
    sendLabel: bilingualText(copy.sendLabel, orbitAiUiCopy.en.sendLabel),
    sideStageAriaLabel: copy.sideStageAriaLabel,
    sourceDetailsLabel: copy.sourceDetailsLabel,
    sourceSummary: bilingualText(copy.sourceSummary, orbitAiUiCopy.en.sourceSummary),
    stageEyebrow: bilingualText(copy.stageEyebrow, orbitAiUiCopy.en.stageEyebrow),
    statusEvidence: bilingualText(copy.statusEvidence, orbitAiUiCopy.en.statusEvidence),
    statusHeld: bilingualText(copy.statusHeld, orbitAiUiCopy.en.statusHeld),
    statusPreview: bilingualText(copy.statusPreview, orbitAiUiCopy.en.statusPreview),
    taskPanelAriaLabel: copy.taskPanelAriaLabel,
  };
}

// 避免中英文完全相同时重复展示双语。
function bilingualIfDifferent(chinese: string, english: string): string {
  return chinese === english ? chinese : bilingualText(chinese, english);
}

// 组件入口：先加载 view-model，再按 chat + side stage + reviewed preview 三块渲染。
export async function OrbitAiCommandCenter({
  searchParams,
}: OrbitAiCommandCenterProps = {}) {
  const data = await loadOrbitAiCommandViewModel(searchParams);
  const copy =
    data.language === "zh"
      ? bilingualOrbitAiCopy(orbitAiUiCopy.zh)
      : orbitAiUiCopy.en;
  const isChinesePrimary = data.isChinesePrimary;

  return (
    <div
      className="orbit-ai-command-center"
      data-orbit-ai-command-center="true"
      data-orbit-ai-layout="relationship-console"
      data-reference-style="orbit-ui-reference"
      lang={data.language === "zh" ? "zh-Hans" : "en"}
    >
      <style>{orbitAiCommandStyles}</style>
      <nav aria-label={copy.navigationAriaLabel} className="orbit-ai-rail">
        <a
          aria-label="Orbit AI"
          className="orbit-ai-rail-brand"
          href={orbitPanelHref(data.language, "home")}
        >
          AI
        </a>
        <div className="orbit-ai-nav">
          {orbitAiNavPanels.map((panel) => {
            const isActive = panel === data.panel;

            return (
              <a
                aria-current={isActive ? "page" : undefined}
                className="orbit-ai-nav-link"
                data-orbit-ai-nav-panel={panel}
                href={orbitPanelHref(data.language, panel)}
                key={panel}
              >
                <OrbitAiNavIcon panel={panel} />
                <span>
                  {isChinesePrimary
                    ? bilingualIfDifferent(
                        orbitAiNavLabels.zh[panel],
                        orbitAiNavLabels.en[panel],
                      )
                    : orbitAiNavLabels.en[panel]}
                </span>
              </a>
            );
          })}
        </div>
        <p className="orbit-ai-rail-foot">
          <span aria-hidden="true" />
          <span>{copy.railSafety}</span>
        </p>
      </nav>
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
                {isChinesePrimary && link.panel !== "dashboard"
                  ? bilingualText(
                      link.label,
                      orbitAiEnglishCommandLabels[
                        link.panel as Exclude<AppOrbitAiPanel, "home" | "dashboard">
                      ],
                    )
                  : link.label}
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
            <h2>
              {isChinesePrimary
                ? bilingualText(data.stageTitle, orbitAiEnglishStageTitles[data.panel])
                : data.stageTitle}
            </h2>
            <p>{data.stageSubtitle}</p>
          </header>
          <div className="orbit-ai-status-strip">
            <span>{copy.statusHeld}</span>
            <span>{copy.statusEvidence}</span>
            <span>{copy.statusPreview}</span>
          </div>
          <div className={`orbit-ai-stage-grid orbit-ai-stage-grid-${data.panel}`}>
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
              href={data.primaryStageHref}
            >
              {data.primaryStageLabel}
            </a>
          </footer>
        </section>
      </aside>
    </div>
  );
}
