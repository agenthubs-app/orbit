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
  createOrbitAiRelationshipRecommendationService,
  ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD,
  type OrbitAiContactRecommendation,
  type OrbitAiContactRecommendationResult,
} from "./contact-recommendation-service";
import {
  createContactRecommendationMatcher,
  resolveContactRecommendationMethod,
  type ContactRecommendationCandidate,
  type ContactRecommendationCriteria,
  type ContactRecommendationMatcher,
  type ContactRecommendationMethod,
  type ContactRecommendationMatcherResult,
  type ContactRecommendationResult,
} from "./contact-recommendation-matching";
import type { SearchTermExtractionResult } from "./language-normalization-service";
import type { OrbitAgentArtifactTaskService } from "./service";

// 查询侧的英文检索词抽取能力（由 language-normalization-service 提供）。
// 注入它 = 启用"模型抽词 + 确定性搜索"；不注入 = 保持纯正则、同步行为。
export interface OrbitContactSearchTermExtractor {
  extractSearchTerms: (query: string) => Promise<SearchTermExtractionResult>;
}

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

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPromiseLike(
  result: ContactRecommendationMatcherResult,
): result is Promise<ContactRecommendationResult> {
  const maybePromise = result as { then?: unknown };

  return typeof maybePromise.then === "function";
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

function configurationErrorResultFor(
  requestedMethod: string,
): ContactRecommendationResult {
  return {
    candidates: [],
    criteria: emptyCriteria,
    databaseQueryExecuted: false,
    method: "invalid",
    requestedMethod,
    state: "configuration_error",
    summary: `${requestedMethod} is not a supported contact recommendation method.`,
  };
}

function shouldUseLegacyRelationshipMatcher(query: string): boolean {
  return /fintech|finance|financial|banking|payment|金融|財務|财务|銀行|银行|支付|推荐.*人脉|推薦.*人脈|应该联系的人脉|應該聯繫的人脈|recommend .*contacts|people to contact/i.test(
    query,
  );
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

// 关系搜索候选的 relationshipPath / matchReasons 直接来自 mock/live fixture：
// 里面混着三语 profileSnippet（`日本語 / 中文 / English`）、下划线原始标识
// （cross_border_ecommerce）和英文诊断串。卡片是面向用户的展示层，这里在生成
// view model 前清洗成当前语言的一段可读文本，去掉技术噪音。
const RELATIONSHIP_SEARCH_DIAGNOSTIC =
  "Live rule-based search matched stored contact, connection, topic, and evidence fields.";

function humanizeIdentifiers(text: string): string {
  return text.replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, (slug) =>
    slug.replace(/_/g, " "),
  );
}

function scriptCounts(text: string): { han: number; kana: number; latin: number } {
  return {
    han: (text.match(/\p{Script=Han}/gu) ?? []).length,
    kana: (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length,
    latin: (text.match(/[A-Za-z]/g) ?? []).length,
  };
}

// 判断一个片段是否属于当前语言：中文段以汉字为主且无日文假名；英文段以拉丁字母为主。
function segmentMatchesLocale(segment: string, locale: ArtifactLocale): boolean {
  const { han, kana, latin } = scriptCounts(segment);

  if (locale === "zh") {
    return han > 0 && kana === 0 && han >= latin;
  }

  return latin > 0 && kana === 0 && latin >= han;
}

// 把拼接好的三语/多来源上下文清洗成当前语言的一段可读文本。
function localizeRecommendationContext(
  text: string | null | undefined,
  locale: ArtifactLocale,
): string {
  const raw = readText(text);

  if (!raw) {
    return "";
  }

  const withoutDiagnostic = raw.split(RELATIONSHIP_SEARCH_DIAGNOSTIC).join(" ");
  const segments = withoutDiagnostic
    .split(/\s*\/\s*/)
    .map((segment) => humanizeIdentifiers(segment).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const localized = Array.from(
    new Set(segments.filter((segment) => segmentMatchesLocale(segment, locale))),
  );

  if (localized.length > 0) {
    return localized.join(" ");
  }

  // 没有匹配当前语言的段落时，回退到去标识化后的完整文本，避免整段丢失。
  return humanizeIdentifiers(withoutDiagnostic).replace(/\s+/g, " ").trim();
}

// 把 fixture 风格的匹配理由（含英文诊断串和 `<name> matches <topic> through <path>`
// 模板）改写成当前语言的一句可读推荐理由。
function localizeMatchReason(
  candidate: ContactRecommendationCandidate,
  locale: ArtifactLocale,
): string {
  const raw = candidate.matchReasons
    .map((reason) => readText(reason))
    .filter((reason): reason is string => Boolean(reason))
    .filter((reason) => reason !== RELATIONSHIP_SEARCH_DIAGNOSTIC)
    // 排名路径附带的检索词诊断句只服务于 trace/评估，不进入用户可读推荐理由。
    .filter((reason) => !/^matched search terms:/i.test(reason))
    .join(" ")
    .trim();
  const pattern = raw.match(/^(.+?)\s+matches\s+(.+?)\s+through\s+(.+?)\.?$/i);

  if (pattern) {
    const topic = humanizeIdentifiers(pattern[2]).trim();
    const path = humanizeIdentifiers(pattern[3]).trim();

    return localize(locale, {
      en: `Matches your goal on ${topic}, evidenced by ${path}.`,
      zh: `与你的目标在「${topic}」上契合，依据：${path}。`,
    });
  }

  const localized = localizeRecommendationContext(raw, locale);

  // 清洗结果仍不是当前语言（例如纯英文证据句在中文页面）时，退回通用理由,
  // 不把另一种语言的原始句子直接放进推荐卡片。
  if (localized && segmentMatchesLocale(localized, locale)) {
    return localized;
  }

  return localize(locale, {
    en: "Recommended from your saved relationship evidence.",
    zh: "根据你已保存的关系证据推荐。",
  });
}

// fixture 里的来源标签是英文技术串，卡片上换成可读文案，未知标签回退原值。
function localizeSourceLabel(label: string, locale: ArtifactLocale): string {
  const known: Record<string, Record<ArtifactLocale, string>> = {
    "Generated relationship graph edge": {
      en: "Relationship graph",
      zh: "关系图谱推断",
    },
  };

  return known[label]?.[locale] ?? label;
}

function candidateItemFor(
  candidate: ContactRecommendationCandidate,
  locale: ArtifactLocale,
  method: ContactRecommendationResult["method"],
) {
  return {
    actions: [
      {
        actionId: `contact:review:${candidate.contactId}`,
        label: localize(locale, {
          en: "Review contact",
          zh: "查看人脉",
        }),
        requiresConfirmation: true,
      },
    ],
    body: localizeRecommendationContext(candidate.relationshipPath, locale),
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
        label: localize(locale, { en: "Last touch", zh: "最近联系" }),
        value: localize(locale, { en: "2 weeks ago", zh: "2 周前" }),
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: localizeSourceLabel(candidate.sourceLabel, locale),
      },
      {
        label: localize(locale, { en: "Method", zh: "方法" }),
        value: method,
      },
      {
        label: localize(locale, { en: "Score", zh: "分数" }),
        value: String(candidate.matchScore),
      },
    ],
    reason: localizeMatchReason(candidate, locale),
    subtitle: candidate.role,
    title: candidate.displayName,
  };
}

function generatedViewFor(
  result: ContactRecommendationResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  const items = result.candidates.map((candidate) =>
    candidateItemFor(candidate, locale, result.method),
  );

  return {
    emptyState:
      result.state === "configuration_error"
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
            zh: `人脉推荐已生成：已从已有关系中匹配到 ${result.candidates.length} 条可复核人脉路径。`,
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

function confidenceLabelForGoalRecommendation(
  recommendation: OrbitAiContactRecommendation,
  locale: ArtifactLocale,
): string {
  if (recommendation.confidence === "high") {
    return localize(locale, {
      en: `High confidence · ${recommendation.score}`,
      zh: `高可信 · ${recommendation.score}`,
    });
  }

  return localize(locale, {
    en: `Medium confidence · ${recommendation.score}`,
    zh: `中等可信 · ${recommendation.score}`,
  });
}

function evidenceBodyForGoalRecommendation(
  recommendation: OrbitAiContactRecommendation,
  locale: ArtifactLocale,
): string {
  const snippets = recommendation.evidenceSnippets
    .slice(0, 3)
    .map((snippet) => `${snippet.sourceLabel}: ${snippet.snippet}`)
    .join(" ");

  return localize(locale, {
    en: `Evidence snippets: ${snippets}`,
    zh: `证据片段：${snippets}`,
  });
}

function generatedViewForGoalRecommendation(
  result: OrbitAiContactRecommendationResult,
  locale: ArtifactLocale,
): OrbitAgentArtifactGeneratedView {
  const items = result.recommendations.map((recommendation) => ({
    actions: [
      {
        actionId: `contact:review:${recommendation.contactId}`,
        href: recommendation.detailHref,
        label: localize(locale, {
          en: "Review contact",
          zh: "查看人脉",
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
    id: `contact-recommendation:${recommendation.contactId}`,
    metadata: [
      {
        label: localize(locale, { en: "Contact", zh: "联系人" }),
        value: recommendation.contactId,
      },
      {
        label: localize(locale, { en: "Organization", zh: "组织" }),
        value: recommendation.organization,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: recommendation.evidenceSnippets[0]?.sourceLabel ?? "Orbit",
      },
      {
        label: localize(locale, { en: "Score", zh: "匹配分" }),
        value: String(recommendation.score),
      },
      {
        label: localize(locale, { en: "Privacy", zh: "隐私范围" }),
        value: result.privacyMode,
      },
    ],
    reason: recommendation.whyThisPerson,
    subtitle: `${recommendation.role} · ${recommendation.organization}`,
    title: recommendation.displayName,
  }));

  return {
    emptyState:
      result.readiness.state === "needs_more_context"
        ? localize(locale, {
            en: "Add a clearer industry, market, investor, event, or follow-up goal before showing contact recommendations as ready.",
            zh: "请补充更明确的行业、市场、投资人、活动或跟进目标后，再展示可用人脉推荐。",
          })
        : result.readiness.state === "no_recommendation"
          ? localize(locale, {
              en: "No source-backed contact cleared the ready threshold for this goal.",
              zh: "没有有来源证据的人脉达到这次目标的可展示阈值。",
            })
          : undefined,
    sections: [
      {
        body: localize(locale, {
          en: `Ready threshold: ${ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD}. Recommendations use profile, relationship, event, conversation, and follow-up signals when available.`,
          zh: `可展示阈值：${ORBIT_AI_CONTACT_RECOMMENDATION_READY_SCORE_THRESHOLD}。推荐会尽量使用画像、关系、活动、对话和跟进信号。`,
        }),
        items,
        title: localize(locale, {
          en: "Goal-based contact recommendations",
          zh: "按目标匹配的人脉推荐",
        }),
      },
    ],
    summary: result.summary,
  };
}

function evidenceIdsForGoalRecommendation(
  result: OrbitAiContactRecommendationResult,
): readonly string[] {
  const evidenceIds = result.recommendations.flatMap(
    (recommendation) => recommendation.evidenceIds,
  );

  return evidenceIds.length > 0
    ? Array.from(new Set(evidenceIds))
    : [
        "evidence:orbit-agent:contact-recommendations:goal-service:empty",
      ];
}

function toolTraceFor(
  result: ContactRecommendationResult,
  locale: ArtifactLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: evidenceIdsFor(result),
      reason:
        result.state === "configuration_error"
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
    generationMethod: "artifact-producer-generated-view",
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
    artifactProducer: "contact_recommendation_producer",
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
    safety: {
      ...safety,
      liveDatabaseReadExecuted:
        input.matchResult.databaseQueryExecuted === true,
    },
    status: "ready",
    taskId: input.task.taskId,
  };
}

function resultForGoalRecommendation(input: {
  locale: ArtifactLocale;
  presentation: OrbitAgentArtifactPresentation;
  recommendationResult: OrbitAiContactRecommendationResult;
  task: OrbitAgentArtifactTask;
}): OrbitAgentArtifactResult {
  return {
    artifactId: input.task.artifactId,
    generatedView: generatedViewForGoalRecommendation(
      input.recommendationResult,
      input.locale,
    ),
    kind: "contact_recommendations",
    nextAction:
      input.recommendationResult.readiness.state === "ready"
        ? localize(input.locale, {
            en: "Open a contact detail page and verify the source snippets before requesting an intro, message, or follow-up.",
            zh: "请打开联系人详情页并复核来源片段，再决定是否请求介绍、发消息或跟进。",
          })
        : localize(input.locale, {
            en: "Clarify the goal before presenting recommendations as ready.",
            zh: "请先明确目标，再把推荐标记为可用。",
          }),
    presentation: input.presentation,
    provenance: {
      evidenceIds: evidenceIdsForGoalRecommendation(input.recommendationResult),
      generatedAt,
      generationMethod: "artifact-producer-generated-view",
      source: ORBIT_AGENT_CONTACT_RECOMMENDATION_ARTIFACT_SOURCE,
      sourceModules: ["orbit-ai", "contacts"],
      toolCalls: [
        {
          evidenceIds: evidenceIdsForGoalRecommendation(
            input.recommendationResult,
          ),
          reason: localize(input.locale, {
            en: "goal_relevance_v1 ranked existing contacts against profile, relationship, event, conversation, and follow-up signals; no external discovery or writes ran.",
            zh: "goal_relevance_v1 已用画像、关系、活动、对话和跟进信号对现有人脉排序；没有外部发现或写入。",
          }),
          status: "completed",
          toolCallId: "toolcall:contact-recommendations:goal-relevance-v1",
          toolName: "contacts.recommend",
        },
      ],
    },
    safety: {
      ...safety,
      liveDatabaseReadExecuted: false,
    },
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

function payloadForGoalRecommendation(input: {
  query: string;
  recommendationResult: OrbitAiContactRecommendationResult;
  request: OrbitAgentArtifactTaskRequest;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.request.locale);
  const presentation = presentationFor(locale, input.request.presentation);
  const task = taskFor({
    conversationId: input.request.conversationId,
    method: "rules_v1",
    presentation,
    query: input.query,
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

export function createOrbitAgentContactRecommendationArtifactService(input: {
  fallbackService?: OrbitAgentArtifactTaskService;
  matcher?: ContactRecommendationMatcher;
  normalizationService?: OrbitContactSearchTermExtractor;
} = {}): OrbitAgentArtifactTaskService {
  const fallbackService =
    input.fallbackService ?? createOrbitAgentArtifactPreviewService();

  return {
    createArtifactTask(request) {
      if (request.kind !== "contact_recommendations") {
        return fallbackService.createArtifactTask(request);
      }

      const query = readText(request.query);

      if (!query) {
        return fallbackService.createArtifactTask(request);
      }

      // 追问经常不带领域词（"有哪些朋友可以帮我进入呢?"）；路径选择和检索词抽取
      // 都用"最近用户轮次 + 当前 query"的组合文本，让前文目标参与判断。
      const userContextTexts = (request.contextMessages ?? [])
        .filter((message) => message.role === "user")
        .map((message) => message.content.trim())
        .filter(Boolean);

      if (userContextTexts[userContextTexts.length - 1] !== query) {
        userContextTexts.push(query);
      }

      const combinedQueryContext = userContextTexts.slice(-4).join("\n");

      const methodResolution = resolveContactRecommendationMethod();
      if (
        methodResolution.success === true &&
        methodResolution.method === "rules_v1" &&
        !input.matcher &&
        !shouldUseLegacyRelationshipMatcher(combinedQueryContext)
      ) {
        const recommendationResult =
          createOrbitAiRelationshipRecommendationService().recommendContacts({
            contextMessages: request.contextMessages,
            goal: query,
            locale: request.locale,
            privacyMode:
              request.toolArguments?.privacyMode === "limited" ||
              request.toolArguments?.privacyLimit === true
                ? "limited"
                : "full",
            toolArguments: request.toolArguments,
          });

        return {
          data: payloadForGoalRecommendation({
            query,
            recommendationResult,
            request,
          }),
          success: true,
        };
      }

      const runMatcher = (
        augmentedRequest: OrbitAgentArtifactTaskRequest,
      ): OrbitAgentArtifactResultEnvelope | Promise<OrbitAgentArtifactResultEnvelope> => {
        const matchResult =
          methodResolution.success === false
            ? configurationErrorResultFor(methodResolution.requestedMethod)
            : (input.matcher ??
                createContactRecommendationMatcher({
                  method: methodResolution.method,
                })).recommend({
                contextMessages: augmentedRequest.contextMessages,
                locale: augmentedRequest.locale,
                query,
                toolArguments: augmentedRequest.toolArguments,
              });

        if (isPromiseLike(matchResult)) {
          return matchResult.then((resolved) => ({
            data: payloadFor({ matchResult: resolved, query, request: augmentedRequest }),
            success: true as const,
          }));
        }

        return {
          data: payloadFor({ matchResult, query, request: augmentedRequest }),
          success: true as const,
        };
      };

      const normalizationService = input.normalizationService;

      // live 路径注入 normalizationService：先用模型把任意语言 query 抽成英文检索词，
      // 注入 toolArguments.searchTerms 再检索；缺 key/失败时 searchTerms=null，自动回退
      // 正则词表。未注入（默认/测试）时保持同步、纯正则。
      if (normalizationService) {
        return normalizationService.extractSearchTerms(combinedQueryContext).then((extraction) =>
          runMatcher(
            extraction.searchTerms
              ? {
                  ...request,
                  toolArguments: {
                    ...(request.toolArguments ?? {}),
                    searchTerms: extraction.searchTerms,
                  },
                }
              : request,
          ),
        );
      }

      return runMatcher(request);
    },

    getArtifactTask(request) {
      return fallbackService.getArtifactTask(request);
    },
  };
}
