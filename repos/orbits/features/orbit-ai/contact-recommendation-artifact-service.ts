import {
  type OrbitAgentArtifactGeneratedView,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactPresentation,
  type OrbitAgentArtifactProvenance,
  type OrbitAgentArtifactResult,
  type OrbitAgentArtifactResultEnvelope,
  type OrbitAgentArtifactSafety,
  type OrbitAgentArtifactSourceModule,
  type OrbitAgentArtifactTask,
  type OrbitAgentArtifactTaskRequest,
  type OrbitAgentArtifactToolCallTrace,
} from "./artifact-contract";
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
import {
  createRuleBasedContactRecommendationMatcher,
  resolveContactRecommendationMethod,
  type ContactRecommendationCandidate,
  type ContactRecommendationCriteria,
  type ContactRecommendationMatcher,
  type ContactRecommendationMethod,
  type ContactRecommendationResult,
} from "./contact-recommendation-matching";
import type { OrbitAgentArtifactTaskService } from "./service";

export const ORBIT_AGENT_CONTACT_RECOMMENDATION_ARTIFACT_SOURCE =
  "runtime:features/orbit-ai/contact-recommendation-artifact-service.ts" as const;

const generatedAt = "2026-06-30T00:00:00.000Z";
const defaultConversationId = "live-orbit-agent-conversation";

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

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
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

function artifactIdFor(): string {
  return "artifact:contact-recommendations:rules-v1";
}

function taskIdFor(): string {
  return "task:contact-recommendations:rules-v1";
}

function slugForMethod(method: ContactRecommendationResult["method"]): string {
  return method.replace(/_/g, "-");
}

const emptyCriteria: ContactRecommendationCriteria = {
  businessIntent: null,
  helpTypes: [],
  industries: [],
  relationshipPolicy: "existing_links_only",
  searchQuery: "",
  valueTypes: [],
};

function unimplementedResultFor(
  method: ContactRecommendationMethod,
): ContactRecommendationResult {
  return {
    candidates: [],
    criteria: emptyCriteria,
    method,
    state: "unimplemented",
    summary: `${method} is selected but not implemented yet.`,
  };
}

function configurationErrorResultFor(
  requestedMethod: string,
): ContactRecommendationResult {
  return {
    candidates: [],
    criteria: emptyCriteria,
    method: "invalid",
    requestedMethod,
    state: "configuration_error",
    summary: `${requestedMethod} is not a supported contact recommendation method.`,
  };
}

function evidenceIdsFor(result: ContactRecommendationResult): readonly string[] {
  const evidenceIds = result.candidates.flatMap(
    (candidate) => candidate.evidenceIds,
  );

  return evidenceIds.length > 0
    ? Array.from(new Set(evidenceIds))
    : [
        `evidence:orbit-agent:contact-recommendations:${slugForMethod(
          result.method,
        )}:empty`,
      ];
}

function presentationFor(
  locale: ArtifactLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  const defaults: OrbitAgentArtifactPresentation = {
    preferredSurface: "side_panel",
    subtitle: localize(locale, {
      en: "Matched from existing relationship evidence only",
      zh: "仅从已有真实关系证据中匹配",
    }),
    title: localize(locale, {
      en: "Recommended relationship paths",
      zh: "可复核人脉路径",
    }),
    widthHint: "half",
  };

  return {
    ...defaults,
    ...presentation,
    title: presentation?.title?.trim() || defaults.title,
  };
}

function candidateItemFor(
  candidate: ContactRecommendationCandidate,
  locale: ArtifactLocale,
) {
  return {
    actions: [
      {
        actionId: `contact:review:${candidate.contactId}`,
        label: localize(locale, {
          en: "Review relationship path",
          zh: "复核人脉路径",
        }),
        requiresConfirmation: true,
      },
    ],
    body: candidate.relationshipPath,
    confidenceLabel:
      candidate.matchScore >= 90
        ? localize(locale, { en: "High confidence", zh: "高可信" })
        : localize(locale, { en: "Evidence-backed", zh: "有证据支撑" }),
    evidenceIds: candidate.evidenceIds,
    id: `contact-recommendation:${candidate.contactId}`,
    metadata: [
      {
        label: localize(locale, { en: "Organization", zh: "组织" }),
        value: candidate.organization,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: candidate.sourceLabel,
      },
      {
        label: localize(locale, { en: "Method", zh: "方法" }),
        value: "rules_v1",
      },
      {
        label: localize(locale, { en: "Score", zh: "分数" }),
        value: String(candidate.matchScore),
      },
    ],
    reason: candidate.matchReasons.join(" "),
    subtitle: candidate.role,
    title: candidate.displayName,
  };
}

function generatedViewFor(
  result: ContactRecommendationResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  const items = result.candidates.map((candidate) =>
    candidateItemFor(candidate, locale),
  );

  return {
    emptyState:
      result.state === "unimplemented"
        ? localize(locale, {
            en: `${result.method} is selected by ORBIT_CONTACT_RECOMMENDATION_METHOD, but that contact recommendation method is not implemented yet.`,
            zh: `已通过 ORBIT_CONTACT_RECOMMENDATION_METHOD 选择 ${result.method}，但该人脉匹配方法尚未实现。`,
          })
        : result.state === "configuration_error"
          ? localize(locale, {
              en: `ORBIT_CONTACT_RECOMMENDATION_METHOD is set to ${result.requestedMethod}, which is not supported.`,
              zh: `ORBIT_CONTACT_RECOMMENDATION_METHOD 配置为 ${result.requestedMethod}，不是支持的人脉匹配方法。`,
            })
          : result.state === "empty"
        ? localize(locale, {
            en: "No existing relationship path has enough source evidence for this request.",
            zh: "当前关系库里没有足够证据的人脉路径匹配这次请求。",
          })
        : undefined,
    sections: [
      {
        body: localize(locale, {
          en: "Only people with existing relationship evidence are eligible.",
          zh: "只有已有真实关系证据的人会进入候选。",
        }),
        items,
        title: localize(locale, {
          en: "Existing relationship matches",
          zh: "已有关系匹配",
        }),
      },
    ],
    summary:
      result.state === "success"
        ? localize(locale, {
            en: `${result.candidates.length} existing relationship path matched the request.`,
            zh: `已从已有关系中匹配到 ${result.candidates.length} 条可复核人脉路径。`,
          })
        : result.state === "unimplemented"
          ? localize(locale, {
              en: `${result.method} is selected, but this method has not been implemented yet.`,
              zh: `${result.method} 已被选择，但该方法尚未实现。`,
            })
          : result.state === "configuration_error"
            ? localize(locale, {
                en: `${result.requestedMethod} is not a supported contact recommendation method.`,
                zh: `${result.requestedMethod} 不是支持的人脉匹配方法配置。`,
              })
        : localize(locale, {
            en: "No existing relationship path matched the request with enough evidence.",
            zh: "当前没有足够证据的人脉路径匹配这次请求。",
          }),
  };
}

function toolTraceFor(
  result: ContactRecommendationResult,
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: evidenceIdsFor(result),
      reason:
        result.state === "unimplemented"
          ? localize(locale, {
              en: `${result.method} was selected by ORBIT_CONTACT_RECOMMENDATION_METHOD, but no matcher is registered for it yet.`,
              zh: `${result.method} 已通过 ORBIT_CONTACT_RECOMMENDATION_METHOD 选择，但还没有注册对应 matcher。`,
            })
          : result.state === "configuration_error"
            ? localize(locale, {
                en: `${result.requestedMethod} is not a supported ORBIT_CONTACT_RECOMMENDATION_METHOD value.`,
                zh: `${result.requestedMethod} 不是支持的 ORBIT_CONTACT_RECOMMENDATION_METHOD 值。`,
              })
            : localize(locale, {
                en: `${result.method} matched the request against existing relationship evidence only; no unknown lead discovery or external side effect ran.`,
                zh: `${result.method} 仅在已有关系证据中匹配这次请求；没有发现陌生线索，也没有执行外部副作用。`,
              }),
      status:
        result.state === "configuration_error"
          ? "failed"
          : result.state === "unimplemented"
            ? "skipped"
            : "completed",
      toolCallId: `toolcall:contact-recommendations:${slugForMethod(result.method)}`,
      toolName: "contacts.recommend",
    },
  ];
}

function provenanceFor(
  result: ContactRecommendationResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactProvenance {
  const sourceModules: readonly OrbitAgentArtifactSourceModule[] = [
    "orbit-ai",
    "contacts",
  ];

  return {
    evidenceIds: evidenceIdsFor(result),
    generatedAt,
    generationMethod: "sub-agent-generated-view",
    source: ORBIT_AGENT_CONTACT_RECOMMENDATION_ARTIFACT_SOURCE,
    sourceModules,
    toolCalls: toolTraceFor(result, locale),
  };
}

function taskFor(input: {
  conversationId?: string | null;
  method: ContactRecommendationResult["method"];
  presentation: OrbitAgentArtifactPresentation;
  query: string;
}): OrbitAgentArtifactTask {
  return {
    artifactId:
      input.method === "rules_v1"
        ? artifactIdFor()
        : `artifact:contact-recommendations:${slugForMethod(input.method)}`,
    conversationId: readText(input.conversationId) ?? defaultConversationId,
    createdAt: generatedAt,
    kind: "contact_recommendations",
    presentation: input.presentation,
    query: input.query,
    status: "ready",
    subAgent: "contact_recommendation_agent",
    taskId:
      input.method === "rules_v1"
        ? taskIdFor()
        : `task:contact-recommendations:${slugForMethod(input.method)}`,
    updatedAt: generatedAt,
  };
}

function resultFor(input: {
  locale: ArtifactLocale;
  matchResult: ContactRecommendationResult;
  presentation: OrbitAgentArtifactPresentation;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewFor(input.matchResult, input.locale),
    kind: "contact_recommendations",
    nextAction:
      input.matchResult.state === "success"
        ? localize(input.locale, {
            en: "Review the relationship path and source evidence before asking for an intro, message, or follow-up.",
            zh: "请先复核人脉路径和来源证据，再决定是否请求介绍、发消息或跟进。",
          })
        : localize(input.locale, {
            en: "Ask for a narrower goal or add relationship evidence before showing contact recommendations.",
            zh: "请缩小目标或补充关系证据后，再展示人脉推荐。",
          }),
    presentation: input.presentation,
    provenance: provenanceFor(input.matchResult, input.locale),
    safety,
    status: "ready",
    taskId: input.task.taskId,
  };
}

function payloadFor(input: {
  matchResult: ContactRecommendationResult;
  request: OrbitAgentArtifactTaskRequest;
  query: string;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const task = taskFor({
    conversationId: input.request.conversationId,
    method: input.matchResult.method,
    presentation,
    query: input.query,
  });

  return {
    result: resultFor({
      locale,
      matchResult: input.matchResult,
      presentation,
      task,
    }),
    task,
  };
}

export function createOrbitAgentContactRecommendationArtifactService(input: {
  fallbackService?: OrbitAgentArtifactTaskService;
  matcher?: ContactRecommendationMatcher;
} = {}): OrbitAgentArtifactTaskService {
  const fallbackService =
    input.fallbackService ?? createOrbitAgentArtifactPreviewService();
  const matcher =
    input.matcher ?? createRuleBasedContactRecommendationMatcher();

  return {
    createArtifactTask(request): OrbitAgentArtifactResultEnvelope {
      if (request.kind !== "contact_recommendations") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      const methodResolution = resolveContactRecommendationMethod();
      const matchResult =
        methodResolution.success === false
          ? configurationErrorResultFor(methodResolution.requestedMethod)
          : methodResolution.method === "rules_v1"
            ? matcher.recommend({
                contextMessages: request.contextMessages,
                locale: request.locale,
                query,
                toolArguments: request.toolArguments,
              })
            : unimplementedResultFor(methodResolution.method);

      return {
        data: clonePayload(payloadFor({ matchResult, query, request })),
        success: true,
      };
    },

    getArtifactTask(request) {
      return fallbackService.getArtifactTask(request);
    },
  };
}
