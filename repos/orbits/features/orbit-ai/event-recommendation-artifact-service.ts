import {
  createEventsRecommendationTool,
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
      zh: "来自 Events 服务",
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

function itemFor(candidate: EventsRecommendationCandidate, locale: ArtifactLocale) {
  return {
    actions: [
      {
        actionId: `event:review:${candidate.eventId}`,
        label: localize(locale, {
          en: "Review event",
          zh: "复核活动",
        }),
        requiresConfirmation: true,
      },
    ],
    body: candidate.description || candidate.relationshipContext,
    confidenceLabel: confidenceLabelFor(candidate, locale),
    evidenceIds: candidate.evidenceIds,
    id: `event-recommendation:${candidate.eventId}`,
    metadata: [
      {
        label: localize(locale, { en: "When", zh: "时间" }),
        value: dateLabel(candidate.startsAt),
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
    reason: candidate.matchReasons.join(" "),
    subtitle: candidate.venue,
    title: candidate.title,
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
        : result.summary,
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
  const recommendationTool =
    input.recommendationTool ?? createEventsRecommendationTool();

  return {
    createArtifactTask(request) {
      if (request.kind !== "event_recommendations") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      const recommendationResult = recommendationTool.recommend({
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
