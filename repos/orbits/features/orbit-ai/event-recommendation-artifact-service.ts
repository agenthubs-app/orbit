import {
  type EventsRecommendationCandidate,
  type EventsRecommendationTool,
  type EventsRecommendationToolResult,
  type EventsRecommendationToolResultValue,
} from "../events/event-recommendation-tool";
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
import {
  createOrbitAiEventRecommendationService,
  ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD,
  type OrbitAiEventRecommendation,
  type OrbitAiEventRecommendationResult,
} from "./event-recommendation-service";
import type { OrbitAgentArtifactTaskService } from "./service";

export const ORBIT_AGENT_EVENT_RECOMMENDATION_ARTIFACT_SOURCE =
  "runtime:features/orbit-ai/event-recommendation-artifact-service.ts" as const;

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

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): ArtifactLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(locale: ArtifactLocale, copy: Record<ArtifactLocale, string>) {
  return copy[locale];
}

function isPromiseLike(
  result: EventsRecommendationToolResultValue,
): result is Promise<EventsRecommendationToolResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

function statusFor(result: EventsRecommendationToolResult): OrbitAgentArtifactStatus {
  return result.state === "failure" ? "failed" : "ready";
}

function toolStatusFor(
  result: EventsRecommendationToolResult,
): OrbitAgentArtifactToolCallTrace["status"] {
  if (result.state === "failure") {
    return "failed";
  }

  return result.state === "success" ? "completed" : "skipped";
}

function evidenceIdsFor(result: EventsRecommendationToolResult): readonly string[] {
  const evidenceIds = result.candidates.flatMap(
    (candidate) => candidate.evidenceIds,
  );

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : result.evidenceIds.length > 0
      ? result.evidenceIds
      : ["evidence:orbit-agent:event-recommendations:empty"];
}

function presentationFor(
  locale: ArtifactLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  const defaults: OrbitAgentArtifactPresentation = {
    preferredSurface: "side_panel",
    subtitle: localize(locale, {
      en: "Loaded from the Events service",
      zh: "来自活动服务",
    }),
    title: localize(locale, {
      en: "Recommended events",
      zh: "推荐活动",
    }),
    widthHint: "half",
  };

  return {
    ...defaults,
    ...presentation,
    title: presentation?.title?.trim() || defaults.title,
  };
}

function localizedSourceLabel(label: string, locale: ArtifactLocale): string {
  const labels: Record<string, Record<ArtifactLocale, string>> = {
    "Attendee intent notes": {
      en: "Attendee intent notes",
      zh: "参会者意图记录",
    },
    "Event topic record": {
      en: "Event topic record",
      zh: "活动主题记录",
    },
    "Profile fit summary": {
      en: "Profile fit summary",
      zh: "画像匹配摘要",
    },
    "Relationship opportunity graph": {
      en: "Relationship opportunity graph",
      zh: "关系机会图谱",
    },
    "Schedule timing record": {
      en: "Schedule timing record",
      zh: "日程时间记录",
    },
  };

  return labels[label]?.[locale] ?? label;
}

function dateLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function confidenceLabelFor(
  candidate: EventsRecommendationCandidate,
  locale: ArtifactLocale,
): string {
  if (candidate.score >= 80) {
    return localize(locale, { en: "High fit", zh: "高匹配" });
  }

  if (candidate.score >= 50) {
    return localize(locale, { en: "Relevant", zh: "相关" });
  }

  return localize(locale, { en: "Available", zh: "可复核" });
}

// 活动源标签是「日文 / 中文 / 英文」多语串（title 有时只有日/英两段）；
// zh 页面挑"有汉字且无假名"的中文段，en 页面挑纯拉丁段，缺段时回退。
// 也被活动报名页复用:live 活动的 title 是「日/中/英」斜杠拼接串,展示与
// 模型输入前按语言挑出单一段。
export function bilingualSegment(text: string, locale: ArtifactLocale): string {
  const segments = text
    .split(/\s*\/\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return text.trim();
  }

  const hasKana = (segment: string) => /[぀-ヿ]/u.test(segment);
  const hasHan = (segment: string) => /[㐀-鿿]/u.test(segment);

  if (locale === "en") {
    return (
      segments.find((segment) => !hasHan(segment) && !hasKana(segment)) ??
      segments[segments.length - 1]
    );
  }

  return (
    segments.find((segment) => hasHan(segment) && !hasKana(segment)) ??
    segments.find(hasHan) ??
    segments[0]
  );
}

function itemFor(candidate: EventsRecommendationCandidate, locale: ArtifactLocale) {
  // live 库的 description/relationshipContext 是导入原始串，不适合直接展示；
  // 卡片文案从匹配词和时间状态确定性生成，保持当前语言。
  // 旧缓存和测试替身可能来自 matchedTokens/localizedDescriptions 加入前的
  // candidate 版本。展示边界必须兼容这类已持久化 payload，不能因为可选的
  // 增强字段缺失而让整个 artifact 失败。
  const matchedTokens = candidate.matchedTokens ?? [];
  const matchedReason =
    matchedTokens.length > 0
      ? localize(locale, {
          en: `Matched your request on: ${matchedTokens.join(", ")}.`,
          zh: `与你的请求在「${matchedTokens.join("、")}」上匹配。`,
        })
      : localize(locale, {
          en: "Available from live Events data for review.",
          zh: "来自活动库的可复核活动。",
        });
  const timingNote = candidate.upcoming
    ? localize(locale, {
        en: "Upcoming — open the event page to review details before registering.",
        zh: "尚未开始——可打开活动页复核详情后再决定是否报名。",
      })
    : localize(locale, {
        en: "Already ended — keep it as a lead for similar events and the people who attended.",
        zh: "已结束——可作为同类活动与参会人脉的线索复核。",
      });
  // 有分语言简介时先给简介，再接未开始/已结束提示。
  const localizedDescriptions = candidate.localizedDescriptions ?? {
    en: null,
    ja: null,
    zh: null,
  };
  const localizedDescription =
    locale === "zh"
      ? localizedDescriptions.zh
      : localizedDescriptions.en;
  const body = localizedDescription
    ? `${localizedDescription} ${timingNote}`
    : timingNote;

  return {
    actions: [
      {
        actionId: `event:review:${candidate.eventId}`,
        href: `/app/events/${candidate.eventId}`,
        label: localize(locale, {
          en: "Review event",
          zh: "复核活动",
        }),
        requiresConfirmation: true,
      },
    ],
    body,
    confidenceLabel: confidenceLabelFor(candidate, locale),
    evidenceIds: candidate.evidenceIds,
    id: `event-recommendation:${candidate.eventId}`,
    metadata: [
      {
        label: localize(locale, { en: "When", zh: "时间" }),
        value: dateLabel(candidate.startsAt),
      },
      {
        label: localize(locale, { en: "Start", zh: "开始" }),
        value: candidate.startsAt,
      },
      {
        label: localize(locale, { en: "Status", zh: "状态" }),
        value: candidate.status,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: candidate.sourceLabel,
      },
      {
        label: localize(locale, { en: "Score", zh: "分数" }),
        value: String(candidate.score),
      },
    ],
    reason: matchedReason,
    subtitle: candidate.venue,
    title: bilingualSegment(candidate.eventLabel || candidate.title, locale),
  };
}

function emptyStateFor(
  result: EventsRecommendationToolResult,
  locale: ArtifactLocale,
): string | undefined {
  if (result.candidates.length > 0) {
    return undefined;
  }

  return result.state === "failure"
    ? localize(locale, {
        en: "Events could not be loaded for this recommendation request.",
        zh: "无法为这次推荐请求加载活动。",
      })
    : localize(locale, {
        en: "No live Events records matched this request.",
        zh: "没有匹配这次请求的 live 活动。",
      });
}

function generatedViewFor(
  result: EventsRecommendationToolResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  return {
    emptyState: emptyStateFor(result, locale),
    sections: [
      {
        body: localize(locale, {
          en: `Source: ${result.sourceLabel}`,
          zh: `来源：${result.sourceLabel}`,
        }),
        items: result.candidates.map((candidate) => itemFor(candidate, locale)),
        title: localize(locale, {
          en: "Event matches",
          zh: "活动匹配",
        }),
      },
    ],
    summary:
      result.candidates.length > 0
        ? localize(locale, {
            en: `${result.candidates.length} event(s) are ready for review.`,
            zh: `已有 ${result.candidates.length} 个活动可复核。`,
          })
        : emptyStateFor(result, locale) ?? result.summary,
  };
}

function confidenceLabelForGoalRecommendation(
  recommendation: OrbitAiEventRecommendation,
  locale: ArtifactLocale,
): string {
  if (recommendation.confidence === "high") {
    return localize(locale, {
      en: `High confidence · ${recommendation.score}`,
      zh: `高可信 · ${recommendation.score}`,
    });
  }

  return localize(locale, {
    en: `Evidence fit · ${recommendation.score}`,
    zh: `证据匹配 · ${recommendation.score}`,
  });
}

function peopleLabelForGoalRecommendation(
  recommendation: OrbitAiEventRecommendation,
): string {
  return recommendation.peopleToMeet
    .slice(0, 3)
    .map((person) => `${person.name} (${person.role})`)
    .join(", ");
}

function evidenceBodyForGoalRecommendation(
  recommendation: OrbitAiEventRecommendation,
  locale: ArtifactLocale,
): string {
  const people = recommendation.peopleToMeet
    .slice(0, 3)
    .map((person) => `${person.name}: ${person.reason}`)
    .join(" ");
  const evidence = recommendation.evidenceSnippets
    .slice(0, 3)
    .map(
      (snippet) =>
        `${localizedSourceLabel(snippet.sourceLabel, locale)}: ${snippet.snippet}`,
    )
    .join(" ");

  return localize(locale, {
    en: `People to meet: ${people} Timing: ${recommendation.timing} Evidence: ${evidence}`,
    zh: `建议认识的人：${people} 时间：${recommendation.timing} 证据：${evidence}`,
  });
}

function generatedViewForGoalRecommendation(
  result: OrbitAiEventRecommendationResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  const items = result.recommendations.map((recommendation) => ({
    actions: [
      {
        actionId: `event:review:${recommendation.eventId}`,
        href: recommendation.detailHref,
        label: localize(locale, {
          en: "Review event",
          zh: "复核活动",
        }),
        requiresConfirmation: true,
      },
    ],
    body: evidenceBodyForGoalRecommendation(recommendation, locale),
    confidenceLabel: confidenceLabelForGoalRecommendation(
      recommendation,
      locale,
    ),
    evidenceIds: recommendation.evidenceIds,
    id: `event-recommendation:${recommendation.eventId}`,
    metadata: [
      {
        label: localize(locale, { en: "Event", zh: "活动" }),
        value: recommendation.eventId,
      },
      {
        label: localize(locale, { en: "Timing", zh: "时间" }),
        value: recommendation.timing,
      },
      {
        label: localize(locale, { en: "Start", zh: "开始" }),
        value: recommendation.startsAt,
      },
      {
        label: localize(locale, { en: "End", zh: "结束" }),
        value: recommendation.endsAt,
      },
      {
        label: localize(locale, { en: "Location", zh: "地点" }),
        value: recommendation.venue,
      },
      {
        label: localize(locale, { en: "People", zh: "建议认识" }),
        value: peopleLabelForGoalRecommendation(recommendation),
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: recommendation.evidenceSnippets[0]
          ? localizedSourceLabel(recommendation.evidenceSnippets[0].sourceLabel, locale)
          : "Orbit",
      },
      {
        label: localize(locale, { en: "Score", zh: "匹配分" }),
        value: String(recommendation.score),
      },
    ],
    reason: recommendation.whyThisEvent,
    subtitle: `${recommendation.venue} · ${dateLabel(recommendation.startsAt)}`,
    title: recommendation.title,
  }));

  return {
    emptyState:
      result.readiness.state === "needs_more_context"
        ? localize(locale, {
            en: "Add a clearer attendee, event topic, schedule, relationship, or profile-fit goal before showing event recommendations as ready.",
            zh: "请补充更明确的参会人、活动主题、时间、关系或画像目标后，再展示可用活动推荐。",
          })
        : result.readiness.state === "no_recommendation"
          ? localize(locale, {
              en: "No source-backed event cleared the ready threshold for this goal.",
              zh: "没有有来源证据的活动达到这次目标的可展示阈值。",
            })
          : undefined,
    sections: [
      {
        body: localize(locale, {
          en: `Ready threshold: ${ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD}. Recommendations use attendee intent, event topic, schedule timing, relationship opportunities, and profile fit.`,
          zh: `可展示阈值：${ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD}。推荐会使用参会意图、活动主题、时间、关系机会和画像匹配。`,
        }),
        items,
        title: localize(locale, {
          en: "Goal-based event recommendations",
          zh: "按目标匹配的活动推荐",
        }),
      },
    ],
    summary: result.summary,
  };
}

function toolTraceFor(
  result: EventsRecommendationToolResult,
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: evidenceIdsFor(result),
      reason:
        result.state === "failure"
          ? localize(locale, {
              en: "The Events tool returned a controlled failure while loading recommendations.",
              zh: "Events 工具在加载推荐时返回了受控失败。",
            })
          : localize(locale, {
              en: "Orbit AI loaded reviewable event recommendations from Events without registration, calendar writes, notifications, or external actions.",
              zh: "Orbit AI 从 Events 加载可复核活动推荐，未报名、未写日历、未发通知、未执行外部动作。",
            }),
      status: toolStatusFor(result),
      toolCallId: "toolcall:event-recommendations:live-events",
      toolName: "events.recommend",
    },
  ];
}

function provenanceFor(
  result: EventsRecommendationToolResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: evidenceIdsFor(result),
    generatedAt: fallbackGeneratedAt,
    generationMethod: "artifact-producer-generated-view",
    source: ORBIT_AGENT_EVENT_RECOMMENDATION_ARTIFACT_SOURCE,
    sourceModules: ["orbit-ai", "events"],
    toolCalls: toolTraceFor(result, locale),
  };
}

function evidenceIdsForGoalRecommendation(
  result: OrbitAiEventRecommendationResult,
): readonly string[] {
  const evidenceIds = result.recommendations.flatMap(
    (recommendation) => recommendation.evidenceIds,
  );

  return evidenceIds.length > 0
    ? Array.from(new Set(evidenceIds))
    : ["evidence:orbit-agent:event-recommendations:goal-service:empty"];
}

function taskFor(input: {
  conversationId?: string | null;
  presentation: OrbitAgentArtifactPresentation;
  query: string;
  status: OrbitAgentArtifactStatus;
}): OrbitAgentArtifactTask {
  return {
    artifactId: "artifact:event-recommendations:live-events",
    artifactProducer: "event_recommendation_producer",
    conversationId: readText(input.conversationId) ?? defaultConversationId,
    createdAt: fallbackGeneratedAt,
    kind: "event_recommendations",
    presentation: input.presentation,
    query: input.query,
    status: input.status,
    taskId: "task:event-recommendations:live-events",
    updatedAt: fallbackGeneratedAt,
  };
}

function resultForGoalRecommendation(input: {
  locale: ArtifactLocale;
  presentation: OrbitAgentArtifactPresentation;
  recommendationResult: OrbitAiEventRecommendationResult;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  const evidenceIds = evidenceIdsForGoalRecommendation(
    input.recommendationResult,
  );

  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewForGoalRecommendation(
      input.recommendationResult,
      input.locale,
    ),
    kind: "event_recommendations",
    nextAction:
      input.recommendationResult.readiness.state === "ready"
        ? localize(input.locale, {
            en: "Open an event detail page and verify attendee, topic, timing, relationship, and profile-fit evidence before registration, calendar holds, messages, or notifications.",
            zh: "请打开活动详情页并复核参会人、主题、时间、关系和画像证据，再决定是否报名、占日历、发消息或通知。",
          })
        : localize(input.locale, {
            en: "Clarify the event discovery goal before presenting recommendations as ready.",
            zh: "请先明确活动发现目标，再把推荐标记为可用。",
          }),
    presentation: input.presentation,
    provenance: {
      evidenceIds,
      generatedAt: fallbackGeneratedAt,
      generationMethod: "artifact-producer-generated-view",
      source: ORBIT_AGENT_EVENT_RECOMMENDATION_ARTIFACT_SOURCE,
      sourceModules: ["orbit-ai", "events"],
      toolCalls: [
        {
          evidenceIds,
          reason: localize(input.locale, {
            en: "goal_relevance_v1 ranked source-backed events by attendee intent, event topic, schedule timing, relationship opportunities, and profile fit; no registration, calendar write, notification, or external action ran.",
            zh: "goal_relevance_v1 已按参会意图、活动主题、时间、关系机会和画像匹配对有来源活动排序；未报名、未写日历、未发通知、未执行外部动作。",
          }),
          status: "completed",
          toolCallId: "toolcall:event-recommendations:goal-relevance-v1",
          toolName: "events.recommend",
        },
      ],
    },
    safety: {
      ...safety,
      liveDatabaseReadExecuted: false,
    },
    status: input.task.status,
    taskId: input.task.taskId,
  };
}

function resultFor(input: {
  locale: ArtifactLocale;
  presentation: OrbitAgentArtifactPresentation;
  recommendationResult: EventsRecommendationToolResult;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewFor(input.recommendationResult, input.locale),
    kind: "event_recommendations",
    nextAction:
      input.recommendationResult.candidates.length > 0
        ? localize(input.locale, {
            en: "Review event evidence before registering, adding calendar holds, notifying anyone, or taking external action.",
            zh: "请先复核活动证据，再决定是否报名、加入日历、通知他人或执行外部动作。",
          })
        : localize(input.locale, {
            en: "Adjust the request or add source-backed Events records.",
            zh: "请调整请求，或补充有来源证据的活动记录。",
          }),
    presentation: input.presentation,
    provenance: provenanceFor(input.recommendationResult, input.locale),
    safety: {
      ...safety,
      liveDatabaseReadExecuted:
        input.recommendationResult.databaseQueryExecuted === true,
    },
    status: input.task.status,
    taskId: input.task.taskId,
  };
}

function maxRecommendationsFor(toolArguments: Record<string, unknown> | null | undefined) {
  const limit = toolArguments?.limit;

  return typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : undefined;
}

function payloadFor(input: {
  query: string;
  recommendationResult: EventsRecommendationToolResult;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const task = taskFor({
    conversationId: input.request.conversationId,
    presentation,
    query: input.query,
    status: statusFor(input.recommendationResult),
  });

  return {
    result: resultFor({
      locale,
      presentation,
      recommendationResult: input.recommendationResult,
      task,
    }),
    task,
  };
}

function payloadForGoalRecommendation(input: {
  query: string;
  recommendationResult: OrbitAiEventRecommendationResult;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const task = taskFor({
    conversationId: input.request.conversationId,
    presentation,
    query: input.query,
    status: "ready",
  });

  return {
    result: resultForGoalRecommendation({
      locale,
      presentation,
      recommendationResult: input.recommendationResult,
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

export function createOrbitAgentEventRecommendationArtifactService(input: {
  fallbackService?: OrbitAgentArtifactTaskService;
  recommendationTool?: EventsRecommendationTool;
} = {}): OrbitAgentArtifactTaskService {
  const fallbackService =
    input.fallbackService ?? createOrbitAgentArtifactPreviewService();

  return {
    createArtifactTask(request) {
      if (request.kind !== "event_recommendations") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      if (!input.recommendationTool) {
        const recommendationResult =
          createOrbitAiEventRecommendationService().recommendEvents({
            contextMessages: request.contextMessages,
            goal: query,
            locale: request.locale,
            maxRecommendations: maxRecommendationsFor(request.toolArguments),
            toolArguments: request.toolArguments,
          });

        return success(
          payloadForGoalRecommendation({
            query,
            recommendationResult,
            request,
          }),
        );
      }

      const recommendationResult = input.recommendationTool.recommend({
        query,
        toolArguments: request.toolArguments,
      });
      const toArtifactResult = (resolved: EventsRecommendationToolResult) =>
        success(
          payloadFor({
            query,
            recommendationResult: resolved,
            request,
          }),
        );

      if (isPromiseLike(recommendationResult)) {
        return recommendationResult.then(toArtifactResult);
      }

      return toArtifactResult(recommendationResult);
    },

    getArtifactTask(request) {
      return fallbackService.getArtifactTask(request);
    },
  };
}
