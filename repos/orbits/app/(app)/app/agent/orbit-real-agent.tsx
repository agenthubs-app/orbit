"use client";

import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { eventCoverPhoto } from "../orbit-event-cover-photo";
import { EventCover } from "../events/orbit-event-cover";
import { useOrbitLanguage } from "../orbit-language-context";
import { useOrbitModalA11y } from "../orbit-modal-a11y";
import { productHref } from "../orbit-public-shell";
import { Avatar, Icon, IconButton, gradientFromString } from "../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { ORBIT_Z } from "../orbit-z";
import { AgentActionStatusCard } from "./agent-action-status-card";
import { AgentOutcomeFeedback } from "./agent-outcome-feedback";
import { OrbitAgentDashboard } from "./orbit-agent-dashboard";
import type { OrbitHomeViewModel } from "../orbit-home-route-view-model";

interface OrbitRealAgentProps {
  home?: OrbitHomeViewModel | null;
  viewModel: OrbitAgentViewModel;
}

type AgentPanel = Pick<OrbitAgentScenarioView, "items" | "kind" | "panelTitle">;

type AgentMessage =
  | { role: "user"; text: string }
  | {
      actionIds?: readonly string[];
      evidenceRefs?: readonly AgentEvidenceRef[];
      items: OrbitAgentScenarioView["items"];
      kind: OrbitAgentScenarioView["kind"];
      note?: string;
      panelTitle: string;
      retryRequest?: string;
      role: "assistant";
      runId?: string;
      text: string;
    };

export function agentRetryRequestForAssistant(
  messages: readonly AgentMessage[],
  assistantIndex: number,
): string | null {
  for (
    let index = Math.min(assistantIndex - 1, messages.length - 1);
    index >= 0;
    index -= 1
  ) {
    const message = messages[index];
    if (message?.role === "user") {
      const text = message.text.trim();
      return text || null;
    }
  }

  return null;
}

export function prepareAgentFailedRequestRetry(
  messages: readonly AgentMessage[],
  assistantIndex: number,
): {
  historyMessages: AgentMessage[];
  query: string;
  visibleMessages: AgentMessage[];
} | null {
  const failedMessage = messages[assistantIndex];
  if (
    failedMessage?.role !== "assistant" ||
    !failedMessage.retryRequest?.trim()
  ) {
    return null;
  }

  let userIndex = -1;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      userIndex = index;
      break;
    }
  }
  if (userIndex < 0) {
    return null;
  }

  return {
    historyMessages: messages.filter(
      (_message, index) => index !== userIndex && index !== assistantIndex,
    ),
    query: failedMessage.retryRequest.trim(),
    visibleMessages: messages.filter(
      (_message, index) => index !== assistantIndex,
    ),
  };
}

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;
type AgentHistoryLanguage = "en" | "zh" | "ja";
type AgentHistoryFeedback = {
  kind: "error" | "success";
  text: string;
};

export interface AgentEvidenceRef {
  evidenceIds: readonly string[];
  generatedAt: string;
  itemCount: number;
  label: string;
  sourceModules: readonly string[];
}

function agentEvidenceRefIdentity(reference: AgentEvidenceRef): string {
  return JSON.stringify({
    evidenceIds: [...reference.evidenceIds].sort(),
    generatedAt: reference.generatedAt,
    itemCount: reference.itemCount,
    label: reference.label,
    sourceModules: [...reference.sourceModules].sort(),
  });
}

export function uniqueAgentEvidenceRefs(
  references: readonly AgentEvidenceRef[],
): AgentEvidenceRef[] {
  const merged: AgentEvidenceRef[] = [];
  const evidenceGroupIndexes = new Map<string, number>();
  const unkeyedReferences = new Set<string>();

  for (const reference of references) {
    const evidenceIds = [...new Set(reference.evidenceIds)];
    if (evidenceIds.length === 0) {
      const identity = agentEvidenceRefIdentity(reference);
      if (!unkeyedReferences.has(identity)) {
        unkeyedReferences.add(identity);
        merged.push(reference);
      }
      continue;
    }

    const groupIdentity = JSON.stringify({
      generatedAt: reference.generatedAt,
      label: reference.label,
      sourceModules: [...reference.sourceModules].sort(),
    });
    const existingIndex = evidenceGroupIndexes.get(groupIdentity);
    if (typeof existingIndex === "undefined") {
      evidenceGroupIndexes.set(groupIdentity, merged.length);
      merged.push({
        ...reference,
        evidenceIds,
        itemCount: Math.max(reference.itemCount, evidenceIds.length),
      });
      continue;
    }

    const existing = merged[existingIndex];
    const combinedEvidenceIds = [
      ...new Set([...existing.evidenceIds, ...evidenceIds]),
    ];
    merged[existingIndex] = {
      ...existing,
      evidenceIds: combinedEvidenceIds,
      itemCount: Math.max(
        existing.itemCount,
        reference.itemCount,
        combinedEvidenceIds.length,
      ),
    };
  }

  return merged;
}

const AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY = "orbit-agent-chat-active-session-v1";
const AGENT_CHAT_SESSIONS_API_PATH = "/api/ai/conversations/sessions";
const MAX_AGENT_CHAT_HISTORY_SESSIONS = 12;
const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH;
const HISTORY_SIDEBAR_MAX_WIDTH = 380;
const HISTORY_SIDEBAR_MIN_WIDTH = 180;
const MAX_AGENT_CHAT_TITLE_LENGTH = 18;

function depthFor(t: Translate) {
  return {
    to_contact: { label: t({ en: "To break ice · Just met", zh: "待破冰 · 一面之缘" }), color: "var(--amber)", soft: "var(--amber-soft)", text: "var(--amber)" },
    in_progress: { label: t({ en: "In progress · In touch", zh: "在推进 · 已有交流" }), color: "var(--sky)", soft: "var(--sky-soft)", text: "var(--sky)" },
    partnered: { label: t({ en: "Partnered · Solid", zh: "已合作 · 关系稳固" }), color: "var(--live)", soft: "var(--live-soft)", text: "var(--live-text)" },
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

// /api/ai/conversations 返回的 artifact 载荷里，本页消费联系人、活动和待办
// generatedView。这里做本页自己的 view-model 映射，不直接把 raw payload 交给卡片。
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
    provenance?: {
      evidenceIds?: readonly string[];
      generatedAt?: string;
      sourceModules?: readonly string[];
    };
  };
  task?: { kind?: string };
}

function evidenceRefsFromArtifacts(artifacts: unknown): AgentEvidenceRef[] {
  if (!Array.isArray(artifacts)) return [];

  return uniqueAgentEvidenceRefs(
    (artifacts as AgentArtifactRecord[]).flatMap((artifact) => {
      const provenance = artifact.result?.provenance;
      const label = artifact.result?.presentation?.title?.trim();
      if (!provenance || !label) return [];
      const items =
        artifact.result?.generatedView?.sections?.flatMap(
          (section) => section.items ?? [],
        ) ?? [];
      return [
        {
          evidenceIds: [...new Set(provenance.evidenceIds ?? [])],
          generatedAt: provenance.generatedAt ?? "",
          itemCount: items.length,
          label,
          sourceModules: [...new Set(provenance.sourceModules ?? [])],
        },
      ];
    }),
  );
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
    typeof value.panelTitle === "string" &&
    (typeof value.runId === "undefined" || typeof value.runId === "string") &&
    (typeof value.retryRequest === "undefined" ||
      typeof value.retryRequest === "string") &&
    (typeof value.actionIds === "undefined" ||
      (Array.isArray(value.actionIds) &&
        value.actionIds.every((actionId) => typeof actionId === "string"))) &&
    (typeof value.evidenceRefs === "undefined" ||
      (Array.isArray(value.evidenceRefs) &&
        value.evidenceRefs.every(
          (reference) =>
            isRecord(reference) &&
            typeof reference.label === "string" &&
            typeof reference.itemCount === "number" &&
            typeof reference.generatedAt === "string" &&
            Array.isArray(reference.evidenceIds) &&
            Array.isArray(reference.sourceModules),
        )))
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

function parseStoredAgentMessage(value: unknown): AgentMessage | null {
  if (isStoredAgentMessage(value)) {
    return value.role === "assistant" && value.evidenceRefs
      ? {
          ...value,
          evidenceRefs: uniqueAgentEvidenceRefs(value.evidenceRefs),
        }
      : value;
  }

  if (
    isRecord(value) &&
    value.role === "assistant" &&
    typeof value.text === "string"
  ) {
    return {
      items: [],
      kind: "people",
      panelTitle: "",
      role: "assistant",
      text: value.text,
    };
  }

  return null;
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
        ? session.messages
            .flatMap((message) => {
              const parsed = parseStoredAgentMessage(message);

              return parsed ? [parsed] : [];
            })
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
    .replace(/^基于我在\s*Orbit\s*中(?:已有|现有)的?\s*/i, "")
    .replace(/^在我(?:已有|现有)的?\s*/i, "")
    .replace(/^(今天|明天|本周|下周|这个月|本月|适合|適合|关于|有关|围绕)\s*/i, "")
    .replace(/(的人|的联系人|联系人|人脉|活动|会议|峰会|邮件|消息|草稿)$/i, "")
    .replace(/^(人脉|联系人)中$/i, "现有人脉")
    .trim();
  const joiner = /^[\x00-\x7F]+$/.test(text) && /[^\x00-\x7F]/.test(suffix) ? " " : "";
  const title = suffix && text && !text.includes(suffix) ? `${text}${joiner}${suffix}` : text;

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

  const existingNetworkSubject = firstClause.match(
    /^在我(?:已有|现有)的?(?:人脉|联系人)中(?:找|推荐|筛选)?\s*(.*)$/i,
  );
  if (existingNetworkSubject) {
    const subject = cleanAgentTitleText(existingNetworkSubject[1] ?? "");
    return subject ? compactTitlePhrase(subject, "人脉") : "现有人脉";
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
  const hasNegatedDraftIntent =
    /(?:不要|无需|不需要|禁止|请勿).{0,8}(?:发送|起草|生成)?(?:邮件|消息|草稿)|(?:do not|don't|without).{0,16}(?:send|write|draft)?(?:email|message|draft)/i.test(
      cleaned,
    );
  const hasDraftIntent =
    !hasNegatedDraftIntent &&
    /邮件|消息|草稿|email|message|draft/i.test(cleaned);
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

export function agentChatHistoryMutationWasPersisted(
  value: unknown,
): boolean {
  return (
    isRecord(value) &&
    value.success === true &&
    isRecord(value.data) &&
    isRecord(value.data.storage) &&
    value.data.storage.persisted === true
  );
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

    return response.ok && agentChatHistoryMutationWasPersisted(payload);
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

    return response.ok && agentChatHistoryMutationWasPersisted(payload);
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
    <div className="orbit-agent-markdown" style={{ marginBottom: -6 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" style={{ color: "var(--accent)" }} target="_blank">{children}</a>
          ),
          code: ({ children }) => (
            <code className="mono" style={{ background: "var(--surface-2)", borderRadius: "var(--r-xs)", fontSize: 13, padding: "1px 5px" }}>{children}</code>
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
      className="orbit-agent-message-copy"
      data-orbit-agent-message-copy={copied ? "copied" : "idle"}
      onClick={async () => setCopied(await copyAgentMessageText(text))}
      title={copied ? t({ en: "Copied", zh: "已复制" }) : t({ en: "Copy", zh: "复制" })}
      type="button"
      style={{
        alignItems: "center",
        background: copied ? "var(--accent-soft)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
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

function toggleAgentEvidenceSourcesFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const details = event.currentTarget.parentElement;
  if (!(details instanceof HTMLDetailsElement)) {
    return;
  }

  event.preventDefault();
  details.open = !details.open;
}

function AgentEvidenceSources({
  references,
}: {
  references: readonly AgentEvidenceRef[];
}) {
  const { t } = useOrbitLanguage();
  if (references.length === 0) return null;
  const totalItems = references.reduce(
    (total, reference) => total + reference.itemCount,
    0,
  );

  return (
    <details
      data-agent-evidence-sources
      style={{
        borderTop: "1px solid var(--border)",
        color: "var(--text-3)",
        fontSize: 11,
        marginTop: 10,
        paddingTop: 8,
      }}
    >
      <summary
        onKeyDown={toggleAgentEvidenceSourcesFromKeyboard}
        style={{ cursor: "pointer", fontWeight: 600 }}
      >
        {t({
          en: `Sources · ${totalItems} records`,
          zh: `查看依据 · ${totalItems} 条真实记录`,
        })}
      </summary>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {references.map((reference, index) => (
          <div
            key={`${reference.label}:${reference.generatedAt}:${index}`}
            style={{ display: "grid", gap: 4 }}
          >
            <span style={{ color: "var(--text-2)" }}>
              {reference.label} · {reference.itemCount}
            </span>
            <span>
              {t({ en: "Source", zh: "来源" })}:{" "}
              {reference.sourceModules.join(" · ") || "Orbit"}
              {reference.generatedAt
                ? ` · ${new Date(reference.generatedAt).toLocaleString()}`
                : ""}
            </span>
            {reference.evidenceIds.length > 0 ? (
              <span className="mono" style={{ overflowWrap: "anywhere" }}>
                {reference.evidenceIds.slice(0, 3).join(" · ")}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </details>
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
  pendingSessionId,
}: {
  activeQ: string;
  activeSessionId: string | null;
  history: OrbitAgentHistoryView[];
  onDelete: (history: OrbitAgentHistoryView) => void;
  onPick: (history: OrbitAgentHistoryView) => void;
  onRename: (history: OrbitAgentHistoryView, title: string) => void;
  onTogglePin: (history: OrbitAgentHistoryView) => void;
  pendingSessionId: string | null;
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

  const cancelRename = () => {
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
    <div className="orbit-agent-history-list" style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((group) => (
        <div key={group}>
          <div className="eyebrow orbit-agent-history-group">
            {group}
          </div>
          <div className="orbit-agent-history-group-list" style={{ display: "flex", flexDirection: "column" }}>
            {history
              .filter((item) => item.group === group)
              .map((item) => {
                const active = Boolean(
                  (item.sessionId && item.sessionId === activeSessionId) ||
                    (activeQ && item.q === activeQ),
                );
                const menuOpen = historyMenuOpenId === item.id;
                const renaming = renamingHistoryId === item.id;
                const pending = item.sessionId === pendingSessionId;
                const controlsVisible = active || menuOpen || hoveredHistoryId === item.id;

                return (
                  <div
                    aria-busy={pending}
                    className={`orbit-agent-history-row${active ? " is-active" : ""}`}
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
                      gap: 4,
                      padding: "2px 4px",
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
                        style={{ alignItems: "center", display: "flex", flex: 1, gap: 4, minWidth: 0, padding: "4px 0" }}
                      >
                        <input
                          aria-label={t({ en: "Rename conversation", zh: "重命名对话" })}
                          autoFocus
                          data-orbit-agent-history-rename-input={item.sessionId}
                          onChange={(event) => setRenamingHistoryTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRename();
                            }
                          }}
                          value={renamingHistoryTitle}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--accent)",
                            borderRadius: "var(--r-xs)",
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
                        <button
                          aria-label={t({ en: "Save conversation name", zh: "保存对话名称" })}
                          className="btn btn-icon btn-quiet"
                          data-orbit-agent-history-save-rename={item.sessionId}
                          disabled={!renamingHistoryTitle.trim()}
                          title={t({ en: "Save", zh: "保存" })}
                          type="submit"
                          style={{ height: 30, width: 30 }}
                        >
                          <Icon name="check" size={14} />
                        </button>
                        <button
                          aria-label={t({ en: "Cancel conversation rename", zh: "取消重命名对话" })}
                          className="btn btn-icon btn-quiet"
                          data-orbit-agent-history-cancel-rename={item.sessionId}
                          onClick={cancelRename}
                          title={t({ en: "Cancel", zh: "取消" })}
                          type="button"
                          style={{ height: 30, width: 30 }}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        className="btn btn-quiet orbit-agent-history-entry"
                        type="button"
                        onClick={() => {
                          setHistoryMenuOpenId(null);
                          onPick(item);
                        }}
                        title={item.q || item.title}
                        style={{ flex: 1, height: "auto", justifyContent: "flex-start", minWidth: 0 }}
                      >
                        <Icon name={item.pinned ? "pin" : "message"} size={15} color={active || item.pinned ? "var(--accent)" : "var(--text-4)"} />
                        <span className="orbit-agent-history-title" style={{ color: active ? "var(--accent)" : "var(--text)", flex: 1, fontSize: 14, fontWeight: active ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                          className="btn btn-icon btn-quiet orbit-agent-history-more"
                          data-orbit-agent-history-menu-button={item.sessionId}
                          disabled={pending}
                          onClick={() => setHistoryMenuOpenId(menuOpen ? null : item.id)}
                          title={t({ en: "More actions", zh: "更多操作" })}
                          type="button"
                          style={{
                            background: menuOpen ? "var(--surface-2)" : undefined,
                            color: active ? "var(--accent)" : "var(--text-4)",
                            height: 28,
                            opacity: controlsVisible ? 1 : 0.46,
                            width: 28,
                          }}
                        >
                          <Icon name="more" size={16} />
                        </button>
                        {menuOpen ? (
                          <div
                            className="orbit-agent-history-menu"
                            data-orbit-agent-history-menu={item.sessionId}
                            role="menu"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--r-sm)",
                              boxShadow: "var(--sh-pop)",
                              minWidth: 156,
                              padding: 6,
                              position: "absolute",
                              right: 2,
                              top: 36,
                              zIndex: ORBIT_Z.dropdown,
                            }}
                          >
                            <button
                              data-orbit-agent-history-pin={item.sessionId}
                              disabled={pending}
                              onClick={() => {
                                setHistoryMenuOpenId(null);
                                onTogglePin(item);
                              }}
                              role="menuitem"
                              type="button"
                              className="btn btn-sm btn-quiet"
                              style={{ height: 34, justifyContent: "flex-start", width: "100%" }}
                            >
                              <Icon name="pin" size={14} />
                              {item.pinned ? t({ en: "Unpin", zh: "取消置顶" }) : t({ en: "Pin", zh: "置顶" })}
                            </button>
                            <button
                              data-orbit-agent-history-rename={item.sessionId}
                              disabled={pending}
                              onClick={() => startRename(item)}
                              role="menuitem"
                              type="button"
                              className="btn btn-sm btn-quiet"
                              style={{ height: 34, justifyContent: "flex-start", width: "100%" }}
                            >
                              <Icon name="edit" size={14} />
                              {t({ en: "Rename", zh: "重命名" })}
                            </button>
                            <div style={{ background: "var(--border)", height: 1, margin: "5px 4px" }} />
                            <button
                              data-orbit-agent-history-delete={item.sessionId}
                              disabled={pending}
                              onClick={() => {
                                setHistoryMenuOpenId(null);
                                onDelete(item);
                              }}
                              role="menuitem"
                              type="button"
                              className="btn btn-sm btn-quiet"
                              style={{ color: "var(--danger, #C2410C)", height: 34, justifyContent: "flex-start", width: "100%" }}
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

function AgentHistoryDeleteDialog({
  error,
  history,
  onCancel,
  onConfirm,
  pending,
}: {
  error: string | null;
  history: OrbitAgentHistoryView;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useOrbitLanguage();
  const dialogRef = useOrbitModalA11y(() => {
    if (!pending) {
      onCancel();
    }
  });

  return (
    <div
      data-orbit-agent-history-delete-confirmation
      role="presentation"
      style={{
        alignItems: "center",
        background: "var(--scrim)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: 20,
        position: "fixed",
        zIndex: ORBIT_Z.modal,
      }}
    >
      <div
        aria-describedby="orbit-agent-history-delete-description"
        aria-labelledby="orbit-agent-history-delete-title"
        aria-modal="true"
        ref={dialogRef}
        role="alertdialog"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--sh-pop)",
          display: "grid",
          gap: 16,
          maxWidth: 440,
          padding: 24,
          width: "100%",
        }}
        tabIndex={-1}
      >
        <h2
          id="orbit-agent-history-delete-title"
          style={{ color: "var(--ink)", fontSize: 22, margin: 0 }}
        >
          {t({ en: "Delete this conversation?", zh: "删除这个对话？" })}
        </h2>
        <p
          id="orbit-agent-history-delete-description"
          style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}
        >
          {t({
            en: `“${history.title}” and its messages will be permanently removed from your chat history. This cannot be undone.`,
            zh: `“${history.title}”及其中的消息将从你的对话历史中永久删除，且无法撤销。`,
          })}
        </p>
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "flex-end" }}>
          <button
            autoFocus
            className="btn btn-secondary"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            {t({ en: "Keep conversation", zh: "保留对话" })}
          </button>
          <button
            aria-busy={pending}
            className="btn btn-danger"
            data-orbit-agent-history-confirm-delete
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending
              ? t({ en: "Deleting…", zh: "正在删除…" })
              : t({ en: "Delete conversation", zh: "删除对话" })}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentMobileHistoryDrawer({
  activeQ,
  activeSessionId,
  history,
  onClose,
  onDelete,
  onNavigate,
  onNewChat,
  onPick,
  onRename,
  onTogglePin,
  pendingSessionId,
}: {
  activeQ: string;
  activeSessionId: string | null;
  history: OrbitAgentHistoryView[];
  onClose: () => void;
  onDelete: (history: OrbitAgentHistoryView) => void;
  onNavigate: (href: string) => void;
  onNewChat: () => void;
  onPick: (history: OrbitAgentHistoryView) => void;
  onRename: (history: OrbitAgentHistoryView, title: string) => void;
  onTogglePin: (history: OrbitAgentHistoryView) => void;
  pendingSessionId: string | null;
}) {
  const { t } = useOrbitLanguage();
  const drawerRef = useOrbitModalA11y(onClose);

  return (
    <div
      className="orbit-mobile-only"
      data-orbit-agent-history-drawer
      role="presentation"
      style={{ inset: 0, position: "fixed", zIndex: ORBIT_Z.overlay }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ backdropFilter: "blur(3px)", background: "var(--scrim)", inset: 0, position: "absolute" }}
      />
      <div
        aria-labelledby="orbit-agent-mobile-history-title"
        aria-modal="true"
        ref={drawerRef}
        role="dialog"
        style={{ animation: "slideInLeft .26s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", bottom: 0, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", left: 0, maxWidth: 320, position: "absolute", top: 0, width: "84%" }}
        tabIndex={-1}
      >
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, height: 54, padding: "0 14px" }}>
          <span id="orbit-agent-mobile-history-title" style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>
            {t({ en: "Chat history", zh: "对话历史" })}
          </span>
          <div style={{ flex: 1 }} />
          <IconButton ariaLabel={t({ en: "Close", zh: "关闭" })} name="x" onClick={onClose} size={16} />
        </div>
        <div className="orbit-agent-history-actions">
          <button className="btn btn-block orbit-agent-new-chat" type="button" onClick={onNewChat}>
            <Icon name="plus" size={16} color="var(--accent)" />
            {t({ en: "New chat", zh: "新对话" })}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 12px 4px" }}>
          <div className="eyebrow" style={{ padding: "2px 8px 6px" }}>{t({ en: "Go to", zh: "前往" })}</div>
          {[
            ["/", "home", t({ en: "Home", zh: "首页" })],
            ["/explore", "calendar", t({ en: "Events", zh: "活动" })],
            ["/home/schedule", "clock", t({ en: "Calendar", zh: "日程" })],
            ["/home/cards", "wallet", t({ en: "Contacts", zh: "人脉" })],
          ].map(([href, icon, label]) => (
            <button
              className="btn btn-quiet"
              key={href}
              onClick={() => {
                onClose();
                onNavigate(href);
              }}
              style={{ height: "auto", justifyContent: "flex-start", padding: "9px 8px", width: "100%" }}
              type="button"
            >
              <Icon name={icon} size={17} color="var(--accent)" />
              {label}
            </button>
          ))}
          <div style={{ background: "var(--border)", height: 1, margin: "7px 8px 2px" }} />
          <div className="eyebrow" style={{ padding: "2px 8px 4px" }}>{t({ en: "Chat history", zh: "对话历史" })}</div>
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 18px" }}>
          <AgentHistoryList
            activeQ={activeQ}
            activeSessionId={activeSessionId}
            history={history}
            onDelete={onDelete}
            onPick={onPick}
            onRename={onRename}
            onTogglePin={onTogglePin}
            pendingSessionId={pendingSessionId}
          />
        </div>
      </div>
    </div>
  );
}

function agentSuggestLabel(label: string, language: "en" | "zh") {
  if (language === "zh") return label;

  const labels: Record<string, string> = {
    "找金融 AI 方向的人脉": "Find AI finance contacts",
    "想认识女装设计师": "Meet womenswear designers",
    "推荐 AI / 出海活动": "Recommend AI / global events",
    "找值得跟进的人脉": "Find contacts worth following up",
    "推荐可拓展活动": "Recommend events to grow my network",
    "整理关系待办": "Review relationship to-dos",
  };

  return labels[label] ?? label;
}

function AgentWelcome({ onPick, viewModel }: { onPick: (query: string) => void; viewModel: OrbitAgentViewModel }) {
  const { language, t } = useOrbitLanguage();

  return (
    <div className="new-empty">
      <span className="mk"><AgentStar size={22} /></span>
      <h3>{t({ en: "What should iOrbit do for you?", zh: "你想让 iOrbit 做什么？" })}</h3>
      <p>
        {t({
          en: "It can see your events, registration answers, contacts and appointments — just say the goal.",
          zh: "它能看到你的活动、报名答案、人脉和约谈——直接说目标就行。",
        })}
      </p>
      <div className="chips">
        {viewModel.suggests.map((suggest) => (
          <button className="chip" key={suggest.label} onClick={() => onPick(suggest.q)} type="button">
            {agentSuggestLabel(suggest.label, language === "ja" ? "en" : language)}
          </button>
        ))}
      </div>
    </div>
  );
}

// 结果行：设计稿 .panel / .p-person 的紧凑列表（home-console-green.html 对话页）。
function AgentPeopleRow({ item, navigate, t }: { item: OrbitAgentPeopleResultView; navigate: (href: string) => void; t: Translate }) {
  const connection = item.connection;

  return (
    <div className="p-person">
      <Avatar g={connection.g} letter={connection.initial} size={38} />
      <span className="w">
        <b>{connection.displayName}</b>
        <span>{[connection.title, connection.company].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="p-acts">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/home/cards/${connection.id}`)} type="button">
          {t({ en: "View", zh: "查看" })}
        </button>
      </span>
      {item.reason ? <span className="why">{item.reason}</span> : null}
      {item.opener ? <span className="why">{item.opener}</span> : null}
    </div>
  );
}

function AgentEventRow({ item, language, navigate, t }: { item: OrbitAgentEventResultView; language: "en" | "zh"; navigate: (href: string) => void; t: Translate }) {
  const event = item.event;
  const date = parseDate(event.startsAt);
  const weekday = date ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo", weekday: "short" }).format(date) : "";
  const dateLabel = date
    ? (language === "en" ? `${fmtMonth(date, language)} ${fmtDay(date, language)} · ${weekday}` : `${fmtMonth(date, language)}${fmtDay(date, language)}日 · ${weekday}`)
    : t({ en: "Time TBD", zh: "时间待定" });

  return (
    <div className="p-person">
      <EventCover g={gradientFromString(event.code)} imageAlt={event.name} imageSizes="38px" imageUrl={eventCoverPhoto(event.code)} monogram={eventCoverPhoto(event.code) ? null : { text: event.name.slice(0, 1), size: 15 }} style={{ borderRadius: "var(--r-sm)", flexShrink: 0, height: 38, width: 38 }} />
      <span className="w">
        <b>{event.name}</b>
        <span>{[dateLabel, event.place].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="p-acts">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/events/${event.code}`)} type="button">
          {t({ en: "View", zh: "查看" })}
        </button>
      </span>
      {item.reason ? <span className="why">{item.reason}</span> : null}
      {item.howto ? <span className="why">{item.howto}</span> : null}
    </div>
  );
}

function AgentTodoRow({ item, navigate, t }: { item: OrbitAgentTodoResultView; navigate: (href: string) => void; t: Translate }) {
  return (
    <div className="p-person">
      <Avatar g={gradientFromString(item.contactName || item.id)} letter={(item.contactName || item.title).slice(0, 1).toUpperCase()} size={38} />
      <span className="w">
        <b>{item.title}</b>
        <span>{[item.contactName, item.organization, item.due].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="p-acts">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/home/schedule")} type="button">
          {t({ en: "View", zh: "查看" })}
        </button>
      </span>
      {item.reason ? <span className="why">{item.reason}</span> : null}
      {item.task ? <span className="why">{item.task}</span> : null}
    </div>
  );
}

function PanelCards({ language, navigate, panel, t }: { language: "en" | "zh"; navigate: (href: string) => void; panel: AgentPanel; t: Translate }) {
  const meta =
    panel.kind === "people"
      ? t({ en: `${panel.items.length} people`, zh: `${panel.items.length} 位` })
      : panel.kind === "events"
        ? t({ en: `${panel.items.length} events`, zh: `${panel.items.length} 场` })
        : t({ en: `${panel.items.length} items`, zh: `${panel.items.length} 条` });

  return (
    <div className="panel">
      <div className="panel-head">
        <Icon color="var(--accent)" name={panel.kind === "people" ? "users" : panel.kind === "events" ? "calendar" : "clock"} size={14} />
        <b>{panel.panelTitle}</b>
        <span className="meta">{meta}</span>
      </div>
      <div className="panel-body">
        {panel.items.map((item, index) =>
          isPeopleResult(item) ? (
            <AgentPeopleRow key={`${item.connection.id}-${index}`} item={item} navigate={navigate} t={t} />
          ) : isTodoResult(item) ? (
            <AgentTodoRow key={`${item.id}-${index}`} item={item} navigate={navigate} t={t} />
          ) : (
            <AgentEventRow key={`${item.event.code}-${index}`} item={item} language={language} navigate={navigate} t={t} />
          ),
        )}
      </div>
    </div>
  );
}

// 真实链路是单次请求（planner → 工具 → artifact → synthesis），没有流式分阶段
// 回调，等待可能好几秒。为了不让用户对着一个静止的点发呆，这里按时间推进一串
// “正在…”阶段文案（理解→检索→深度思考→整理），配合旋转指示，营造进度感。
// 纯展示：文案与真实进度无严格对应，只按固定节奏往后走并停在最后一个。
const THINKING_PHASES: readonly Copy[] = [
  { en: "Understanding your request", zh: "正在理解你的需求" },
  { en: "Searching your network & events", zh: "正在检索信息" },
  { en: "Thinking it through", zh: "正在深度思考中" },
  { en: "Composing recommendations", zh: "正在整理答复" },
];

const THINKING_PHASE_INTERVAL_MS = 2200;

// 设计稿的四角星标（home-console-green.html 中 iOrbit 的品牌记号）。
export function AgentStar({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 2l1.9 5.8L20 9.7l-5 3.9 1.7 6.1L12 16.4l-4.7 3.3L9 13.6 4 9.7l6.1-1.9L12 2z" />
    </svg>
  );
}

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
    <span aria-live="polite" className="thinking orbit-agent-thinking-indicator">
      <span className="sp" />
      {t(THINKING_PHASES[phase])}
    </span>
  );
}

/**
 * 全局悬浮 iOrbit：右下小球 ⇄ 底部居中毛玻璃输入（设计定稿 home-console-green.html）。
 * 发送即进入真实的 /api/ai/conversations 管线（onAsk）。
 */
function OrbitAgentOrb({
  busy,
  chips,
  onAsk,
  t,
}: {
  busy: boolean;
  chips: readonly { label: string; query: string }[];
  onAsk: (query: string) => void;
  t: Translate;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hintOrderRef = useRef<string[]>([]);

  const hints = useMemo(
    () => [
      ...chips.map((chip) => chip.label),
      t({ en: "Who should I prioritize at my next event?", zh: "下一场活动我该重点找谁聊？" }),
      t({ en: "Add my next step to my follow-ups", zh: "把我的下一步加到待办里" }),
      t({ en: "Which events this month are worth going to?", zh: "这个月还有哪些值得去的活动？" }),
    ],
    [chips, t],
  );

  const nextHint = useCallback(() => {
    if (!hintOrderRef.current.length) {
      const order = [...hints];
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      hintOrderRef.current = order;
    }
    return hintOrderRef.current.pop() ?? "";
  }, [hints]);

  useEffect(() => {
    if (!open) return undefined;
    setHint(nextHint());
    // 提示语每 3.5s 轮换（用户已输入就不打扰）；不引入人为延时。
    const timer = window.setInterval(() => {
      if (inputRef.current?.value) return;
      setHint(nextHint());
    }, 3500);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [nextHint, open]);

  const openOrb = () => {
    setOpen(true);
    setSeen(true);
  };
  const closeOrb = () => setOpen(false);
  const submit = () => {
    if (busy) return;
    const query = value.trim() || hint;
    if (!query) return;
    setValue("");
    setOpen(false);
    onAsk(query);
  };

  return (
    <>
      <div className="orb-dock">
        <button
          aria-expanded={open}
          aria-label={t({ en: "Open iOrbit", zh: "打开 iOrbit" })}
          className={`orb-ball${open ? " hide" : ""}`}
          data-orbit-agent-orb-ball
          onClick={openOrb}
          type="button"
        >
          <AgentStar size={24} />
          {seen ? null : <span className="pip" />}
        </button>
      </div>
      <div
        className={`orb-overlay${open ? "" : " hide"}`}
        data-orbit-agent-orb-overlay
        onClick={(event) => {
          if (!(event.target instanceof Element) || !event.target.closest(".orb-panel")) closeOrb();
        }}
      >
        <div aria-label={t({ en: "Ask iOrbit", zh: "iOrbit 快速提问" })} aria-modal="true" className="orb-panel" role="dialog">
          <span aria-hidden className="orb-halo"><i className="h1" /><i className="h2" /><i className="h3" /></span>
          <div className="orb-top">
            <div className="orb-chips">
              {chips.slice(0, 2).map((chip) => (
                <button
                  className="chip"
                  key={chip.label}
                  onClick={() => {
                    closeOrb();
                    onAsk(chip.query);
                  }}
                  type="button"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <button aria-label={t({ en: "Close", zh: "收起" })} className="orb-close" onClick={closeOrb} type="button">
              <Icon name="x" size={15} />
            </button>
          </div>
          <form
            className="orb-row"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <span className="lead"><Icon name="message" size={16} /></span>
            <input
              aria-label={t({
                en: "Ask Orbit about contacts, events, and relationship to-dos",
                zh: "询问 Orbit 人脉、活动与关系待办",
              })}
              onChange={(event) => setValue(event.target.value)}
              placeholder={hint}
              ref={inputRef}
              type="text"
              value={value}
            />
            <button aria-label={t({ en: "Send", zh: "发送" })} className="orb-send hit-44" data-orbit-agent-submit="true" type="submit">
              <Icon name="arrow" size={15} style={{ transform: "rotate(-45deg)" }} />
            </button>
          </form>
          <p className="orb-note" data-orbit-agent-privacy-boundary>
            {t({
              en: "Sending opens the iOrbit conversation · external actions always need your confirmation first.",
              zh: "发送后进入 iOrbit 对话 · 涉及对外动作会先经你确认",
            })}
          </p>
        </div>
      </div>
    </>
  );
}

/* ═══ 工作台整页样式：docs/designs/journey/home-console-green.html 1:1 迁移，
   全部限定在 [data-orbit-real-page="agent"] 作用域内。═══ */
const CONSOLE_STYLES = `
[data-orbit-real-page="agent"] {
  --sidebar-w: ${ORBIT_LEFT_SIDEBAR_WIDTH}px;
  --agent-body-size: 15px;
  --console-tight: 'Inter Tight', Inter, system-ui, -apple-system, 'PingFang SC', sans-serif;
  --glass: rgba(255,255,255,.66);
  --glass-border: #dbe7e4;
  font-size: 15px;
  line-height: 1.65;
}
[data-orbit-real-page="agent"] .hide { display: none !important; }
[data-orbit-real-page="agent"] .h-display { font-family: var(--console-tight); font-weight: 600; letter-spacing: 0; line-height: 1.02; color: var(--ink); }
[data-orbit-real-page="agent"] .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); }
[data-orbit-real-page="agent"] .glass { background: var(--glass); border: 1px solid var(--glass-border); border-radius: var(--r-md); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: inset 0 1px 0 rgba(255,255,255,.9); }
[data-orbit-real-page="agent"] .ai-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-press); }
[data-orbit-real-page="agent"] .badge { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: var(--r-pill); font-size: 12px; font-weight: 600; white-space: nowrap; }
[data-orbit-real-page="agent"] .badge-ok { background: var(--live-soft); color: var(--live-text, #0E7A3C); }
[data-orbit-real-page="agent"] .badge-wait { background: var(--amber-soft); color: var(--amber-text, #8A5A00); }
[data-orbit-real-page="agent"] .badge-muted { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: var(--r-pill); font-size: 13px; font-weight: 500; background: var(--surface-2); color: var(--text-2); border: 1px solid transparent; white-space: nowrap; transition: background .14s, color .14s, border-color .14s; cursor: pointer; }
[data-orbit-real-page="agent"] .chip:hover { color: var(--accent-press); border-color: var(--accent); background: var(--surface); }
[data-orbit-real-page="agent"] .avatar.avatar { font-family: var(--console-tight); background: linear-gradient(140deg, var(--av-a, #2E8A93), var(--av-b, #0e4b52)); box-shadow: none; color: #fff; border: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 600; flex-shrink: 0; }
[data-orbit-real-page="agent"] .avatar.avatar .avatar-letter { color: #fff; }
[data-orbit-real-page="agent"] .avatar.avatar .avatar-orbit { display: none; }
[data-orbit-real-page="agent"] .g-teal { --av-a:#2E8A93; --av-b:#0e4b52; }
[data-orbit-real-page="agent"] .g-slate { --av-a:#7d92ad; --av-b:#40536b; }
[data-orbit-real-page="agent"] .g-sand { --av-a:#c39a63; --av-b:#8a6b3a; }
[data-orbit-real-page="agent"] .g-moss { --av-a:#6ba585; --av-b:#3f7d5c; }
[data-orbit-real-page="agent"] .g-plum { --av-a:#a487a0; --av-b:#7a5a74; }

/* ═══ 骨架 ═══ */
[data-orbit-real-page="agent"] .ws-body { display: flex; flex: 1; min-height: 0; }
[data-orbit-real-page="agent"] .agent-history.agent-history { background: #fafbfb !important; border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
[data-orbit-real-page="agent"] .agent-history-actions { padding: 12px 12px 10px; }
[data-orbit-real-page="agent"] .orbit-agent-new-chat { align-items: center; background: var(--accent-softer); border: 1px solid transparent; border-radius: 9px; color: var(--ink); font-size: 14px; font-weight: 650; gap: 9px; height: 40px; justify-content: flex-start; padding: 0 12px; width: 100%; display: inline-flex; cursor: pointer; }
[data-orbit-real-page="agent"] .orbit-agent-new-chat:hover { background: var(--accent-soft); border-color: rgba(23,106,115,.2); }
[data-orbit-real-page="agent"] .agent-history-heading { padding: 8px 16px 10px; }
[data-orbit-real-page="agent"] .agent-history-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
[data-orbit-real-page="agent"] .orbit-agent-history-group { padding: 12px 10px 4px; font-size: 10.5px; }
[data-orbit-real-page="agent"] .ws-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
[data-orbit-real-page="agent"] .ws-scroll { flex: 1; min-height: 0; overflow-y: auto; }
[data-orbit-real-page="agent"] .ws-inner { max-width: 900px; margin: 0 auto; padding: 30px 32px 132px; }

/* ═══ Dashboard ═══ */
[data-orbit-real-page="agent"] .hub-head { align-items: center; display: flex; gap: 18px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .hub-head .avatar { font-size: 26px !important; }
[data-orbit-real-page="agent"] .hub-head .who { flex: 1; min-width: 220px; }
[data-orbit-real-page="agent"] .hub-head h1 { font-size: 28px; margin: 0; }
[data-orbit-real-page="agent"] .hub-head .sub { color: var(--text-2); font-size: 14.5px; margin-top: 5px; }
[data-orbit-real-page="agent"] .hub-stats { background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; display: flex; gap: 30px; margin-top: 18px; padding: 14px 20px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .hub-stats .v { color: var(--ink); font-family: var(--console-tight); font-size: 24px; font-weight: 600; line-height: 1.1; }
[data-orbit-real-page="agent"] .hub-stats .k { color: var(--text-3); font-size: 12.5px; margin-top: 1px; }
[data-orbit-real-page="agent"] .brief { position: relative; overflow: hidden; border-radius: var(--r-lg); border: 1px solid var(--border); padding: 20px; margin-top: 18px;
  background: radial-gradient(64% 100% at 90% 0%, rgba(23,106,115,.13), transparent 58%), radial-gradient(48% 80% at 2% 100%, rgba(180,83,9,.07), transparent 58%), var(--accent-softer); }
[data-orbit-real-page="agent"] .brief-head { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .brief-mark { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; }
[data-orbit-real-page="agent"] .brief-head b { font-family: var(--console-tight); font-size: 15px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .brief-head .st { font-size: 12px; color: var(--text-3); }
[data-orbit-real-page="agent"] .brief-lede { font-size: 14.5px; color: var(--text-2); margin: 0 0 13px; max-width: 62ch; line-height: 1.72; }
[data-orbit-real-page="agent"] .brief-lede b { color: var(--ink); }
[data-orbit-real-page="agent"] .brief-suggest { padding: 13px 15px; display: flex; align-items: center; gap: 13px; flex-wrap: wrap; margin-bottom: 12px; }
[data-orbit-real-page="agent"] .brief-suggest .txt { flex: 1; min-width: 230px; }
[data-orbit-real-page="agent"] .brief-suggest .txt b { display: block; font-size: 14.5px; color: var(--ink); }
[data-orbit-real-page="agent"] .brief-suggest .txt span { font-size: 13px; color: var(--text-2); }
[data-orbit-real-page="agent"] .brief-signal-quiet { font-size: 12.5px; color: var(--text-3); background: none; border: 0; cursor: pointer; padding: 4px 6px; border-radius: var(--r-xs); }
[data-orbit-real-page="agent"] .brief-signal-quiet:hover { color: var(--ink); background: rgba(255,255,255,.7); }
[data-orbit-real-page="agent"] .brief-refresh { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-4); background: none; border: 0; cursor: pointer; padding: 2px 0; margin-bottom: 10px; }
[data-orbit-real-page="agent"] .brief-refresh:hover { color: var(--text-2); }
[data-orbit-real-page="agent"] .brief-input { display: flex; align-items: center; gap: 10px; padding: 5px 5px 5px 16px; border-radius: var(--r-md); }
[data-orbit-real-page="agent"] .brief-input input { flex: 1; border: 0; background: none; font: inherit; font-size: 14.5px; color: var(--text); min-height: 38px; outline: none; min-width: 0; }
[data-orbit-real-page="agent"] .brief-input input::placeholder { color: var(--text-4); transition: opacity .2s; }
[data-orbit-real-page="agent"] .brief-send { width: 38px; height: 38px; border-radius: var(--r-sm); background: var(--accent); color: #fff; display: grid; place-items: center; transition: background .15s, transform .08s; border: 0; cursor: pointer; }
[data-orbit-real-page="agent"] .brief-send:hover { background: var(--accent-hover); }
[data-orbit-real-page="agent"] .brief-send:active { transform: scale(.95); }
[data-orbit-real-page="agent"] .brief-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 11px; }
[data-orbit-real-page="agent"] .brief-note { font-size: 11.5px; color: var(--text-4); margin: 11px 0 0; }
[data-orbit-real-page="agent"] .sec-title { display: flex; align-items: baseline; gap: 10px; margin: 26px 0 11px; }
[data-orbit-real-page="agent"] .sec-title h2 { font-family: var(--console-tight); font-size: 16.5px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .sec-title span { font-size: 12.5px; color: var(--text-4); }
[data-orbit-real-page="agent"] .appt { display: grid; grid-template-columns: auto 1fr; gap: 18px; padding: 17px 19px; }
[data-orbit-real-page="agent"] .appt-when { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 11px 15px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); align-self: start; min-width: 100px; }
[data-orbit-real-page="agent"] .appt-when .d { font-family: var(--console-tight); font-size: 20px; font-weight: 600; color: var(--ink); line-height: 1.1; }
[data-orbit-real-page="agent"] .appt-when .t { font-size: 13px; font-weight: 600; color: var(--accent-press); }
[data-orbit-real-page="agent"] .appt-when .len { font-size: 11px; color: var(--text-3); font-family: var(--ff-mono); }
[data-orbit-real-page="agent"] .appt-when .in { font-size: 11px; font-weight: 600; color: var(--amber-text, #8A5A00); background: var(--amber-soft); border-radius: var(--r-pill); padding: 1px 9px; margin-top: 5px; }
[data-orbit-real-page="agent"] .appt-main { min-width: 0; }
[data-orbit-real-page="agent"] .appt-title-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .appt-title-row b { font-size: 15.5px; font-weight: 600; color: var(--ink); }
[data-orbit-real-page="agent"] .appt-who { display: flex; align-items: center; gap: 11px; margin-top: 10px; }
[data-orbit-real-page="agent"] .appt-actions { display: flex; gap: 9px; margin-top: 12px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
[data-orbit-real-page="agent"] .act { padding: 16px 17px; display: flex; flex-direction: column; gap: 9px; transition: border-color .15s; }
[data-orbit-real-page="agent"] .act:hover { border-color: var(--border-2); }
[data-orbit-real-page="agent"] .act.span2 { grid-column: span 2; }
[data-orbit-real-page="agent"] .act-top { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="agent"] .act-ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .ic-teal { background: var(--accent-soft); color: var(--accent); }
[data-orbit-real-page="agent"] .ic-green { background: var(--live-soft); color: var(--live-text, #0E7A3C); }
[data-orbit-real-page="agent"] .ic-amber { background: var(--amber-soft); color: var(--amber-text, #8A5A00); }
[data-orbit-real-page="agent"] .ic-gray { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .act-top b { font-size: 15px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .act-badge { margin-left: auto; font-size: 11px; font-weight: 700; background: var(--signal, #C8323B); color: #fff; min-width: 20px; height: 20px; border-radius: var(--r-pill); display: inline-grid; place-items: center; padding: 0 6px; }
[data-orbit-real-page="agent"] .act p { font-size: 13.5px; color: var(--text-2); flex: 1; margin: 0; }
[data-orbit-real-page="agent"] .act p b { color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .act .btn { align-self: flex-start; }
[data-orbit-real-page="agent"] .act.ai { border-color: var(--glass-border); background: radial-gradient(80% 120% at 100% 0%, rgba(23,106,115,.1), transparent 55%), var(--glass); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); }
[data-orbit-real-page="agent"] .act .ai-chip { margin-left: auto; }
[data-orbit-real-page="agent"] .stage-row { display: flex; align-items: center; flex-wrap: wrap; row-gap: 6px; }
[data-orbit-real-page="agent"] .stage { display: flex; align-items: center; }
[data-orbit-real-page="agent"] .stage .s-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--text-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 4px 11px; }
[data-orbit-real-page="agent"] .stage.done .s-dot { color: var(--live-text, #0E7A3C); background: var(--live-soft); border-color: transparent; }
[data-orbit-real-page="agent"] .stage.now .s-dot { color: #fff; background: var(--accent); border-color: transparent; }
[data-orbit-real-page="agent"] .stage .s-link { width: 14px; height: 1.5px; background: var(--border-2); }
[data-orbit-real-page="agent"] .journeys { overflow: hidden; }
[data-orbit-real-page="agent"] .j-row { width: 100%; text-align: left; display: flex; align-items: center; gap: 14px; padding: 14px 18px; transition: background .15s; background: none; border: 0; cursor: pointer; font: inherit; color: inherit; }
[data-orbit-real-page="agent"] .j-row:hover { background: var(--accent-softer); }
[data-orbit-real-page="agent"] .j-row + .j-row { border-top: 1px solid var(--border); }
[data-orbit-real-page="agent"] .j-date { width: 42px; border-radius: var(--r-sm); overflow: hidden; text-align: center; flex: 0 0 auto; background: var(--surface-3); border: 1px solid var(--border); }
[data-orbit-real-page="agent"] .j-date .m { display: block; font-size: 10px; font-weight: 600; color: var(--text-2); padding: 2px 0 0; }
[data-orbit-real-page="agent"] .j-date .d { display: block; font-family: var(--console-tight); font-weight: 600; font-size: 15px; color: var(--ink); padding: 0 0 3px; }
[data-orbit-real-page="agent"] .j-main { flex: 1; min-width: 0; }
[data-orbit-real-page="agent"] .j-main b { display: block; font-size: 14.5px; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page="agent"] .j-main span { font-size: 12.5px; color: var(--text-2); }
[data-orbit-real-page="agent"] .j-arrow { color: var(--text-4); flex: 0 0 auto; }

/* ═══ 对话页 ═══ */
[data-orbit-real-page="agent"] .thread-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
[data-orbit-real-page="agent"] .btn-back { width: 34px; height: 34px; border-radius: var(--r-sm); border: 1px solid var(--border-2); background: var(--surface); color: var(--text-2); display: grid; place-items: center; flex: 0 0 auto; transition: border-color .15s, color .15s, background .15s; cursor: pointer; }
[data-orbit-real-page="agent"] .btn-back:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-softer); }
[data-orbit-real-page="agent"] .thread-bar .title { font-family: var(--console-tight); font-size: 16px; font-weight: 600; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="agent"] .thread-bar .when { font-size: 12px; color: var(--text-4); font-family: var(--ff-mono); margin-left: auto; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .thread { display: flex; flex-direction: column; gap: 20px; }
[data-orbit-real-page="agent"] .msg-user-row { align-self: flex-end; max-width: 78%; display: flex; align-items: flex-end; gap: 8px; }
[data-orbit-real-page="agent"] .msg-user-row .orbit-agent-message-copy { opacity: 0; transition: opacity .15s; }
[data-orbit-real-page="agent"] .msg-user-row:hover .orbit-agent-message-copy { opacity: 1; }
[data-orbit-real-page="agent"] .msg-user { background: var(--accent-soft); color: var(--ink); border-radius: var(--r-md) var(--r-md) 4px var(--r-md); padding: 11px 15px; font-size: var(--agent-body-size); }
[data-orbit-real-page="agent"] .msg-a { display: flex; gap: 12px; }
[data-orbit-real-page="agent"] .msg-a .mk { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: #fff; display: grid; place-items: center; flex: 0 0 auto; margin-top: 2px; }
[data-orbit-real-page="agent"] .msg-a .body { flex: 1; min-width: 0; }
[data-orbit-real-page="agent"] .msg-a .body .orbit-agent-markdown { font-size: var(--agent-body-size); color: var(--text); line-height: 1.7; }
[data-orbit-real-page="agent"] .msg-note { align-items: center; background: var(--amber-soft); border-radius: var(--r-sm); color: var(--amber-text, #8A5A00); display: inline-flex; font-size: 13px; font-weight: 600; gap: 8px; margin-bottom: 10px; padding: 7px 12px; }
[data-orbit-real-page="agent"] .msg-tools { display: flex; justify-content: flex-end; margin-top: 8px; opacity: 0; transition: opacity .15s; }
[data-orbit-real-page="agent"] .msg-a:hover .msg-tools { opacity: 1; }
[data-orbit-real-page="agent"] .thinking { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-3); }
[data-orbit-real-page="agent"] .thinking .sp { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--border-2); border-top-color: var(--accent); animation: orbit-agent-spin .8s linear infinite; }
@keyframes orbit-agent-spin { to { transform: rotate(360deg); } }
[data-orbit-real-page="agent"] .new-empty { text-align: center; padding: 60px 0 20px; }
[data-orbit-real-page="agent"] .new-empty .mk { width: 46px; height: 46px; border-radius: var(--r-md); background: var(--accent); color: #fff; display: grid; place-items: center; margin: 0 auto 14px; }
[data-orbit-real-page="agent"] .new-empty h3 { font-family: var(--console-tight); font-size: 20px; font-weight: 600; color: var(--ink); margin: 0; }
[data-orbit-real-page="agent"] .new-empty p { font-size: 14px; color: var(--text-2); margin: 6px 0 0; }
[data-orbit-real-page="agent"] .new-empty .chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 18px; }
[data-orbit-real-page="agent"] .panel { margin-top: 13px; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; background: var(--surface); }
[data-orbit-real-page="agent"] .panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
[data-orbit-real-page="agent"] .panel-head b { font-size: 13px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .panel-head .meta { font-size: 12px; color: var(--text-3); margin-left: auto; }
[data-orbit-real-page="agent"] .panel-body { padding: 6px 14px 12px; }
[data-orbit-real-page="agent"] .p-person { display: flex; align-items: center; gap: 11px; padding: 11px 0; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .p-person + .p-person { border-top: 1px dashed var(--border-2); }
[data-orbit-real-page="agent"] .p-person .w { flex: 1; min-width: 160px; }
[data-orbit-real-page="agent"] .p-person .w b { display: block; font-size: 14px; color: var(--ink); font-weight: 600; }
[data-orbit-real-page="agent"] .p-person .w span { font-size: 12.5px; color: var(--text-2); }
[data-orbit-real-page="agent"] .p-person .why { flex-basis: 100%; font-size: 13px; color: var(--text-2); background: var(--surface-2); border-left: 2px solid var(--accent); padding: 8px 12px; border-radius: 0 var(--r-sm) var(--r-sm) 0; }
[data-orbit-real-page="agent"] .p-acts { display: flex; gap: 8px; }
[data-orbit-real-page="agent"] [data-agent-evidence-sources] { border-top: 0; margin-top: 11px; padding-top: 0; font-size: 12.5px; color: var(--text-3); }
[data-orbit-real-page="agent"] [data-agent-evidence-sources] > summary { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-3); padding: 5px 10px; border-radius: var(--r-xs); border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-weight: 500; list-style: none; }
[data-orbit-real-page="agent"] [data-agent-evidence-sources] > summary::-webkit-details-marker { display: none; }
[data-orbit-real-page="agent"] [data-agent-evidence-sources] > summary:hover { color: var(--ink); border-color: var(--border-2); }
[data-orbit-real-page="agent"] [data-agent-evidence-sources] > div { margin-top: 8px; }
[data-orbit-real-page="agent"] [data-agent-evidence-sources] > div > div { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-2); padding: 8px 11px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-sm); }
[data-orbit-real-page="agent"] .action-card-guard { font-size: 12px; color: var(--text-3); margin-top: 9px; display: flex; gap: 7px; align-items: flex-start; }

/* ═══ 全局悬浮 iOrbit ═══ */
[data-orbit-real-page="agent"] .orb-dock { position: fixed; right: 24px; bottom: 24px; z-index: 80; }
[data-orbit-real-page="agent"] .orb-ball { position: relative; width: 54px; height: 54px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; box-shadow: 0 8px 26px rgba(23,33,31,.22), 0 2px 6px rgba(23,33,31,.12); transition: transform .16s ease, background .15s; border: 0; cursor: pointer; }
[data-orbit-real-page="agent"] .orb-ball:hover { background: var(--accent-hover); transform: translateY(-2px); }
[data-orbit-real-page="agent"] .orb-ball:active { transform: scale(.94); }
[data-orbit-real-page="agent"] .orb-ball .pip { position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border-radius: 999px; background: var(--amber); border: 2px solid var(--bg-soft); }
[data-orbit-real-page="agent"] .orb-overlay { position: fixed; inset: 0; z-index: 90; display: flex; align-items: flex-end; justify-content: center; padding: 0 16px 18px; background: none; animation: orbit-agent-orb-fade .16s ease-out; }
@keyframes orbit-agent-orb-fade { from { opacity: 0; } to { opacity: 1; } }
[data-orbit-real-page="agent"] .orb-panel { position: relative; width: min(560px, calc(100vw - 32px)); animation: orbit-agent-orb-in .2s cubic-bezier(.2,.9,.3,1); }
@keyframes orbit-agent-orb-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
[data-orbit-real-page="agent"] .orb-halo { position: absolute; inset: -86px -74px -52px; z-index: 0; pointer-events: none; }
[data-orbit-real-page="agent"] .orb-halo i { position: absolute; inset: 0; display: block; }
[data-orbit-real-page="agent"] .orb-halo .h1 { backdrop-filter: blur(2.5px); -webkit-backdrop-filter: blur(2.5px);
  -webkit-mask-image: radial-gradient(ellipse 100% 100% at 50% 64%, #000 0%, rgba(0,0,0,.94) 26%, rgba(0,0,0,.78) 42%, rgba(0,0,0,.55) 56%, rgba(0,0,0,.32) 70%, rgba(0,0,0,.14) 83%, rgba(0,0,0,.04) 92%, transparent 100%);
  mask-image: radial-gradient(ellipse 100% 100% at 50% 64%, #000 0%, rgba(0,0,0,.94) 26%, rgba(0,0,0,.78) 42%, rgba(0,0,0,.55) 56%, rgba(0,0,0,.32) 70%, rgba(0,0,0,.14) 83%, rgba(0,0,0,.04) 92%, transparent 100%); }
[data-orbit-real-page="agent"] .orb-halo .h2 { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  -webkit-mask-image: radial-gradient(ellipse 76% 78% at 50% 66%, #000 0%, rgba(0,0,0,.92) 22%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.46) 54%, rgba(0,0,0,.24) 70%, rgba(0,0,0,.08) 86%, transparent 100%);
  mask-image: radial-gradient(ellipse 76% 78% at 50% 66%, #000 0%, rgba(0,0,0,.92) 22%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.46) 54%, rgba(0,0,0,.24) 70%, rgba(0,0,0,.08) 86%, transparent 100%); }
[data-orbit-real-page="agent"] .orb-halo .h3 { backdrop-filter: blur(13px); -webkit-backdrop-filter: blur(13px);
  -webkit-mask-image: radial-gradient(ellipse 54% 56% at 50% 68%, #000 0%, rgba(0,0,0,.88) 20%, rgba(0,0,0,.62) 38%, rgba(0,0,0,.34) 56%, rgba(0,0,0,.12) 76%, transparent 100%);
  mask-image: radial-gradient(ellipse 54% 56% at 50% 68%, #000 0%, rgba(0,0,0,.88) 20%, rgba(0,0,0,.62) 38%, rgba(0,0,0,.34) 56%, rgba(0,0,0,.12) 76%, transparent 100%); }
[data-orbit-real-page="agent"] .orb-top, [data-orbit-real-page="agent"] .orb-row, [data-orbit-real-page="agent"] .orb-note { position: relative; z-index: 1; }
[data-orbit-real-page="agent"] .orb-top { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .orb-chips { display: flex; gap: 6px; flex-wrap: wrap; }
[data-orbit-real-page="agent"] .orb-chips .chip { display: inline-flex; align-items: center; height: 28px; padding: 0 11px; border-radius: var(--r-pill); font-size: 12.5px; font-weight: 500; background: rgba(255,255,255,.84); color: var(--text-2); border: 1px solid rgba(255,255,255,.95); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 3px 12px rgba(23,33,31,.10); transition: background .14s, color .14s, border-color .14s; }
[data-orbit-real-page="agent"] .orb-chips .chip:hover { background: #fff; border-color: var(--accent); color: var(--accent-press); }
[data-orbit-real-page="agent"] .orb-close { margin-left: auto; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.84); border: 1px solid rgba(255,255,255,.95); color: var(--text-3); display: grid; place-items: center; flex: 0 0 auto; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 3px 12px rgba(23,33,31,.10); cursor: pointer; }
[data-orbit-real-page="agent"] .orb-close:hover { background: #fff; color: var(--ink); }
[data-orbit-real-page="agent"] .orb-row { display: flex; align-items: center; gap: 11px; background: color-mix(in srgb, var(--surface) 66%, transparent); border: 1px solid color-mix(in srgb, var(--surface) 82%, transparent); outline: 1px solid var(--border); border-radius: var(--r-pill); padding: 6px 6px 6px 18px; backdrop-filter: blur(20px) saturate(175%); -webkit-backdrop-filter: blur(20px) saturate(175%); box-shadow: 0 10px 30px rgba(23,33,31,.15); transition: outline-color .15s, box-shadow .15s; }
[data-orbit-real-page="agent"] .orb-row:focus-within { outline-color: var(--accent); box-shadow: 0 10px 30px rgba(23,33,31,.15), 0 0 0 3px var(--accent-soft); }
[data-orbit-real-page="agent"] .orb-row .lead { color: var(--text-3); display: inline-flex; flex: 0 0 auto; }
[data-orbit-real-page="agent"] .orb-row input { flex: 1; min-width: 0; border: 0; background: none; font: inherit; font-size: 14.5px; color: var(--text); min-height: 38px; outline: none; }
[data-orbit-real-page="agent"] .orb-row input:focus, [data-orbit-real-page="agent"] .orb-row input:focus-visible,
[data-orbit-real-page="agent"] .brief-input input:focus, [data-orbit-real-page="agent"] .brief-input input:focus-visible { outline: none; }
[data-orbit-real-page="agent"] .orb-row input::placeholder { color: var(--text-3); transition: opacity .2s; }
[data-orbit-real-page="agent"] .orb-row input.ph-fade::placeholder { opacity: 0; }
[data-orbit-real-page="agent"] .orb-send { width: 36px; height: 36px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; flex: 0 0 auto; transition: background .15s, transform .08s; border: 0; cursor: pointer; }
[data-orbit-real-page="agent"] .orb-send:hover { background: var(--accent-hover); }
[data-orbit-real-page="agent"] .orb-send:active { transform: scale(.94); }
[data-orbit-real-page="agent"] .orb-note { font-size: 11px; color: var(--text-2); margin: 9px 0 0; text-align: center; }

@media (max-width: 720px) {
  [data-orbit-real-page="agent"] .grid { grid-template-columns: 1fr; }
  [data-orbit-real-page="agent"] .act.span2 { grid-column: span 1; }
  [data-orbit-real-page="agent"] .appt { grid-template-columns: 1fr; gap: 13px; }
}
@media (max-width: 640px) {
  [data-orbit-real-page="agent"] .ws-inner { padding: 18px 16px 120px; }
  [data-orbit-real-page="agent"] .orb-dock { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); }
  [data-orbit-real-page="agent"] .orb-overlay { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page="agent"] *, [data-orbit-real-page="agent"] *::before, [data-orbit-real-page="agent"] *::after { animation: none !important; transition: none !important; }
}
`;

export function OrbitRealAgent({ home = null, viewModel }: OrbitRealAgentProps) {
  const { language, preserveHref, t } = useOrbitLanguage();
  // dashboard ⇄ 对话页：有消息（或点了「新对话」）即进入对话页，返回键回 dashboard。
  const [chatOpen, setChatOpen] = useState(false);
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
  const [historyDeleteError, setHistoryDeleteError] = useState<string | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<AgentHistoryFeedback | null>(null);
  const [historyMutationSessionId, setHistoryMutationSessionId] = useState<string | null>(null);
  const [pendingDeleteHistory, setPendingDeleteHistory] = useState<OrbitAgentHistoryView | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const historyResizeRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const historyMutationSessionIdRef = useRef<string | null>(null);
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
    setChatOpen(true);
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
    void persistStoredAgentChatSession(session).then((persisted) => {
      if (!persisted) {
        setHistoryFeedback({
          kind: "error",
          text:
            languageRef.current === "zh"
              ? "对话已显示在当前页面，但未能保存到历史记录。请检查存储配置后重试。"
              : "This conversation is visible for now but could not be saved to history. Check storage and try again.",
        });
      }
    });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
        sessionId,
      );
    }
  }, []);

  // 真实链路：把用户消息发给 Orbit Agent conversation API（planner → 白名单工具 →
  // 可复核 artifact → synthesis），并把 contact_recommendations artifact 映射到侧边栏。
  const ask = useCallback(async (
    query: string,
    retryAssistantIndex?: number,
  ) => {
    const locale = languageRef.current === "zh" ? "zh" : "en";
    const failureText =
      locale === "zh"
        ? "Agent 暂时无法完成这次回复，请稍后再试。"
        : "The agent could not complete this reply. Please try again.";

    // 发送前抓取已有轮次作为对话历史，让服务端 planner 能接住追问里的指代；
    // 推荐轮附带结构化明细，追问时间/地点/理由时模型可直接作答。
    const retry =
      typeof retryAssistantIndex === "number"
        ? prepareAgentFailedRequestRetry(
            messagesRef.current,
            retryAssistantIndex,
          )
        : null;
    const historySource = retry?.historyMessages ?? messagesRef.current;
    const history = historySource
      .map((turn) => ({ content: historyContentFor(turn), role: turn.role }))
      .filter((turn) => turn.content)
      .slice(-8);

    if (retry) {
      setMessages(retry.visibleMessages);
    } else {
      setMessages((current) => [...current, { role: "user", text: query }]);
    }
    setThinking(true);
    // 等待回复期间保留现有侧边栏；新回复带结果时才替换。

    try {
      const response = await fetch("/api/ai/conversations", {
        body: JSON.stringify({ history, locale, message: query }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: {
          actionIds?: unknown;
          artifacts?: unknown;
          assistantMessage?: string;
          runId?: unknown;
        };
        error?: { message?: string };
        success?: boolean;
      } | null;

      if (!response.ok || payload?.success !== true || !payload.data) {
        const errorText = payload?.error?.message
          ? `${failureText}（${payload.error.message}）`
          : failureText;

        setMessages((current) => [
          ...current,
          {
            items: [],
            kind: "people",
            panelTitle: "",
            retryRequest: query,
            role: "assistant",
            text: errorText,
          },
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
      const runId =
        typeof payload.data.runId === "string" && payload.data.runId.trim()
          ? payload.data.runId.trim()
          : undefined;
      const actionIds = Array.isArray(payload.data.actionIds)
        ? payload.data.actionIds.flatMap((actionId) =>
            typeof actionId === "string" && actionId.trim()
              ? [actionId.trim()]
              : [],
          )
        : [];
      const evidenceRefs = evidenceRefsFromArtifacts(payload.data.artifacts);

      setMessages((current) => [
        ...current,
        {
          actionIds,
          evidenceRefs,
          items,
          kind,
          panelTitle,
          role: "assistant",
          runId,
          text: assistantText,
        },
      ]);

      setPanel(items.length > 0 ? { items, kind, panelTitle } : null);
    } catch {
      setMessages((current) => [
        ...current,
        {
          items: [],
          kind: "people",
          panelTitle: "",
          retryRequest: query,
          role: "assistant",
          text: failureText,
        },
      ]);
    } finally {
      setThinking(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateHistory = async () => {
      const sessionId = currentAgentSessionId();
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

  const resizeHistorySidebarWithKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const nextWidth =
        event.key === "ArrowLeft"
          ? historySidebarWidth - 16
          : event.key === "ArrowRight"
            ? historySidebarWidth + 16
            : event.key === "Home"
              ? HISTORY_SIDEBAR_MIN_WIDTH
              : event.key === "End"
                ? HISTORY_SIDEBAR_MAX_WIDTH
                : null;

      if (nextWidth === null) {
        return;
      }

      event.preventDefault();
      setHistorySidebarWidth(clampHistorySidebarWidth(nextWidth));
    },
    [historySidebarWidth],
  );

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
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    navigate(`/agent?q=${encodeURIComponent(item.q)}`);
    void ask(item.q);
  };

  const clearConversation = (openChat: boolean) => {
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setThinking(false);
    setActiveQ("");
    setActiveSessionId(null);
    setChatOpen(openChat);
    activeSessionIdRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY);
    }
    navigate("/agent");
  };

  // 「新对话」：进入对话页的空态；「返回」：回 dashboard（当前对话已在历史里）。
  const newChat = () => clearConversation(true);
  const backToDashboard = () => clearConversation(false);

  const updateHistorySession = async (
    sessionId: string,
    update: (session: AgentStoredChatSession) => AgentStoredChatSession,
    successText: string,
  ): Promise<boolean> => {
    if (historyMutationSessionIdRef.current) {
      return false;
    }

    const currentSession = storedSessionsRef.current.find(
      (session) => session.id === sessionId,
    );

    if (!currentSession) {
      return false;
    }

    const nextSession = {
      ...update(currentSession),
      updatedAt: new Date().toISOString(),
    };

    historyMutationSessionIdRef.current = sessionId;
    setHistoryMutationSessionId(sessionId);
    setHistoryFeedback(null);

    try {
      const persisted = await persistStoredAgentChatSession(nextSession);
      if (!persisted) {
        setHistoryFeedback({
          kind: "error",
          text:
            languageRef.current === "zh"
              ? "未能保存对话历史更改，页面保持原状态。请稍后重试。"
              : "The history change could not be saved, so nothing changed. Please try again.",
        });
        return false;
      }

      const nextSessions = upsertAgentChatSession(
        storedSessionsRef.current,
        nextSession,
      );
      storedSessionsRef.current = nextSessions;
      setStoredSessions(nextSessions);
      setHistoryFeedback({ kind: "success", text: successText });
      return true;
    } finally {
      historyMutationSessionIdRef.current = null;
      setHistoryMutationSessionId(null);
    }
  };

  const togglePinnedHistorySession = (item: OrbitAgentHistoryView) => {
    if (!item.sessionId) {
      return;
    }

    void updateHistorySession(
      item.sessionId,
      (session) => ({
        ...session,
        pinned: !session.pinned,
      }),
      item.pinned
        ? t({ en: "Conversation unpinned", zh: "已取消置顶" })
        : t({ en: "Conversation pinned", zh: "对话已置顶" }),
    );
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

    void updateHistorySession(
      item.sessionId,
      (session) => ({
        ...session,
        customTitle,
        title: customTitle,
      }),
      t({ en: "Conversation renamed", zh: "对话已重命名" }),
    );
  };

  const deleteHistorySession = (item: OrbitAgentHistoryView) => {
    if (!item.sessionId) {
      return;
    }

    setHistoryDeleteError(null);
    setPendingDeleteHistory(item);
  };

  const confirmDeleteHistorySession = async () => {
    const item = pendingDeleteHistory;
    const sessionId = item?.sessionId;
    if (!item || !sessionId || historyMutationSessionIdRef.current) {
      return;
    }

    historyMutationSessionIdRef.current = sessionId;
    setHistoryMutationSessionId(sessionId);
    setHistoryDeleteError(null);
    setHistoryFeedback(null);

    try {
      const persisted = await deleteStoredAgentChatSession(sessionId);
      if (!persisted) {
        setHistoryDeleteError(
          languageRef.current === "zh"
            ? "未能删除这个对话，历史记录保持不变。请稍后重试。"
            : "This conversation could not be deleted, so your history is unchanged. Please try again.",
        );
        return;
      }

      const nextSessions = storedSessionsRef.current.filter(
        (session) => session.id !== sessionId,
      );
      storedSessionsRef.current = nextSessions;
      setStoredSessions(nextSessions);
      setPendingDeleteHistory(null);
      setHistoryFeedback({
        kind: "success",
        text: t({ en: "Conversation deleted", zh: "对话已删除" }),
      });

      if (activeSessionIdRef.current !== sessionId) {
        return;
      }

      setHistOpen(false);
      setMessages([]);
      setPanel(null);
      setThinking(false);
      setActiveQ("");
      setActiveSessionId(null);
      setChatOpen(false);
      activeSessionIdRef.current = null;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY);
      }
      navigate("/agent");
    } finally {
      historyMutationSessionIdRef.current = null;
      setHistoryMutationSessionId(null);
    }
  };

  const renderBubbles = () => (
    <>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div className="msg-user-row" key={`user-${index}`}>
            <AgentMessageCopyButton text={message.text} />
            <div className="msg-user">{message.text}</div>
          </div>
        ) : (
          <div className="msg-a" key={`assistant-${index}`}>
            <span className="mk">
              <AgentStar size={15} />
            </span>
            <div className="body">
              {message.note ? (
                <div className="msg-note">
                  <Icon name="eye" size={14} />
                  {message.note}
                </div>
              ) : null}
              <AgentMarkdown text={message.text} />
              {message.items.length > 0 ? (
                <PanelCards language={language === "ja" ? "en" : language} navigate={navigate} panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }} t={t} />
              ) : null}
              {message.runId ? (
                <AgentOutcomeFeedback
                  evidenceIds={(message.evidenceRefs ?? []).flatMap(
                    (reference) => reference.evidenceIds,
                  )}
                  language={language === "zh" ? "zh" : "en"}
                  runId={message.runId}
                  sourceModules={(message.evidenceRefs ?? []).flatMap(
                    (reference) => reference.sourceModules,
                  )}
                />
              ) : null}
              {message.runId ? (
                <AgentActionStatusCard
                  actionIds={message.actionIds ?? []}
                  language={language === "zh" ? "zh" : "en"}
                  navigate={navigate}
                  onRetryRequest={async () => {
                    const request = agentRetryRequestForAssistant(
                      messages,
                      index,
                    );
                    if (request) await ask(request);
                  }}
                  runId={message.runId}
                />
              ) : null}
              <AgentEvidenceSources references={message.evidenceRefs ?? []} />
              {message.retryRequest ? (
                <button
                  className="btn btn-ghost btn-sm"
                  data-agent-message-retry-request
                  disabled={thinking}
                  onClick={() => void ask(message.retryRequest!, index)}
                  style={{ marginTop: 10 }}
                  type="button"
                >
                  {language === "zh" ? "重新提交请求" : "Retry request"}
                </button>
              ) : null}
              <div className="msg-tools">
                <AgentMessageCopyButton text={message.text} />
              </div>
            </div>
          </div>
        ),
      )}
      {thinking ? (
        <div className="msg-a orbit-agent-thinking-turn">
          <span className="mk">
            <AgentStar size={15} />
          </span>
          <div className="body">
            <ThinkingIndicator t={t} />
          </div>
        </div>
      ) : null}
    </>
  );

  const inChat = chatOpen || messages.length > 0 || thinking;
  const threadTitle = messages.length
    ? titleFromMessages(messages)
    : t({ en: "New chat", zh: "新对话" });
  const orbChips = viewModel.suggests.slice(0, 3).map((suggest) => ({
    label: agentSuggestLabel(suggest.label, language === "ja" ? "en" : language),
    query: suggest.q,
  }));

  const workspaceContent = inChat ? (
    <>
      <div className="thread-bar">
        <button
          aria-label={t({ en: "Back to dashboard", zh: "返回 dashboard" })}
          className="btn-back"
          onClick={backToDashboard}
          title={t({ en: "Back", zh: "返回" })}
          type="button"
        >
          <Icon name="back" size={16} />
        </button>
        <span className="title">{threadTitle}</span>
      </div>
      {messages.length || thinking ? (
        <div className="thread">{renderBubbles()}</div>
      ) : (
        <AgentWelcome onPick={ask} viewModel={viewModel} />
      )}
    </>
  ) : home ? (
    <OrbitAgentDashboard home={home} language={language} navigate={navigate} onAsk={ask} t={t} />
  ) : (
    <AgentWelcome onPick={ask} viewModel={viewModel} />
  );

  return (
    <div
      aria-busy={thinking}
      className="orbit-agent-workspace"
      data-orbit-agent-request-state={thinking ? "pending" : "idle"}
      data-orbit-real-page="agent"
      style={{ background: "var(--bg-soft)", display: "flex", flexDirection: "column", height: "100dvh" }}
    >
      <style dangerouslySetInnerHTML={{ __html: CONSOLE_STYLES }} />
      <h1
        data-orbit-agent-screen-title
        style={{ clipPath: "inset(50%)", height: 1, margin: -1, overflow: "hidden", position: "absolute", whiteSpace: "nowrap", width: 1 }}
      >
        {t({ en: "iOrbit Agent workspace", zh: "iOrbit Agent 工作区" })}
      </h1>
      <div className="orbit-desktop-only">
        {/* No rightExtra here: the "New chat" action already lives in the
            sidebar below, so the desktop top-nav stays identical to the
            homepage / other product pages (brand · links · 中/EN · Me). */}
        <AccountTopNav active="agent" />
      </div>
      <div className="orbit-mobile-only" style={{ flexShrink: 0 }}>
        <AccountTopNav
          active="agent"
          mobileRightExtra={(
            <button aria-label={t({ en: "Chat history", zh: "对话历史" })} className="orbit-top-icon-btn orbit-agent-history-btn" onClick={() => setHistOpen(true)} type="button">
              <Icon name="clock" size={16} />
            </button>
          )}
        />
      </div>

      <div className="ws-body orbit-desktop-only" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside className="agent-history orbit-agent-history" data-orbit-agent-history-sidebar style={{ maxWidth: HISTORY_SIDEBAR_MAX_WIDTH, minWidth: HISTORY_SIDEBAR_MIN_WIDTH, width: historySidebarWidth }}>
          <div className="agent-history-actions orbit-agent-history-actions">
            <button className="orbit-agent-new-chat" type="button" onClick={newChat}>
              <Icon name="plus" size={16} color="var(--accent)" />
              {t({ en: "New chat", zh: "新对话" })}
            </button>
          </div>
          <div className="agent-history-heading orbit-agent-history-heading">
            <div className="eyebrow">{t({ en: "Chat history", zh: "对话历史" })}</div>
          </div>
          <div className="scroll agent-history-scroll orbit-agent-history-scroll">
            <AgentHistoryList activeQ={activeQ} activeSessionId={activeSessionId} history={storedHistory} onDelete={deleteHistorySession} onPick={pickHistory} onRename={renameHistorySession} onTogglePin={togglePinnedHistorySession} pendingSessionId={historyMutationSessionId} />
          </div>
        </aside>
        <button
          className="orbit-agent-history-resize"
          aria-label={t({ en: "Resize chat history", zh: "调整历史宽度" })}
          aria-orientation="vertical"
          aria-valuemax={HISTORY_SIDEBAR_MAX_WIDTH}
          aria-valuemin={HISTORY_SIDEBAR_MIN_WIDTH}
          aria-valuenow={historySidebarWidth}
          aria-valuetext={`${historySidebarWidth}px`}
          data-orbit-agent-history-resize-handle
          onKeyDown={resizeHistorySidebarWithKeyboard}
          onPointerDown={startHistorySidebarResize}
          role="separator"
          title={t({ en: "Resize chat history", zh: "调整历史宽度" })}
          type="button"
          style={{
            alignSelf: "stretch",
            background: historySidebarResizing ? "var(--accent-soft)" : "transparent",
            border: "none",
            cursor: "col-resize",
            flexShrink: 0,
            marginLeft: -8,
            padding: 0,
            position: "relative",
            width: 8,
            zIndex: 1,
          }}
        />
        <div className="ws-main">
          <div ref={scrollRef} className="scroll ws-scroll">
            <div className="ws-inner">{workspaceContent}</div>
          </div>
        </div>
      </div>

      <div className="orbit-mobile-only" style={{ flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollRef} className="scroll ws-scroll">
          <div className="ws-inner">{workspaceContent}</div>
        </div>
      </div>

      <OrbitAgentOrb busy={thinking} chips={orbChips} onAsk={ask} t={t} />

      {histOpen ? (
        <AgentMobileHistoryDrawer
          activeQ={activeQ}
          activeSessionId={activeSessionId}
          history={storedHistory}
          onClose={() => setHistOpen(false)}
          onDelete={deleteHistorySession}
          onNavigate={navigate}
          onNewChat={newChat}
          onPick={pickHistory}
          onRename={renameHistorySession}
          onTogglePin={togglePinnedHistorySession}
          pendingSessionId={historyMutationSessionId}
        />
      ) : null}
      {pendingDeleteHistory ? (
        <AgentHistoryDeleteDialog
          error={historyDeleteError}
          history={pendingDeleteHistory}
          onCancel={() => {
            setHistoryDeleteError(null);
            setPendingDeleteHistory(null);
          }}
          onConfirm={() => {
            void confirmDeleteHistorySession();
          }}
          pending={historyMutationSessionId === pendingDeleteHistory.sessionId}
        />
      ) : null}
      {historyFeedback ? (
        <div
          className="nc-toast show"
          data-orbit-agent-history-feedback={historyFeedback.kind}
          role={historyFeedback.kind === "error" ? "alert" : "status"}
          style={{
            bottom: 24,
            left: "50%",
            maxWidth: "min(520px, calc(100vw - 32px))",
            opacity: 1,
            pointerEvents: "auto",
            position: "fixed",
            transform: "translateX(-50%)",
            zIndex: ORBIT_Z.toast,
          }}
        >
          <Icon
            color={historyFeedback.kind === "error" ? "var(--danger)" : "var(--accent)"}
            name={historyFeedback.kind === "error" ? "x" : "check"}
            size={15}
          />
          <span>{historyFeedback.text}</span>
          <button
            aria-label={t({ en: "Dismiss", zh: "关闭提示" })}
            className="btn btn-icon btn-quiet"
            onClick={() => setHistoryFeedback(null)}
            style={{ height: 24, marginLeft: 4, width: 24 }}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
