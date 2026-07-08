"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentScenarioView,
  OrbitAgentViewModel,
} from "../orbit-agent-route-view-model";
import {
  localizeOrbitAiPanelCalendarActionPreview,
  localizeOrbitAiPanelPayload,
  localizeOrbitAiPanelText,
} from "./panel-localization-adapter";
import { useOrbitLanguage } from "../orbit-language-context";
import { productHref } from "../orbit-public-shell";
import { Avatar, Cover, Icon, Logo, gradientFromString } from "../orbit-reference-primitives";

// OrbitRealAgent 是 `/app/agent` 和 `/app/chat` 共享的真实聊天界面。
// 初始欢迎页/历史建议来自静态 viewModel；用户真正发送消息后，
// 会通过 `/api/ai/conversations` 进入服务端 Chat Agent。
interface OrbitRealAgentProps {
  initialCalendarActionPreviews?: readonly AgentCalendarActionPreview[];
  initialConversationData?: OrbitAgentApiData | null;
  initialProactiveContext?: OrbitAgentProactiveContextViewModel | null;
  initialSubmittedGoal?: string | null;
  viewModel: OrbitAgentViewModel;
}

export interface OrbitAgentProactiveContextViewModel {
  activityTitle: string;
  peopleContext: string;
  preparationPrompt: string;
  relationshipContext: string;
  sourceLabel: string;
  sourceMessageId: string;
  timeLabel: string;
}

type ReferenceAgentPanel = Pick<OrbitAgentScenarioView, "items" | "kind" | "panelTitle"> & {
  source: "reference";
};

interface AgentArtifactActionPreview {
  href: string | null;
  id: string;
  label: string;
  requiresConfirmation: boolean;
}

interface AgentArtifactItemPreview {
  actions: readonly AgentArtifactActionPreview[];
  body: string | null;
  confidenceLabel: string | null;
  id: string;
  metadata: readonly { label: string; value: string }[];
  reason: string | null;
  subtitle: string | null;
  title: string;
}

interface AgentArtifactSectionPreview {
  body: string | null;
  items: readonly AgentArtifactItemPreview[];
  title: string;
}

interface AgentArtifactPreview {
  actions: readonly AgentArtifactActionPreview[];
  id: string;
  kind: string;
  sections: readonly AgentArtifactSectionPreview[];
  status: string;
  subtitle: string | null;
  summary: string;
  title: string;
}

interface AgentArtifactTechnicalEntry {
  label: string;
  value: string;
}

interface AgentToolIntentPreview {
  id: string;
  label: string;
  reason: string | null;
  requiresUserConfirmation: boolean;
  toolFamily: string | null;
}

interface AgentCalendarActionPreview {
  actionId: string;
  artifactId: string;
  confirmationStatus: "unconfirmed";
  completionBoundary: {
    confirmationAvailable: false;
    noExternalEventCreated: true;
    state: "awaiting_live_calendar_adapter";
  };
  itemId: string;
  label: string;
  localOnly: true;
  source: {
    artifactSource: string;
    evidenceIds: readonly string[];
    label: string;
  };
  state: "staged_unconfirmed";
  wouldAdd: {
    date: string;
    endTime: string | null;
    location: string | null;
    reason: string;
    relatedLink: {
      href: string;
      label: string;
    };
    startTime: string;
    time: string;
    timeZone: string;
    title: string;
  };
}

interface ApiAgentPanel {
  artifacts: readonly AgentArtifactPreview[];
  calendarActionPreviews: readonly AgentCalendarActionPreview[];
  intents: readonly AgentToolIntentPreview[];
  nextAction: string | null;
  panelTitle: string;
  source: "api";
  sourceLabel: string | null;
}

type AgentPanel = ReferenceAgentPanel | ApiAgentPanel;

type AgentMessage =
  | { role: "user"; text: string }
  | {
      error?: boolean;
      panel?: AgentPanel;
      note?: string;
      role: "assistant";
      sourceLabel?: string | null;
      text: string;
    };

interface OrbitAgentApiData {
  artifacts?: unknown;
  assistantMessage?: unknown;
  nextAction?: unknown;
  proposedToolIntents?: unknown;
  provenance?: unknown;
  routingDecision?: unknown;
}

interface OrbitAgentApiEnvelope {
  data?: OrbitAgentApiData;
  error?: { message?: unknown };
  success?: boolean;
}

interface OrbitAgentRequestHistoryTurn {
  content: string;
  role: "assistant" | "user";
}

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;

function depthFor(t: Translate) {
  return {
    to_contact: { label: t({ en: "To break ice · Just met", zh: "待破冰 · 一面之缘" }), color: "var(--amber)", soft: "var(--amber-soft)" },
    in_progress: { label: t({ en: "In progress · In touch", zh: "在推进 · 已有交流" }), color: "var(--sky)", soft: "var(--sky-soft)" },
    partnered: { label: t({ en: "Partnered · Solid", zh: "已合作 · 关系稳固" }), color: "var(--live)", soft: "var(--live-soft)" },
  };
}

const TZ = { timeZone: "Asia/Tokyo" };

function fmtMonth(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "short", ...TZ }).format(date);
}

function fmtDay(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "2-digit", ...TZ }).format(date);
}

function parseDate(value: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

// API envelope 来自 fetch JSON，前端必须把它当 unknown 防御解析。
// 这些 read* helper 让 UI 遇到缺字段或未来 schema 扩展时降级显示，而不是崩溃。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPeopleResult(item: OrbitAgentPeopleResultView | OrbitAgentEventResultView): item is OrbitAgentPeopleResultView {
  return "connection" in item;
}

function currentAgentQuery() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

// artifactKindLabel 把服务端 artifact kind 转成用户可读标签。
function artifactKindLabel(kind: string, t: Translate) {
  const labels: Record<string, Copy> = {
    contact_recommendations: { en: "Contact recommendations", zh: "人脉推荐" },
    email_context: { en: "Message context", zh: "消息上下文" },
    event_recommendations: { en: "Event recommendations", zh: "活动推荐" },
    followup_queue: { en: "Follow-up queue", zh: "跟进队列" },
    generic: { en: "Orbit result", zh: "Orbit 结果" },
    relationship_chat_context: { en: "Relationship context", zh: "关系上下文" },
    todo_summary: { en: "To-do summary", zh: "关系待办" },
  };

  return t(labels[kind] ?? labels.generic);
}

function artifactStatusLabel(status: string, t: Translate) {
  const labels: Record<string, Copy> = {
    failed: { en: "Failed", zh: "失败" },
    pending: { en: "Pending", zh: "等待中" },
    ready: { en: "Ready", zh: "已就绪" },
  };

  return t(labels[status] ?? { en: status, zh: status });
}

// 以下 read*Preview 函数把服务端 conversation payload 收窄成右侧结果面板可渲染的结构。
// 它们只读取白名单字段；未知字段会被忽略。
function readActionPreview(value: unknown, index: number): AgentArtifactActionPreview | null {
  if (!isRecord(value)) return null;
  const label = readString(value.label);
  if (!label) return null;

  return {
    href: readString(value.href),
    id: readString(value.actionId) ?? `action-${index + 1}`,
    label,
    requiresConfirmation: readBoolean(value.requiresConfirmation),
  };
}

function readItemPreview(value: unknown, index: number, t: Translate): AgentArtifactItemPreview | null {
  if (!isRecord(value)) return null;
  const title = readString(value.title);
  if (!title) return null;

  return {
    actions: readArray(value.actions)
      .map((action, actionIndex) => readActionPreview(action, actionIndex))
      .filter((action): action is AgentArtifactActionPreview => Boolean(action)),
    body: readString(value.body),
    confidenceLabel: readString(value.confidenceLabel),
    id: readString(value.id) ?? `item-${index + 1}`,
    metadata: readArray(value.metadata)
      .map((metadata) => {
        if (!isRecord(metadata)) return null;
        const label = readString(metadata.label);
        const valueText = readString(metadata.value);
        return label && valueText ? { label, value: valueText } : null;
      })
      .filter((metadata): metadata is { label: string; value: string } => Boolean(metadata)),
    reason: readString(value.reason),
    subtitle: readString(value.subtitle),
    title: title || t({ en: "Untitled result", zh: "未命名结果" }),
  };
}

function readSectionPreview(value: unknown, index: number, t: Translate): AgentArtifactSectionPreview | null {
  if (!isRecord(value)) return null;
  const items = readArray(value.items)
    .map((item, itemIndex) => readItemPreview(item, itemIndex, t))
    .filter((item): item is AgentArtifactItemPreview => Boolean(item));
  const title = readString(value.title);

  if (!title && items.length === 0) return null;

  return {
    body: readString(value.body),
    items,
    title: title ?? t({ en: "Results", zh: "结果" }),
  };
}

function readArtifactPreview(value: unknown, index: number, t: Translate): AgentArtifactPreview | null {
  if (!isRecord(value)) return null;

  const task = isRecord(value.task) ? value.task : {};
  const result = isRecord(value.result) ? value.result : {};
  const presentation = isRecord(result.presentation) ? result.presentation : {};
  const generatedView = isRecord(result.generatedView) ? result.generatedView : {};
  const kind = readString(task.kind) ?? readString(result.kind) ?? "generic";
  const sections = readArray(generatedView.sections)
    .map((section, sectionIndex) => readSectionPreview(section, sectionIndex, t))
    .filter((section): section is AgentArtifactSectionPreview => Boolean(section));
  const title = readString(presentation.title) ?? artifactKindLabel(kind, t);

  return {
    actions: sections.flatMap((section) => section.items.flatMap((item) => item.actions)),
    id: readString(task.artifactId) ?? readString(result.artifactId) ?? `artifact-${index + 1}`,
    kind,
    sections,
    status: readString(result.status) ?? readString(task.status) ?? "ready",
    subtitle: readString(presentation.subtitle),
    summary:
      readString(generatedView.summary) ??
      readString(result.nextAction) ??
      readString(task.query) ??
      t({ en: "Orbit prepared this result for review.", zh: "Orbit 已整理好这份结果，等待你确认。" }),
    title,
  };
}

function isTechnicalPanelNote(value: string | null) {
  return Boolean(
    value &&
      /ORBIT_AGENT_MAX_LOOP_STEPS|provider:|model:|deepseek|gemini|synthesis is skipped|Loop stopped/i.test(
        value,
      ),
  );
}

function technicalEntriesForArtifact(artifact: AgentArtifactPreview): AgentArtifactTechnicalEntry[] {
  return artifact.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.metadata.map((metadata) => ({
        label: `${item.title} · ${metadata.label}`,
        value: metadata.value,
      })),
    ),
  );
}

function publicMetadataForItem(item: AgentArtifactItemPreview): readonly { label: string; value: string }[] {
  return item.metadata
    .filter((metadata) =>
      /^(Contact|Event|Organization|People|Source|Score|Timing|When|Confidence|Resolution score|Privacy|Due|Reason|Source context|联系人|活动|组织|建议认识|来源|匹配分|时间|可信度|隐私范围|到期|原因|来源上下文)$/i.test(
        metadata.label,
      ),
    )
    .slice(0, 4);
}

function metadataValueForItem(
  item: AgentArtifactItemPreview,
  labels: readonly string[],
): string | null {
  const normalizedLabels = new Set(labels.map((label) => label.toLowerCase()));
  const match = item.metadata.find((metadata) =>
    normalizedLabels.has(metadata.label.toLowerCase()),
  );

  return match?.value ?? null;
}

function isTodoSummaryArtifact(artifact: AgentArtifactPreview): boolean {
  return (
    artifact.id.includes("todo-summary") ||
    /upcoming relationship work|关系待办摘要/i.test(artifact.title)
  );
}

function artifactActionTone(action: AgentArtifactActionPreview) {
  if (action.id.includes(":confirm-followup:")) return "primary";
  if (action.id.includes(":defer-followup:")) return "secondary";
  return "review";
}

function artifactActionIcon(action: AgentArtifactActionPreview) {
  const tone = artifactActionTone(action);

  if (tone === "primary") return "check";
  if (tone === "secondary") return "x";
  return "eye";
}

function ArtifactActionControl({
  action,
  itemTitle,
  preserveHref,
}: {
  action: AgentArtifactActionPreview;
  itemTitle: string;
  preserveHref: (href: string) => string;
}) {
  const { t } = useOrbitLanguage();
  const tone = artifactActionTone(action);
  const isPrimary = tone === "primary";
  const isSecondary = tone === "secondary";
  const style = {
    alignItems: "center",
    background: isPrimary ? "var(--accent)" : isSecondary ? "transparent" : "var(--accent-softer)",
    border: `1px solid ${isPrimary ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 9,
    color: isPrimary ? "var(--on-dark)" : isSecondary ? "var(--text-3)" : "var(--accent)",
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "var(--ff)",
    fontSize: 12,
    fontWeight: 650,
    gap: 6,
    minHeight: 30,
    padding: "6px 9px",
    textDecoration: "none",
  } as const;

  if (action.href) {
    return (
      <a
        aria-label={`${itemTitle}: ${action.label}`}
        data-orbit-agent-artifact-action={action.id}
        href={preserveHref(productHref(action.href))}
        style={style}
      >
        <Icon name={artifactActionIcon(action)} size={13} />
        <span>{action.label}</span>
        {action.requiresConfirmation ? (
          <span data-orbit-agent-action-confirmation-required={action.id}>
            {t({ en: "Confirm", zh: "需确认" })}
          </span>
        ) : null}
      </a>
    );
  }

  return (
    <button
      aria-label={`${itemTitle}: ${action.label}`}
      data-orbit-agent-artifact-action={action.id}
      type="button"
      style={style}
    >
      <Icon name={artifactActionIcon(action)} size={13} />
      <span>{action.label}</span>
      {action.requiresConfirmation ? (
        <span data-orbit-agent-action-confirmation-required={action.id}>
          {t({ en: "Confirm", zh: "需确认" })}
        </span>
      ) : null}
    </button>
  );
}

function readToolIntentPreview(value: unknown, index: number): AgentToolIntentPreview | null {
  if (!isRecord(value)) return null;
  const label = readString(value.label);
  if (!label) return null;

  return {
    id: readString(value.intentId) ?? `intent-${index + 1}`,
    label,
    reason: readString(value.reason),
    requiresUserConfirmation: readBoolean(value.requiresUserConfirmation),
    toolFamily: readString(value.toolFamily),
  };
}

// API panel 只消费 conversation payload 里的 artifacts/proposedToolIntents。
// 如果 live agent 只是普通聊天、没有 artifact 或计划工具，这里返回 null，
// UI 就只渲染 assistant 气泡，不打开右侧结果面板。
function panelFromApiData(
  data: OrbitAgentApiData,
  language: "en" | "zh",
  t: Translate,
  calendarActionPreviews: readonly AgentCalendarActionPreview[] = [],
): ApiAgentPanel | null {
  const localizedData = localizeOrbitAiPanelPayload(data, language);
  const localizedCalendarActionPreviews = calendarActionPreviews.map((preview) =>
    localizeOrbitAiPanelCalendarActionPreview(preview, language),
  );
  const artifacts = readArray(localizedData.artifacts)
    .map((artifact, index) => readArtifactPreview(artifact, index, t))
    .filter((artifact): artifact is AgentArtifactPreview => Boolean(artifact));
  const intents = readArray(localizedData.proposedToolIntents)
    .map((intent, index) => readToolIntentPreview(intent, index))
    .filter((intent): intent is AgentToolIntentPreview => Boolean(intent));

  if (
    artifacts.length === 0 &&
    intents.length === 0 &&
    localizedCalendarActionPreviews.length === 0
  ) {
    return null;
  }

  const provenance = isRecord(localizedData.provenance)
    ? localizedData.provenance
    : {};

  return {
    artifacts,
    calendarActionPreviews: localizedCalendarActionPreviews,
    intents,
    nextAction: readString(localizedData.nextAction),
    panelTitle: localizeOrbitAiPanelText("Orbit result", language),
    source: "api",
    sourceLabel: readString(provenance.sourceLabel),
  };
}

function isNoToolApiTurn(data: OrbitAgentApiData): boolean {
  const routingDecision = isRecord(data.routingDecision)
    ? data.routingDecision
    : {};

  return (
    routingDecision.needsTool === false &&
    readArray(data.artifacts).length === 0 &&
    readArray(data.proposedToolIntents).length === 0
  );
}

function initialAgentMessagesFor(input: {
  data: OrbitAgentApiData | null | undefined;
  goal: string | null | undefined;
  panel: ApiAgentPanel | null;
  t: Translate;
}): AgentMessage[] {
  const goal = input.goal?.trim();

  if (!goal || !input.data) {
    return [];
  }

  const provenance = isRecord(input.data.provenance)
    ? input.data.provenance
    : {};

  return [
    { role: "user", text: goal },
    {
      panel: input.panel ?? undefined,
      role: "assistant",
      sourceLabel: readString(provenance.sourceLabel),
      text:
        readString(input.data.assistantMessage) ??
        input.t({
          en: "Orbit prepared source-backed contact recommendations for this goal.",
          zh: "Orbit 已为这个目标整理好有来源证据的人脉推荐。",
        }),
    },
  ];
}

function conversationHistoryForRequest(
  messages: readonly AgentMessage[],
): readonly OrbitAgentRequestHistoryTurn[] {
  const recentMessages = messages.slice(-6);

  return recentMessages.map((message) => ({
    content: message.text,
    role: message.role,
  }));
}

function messageWithRecentContext(
  message: string,
  conversationHistory: readonly OrbitAgentRequestHistoryTurn[],
): string {
  if (conversationHistory.length === 0) return message;

  return [
    "Recent conversation context:",
    conversationHistory
      .map((turn) => `${turn.role}: ${turn.content}`)
      .join("\n"),
    "",
    "Current user message:",
    message,
  ].join("\n");
}

// 浏览器端唯一的真实 Chat Agent 请求入口。
// mock/live 的选择不在前端决定，而是在服务端 service factory 根据环境变量解析。
async function sendOrbitAgentMessage(
  message: string,
  locale: "en" | "zh",
  t: Translate,
  recentMessages: readonly AgentMessage[] = [],
) {
  const conversationHistory = conversationHistoryForRequest(recentMessages);
  const contextualMessage = messageWithRecentContext(
    message,
    conversationHistory,
  );
  const response = await fetch("/api/ai/conversations", {
    body: JSON.stringify({
      conversationHistory,
      history: conversationHistory,
      locale,
      message: contextualMessage,
      prompt: message,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = (await response.json().catch(() => ({}))) as OrbitAgentApiEnvelope;

  if (!response.ok || envelope.success === false) {
    return {
      error: true,
      panel: null,
      sourceLabel: null,
      text:
        readString(envelope.error?.message) ??
        t({ en: "Orbit could not reply right now. Please try again.", zh: "Orbit 现在没有返回结果，请稍后再试。" }),
    };
  }

  const data = localizeOrbitAiPanelPayload(
    isRecord(envelope.data) ? envelope.data : {},
    locale,
  );
  const provenance = isRecord(data.provenance) ? data.provenance : {};
  const panel = panelFromApiData(data, locale, t);

  return {
    error: false,
    noToolTurn: isNoToolApiTurn(data),
    panel,
    sourceLabel: readString(provenance.sourceLabel),
    text:
      readString(data.assistantMessage) ??
      t({ en: "Orbit replied, but no message text was returned.", zh: "Orbit 已返回，但没有可显示的回复文本。" }),
  };
}

function AgentHistoryList({
  activeQ,
  history,
  onPick,
}: {
  activeQ: string;
  history: OrbitAgentHistoryView[];
  onPick: (history: OrbitAgentHistoryView) => void;
}) {
  const groups = useMemo(() => [...new Set(history.map((item) => item.group))], [history]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {groups.map((group) => (
        <div key={group}>
          <div className="eyebrow" style={{ padding: "0 8px 6px" }}>
            {group}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {history
              .filter((item) => item.group === group)
              .map((item) => {
                const active = Boolean(activeQ && item.q === activeQ);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item)}
                    style={{
                      alignItems: "center",
                      background: active ? "var(--accent-softer)" : "transparent",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      display: "flex",
                      fontFamily: "var(--ff)",
                      gap: 9,
                      padding: "9px 10px",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <Icon name="message" size={15} color={active ? "var(--accent)" : "var(--text-4)"} />
                    <span style={{ color: active ? "var(--accent)" : "var(--text)", flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </span>
                    <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0, fontSize: 10.5 }}>
                      {item.when}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function agentSuggestLabel(label: string, language: "en" | "zh") {
  if (language === "zh") return label;

  const labels: Record<string, string> = {
    "找金融 AI 方向的人脉": "Find AI finance contacts",
    "想认识女装设计师": "Meet womenswear designers",
    "推荐 AI / 出海活动": "Recommend AI / global events",
  };

  return labels[label] ?? label;
}

const contactDiscoveryExamples = [
  {
    icon: "briefcase",
    id: "poc-buyer",
    label: { en: "Find a PoC buyer", zh: "找 PoC 买方" },
    q: "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.",
  },
  {
    icon: "share",
    id: "investor-intro",
    label: { en: "Find an investor intro", zh: "找投资人引荐" },
    q: "Find an investor intro for seed fundraising with enough relationship context to approach safely.",
  },
  {
    icon: "users",
    id: "organizer-intro",
    label: { en: "Find an organizer intro", zh: "找主办方引荐" },
    q: "Find an event organizer who can introduce me to cross-border ecommerce operators.",
  },
] as const;

const eventDiscoveryExamples = [
  {
    icon: "briefcase",
    id: "meet-investors",
    label: { en: "Meet investors", zh: "见投资人" },
    q: "Recommend events where I can meet investors for seed fundraising and founder feedback.",
  },
  {
    icon: "network",
    id: "china-market-partners",
    label: { en: "Find China-market partners", zh: "找中国市场伙伴" },
    q: "Find China-market partners who can help China SaaS sales enter Japan.",
  },
  {
    icon: "users",
    id: "hire-ai-talent",
    label: { en: "Hire AI talent", zh: "招聘 AI 人才" },
    q: "I need to hire AI talent and meet machine learning engineers.",
  },
] as const;

const todoSummaryExamples = [
  {
    icon: "clock",
    id: "today-agenda",
    label: { en: "Today agenda", zh: "今日待办" },
    q: "What should I do today? Summarize my to-do list from conversations and schedule.",
  },
  {
    icon: "users",
    id: "weekend-social-reminder",
    label: { en: "Weekend social reminder", zh: "周末社交提醒" },
    q: "What social reminders should I keep for the weekend?",
  },
  {
    icon: "calendar",
    id: "birthday-mention",
    label: { en: "Birthday mention", zh: "生日提醒" },
    q: "Who has a birthday I should mention?",
  },
  {
    icon: "share",
    id: "introduction-request",
    label: { en: "Introduction request", zh: "引荐请求" },
    q: "Which friend introduction request needs action today?",
  },
] as const;

function AgentTopNav({ rightExtra }: { rightExtra?: ReactNode }) {
  const { language, preserveHref, setLanguage, t } = useOrbitLanguage();
  const links = [
    ["/explore", t({ en: "Events", zh: "活动" }), "events"],
    ["/home/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/home/cards", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;

  return (
    <header className="orbit-top-nav">
      <a aria-label={t({ en: "Back to Orbit home", zh: "返回 Orbit 首页" })} className="orbit-brand-link" href={preserveHref("/")} style={{ textDecoration: "none" }}>
        <Logo size={25} />
      </a>
      <a className="orbit-agent-btn is-active" href={preserveHref("/app/agent")} style={{ marginRight: 4 }}>
        <Icon name="sparkle" size={15} />
        iOrbit
      </a>
      <nav aria-label={t({ en: "Primary", zh: "主导航" })} className="orbit-nav-links">
        {links.map(([href, label]) => (
          <a
            className="orbit-nav-link"
            key={href}
            href={preserveHref(productHref(href))}
          >
            {label}
          </a>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div className="orbit-top-actions" style={{ alignItems: "center", display: "flex", gap: 14 }}>
        <button
          aria-label={t({ en: "Switch language", zh: "切换语言" })}
          className="mono orbit-lang-button"
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          style={{ background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", fontSize: 12.5, padding: 0 }}
          type="button"
        >
          <span style={{ color: language === "zh" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "zh" ? 700 : 500 }}>中</span>
          <span style={{ color: "var(--text-4)", padding: "0 1px" }}>/</span>
          <span style={{ color: language === "en" ? "var(--accent)" : "var(--text-3)", fontWeight: language === "en" ? 700 : 500 }}>EN</span>
        </button>
        {rightExtra}
        <a className="orbit-me-link" href={preserveHref("/app/home")}>
          {t({ en: "Me", zh: "我的" })}
        </a>
      </div>
    </header>
  );
}

// AgentWelcome 是空会话状态，建议按钮会直接提交预置 query。
function AgentWelcome({ onPick, viewModel }: { onPick: (query: string) => void; viewModel: OrbitAgentViewModel }) {
  const { language, t } = useOrbitLanguage();

  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "50vh", padding: "24px 8px", textAlign: "center" }}>
      <span className="avatar g-indigo" style={{ alignItems: "center", borderRadius: 16, display: "flex", fontSize: 0, height: 54, justifyContent: "center", width: 54 }}>
        <Icon name="sparkle" size={26} color="var(--on-dark)" />
      </span>
      <h2 className="h-title" style={{ margin: "16px 0 6px" }}>
        {t({ en: "I am iOrbit", zh: "我是 iOrbit" })}
      </h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.65, margin: "0 0 22px", maxWidth: 380 }}>
        {t({
          en: "Tell Orbit the relationship goal. It will rank people or events from source-backed relationship evidence.",
          zh: "告诉 Orbit 这次关系目标，它会用来源证据排序人选或活动。",
        })}
      </p>
      <section
        aria-label={t({ en: "Event discovery examples", zh: "活动发现示例" })}
        data-orbit-event-discovery-goal="true"
        style={{ marginBottom: 16, width: "min(560px, 100%)" }}
      >
        <div className="eyebrow" style={{ marginBottom: 9 }}>
          {t({ en: "Event discovery goal", zh: "活动发现目标" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {eventDiscoveryExamples.map((example) => (
            <button
              data-orbit-agent-event-example-prompt={example.id}
              key={example.id}
              onClick={() => onPick(example.q)}
              style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 999, color: "var(--ink)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 12.5, fontWeight: 650, gap: 6, minHeight: 32, padding: "0 11px" }}
              type="button"
            >
              <Icon name={example.icon} size={14} />
              {t(example.label)}
            </button>
          ))}
        </div>
      </section>
      <section
        aria-label={t({ en: "Contact discovery examples", zh: "人脉发现示例" })}
        data-orbit-contact-discovery-goal="true"
        style={{ marginBottom: 16, width: "min(520px, 100%)" }}
      >
        <div className="eyebrow" style={{ marginBottom: 9 }}>
          {t({ en: "Contact discovery goal", zh: "人脉发现目标" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {contactDiscoveryExamples.map((example) => (
            <button
              data-orbit-agent-example-prompt={example.id}
              key={example.id}
              onClick={() => onPick(example.q)}
              style={{ alignItems: "center", background: "var(--accent-softer)", border: "1px solid var(--accent-soft)", borderRadius: 999, color: "var(--accent)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 12.5, fontWeight: 650, gap: 6, minHeight: 32, padding: "0 11px" }}
              type="button"
            >
              <Icon name={example.icon} size={14} />
              {t(example.label)}
            </button>
          ))}
        </div>
      </section>
      <section
        aria-label={t({ en: "To-do summary examples", zh: "待办摘要示例" })}
        data-orbit-agent-todo-goal="true"
        style={{ marginBottom: 16, width: "min(560px, 100%)" }}
      >
        <div className="eyebrow" style={{ marginBottom: 9 }}>
          {t({ en: "Relationship to-do goal", zh: "关系待办目标" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {todoSummaryExamples.map((example) => (
            <button
              data-orbit-agent-todo-example-prompt={example.id}
              key={example.id}
              onClick={() => onPick(example.q)}
              style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 999, color: "var(--ink)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 12.5, fontWeight: 650, gap: 6, minHeight: 32, padding: "0 11px" }}
              type="button"
            >
              <Icon name={example.icon} size={14} />
              {t(example.label)}
            </button>
          ))}
        </div>
      </section>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "min(420px, 100%)" }}>
        {viewModel.suggests.map((suggest) => (
          <button
            key={suggest.label}
            type="button"
            onClick={() => onPick(suggest.q)}
            style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 13, cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 11, padding: "13px 15px", textAlign: "left" }}
          >
            <Icon name={suggest.icon} size={17} color="var(--accent)" />
            <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 550 }}>{agentSuggestLabel(suggest.label, language)}</span>
            <div style={{ flex: 1 }} />
            <Icon name="arrow" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentPeopleCard({ item, navigate, t }: { item: OrbitAgentPeopleResultView; navigate: (href: string) => void; t: Translate }) {
  const connection = item.connection;
  const depth = depthFor(t);
  const status = depth[connection.pipelineStatus] ?? depth.to_contact;

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", padding: 15, textAlign: "left", width: "100%" }} onClick={() => navigate(`/home/cards/${connection.id}`)}>
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <Avatar letter={connection.initial} g={connection.g} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 650 }}>{connection.displayName}</div>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 1 }}>
            {connection.title} · {connection.company}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 750, lineHeight: 1 }}>{item.match}%</div>
          <div className="mono" style={{ color: "var(--text-4)", fontSize: 9.5 }}>{t({ en: "Match", zh: "匹配度" })}</div>
        </div>
      </div>
      <div style={{ background: "var(--surface-3)", borderRadius: 99, height: 6, marginTop: 12, overflow: "hidden" }}>
        <span style={{ background: "var(--accent-grad-bar)", display: "block", height: "100%", width: `${item.match}%` }} />
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 11 }}>
        <span style={{ alignItems: "center", background: status.soft, borderRadius: 999, color: status.color, display: "inline-flex", fontSize: 11.5, fontWeight: 600, gap: 6, height: 24, padding: "0 10px" }}>
          <span style={{ background: status.color, borderRadius: 999, height: 6, width: 6 }} />
          {status.label}
        </span>
        <span className="chip" style={{ height: 24 }}>{connection.industry}</span>
      </div>
      <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginTop: 11 }}>{item.reason}</div>
      <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 9, marginTop: 11, padding: 11 }}>
        <Icon name="message" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 650 }}>{t({ en: "How to start", zh: "怎么开口" })}</div>
          <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{item.opener}</div>
        </div>
      </div>
      <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 3, justifyContent: "flex-end", marginTop: 12 }}>
        {t({ en: "View contact", zh: "查看名片" })}
        <Icon name="chevR" size={14} />
      </div>
    </button>
  );
}

function AgentEventCard({ item, language, navigate, t }: { item: OrbitAgentEventResultView; language: "en" | "zh"; navigate: (href: string) => void; t: Translate }) {
  const event = item.event;
  const date = parseDate(event.startsAt);
  const weekday = date ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo", weekday: "short" }).format(date) : "";
  const dateLabel = date
    ? (language === "en" ? `${fmtMonth(date, language)} ${fmtDay(date, language)} · ${weekday}` : `${fmtMonth(date, language)}${fmtDay(date, language)}日 · ${weekday}`)
    : t({ en: "Time TBD", zh: "时间待定" });

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", overflow: "hidden", padding: 0, textAlign: "left", width: "100%" }} onClick={() => navigate(`/events/${event.code}`)}>
      <div style={{ display: "flex", gap: 13, padding: 15 }}>
        <Cover g={gradientFromString(event.code)} monogram={{ text: event.name.slice(0, 1), size: 22 }} style={{ borderRadius: 13, flexShrink: 0, height: 60, width: 60 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: "flex-start", display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 650, lineHeight: 1.25 }}>{event.name}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>{dateLabel}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 750, lineHeight: 1 }}>{item.score}</div>
              <div className="mono" style={{ color: "var(--text-4)", fontSize: 9.5 }}>{t({ en: "Score", zh: "匹配分" })}</div>
            </div>
          </div>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12, gap: 8, marginTop: 8 }}>
            <Icon name="pin" size={13} />
            {event.place}
          </div>
        </div>
      </div>
      <div style={{ padding: "0 15px 15px" }}>
        <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>{item.reason}</div>
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 9, marginTop: 11, padding: 11 }}>
          <Icon name="sparkle" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 650 }}>{t({ en: "How to network on site", zh: "怎么在现场社交" })}</div>
            <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{item.howto}</div>
          </div>
        </div>
        <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 3, justifyContent: "flex-end", marginTop: 12 }}>
          {t({ en: "View event", zh: "查看活动" })}
          <Icon name="chevR" size={14} />
        </div>
      </div>
    </button>
  );
}

// reference panel 渲染来自静态 viewModel 的人脉/活动卡片。
function PanelCards({ language, navigate, panel, t }: { language: "en" | "zh"; navigate: (href: string) => void; panel: ReferenceAgentPanel; t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {panel.items.map((item, index) =>
        isPeopleResult(item) ? (
          <AgentPeopleCard key={`${item.connection.id}-${index}`} item={item} navigate={navigate} t={t} />
        ) : (
          <AgentEventCard key={`${item.event.code}-${index}`} item={item} language={language} navigate={navigate} t={t} />
        ),
      )}
    </div>
  );
}

function calendarActionPreviewForItem(
  previews: readonly AgentCalendarActionPreview[],
  item: AgentArtifactItemPreview,
): AgentCalendarActionPreview | null {
  return (
    previews.find((preview) => preview.itemId === item.id) ??
    previews.find((preview) => preview.wouldAdd.title === item.title) ??
    null
  );
}

function calendarSourceBoundaryLabel(t: Translate): string {
  return t({
    en: "Orbit AI calendar preview boundary",
    zh: "Orbit AI 日历预览边界",
  });
}

function calendarViewSourceLabel(
  preview: AgentCalendarActionPreview,
  t: Translate,
): string {
  const href = preview.wouldAdd.relatedLink.href;

  if (/^\/app\/events\//.test(href)) {
    return t({ en: "View event details", zh: "查看活动详情" });
  }

  if (/^\/app\/contacts\//.test(href)) {
    return t({ en: "View relationship details", zh: "查看关系详情" });
  }

  return t({ en: "View source details", zh: "查看来源详情" });
}

function CalendarActionPreviewBlock({
  preserveHref,
  preview,
  t,
}: {
  preserveHref: (href: string) => string;
  preview: AgentCalendarActionPreview;
  t: Translate;
}) {
  const affordanceLabel = t({
    en: "Preview add to calendar",
    zh: "预览加入日历",
  });
  const viewSourceLabel = calendarViewSourceLabel(preview, t);

  return (
    <div
      data-orbit-agent-calendar-confirm-boundary={preview.completionBoundary.state}
      data-orbit-agent-calendar-no-event-created={
        preview.completionBoundary.noExternalEventCreated ? "true" : undefined
      }
      data-orbit-agent-calendar-action-state={preview.state}
      data-orbit-agent-calendar-preview-confirmation={preview.confirmationStatus}
      data-orbit-agent-calendar-preview-scope={
        preview.localOnly ? "local-preview-only" : undefined
      }
      data-orbit-agent-calendar-preview-time={preview.wouldAdd.time}
      style={{ background: "var(--accent-softer)", border: "1px solid var(--accent-soft)", borderRadius: 11, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 8, marginTop: 10, padding: "10px 11px" }}
    >
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 7 }}>
        <a
          aria-label={`${affordanceLabel}: ${preview.wouldAdd.title}`}
          data-orbit-agent-calendar-action-affordance={preview.actionId}
          href={preserveHref(
            `/app/agent?action=calendar-preview&calendarActionId=${encodeURIComponent(preview.actionId)}`,
          )}
          style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, color: "var(--accent)", display: "inline-flex", fontSize: 12, fontWeight: 700, gap: 6, minHeight: 30, padding: "6px 9px", textDecoration: "none" }}
        >
          <Icon name="calendar" size={13} />
          <span>{affordanceLabel}</span>
        </a>
        <span className="chip" style={{ height: 24 }}>{t({ en: "Local preview only", zh: "仅本地预览" })}</span>
        <span className="chip" style={{ height: 24 }}>{t({ en: "Unconfirmed", zh: "未确认" })}</span>
      </div>
      <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 700 }}>
        {t({ en: "What would be added", zh: "将加入什么" })}
      </div>
      <div style={{ alignItems: "flex-start", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, color: "var(--text-3)", display: "flex", fontSize: 11.5, gap: 7, lineHeight: 1.45, padding: "8px 9px" }}>
        <Icon name="eye" size={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <span style={{ minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
          {t({
            en: "Review-only preview. No calendar event has been created; check the source details or cancel until a live calendar adapter is connected.",
            zh: "当前预览仅用于复核；尚未创建日历事件。接入真实日历适配器前，请先查看来源详情或取消。",
          })}
        </span>
      </div>
      <div style={{ display: "grid", fontSize: 11.5, gap: 5, gridTemplateColumns: "minmax(74px, max-content) 1fr", lineHeight: 1.45 }}>
        <span style={{ color: "var(--text-4)" }}>{t({ en: "Title", zh: "标题" })}</span>
        <span data-orbit-agent-calendar-preview-title={preview.wouldAdd.title} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.title}</span>
        <span style={{ color: "var(--text-4)" }}>{t({ en: "Date", zh: "日期" })}</span>
        <span data-orbit-agent-calendar-preview-date={preview.wouldAdd.date} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.date}</span>
        <span style={{ color: "var(--text-4)" }}>{t({ en: "Start", zh: "开始" })}</span>
        <span data-orbit-agent-calendar-preview-start={preview.wouldAdd.startTime} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.startTime}</span>
        {preview.wouldAdd.endTime ? (
          <>
            <span style={{ color: "var(--text-4)" }}>{t({ en: "End", zh: "结束" })}</span>
            <span data-orbit-agent-calendar-preview-end={preview.wouldAdd.endTime} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.endTime}</span>
          </>
        ) : null}
        <span style={{ color: "var(--text-4)" }}>{t({ en: "Time zone", zh: "时区" })}</span>
        <span data-orbit-agent-calendar-preview-time-zone={preview.wouldAdd.timeZone} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.timeZone}</span>
        {preview.wouldAdd.location ? (
          <>
            <span style={{ color: "var(--text-4)" }}>{t({ en: "Location", zh: "地点" })}</span>
            <span data-orbit-agent-calendar-preview-location={preview.wouldAdd.location} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.location}</span>
          </>
        ) : null}
        <span style={{ color: "var(--text-4)" }}>{t({ en: "Data source", zh: "数据来源" })}</span>
        <span data-orbit-agent-calendar-preview-source={preview.source.label} style={{ color: "var(--text-2)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.source.label}</span>
      </div>
      <details
        data-orbit-agent-calendar-evidence={preview.actionId}
        style={{ marginTop: 1 }}
      >
        <summary style={{ color: "var(--text-3)", cursor: "pointer", fontSize: 11.5, fontWeight: 650 }}>
          {t({ en: "View basis", zh: "查看依据" })}
        </summary>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, color: "var(--text-3)", display: "grid", fontSize: 11.5, gap: 5, gridTemplateColumns: "minmax(74px, max-content) 1fr", lineHeight: 1.45, marginTop: 7, padding: "8px 9px" }}>
          <span style={{ color: "var(--text-4)" }}>{t({ en: "Reason", zh: "原因" })}</span>
          <span style={{ color: "var(--text-2)", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.wouldAdd.reason}</span>
          <span style={{ color: "var(--text-4)" }}>{t({ en: "Boundary", zh: "边界" })}</span>
          <span data-orbit-agent-calendar-artifact-source={preview.source.artifactSource} style={{ color: "var(--text-2)", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{calendarSourceBoundaryLabel(t)}</span>
          <span style={{ color: "var(--text-4)" }}>{t({ en: "Evidence", zh: "证据" })}</span>
          <span style={{ color: "var(--text-2)", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{preview.source.evidenceIds.join(", ")}</span>
        </div>
      </details>
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "space-between" }}>
        <a
          aria-label={`${viewSourceLabel}: ${preview.wouldAdd.title}`}
          data-orbit-agent-calendar-next-action="view-source"
          href={preserveHref(preview.wouldAdd.relatedLink.href)}
          style={{ alignItems: "center", background: "var(--accent)", borderRadius: 9, color: "var(--on-dark)", display: "inline-flex", fontSize: 12, fontWeight: 700, gap: 6, minHeight: 30, padding: "6px 9px", textDecoration: "none" }}
        >
          <Icon name="eye" size={13} />
          {viewSourceLabel}
        </a>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 7 }}>
          <button
            aria-disabled="true"
            aria-label={`${t({ en: "Confirmation unavailable", zh: "暂不能确认" })}: ${preview.wouldAdd.title}`}
            data-orbit-agent-calendar-confirm-secondary={preview.actionId}
            data-orbit-agent-calendar-confirm-disabled={preview.actionId}
            disabled
            style={{ alignItems: "center", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, color: "var(--text-4)", cursor: "not-allowed", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 12, fontWeight: 650, gap: 6, minHeight: 30, padding: "6px 9px" }}
            type="button"
          >
            <Icon name="check" size={13} />
            <span>{t({ en: "Confirmation unavailable", zh: "暂不能确认" })}</span>
          </button>
          <a
            data-orbit-agent-calendar-cancel={preview.actionId}
            href={preserveHref("/app/agent")}
            style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 650, textDecoration: "none" }}
          >
            {t({ en: "Cancel", zh: "取消" })}
          </a>
        </div>
      </div>
    </div>
  );
}

// live/API panel 渲染 Chat Agent 返回的 artifact 和 proposed tool intents。
function LiveAgentPanelCards({ panel, t }: { panel: ApiAgentPanel; t: Translate }) {
  const { preserveHref } = useOrbitLanguage();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
      {panel.artifacts.map((artifact) => {
        const allItems = artifact.sections.flatMap((section) => section.items);
        const primaryItems = allItems.slice(0, 3);
        const secondaryItems = allItems.slice(3, 8);
        const technicalEntries = technicalEntriesForArtifact(artifact);
        const todoSummary = isTodoSummaryArtifact(artifact);

        return (
          <div
            key={artifact.id}
            className="card"
            data-orbit-agent-todo-summary={todoSummary ? artifact.id : undefined}
            style={{ maxWidth: "100%", minWidth: 0, overflow: "hidden", padding: 15 }}
          >
            <div style={{ alignItems: "flex-start", display: "flex", gap: 11 }}>
              <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 10, color: "var(--accent)", display: "flex", flexShrink: 0, height: 34, justifyContent: "center", width: 34 }}>
                <Icon name="sparkle" size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 680, lineHeight: 1.3, overflowWrap: "anywhere", wordBreak: "break-word" }}>{artifact.title}</div>
                {artifact.subtitle ? <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3, overflowWrap: "anywhere", wordBreak: "break-word" }}>{artifact.subtitle}</div> : null}
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                  <span className="chip" style={{ height: 24 }}>{artifactKindLabel(artifact.kind, t)}</span>
                  <span className="chip" style={{ height: 24 }}>{artifactStatusLabel(artifact.status, t)}</span>
                </div>
              </div>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, margin: "12px 0 0", overflowWrap: "anywhere", wordBreak: "break-word" }}>{artifact.summary}</p>
            {primaryItems.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {primaryItems.map((item, itemIndex) => {
                  const publicMetadata = publicMetadataForItem(item);
                  const calendarPreview = calendarActionPreviewForItem(
                    panel.calendarActionPreviews,
                    item,
                  );

                  return (
                    <div
                      key={item.id}
                      data-orbit-contact-recommendation-card={artifact.kind === "contact_recommendations" ? item.id : undefined}
                      data-orbit-event-recommendation-card={artifact.kind === "event_recommendations" ? item.id : undefined}
                      data-orbit-agent-todo-item={todoSummary ? item.id : undefined}
                      data-orbit-agent-todo-visible-rank={
                        todoSummary ? String(itemIndex + 1) : undefined
                      }
                      data-orbit-agent-todo-source-context={
                        todoSummary
                          ? metadataValueForItem(item, [
                              "Source context",
                              "来源上下文",
                            ]) ?? item.id
                          : undefined
                      }
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 11, maxWidth: "100%", minWidth: 0, overflow: "hidden", padding: 11 }}
                    >
                      <div style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 650, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.title}</div>
                      {item.subtitle ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.subtitle}</div> : null}
                      {item.confidenceLabel ? (
                        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          <span className="chip" style={{ background: "var(--live-soft)", color: "var(--live)", height: 24 }}>{item.confidenceLabel}</span>
                        </div>
                      ) : null}
                      {publicMetadata.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                          {publicMetadata.map((metadata) => (
                            <div key={`${item.id}-${metadata.label}`} style={{ color: "var(--text-3)", display: "grid", fontSize: 11.5, gap: 6, gridTemplateColumns: "minmax(58px, max-content) 1fr", lineHeight: 1.4 }}>
                              <span style={{ color: "var(--text-4)" }}>{metadata.label}</span>
                              <span style={{ color: "var(--text-2)", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{metadata.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {item.reason ? (
                        <div
                          data-orbit-contact-why={artifact.kind === "contact_recommendations" ? item.id : undefined}
                          data-orbit-event-why={artifact.kind === "event_recommendations" ? item.id : undefined}
                          style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 7, overflowWrap: "anywhere", wordBreak: "break-word" }}
                        >
                          {item.reason}
                        </div>
                      ) : null}
                      {item.body ? (
                        <div
                          data-orbit-contact-evidence-snippet={artifact.kind === "contact_recommendations" ? item.id : undefined}
                          data-orbit-event-people-to-meet={artifact.kind === "event_recommendations" ? item.id : undefined}
                          data-orbit-event-timing={artifact.kind === "event_recommendations" ? item.id : undefined}
                          style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 7, overflowWrap: "anywhere", wordBreak: "break-word" }}
                        >
                          {item.body}
                        </div>
                      ) : null}
                      {item.actions.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                          {item.actions.map((action) => (
                            <ArtifactActionControl
                              action={action}
                              itemTitle={item.title}
                              key={action.id}
                              preserveHref={preserveHref}
                            />
                          ))}
                        </div>
                      ) : null}
                      {calendarPreview ? (
                        <CalendarActionPreviewBlock
                          preserveHref={preserveHref}
                          preview={calendarPreview}
                          t={t}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {secondaryItems.length > 0 ? (
              <details
                data-orbit-agent-todo-remaining-work={
                  todoSummary ? String(secondaryItems.length) : undefined
                }
                style={{ marginTop: 10 }}
              >
                <summary style={{ color: "var(--text-3)", cursor: "pointer", fontSize: 12.5, fontWeight: 650 }}>
                  {todoSummary
                    ? t({ en: "More upcoming work", zh: "更多关系待办" })
                    : t({ en: "Older evidence", zh: "历史证据" })} · {secondaryItems.length}
                </summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                  {secondaryItems.map((item) => (
                    <div
                      data-orbit-agent-secondary-actions-hidden={item.id}
                      key={`secondary-${item.id}`}
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, maxWidth: "100%", minWidth: 0, overflow: "hidden", padding: 10 }}
                    >
                      <div style={{ color: "var(--ink)", fontSize: 13, fontWeight: 650, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.title}</div>
                      {item.subtitle ? <div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 2, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.subtitle}</div> : null}
                      {item.reason ? <div style={{ color: "var(--text-2)", fontSize: 12, lineHeight: 1.45, marginTop: 6, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.reason}</div> : null}
                      {item.body ? <div style={{ color: "var(--text-2)", fontSize: 12, lineHeight: 1.45, marginTop: 6, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.body}</div> : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {technicalEntries.length > 0 || isTechnicalPanelNote(panel.nextAction) ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ color: "var(--text-3)", cursor: "pointer", fontSize: 12.5, fontWeight: 650 }}>
                  {t({ en: "Diagnostics", zh: "诊断信息" })}
                </summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {technicalEntries.slice(0, 8).map((entry) => (
                    <div key={`${artifact.id}-${entry.label}`} className="mono" style={{ background: "var(--bg)", borderRadius: 8, color: "var(--text-3)", fontSize: 10.5, lineHeight: 1.45, overflowWrap: "anywhere", padding: "6px 8px", wordBreak: "break-word" }}>
                      {entry.label}: {entry.value}
                    </div>
                  ))}
                  {isTechnicalPanelNote(panel.nextAction) ? (
                    <div className="mono" style={{ background: "var(--bg)", borderRadius: 8, color: "var(--text-3)", fontSize: 10.5, lineHeight: 1.45, overflowWrap: "anywhere", padding: "6px 8px", wordBreak: "break-word" }}>
                      {panel.nextAction}
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
            {artifact.actions.length > 0 ? (
              <div style={{ background: "var(--amber-soft)", borderRadius: 11, color: "var(--amber)", fontSize: 12.5, lineHeight: 1.5, marginTop: 12, padding: "9px 11px" }}>
                {t({ en: "Actions need your confirmation before anything is sent or changed.", zh: "动作需要你确认后才会发送或改动。" })}
              </div>
            ) : null}
          </div>
        );
      })}
      {panel.intents.map((intent) => (
        <div key={intent.id} className="card" style={{ maxWidth: "100%", minWidth: 0, overflow: "hidden", padding: 14 }}>
          <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
            <Icon name="eye" size={16} color="var(--amber)" />
            <div style={{ color: "var(--ink)", flex: 1, fontSize: 14, fontWeight: 650, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{intent.label}</div>
            {intent.requiresUserConfirmation ? <span className="chip" style={{ height: 24 }}>{t({ en: "Confirm", zh: "需确认" })}</span> : null}
          </div>
          {intent.reason ? <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 8, overflowWrap: "anywhere", wordBreak: "break-word" }}>{intent.reason}</div> : null}
        </div>
      ))}
      {panel.nextAction && !isTechnicalPanelNote(panel.nextAction) ? (
        <div style={{ alignItems: "flex-start", background: "var(--accent-softer)", borderRadius: 11, color: "var(--accent)", display: "flex", fontSize: 12.5, gap: 8, lineHeight: 1.5, padding: "9px 11px" }}>
          <Icon name="arrow" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>{panel.nextAction}</span>
        </div>
      ) : null}
    </div>
  );
}

// AgentPanelContent 根据 panel.source 在静态参考结果和 live API 结果之间切换。
function AgentPanelContent({
  language,
  navigate,
  panel,
  t,
}: {
  language: "en" | "zh";
  navigate: (href: string) => void;
  panel: AgentPanel;
  t: Translate;
}) {
  return panel.source === "reference" ? (
    <PanelCards language={language} panel={panel} navigate={navigate} t={t} />
  ) : (
    <LiveAgentPanelCards panel={panel} t={t} />
  );
}

function agentPanelIcon(panel: AgentPanel) {
  if (panel.source === "api") return "sparkle";
  return panel.kind === "people" ? "users" : "calendar";
}

function agentPanelHint(panel: AgentPanel, t: Translate) {
  if (panel.source === "api") {
    return t({ en: "Review the relationship context before confirming anything.", zh: "确认前先复核关系上下文。" });
  }

  return panel.kind === "people"
    ? t({ en: "Click a card to open the contact page.", zh: "点卡片可直接跳转到对应名片页" })
    : t({ en: "Click a card to open the event page.", zh: "点卡片可直接跳转到对应活动页" });
}

// ChatBox 只负责收集输入和触发 onSend。
// 空输入由 onSend 守卫，按钮保持可命中，避免响应式重复 DOM 被误判为不可点击。
function ChatBox({
  big,
  busy,
  onChange,
  onSend,
  value,
}: {
  big?: boolean;
  busy?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  value: string;
}) {
  const { t } = useOrbitLanguage();
  const isBlank = !value.trim();
  const requestState = busy ? "provider-thinking" : "idle";

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  return (
    <form aria-busy={busy} onSubmit={submitChat} style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, boxShadow: "0 18px 50px rgba(99,89,233,0.12), 0 2px 8px rgba(18,18,28,0.05)", padding: big ? "18px 18px 12px" : "12px 12px 8px", width: "100%" }}>
      <textarea
        aria-describedby="orbit-agent-input-boundary"
        aria-label={t({ en: "Ask Orbit relationship to-dos", zh: "询问 Orbit 关系待办" })}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={t({ en: "Ask Orbit: what you want to do, who to meet, which event to attend…", zh: "问问 Orbit：想做什么、想认识谁、想去什么活动…" })}
        rows={big ? 2 : 1}
        style={{ background: "transparent", border: "none", color: "var(--ink)", fontFamily: "var(--ff)", fontSize: big ? 17 : 15, lineHeight: 1.5, outline: "none", padding: "2px 4px", resize: "none", width: "100%" }}
      />
      <div
        data-orbit-agent-privacy-boundary="true"
        id="orbit-agent-input-boundary"
        style={{ alignItems: "flex-start", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-3)", display: "flex", fontSize: 12, gap: 7, lineHeight: 1.45, marginTop: big ? 10 : 8, minWidth: 0, overflowWrap: "anywhere", padding: "8px 10px", wordBreak: "break-word" }}
      >
        <Icon name="eye" size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <span>
          {t({
            en: "No external actions from normal chat. Actions still require confirmation.",
            zh: "普通聊天不会执行外部动作。发送、日程、待办和人脉改动仍需你确认。",
          })}
        </span>
      </div>
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", marginTop: big ? 8 : 4 }}>
        <div style={{ alignItems: "center", display: "flex", flex: "1 1 210px", gap: 8, minWidth: 0 }}>
          <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 999, color: "var(--accent)", display: "inline-flex", fontSize: 12.5, fontWeight: 650, gap: 6, height: 32, padding: "0 12px" }}>
            <Icon name="sparkle" size={14} />
            iOrbit
          </span>
          <span data-orbit-agent-request-state={requestState} style={{ color: "var(--text-4)", fontSize: 12 }}>
            {busy
              ? t({ en: "Orbit is thinking", zh: "Orbit 正在生成" })
              : t({ en: "Contacts · Events · Business value", zh: "人脉 · 活动 · 商业价值" })}
          </span>
        </div>
        <button
          type="submit"
          aria-disabled={isBlank}
          aria-label={t({ en: "Submit Ask Orbit relationship to-dos", zh: "提交询问 Orbit 关系待办" })}
          data-orbit-agent-submit="true"
          style={{ alignItems: "center", background: isBlank ? "var(--surface-3)" : "var(--accent-grad)", border: "none", borderRadius: 12, boxShadow: isBlank ? "none" : "0 8px 18px rgba(99,76,226,0.28)", color: isBlank ? "var(--text-4)" : "var(--on-dark)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 700, gap: 6, height: 40, justifyContent: "center", minWidth: 118, padding: "0 12px", whiteSpace: "nowrap" }}
        >
          <span data-orbit-agent-submit-label="true">{t({ en: "Ask Orbit", zh: "询问 Orbit" })}</span>
          <Icon name="arrow" size={19} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
    </form>
  );
}

function ProactiveContextBlock({
  context,
}: {
  context: OrbitAgentProactiveContextViewModel;
}) {
  const { t } = useOrbitLanguage();
  const rows = [
    {
      icon: "calendar",
      label: t({ en: "Calendar activity", zh: "日历活动" }),
      value: `${context.activityTitle} · ${context.timeLabel}`,
    },
    {
      icon: "users",
      label: t({ en: "People", zh: "相关人" }),
      value: context.peopleContext,
    },
    {
      icon: "target",
      label: t({ en: "Prepare", zh: "准备重点" }),
      value: context.preparationPrompt,
    },
    {
      icon: "handshake",
      label: t({ en: "Relationship", zh: "关系背景" }),
      value: context.relationshipContext,
    },
  ];

  return (
    <section
      aria-label={t({
        en: "Proactive calendar activity context",
        zh: "主动日历活动上下文",
      })}
      data-orbit-proactive-context="calendar-one-hour"
      data-orbit-proactive-source-message={context.sourceMessageId}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "0 12px 32px rgba(18,18,28,0.05)",
        display: "grid",
        gap: 12,
        marginBottom: 18,
        padding: 16,
      }}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 10 }}>
        <span
          style={{
            alignItems: "center",
            background: "var(--accent-soft)",
            borderRadius: 10,
            color: "var(--accent)",
            display: "inline-flex",
            flexShrink: 0,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Icon name="bell" size={17} />
        </span>
        <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span className="eyebrow">
            {t({ en: "Local reminder", zh: "本地提醒" })}
          </span>
          <h2
            className="h-section"
            style={{ fontSize: 18, lineHeight: 1.2, margin: 0 }}
          >
            {t({ en: "Calendar activity context", zh: "日历活动上下文" })}
          </h2>
          <p
            style={{
              color: "var(--text-3)",
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              overflowWrap: "anywhere",
            }}
          >
            {t({
              en: "Orbit opened this preparation chat locally. No email, SMS, push, or calendar change was sent.",
              zh: "Orbit 只在本页打开准备对话，没有发送邮件、短信、推送，也没有修改日历。",
            })}
          </p>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              alignItems: "flex-start",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              display: "grid",
              gap: 6,
              gridTemplateColumns: "18px minmax(0, 1fr)",
              minWidth: 0,
              padding: "10px 11px",
            }}
          >
            <Icon
              name={row.icon}
              size={15}
              style={{ color: "var(--accent)", marginTop: 2 }}
            />
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <span
                style={{
                  color: "var(--text-4)",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  color: "var(--text)",
                  fontSize: 13,
                  lineHeight: 1.42,
                  overflowWrap: "anywhere",
                }}
              >
                {row.value}
              </span>
            </div>
          </div>
        ))}
      </div>
      <span
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          color: "var(--text-3)",
          display: "inline-flex",
          fontSize: 12,
          fontWeight: 650,
          lineHeight: 1.2,
          padding: "6px 10px",
          width: "fit-content",
        }}
      >
        {context.sourceLabel}
      </span>
    </section>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ animation: `blink 1s ${index * 0.2}s infinite`, background: "var(--text-4)", borderRadius: 999, height: 6, width: 6 }} />
      ))}
    </span>
  );
}

export function OrbitRealAgent({
  initialCalendarActionPreviews = [],
  initialConversationData = null,
  initialProactiveContext = null,
  initialSubmittedGoal = null,
  viewModel,
}: OrbitRealAgentProps) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const localizedInitialConversationData = useMemo(
    () =>
      initialConversationData
        ? localizeOrbitAiPanelPayload(initialConversationData, language)
        : null,
    [initialConversationData, language],
  );
  const localizedInitialCalendarActionPreviews = useMemo(
    () =>
      initialCalendarActionPreviews.map((preview) =>
        localizeOrbitAiPanelCalendarActionPreview(preview, language),
      ),
    [initialCalendarActionPreviews, language],
  );
  const initialPanel = useMemo(
    () =>
      localizedInitialConversationData
        ? panelFromApiData(
            localizedInitialConversationData,
            language,
            t,
            localizedInitialCalendarActionPreviews,
          )
        : null,
    [
      language,
      localizedInitialCalendarActionPreviews,
      localizedInitialConversationData,
      t,
    ],
  );
  const initialMessages = useMemo(
    () =>
      initialAgentMessagesFor({
        data: localizedInitialConversationData,
        goal: initialSubmittedGoal,
        panel: initialPanel,
        t,
      }),
    [initialPanel, initialSubmittedGoal, localizedInitialConversationData, t],
  );
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>(() => initialMessages);
  const [panel, setPanel] = useState<AgentPanel | null>(() => initialPanel);
  const [thinking, setThinking] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [activeQ, setActiveQ] = useState(initialSubmittedGoal?.trim() ?? "");
  // 结果侧边面板宽度可拖拽调整（仅桌面布局）。默认 400px，范围内夹取。
  const [panelWidth, setPanelWidth] = useState<number>(400);
  const panelWidthRef = useRef<number>(400);
  panelWidthRef.current = panelWidth;
  const startPanelResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handleEl = event.currentTarget;
      const startX = event.clientX;
      const pointerId = event.pointerId;
      const startWidth = panelWidthRef.current;
      const maxWidth =
        typeof window === "undefined"
          ? 760
          : Math.max(360, Math.min(760, window.innerWidth - 360));
      handleEl.setPointerCapture(pointerId);
      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(300, startWidth + (startX - moveEvent.clientX)),
        );
        setPanelWidth(next);
      };
      const onUp = () => {
        handleEl.releasePointerCapture?.(pointerId);
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeEventListener("pointerup", onUp);
      };
      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", onUp);
    },
    [],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<AgentMessage[]>(initialMessages);
  const requestSeqRef = useRef(0);
  const hydratedInitialGoalRef = useRef(initialSubmittedGoal?.trim() ?? "");

  // navigate 负责在 prototype 路由和真实详情页之间切换。
  // agent 内部 query 只更新 history state，其它页面则交给浏览器跳转。
  const navigate = useCallback((prototypeHref: string) => {
    const href = preserveHref(productHref(prototypeHref));
    if (typeof window === "undefined") return;

    if (href.startsWith("/app/agent")) {
      window.history.pushState({}, "", href);
      setActiveQ(new URL(href, window.location.origin).searchParams.get("q") ?? "");
      return;
    }

    window.location.href = href;
  }, [preserveHref]);

  // ask 是一次完整前端 turn：
  // 先乐观追加 user 气泡，再等待 API 返回 assistant 文本和可选结果面板。
  // requestSeqRef 用来丢弃较旧请求，避免连续点击时旧响应覆盖新响应。
  const ask = useCallback(async (query: string) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const recentMessages = messagesRef.current;
    setMessages((current) => [...current, { role: "user", text: query }]);
    setThinking(true);
    setPanel(null);

    try {
      const reply = await sendOrbitAgentMessage(query, language, t, recentMessages);
      if (requestSeq !== requestSeqRef.current) return;

      setMessages((current) => [
        ...current,
        {
          error: reply.error,
          panel: reply.panel ?? undefined,
          role: "assistant",
          sourceLabel: reply.sourceLabel,
          text: reply.text,
        },
      ]);
      setPanel(reply.panel ?? null);
    } catch {
      if (requestSeq !== requestSeqRef.current) return;

      setMessages((current) => [
        ...current,
        {
          error: true,
          role: "assistant",
          text: t({ en: "Orbit could not reply right now. Please try again.", zh: "Orbit 现在没有返回结果，请稍后再试。" }),
        },
      ]);
      setPanel(null);
    } finally {
      if (requestSeq === requestSeqRef.current) setThinking(false);
    }
  }, [language, t]);

  useEffect(() => {
    const query = currentAgentQuery();
    setActiveQ(query);

    if (query && query === hydratedInitialGoalRef.current) {
      return undefined;
    }

    if (query) {
      setMessages([]);
      setPanel(null);
      setText("");
      ask(query);
    }

    return undefined;
  }, [ask]);

  useEffect(() => {
    const scroll = scrollRef.current;
    messagesRef.current = messages;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (!histOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [histOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 760px)");
    const syncLayout = () => setIsMobileLayout(media.matches);

    syncLayout();
    media.addEventListener("change", syncLayout);

    return () => media.removeEventListener("change", syncLayout);
  }, []);

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    ask(value);
  };

  const pickHistory = (item: OrbitAgentHistoryView) => {
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    navigate(`/agent?q=${encodeURIComponent(item.q)}`);
    ask(item.q);
  };

  const newChat = () => {
    requestSeqRef.current += 1;
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    setThinking(false);
    setActiveQ("");
    navigate("/agent");
  };

  const chatBox = (
    <ChatBox
      busy={thinking}
      value={text}
      onChange={setText}
      onSend={send}
    />
  );
  const proactiveContextBlock = initialProactiveContext ? (
    <ProactiveContextBlock context={initialProactiveContext} />
  ) : null;

  const renderBubbles = (inlinePanel: boolean) => (
    <>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={`user-${index}`} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <div style={{ background: "var(--accent)", borderRadius: "16px 16px 4px 16px", color: "var(--on-dark)", fontSize: 14.5, lineHeight: 1.55, maxWidth: "82%", padding: "11px 15px" }}>{message.text}</div>
          </div>
        ) : (
          <div key={`assistant-${index}`} style={{ display: "flex", gap: 11, marginBottom: 18 }}>
            <span className="avatar g-indigo" style={{ borderRadius: 10, flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
              <Icon name="sparkle" size={16} color="var(--on-dark)" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {message.note ? (
                <div style={{ alignItems: "center", background: "var(--amber-soft)", borderRadius: 12, color: "var(--amber)", display: "inline-flex", fontSize: 13, fontWeight: 550, gap: 7, marginBottom: 10, padding: "7px 12px" }}>
                  <Icon name="eye" size={14} />
                  {message.note}
                </div>
              ) : null}
              <div data-orbit-agent-no-tool-turn={!message.panel ? "true" : undefined} style={{ background: message.error ? "var(--amber-soft)" : "var(--surface)", border: `1px solid ${message.error ? "var(--amber)" : "var(--border)"}`, borderRadius: "4px 16px 16px 16px", color: message.error ? "var(--amber)" : "var(--text)", fontSize: 14.5, lineHeight: 1.6, padding: "12px 15px" }}>{message.text}</div>
              {inlinePanel && message.panel ? (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{message.panel.panelTitle}</div>
                  <AgentPanelContent language={language} panel={message.panel} navigate={navigate} t={t} />
                </div>
              ) : null}
            </div>
          </div>
        ),
      )}
      {thinking ? (
        <div style={{ display: "flex", gap: 11, marginBottom: 18 }}>
          <span className="avatar g-indigo" style={{ borderRadius: 10, flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
            <Icon name="sparkle" size={16} color="var(--on-dark)" />
          </span>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "14px 16px" }}>
            <TypingDots />
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div data-orbit-real-page="agent" data-orbit-agent-submitted-goal={activeQ || undefined} style={{ background: "var(--bg-soft)", display: "flex", flexDirection: "column", height: "100dvh", maxWidth: "100vw", overflowX: "hidden" }}>
      <h1 data-orbit-agent-screen-title="true" style={{ clipPath: "inset(50%)", height: 1, margin: 0, overflow: "hidden", position: "absolute", whiteSpace: "nowrap", width: 1 }}>
        {t({ en: "Orbit agent workspace", zh: "Orbit Agent 工作台" })}
      </h1>
      <a aria-label={t({ en: "Back to Orbit home", zh: "返回 Orbit 首页" })} href={preserveHref("/")} style={{ clipPath: "inset(50%)", height: 1, overflow: "hidden", position: "absolute", whiteSpace: "nowrap", width: 1 }}>
        {t({ en: "Back to Orbit home", zh: "返回 Orbit 首页" })}
      </a>
      {!isMobileLayout ? (
        <div className="orbit-desktop-only">
        <AgentTopNav
          rightExtra={(
            <button aria-label={t({ en: "New chat", zh: "新对话" })} className="orbit-top-icon-btn" onClick={newChat} type="button">
              <Icon name="plus" size={18} />
            </button>
          )}
        />
        </div>
      ) : null}
      {isMobileLayout ? (
        <div className="orbit-mobile-only" style={{ flexShrink: 0 }}>
        <AgentTopNav
          rightExtra={(
            <button aria-label={t({ en: "Chat history", zh: "对话历史" })} className="orbit-top-icon-btn orbit-agent-history-btn" onClick={() => setHistOpen(true)} type="button">
              <Icon name="clock" size={16} />
            </button>
          )}
        />
        </div>
      ) : null}

      {!isMobileLayout ? (
        <div className="orbit-desktop-only" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside style={{ background: "var(--bg)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, width: 248 }}>
          <div style={{ padding: 14 }}>
            <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 7, height: 40, justifyContent: "center", width: "100%" }}>
              <Icon name="plus" size={16} color="var(--accent)" />
              {t({ en: "New chat", zh: "新对话" })}
            </button>
          </div>
          <div style={{ padding: "4px 18px 8px" }}>
            <div className="eyebrow">{t({ en: "Chat history", zh: "对话历史" })}</div>
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 10px 18px" }}>
            <AgentHistoryList activeQ={activeQ} history={viewModel.history} onPick={pickHistory} />
          </div>
        </aside>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
          <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              {proactiveContextBlock}
              {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(false)}
            </div>
          </div>
          <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "12px 28px 18px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              {chatBox}
            </div>
          </div>
        </div>
        {panel ? (
          <aside key={`${panel.panelTitle}-${messages.length}`} style={{ animation: "agentpanel .32s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, maxWidth: "min(80vw, 760px)", minWidth: 0, overflow: "hidden", position: "relative", width: panelWidth }}>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t({ en: "Drag to resize the result panel", zh: "拖动调整结果面板宽度" })}
              title={t({ en: "Drag to resize", zh: "拖动调整宽度" })}
              onPointerDown={startPanelResize}
              onDoubleClick={() => setPanelWidth(400)}
              style={{ bottom: 0, cursor: "col-resize", left: 0, position: "absolute", top: 0, touchAction: "none", width: 10, zIndex: 3 }}
            >
              <span style={{ background: "var(--border-2)", borderRadius: 2, height: 40, left: 3, position: "absolute", top: "50%", transform: "translateY(-50%)", width: 3 }} />
            </div>
            <div style={{ borderBottom: "1px solid var(--border)", padding: "18px 20px 12px" }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 9, color: "var(--accent)", display: "flex", height: 30, justifyContent: "center", width: 30 }}>
                  <Icon name={agentPanelIcon(panel)} size={17} />
                </span>
                <h3 className="h-section">{panel.panelTitle}</h3>
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                {agentPanelHint(panel, t)}
              </div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 24px" }}>
              <AgentPanelContent language={language} panel={panel} navigate={navigate} t={t} />
            </div>
          </aside>
        ) : null}
        </div>
      ) : null}

      {isMobileLayout ? (
        <div className="orbit-mobile-only" style={{ flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 16px 12px" }}>
          {proactiveContextBlock}
          {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(true)}
        </div>
        <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "10px 16px 18px" }}>
          {chatBox}
        </div>
        </div>
      ) : null}

      {isMobileLayout && histOpen ? (
        <div className="orbit-mobile-only" style={{ inset: 0, position: "fixed", zIndex: 90 }}>
          <div onClick={() => setHistOpen(false)} style={{ backdropFilter: "blur(3px)", background: "var(--scrim)", inset: 0, position: "absolute" }} />
          <div style={{ animation: "slideInLeft .26s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", bottom: 0, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", left: 0, maxWidth: 320, position: "absolute", top: 0, width: "84%" }}>
            <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, height: 54, padding: "0 14px" }}>
              <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700 }}>{t({ en: "Chat history", zh: "对话历史" })}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="hit-44" onClick={() => setHistOpen(false)} aria-label={t({ en: "Close", zh: "关闭" })} style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 15, height: 30, justifyContent: "center", width: 30 }}><Icon name="x" size={16} /></button>
            </div>
            <div style={{ padding: 12 }}>
              <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 7, height: 40, justifyContent: "center", width: "100%" }}>
                <Icon name="plus" size={16} color="var(--accent)" />
                {t({ en: "New chat", zh: "新对话" })}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 12px 4px" }}>
              <div className="eyebrow" style={{ padding: "2px 8px 6px" }}>{t({ en: "Go to", zh: "前往" })}</div>
              {[
                ["/", "home", t({ en: "Home", zh: "首页" })],
                ["/explore", "calendar", t({ en: "Events", zh: "活动" })],
                ["/home/schedule", "clock", t({ en: "Calendar", zh: "日程" })],
                ["/home/cards", "wallet", t({ en: "Contacts", zh: "人脉" })],
              ].map(([href, icon, label]) => (
                <button key={href} type="button" onClick={() => { setHistOpen(false); navigate(href); }} style={{ alignItems: "center", background: "none", border: "none", borderRadius: 9, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 550, gap: 11, padding: "9px 8px", textAlign: "left", width: "100%" }}>
                  <Icon name={icon} size={17} color="var(--accent)" />
                  {label}
                </button>
              ))}
              <div style={{ background: "var(--border)", height: 1, margin: "7px 8px 2px" }} />
              <div className="eyebrow" style={{ padding: "2px 8px 4px" }}>{t({ en: "Chat history", zh: "对话历史" })}</div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 18px" }}>
              <AgentHistoryList activeQ={activeQ} history={viewModel.history} onPick={pickHistory} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
