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

// 「3 天后」既不能对日历也不能判断是否已过期，跟进队列是时间敏感的决策面，
// 相对时间后面要跟一个绝对日期。但只在 task.dueAt 这个**真实截止时间**存在时才给：
// relationshipSuggestions 派生出来的任务没有 dueAt，它的 dueInDays 是按关系阶段
// 查表得到的固定桶（1/3/7/14/30），拿它反推出一个精确到「几月几日周几」的日期
// 等于凭空造精度。没有就只显示相对时间，不编。
function absoluteDueLabel(dueAt: string, locale: ArtifactLocale): string {
  const due = new Date(dueAt);

  if (!Number.isFinite(due.getTime())) {
    return "";
  }

  const day = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    day: "numeric",
    month: locale === "zh" ? "long" : "short",
    timeZone: "Asia/Tokyo",
  }).format(due);
  const weekday = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(due);

  return locale === "zh" ? `${day}（${weekday}）` : `${day} (${weekday})`;
}

// dueInDays 在 live-service 的 daysUntil 里被 Math.max(0, …) 夹住，所以一条早已过期
// 的任务会以 0 天传进来，显示成「今天」——而它自己的 dueAt 明明写着上个月。这里不
// 改动领域层的 dueInDays（它还驱动 priority 排序），只在展示层用 dueAt 和同一个参照
// 时间比一次：确实已经过去的，就说逾期，不说今天。
function overdueDaysFor(dueAt: string, reference: string): number {
  const due = new Date(dueAt).getTime();
  const base = new Date(reference).getTime();

  if (!Number.isFinite(due) || !Number.isFinite(base)) {
    return 0;
  }

  return Math.max(0, Math.floor((base - due) / 86_400_000));
}

function dueLabelFor(
  days: number,
  dueAt: string | undefined,
  overdue: number,
  locale: ArtifactLocale,
): string {
  const relative =
    overdue > 0
      ? localize(locale, {
          en: `Overdue by ${overdue} day(s)`,
          zh: `已逾期 ${overdue} 天`,
        })
      : days <= 0
        ? localize(locale, { en: "Today", zh: "今天" })
        : days === 1
          ? localize(locale, { en: "Tomorrow", zh: "明天" })
          : localize(locale, { en: `${days} days`, zh: `${days} 天后` });
  const absolute = dueAt ? absoluteDueLabel(dueAt, locale) : "";

  return absolute ? `${relative} · ${absolute}` : relative;
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

// live 种子任务的 title/rationale 是英文模板串（"Review follow-up for contact_021"）。
// 卡片文案在这里确定性重组：模板标题换成"跟进 <姓名>"，来源方式翻成当前语言。
const templateTaskTitle = /^Review follow-up for contact_/i;

// connection.summary / suggestedActions 是各写入方（onsite-operations-repository 等）
// 持久化的英文自由文本。此前 displayXxxFor 只在命中 templateTaskTitle 这一个正则时
// 才本地化，其余一律 `return 原文`——中文界面因此漏出整句英文，还把
// `event_signup_01`、`event:e2e:orbit-connection-night` 这类内部 ID 原样摆给用户。
// 白名单式本地化每新增一个文案源就漏一句，所以这里改成「已知短语翻译 + 兜底清洗」：
// 认识的整句换成当前语言，不认识的至少把裸 ID humanize 掉，绝不再穿透原始标识符。
// （contact-recommendation-artifact-service.ts 里有一份同类的 humanizeIdentifiers，
// 那条链路已单独验证过，这里不动它，先在跟进链路把口子堵上。）
const RELATIONSHIP_ID_TOKEN = /\b[A-Za-z0-9]+(?:[:_][A-Za-z0-9-]+)+\b/g;

function humanizeRelationshipId(value: string): string {
  return value
    .replace(/^event[:_]/i, "")
    .replace(/\be2e\b[:_-]?/gi, "")
    .replace(/[:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeRelationshipIds(value: string): string {
  return value.replace(RELATIONSHIP_ID_TOKEN, (token) =>
    humanizeRelationshipId(token),
  );
}

const relationshipPhrases: readonly {
  copy: (subject: string) => Record<ArtifactLocale, string>;
  pattern: RegExp;
}[] = [
  {
    copy: () => ({
      en: "Follow up on the connection you both accepted at the event.",
      zh: "跟进这次双方都已确认的活动连接。",
    }),
    pattern: /^Follow up on the mutually accepted event connection\.?$/i,
  },
  {
    copy: (subject) => ({
      en: `Both sides accepted a business-card exchange at ${subject}.`,
      zh: `在「${subject}」双方确认交换名片。`,
    }),
    pattern: /^Mutual business-card consent at event (.+?)\.?$/i,
  },
  {
    // 旧数据里可能还留着这句"有证据可供复核"的英文兜底。它什么都没说明，
    // 与其翻译成一句同样没内容的中文，不如直接判空，让调用方不渲染这一行。
    copy: () => ({ en: "", zh: "" }),
    pattern: /^Live task evidence is available for review\.?$/i,
  },
];

function localizeRelationshipText(value: string, locale: ArtifactLocale): string {
  const text = value.trim();

  if (!text) {
    return "";
  }

  for (const phrase of relationshipPhrases) {
    const match = text.match(phrase.pattern);

    if (match) {
      return localize(
        locale,
        phrase.copy(humanizeRelationshipId(match[1] ?? "")),
      );
    }
  }

  return humanizeRelationshipIds(text);
}

const captureMethodLabels: Record<string, Record<ArtifactLocale, string>> = {
  "Business card exchange": { en: "business card exchange", zh: "名片交换" },
  "Confirmed offline meeting note": {
    en: "a confirmed offline meeting note",
    zh: "已确认的线下会面记录",
  },
  "Direct QR scan": { en: "a direct QR scan", zh: "现场扫码交换" },
  "Warm referral": { en: "a warm referral", zh: "熟人引荐" },
};

function displayTitleFor(task: FollowupTask, locale: ArtifactLocale): string {
  if (!templateTaskTitle.test(task.title)) {
    return localizeRelationshipText(task.title, locale);
  }

  return localize(locale, {
    en: `Follow up with ${task.contactName}`,
    zh: `跟进 ${task.contactName}`,
  });
}

function displayReasonFor(task: FollowupTask, locale: ArtifactLocale): string {
  const pattern = task.rationale.match(
    /^(.+?) has a concrete current-user relationship record from (.+?) for .+\.$/i,
  );

  if (!pattern) {
    return localizeRelationshipText(task.rationale, locale);
  }

  const method =
    captureMethodLabels[pattern[2].trim()]?.[locale] ?? pattern[2].trim();

  return localize(locale, {
    en: `You have a confirmed relationship record with ${pattern[1]} via ${method}.`,
    zh: `与 ${pattern[1]} 有确认的关系记录（${method}）。`,
  });
}

const sourceLabels: Record<string, Record<ArtifactLocale, string>> = {
  "Followup Postgres live storage": {
    en: "Follow-up live store",
    zh: "跟进任务库",
  },
  "Derived from saved relationship evidence": {
    en: "Derived from saved relationship evidence",
    zh: "根据已保存的关系证据推导",
  },
  "Generated recommendation": { en: "Generated recommendation", zh: "关系记录建议" },
};

function sourceLabelFor(label: string, locale: ArtifactLocale): string {
  return sourceLabels[label]?.[locale] ?? label;
}

function displayActionFor(task: FollowupTask, locale: ArtifactLocale): string {
  if (!templateTaskTitle.test(task.recommendedAction)) {
    return localizeRelationshipText(task.recommendedAction, locale);
  }

  return localize(locale, {
    en: `Review the evidence, then decide the next touchpoint with ${task.contactName} before it is due.`,
    zh: `复核证据后，在到期前决定与 ${task.contactName} 的下一次联系方式。`,
  });
}

function itemFor(task: FollowupTask, locale: ArtifactLocale, reference: string) {
  const title = displayTitleFor(task, locale);
  const action = displayActionFor(task, locale);
  const overdue = task.dueAt ? overdueDaysFor(task.dueAt, reference) : 0;
  // priority 同样是从被夹住的 dueInDays 推出来的，逾期任务会带着「今天」这个标记，
  // 和下面「已逾期 N 天」的到期行直接打架。优先级和到期共用同一个判断，逾期时两边
  // 都说逾期——展示层再由前缀判等收掉重复的那一个。
  const priorityLabel =
    overdue > 0
      ? localize(locale, { en: "Overdue", zh: "已逾期" })
      : priorityLabelFor(task.priority, locale);

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
    // live-service 的两个构造器都把同一个字符串同时写进 title 和 recommendedAction
    // （toTask: `recommendedAction: task.title`；relationshipSuggestions:
    // `title: recommendedAction`），所以 body 会把标题一字不差复读一遍。这里在唯一的
    // 展示出口判等，相等就不发 body——两条构造路径都覆盖，也兼容已持久化的旧数据。
    body: action === title ? "" : action,
    confidenceLabel: priorityLabel,
    // 机器可读增量字段：客户端按人分组要 contactId（此前只能拿姓名反查），
    // 「承诺 / 线索」分区要 triggerKind，右上角到期和排序要原始 dueAt。
    contactId: task.contactId ?? undefined,
    dueAt: task.dueAt,
    evidenceIds: task.evidenceIds,
    id: `followup:${task.taskId}`,
    triggerKind: task.triggerKind,
    metadata: [
      {
        label: localize(locale, { en: "Organization", zh: "组织" }),
        value: task.organization || localize(locale, { en: "Unknown", zh: "未知" }),
      },
      {
        label: localize(locale, { en: "Due", zh: "到期" }),
        value: dueLabelFor(task.dueInDays, task.dueAt, overdue, locale),
      },
      {
        label: localize(locale, { en: "Priority", zh: "优先级" }),
        value: priorityLabel,
      },
      {
        label: localize(locale, { en: "Source", zh: "来源" }),
        value: sourceLabelFor(task.source.label || task.audit.sourceLabel, locale),
      },
    ],
    reason: displayReasonFor(task, locale),
    subtitle: task.contactName,
    title,
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
        items: data.tasks.map((task) => itemFor(task, locale, data.generatedAt)),
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
  actorId?: string | null;
  fallbackService?: OrbitAgentArtifactTaskService;
  followupService?: FollowupTaskGenerationService;
} = {}): OrbitAgentArtifactTaskService {
  const actorId = input.actorId?.trim() || null;
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
        actorId,
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
