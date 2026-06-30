import {
  ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS,
  ORBIT_AGENT_ARTIFACT_KINDS,
  type OrbitAgentArtifactFailure,
  type OrbitAgentArtifactGeneratedView,
  type OrbitAgentArtifactKind,
  type OrbitAgentArtifactLookupInput,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactPresentation,
  type OrbitAgentArtifactProvenance,
  type OrbitAgentArtifactResult,
  type OrbitAgentArtifactResultEnvelope,
  type OrbitAgentArtifactSourceModule,
  type OrbitAgentArtifactSubAgent,
  type OrbitAgentArtifactSuccess,
  type OrbitAgentArtifactTask,
  type OrbitAgentArtifactTaskRequest,
  type OrbitAgentArtifactToolCallTrace,
} from "./artifact-contract";
import type { OrbitAgentArtifactTaskService } from "./service";

export const ORBIT_AGENT_ARTIFACT_PREVIEW_SOURCE =
  "runtime:features/orbit-ai/artifact-task-preview-service.ts" as const;

const previewNow = "2026-06-27T00:02:00.000Z";
const defaultConversationId = "live-orbit-agent-conversation";
const supportedKinds = new Set<string>(ORBIT_AGENT_ARTIFACT_KINDS);
type PreviewLocale = "en" | "zh";

const safety = {
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
} as const;

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLocale(locale: unknown): PreviewLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(locale: PreviewLocale, copy: Record<PreviewLocale, string>) {
  return copy[locale];
}

function normalizeKind(kind: unknown): OrbitAgentArtifactKind | null {
  if (typeof kind === "string" && supportedKinds.has(kind)) {
    return kind as OrbitAgentArtifactKind;
  }

  return null;
}

function slugFor(kind: OrbitAgentArtifactKind): string {
  return kind.replace(/_/g, "-");
}

function artifactIdFor(kind: OrbitAgentArtifactKind): string {
  return `artifact:${slugFor(kind)}:preview`;
}

function taskIdFor(kind: OrbitAgentArtifactKind): string {
  return `task:${slugFor(kind)}:preview`;
}

function defaultSubAgentFor(
  kind: OrbitAgentArtifactKind,
): OrbitAgentArtifactSubAgent {
  switch (kind) {
    case "event_recommendations":
      return "event_recommendation_agent";
    case "contact_recommendations":
      return "contact_recommendation_agent";
    case "followup_queue":
      return "followup_review_agent";
    case "email_context":
    case "generic":
    case "relationship_chat_context":
    default:
      return "relationship_chat_review_agent";
  }
}

function sourceModulesFor(
  kind: OrbitAgentArtifactKind,
): readonly OrbitAgentArtifactSourceModule[] {
  switch (kind) {
    case "event_recommendations":
      return ["orbit-ai", "events"];
    case "contact_recommendations":
      return ["orbit-ai", "contacts"];
    case "followup_queue":
      return ["orbit-ai", "followups"];
    case "email_context":
      return ["orbit-ai", "chat", "contacts"];
    case "relationship_chat_context":
      return ["orbit-ai", "chat"];
    case "generic":
    default:
      return ["orbit-ai"];
  }
}

function labelFor(kind: OrbitAgentArtifactKind, locale: PreviewLocale): string {
  const labels: Record<
    OrbitAgentArtifactKind,
    Record<PreviewLocale, string>
  > = {
    contact_recommendations: {
      en: "Contact recommendations",
      zh: "推荐人脉",
    },
    email_context: {
      en: "Email context",
      zh: "邮件上下文",
    },
    event_recommendations: {
      en: "Event recommendations",
      zh: "推荐活动",
    },
    followup_queue: {
      en: "Follow-up queue",
      zh: "跟进队列",
    },
    generic: {
      en: "Agent artifact",
      zh: "Agent 结果",
    },
    relationship_chat_context: {
      en: "Relationship chat context",
      zh: "关系上下文",
    },
  };

  return localize(locale, labels[kind]);
}

function presentationFor(
  kind: OrbitAgentArtifactKind,
  locale: PreviewLocale,
  presentation?: Partial<OrbitAgentArtifactPresentation>,
): OrbitAgentArtifactPresentation {
  const defaults: Record<OrbitAgentArtifactKind, OrbitAgentArtifactPresentation> = {
    contact_recommendations: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Prepared by the contact recommendation preview boundary",
        zh: "由人脉推荐预览边界生成",
      }),
      title: labelFor("contact_recommendations", locale),
      widthHint: "half",
    },
    email_context: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Prepared by the relationship context preview boundary",
        zh: "由关系上下文预览边界生成",
      }),
      title: labelFor("email_context", locale),
      widthHint: "half",
    },
    event_recommendations: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Prepared by the event recommendation preview boundary",
        zh: "由活动推荐预览边界生成",
      }),
      title: labelFor("event_recommendations", locale),
      widthHint: "half",
    },
    followup_queue: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Prepared by the follow-up preview boundary",
        zh: "由跟进预览边界生成",
      }),
      title: labelFor("followup_queue", locale),
      widthHint: "half",
    },
    generic: {
      preferredSurface: "inline_card",
      subtitle: localize(locale, {
        en: "Prepared by the artifact preview boundary",
        zh: "由结果预览边界生成",
      }),
      title: labelFor("generic", locale),
    },
    relationship_chat_context: {
      preferredSurface: "side_panel",
      subtitle: localize(locale, {
        en: "Prepared by the relationship context preview boundary",
        zh: "由关系上下文预览边界生成",
      }),
      title: labelFor("relationship_chat_context", locale),
      widthHint: "half",
    },
  };

  return {
    ...defaults[kind],
    ...presentation,
    title: presentation?.title?.trim() || defaults[kind].title,
  };
}

function toolNameFor(kind: OrbitAgentArtifactKind): string {
  switch (kind) {
    case "event_recommendations":
      return "events.recommend";
    case "contact_recommendations":
      return "contacts.recommend";
    case "followup_queue":
      return "followups.reviewQueue";
    case "email_context":
      return "chat.reviewEmailContext";
    case "relationship_chat_context":
      return "chat.context";
    case "generic":
    default:
      return "orbitAi.renderGenericArtifact";
  }
}

function evidenceIdsFor(kind: OrbitAgentArtifactKind): readonly string[] {
  return [`evidence:orbit-agent:${slugFor(kind)}:preview`];
}

function toolTraceFor(
  kind: OrbitAgentArtifactKind,
  locale: PreviewLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: evidenceIdsFor(kind),
      reason: localize(locale, {
        en: "The live agent planned this Orbit handoff; the preview boundary produced a reviewable artifact without reading mock fixture data.",
        zh: "Live Agent 计划了这次 Orbit 交接；预览边界生成可复核结果，未读取 mock fixture 数据。",
      }),
      status: "completed",
      toolCallId: `toolcall:${slugFor(kind)}:preview`,
      toolName: toolNameFor(kind),
    },
  ];
}

function generatedViewFor(
  kind: OrbitAgentArtifactKind,
  query: string,
  locale: PreviewLocale,
): OrbitAgentArtifactGeneratedView {
  const label = labelFor(kind, locale);

  return {
    sections: [
      {
        items: [
          {
            actions: [
              {
                actionId: `preview:${slugFor(kind)}:review`,
                label: localize(locale, {
                  en: "Review plan",
                  zh: "复核计划",
                }),
                requiresConfirmation: true,
              },
            ],
            body: localize(locale, {
              en: "This preview records the planned Orbit handoff. Connect a real domain service before showing relationship-specific results.",
              zh: "此预览记录了 Orbit 计划交接。连接真实领域服务后，再展示关系相关的具体结果。",
            }),
            confidenceLabel: localize(locale, {
              en: "Preview",
              zh: "预览",
            }),
            evidenceIds: evidenceIdsFor(kind),
            id: `preview-${slugFor(kind)}`,
            metadata: [
              {
                label: localize(locale, {
                  en: "Artifact kind",
                  zh: "结果类型",
                }),
                value: kind,
              },
              {
                label: localize(locale, {
                  en: "Source",
                  zh: "来源",
                }),
                value: localize(locale, {
                  en: "Live agent preview boundary",
                  zh: "实时 Agent 预览边界",
                }),
              },
            ],
            reason: localize(locale, {
              en: `Generated for request: ${query}`,
              zh: `为这条请求生成：${query}`,
            }),
            title: label,
          },
        ],
        title: label,
      },
    ],
    summary: localize(locale, {
      en: "Orbit prepared a review-only artifact from the planned tool handoff without using mock relationship data.",
      zh: "Orbit 已基于计划工具交接生成可复核结果，未使用 mock 关系数据。",
    }),
  };
}

function provenanceFor(
  kind: OrbitAgentArtifactKind,
  locale: PreviewLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: evidenceIdsFor(kind),
    generatedAt: previewNow,
    generationMethod: "rule-based-artifact-task",
    source: ORBIT_AGENT_ARTIFACT_PREVIEW_SOURCE,
    sourceModules: sourceModulesFor(kind),
    toolCalls: toolTraceFor(kind, locale),
  };
}

function taskFor(input: {
  conversationId?: string | null;
  kind: OrbitAgentArtifactKind;
  presentation: OrbitAgentArtifactPresentation;
  query: string;
  subAgent?: OrbitAgentArtifactSubAgent;
}): OrbitAgentArtifactTask {
  return {
    artifactId: artifactIdFor(input.kind),
    conversationId: readText(input.conversationId) ?? defaultConversationId,
    createdAt: previewNow,
    kind: input.kind,
    presentation: input.presentation,
    query: input.query,
    status: "ready",
    subAgent: input.subAgent ?? defaultSubAgentFor(input.kind),
    taskId: taskIdFor(input.kind),
    updatedAt: previewNow,
  };
}

function resultFor(
  task: OrbitAgentArtifactTask,
  locale: PreviewLocale,
): OrbitAgentArtifactResult {
  return {
    artifactId: task.artifactId,
    generatedView: generatedViewFor(task.kind, task.query, locale),
    kind: task.kind,
    nextAction: localize(locale, {
      en: "Review the planned artifact boundary; connect a real domain tool before executing or displaying relationship-specific results.",
      zh: "请先复核计划结果；连接真实领域工具后再执行或展示关系相关结果。",
    }),
    presentation: task.presentation,
    provenance: provenanceFor(task.kind, locale),
    safety,
    status: "ready",
    taskId: task.taskId,
  };
}

function success(payload: OrbitAgentArtifactPayload): OrbitAgentArtifactSuccess {
  return {
    data: clonePayload(payload),
    success: true,
  };
}

function failure(
  code: "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED" | "ORBIT_AGENT_ARTIFACT_NOT_FOUND" | "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
  input?: { artifactId?: string },
): OrbitAgentArtifactFailure {
  const definition = ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS[code];

  return {
    error: {
      ...definition,
      artifactId: input?.artifactId,
      evidenceIds: ["evidence:orbit-agent:artifact-preview-boundary"],
      state: "failure",
    },
    success: false,
  };
}

function payloadFor(input: {
  conversationId?: string | null;
  kind: OrbitAgentArtifactKind;
  locale?: string | null;
  presentation?: Partial<OrbitAgentArtifactPresentation>;
  query: string;
  subAgent?: OrbitAgentArtifactSubAgent;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.locale);
  const presentation = presentationFor(input.kind, locale, input.presentation);
  const task = taskFor({
    conversationId: input.conversationId,
    kind: input.kind,
    presentation,
    query: input.query,
    subAgent: input.subAgent,
  });

  return {
    result: resultFor(task, locale),
    task,
  };
}

export function createOrbitAgentArtifactPreviewService(): OrbitAgentArtifactTaskService {
  return {
    createArtifactTask(input): OrbitAgentArtifactResultEnvelope {
      const query = readText(input.query);

      if (!query) {
        return failure("ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED");
      }

      const kind = normalizeKind(input.kind);

      if (!kind) {
        return failure("ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND");
      }

      return success(
        payloadFor({
          conversationId: input.conversationId,
          kind,
          locale: input.locale,
          presentation: input.presentation,
          query,
          subAgent: input.subAgent,
        }),
      );
    },

    getArtifactTask(input: OrbitAgentArtifactLookupInput) {
      const artifactId = readText(input.artifactId);

      if (!artifactId) {
        return failure("ORBIT_AGENT_ARTIFACT_NOT_FOUND");
      }

      const kind = ORBIT_AGENT_ARTIFACT_KINDS.find(
        (candidate) => artifactId === artifactIdFor(candidate),
      );

      if (!kind) {
        return failure("ORBIT_AGENT_ARTIFACT_NOT_FOUND", { artifactId });
      }

      return success(
        payloadFor({
          kind,
          query: `Lookup generated artifact ${artifactId}`,
        }),
      );
    },
  };
}
