import type {
  ChatConversationListResult,
  ChatConversationMessageService,
  ChatConversationMockFailure,
  ChatMessageThreadResult,
} from "../chat/service";
import type {
  ChatConversationSummary,
  ChatMessage,
  ChatMessageThreadPayload,
} from "../chat/contract";
import { createChatConversationMessageService } from "../chat/service-factory";
import {
  type OrbitAgentArtifactGeneratedView,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactPresentation,
  type OrbitAgentArtifactProvenance,
  type OrbitAgentArtifactResult,
  type OrbitAgentArtifactResultEnvelope,
  type OrbitAgentArtifactSafety,
  type OrbitAgentArtifactStatus,
  type OrbitAgentArtifactTask,
  type OrbitAgentArtifactTaskRequest,
  type OrbitAgentArtifactToolCallTrace,
} from "./artifact-contract";
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
import type { OrbitAgentArtifactTaskService } from "./service";

export const ORBIT_AGENT_CHAT_CONTEXT_ARTIFACT_SOURCE =
  "runtime:features/orbit-ai/chat-context-artifact-service.ts" as const;
export const FOLLOWUP_CONTEXT_ACCEPTED_SCORE = 0.7;

const defaultConversationId = "live-orbit-agent-conversation";
const fallbackGeneratedAt = "2026-06-30T00:00:00.000Z";

const safety: OrbitAgentArtifactSafety = {
  actionsRequireConfirmation: true,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  domainWritesExecuted: false,
  emailProviderRequested: false,
  externalNetworkRequested: false,
  externalSideEffectsExecuted: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  notificationDelivered: false,
};

type ArtifactLocale = "en" | "zh";

export interface OrbitAgentFollowupContextGenerationInput {
  evidenceIds: readonly string[];
  locale: ArtifactLocale;
  messages: readonly {
    body: string;
    createdAt: string;
    evidenceIds: readonly string[];
    messageId: string;
    senderName: string;
    senderRole: string;
  }[];
  privacy: {
    excludedMessageCount: number;
    includedMessageCount: number;
    mode: "full" | "limited";
  };
  query: string;
  relationship: {
    contactId: string;
    latestContext: string;
    organization: string;
    participantName: string;
    recommendedFollowup: string;
    relationshipReason: string;
    relationshipStage: string;
  };
  resolution: {
    matchedBy: string;
    score: number;
    state: "ambiguous" | "missing" | "resolved";
  };
  selectedConversation: {
    conversationId: string;
    lastMessageAt: string;
    participantContactId: string;
    participantName: string;
    status: string;
  };
}

export interface OrbitAgentFollowupContextGenerationResult {
  confidenceLabel: string;
  privacyNote: string;
  recommendedFollowup: string;
  relationshipContext: string;
  summary: string;
}

export interface OrbitAgentFollowupContextGenerator {
  generate: (
    input: OrbitAgentFollowupContextGenerationInput,
  ) =>
    | OrbitAgentFollowupContextGenerationResult
    | Promise<OrbitAgentFollowupContextGenerationResult>;
}

interface FollowupContextResolution {
  candidateCount: number;
  matchedBy: string;
  score: number;
  selectedConversationId: string | null;
  state: "ambiguous" | "missing" | "resolved";
}

interface ChatContextArtifactData {
  evidenceIds: readonly string[];
  generation: OrbitAgentFollowupContextGenerationResult | null;
  generatedAt: string;
  liveDatabaseReadExecuted: boolean;
  messages: readonly ChatMessage[];
  resolution: FollowupContextResolution;
  source: string;
  sourceLabel: string;
  state: ChatMessageThreadPayload["state"] | "failure";
  summary: string;
  thread: ChatMessageThreadPayload | null;
  toolStatus: OrbitAgentArtifactToolCallTrace["status"];
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): ArtifactLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(locale: ArtifactLocale, copy: Record<ArtifactLocale, string>) {
  return copy[locale];
}

const generatedRelationshipTopicLabels: Record<string, Record<ArtifactLocale, string>> = {
  "AI workflow PoC buyer in Japanese SMB manufacturing": {
    en: "AI workflow PoC buyers in Japanese SMB manufacturing",
    zh: "日本中小制造业的 AI 业务自动化 PoC 买方",
  },
  "Mandarin Japanese community marketing channel": {
    en: "Mandarin-Japanese community marketing channels",
    zh: "日中双语社群营销渠道",
  },
  "Tokyo restaurant operator test site": {
    en: "a Tokyo restaurant operator pilot site",
    zh: "东京餐饮门店试点机会",
  },
  "bilingual Xiaohongshu inbound campaign partner": {
    en: "a bilingual Xiaohongshu inbound campaign partnership",
    zh: "双语小红书线索合作",
  },
  "bilingual sales deck review": {
    en: "bilingual sales deck review",
    zh: "双语销售材料复核",
  },
  "event table matching and sponsor visibility": {
    en: "event table matching and sponsor visibility",
    zh: "活动桌次匹配和赞助曝光",
  },
  "follow-up message localization": {
    en: "follow-up message localization",
    zh: "跟进消息本地化",
  },
  "investor warm intro for seed fundraising": {
    en: "warm investor introductions for seed fundraising",
    zh: "种子轮融资的投资人暖介绍",
  },
  "Japan market entry advisor for China SaaS sales": {
    en: "Japan market-entry advice for China SaaS sales",
    zh: "中国 SaaS 销售进入日本市场的建议",
  },
  manufacturing_dx: {
    en: "manufacturing DX",
    zh: "制造业 DX",
  },
  "post-event follow-up workflow operator": {
    en: "post-event follow-up workflow",
    zh: "活动后的跟进流程",
  },
  "privacy-safe contact provenance audit": {
    en: "privacy-safe contact provenance audit",
    zh: "隐私安全的联系人来源复核",
  },
  restaurant_inbound: {
    en: "restaurant inbound opportunities",
    zh: "餐饮客户线索",
  },
  retail_omnichannel: {
    en: "retail and omnichannel operations",
    zh: "零售与全渠道运营",
  },
  "retail live-commerce distribution partner": {
    en: "retail live-commerce distribution partnerships",
    zh: "零售直播电商分销合作",
  },
  tourism_hospitality: {
    en: "tourism and hospitality",
    zh: "旅游与酒店场景",
  },
  venture_capital: {
    en: "venture capital",
    zh: "风险投资",
  },
};

function readableGeneratedTopic(value: string, locale: ArtifactLocale) {
  const normalized = value.trim().replace(/\.$/, "");
  const known = generatedRelationshipTopicLabels[normalized];

  if (known) return localize(locale, known);

  return normalized.replace(/[_-]+/g, " ");
}

function readableRelationshipText(input: {
  locale: ArtifactLocale;
  organization: string;
  participantName: string;
  value: string;
}) {
  const value = input.value.trim();
  const match = value.match(/^(.+?)\s+matches\s+([a-z0-9_-]+)\s+through\s+(.+?)\.?$/i);

  if (!match) return value;

  const topic = readableGeneratedTopic(match[2] ?? "", input.locale);
  const bridge = readableGeneratedTopic(match[3] ?? "", input.locale);
  const organization = input.organization || localize(input.locale, { en: "the selected organization", zh: "当前组织" });

  return localize(input.locale, {
    en: `${input.participantName} at ${organization} is connected through post-event relationship evidence: they are exploring ${topic}, and the useful thread to continue is ${bridge}.`,
    zh: `${input.participantName} 与 ${organization} 的关系来自活动后的交流证据：对方关注${topic}，当前适合围绕${bridge}继续确认合作机会。`,
  });
}

function readableRelationshipStage(stage: string, locale: ArtifactLocale) {
  const stages: Record<string, Record<ArtifactLocale, string>> = {
    active: { en: "Active conversation", zh: "正在交流" },
    active_collaboration: { en: "Active collaboration", zh: "正在合作" },
    needs_followup: { en: "Needs follow-up", zh: "需要跟进" },
    needs_follow_up: { en: "Needs follow-up", zh: "需要跟进" },
    reviewing: { en: "Needs review before follow-up", zh: "跟进前需要复核" },
  };

  return localize(locale, stages[stage] ?? { en: "Needs review", zh: "需要复核" });
}

function readableMessageBody(value: string, locale: ArtifactLocale) {
  const generatedRecord = value.match(/^最近跟进记录[:：]\s*(.+?)。?$/);

  if (generatedRecord) {
    return localize(locale, {
      en: `Recent follow-up record: ${readableGeneratedTopic(generatedRecord[1] ?? "", locale)}.`,
      zh: `最近跟进记录：${readableGeneratedTopic(generatedRecord[1] ?? "", locale)}。`,
    });
  }

  const generatedFollowup = value.match(
    /^Follow up about (.+) with a concrete next step\.$/,
  );

  if (generatedFollowup) {
    return localize(locale, {
      en: `Recent follow-up record: ${readableGeneratedTopic(generatedFollowup[1] ?? "", locale)}.`,
      zh: `最近跟进记录：${readableGeneratedTopic(generatedFollowup[1] ?? "", locale)}。`,
    });
  }

  if (/^Review source evidence before recording another live-storage message\.$/i.test(value)) {
    return localize(locale, {
      en: "Review source evidence before recording any follow-up.",
      zh: "先复核来源证据，再决定是否记录跟进。",
    });
  }

  return readableRelationshipText({
    locale,
    organization: "",
    participantName: localize(locale, { en: "This contact", zh: "这位联系人" }),
    value,
  });
}

function trimTerminalPunctuation(value: string) {
  return value.trim().replace(/[。.!?！？]+$/u, "");
}

function stripRecentRecordPrefix(value: string) {
  return value
    .trim()
    .replace(/^Recent follow-up record:\s*/i, "")
    .replace(/^最近跟进记录[:：]\s*/, "");
}

function datePartsFor(value: string): { day: number; month: number; year: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) return null;

  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function shortDateLabel(value: string, locale: ArtifactLocale) {
  const parts = datePartsFor(value);

  if (!parts) return "";

  if (locale === "zh") {
    return `${parts.month}月${parts.day}日`;
  }

  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][parts.month - 1];

  return month ? `${month} ${parts.day}` : "";
}

function fullDateLabel(value: string, locale: ArtifactLocale) {
  const parts = datePartsFor(value);

  if (!parts) return "";

  if (locale === "zh") {
    return `${parts.year}年${parts.month}月${parts.day}日`;
  }

  const shortDate = shortDateLabel(value, locale);

  return shortDate ? `${shortDate}, ${parts.year}` : "";
}

function messageReviewTopic(body: string, locale: ArtifactLocale) {
  if (/排期冲突|schedule conflict/i.test(body)) {
    return localize(locale, { en: "schedule conflict", zh: "排期冲突" });
  }

  if (/AI\s*pilot/i.test(body)) {
    return "AI pilot";
  }

  if (/pilot\s*时间线|pilot timing/i.test(body)) {
    return localize(locale, { en: "pilot timing", zh: "pilot 时间线" });
  }

  if (/合作窗口|cooperation window/i.test(body)) {
    return localize(locale, { en: "cooperation window", zh: "合作窗口" });
  }

  if (/共同客户|shared customer/i.test(body)) {
    return localize(locale, { en: "shared customer", zh: "共同客户场景" });
  }

  const readable = trimTerminalPunctuation(
    stripRecentRecordPrefix(readableMessageBody(body, locale)),
  );
  const limit = locale === "zh" ? 14 : 28;

  return readable.length > limit ? `${readable.slice(0, limit)}...` : readable;
}

function messageReviewActionLabel(message: ChatMessage, locale: ArtifactLocale) {
  const date = shortDateLabel(message.createdAt, locale);
  const topic = messageReviewTopic(message.body, locale);

  if (!date) {
    return localize(locale, {
      en: `Review ${topic}`,
      zh: `复核 ${topic}`,
    });
  }

  return localize(locale, {
    en: `Review ${date} ${topic}`,
    zh: `复核 ${date} ${topic}`,
  });
}

function readableMessageSender(message: ChatMessage, locale: ArtifactLocale) {
  const senderRole = message.senderRole.toLowerCase();

  if (
    senderRole.includes("orbit") ||
    senderRole.includes("operator") ||
    /orbit operator/i.test(message.senderName)
  ) {
    return localize(locale, {
      en: "Saved chat",
      zh: "已保存聊天",
    });
  }

  return (
    readText(message.senderName) ??
    localize(locale, {
      en: "Contact",
      zh: "联系人",
    })
  );
}

function readableMessageRole(role: string, locale: ArtifactLocale) {
  const normalized = role.toLowerCase();

  if (normalized.includes("orbit") || normalized.includes("operator")) {
    return localize(locale, {
      en: "Saved relationship note",
      zh: "已保存关系记录",
    });
  }

  if (normalized.includes("contact")) {
    return localize(locale, {
      en: "Contact reply",
      zh: "联系人回复",
    });
  }

  return localize(locale, {
    en: "Saved conversation record",
    zh: "已保存会话记录",
  });
}

function readableMessageDate(value: string, locale: ArtifactLocale) {
  return (
    fullDateLabel(value, locale) ||
    shortDateLabel(value, locale) ||
    localize(locale, {
      en: "Saved date unavailable",
      zh: "保存时间未知",
    })
  );
}

function readableMessageTitle(message: ChatMessage, locale: ArtifactLocale) {
  const sender = readableMessageSender(message, locale);
  const date = shortDateLabel(message.createdAt, locale);

  if (sender === localize(locale, { en: "Saved chat", zh: "已保存聊天" })) {
    return date
      ? localize(locale, {
          en: `Saved chat · ${date}`,
          zh: `已保存聊天 · ${date}`,
        })
      : sender;
  }

  return date
    ? localize(locale, {
        en: `${sender} message · ${date}`,
        zh: `${sender} 的消息 · ${date}`,
      })
    : localize(locale, {
        en: `${sender} message`,
        zh: `${sender} 的消息`,
      });
}

function relationshipOriginForMessages(
  messages: OrbitAgentFollowupContextGenerationInput["messages"],
  locale: ArtifactLocale,
) {
  const firstSavedMessage = messages[0];

  if (!firstSavedMessage) return null;

  const date = fullDateLabel(firstSavedMessage.createdAt, locale);
  const body = trimTerminalPunctuation(
    stripRecentRecordPrefix(readableMessageBody(firstSavedMessage.body, locale)),
  );

  if (!body) return null;

  return date
    ? localize(locale, {
        en: `first saved chat on ${date}: ${body}`,
        zh: `${date}首条保存聊天：${body}`,
      })
    : localize(locale, {
        en: `first saved chat: ${body}`,
        zh: `首条保存聊天：${body}`,
      });
}

function publicSourceLabel(sourceLabel: string, locale: ArtifactLocale) {
  const normalized = sourceLabel.toLowerCase();

  if (
    /chat conversation postgres|live storage|conversation data|chat context|conversation/i.test(
      normalized,
    )
  ) {
    return localize(locale, {
      en: "Saved relationship chat",
      zh: "来自已保存的关系聊天",
    });
  }

  return localize(locale, {
    en: "Source-backed relationship record",
    zh: "来自有来源的关系记录",
  });
}

function isPromiseLike<TResult>(result: TResult | Promise<TResult>): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

function evidenceIdsFor(
  messages: readonly ChatMessage[],
  fallback: readonly string[],
): readonly string[] {
  const evidenceIds = messages.flatMap((message) => message.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : fallback.length > 0
      ? fallback
      : ["evidence:orbit-agent:chat-context:empty"];
}

function emptyResolution(
  state: FollowupContextResolution["state"] = "missing",
): FollowupContextResolution {
  return {
    candidateCount: 0,
    matchedBy: "none",
    score: 0,
    selectedConversationId: null,
    state,
  };
}

function dataForThread(input: {
  generation: OrbitAgentFollowupContextGenerationResult | null;
  resolution: FollowupContextResolution;
  thread: ChatMessageThreadPayload;
}): ChatContextArtifactData {
  const { thread } = input;

  return {
    evidenceIds: evidenceIdsFor(thread.messages, thread.provenance.evidenceIds),
    generation: input.generation,
    generatedAt: thread.provenance.collectedAt,
    liveDatabaseReadExecuted:
      thread.provenance.liveDatabaseReadExecuted === true,
    messages: thread.messages,
    resolution: input.resolution,
    source: thread.provenance.source,
    sourceLabel: thread.provenance.sourceLabel,
    state: thread.state,
    summary: thread.summary,
    thread,
    toolStatus:
      thread.state === "success"
        ? "completed"
        : thread.state === "pending"
          ? "planned"
          : "skipped",
  };
}

function dataForFailure(
  failure: ChatConversationMockFailure,
  resolution: FollowupContextResolution = emptyResolution(),
): ChatContextArtifactData {
  return {
    evidenceIds: evidenceIdsFor([], failure.error.evidenceIds),
    generation: null,
    generatedAt: failure.error.provenance.collectedAt,
    liveDatabaseReadExecuted:
      failure.error.provenance.liveDatabaseReadExecuted === true,
    messages: [],
    resolution,
    source: failure.error.provenance.source,
    sourceLabel: failure.error.provenance.sourceLabel,
    state: "failure",
    summary: failure.error.message,
    thread: null,
    toolStatus: "failed",
  };
}

function dataForUnresolved(
  listResult: Extract<ChatConversationListResult, { success: true }>,
  resolution: FollowupContextResolution,
): ChatContextArtifactData {
  return {
    evidenceIds: evidenceIdsFor([], listResult.data.provenance.evidenceIds),
    generation: null,
    generatedAt: listResult.data.provenance.collectedAt,
    liveDatabaseReadExecuted:
      listResult.data.provenance.liveDatabaseReadExecuted === true,
    messages: [],
    resolution,
    source: listResult.data.provenance.source,
    sourceLabel: listResult.data.provenance.sourceLabel,
    state: "pending",
    summary: listResult.data.summary,
    thread: null,
    toolStatus: "planned",
  };
}

function dataForThreadResult(input: {
  generation: OrbitAgentFollowupContextGenerationResult | null;
  resolution: FollowupContextResolution;
  result: ChatMessageThreadResult;
}): ChatContextArtifactData {
  return input.result.success === true
    ? dataForThread({
        generation: input.generation,
        resolution: input.resolution,
        thread: input.result.data,
      })
    : dataForFailure(input.result, input.resolution);
}

const searchStopWords = new Set([
  "a",
  "about",
  "and",
  "before",
  "check",
  "context",
  "for",
  "follow",
  "from",
  "i",
  "me",
  "my",
  "relationship",
  "reply",
  "review",
  "risk",
  "schedule",
  "scheduling",
  "summarize",
  "the",
  "up",
  "use",
  "with",
  "上下文",
  "使用",
  "关系",
  "和",
  "回复",
  "总结",
  "我的",
  "的",
  "跟进",
]);

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/千寻/g, "千尋")
    .replace(/青叶/g, "青葉")
    .replace(/\s+/g, "");
}

function uniqueText(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.map((value) => readText(value)).filter((value): value is string => Boolean(value))),
  );
}

function requestToolArgumentTexts(
  request: OrbitAgentArtifactTaskRequest,
): string[] {
  const args = request.toolArguments ?? {};
  const keys = [
    "contactId",
    "contactName",
    "displayName",
    "organization",
    "participantName",
    "personName",
    "relationshipStage",
    "scheduleState",
  ] as const;

  return uniqueText(keys.map((key) => readText(args[key])));
}

function tokenizeSearchText(value: string): string[] {
  const normalizedValue = value.normalize("NFKC");
  const tokens = [
    ...(normalizedValue.match(/[\p{L}\p{N}]+/gu) ?? []),
    ...(normalizedValue.match(/[a-z0-9]+/giu) ?? []),
  ];

  return Array.from(
    new Set(
      tokens
        .map((token) => normalizeSearchText(token))
        .filter((token) => token.length >= 2 && !searchStopWords.has(token)),
    ),
  );
}

function conversationFields(
  conversation: ChatConversationSummary,
): readonly string[] {
  return [
    conversation.conversationId,
    conversation.participantContactId,
    conversation.participantName,
    conversation.organization,
    conversation.title,
    conversation.status,
    conversation.lastMessagePreview,
    conversation.oneToOneContext.contactId,
    conversation.oneToOneContext.latestContext,
    conversation.oneToOneContext.organization,
    conversation.oneToOneContext.participantName,
    conversation.oneToOneContext.recommendedFollowup,
    conversation.oneToOneContext.relationshipReason,
    conversation.oneToOneContext.relationshipStage,
  ].filter((value): value is string => Boolean(readText(value)));
}

function candidateText(conversation: ChatConversationSummary): string {
  return conversationFields(conversation).map(normalizeSearchText).join(" ");
}

function scoreContainsField(input: {
  conversation: ChatConversationSummary;
  matchedBy: string;
  score: number;
  value: string | null;
}): { matchedBy: string; score: number } | null {
  const value = readText(input.value);

  if (!value) {
    return null;
  }

  const normalized = normalizeSearchText(value);
  const fields = conversationFields(input.conversation).map(normalizeSearchText);

  if (fields.some((field) => field === normalized)) {
    return {
      matchedBy: input.matchedBy,
      score: Math.max(input.score, 0.96),
    };
  }

  if (fields.some((field) => field.includes(normalized))) {
    return {
      matchedBy: input.matchedBy,
      score: Math.max(input.score, normalized.length >= 4 ? 0.86 : 0.74),
    };
  }

  return null;
}

function scoreConversation(input: {
  conversation: ChatConversationSummary;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): { matchedBy: string; score: number } {
  const explicitConversationId =
    readText(input.request.toolArguments?.conversationId) ??
    readText(input.request.conversationId);
  const explicitContactId = readText(input.request.toolArguments?.contactId);

  if (
    explicitConversationId &&
    normalizeSearchText(explicitConversationId) ===
      normalizeSearchText(input.conversation.conversationId)
  ) {
    return { matchedBy: "conversationId", score: 1 };
  }

  if (
    explicitContactId &&
    normalizeSearchText(explicitContactId) ===
      normalizeSearchText(input.conversation.participantContactId)
  ) {
    return { matchedBy: "contactId", score: 0.98 };
  }

  let best = { matchedBy: "none", score: 0 };

  for (const value of requestToolArgumentTexts(input.request)) {
    const scored = scoreContainsField({
      conversation: input.conversation,
      matchedBy: "toolArguments",
      score: best.score,
      value,
    });

    if (scored && scored.score > best.score) {
      best = scored;
    }
  }

  const query = normalizeSearchText(input.query);
  const queryField = [
    input.conversation.participantName,
    input.conversation.organization,
    input.conversation.oneToOneContext.participantName,
    input.conversation.oneToOneContext.organization,
  ]
    .map((value) => normalizeSearchText(value))
    .find((value) => value.length >= 2 && query.includes(value));

  if (queryField) {
    best = {
      matchedBy: "query",
      score: Math.max(best.score, 0.86),
    };
  }

  const queryTerms = tokenizeSearchText(input.query);
  const identityFields = [
    input.conversation.participantName,
    input.conversation.organization,
    input.conversation.oneToOneContext.participantName,
    input.conversation.oneToOneContext.organization,
  ].map((value) => normalizeSearchText(value));
  const identityTermMatch = queryTerms.find(
    (term) =>
      term.length >= 4 &&
      identityFields.some((field) => field.includes(term)),
  );

  if (identityTermMatch) {
    best = {
      matchedBy: best.score >= 0.86 ? best.matchedBy : "query_terms",
      score: Math.max(best.score, 0.86),
    };
  }

  const text = candidateText(input.conversation);
  const matchedTerms = queryTerms.filter((term) =>
    text.includes(term),
  );

  if (matchedTerms.length > 0) {
    best = {
      matchedBy: best.score >= 0.86 ? best.matchedBy : "query_terms",
      score: Math.max(best.score, Math.min(0.86, 0.58 + matchedTerms.length * 0.12)),
    };
  }

  return best;
}

function selectedConversationFor(input: {
  listResult: Extract<ChatConversationListResult, { success: true }>;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): {
  conversation: ChatConversationSummary | null;
  resolution: FollowupContextResolution;
} {
  const scored = input.listResult.data.conversations
    .map((conversation) => ({
      conversation,
      ...scoreConversation({
        conversation,
        query: input.query,
        request: input.request,
      }),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.conversation.lastMessageAt.localeCompare(left.conversation.lastMessageAt) ||
        left.conversation.conversationId.localeCompare(right.conversation.conversationId),
    );
  const best = scored[0];
  const nextBest = scored[1];

  if (!best || best.score < FOLLOWUP_CONTEXT_ACCEPTED_SCORE) {
    return {
      conversation: null,
      resolution: {
        candidateCount: scored.length,
        matchedBy: best?.matchedBy ?? "none",
        score: best?.score ?? 0,
        selectedConversationId: null,
        state: "missing",
      },
    };
  }

  const isAmbiguous =
    best.matchedBy !== "conversationId" &&
    Boolean(nextBest) &&
    (nextBest?.score ?? 0) >= FOLLOWUP_CONTEXT_ACCEPTED_SCORE &&
    Math.abs(best.score - (nextBest?.score ?? 0)) < 0.03;

  if (isAmbiguous) {
    return {
      conversation: null,
      resolution: {
        candidateCount: scored.length,
        matchedBy: best.matchedBy,
        score: best.score,
        selectedConversationId: null,
        state: "ambiguous",
      },
    };
  }

  return {
    conversation: best.conversation,
    resolution: {
      candidateCount: scored.length,
      matchedBy: best.matchedBy,
      score: best.score,
      selectedConversationId: best.conversation.conversationId,
      state: "resolved",
    },
  };
}

function privacyModeFor(
  request: OrbitAgentArtifactTaskRequest,
): OrbitAgentFollowupContextGenerationInput["privacy"]["mode"] {
  const value =
    request.toolArguments?.privacyLimit ?? request.toolArguments?.privacyMode;

  return value === true || value === "limited" ? "limited" : "full";
}

function generationInputFor(input: {
  locale: ArtifactLocale;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
  resolution: FollowupContextResolution;
  thread: ChatMessageThreadPayload;
}): OrbitAgentFollowupContextGenerationInput {
  const messages = input.thread.messages.slice(-5);
  const context = input.thread.oneToOneContext;

  return {
    evidenceIds: evidenceIdsFor(input.thread.messages, input.thread.provenance.evidenceIds),
    locale: input.locale,
    messages: messages.map((message) => ({
      body: message.body,
      createdAt: message.createdAt,
      evidenceIds: message.evidenceIds,
      messageId: message.messageId,
      senderName: message.senderName,
      senderRole: message.senderRole,
    })),
    privacy: {
      excludedMessageCount: Math.max(0, input.thread.messages.length - messages.length),
      includedMessageCount: messages.length,
      mode: privacyModeFor(input.request),
    },
    query: input.query,
    relationship: {
      contactId: context.contactId,
      latestContext: context.latestContext,
      organization: context.organization,
      participantName: context.participantName,
      recommendedFollowup: context.recommendedFollowup,
      relationshipReason: context.relationshipReason,
      relationshipStage: context.relationshipStage,
    },
    resolution: {
      matchedBy: input.resolution.matchedBy,
      score: input.resolution.score,
      state: input.resolution.state,
    },
    selectedConversation: {
      conversationId: input.thread.conversation.conversationId,
      lastMessageAt: input.thread.conversation.lastMessageAt,
      participantContactId: input.thread.conversation.participantContactId,
      participantName: input.thread.conversation.participantName,
      status: input.thread.conversation.status,
    },
  };
}

const defaultFollowupContextGenerator: OrbitAgentFollowupContextGenerator = {
  generate(input) {
    const latestContext =
      input.relationship.latestContext || input.relationship.relationshipReason;
    const relationshipReason = readableRelationshipText({
      locale: input.locale,
      organization: input.relationship.organization,
      participantName: input.relationship.participantName,
      value: input.relationship.relationshipReason,
    });
    const readableLatestContext = readableRelationshipText({
      locale: input.locale,
      organization: input.relationship.organization,
      participantName: input.relationship.participantName,
      value: latestContext,
    });
    const nextAction = readableGeneratedTopic(input.relationship.recommendedFollowup, input.locale);
    const relationshipStage = readableRelationshipStage(input.relationship.relationshipStage, input.locale);
    const latestSourceMessage =
      [...input.messages].reverse().find((message) => message.senderRole === "contact") ??
      input.messages[input.messages.length - 1] ??
      null;
    const latestSourceRecord = latestSourceMessage
      ? readableMessageBody(latestSourceMessage.body, input.locale)
      : readableLatestContext;
    const relationshipReasonSentence = trimTerminalPunctuation(relationshipReason);
    const readableLatestContextSentence = trimTerminalPunctuation(readableLatestContext);
    const latestSourceRecordSentence = trimTerminalPunctuation(
      stripRecentRecordPrefix(latestSourceRecord),
    );
    const relationshipOrigin = relationshipOriginForMessages(input.messages, input.locale);
    const relationshipOriginSentence = relationshipOrigin
      ? localize(input.locale, {
          en: `Relationship origin: ${relationshipOrigin}.`,
          zh: `关系来源：${relationshipOrigin}。`,
        })
      : "";
    const latestContextSentence =
      readableLatestContextSentence === relationshipReasonSentence
        ? latestSourceRecordSentence
        : readableLatestContextSentence;
    const confirmationState = localize(input.locale, {
      en: "No message, calendar event, notification, or external action has been sent; confirm before taking the next step.",
      zh: "确认前不会发送消息、创建日程、通知任何人或执行外部动作。",
    });
    const organization = input.relationship.organization || localize(input.locale, { en: "the selected organization", zh: "当前组织" });

    return {
      confidenceLabel:
        input.resolution.score >= 0.86
          ? localize(input.locale, {
              en: "High confidence from source evidence",
              zh: "来源证据较充分",
            })
          : localize(input.locale, {
              en: "Source evidence needs review",
              zh: "来源证据需要复核",
            }),
      privacyNote:
        input.privacy.mode === "limited"
          ? localize(input.locale, {
              en: "Only privacy-limited relationship context is shown.",
              zh: "这里只显示隐私受限的关系上下文。",
            })
          : localize(input.locale, {
              en: "Only source-backed relationship context is shown.",
              zh: "这里只显示有来源证据的关系上下文。",
            }),
      recommendedFollowup: localize(input.locale, {
        en: `Confirm before generating follow-up suggestions for ${input.relationship.participantName} around ${nextAction}. ${confirmationState}`,
        zh: `确认后再为 ${input.relationship.participantName} 生成围绕“${nextAction}”的跟进建议。${confirmationState}`,
      }),
      relationshipContext: localize(input.locale, {
        en: `Recent follow-up record for ${input.relationship.participantName}: ${latestSourceRecordSentence}. ${relationshipOriginSentence}Current relationship state: ${relationshipStage}.`,
        zh: `最近跟进记录：${input.relationship.participantName} 提到${latestSourceRecordSentence}。${relationshipOriginSentence}当前关系状态：${relationshipStage}。`,
      }),
      summary: localize(input.locale, {
        en: `${input.relationship.participantName} is the ${organization} relationship contact. Why this relationship exists: ${relationshipReasonSentence}. ${relationshipOriginSentence}Latest context: ${latestContextSentence}. Suggested follow-up: confirm and generate suggestions around ${nextAction}. ${confirmationState}`,
        zh: `${input.relationship.participantName} 是 ${organization} 的关系联系人。为什么认识：${relationshipReasonSentence}。${relationshipOriginSentence}最新上下文：${latestContextSentence}。建议下一步：确认并生成围绕“${nextAction}”的跟进建议。${confirmationState}`,
      }),
    };
  },
};

function generatedContextFor(input: {
  generator: OrbitAgentFollowupContextGenerator;
  locale: ArtifactLocale;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
  resolution: FollowupContextResolution;
  thread: ChatMessageThreadPayload;
}) {
  return input.generator.generate(
    generationInputFor({
      locale: input.locale,
      query: input.query,
      request: input.request,
      resolution: input.resolution,
      thread: input.thread,
    }),
  );
}

function presentationFor(
  locale: ArtifactLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  const defaults: OrbitAgentArtifactPresentation = {
    preferredSurface: "side_panel",
    subtitle: localize(locale, {
      en: "Loaded from the Chat conversation service",
      zh: "来自 Chat 会话服务",
    }),
    title: localize(locale, {
      en: "Relationship chat context",
      zh: "关系聊天上下文",
    }),
    widthHint: "half",
  };

  return {
    ...defaults,
    ...presentation,
    title: presentation?.title?.trim() || defaults.title,
  };
}

function messagePreview(message: ChatMessage, locale: ArtifactLocale): string {
  const genericFollowup = message.body.match(
    /^Follow up about (.+) with a concrete next step\.$/,
  );
  const body = genericFollowup
    ? localize(locale, {
        en: `Recent follow-up note: ${readableGeneratedTopic(genericFollowup[1] ?? "", locale)}.`,
        zh: `最近跟进记录：${readableGeneratedTopic(genericFollowup[1] ?? "", locale)}。`,
      })
    : readableMessageBody(message.body, locale);

  return body.length > 180 ? `${body.slice(0, 177)}...` : body;
}

function messageItemFor(message: ChatMessage, locale: ArtifactLocale) {
  const savedAt = readableMessageDate(message.createdAt, locale);

  return {
    actions: [
      {
        actionId: `chat:review-message:${message.messageId}`,
        label: messageReviewActionLabel(message, locale),
        requiresConfirmation: true,
      },
    ],
    body: messagePreview(message, locale),
    confidenceLabel: localize(locale, {
      en: "Source-backed",
      zh: "来源已绑定",
    }),
    evidenceIds: message.evidenceIds,
    id: `chat-message:${message.messageId}`,
    metadata: [
      {
        label: localize(locale, { en: "Sender", zh: "发送方" }),
        value: readableMessageSender(message, locale),
      },
      {
        label: localize(locale, { en: "Role", zh: "角色" }),
        value: readableMessageRole(message.senderRole, locale),
      },
      {
        label: localize(locale, { en: "Created", zh: "时间" }),
        value: savedAt,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: publicSourceLabel(message.source.label, locale),
      },
      {
        label: localize(locale, { en: "Technical source", zh: "技术来源" }),
        value: message.source.label,
      },
    ],
    reason: localize(locale, {
      en: "This saved chat is shown only as reviewable relationship context.",
      zh: "这条已保存聊天只作为可复核的关系上下文。",
    }),
    subtitle: savedAt,
    title: readableMessageTitle(message, locale),
  };
}

function contextItemFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
) {
  const context = data.thread?.oneToOneContext;

  if (!context) {
    return null;
  }

  return {
    actions: [
      {
        actionId: `chat:confirm-followup:${context.contactId}`,
        label: localize(locale, {
          en: "Confirm and generate follow-up suggestions",
          zh: "确认并生成跟进建议",
        }),
        requiresConfirmation: true,
      },
      {
        actionId: `chat:defer-followup:${context.contactId}`,
        label: localize(locale, {
          en: "Not now",
          zh: "暂不继续",
        }),
        requiresConfirmation: false,
      },
      {
        actionId: `chat:review-context:${context.contactId}`,
        label: localize(locale, {
          en: "Review relationship context",
          zh: "复核关系上下文",
        }),
        requiresConfirmation: true,
      },
    ],
    body: data.generation?.relationshipContext ?? context.latestContext,
    confidenceLabel: data.generation?.confidenceLabel ?? context.relationshipStage,
    evidenceIds: context.evidenceIds,
    id: `chat-context:${context.contactId}`,
    metadata: [
      {
        label: localize(locale, { en: "Contact", zh: "联系人" }),
        value: context.participantName,
      },
      {
        label: localize(locale, { en: "Organization", zh: "组织" }),
        value: context.organization || localize(locale, { en: "Unknown", zh: "未知" }),
      },
      {
        label: localize(locale, { en: "Stage", zh: "阶段" }),
        value: context.relationshipStage,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: publicSourceLabel(data.sourceLabel, locale),
      },
      {
        label: localize(locale, { en: "Technical source", zh: "技术来源" }),
        value: data.sourceLabel,
      },
      {
        label: localize(locale, { en: "Resolution score", zh: "匹配分" }),
        value: data.resolution.score.toFixed(2),
      },
      {
        label: localize(locale, { en: "Matched by", zh: "匹配方式" }),
        value: data.resolution.matchedBy,
      },
      {
        label: localize(locale, { en: "Privacy", zh: "隐私范围" }),
        value:
          data.generation?.privacyNote ??
          localize(locale, {
            en: "Source-backed context",
            zh: "有来源证据的上下文",
          }),
      },
    ],
    reason: data.generation?.privacyNote ?? context.relationshipReason,
    subtitle: data.generation?.recommendedFollowup ?? context.recommendedFollowup,
    title: context.participantName,
  };
}

function unresolvedContextItemFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
) {
  return {
    actions: [],
    body:
      data.resolution.state === "ambiguous"
        ? localize(locale, {
            en: "More than one relationship matched this request. Ask for a contact, organization, or conversation before drafting follow-up context.",
            zh: "这次请求匹配到多个关系。请先明确联系人、组织或会话，再生成跟进上下文。",
          })
        : localize(locale, {
            en: "No relationship conversation reached the accepted score for a ready follow-up context panel.",
            zh: "没有关系会话达到可展示跟进上下文的匹配分。",
          }),
    confidenceLabel:
      data.resolution.state === "ambiguous"
        ? localize(locale, { en: "Needs clarification", zh: "需要澄清" })
        : localize(locale, { en: "Below threshold", zh: "低于阈值" }),
    evidenceIds: data.evidenceIds,
    id: `chat-context-resolution:${data.resolution.state}`,
    metadata: [
      {
        label: localize(locale, { en: "Resolution score", zh: "匹配分" }),
        value: data.resolution.score.toFixed(2),
      },
      {
        label: localize(locale, { en: "Matched by", zh: "匹配方式" }),
        value: data.resolution.matchedBy,
      },
      {
        label: localize(locale, { en: "Candidates", zh: "候选" }),
        value: String(data.resolution.candidateCount),
      },
    ],
    reason: localize(locale, {
      en: "Orbit keeps the side panel pending until context resolution meets the accepted evaluation threshold.",
      zh: "只有上下文解析达到评估阈值后，Orbit 才会把右侧面板设为可复核状态。",
    }),
    subtitle: localize(locale, {
      en: "Clarify the relationship before continuing.",
      zh: "先澄清关系对象再继续。",
    }),
    title: localize(locale, {
      en: "Clarify relationship context",
      zh: "澄清关系上下文",
    }),
  };
}

function emptyStateFor(data: ChatContextArtifactData, locale: ArtifactLocale): string | undefined {
  if (data.messages.length > 0) {
    return undefined;
  }

  if (data.state === "pending") {
    return localize(locale, {
      en: "The chat context is waiting for source data review.",
      zh: "聊天上下文正在等待来源数据复核。",
    });
  }

  if (data.state === "failure") {
    return localize(locale, {
      en: "Chat context could not be loaded from the Chat service.",
      zh: "无法从 Chat 服务加载聊天上下文。",
    });
  }

  return localize(locale, {
    en: "No live chat messages matched this context request.",
    zh: "没有匹配这次请求的 live 聊天消息。",
  });
}

function generatedViewFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  const contextItem = contextItemFor(data, locale);

  return {
    emptyState: emptyStateFor(data, locale),
    sections: [
      {
        body: localize(locale, {
          en: `Source: ${publicSourceLabel(data.sourceLabel, locale)}`,
          zh: `来源：${publicSourceLabel(data.sourceLabel, locale)}`,
        }),
        items: contextItem ? [contextItem] : [unresolvedContextItemFor(data, locale)],
        title: localize(locale, {
          en: "Relationship context",
          zh: "关系上下文",
        }),
      },
      {
        items: data.messages.slice(-5).map((message) => messageItemFor(message, locale)),
        title: localize(locale, {
          en: "Recent messages",
          zh: "最近消息",
        }),
      },
    ],
    summary:
      data.generation
        ? data.generation.summary
        : data.thread && data.messages.length > 0
          ? localize(locale, {
              en: `${data.thread.oneToOneContext.participantName} has ${data.messages.length} source-backed messages in ${data.thread.conversation.conversationId}.`,
              zh: `${data.thread.oneToOneContext.participantName} 在 ${data.thread.conversation.conversationId} 有 ${data.messages.length} 条带来源的消息。`,
            })
        : data.summary,
  };
}

function toolTraceFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: data.evidenceIds,
      reason:
        data.toolStatus === "failed"
          ? localize(locale, {
              en: "The Chat service returned a controlled failure while loading relationship chat context.",
              zh: "Chat 服务在加载关系聊天上下文时返回了受控失败。",
            })
          : data.resolution.state !== "resolved"
            ? localize(locale, {
                en: `Orbit AI scored relationship context resolution at ${data.resolution.score.toFixed(2)} via ${data.resolution.matchedBy}; the side panel remains pending until the accepted threshold is met without ambiguity.`,
                zh: `Orbit AI 通过 ${data.resolution.matchedBy} 将关系上下文匹配分评为 ${data.resolution.score.toFixed(2)}；在无歧义并达到阈值前，右侧面板保持待复核状态。`,
              })
          : localize(locale, {
              en: `Orbit AI resolved relationship chat context at ${data.resolution.score.toFixed(2)} via ${data.resolution.matchedBy}, then generated review-only follow-up context without sending messages, opening transport, or executing external actions.`,
              zh: `Orbit AI 通过 ${data.resolution.matchedBy} 以 ${data.resolution.score.toFixed(2)} 匹配到关系聊天上下文，并生成只供复核的跟进上下文；未发送消息、未打开传输层、未执行外部动作。`,
            }),
      status: data.toolStatus,
      toolCallId: "toolcall:relationship-chat-context:live-chat",
      toolName: "chat.context",
    },
  ];
}

function provenanceFor(
  data: ChatContextArtifactData,
  locale: ArtifactLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: data.evidenceIds,
    generatedAt: data.generatedAt || fallbackGeneratedAt,
    generationMethod: "artifact-producer-generated-view",
    source: data.source || ORBIT_AGENT_CHAT_CONTEXT_ARTIFACT_SOURCE,
    sourceModules: ["orbit-ai", "chat"],
    toolCalls: toolTraceFor(data, locale),
  };
}

function statusFor(data: ChatContextArtifactData): OrbitAgentArtifactStatus {
  if (data.resolution.state !== "resolved") {
    return "pending";
  }

  if (data.state === "pending") {
    return "pending";
  }

  if (data.state === "failure") {
    return "failed";
  }

  return "ready";
}

function taskFor(input: {
  conversationId?: string | null;
  generatedAt: string;
  presentation: OrbitAgentArtifactPresentation;
  query: string;
  status: OrbitAgentArtifactStatus;
}): OrbitAgentArtifactTask {
  return {
    artifactId: "artifact:relationship-chat-context:live-chat",
    artifactProducer: "relationship_chat_review_producer",
    conversationId:
      input.conversationId === undefined
        ? defaultConversationId
        : readText(input.conversationId),
    createdAt: input.generatedAt,
    kind: "relationship_chat_context",
    presentation: input.presentation,
    query: input.query,
    status: input.status,
    taskId: "task:relationship-chat-context:live-chat",
    updatedAt: input.generatedAt,
  };
}

function resultFor(input: {
  data: ChatContextArtifactData;
  locale: ArtifactLocale;
  presentation: OrbitAgentArtifactPresentation;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewFor(input.data, input.locale),
    kind: "relationship_chat_context",
    nextAction:
      input.data.resolution.state !== "resolved"
        ? localize(input.locale, {
            en: "Clarify the contact, organization, or conversation before drafting, sending, scheduling, or taking any external action.",
            zh: "请先澄清联系人、组织或会话，再决定是否起草、发送、安排日程或执行外部动作。",
          })
        : input.data.messages.length > 0
        ? localize(input.locale, {
            en: "Review chat evidence before drafting, sending, scheduling, or taking any external action.",
            zh: "请先复核聊天证据，再决定是否起草、发送、安排日程或执行外部动作。",
          })
        : localize(input.locale, {
            en: "Adjust the request or add source-backed chat messages.",
            zh: "请调整请求，或补充有来源证据的聊天消息。",
          }),
    presentation: input.presentation,
    provenance: provenanceFor(input.data, input.locale),
    safety: {
      ...safety,
      liveDatabaseReadExecuted: input.data.liveDatabaseReadExecuted,
    },
    status: input.task.status,
    taskId: input.task.taskId,
  };
}

function payloadFor(input: {
  data: ChatContextArtifactData;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const status = statusFor(input.data);
  const generatedAt = input.data.generatedAt || fallbackGeneratedAt;
  const task = taskFor({
    conversationId:
      input.data.thread?.conversation.conversationId ??
      input.data.resolution.selectedConversationId ??
      input.request.conversationId ??
      null,
    generatedAt,
    presentation,
    query: input.query,
    status,
  });

  return {
    result: resultFor({
      data: input.data,
      locale,
      presentation,
      task,
    }),
    task,
  };
}

function success(payload: OrbitAgentArtifactPayload): OrbitAgentArtifactResultEnvelope {
  return {
    data: payload,
    success: true,
  };
}

function resultForSelectedConversation(input: {
  chatService: ChatConversationMessageService;
  followupContextGenerator: OrbitAgentFollowupContextGenerator;
  listResult: ChatConversationListResult;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactResultEnvelope | Promise<OrbitAgentArtifactResultEnvelope> {
  if (input.listResult.success === false) {
    return success(
      payloadFor({
        data: dataForFailure(input.listResult, emptyResolution()),
        query: input.query,
        request: input.request,
      }),
    );
  }

  const selection = selectedConversationFor({
    listResult: input.listResult,
    query: input.query,
    request: input.request,
  });

  if (!selection.conversation) {
    return success(
      payloadFor({
        data: dataForUnresolved(input.listResult, selection.resolution),
        query: input.query,
        request: input.request,
      }),
    );
  }

  const threadResult = input.chatService.getMessageThread({
    conversationId: selection.conversation.conversationId,
    scenario: input.request.scenario,
  });
  const toArtifactResult = (
    resolved: ChatMessageThreadResult,
  ): OrbitAgentArtifactResultEnvelope | Promise<OrbitAgentArtifactResultEnvelope> => {
    if (resolved.success === false) {
      return success(
        payloadFor({
          data: dataForThreadResult({
            generation: null,
            resolution: selection.resolution,
            result: resolved,
          }),
          query: input.query,
          request: input.request,
        }),
      );
    }

    const locale = normalizeLocale(input.request.locale);
    const generationResult = generatedContextFor({
      generator: input.followupContextGenerator,
      locale,
      query: input.query,
      request: input.request,
      resolution: selection.resolution,
      thread: resolved.data,
    });
    const finish = (generation: OrbitAgentFollowupContextGenerationResult) =>
      success(
        payloadFor({
          data: dataForThreadResult({
            generation,
            resolution: selection.resolution,
            result: resolved,
          }),
          query: input.query,
          request: input.request,
        }),
      );

    if (isPromiseLike(generationResult)) {
      return generationResult.then(finish);
    }

    return finish(generationResult);
  };

  if (isPromiseLike(threadResult)) {
    return threadResult.then(toArtifactResult);
  }

  return toArtifactResult(threadResult);
}

export function createOrbitAgentChatContextArtifactService(input: {
  chatService?: ChatConversationMessageService;
  fallbackService?: OrbitAgentArtifactTaskService;
  followupContextGenerator?: OrbitAgentFollowupContextGenerator;
} = {}): OrbitAgentArtifactTaskService {
  const fallbackService =
    input.fallbackService ?? createOrbitAgentArtifactPreviewService();
  const chatService =
    input.chatService ?? createChatConversationMessageService();
  const followupContextGenerator =
    input.followupContextGenerator ?? defaultFollowupContextGenerator;

  return {
    createArtifactTask(request) {
      if (request.kind !== "relationship_chat_context") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      const listResult = chatService.listConversations({
        scenario: request.scenario,
      });
      const toArtifactResult = (resolved: ChatConversationListResult) =>
        resultForSelectedConversation({
          chatService,
          followupContextGenerator,
          listResult: resolved,
          query,
          request,
        });

      if (isPromiseLike(listResult)) {
        return listResult.then(toArtifactResult);
      }

      return toArtifactResult(listResult);
    },

    getArtifactTask(request) {
      return fallbackService.getArtifactTask(request);
    },
  };
}
