"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentScenarioView,
  OrbitAgentTodoResultView,
  OrbitAgentViewModel,
} from "../orbit-agent-route-view-model";
import { AccountTopNav } from "../orbit-account-shell";
import { eventCoverPhoto } from "../orbit-landing-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { productHref } from "../orbit-public-shell";
import { Avatar, Cover, Icon, gradientFromString } from "../orbit-reference-primitives";

interface OrbitRealAgentProps {
  viewModel: OrbitAgentViewModel;
}

type AgentPanel = Pick<OrbitAgentScenarioView, "items" | "kind" | "panelTitle">;

type AgentMessage =
  | { role: "user"; text: string }
  | {
      items: OrbitAgentScenarioView["items"];
      kind: OrbitAgentScenarioView["kind"];
      note?: string;
      panelTitle: string;
      role: "assistant";
      text: string;
    };

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;
type AgentHistoryLanguage = "en" | "zh" | "ja";

const AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY = "orbit-agent-chat-active-session-v1";
const AGENT_CHAT_SESSIONS_API_PATH = "/api/ai/conversations/sessions";
const MAX_AGENT_CHAT_HISTORY_SESSIONS = 12;
const HISTORY_SIDEBAR_DEFAULT_WIDTH = 248;
const HISTORY_SIDEBAR_MAX_WIDTH = 380;
const HISTORY_SIDEBAR_MIN_WIDTH = 220;
const MAX_AGENT_CHAT_TITLE_LENGTH = 18;

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

type AgentResultItem =
  | OrbitAgentPeopleResultView
  | OrbitAgentEventResultView
  | OrbitAgentTodoResultView;

function isPeopleResult(item: AgentResultItem): item is OrbitAgentPeopleResultView {
  return "connection" in item;
}

function isTodoResult(item: AgentResultItem): item is OrbitAgentTodoResultView {
  return "due" in item;
}

// /api/ai/conversations 返回的 artifact 载荷里，本页只消费 contact_recommendations
// 的 generatedView。这里做本页自己的 view-model 映射，不直接把 raw payload 交给卡片。
interface AgentArtifactViewItem {
  body?: string;
  confidenceLabel?: string;
  id?: string;
  metadata?: readonly { label?: string; value?: string }[];
  reason?: string;
  subtitle?: string;
  title?: string;
}

interface AgentArtifactRecord {
  result?: {
    generatedView?: {
      sections?: readonly { items?: readonly AgentArtifactViewItem[] }[];
      summary?: string;
    };
    kind?: string;
    presentation?: { title?: string };
  };
  task?: { kind?: string };
}

function artifactOfKind(
  artifacts: unknown,
  kind: "contact_recommendations" | "event_recommendations" | "followup_queue",
): AgentArtifactRecord | null {
  const list = Array.isArray(artifacts) ? (artifacts as AgentArtifactRecord[]) : [];

  return (
    list.find(
      (artifact) => (artifact.task?.kind ?? artifact.result?.kind) === kind,
    ) ?? null
  );
}

function artifactMetadataValue(
  item: AgentArtifactViewItem,
  labels: readonly string[],
): string {
  for (const entry of item.metadata ?? []) {
    if (entry.label && labels.includes(entry.label) && entry.value) {
      return entry.value;
    }
  }

  return "";
}

function peopleItemsFromArtifact(
  artifact: AgentArtifactRecord | null,
): OrbitAgentPeopleResultView[] {
  const items =
    artifact?.result?.generatedView?.sections?.flatMap(
      (section) => section.items ?? [],
    ) ?? [];

  return items.map((item) => {
    const contactId = String(item.id ?? "").split(":").pop() ?? "";
    const displayName = item.title?.trim() || contactId || "Orbit";
    const score = Number(artifactMetadataValue(item, ["分数", "Score"]));

    return {
      connection: {
        company: artifactMetadataValue(item, ["组织", "Organization"]),
        displayName,
        g: gradientFromString(contactId || displayName),
        id: contactId,
        industry: item.confidenceLabel ?? "",
        initial: displayName.slice(0, 1).toUpperCase(),
        pipelineStatus: "in_progress" as const,
        title: item.subtitle ?? "",
      },
      match: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 80,
      opener: item.body ?? "",
      reason: item.reason ?? "",
    };
  });
}

// event_recommendations artifact → 活动卡片视图。startsAt 优先取 Start(ISO)，
// 其次 When(仅日期)；score 取 artifact 元数据分数。
function eventItemsFromArtifact(
  artifact: AgentArtifactRecord | null,
): OrbitAgentEventResultView[] {
  const items =
    artifact?.result?.generatedView?.sections?.flatMap(
      (section) => section.items ?? [],
    ) ?? [];

  return items.map((item) => {
    const eventId = String(item.id ?? "").split(":").pop() ?? "";
    const name = item.title?.trim() || eventId || "Orbit event";
    const score = Number(artifactMetadataValue(item, ["分数", "Score"]));
    const startsAt =
      artifactMetadataValue(item, ["开始", "Start"]) ||
      artifactMetadataValue(item, ["时间", "When"]);

    return {
      event: {
        code: eventId,
        g: gradientFromString(eventId || name),
        id: eventId,
        name,
        place: item.subtitle ?? "",
        startsAt,
      },
      howto: item.body ?? "",
      reason: item.reason ?? "",
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 70,
    };
  });
}

// 发给服务端的对话历史不只带气泡文本：带推荐结果的 assistant 轮附加结构化明细
// （名称/时间/地点/分数），否则追问"第一个活动是什么时候"时模型确实看不到时间。
function historyContentFor(turn: AgentMessage): string {
  const text = turn.text.trim();

  if (turn.role === "user" || turn.items.length === 0) {
    return text;
  }

  const lines = turn.items.slice(0, 8).map((item, index) => {
    if (isPeopleResult(item)) {
      const connection = item.connection;
      const identity = [connection.title, connection.company]
        .filter(Boolean)
        .join(" · ");

      return `${index + 1}. ${connection.displayName}（${identity}）匹配度 ${item.match}% — ${item.reason}`;
    }

    if (isTodoResult(item)) {
      return `${index + 1}. ${item.title}（${[item.contactName, item.organization].filter(Boolean).join(" · ")}）到期 ${item.due} 优先级 ${item.priority} — ${item.reason}`;
    }

    return `${index + 1}. ${item.event.name}（${item.event.place}）时间 ${item.event.startsAt} 匹配分 ${item.score} — ${item.reason}`;
  });

  return `${text}\n[本轮推荐明细]\n${lines.join("\n")}`;
}

// followup_queue artifact → 待办/行程卡片视图。
function todoItemsFromArtifact(
  artifact: AgentArtifactRecord | null,
): OrbitAgentTodoResultView[] {
  const items =
    artifact?.result?.generatedView?.sections?.flatMap(
      (section) => section.items ?? [],
    ) ?? [];

  return items.map((item, index) => ({
    contactName: item.subtitle ?? "",
    due: artifactMetadataValue(item, ["到期", "Due"]),
    id: String(item.id ?? `todo-${index}`),
    organization: artifactMetadataValue(item, ["组织", "Organization"]),
    priority: artifactMetadataValue(item, ["优先级", "Priority"]) || item.confidenceLabel || "",
    reason: item.reason ?? "",
    sourceLabel: artifactMetadataValue(item, ["来源", "Source"]),
    task: item.body ?? "",
    title: item.title ?? "",
  }));
}

function currentAgentQuery() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function currentAgentSessionId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("session") ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredAgentMessage(value: unknown): value is AgentMessage {
  if (!isRecord(value) || typeof value.text !== "string") {
    return false;
  }

  if (value.role === "user") {
    return true;
  }

  return (
    value.role === "assistant" &&
    Array.isArray(value.items) &&
    (value.kind === "people" || value.kind === "events" || value.kind === "todos") &&
    typeof value.panelTitle === "string"
  );
}

export interface AgentStoredChatSession {
  createdAt: string;
  customTitle?: string;
  id: string;
  messages: AgentMessage[];
  panel?: AgentPanel | null;
  pinned?: boolean;
  title: string;
  updatedAt: string;
}

function parseAgentChatSessionsArray(value: unknown): AgentStoredChatSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((session) => ({
      id: typeof session.id === "string" ? session.id : "",
      messages: Array.isArray(session.messages)
        ? session.messages.filter(isStoredAgentMessage)
        : [],
      panel: isRecord(session.panel) ? (session.panel as AgentPanel) : null,
      createdAt:
        typeof session.createdAt === "string" ? session.createdAt : "",
      customTitle:
        typeof session.customTitle === "string" ? session.customTitle.trim() : "",
      pinned: session.pinned === true,
      title: typeof session.title === "string" ? session.title.trim() : "",
      updatedAt:
        typeof session.updatedAt === "string" ? session.updatedAt : "",
    }))
    .map((session) => ({
      ...session,
      createdAt: session.createdAt || session.updatedAt,
    }))
    .filter(
      (session) =>
        Boolean(session.id && session.title && session.createdAt && session.updatedAt) &&
        session.messages.some((message) => message.role === "user"),
    )
    .slice(0, MAX_AGENT_CHAT_HISTORY_SESSIONS);
}

export function parseAgentChatHistoryStorage(
  value: string | null,
): AgentStoredChatSession[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return parseAgentChatSessionsArray(parsed);
  } catch {
    return [];
  }
}

function parseAgentChatSessionsData(value: unknown): AgentStoredChatSession[] {
  return isRecord(value) ? parseAgentChatSessionsArray(value.sessions) : [];
}

function parseAgentChatSessionData(value: unknown): AgentStoredChatSession | null {
  const sessions =
    isRecord(value) && isRecord(value.session)
      ? parseAgentChatSessionsArray([value.session])
      : [];

  return sessions[0] ?? null;
}

export function agentChatHistorySessionsToHistory(
  sessions: readonly AgentStoredChatSession[],
  language: AgentHistoryLanguage,
): OrbitAgentHistoryView[] {
  const group = language === "zh" ? "更早" : "Earlier";

  return [...sessions]
    .sort(
      (a, b) =>
        Number(b.pinned === true) - Number(a.pinned === true) ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, MAX_AGENT_CHAT_HISTORY_SESSIONS)
    .map((session) => {
      const firstUserMessage =
        session.messages.find((message) => message.role === "user")?.text ??
        session.title;
      const title = displayTitleForStoredSession(session);

      return {
        group,
        id: `session:${session.id}`,
        pinned: session.pinned,
        q: firstUserMessage,
        sessionId: session.id,
        title,
        when: group,
      };
    });
}

function cleanAgentTitleText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?？!！。.,，;；:：]+$/g, "");
}

function truncateAgentChatTitle(value: string): string {
  const text = cleanAgentTitleText(value);

  return text.length > MAX_AGENT_CHAT_TITLE_LENGTH
    ? `${text.slice(0, MAX_AGENT_CHAT_TITLE_LENGTH).trim()}...`
    : text;
}

function clampHistorySidebarWidth(value: number): number {
  return Math.min(
    HISTORY_SIDEBAR_MAX_WIDTH,
    Math.max(HISTORY_SIDEBAR_MIN_WIDTH, Math.round(value)),
  );
}

function compactTitlePhrase(subject: string, suffix: string): string {
  const text = cleanAgentTitleText(subject)
    .replace(/^(今天|明天|本周|下周|这个月|本月|适合|適合|关于|有关|围绕)\s*/i, "")
    .replace(/(的人|的联系人|联系人|人脉|活动|会议|峰会|邮件|消息|草稿)$/i, "")
    .trim();
  const joiner = /^[\x00-\x7F]+$/.test(text) && /[^\x00-\x7F]/.test(suffix) ? " " : "";
  const title = suffix && text && !text.endsWith(suffix) ? `${text}${joiner}${suffix}` : text;

  return truncateAgentChatTitle(title || subject || suffix);
}

export function compactAgentChatTitleFromQuestion(question: string): string {
  const cleaned = cleanAgentTitleText(question);
  const firstClause = cleanAgentTitleText(
    cleaned.split(/[，,。.!！?？；;\n]/)[0] ?? cleaned,
  );

  if (!firstClause) {
    return "New chat";
  }

  const chatSubject = firstClause.match(/聊\s*([^，,。.!！?？；;的人]+?)\s*的人/);
  if (chatSubject?.[1]) {
    return compactTitlePhrase(chatSubject[1], "人脉");
  }

  const meetingEvent = firstClause.match(/见\s*([^，,。.!！?？；;的活动]+?)\s*的?活动/i);
  if (meetingEvent?.[1]) {
    return compactTitlePhrase(meetingEvent[1], "见面活动");
  }

  const hasEventIntent = /活动|会议|峰会|event|conference/i.test(cleaned);
  const hasDraftIntent = /邮件|消息|草稿|email|message|draft/i.test(cleaned);
  const hasPeopleIntent =
    /人脉|联系人|认识|找人|找.*人|适合聊|connect|contact|people/i.test(cleaned);
  const suffix = hasDraftIntent ? "消息草稿" : hasEventIntent ? "活动" : hasPeopleIntent ? "人脉" : "";
  const subject = firstClause
    .replace(/^(请|请帮我|帮我|麻烦|可以|能不能|能否|我想|想|给我|帮忙)\s*/i, "")
    .replace(/^(找|寻找|推荐|认识|安排|写|起草|总结|生成)\s*/i, "")
    .replace(/^(一下|一些|几个|一个|适合|適合)\s*/i, "")
    .replace(/^(今天|明天|本周|下周|这个月|本月)\s*/i, "");

  return compactTitlePhrase(subject || firstClause, suffix);
}

export function titleFromMessages(messages: readonly AgentMessage[]): string {
  const firstUserMessage =
    messages.find((message) => message.role === "user")?.text.trim() ?? "";

  if (!firstUserMessage) {
    return "New chat";
  }

  return compactAgentChatTitleFromQuestion(firstUserMessage);
}

function displayTitleForStoredSession(session: AgentStoredChatSession): string {
  return (
    session.customTitle?.trim() ||
    titleFromMessages(session.messages) ||
    session.title
  );
}

function panelFromMessages(messages: readonly AgentMessage[]): AgentPanel | null {
  const message = [...messages]
    .reverse()
    .find(
      (item): item is Extract<AgentMessage, { role: "assistant" }> =>
        item.role === "assistant" && item.items.length > 0,
    );

  return message
    ? { items: message.items, kind: message.kind, panelTitle: message.panelTitle }
    : null;
}

function createAgentSessionId(): string {
  return `agent-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertAgentChatSession(
  sessions: readonly AgentStoredChatSession[],
  session: AgentStoredChatSession,
): AgentStoredChatSession[] {
  return [
    session,
    ...sessions.filter((item) => item.id !== session.id),
  ].slice(0, MAX_AGENT_CHAT_HISTORY_SESSIONS);
}

function agentChatSessionsApiPath(sessionId?: string): string {
  return sessionId
    ? `${AGENT_CHAT_SESSIONS_API_PATH}/${encodeURIComponent(sessionId)}`
    : AGENT_CHAT_SESSIONS_API_PATH;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function loadStoredAgentChatSessions(): Promise<AgentStoredChatSession[]> {
  try {
    const response = await fetch(agentChatSessionsApiPath(), {
      headers: { accept: "application/json" },
      method: "GET",
    });
    const payload = await readJsonResponse(response);

    return response.ok && isRecord(payload) && payload.success === true
      ? parseAgentChatSessionsData(payload.data)
      : [];
  } catch {
    return [];
  }
}

async function loadStoredAgentChatSession(
  sessionId: string,
): Promise<AgentStoredChatSession | null> {
  try {
    const response = await fetch(agentChatSessionsApiPath(sessionId), {
      headers: { accept: "application/json" },
      method: "GET",
    });
    const payload = await readJsonResponse(response);

    return response.ok && isRecord(payload) && payload.success === true
      ? parseAgentChatSessionData(payload.data)
      : null;
  } catch {
    return null;
  }
}

async function persistStoredAgentChatSession(
  session: AgentStoredChatSession,
): Promise<boolean> {
  try {
    const response = await fetch(agentChatSessionsApiPath(), {
      body: JSON.stringify({ session }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await readJsonResponse(response);

    return response.ok && isRecord(payload) && payload.success === true;
  } catch {
    return false;
  }
}

async function deleteStoredAgentChatSession(
  sessionId: string,
): Promise<boolean> {
  try {
    const response = await fetch(agentChatSessionsApiPath(sessionId), {
      method: "DELETE",
    });
    const payload = await readJsonResponse(response);

    return response.ok && isRecord(payload) && payload.success === true;
  } catch {
    return false;
  }
}

export async function copyAgentMessageText(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) {
    return false;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy textarea copy path.
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

// assistant 回复按轻量 markdown 渲染（加粗、列表、行内代码、链接）。
// 组件级内联样式，保持和气泡文本一致的字号与行高。
function AgentMarkdown({ text }: { text: string }) {
  return (
    <div style={{ marginBottom: -6 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" style={{ color: "var(--accent)" }} target="_blank">{children}</a>
          ),
          code: ({ children }) => (
            <code className="mono" style={{ background: "var(--surface-2)", borderRadius: 4, fontSize: 13, padding: "1px 5px" }}>{children}</code>
          ),
          li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
          ol: ({ children }) => <ol style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ol>,
          p: ({ children }) => <p style={{ margin: "0 0 6px" }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          ul: ({ children }) => <ul style={{ margin: "6px 0", paddingLeft: 20 }}>{children}</ul>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function AgentMessageCopyButton({ text }: { text: string }) {
  const { t } = useOrbitLanguage();
  const [copied, setCopied] = useState(false);

  return (
    <button
      aria-label={t({ en: "Copy message", zh: "复制消息" })}
      data-orbit-agent-message-copy={copied ? "copied" : "idle"}
      onClick={async () => setCopied(await copyAgentMessageText(text))}
      title={copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy", zh: "复制" })}
      type="button"
      style={{
        alignItems: "center",
        background: copied ? "var(--accent-soft)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        color: copied ? "var(--accent)" : "var(--text-3)",
        cursor: "pointer",
        display: "inline-flex",
        flexShrink: 0,
        height: 30,
        justifyContent: "center",
        width: 30,
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
    </button>
  );
}

function AgentHistoryList({
  activeQ,
  activeSessionId,
  history,
  onDelete,
  onPick,
  onRename,
  onTogglePin,
}: {
  activeQ: string;
  activeSessionId: string | null;
  history: OrbitAgentHistoryView[];
  onDelete: (history: OrbitAgentHistoryView) => void;
  onPick: (history: OrbitAgentHistoryView) => void;
  onRename: (history: OrbitAgentHistoryView, title: string) => void;
  onTogglePin: (history: OrbitAgentHistoryView) => void;
}) {
  const { t } = useOrbitLanguage();
  const [historyMenuOpenId, setHistoryMenuOpenId] = useState<string | null>(null);
  const [hoveredHistoryId, setHoveredHistoryId] = useState<string | null>(null);
  const [renamingHistoryId, setRenamingHistoryId] = useState<string | null>(null);
  const [renamingHistoryTitle, setRenamingHistoryTitle] = useState("");
  const groups = useMemo(() => [...new Set(history.map((item) => item.group))], [history]);

  const startRename = (item: OrbitAgentHistoryView) => {
    setHistoryMenuOpenId(null);
    setRenamingHistoryId(item.id);
    setRenamingHistoryTitle(item.title);
  };

  const finishRename = (item: OrbitAgentHistoryView) => {
    const title = renamingHistoryTitle.trim();

    if (title) {
      onRename(item, title);
    }

    setRenamingHistoryId(null);
    setRenamingHistoryTitle("");
  };

  useEffect(() => {
    if (!historyMenuOpenId) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryMenuOpenId(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyMenuOpenId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((group) => (
        <div key={group}>
          <div className="eyebrow" style={{ padding: "0 8px 6px" }}>
            {group}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {history
              .filter((item) => item.group === group)
              .map((item) => {
                const active = Boolean(
                  (item.sessionId && item.sessionId === activeSessionId) ||
                    (activeQ && item.q === activeQ),
                );
                const menuOpen = historyMenuOpenId === item.id;
                const renaming = renamingHistoryId === item.id;
                const controlsVisible = active || menuOpen || hoveredHistoryId === item.id;

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredHistoryId(item.id)}
                    onMouseLeave={() => {
                      setHoveredHistoryId((current) => (current === item.id ? null : current));
                    }}
                    style={{
                      alignItems: "center",
                      background: active ? "var(--accent-softer)" : "transparent",
                      borderRadius: "var(--r-sm)",
                      display: "flex",
                      gap: 10,
                      padding: "2px 4px 2px 10px",
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {renaming ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          finishRename(item);
                        }}
                        style={{ alignItems: "center", display: "flex", flex: 1, minWidth: 0, padding: "4px 0" }}
                      >
                        <input
                          autoFocus
                          data-orbit-agent-history-rename-input={item.sessionId}
                          onBlur={() => finishRename(item)}
                          onChange={(event) => setRenamingHistoryTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setRenamingHistoryId(null);
                              setRenamingHistoryTitle("");
                            }
                          }}
                          value={renamingHistoryTitle}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--accent)",
                            borderRadius: 8,
                            color: "var(--ink)",
                            flex: 1,
                            fontFamily: "var(--ff)",
                            fontSize: 14,
                            height: 30,
                            minWidth: 0,
                            outline: "none",
                            padding: "0 8px",
                          }}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryMenuOpenId(null);
                          onPick(item);
                        }}
                        style={{
                          alignItems: "center",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          flex: 1,
                          fontFamily: "var(--ff)",
                          gap: 10,
                          minWidth: 0,
                          padding: "7px 0",
                          textAlign: "left",
                        }}
                      >
                        <Icon name="message" size={15} color={active ? "var(--accent)" : "var(--text-4)"} />
                        <span style={{ color: active ? "var(--accent)" : "var(--text)", flex: 1, fontSize: 14, fontWeight: active ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </span>
                      </button>
                    )}
                    {item.sessionId ? (
                      <>
                        <button
                          aria-expanded={menuOpen}
                          aria-haspopup="menu"
                          aria-label={t({ en: "More actions", zh: "更多操作" })}
                          data-orbit-agent-history-menu-button={item.sessionId}
                          onClick={() => setHistoryMenuOpenId(menuOpen ? null : item.id)}
                          title={t({ en: "More actions", zh: "更多操作" })}
                          type="button"
                          style={{
                            alignItems: "center",
                            background: menuOpen ? "var(--surface-2)" : "transparent",
                            border: "none",
                            borderRadius: 8,
                            color: active ? "var(--accent)" : "var(--text-4)",
                            cursor: "pointer",
                            display: "flex",
                            flexShrink: 0,
                            height: 28,
                            justifyContent: "center",
                            opacity: controlsVisible ? 1 : 0.46,
                            width: 28,
                          }}
                        >
                          <Icon name="more" size={16} />
                        </button>
                        {menuOpen ? (
                          <div
                            data-orbit-agent-history-menu={item.sessionId}
                            role="menu"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              boxShadow: "var(--sh-pop)",
                              minWidth: 156,
                              padding: 6,
                              position: "absolute",
                              right: 2,
                              top: 36,
                              zIndex: 20,
                            }}
                          >
                            <button
                              data-orbit-agent-history-pin={item.sessionId}
                              onClick={() => {
                                setHistoryMenuOpenId(null);
                                onTogglePin(item);
                              }}
                              role="menuitem"
                              type="button"
                              style={{
                                alignItems: "center",
                                background: "transparent",
                                border: "none",
                                borderRadius: 8,
                                color: "var(--text)",
                                cursor: "pointer",
                                display: "flex",
                                fontFamily: "var(--ff)",
                                fontSize: 13,
                                fontWeight: 600,
                                gap: 8,
                                height: 34,
                                padding: "0 10px",
                                textAlign: "left",
                                width: "100%",
                              }}
                            >
                              <Icon name="pin" size={14} />
                              {item.pinned ? t({ en: "Unpin", zh: "取消置顶" }) : t({ en: "Pin", zh: "置顶" })}
                            </button>
                            <button
                              data-orbit-agent-history-rename={item.sessionId}
                              onClick={() => startRename(item)}
                              role="menuitem"
                              type="button"
                              style={{
                                alignItems: "center",
                                background: "transparent",
                                border: "none",
                                borderRadius: 8,
                                color: "var(--text)",
                                cursor: "pointer",
                                display: "flex",
                                fontFamily: "var(--ff)",
                                fontSize: 13,
                                fontWeight: 600,
                                gap: 8,
                                height: 34,
                                padding: "0 10px",
                                textAlign: "left",
                                width: "100%",
                              }}
                            >
                              <Icon name="edit" size={14} />
                              {t({ en: "Rename", zh: "重命名" })}
                            </button>
                            <div style={{ background: "var(--border)", height: 1, margin: "5px 4px" }} />
                            <button
                              data-orbit-agent-history-delete={item.sessionId}
                              onClick={() => {
                                setHistoryMenuOpenId(null);
                                onDelete(item);
                              }}
                              role="menuitem"
                              type="button"
                              style={{
                                alignItems: "center",
                                background: "transparent",
                                border: "none",
                                borderRadius: 8,
                                color: "var(--danger, #C2410C)",
                                cursor: "pointer",
                                display: "flex",
                                fontFamily: "var(--ff)",
                                fontSize: 13,
                                fontWeight: 600,
                                gap: 8,
                                height: 34,
                                padding: "0 10px",
                                textAlign: "left",
                                width: "100%",
                              }}
                            >
                              {t({ en: "Delete", zh: "删除对话" })}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
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
          en: "Tell me what you want to do. I will find the right people in your network, the right events to join, and how to start the conversation.",
          zh: "说出你想做的事，我帮你从人脉里找对的人、从活动里找对的局，并告诉你该怎么开口。",
        })}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "min(420px, 100%)" }}>
        {viewModel.suggests.map((suggest) => (
          <button
            key={suggest.label}
            type="button"
            onClick={() => onPick(suggest.q)}
            style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 13, cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 12, padding: "13px 15px", textAlign: "left" }}
          >
            <Icon name={suggest.icon} size={17} color="var(--accent)" />
            <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{agentSuggestLabel(suggest.label, language === "ja" ? "en" : language)}</span>
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
          <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{connection.displayName}</div>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[connection.title, connection.company].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{item.match}%</div>
          <div className="mono" style={{ color: "var(--text-4)", fontSize: 11 }}>{t({ en: "Match", zh: "匹配度" })}</div>
        </div>
      </div>
      <div style={{ background: "var(--surface-3)", borderRadius: 99, height: 6, marginTop: 12, overflow: "hidden" }}>
        <span style={{ background: "var(--accent-grad-bar)", display: "block", height: "100%", width: `${item.match}%` }} />
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 11 }}>
        <span style={{ alignItems: "center", background: status.soft, borderRadius: "var(--r-pill)", color: status.color, display: "inline-flex", fontSize: 12, fontWeight: 600, gap: 6, height: 24, padding: "0 10px" }}>
          <span style={{ background: status.color, borderRadius: "var(--r-pill)", height: 6, width: 6 }} />
          {status.label}
        </span>
        {connection.industry ? (
          <span className="chip" style={{ height: 24, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{connection.industry}</span>
        ) : null}
      </div>
      <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginTop: 11 }}>{item.reason}</div>
      <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 10, marginTop: 11, padding: 11 }}>
        <Icon name="message" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>{t({ en: "Why this person", zh: "推荐依据" })}</div>
          <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{item.opener}</div>
        </div>
      </div>
      <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 4, justifyContent: "flex-end", marginTop: 12 }}>
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
      <div style={{ display: "flex", gap: 14, padding: 15 }}>
        <Cover g={gradientFromString(event.code)} imageAlt={event.name} imageUrl={eventCoverPhoto(event.code)} monogram={eventCoverPhoto(event.code) ? null : { text: event.name.slice(0, 1), size: 22 }} style={{ borderRadius: 13, flexShrink: 0, height: 60, width: 60 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: "flex-start", display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{event.name}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>{dateLabel}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{item.score}</div>
              <div className="mono" style={{ color: "var(--text-4)", fontSize: 11 }}>{t({ en: "Score", zh: "匹配分" })}</div>
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
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 10, marginTop: 11, padding: 11 }}>
          <Icon name="sparkle" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>{t({ en: "How to network on site", zh: "怎么在现场社交" })}</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{item.howto}</div>
          </div>
        </div>
        <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 4, justifyContent: "flex-end", marginTop: 12 }}>
          {t({ en: "View event", zh: "查看活动" })}
          <Icon name="chevR" size={14} />
        </div>
      </div>
    </button>
  );
}

// 待办/行程卡片：到期 + 优先级 + 联系人 + 建议动作，点击进入跟进页复核。
function AgentTodoCard({ item, navigate, t }: { item: OrbitAgentTodoResultView; navigate: (href: string) => void; t: Translate }) {
  const priorityColor =
    item.priority === t({ en: "Today", zh: "今天" })
      ? { color: "var(--amber)", soft: "var(--amber-soft)" }
      : item.priority === t({ en: "This week", zh: "本周" })
        ? { color: "var(--sky)", soft: "var(--sky-soft)" }
        : { color: "var(--text-3)", soft: "var(--surface-2)" };

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", padding: 15, textAlign: "left", width: "100%" }} onClick={() => navigate("/home/schedule")}>
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <Avatar letter={(item.contactName || item.title).slice(0, 1).toUpperCase()} g={gradientFromString(item.contactName || item.id)} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[item.contactName, item.organization].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 17, fontWeight: 600, lineHeight: 1 }}>{item.due}</div>
          <div className="mono" style={{ color: "var(--text-4)", fontSize: 11 }}>{t({ en: "Due", zh: "到期" })}</div>
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 11 }}>
        <span style={{ alignItems: "center", background: priorityColor.soft, borderRadius: "var(--r-pill)", color: priorityColor.color, display: "inline-flex", fontSize: 12, fontWeight: 600, gap: 6, height: 24, padding: "0 10px" }}>
          <span style={{ background: priorityColor.color, borderRadius: "var(--r-pill)", height: 6, width: 6 }} />
          {item.priority}
        </span>
        {item.sourceLabel ? (
          <span className="chip" style={{ height: 24, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sourceLabel}</span>
        ) : null}
      </div>
      {item.reason ? (
        <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginTop: 11 }}>{item.reason}</div>
      ) : null}
      {item.task ? (
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 10, marginTop: 11, padding: 11 }}>
          <Icon name="clock" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>{t({ en: "Suggested action", zh: "建议动作" })}</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{item.task}</div>
          </div>
        </div>
      ) : null}
      <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 4, justifyContent: "flex-end", marginTop: 12 }}>
        {t({ en: "Open schedule", zh: "查看日程" })}
        <Icon name="chevR" size={14} />
      </div>
    </button>
  );
}

function PanelCards({ language, navigate, panel, t }: { language: "en" | "zh"; navigate: (href: string) => void; panel: AgentPanel; t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {panel.items.map((item, index) =>
        isPeopleResult(item) ? (
          <AgentPeopleCard key={`${item.connection.id}-${index}`} item={item} navigate={navigate} t={t} />
        ) : isTodoResult(item) ? (
          <AgentTodoCard key={`${item.id}-${index}`} item={item} navigate={navigate} t={t} />
        ) : (
          <AgentEventCard key={`${item.event.code}-${index}`} item={item} language={language} navigate={navigate} t={t} />
        ),
      )}
    </div>
  );
}

function ChatBox({ big, onChange, onSend, value }: { big?: boolean; onChange: (value: string) => void; onSend: () => void; value: string }) {
  const { t } = useOrbitLanguage();

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, boxShadow: "0 18px 50px rgba(99,89,233,0.12), 0 2px 8px rgba(18,18,28,0.05)", padding: big ? "18px 18px 12px" : "12px 12px 8px", width: "100%" }}>
      <textarea
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
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: big ? 8 : 4 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: "var(--r-pill)", color: "var(--accent)", display: "inline-flex", fontSize: 13, fontWeight: 600, gap: 6, height: 32, padding: "0 12px" }}>
            <Icon name="sparkle" size={14} />
            iOrbit
          </span>
          <span style={{ color: "var(--text-4)", fontSize: 12 }}>{t({ en: "Contacts · Events · Business value", zh: "人脉 · 活动 · 商业价值" })}</span>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label={t({ en: "Send", zh: "发送" })}
          style={{ alignItems: "center", background: value.trim() ? "var(--accent-grad)" : "var(--surface-3)", border: "none", borderRadius: 12, boxShadow: value.trim() ? "0 8px 18px rgba(99,76,226,0.28)" : "none", color: value.trim() ? "var(--on-dark)" : "var(--text-4)", cursor: value.trim() ? "pointer" : "default", display: "flex", height: 40, justifyContent: "center", width: 40 }}
        >
          <Icon name="arrow" size={19} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ animation: `blink 1s ${index * 0.2}s infinite`, background: "var(--text-4)", borderRadius: "var(--r-pill)", height: 6, width: 6 }} />
      ))}
    </span>
  );
}

// 真实链路是单次请求（planner → 工具 → artifact → synthesis），没有流式分阶段
// 回调，等待可能好几秒。为了不让用户对着一个静止的点发呆，这里按时间推进一串
// “正在…”阶段文案（理解→检索→深度思考→整理），配合跳动圆点，营造进度感。
// 纯展示：文案与真实进度无严格对应，只按固定节奏往后走并停在最后一个。
const THINKING_PHASES: readonly Copy[] = [
  { en: "Understanding your request", zh: "正在理解你的需求" },
  { en: "Searching your network & events", zh: "正在检索信息" },
  { en: "Thinking it through", zh: "正在深度思考中" },
  { en: "Composing recommendations", zh: "正在整理答复" },
];

const THINKING_PHASE_INTERVAL_MS = 2200;

function ThinkingIndicator({ t }: { t: Translate }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // 组件仅在 thinking=true 时挂载，所以挂载即等待开始；到最后一个阶段就停。
    const timer = window.setInterval(() => {
      setPhase((current) =>
        current >= THINKING_PHASES.length - 1 ? current : current + 1,
      );
    }, THINKING_PHASE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <span aria-live="polite" style={{ alignItems: "center", display: "inline-flex", gap: 9 }}>
      <span style={{ color: "var(--text-2)", fontSize: 14 }}>{t(THINKING_PHASES[phase])}</span>
      <TypingDots />
    </span>
  );
}

export function OrbitRealAgent({ viewModel }: OrbitRealAgentProps) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [panel, setPanel] = useState<AgentPanel | null>(null);
  const [thinking, setThinking] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [activeQ, setActiveQ] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historySidebarResizing, setHistorySidebarResizing] = useState(false);
  const [historySidebarWidth, setHistorySidebarWidth] = useState(
    HISTORY_SIDEBAR_DEFAULT_WIDTH,
  );
  const [storedSessions, setStoredSessions] = useState<AgentStoredChatSession[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const historyResizeRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const languageRef = useRef(language);
  const messagesRef = useRef<AgentMessage[]>(messages);
  const storedSessionsRef = useRef<AgentStoredChatSession[]>(storedSessions);
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  const historyHydratedRef = useRef(false);

  languageRef.current = language;
  messagesRef.current = messages;
  storedSessionsRef.current = storedSessions;
  activeSessionIdRef.current = activeSessionId;
  const storedHistory = useMemo(
    () => agentChatHistorySessionsToHistory(storedSessions, language),
    [language, storedSessions],
  );

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

  const restoreSession = useCallback((session: AgentStoredChatSession) => {
    setHistOpen(false);
    setMessages(session.messages);
    setPanel(session.panel ?? panelFromMessages(session.messages));
    setText("");
    setThinking(false);
    setActiveQ("");
    setActiveSessionId(session.id);
    activeSessionIdRef.current = session.id;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
        session.id,
      );
    }
  }, []);

  const persistCurrentSession = useCallback((
    nextMessages: readonly AgentMessage[],
    nextPanel: AgentPanel | null,
  ) => {
    if (!historyHydratedRef.current || nextMessages.length === 0) {
      return;
    }

    const hasUserMessage = nextMessages.some((message) => message.role === "user");
    if (!hasUserMessage) {
      return;
    }

    const sessionId = activeSessionIdRef.current ?? createAgentSessionId();
    const now = new Date().toISOString();
    const existingSession = storedSessionsRef.current.find(
      (item) => item.id === sessionId,
    );
    const customTitle = existingSession?.customTitle?.trim();
    const autoTitle = titleFromMessages(nextMessages);
    const session: AgentStoredChatSession = {
      createdAt: existingSession?.createdAt ?? now,
      customTitle,
      id: sessionId,
      messages: [...nextMessages],
      panel: nextPanel,
      pinned: existingSession?.pinned,
      title: customTitle || autoTitle,
      updatedAt: now,
    };
    const nextSessions = upsertAgentChatSession(
      storedSessionsRef.current,
      session,
    );

    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    storedSessionsRef.current = nextSessions;
    setStoredSessions(nextSessions);
    void persistStoredAgentChatSession(session);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
        sessionId,
      );
    }
  }, []);

  // 真实链路：把用户消息发给 Orbit Agent conversation API（planner → 白名单工具 →
  // 可复核 artifact → synthesis），并把 contact_recommendations artifact 映射到侧边栏。
  const ask = useCallback(async (query: string) => {
    const locale = languageRef.current === "zh" ? "zh" : "en";
    const failureText =
      locale === "zh"
        ? "Agent 暂时无法完成这次回复，请稍后再试。"
        : "The agent could not complete this reply. Please try again.";

    // 发送前抓取已有轮次作为对话历史，让服务端 planner 能接住追问里的指代；
    // 推荐轮附带结构化明细，追问时间/地点/理由时模型可直接作答。
    const history = messagesRef.current
      .map((turn) => ({ content: historyContentFor(turn), role: turn.role }))
      .filter((turn) => turn.content)
      .slice(-8);

    setMessages((current) => [...current, { role: "user", text: query }]);
    setThinking(true);
    // 等待回复期间保留现有侧边栏；新回复带结果时才替换。

    try {
      const response = await fetch("/api/ai/conversations", {
        body: JSON.stringify({ history, locale, message: query }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { artifacts?: unknown; assistantMessage?: string };
        error?: { message?: string };
        success?: boolean;
      } | null;

      if (!response.ok || payload?.success !== true || !payload.data) {
        const errorText = payload?.error?.message
          ? `${failureText}（${payload.error.message}）`
          : failureText;

        setMessages((current) => [
          ...current,
          { items: [], kind: "people", panelTitle: "", role: "assistant", text: errorText },
        ]);
        return;
      }

      const contactArtifact = artifactOfKind(
        payload.data.artifacts,
        "contact_recommendations",
      );
      const eventArtifact = artifactOfKind(
        payload.data.artifacts,
        "event_recommendations",
      );
      const followupArtifact = artifactOfKind(
        payload.data.artifacts,
        "followup_queue",
      );
      const peopleItems = peopleItemsFromArtifact(contactArtifact);
      const eventItems =
        peopleItems.length > 0 ? [] : eventItemsFromArtifact(eventArtifact);
      const todoItems =
        peopleItems.length > 0 || eventItems.length > 0
          ? []
          : todoItemsFromArtifact(followupArtifact);
      const kind: "people" | "events" | "todos" =
        eventItems.length > 0 ? "events" : todoItems.length > 0 ? "todos" : "people";
      const items =
        kind === "events" ? eventItems : kind === "todos" ? todoItems : peopleItems;
      const activeArtifact =
        kind === "events"
          ? eventArtifact
          : kind === "todos"
            ? followupArtifact
            : contactArtifact;
      const panelTitle =
        activeArtifact?.result?.presentation?.title?.trim() ||
        (kind === "events"
          ? locale === "zh"
            ? "活动推荐"
            : "Recommended events"
          : kind === "todos"
            ? locale === "zh"
              ? "行程与跟进"
              : "Schedule & follow-ups"
            : locale === "zh"
              ? "人脉推荐"
              : "Recommended contacts");
      const assistantText =
        payload.data.assistantMessage?.trim() ||
        activeArtifact?.result?.generatedView?.summary ||
        failureText;

      setMessages((current) => [
        ...current,
        {
          items,
          kind,
          panelTitle,
          role: "assistant",
          text: assistantText,
        },
      ]);

      if (items.length > 0) {
        setPanel({ items, kind, panelTitle });
      }
    } catch {
      setMessages((current) => [
        ...current,
        { items: [], kind: "people", panelTitle: "", role: "assistant", text: failureText },
      ]);
    } finally {
      setThinking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateHistory = async () => {
      const sessionId =
        currentAgentSessionId() ||
        (typeof window !== "undefined"
          ? window.localStorage.getItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY) ?? ""
          : "");
      const sessions = await loadStoredAgentChatSessions();

      if (cancelled) {
        return;
      }

      let session =
        sessions.find((item) => item.id === sessionId) ??
        (sessionId ? await loadStoredAgentChatSession(sessionId) : null);

      if (cancelled) {
        return;
      }

      const nextSessions = session
        ? upsertAgentChatSession(sessions, session)
        : sessions;

      storedSessionsRef.current = nextSessions;
      setStoredSessions(nextSessions);
      historyHydratedRef.current = true;

      if (session) {
        restoreSession(session);
        return;
      }

      const query = currentAgentQuery();
      setActiveQ(query);
      if (query) {
        setMessages([]);
        setPanel(null);
        setText("");
        setActiveSessionId(null);
        activeSessionIdRef.current = null;
        void ask(query);
      }
    };

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [ask, restoreSession]);

  useEffect(() => {
    persistCurrentSession(messages, panel);
  }, [messages, panel, persistCurrentSession]);

  useEffect(() => {
    const scroll = scrollRef.current;
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
    if (!historySidebarResizing) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const resize = historyResizeRef.current;
      if (!resize) {
        return;
      }

      setHistorySidebarWidth(
        clampHistorySidebarWidth(
          resize.startWidth + event.clientX - resize.startX,
        ),
      );
    };
    const stopResize = () => {
      historyResizeRef.current = null;
      setHistorySidebarResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [historySidebarResizing]);

  const startHistorySidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      historyResizeRef.current = {
        startWidth: historySidebarWidth,
        startX: event.clientX,
      };
      setHistorySidebarResizing(true);
    },
    [historySidebarWidth],
  );

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    ask(value);
  };

  const pickHistory = (item: OrbitAgentHistoryView) => {
    if (item.sessionId) {
      const session = storedSessionsRef.current.find(
        (stored) => stored.id === item.sessionId,
      );
      if (session) {
        restoreSession(session);
        navigate(`/agent?session=${encodeURIComponent(session.id)}`);
        return;
      }

      void loadStoredAgentChatSession(item.sessionId).then((storedSession) => {
        if (!storedSession) {
          return;
        }

        const nextSessions = upsertAgentChatSession(
          storedSessionsRef.current,
          storedSession,
        );
        storedSessionsRef.current = nextSessions;
        setStoredSessions(nextSessions);
        restoreSession(storedSession);
        navigate(`/agent?session=${encodeURIComponent(storedSession.id)}`);
      });
      return;
    }

    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    navigate(`/agent?q=${encodeURIComponent(item.q)}`);
    void ask(item.q);
  };

  const newChat = () => {
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    setThinking(false);
    setActiveQ("");
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY);
    }
    navigate("/agent");
  };

  const updateHistorySession = (
    sessionId: string,
    update: (session: AgentStoredChatSession) => AgentStoredChatSession,
  ) => {
    const currentSession = storedSessionsRef.current.find(
      (session) => session.id === sessionId,
    );

    if (!currentSession) {
      return;
    }

    const nextSession = {
      ...update(currentSession),
      updatedAt: new Date().toISOString(),
    };
    const nextSessions = upsertAgentChatSession(
      storedSessionsRef.current,
      nextSession,
    );

    storedSessionsRef.current = nextSessions;
    setStoredSessions(nextSessions);
    void persistStoredAgentChatSession(nextSession);
  };

  const togglePinnedHistorySession = (item: OrbitAgentHistoryView) => {
    if (!item.sessionId) {
      return;
    }

    updateHistorySession(item.sessionId, (session) => ({
      ...session,
      pinned: !session.pinned,
    }));
  };

  const renameHistorySession = (
    item: OrbitAgentHistoryView,
    title: string,
  ) => {
    if (!item.sessionId) {
      return;
    }

    const customTitle = title.trim();
    if (!customTitle) {
      return;
    }

    updateHistorySession(item.sessionId, (session) => ({
      ...session,
      customTitle,
      title: customTitle,
    }));
  };

  const deleteHistorySession = (item: OrbitAgentHistoryView) => {
    if (!item.sessionId) {
      return;
    }

    const sessionId = item.sessionId;
    const nextSessions = storedSessionsRef.current.filter(
      (session) => session.id !== sessionId,
    );

    storedSessionsRef.current = nextSessions;
    setStoredSessions(nextSessions);
    void deleteStoredAgentChatSession(sessionId);

    if (activeSessionIdRef.current !== sessionId) {
      return;
    }

    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    setThinking(false);
    setActiveQ("");
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY);
    }
    navigate("/agent");
  };

  const renderBubbles = (inlinePanel: boolean) => (
    <>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={`user-${index}`} style={{ alignItems: "flex-end", display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 }}>
            <AgentMessageCopyButton text={message.text} />
            <div style={{ background: "var(--accent)", borderRadius: "16px 16px 4px 16px", color: "var(--on-dark)", fontSize: 15, lineHeight: 1.55, maxWidth: "82%", padding: "11px 15px" }}>{message.text}</div>
          </div>
        ) : (
          <div key={`assistant-${index}`} style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <span className="avatar g-indigo" style={{ borderRadius: "var(--r-sm)", flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
              <Icon name="sparkle" size={16} color="var(--on-dark)" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {message.note ? (
                <div style={{ alignItems: "center", background: "var(--amber-soft)", borderRadius: 12, color: "var(--amber)", display: "inline-flex", fontSize: 13, fontWeight: 600, gap: 8, marginBottom: 10, padding: "7px 12px" }}>
                  <Icon name="eye" size={14} />
                  {message.note}
                </div>
              ) : null}
              <div style={{ alignItems: "flex-end", display: "flex", gap: 8 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", color: "var(--text)", flex: 1, fontSize: 15, lineHeight: 1.6, minWidth: 0, padding: "12px 15px" }}>
                  <AgentMarkdown text={message.text} />
                </div>
                <AgentMessageCopyButton text={message.text} />
              </div>
              {inlinePanel && message.items.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{message.panelTitle}</div>
                  <PanelCards language={language === "ja" ? "en" : language} panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }} navigate={navigate} t={t} />
                </div>
              ) : null}
            </div>
          </div>
        ),
      )}
      {thinking ? (
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <span className="avatar g-indigo" style={{ borderRadius: "var(--r-sm)", flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
            <Icon name="sparkle" size={16} color="var(--on-dark)" />
          </span>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "12px 16px" }}>
            <ThinkingIndicator t={t} />
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div data-orbit-real-page="agent" style={{ background: "var(--bg-soft)", display: "flex", flexDirection: "column", height: "100dvh" }}>
      <div className="orbit-desktop-only">
        {/* No rightExtra here: the "New chat" action already lives in the
            sidebar below, so the desktop top-nav stays identical to the
            homepage / other product pages (brand · links · 中/EN · Me). */}
        <AccountTopNav active="agent" />
      </div>
      <div className="orbit-mobile-only" style={{ flexShrink: 0 }}>
        <AccountTopNav
          active="agent"
          rightExtra={(
            <button aria-label={t({ en: "Chat history", zh: "对话历史" })} className="orbit-top-icon-btn orbit-agent-history-btn" onClick={() => setHistOpen(true)} type="button">
              <Icon name="clock" size={16} />
            </button>
          )}
        />
      </div>

      <div className="orbit-desktop-only" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside data-orbit-agent-history-sidebar style={{ background: "var(--bg)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, maxWidth: HISTORY_SIDEBAR_MAX_WIDTH, minWidth: HISTORY_SIDEBAR_MIN_WIDTH, width: historySidebarWidth }}>
          <div style={{ padding: 14 }}>
            <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 600, gap: 8, height: 40, justifyContent: "center", width: "100%" }}>
              <Icon name="plus" size={16} color="var(--accent)" />
              {t({ en: "New chat", zh: "新对话" })}
            </button>
          </div>
          <div style={{ padding: "4px 18px 8px" }}>
            <div className="eyebrow">{t({ en: "Chat history", zh: "对话历史" })}</div>
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 10px 18px" }}>
            <AgentHistoryList activeQ={activeQ} activeSessionId={activeSessionId} history={storedHistory} onDelete={deleteHistorySession} onPick={pickHistory} onRename={renameHistorySession} onTogglePin={togglePinnedHistorySession} />
          </div>
        </aside>
        <button
          aria-label={t({ en: "Resize chat history", zh: "调整历史宽度" })}
          aria-orientation="vertical"
          data-orbit-agent-history-resize-handle
          onPointerDown={startHistorySidebarResize}
          role="separator"
          title={t({ en: "Resize chat history", zh: "调整历史宽度" })}
          type="button"
          style={{
            alignSelf: "stretch",
            background: historySidebarResizing ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderRight: "1px solid var(--border)",
            cursor: "col-resize",
            flexShrink: 0,
            padding: 0,
            width: 8,
          }}
        />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
          <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(false)}
            </div>
          </div>
          <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "12px 28px 18px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              <ChatBox value={text} onChange={setText} onSend={send} />
            </div>
          </div>
        </div>
        {panel ? (
          <aside key={`${panel.panelTitle}-${messages.length}`} style={{ animation: "agentpanel .32s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, width: 444 }}>
            <div style={{ borderBottom: "1px solid var(--border)", padding: "18px 20px 12px" }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 9, color: "var(--accent)", display: "flex", height: 30, justifyContent: "center", width: 30 }}>
                  <Icon name={panel.kind === "people" ? "users" : "calendar"} size={17} />
                </span>
                <h3 className="h-section">{panel.panelTitle}</h3>
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                {panel.kind === "people"
                  ? t({ en: "Click a card to open the contact page.", zh: "点卡片可直接跳转到对应名片页" })
                  : t({ en: "Click a card to open the event page.", zh: "点卡片可直接跳转到对应活动页" })}
              </div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 24px" }}>
              <PanelCards language={language === "ja" ? "en" : language} panel={panel} navigate={navigate} t={t} />
            </div>
          </aside>
        ) : null}
      </div>

      <div className="orbit-mobile-only" style={{ flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 16px 12px" }}>
          {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(true)}
        </div>
        <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "10px 16px 18px" }}>
          <ChatBox value={text} onChange={setText} onSend={send} />
        </div>
      </div>

      {histOpen ? (
        <div className="orbit-mobile-only" style={{ inset: 0, position: "fixed", zIndex: 90 }}>
          <div onClick={() => setHistOpen(false)} style={{ backdropFilter: "blur(3px)", background: "var(--scrim)", inset: 0, position: "absolute" }} />
          <div style={{ animation: "slideInLeft .26s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", bottom: 0, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", left: 0, maxWidth: 320, position: "absolute", top: 0, width: "84%" }}>
            <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, height: 54, padding: "0 14px" }}>
              <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{t({ en: "Chat history", zh: "对话历史" })}</span>
              <div style={{ flex: 1 }} />
              <button type="button" className="hit-44" onClick={() => setHistOpen(false)} aria-label={t({ en: "Close", zh: "关闭" })} style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: "var(--r-pill)", color: "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 15, height: 30, justifyContent: "center", width: 30 }}><Icon name="x" size={16} /></button>
            </div>
            <div style={{ padding: 12 }}>
              <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 600, gap: 8, height: 40, justifyContent: "center", width: "100%" }}>
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
                <button key={href} type="button" onClick={() => { setHistOpen(false); navigate(href); }} style={{ alignItems: "center", background: "none", border: "none", borderRadius: 9, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 600, gap: 12, padding: "9px 8px", textAlign: "left", width: "100%" }}>
                  <Icon name={icon} size={17} color="var(--accent)" />
                  {label}
                </button>
              ))}
              <div style={{ background: "var(--border)", height: 1, margin: "7px 8px 2px" }} />
              <div className="eyebrow" style={{ padding: "2px 8px 4px" }}>{t({ en: "Chat history", zh: "对话历史" })}</div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 18px" }}>
              <AgentHistoryList activeQ={activeQ} activeSessionId={activeSessionId} history={storedHistory} onDelete={deleteHistorySession} onPick={pickHistory} onRename={renameHistorySession} onTogglePin={togglePinnedHistorySession} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
