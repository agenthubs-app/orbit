import type {
  EventCrudImportProvenance,
  EventListResult,
  EventRecord,
  EventStatus,
} from "./event-crud-and-import/contract";
import type {
  EventCrudAndImportService,
  EventCrudAndImportServiceResult,
} from "./event-crud-and-import/service";
import { createEventCrudAndImportService } from "./service-factory";

export interface EventsRecommendationToolInput {
  query: string;
  toolArguments?: Record<string, unknown> | null;
}

export interface EventsRecommendationCandidate {
  databaseQueryExecuted: boolean;
  description: string;
  endsAt: string;
  // 事件源标签通常是「日文 / 中文 / 英文」三语串，供展示层按 locale 挑选。
  eventLabel: string;
  eventId: string;
  evidenceIds: readonly string[];
  // 从 description 里按 JA:/ZH:/EN: 标记抽出的分语言简介；缺失时为 null。
  localizedDescriptions: {
    en: string | null;
    ja: string | null;
    zh: string | null;
  };
  matchReasons: readonly string[];
  matchedTokens: readonly string[];
  nextAction: string;
  recommendedPreparation: string;
  relationshipContext: string;
  score: number;
  sourceLabel: string;
  startsAt: string;
  status: EventStatus;
  title: string;
  upcoming: boolean;
  venue: string;
}

export interface EventsRecommendationToolResult {
  candidates: readonly EventsRecommendationCandidate[];
  databaseQueryExecuted: boolean;
  evidenceIds: readonly string[];
  sourceLabel: string;
  state: "success" | "empty" | "failure";
  summary: string;
}

export type EventsRecommendationToolResultValue =
  | EventsRecommendationToolResult
  | Promise<EventsRecommendationToolResult>;

export interface EventsRecommendationTool {
  recommend: (
    input: EventsRecommendationToolInput,
  ) => EventsRecommendationToolResultValue;
}

export interface EventsRecommendationToolOptions {
  eventService?: EventCrudAndImportService;
  // 可注入的时间源，便于测试固定"未来活动优先"的判定；默认取真实当前时间。
  now?: () => number;
}

const preferredStatuses = new Set<EventStatus>(["confirmed", "imported"]);
const supportedStatuses = new Set<EventStatus>([
  "cancelled",
  "confirmed",
  "draft",
  "imported",
  "pending_import",
]);

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 5;
  }

  return Math.max(0, Math.floor(value));
}

function normalizedStatus(value: unknown): EventStatus | null {
  return typeof value === "string" && supportedStatuses.has(value as EventStatus)
    ? (value as EventStatus)
    : null;
}

// \u82f1\u6587\u865a\u8bcd\u4e0e\u8bf7\u6c42\u5957\u8bdd\u4e0d\u53c2\u4e0e\u5339\u914d\uff0c\u907f\u514d "to/want/join" \u8fd9\u7c7b\u8bcd\u628a\u65e0\u5173\u6d3b\u52a8\u9876\u4e0a\u6765\u3002
const tokenStopwords = new Set([
  "an",
  "and",
  "are",
  "at",
  "can",
  "for",
  "help",
  "in",
  "is",
  "join",
  "me",
  "meet",
  "my",
  "need",
  "of",
  "on",
  "people",
  "some",
  "that",
  "the",
  "to",
  "want",
  "who",
  "with",
]);

function tokensFor(query: string): readonly string[] {
  const lowered = query.toLowerCase();
  const runTokens = lowered
    .split(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  // \u4e2d\u6587/\u65e5\u6587\u53e5\u5b50\u91cc\u5d4c\u7740\u7684\u62c9\u4e01\u8bcd\uff08"\u53c2\u52a0AI\u76f8\u5173\u7684\u6d3b\u52a8"\u91cc\u7684 ai\uff09\u5355\u72ec\u62bd\u51fa\u6765\uff0c
  // \u5426\u5219\u6574\u6bb5 CJK \u8fde\u4e32\u6c38\u8fdc\u5339\u914d\u4e0d\u5230\u6d3b\u52a8\u6587\u672c\u91cc\u7684\u82f1\u6587\u5173\u952e\u8bcd\u3002
  const embeddedLatinTokens = (lowered.match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 2,
  );

  return Array.from(
    new Set(
      [...runTokens, ...embeddedLatinTokens].filter(
        (token) => !tokenStopwords.has(token),
      ),
    ),
  );
}

function isLatinToken(token: string): boolean {
  return /^[a-z0-9]+$/.test(token);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// \u62c9\u4e01\u8bcd\u7528\u8bcd\u8fb9\u754c\u5339\u914d\uff0c\u907f\u514d "ai" \u547d\u4e2d "Kansai" \u8fd9\u7c7b\u5b50\u4e32\uff1bCJK \u8bcd\u4fdd\u6301\u5b50\u4e32\u5339\u914d\u3002
function textMatchesToken(text: string, token: string): boolean {
  if (isLatinToken(token)) {
    return new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(text);
  }

  return text.includes(token);
}

// 种子活动的 description 把三语简介拼在一段里（"JA: … ZH: … EN: …"）；
// 按标记抽出各语言句子，展示层就不用透出整个导入串。
function localizedDescriptionsFor(description: string): {
  en: string | null;
  ja: string | null;
  zh: string | null;
} {
  const read = (marker: string): string | null => {
    const match = description.match(
      new RegExp(`${marker}:\\s*([^]*?)(?=\\s(?:JA|ZH|EN):|\\sprofile_|$)`),
    );
    const text = match?.[1]?.trim();

    return text ? text : null;
  };

  return { en: read("EN"), ja: read("JA"), zh: read("ZH") };
}

function eventText(event: EventRecord): string {
  return [
    event.title,
    event.description,
    event.venue,
    event.relationshipContext,
    event.recommendedPreparation,
    event.nextAction,
    event.sourceMetadata.label,
  ]
    .join(" ")
    .toLowerCase();
}

function databaseReadExecuted(provenance: EventCrudImportProvenance): boolean {
  return (
    provenance.generationMethod === "live-store-query" ||
    provenance.source.includes("live-store") ||
    provenance.source.includes("postgres")
  );
}

function evidenceIdsFor(event: EventRecord): readonly string[] {
  const evidenceIds = event.evidence.map((evidence) => evidence.evidenceId);

  return evidenceIds.length > 0
    ? evidenceIds
    : [`evidence:event:${event.id}:missing`];
}

function matchScore(input: {
  event: EventRecord;
  query: string;
  tokens: readonly string[];
  upcoming: boolean;
}): { matchedTokens: readonly string[]; score: number } {
  const text = eventText(input.event);
  const matchedTokens = input.tokens.filter((token) =>
    textMatchesToken(text, token),
  );
  const statusScore = preferredStatuses.has(input.event.status) ? 20 : 0;
  const queryScore = matchedTokens.length * 15;
  const contextScore = readText(input.event.relationshipContext) ? 10 : 0;
  const preparationScore = readText(input.event.recommendedPreparation) ? 10 : 0;
  const fallbackScore = input.tokens.length === 0 ? 15 : 0;
  // 还没开始的活动才真正"可以参加"；已结束的只作为线索保留、排序靠后。
  const upcomingScore = input.upcoming ? 15 : 0;

  return {
    matchedTokens,
    score: Math.min(
      100,
      statusScore +
        queryScore +
        contextScore +
        preparationScore +
        fallbackScore +
        upcomingScore,
    ),
  };
}

function matchReasonsFor(input: {
  event: EventRecord;
  matchedTokens: readonly string[];
  query: string;
}): readonly string[] {
  const reasons: string[] = [];

  if (input.matchedTokens.length > 0) {
    reasons.push(`Matched request query "${input.query}" against live event text.`);
  }

  const relationshipContext = readText(input.event.relationshipContext);

  if (relationshipContext) {
    reasons.push(relationshipContext);
  }

  const recommendedPreparation = readText(input.event.recommendedPreparation);

  if (recommendedPreparation) {
    reasons.push(recommendedPreparation);
  }

  return reasons.length > 0
    ? reasons
    : ["Event is available from live Events data for review."];
}

function candidateFor(input: {
  databaseQueryExecuted: boolean;
  event: EventRecord;
  nowMs: number;
  query: string;
  sourceLabel: string;
  tokens: readonly string[];
}): EventsRecommendationCandidate {
  const startsAtMs = Date.parse(input.event.startsAt);
  const upcoming = Number.isFinite(startsAtMs) && startsAtMs >= input.nowMs;
  const { matchedTokens, score } = matchScore({
    event: input.event,
    query: input.query,
    tokens: input.tokens,
    upcoming,
  });

  return {
    databaseQueryExecuted: input.databaseQueryExecuted,
    description: input.event.description,
    endsAt: input.event.endsAt,
    eventLabel: input.event.sourceMetadata.label ?? input.event.title,
    eventId: input.event.id,
    evidenceIds: evidenceIdsFor(input.event),
    localizedDescriptions: localizedDescriptionsFor(input.event.description),
    matchReasons: matchReasonsFor({
      event: input.event,
      matchedTokens,
      query: input.query,
    }),
    matchedTokens,
    nextAction: input.event.nextAction,
    recommendedPreparation: input.event.recommendedPreparation,
    relationshipContext: input.event.relationshipContext,
    score,
    sourceLabel: input.sourceLabel,
    startsAt: input.event.startsAt,
    status: input.event.status,
    title: input.event.title,
    upcoming,
    venue: input.event.venue,
  };
}

function compareCandidates(
  left: EventsRecommendationCandidate,
  right: EventsRecommendationCandidate,
): number {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return left.startsAt.localeCompare(right.startsAt);
}

function resultForList(
  listResult: EventListResult,
  input: EventsRecommendationToolInput,
  nowMs: number,
): EventsRecommendationToolResult {
  if (listResult.success === false) {
    return {
      candidates: [],
      databaseQueryExecuted: false,
      evidenceIds: listResult.error.evidenceIds,
      sourceLabel: listResult.error.provenance.sourceLabel,
      state: "failure",
      summary: listResult.error.message,
    };
  }

  const query = input.query.trim();
  const limit = normalizedLimit(input.toolArguments?.limit);
  // 模型抽取的英文检索词（searchTerms）与领域标签（domains，多选枚举）
  // 同原始 query 合并参与匹配，中文/日文请求由此拿到能命中双语活动文本的英文关键词。
  const searchTerms = readText(input.toolArguments?.searchTerms);
  const domainWords = Array.isArray(input.toolArguments?.domains)
    ? (input.toolArguments?.domains as unknown[])
        .filter((domain): domain is string => typeof domain === "string")
        .join(" ")
        .replace(/_/g, " ")
    : "";
  const tokens = tokensFor(
    [query, searchTerms ?? "", domainWords].filter(Boolean).join(" "),
  );
  const modelGuided = Boolean(searchTerms) || domainWords.length > 0;
  // 有模型判断（检索词或领域）=相关性模式，零命中的活动被过滤；
  // 没有时（纯正则/测试路径）保持可用性列表行为，不做整体过滤。
  const requireTokenMatch = modelGuided && tokens.length > 0;
  const databaseQueryExecuted = databaseReadExecuted(listResult.data.provenance);
  const candidates = listResult.data.events
    .filter((event) => event.status !== "cancelled")
    .map((event) =>
      candidateFor({
        databaseQueryExecuted,
        event,
        nowMs,
        query,
        sourceLabel: listResult.data.provenance.sourceLabel,
        tokens,
      }),
    )
    .filter((candidate) => !requireTokenMatch || candidate.matchedTokens.length > 0)
    .sort(compareCandidates)
    .slice(0, limit);
  const evidenceIds = candidates.flatMap((candidate) => candidate.evidenceIds);

  return {
    candidates,
    databaseQueryExecuted,
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : listResult.data.provenance.evidenceIds,
    sourceLabel: listResult.data.provenance.sourceLabel,
    state: candidates.length > 0 ? "success" : "empty",
    summary:
      candidates.length > 0
        ? `${candidates.length} event(s) matched the request from live Events data.`
        : "No live Events records matched this request.",
  };
}

function isPromiseLike<TResult>(
  result: EventCrudAndImportServiceResult<TResult>,
): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

export function createEventsRecommendationTool(
  options: EventsRecommendationToolOptions = {},
): EventsRecommendationTool {
  const eventService = options.eventService ?? createEventCrudAndImportService();
  const now = options.now ?? (() => Date.now());

  return {
    recommend(input): EventsRecommendationToolResultValue {
      const statusFilter = normalizedStatus(input.toolArguments?.statusFilter);
      const nowMs = now();
      const listResult = eventService.listEvents(
        statusFilter ? { statusFilter } : {},
      );

      if (isPromiseLike(listResult)) {
        return listResult.then((resolved) => resultForList(resolved, input, nowMs));
      }

      return resultForList(listResult, input, nowMs);
    },
  };
}
