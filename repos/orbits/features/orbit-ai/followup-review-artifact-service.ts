import type {
  FollowupTask,
  FollowupTaskGenerationFailure,
  FollowupTaskGenerationPayload,
  FollowupTaskGenerationResult,
} from "../followups/contract";
import type {
  FollowupTaskGenerationService,
  FollowupTaskGenerationServiceResult,
} from "../followups/service";
import { createFollowupTaskGenerationService } from "../followups/service-factory";
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

export const ORBIT_AGENT_FOLLOWUP_REVIEW_ARTIFACT_SOURCE =
  "runtime:features/orbit-ai/followup-review-artifact-service.ts" as const;

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

interface FollowupArtifactData {
  evidenceIds: readonly string[];
  generatedAt: string;
  liveDatabaseReadExecuted: boolean;
  sourceLabel: string;
  state: FollowupTaskGenerationPayload["state"] | "failure";
  summary: string;
  tasks: readonly FollowupTask[];
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

function normalizedLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function isPromiseLike<TResult>(
  result: FollowupTaskGenerationServiceResult<TResult>,
): result is Promise<TResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
}

function evidenceIdsFor(tasks: readonly FollowupTask[], fallback: readonly string[]) {
  const evidenceIds = tasks.flatMap((task) => task.evidenceIds);

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : fallback.length > 0
      ? fallback
      : ["evidence:orbit-agent:followup-queue:empty"];
}

function dataForSuccess(payload: FollowupTaskGenerationPayload): FollowupArtifactData {
  return {
    evidenceIds: evidenceIdsFor(payload.tasks, payload.provenance.evidenceIds),
    generatedAt: payload.provenance.collectedAt,
    liveDatabaseReadExecuted:
      payload.provenance.liveDatabaseReadExecuted === true,
    sourceLabel: payload.provenance.sourceLabel,
    state: payload.state,
    summary: payload.summary,
    tasks: payload.tasks,
    toolStatus:
      payload.state === "success"
        ? "completed"
        : payload.state === "pending"
          ? "planned"
          : "skipped",
  };
}

function dataForFailure(failure: FollowupTaskGenerationFailure): FollowupArtifactData {
  return {
    evidenceIds: evidenceIdsFor([], failure.error.evidenceIds),
    generatedAt: failure.error.provenance.collectedAt,
    liveDatabaseReadExecuted:
      failure.error.provenance.liveDatabaseReadExecuted === true,
    sourceLabel: failure.error.provenance.sourceLabel,
    state: "failure",
    summary: failure.error.message,
    tasks: [],
    toolStatus: "failed",
  };
}

function dataForResult(result: FollowupTaskGenerationResult): FollowupArtifactData {
  return result.success === true ? dataForSuccess(result.data) : dataForFailure(result);
}

function dueLabelFor(days: number, locale: ArtifactLocale): string {
  if (days <= 0) {
    return localize(locale, { en: "Today", zh: "今天" });
  }

  if (days === 1) {
    return localize(locale, { en: "Tomorrow", zh: "明天" });
  }

  return localize(locale, {
    en: `${days} days`,
    zh: `${days} 天后`,
  });
}

function priorityLabelFor(priority: FollowupTask["priority"], locale: ArtifactLocale): string {
  const labels: Record<FollowupTask["priority"], Record<ArtifactLocale, string>> = {
    nurture: { en: "Nurture", zh: "长期维护" },
    this_week: { en: "This week", zh: "本周" },
    today: { en: "Today", zh: "今天" },
  };

  return localize(locale, labels[priority]);
}

function presentationFor(
  locale: ArtifactLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  const defaults: OrbitAgentArtifactPresentation = {
    preferredSurface: "side_panel",
    subtitle: localize(locale, {
      en: "Loaded from the Followups task service",
      zh: "来自 Followups 任务服务",
    }),
    title: localize(locale, {
      en: "Follow-up review queue",
      zh: "跟进复核队列",
    }),
    widthHint: "half",
  };

  return {
    ...defaults,
    ...presentation,
    title: presentation?.title?.trim() || defaults.title,
  };
}

function itemFor(task: FollowupTask, locale: ArtifactLocale) {
  return {
    actions: [
      {
        actionId: `followup:review:${task.taskId}`,
        label: localize(locale, {
          en: "Review follow-up",
          zh: "复核跟进",
        }),
        requiresConfirmation: true,
      },
    ],
    body: task.recommendedAction,
    confidenceLabel: priorityLabelFor(task.priority, locale),
    evidenceIds: task.evidenceIds,
    id: `followup:${task.taskId}`,
    metadata: [
      {
        label: localize(locale, { en: "Organization", zh: "组织" }),
        value: task.organization || localize(locale, { en: "Unknown", zh: "未知" }),
      },
      {
        label: localize(locale, { en: "Due", zh: "到期" }),
        value: dueLabelFor(task.dueInDays, locale),
      },
      {
        label: localize(locale, { en: "Priority", zh: "优先级" }),
        value: priorityLabelFor(task.priority, locale),
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: task.source.label || task.audit.sourceLabel,
      },
    ],
    reason: task.rationale,
    subtitle: task.contactName,
    title: task.title,
  };
}

function emptyStateFor(data: FollowupArtifactData, locale: ArtifactLocale): string | undefined {
  if (data.tasks.length > 0) {
    return undefined;
  }

  if (data.state === "pending") {
    return localize(locale, {
      en: "The follow-up queue is waiting for source data review.",
      zh: "跟进队列正在等待来源数据复核。",
    });
  }

  if (data.state === "failure") {
    return localize(locale, {
      en: "The follow-up queue could not be loaded from the Followups service.",
      zh: "无法从 Followups 服务加载跟进队列。",
    });
  }

  return localize(locale, {
    en: "No follow-up tasks matched this request.",
    zh: "没有匹配这次请求的跟进任务。",
  });
}

function generatedViewFor(
  data: FollowupArtifactData,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  return {
    emptyState: emptyStateFor(data, locale),
    sections: [
      {
        body: localize(locale, {
          en: `Source: ${data.sourceLabel}`,
          zh: `来源：${data.sourceLabel}`,
        }),
        items: data.tasks.map((task) => itemFor(task, locale)),
        title: localize(locale, {
          en: "Suggested follow-ups",
          zh: "建议跟进",
        }),
      },
    ],
    summary:
      data.tasks.length > 0
        ? localize(locale, {
            en: `${data.tasks.length} follow-up task(s) are ready for review.`,
            zh: `已有 ${data.tasks.length} 个跟进任务可复核。`,
          })
        : data.summary,
  };
}

function toolTraceFor(
  data: FollowupArtifactData,
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: data.evidenceIds,
      reason:
        data.toolStatus === "failed"
          ? localize(locale, {
              en: "The Followups service returned a controlled failure while loading the review queue.",
              zh: "Followups 服务在加载复核队列时返回了受控失败。",
            })
          : localize(locale, {
              en: "Orbit AI loaded reviewable follow-up tasks from the Followups service without executing reminders, messages, or external actions.",
              zh: "Orbit AI 从 Followups 服务加载可复核跟进任务，未创建提醒、未发消息、未执行外部动作。",
            }),
      status: data.toolStatus,
      toolCallId: "toolcall:followup-queue:live-store",
      toolName: "followups.reviewQueue",
    },
  ];
}

function provenanceFor(
  data: FollowupArtifactData,
  locale: ArtifactLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: data.evidenceIds,
    generatedAt: data.generatedAt || fallbackGeneratedAt,
    generationMethod: "artifact-producer-generated-view",
    source: ORBIT_AGENT_FOLLOWUP_REVIEW_ARTIFACT_SOURCE,
    sourceModules: ["orbit-ai", "followups"],
    toolCalls: toolTraceFor(data, locale),
  };
}

function statusFor(data: FollowupArtifactData): OrbitAgentArtifactStatus {
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
    artifactId: "artifact:followup-queue:live-store",
    artifactProducer: "followup_review_producer",
    conversationId: readText(input.conversationId) ?? defaultConversationId,
    createdAt: input.generatedAt,
    kind: "followup_queue",
    presentation: input.presentation,
    query: input.query,
    status: input.status,
    taskId: "task:followup-queue:live-store",
    updatedAt: input.generatedAt,
  };
}

function resultFor(input: {
  data: FollowupArtifactData;
  locale: ArtifactLocale;
  presentation: OrbitAgentArtifactPresentation;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewFor(input.data, input.locale),
    kind: "followup_queue",
    nextAction:
      input.data.tasks.length > 0
        ? localize(input.locale, {
            en: "Review evidence before scheduling a reminder, drafting a message, or taking any external action.",
            zh: "请先复核证据，再决定是否创建提醒、起草消息或执行外部动作。",
          })
        : localize(input.locale, {
            en: "Adjust the request or add source-backed follow-up tasks.",
            zh: "请调整请求，或补充有来源证据的跟进任务。",
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
  data: FollowupArtifactData;
  query: string;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const status = statusFor(input.data);
  const generatedAt = input.data.generatedAt || fallbackGeneratedAt;
  const task = taskFor({
    conversationId: input.request.conversationId,
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

export function createOrbitAgentFollowupReviewArtifactService(input: {
  fallbackService?: OrbitAgentArtifactTaskService;
  followupService?: FollowupTaskGenerationService;
} = {}): OrbitAgentArtifactTaskService {
  const fallbackService =
    input.fallbackService ?? createOrbitAgentArtifactPreviewService();
  const followupService =
    input.followupService ?? createFollowupTaskGenerationService();

  return {
    createArtifactTask(request) {
      if (request.kind !== "followup_queue") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      const followupResult = followupService.listTasks({
        limit: normalizedLimit(request.toolArguments?.limit) ?? 5,
      });

      const toArtifactResult = (resolved: FollowupTaskGenerationResult) =>
        success(
          payloadFor({
            data: dataForResult(resolved),
            query,
            request,
          }),
        );

      if (isPromiseLike(followupResult)) {
        return followupResult.then(toArtifactResult);
      }

      return toArtifactResult(followupResult);
    },

    getArtifactTask(request) {
      return fallbackService.getArtifactTask(request);
    },
  };
}
