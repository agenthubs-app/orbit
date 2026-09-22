// iOrbit（对话域）纯模型层：从 `../orbit-real-agent.tsx` 逐字搬入的 React-free
// helper（解析 / 归一化 / 重试 / 标题与分组派生 / 常量）。本文件不得 import React、
// 不得带 "use client"（计划「审阅修订」29），以便 node 测试直接 import。
import { aiSessionOrganizationSchema, aiSessionOriginSchema, reliableAiSendInputSchema } from "../../../../../shared/api-schema/ai-sessions";
import type {
  AiSessionGroupContract,
  AiSessionOrganizationContract,
  ReliableAiSendInputContract,
  StoredAiSessionOriginContract,
} from "../../../../../shared/contract/ai-sessions";
import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentScenarioView,
  OrbitAgentTodoResultView,
} from "../../orbit-agent-route-view-model";
import { gradientFromString } from "../../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../orbit-layout-constants";
import { parseAgentTaskInteraction, type AgentTaskInteractionView } from "../agent-task-interaction-view-model";

type AgentPanel = Pick<OrbitAgentScenarioView, "items" | "kind" | "panelTitle">;
type AgentReliableRequest = ReliableAiSendInputContract;

type AgentMessage =
  | { id?: string; role: "user"; text: string }
  | {
      actionIds?: readonly string[];
      evidenceRefs?: readonly AgentEvidenceRef[];
      items: OrbitAgentScenarioView["items"];
      kind: OrbitAgentScenarioView["kind"];
      id?: string;
      note?: string;
      panelTitle: string;
      retryRequest?: string;
      reliableRequest?: AgentReliableRequest;
      role: "assistant";
      runId?: string;
      taskInteraction?: AgentTaskInteractionView;
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
const MAX_AGENT_CHAT_HISTORY_SESSIONS = 10_000;
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
  contactId?: string;
  dueAt?: string;
  id?: string;
  metadata?: readonly { label?: string; value?: string }[];
  reason?: string;
  subtitle?: string;
  title?: string;
  triggerKind?: string;
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

const CONTACT_RECOMMENDATION_ITEM_PREFIX = "contact-recommendation:";

export function contactIdFromArtifactItemId(value: unknown): string {
  const itemId = String(value ?? "");
  return itemId.startsWith(CONTACT_RECOMMENDATION_ITEM_PREFIX)
    ? itemId.slice(CONTACT_RECOMMENDATION_ITEM_PREFIX.length)
    : itemId;
}

function peopleItemsFromArtifact(
  artifact: AgentArtifactRecord | null,
): OrbitAgentPeopleResultView[] {
  const items =
    artifact?.result?.generatedView?.sections?.flatMap(
      (section) => section.items ?? [],
    ) ?? [];

  const mapped = items.map((item) => {
    const contactId = contactIdFromArtifactItemId(item.id);
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

  // artifact 的 sections 可能把同一个联系人分到多段（例如「强匹配」与「同场活动」），
  // flatMap 之后就会在面板里出现两张一模一样的卡和两个「生成跟进草稿」按钮——
  // 用户无法判断点哪个、会不会发两封。这里按 contact id 收敛成一条，保留最先出现
  // 的排序位置，并把后续重复项里非空的理由/证据补进来，避免丢证据。
  const byContact = new Map<string, OrbitAgentPeopleResultView>();
  for (const entry of mapped) {
    const key = entry.connection.id || entry.connection.displayName;
    const kept = byContact.get(key);
    if (!kept) {
      byContact.set(key, entry);
      continue;
    }
    byContact.set(key, {
      ...kept,
      match: Math.max(kept.match, entry.match),
      opener: kept.opener || entry.opener,
      reason: kept.reason || entry.reason,
    });
  }

  return [...byContact.values()];
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
    contactId: item.contactId,
    contactName: item.subtitle ?? "",
    due: artifactMetadataValue(item, ["到期", "Due"]),
    dueAt: item.dueAt,
    id: String(item.id ?? `todo-${index}`),
    organization: artifactMetadataValue(item, ["组织", "Organization"]),
    priority: artifactMetadataValue(item, ["优先级", "Priority"]) || item.confidenceLabel || "",
    reason: item.reason ?? "",
    sourceLabel: artifactMetadataValue(item, ["来源", "Source"]),
    task: item.body ?? "",
    title: item.title ?? "",
    triggerKind: item.triggerKind,
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

  if (
    (typeof value.id !== "undefined" && typeof value.id !== "string") ||
    (typeof value.reliableRequest !== "undefined" &&
      !reliableAiSendInputSchema.safeParse(value.reliableRequest).success)
  ) {
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
  messageRevision?: number;
  messages: AgentMessage[];
  organization?: AiSessionOrganizationContract;
  origin?: StoredAiSessionOriginContract;
  panel?: AgentPanel | null;
  pinned?: boolean;
  title: string;
  updatedAt: string;
}

function parseStoredAgentMessage(value: unknown): AgentMessage | null {
  if (isStoredAgentMessage(value)) {
    if (value.role === "user") return value;
    const { taskInteraction: rawInteraction, ...message } = value;
    const taskInteraction = parseAgentTaskInteraction(rawInteraction);
    return {
      ...message,
      ...(value.evidenceRefs ? { evidenceRefs: uniqueAgentEvidenceRefs(value.evidenceRefs) } : {}),
      ...(taskInteraction ? { taskInteraction } : {}),
    };
  }

  if (
    isRecord(value) &&
    value.role === "assistant" &&
    typeof value.text === "string"
  ) {
    const taskInteraction = parseAgentTaskInteraction(value.taskInteraction);
    return {
      items: [],
      kind: "people",
      panelTitle: "",
      role: "assistant",
      text: value.text,
      ...(taskInteraction ? { taskInteraction } : {}),
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
    .map((session) => {
      const origin = aiSessionOriginSchema.safeParse(session.origin);
      const organization = aiSessionOrganizationSchema.safeParse(session.organization);
      return {
      id: typeof session.id === "string" ? session.id : "",
      messageRevision:
        typeof session.messageRevision === "number" &&
        Number.isSafeInteger(session.messageRevision) &&
        session.messageRevision >= 0
          ? session.messageRevision
          : undefined,
      messages: Array.isArray(session.messages)
        ? session.messages
            .flatMap((message) => {
              const parsed = parseStoredAgentMessage(message);

              return parsed ? [parsed] : [];
            })
        : [],
      panel: isRecord(session.panel) ? (session.panel as AgentPanel) : null,
      origin: origin.success ? origin.data : undefined,
      organization: organization.success ? organization.data : {
        customTitle: typeof session.customTitle === "string" && session.customTitle.trim() ? session.customTitle.trim() : null,
        groupId: null,
        pinned: session.pinned === true,
        revision: 0,
      },
      createdAt:
        typeof session.createdAt === "string" ? session.createdAt : "",
      customTitle:
        typeof session.customTitle === "string" ? session.customTitle.trim() : "",
      pinned: organization.success ? organization.data.pinned : session.pinned === true,
      title: typeof session.title === "string" ? session.title.trim() : "",
      updatedAt:
        typeof session.updatedAt === "string" ? session.updatedAt : "",
      };
    })
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
  groups: readonly AiSessionGroupContract[] = [],
): OrbitAgentHistoryView[] {
  const fallbackGroup = language === "zh" ? "未分组" : "Ungrouped";
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

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
      const groupId = session.organization?.groupId ?? null;

      return {
        group: groupId ? groupNames.get(groupId) ?? fallbackGroup : fallbackGroup,
        groupId,
        id: `session:${session.id}`,
        organizationRevision: session.organization?.revision ?? 0,
        pinned: session.pinned,
        q: firstUserMessage,
        sessionId: session.id,
        title,
        when: groupId ? groupNames.get(groupId) ?? fallbackGroup : fallbackGroup,
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

export async function loadStoredAgentChatSessions(): Promise<AgentStoredChatSession[]> {
  try {
    const sessions: AgentStoredChatSession[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const query = new URLSearchParams({ limit: "50", v: "2" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${agentChatSessionsApiPath()}?${query}`, {
        headers: { accept: "application/json" },
        method: "GET",
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
        return [];
      }
      sessions.push(...parseAgentChatSessionsData(payload.data));
      cursor = typeof payload.data.nextCursor === "string" && payload.data.nextCursor
        ? payload.data.nextCursor
        : null;
      if (!cursor) break;
    }
    return [...new Map(sessions.map((session) => [session.id, session])).values()];
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

// 跟进队列的主体是**人**，不是任务句子：一个人一张卡，起草是对人的动作。
// 卡片默认收起——用户问的是「谁值得跟进」，答案是名单（是谁 · 为什么是现在 ·
// 下一步），任务看板级的细节等展开再给；常见路径（默认勾选 → 起草）不需要展开。
const TODO_LEAD_KINDS = new Set(["new_connection", "event_encounter", "dormant_relationship"]);

// 「你答应过的事」（真实 task 记录）和「系统推导的关系线索」性质不同，靠
// triggerKind 区分；旧 artifact 没有该字段时按承诺处理（宁可多勾不静默丢）。
function isTodoLead(item: OrbitAgentTodoResultView): boolean {
  return TODO_LEAD_KINDS.has(item.triggerKind ?? "");
}

interface AgentTodoGroup {
  contactId?: string;
  contactName: string;
  items: readonly OrbitAgentTodoResultView[];
  key: string;
  organization: string;
}

export function groupTodosByContact(
  items: readonly OrbitAgentTodoResultView[],
): AgentTodoGroup[] {
  const groups = new Map<string, AgentTodoGroup>();

  for (const item of items) {
    const key = item.contactName.trim() || item.id;
    const existing = groups.get(key);

    if (existing) {
      groups.set(key, {
        ...existing,
        contactId: existing.contactId || item.contactId,
        items: [...existing.items, item],
        organization: existing.organization || item.organization,
      });
      continue;
    }

    groups.set(key, {
      contactId: item.contactId,
      contactName: item.contactName.trim(),
      items: [item],
      key,
      organization: item.organization,
    });
  }

  // 同一人名下文案一字不差的重复线索（例如两场活动各生成一条「跟进这次双方都已
  // 确认的活动连接」）对用户是一件事：合并成一条，证据说明拼在一起。
  return [...groups.values()].map((group) => {
    const merged = new Map<string, OrbitAgentTodoResultView>();
    for (const item of group.items) {
      const mergeKey = `${isTodoLead(item) ? "lead" : "task"}|${item.title.trim()}`;
      const kept = merged.get(mergeKey);
      if (!kept) {
        merged.set(mergeKey, item);
        continue;
      }
      merged.set(mergeKey, {
        ...kept,
        dueAt: [kept.dueAt, item.dueAt].filter(Boolean).sort()[0],
        reason: [kept.reason, item.reason].filter(Boolean).join(" "),
        task: kept.task || item.task,
      });
    }
    return { ...group, items: [...merged.values()] };
  });
}

export function earliestTodoDueAt(
  items: readonly OrbitAgentTodoResultView[],
): string | undefined {
  return items
    .map((item) => item.dueAt)
    .filter((value): value is string => Boolean(value) && Number.isFinite(new Date(value as string).getTime()))
    .sort()[0];
}

// 到期展示在客户端按真实时钟算。artifact 里那套「今天/N 天后」的参照系是
// 「最新记录的 updatedAt」而不是当前时间（见 orbit-followup-queue-clock-bug），
// 这里有原始 dueAt 就不再信它。
function todoDueLabel(dueAt: string, language: "en" | "zh"): { label: string; soon: boolean } | null {
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return null;

  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const date = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    day: "numeric",
    month: language === "zh" ? "long" : "short",
    timeZone: "Asia/Tokyo",
  }).format(due);
  const relative =
    days < 0
      ? language === "zh" ? `已逾期 ${-days} 天` : `overdue ${-days}d`
      : days === 0
        ? language === "zh" ? "今天" : "today"
        : days === 1
          ? language === "zh" ? "明天" : "tomorrow"
          : language === "zh" ? `${days} 天后` : `in ${days}d`;

  return { label: `${date} · ${relative}`, soon: days <= 3 };
}

// 勾选的事项序列化成 purpose 传给草稿服务——按钮和列表的因果就在这里：
// 你选什么，信里就写什么。
function draftPurposeFor(
  items: readonly OrbitAgentTodoResultView[],
  language: "en" | "zh",
): string {
  if (items.length === 0) return "";
  const lines = items.map((item, index) => {
    const detail =
      item.task && item.task !== item.title ? `${item.title}：${item.task}` : item.title;
    return `${index + 1}. ${detail}`;
  });
  return language === "zh"
    ? `这封跟进邮件需要覆盖以下事项：\n${lines.join("\n")}`
    : `Cover these follow-up items in the email:\n${lines.join("\n")}`;
}

// 真实链路是单次请求（planner → 工具 → artifact → synthesis），没有流式分阶段
// 回调，等待可能好几秒。为了不让用户对着一个静止的点发呆，这里按时间推进一串
// 文案只说明这条管线将核对的维度，不伪装成服务端实时进度；按固定节奏轮换，
// 并明确给出用户可预期的等待范围与副作用边界。
const THINKING_PHASES: readonly Copy[] = [
  { en: "Checking your authorized contacts, events, and follow-ups", zh: "正在核对你已授权的人脉、活动与跟进记录" },
  { en: "Comparing relationship strength, timing, and your goal", zh: "正在比较关系强度、时机与你的目标" },
  { en: "Ranking the most useful next decisions", zh: "正在排列最值得处理的下一步" },
  { en: "Preparing the answer and its evidence", zh: "正在整理答复与依据" },
];

const THINKING_PHASE_INTERVAL_MS = 2200;
// The live route's default loop has one 20s provider budget plus bounded artifact,
// storage, and run-trace work. Keep a finite browser deadline with enough headroom
// for the observed 26–31s production turns; this is not a server execution deadline.
const AGENT_REQUEST_TIMEOUT_MS = 60_000;

class AgentRequestTimeoutError extends Error {
  constructor() {
    super("Agent request timed out");
    this.name = "AgentRequestTimeoutError";
  }
}

async function fetchAgentConversation(body: string): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    AGENT_REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch("/api/ai/conversations", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AgentRequestTimeoutError();
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export {
  AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY,
  AGENT_CHAT_SESSIONS_API_PATH,
  AGENT_REQUEST_TIMEOUT_MS,
  AgentRequestTimeoutError,
  CONTACT_RECOMMENDATION_ITEM_PREFIX,
  HISTORY_SIDEBAR_DEFAULT_WIDTH,
  HISTORY_SIDEBAR_MAX_WIDTH,
  HISTORY_SIDEBAR_MIN_WIDTH,
  MAX_AGENT_CHAT_HISTORY_SESSIONS,
  MAX_AGENT_CHAT_TITLE_LENGTH,
  THINKING_PHASES,
  THINKING_PHASE_INTERVAL_MS,
  TODO_LEAD_KINDS,
  TZ,
  agentChatSessionsApiPath,
  agentEvidenceRefIdentity,
  agentSuggestLabel,
  artifactMetadataValue,
  artifactOfKind,
  cleanAgentTitleText,
  clampHistorySidebarWidth,
  compactTitlePhrase,
  createAgentSessionId,
  currentAgentQuery,
  currentAgentSessionId,
  deleteStoredAgentChatSession,
  depthFor,
  displayTitleForStoredSession,
  draftPurposeFor,
  eventItemsFromArtifact,
  evidenceRefsFromArtifacts,
  fetchAgentConversation,
  fmtDay,
  fmtMonth,
  historyContentFor,
  isPeopleResult,
  isRecord,
  isStoredAgentMessage,
  isTodoLead,
  isTodoResult,
  loadStoredAgentChatSession,
  panelFromMessages,
  parseAgentChatSessionData,
  parseAgentChatSessionsArray,
  parseAgentChatSessionsData,
  parseDate,
  parseStoredAgentMessage,
  peopleItemsFromArtifact,
  persistStoredAgentChatSession,
  readJsonResponse,
  todoDueLabel,
  todoItemsFromArtifact,
  truncateAgentChatTitle,
  upsertAgentChatSession,
  type AgentArtifactRecord,
  type AgentArtifactViewItem,
  type AgentHistoryFeedback,
  type AgentHistoryLanguage,
  type AgentMessage,
  type AgentPanel,
  type AgentReliableRequest,
  type AgentResultItem,
  type AgentTodoGroup,
  type Copy,
  type Translate,
};
