import type { EventRecord } from "../events/event-crud-and-import/contract";
import {
  mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
} from "../events/event-crud-and-import/fixtures";
import type { FollowupTask } from "../followups/contract";
import { mockFollowupTasks } from "../followups/fixtures";
import type {
  OrbitAgentArtifactGeneratedView,
  OrbitAgentArtifactPayload,
  OrbitAgentArtifactPresentation,
  OrbitAgentArtifactProvenance,
  OrbitAgentArtifactResult,
  OrbitAgentArtifactSafety,
  OrbitAgentArtifactTask,
  OrbitAgentArtifactToolCallTrace,
} from "./artifact-contract";

export const ORBIT_AI_TODO_SUMMARY_SOURCE =
  "runtime:features/orbit-ai/todo-summary-service.ts" as const;

export const ORBIT_AI_TODO_SUMMARY_ACCEPTANCE_THRESHOLD = {
  priorityAccuracy: 0.8,
  taskRecall: 0.8,
} as const;

const defaultNow = "2026-07-08T09:00:00+09:00";
const defaultConversationId = "demo-orbit-agent-conversation-1";
const generatedAt = "2026-07-08T00:00:00.000Z";

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

export type OrbitAiTodoSummaryLocale = "en" | "zh";
export type OrbitAiTodoSummarySourceContext = "conversation" | "schedule";
export type OrbitAiTodoSummaryPriority = "high" | "medium" | "low";
export type OrbitAiTodoSummarySignalKind =
  | "birthday"
  | "conversation_next_action"
  | "event_timing"
  | "followup_task"
  | "introduction_opportunity"
  | "relationship_reminder";

interface BaseTodoSourceRecord {
  evidenceIds: readonly string[];
  id: string;
  reason: string;
  sourceLabel: string;
  tags?: readonly string[];
}

export interface OrbitAiTodoConversationRecord extends BaseTodoSourceRecord {
  dueAt: string;
  eventHref?: string;
  eventName?: string;
  href: string;
  nextAction: string;
  personName: string;
}

export interface OrbitAiTodoScheduleRecord extends BaseTodoSourceRecord {
  endsAt?: string;
  eventHref: string;
  eventName: string;
  startsAt: string;
}

export interface OrbitAiTodoBirthdayRecord extends BaseTodoSourceRecord {
  href: string;
  occursAt: string;
  personName: string;
}

export interface OrbitAiTodoIntroductionOpportunity extends BaseTodoSourceRecord {
  dueAt: string;
  href: string;
  nextAction: string;
  requesterName: string;
  targetName: string;
}

export interface OrbitAiTodoRelationshipReminder extends BaseTodoSourceRecord {
  dueAt: string;
  href: string;
  personName: string;
  title: string;
}

export interface OrbitAiTodoSummaryInput {
  birthdays?: readonly OrbitAiTodoBirthdayRecord[];
  conversationRecords?: readonly OrbitAiTodoConversationRecord[];
  introductionOpportunities?: readonly OrbitAiTodoIntroductionOpportunity[];
  locale?: OrbitAiTodoSummaryLocale | string | null;
  maxItems?: number | null;
  now?: string;
  preparedFinalResponse?: string | null;
  query: string;
  relationshipReminders?: readonly OrbitAiTodoRelationshipReminder[];
  scheduleRecords?: readonly OrbitAiTodoScheduleRecord[];
}

export interface OrbitAiTodoSummaryItem {
  dueAt: string;
  dueLabel: string;
  evidenceIds: readonly string[];
  href: string;
  id: string;
  priority: OrbitAiTodoSummaryPriority;
  reason: string;
  score: number;
  signalKind: OrbitAiTodoSummarySignalKind;
  sourceContext: OrbitAiTodoSummarySourceContext;
  sourceLabel: string;
  title: string;
}

export interface OrbitAiTodoSummaryResult {
  answer: string;
  items: readonly OrbitAiTodoSummaryItem[];
  provenance: {
    evidenceIds: readonly string[];
    generatedAt: string;
    source: typeof ORBIT_AI_TODO_SUMMARY_SOURCE;
    sourceModules: readonly ("chat" | "events" | "followups" | "orbit-ai")[];
  };
  rejectedPreparedFinalResponse: boolean;
}

export interface OrbitAiTodoSummaryEvaluationCase
  extends OrbitAiTodoSummaryInput {
  expectedRequiredItemIds: readonly string[];
  expectedTopItemId: string;
  id: string;
}

export interface OrbitAiTodoSummaryEvaluationResult {
  priorityAccuracy: number;
  results: readonly (OrbitAiTodoSummaryResult & { id: string })[];
  taskRecall: number;
}

interface QueryFocus {
  birthday: boolean;
  businessFollowupAfterEvent: boolean;
  introduction: boolean;
  today: boolean;
  weekendSocial: boolean;
}

type Candidate = Omit<OrbitAiTodoSummaryItem, "dueLabel" | "priority" | "score"> & {
  tags: readonly string[];
};

function normalizeLocale(locale: OrbitAiTodoSummaryInput["locale"]): OrbitAiTodoSummaryLocale {
  return locale === "zh" ? "zh" : "en";
}

function localize(
  locale: OrbitAiTodoSummaryLocale,
  copy: Record<OrbitAiTodoSummaryLocale, string>,
): string {
  return copy[locale];
}

function validDate(value: string): Date | null {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBetween(fromValue: string, toValue: string): number {
  const from = validDate(fromValue);
  const to = validDate(toValue);

  if (!from || !to) return 999;

  const fromDay = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

  return Math.round((toDay - fromDay) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = validDate(value) ?? validDate(defaultNow) ?? new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString();
}

function isWeekend(value: string): boolean {
  const date = validDate(value);

  if (!date) return false;

  const day = date.getUTCDay();

  return day === 0 || day === 6;
}

function dueLabelFor(input: {
  dueAt: string;
  locale: OrbitAiTodoSummaryLocale;
  now: string;
}): string {
  const days = daysBetween(input.now, input.dueAt);
  const time = validDate(input.dueAt)?.toISOString().slice(11, 16) ?? "";

  if (days < 0) {
    return localize(input.locale, {
      en: "Overdue",
      zh: "已逾期",
    });
  }

  if (days === 0) {
    return localize(input.locale, {
      en: time ? `Today ${time}` : "Today",
      zh: time ? `今天 ${time}` : "今天",
    });
  }

  if (days === 1) {
    return localize(input.locale, {
      en: time ? `Tomorrow ${time}` : "Tomorrow",
      zh: time ? `明天 ${time}` : "明天",
    });
  }

  return localize(input.locale, {
    en: `${days} days`,
    zh: `${days} 天后`,
  });
}

function focusFor(query: string): QueryFocus {
  return {
    birthday: /birthday|生日/i.test(query),
    businessFollowupAfterEvent:
      /after (?:an? )?event|post[- ]event|business follow|event follow|活动后|会后|會後|商业跟进|商務跟進/i.test(
        query,
      ),
    introduction: /intro|introduction|introduce|friend|referral|介绍|引荐|引薦|朋友/i.test(
      query,
    ),
    today: /today|agenda|this morning|to-?do|todo|task list|今天|今日|日程|待办|待辦|任务/i.test(
      query,
    ),
    weekendSocial: /weekend|social|dinner|community|周末|社交|饭局|飯局|社群/i.test(
      query,
    ),
  };
}

function hasTag(candidate: Candidate, pattern: RegExp): boolean {
  return candidate.tags.some((tag) => pattern.test(tag));
}

function scoreCandidate(input: {
  candidate: Candidate;
  focus: QueryFocus;
  now: string;
}): number {
  const days = daysBetween(input.now, input.candidate.dueAt);
  const baseByKind: Record<OrbitAiTodoSummarySignalKind, number> = {
    birthday: 54,
    conversation_next_action: 66,
    event_timing: 58,
    followup_task: 60,
    introduction_opportunity: 62,
    relationship_reminder: 56,
  };
  let score = baseByKind[input.candidate.signalKind];

  if (days < 0) score += 18;
  if (days === 0) score += 28;
  if (days === 1) score += 15;
  if (days >= 2 && days <= 4) score += 8;

  if (input.focus.today) {
    if (days === 0) score += 30;
    if (input.candidate.sourceContext === "conversation") score += 8;
    if (input.candidate.sourceContext === "schedule") score += 8;
  }

  if (input.focus.weekendSocial) {
    if (isWeekend(input.candidate.dueAt)) score += 18;
    if (hasTag(input.candidate, /social|community|weekend|dinner/i)) score += 38;
    if (input.candidate.signalKind === "relationship_reminder") score += 16;
  }

  if (input.focus.birthday && input.candidate.signalKind === "birthday") {
    score += 70;
  }

  if (
    input.focus.introduction &&
    input.candidate.signalKind === "introduction_opportunity"
  ) {
    score += 70;
  }

  if (input.focus.businessFollowupAfterEvent) {
    if (hasTag(input.candidate, /business|event_followup|pilot|post_event/i)) {
      score += 44;
    }
    if (input.candidate.signalKind === "event_timing") score += 12;
    if (input.candidate.sourceContext === "conversation") score += 12;
  }

  return score;
}

function priorityFor(score: number): OrbitAiTodoSummaryPriority {
  if (score >= 112) return "high";
  if (score >= 82) return "medium";

  return "low";
}

function conversationCandidate(record: OrbitAiTodoConversationRecord): Candidate {
  return {
    dueAt: record.dueAt,
    evidenceIds: record.evidenceIds,
    href: record.href,
    id: record.id,
    reason: record.reason,
    signalKind: "conversation_next_action",
    sourceContext: "conversation",
    sourceLabel: record.sourceLabel,
    tags: record.tags ?? [],
    title: record.nextAction,
  };
}

function scheduleCandidate(record: OrbitAiTodoScheduleRecord): Candidate {
  return {
    dueAt: record.startsAt,
    evidenceIds: record.evidenceIds,
    href: record.eventHref,
    id: record.id,
    reason: record.reason,
    signalKind: "event_timing",
    sourceContext: "schedule",
    sourceLabel: record.sourceLabel,
    tags: record.tags ?? [],
    title: record.eventName,
  };
}

function birthdayCandidate(record: OrbitAiTodoBirthdayRecord): Candidate {
  return {
    dueAt: record.occursAt,
    evidenceIds: record.evidenceIds,
    href: record.href,
    id: record.id,
    reason: record.reason,
    signalKind: "birthday",
    sourceContext: "schedule",
    sourceLabel: record.sourceLabel,
    tags: record.tags ?? ["birthday"],
    title: `Mention ${record.personName}'s birthday`,
  };
}

function introductionCandidate(
  record: OrbitAiTodoIntroductionOpportunity,
): Candidate {
  return {
    dueAt: record.dueAt,
    evidenceIds: record.evidenceIds,
    href: record.href,
    id: record.id,
    reason: record.reason,
    signalKind: "introduction_opportunity",
    sourceContext: "conversation",
    sourceLabel: record.sourceLabel,
    tags: record.tags ?? ["introduction"],
    title: record.nextAction,
  };
}

function relationshipReminderCandidate(
  record: OrbitAiTodoRelationshipReminder,
): Candidate {
  return {
    dueAt: record.dueAt,
    evidenceIds: record.evidenceIds,
    href: record.href,
    id: record.id,
    reason: record.reason,
    signalKind: "relationship_reminder",
    sourceContext: "schedule",
    sourceLabel: record.sourceLabel,
    tags: record.tags ?? ["relationship_reminder"],
    title: record.title,
  };
}

function followupTaskConversationRecord(
  task: FollowupTask,
  now: string,
): OrbitAiTodoConversationRecord {
  return {
    dueAt: addDays(now, task.dueInDays),
    evidenceIds: task.evidenceIds,
    href: `/app/contacts/${encodeURIComponent(task.connectionId || task.contactName)}`,
    id: `followup:${task.taskId}`,
    nextAction: task.title,
    personName: task.contactName,
    reason: task.rationale,
    sourceLabel: task.source.label,
    tags: ["followup", task.triggerKind, task.priority],
  };
}

function eventScheduleRecord(
  event: EventRecord,
  input: {
    id: string;
    tags: readonly string[];
  },
): OrbitAiTodoScheduleRecord {
  return {
    endsAt: event.endsAt,
    eventHref:
      event.id === "event_001"
        ? "/app/events/demo-event-1?sourceEventId=event_001"
        : `/app/events/${encodeURIComponent(event.id)}`,
    eventName: event.title,
    evidenceIds: event.evidence.map((item) => item.evidenceId),
    id: input.id,
    reason: event.recommendedPreparation || event.relationshipContext,
    sourceLabel: event.sourceMetadata.label,
    startsAt: event.startsAt,
    tags: input.tags,
  };
}

function defaultConversationRecords(now: string): readonly OrbitAiTodoConversationRecord[] {
  return [
    {
      dueAt: "2026-07-08T15:00:00+09:00",
      eventHref: "/app/events/demo-event-1?sourceEventId=event_001",
      eventName: "Seed Investor and Founder Matching Salon",
      evidenceIds: [
        "evidence:orbit-agent-demo-aoba-message-4",
        "evidence:orbit-agent-demo-aoba-event",
      ],
      href: "/app/contacts/contact_010",
      id: "conversation:aoba-pilot-recap",
      nextAction: "Send the Aoba pilot timeline recap before the 15:00 decision window",
      personName: "胡家明",
      reason:
        "Saved conversation context says Aoba Technologies asked for a concise pilot timeline after the event before involving technical teammates.",
      sourceLabel: "Saved relationship conversation",
      tags: ["today", "business", "event_followup", "pilot"],
    },
    ...mockFollowupTasks.slice(0, 2).map((task) =>
      followupTaskConversationRecord(task, now),
    ),
  ];
}

function defaultScheduleRecords(): readonly OrbitAiTodoScheduleRecord[] {
  const event = eventScheduleRecord(mockOrbitAiRecommendedEventDetailRecord, {
    id: "schedule:seed-founder-salon",
    tags: ["business", "event_followup", "investor"],
  });
  const storageEvent = mockEventRecords.find((item) => item.id === "demo-event-2");

  return [
    event,
    ...(storageEvent
      ? [
          {
            ...eventScheduleRecord(storageEvent, {
              id: "schedule:storage-operator-breakfast",
              tags: ["business", "followup"],
            }),
            startsAt: "2026-07-08T10:30:00+09:00",
          },
        ]
      : []),
    {
      endsAt: "2026-07-11T21:00:00+09:00",
      eventHref: "/app/events/event_05",
      eventName: "Weekend community dinner",
      evidenceIds: ["evidence:todo:weekend-community-dinner"],
      id: "schedule:weekend-community-dinner",
      reason:
        "The schedule context keeps a social dinner visible because two warm relationship reminders depend on it.",
      sourceLabel: "Local schedule review",
      startsAt: "2026-07-11T18:30:00+09:00",
      tags: ["weekend", "social", "community", "dinner"],
    },
  ];
}

function defaultBirthdays(): readonly OrbitAiTodoBirthdayRecord[] {
  return [
    {
      evidenceIds: ["evidence:todo:birthday:hana-sato"],
      href: "/app/contacts/contact:hana-sato",
      id: "birthday:hana-sato",
      occursAt: "2026-07-10T09:00:00+09:00",
      personName: "Hana Sato",
      reason:
        "The relationship note says Hana's birthday is this week and a lightweight mention would fit the current nurture context.",
      sourceLabel: "Relationship birthday note",
      tags: ["birthday", "social"],
    },
  ];
}

function defaultIntroductionOpportunities(): readonly OrbitAiTodoIntroductionOpportunity[] {
  return [
    {
      dueAt: "2026-07-08T11:00:00+09:00",
      evidenceIds: ["evidence:referral:founder-kai"],
      href: "/app/contacts/contact:maya-chen",
      id: "intro:maya-kai",
      nextAction: "Ask Maya whether she is comfortable introducing Kai Mori",
      reason:
        "Founder referral context says Maya knows Kai through grid procurement pilots; Orbit should ask for opt-in before any outreach.",
      requesterName: "Maya Chen",
      sourceLabel: "Founder referral context",
      tags: ["introduction", "friend", "referral", "today"],
      targetName: "Kai Mori",
    },
  ];
}

function defaultRelationshipReminders(): readonly OrbitAiTodoRelationshipReminder[] {
  return [
    {
      dueAt: "2026-07-11T10:00:00+09:00",
      evidenceIds: ["evidence:notification:amina-nurture"],
      href: "/app/contacts/connection:amina-okafor",
      id: "reminder:amina-weekend-checkin",
      personName: "Amina Okafor",
      reason:
        "Relationship reminder context says Amina has strong partner fit and no recent touchpoint, so a weekend check-in should stay visible.",
      sourceLabel: "Relationship recency reminder",
      tags: ["weekend", "social", "relationship_reminder"],
      title: "Send Amina a weekend relationship check-in",
    },
  ];
}

function candidatesFor(input: {
  birthdays: readonly OrbitAiTodoBirthdayRecord[];
  conversationRecords: readonly OrbitAiTodoConversationRecord[];
  introductionOpportunities: readonly OrbitAiTodoIntroductionOpportunity[];
  relationshipReminders: readonly OrbitAiTodoRelationshipReminder[];
  scheduleRecords: readonly OrbitAiTodoScheduleRecord[];
}): Candidate[] {
  return [
    ...input.conversationRecords.map(conversationCandidate),
    ...input.scheduleRecords.map(scheduleCandidate),
    ...input.birthdays.map(birthdayCandidate),
    ...input.introductionOpportunities.map(introductionCandidate),
    ...input.relationshipReminders.map(relationshipReminderCandidate),
  ];
}

function rankedItems(input: {
  candidates: readonly Candidate[];
  locale: OrbitAiTodoSummaryLocale;
  maxItems: number;
  now: string;
  query: string;
}): OrbitAiTodoSummaryItem[] {
  const focus = focusFor(input.query);

  return [...input.candidates]
    .map((candidate) => {
      const score = scoreCandidate({ candidate, focus, now: input.now });

      return {
        ...candidate,
        dueLabel: dueLabelFor({
          dueAt: candidate.dueAt,
          locale: input.locale,
          now: input.now,
        }),
        priority: priorityFor(score),
        score,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;

      const leftTime = validDate(left.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = validDate(right.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftTime !== rightTime) return leftTime - rightTime;

      return left.id.localeCompare(right.id);
    })
    .slice(0, input.maxItems);
}

function answerFor(
  items: readonly OrbitAiTodoSummaryItem[],
  locale: OrbitAiTodoSummaryLocale,
): string {
  if (items.length === 0) {
    return localize(locale, {
      en: "No source-backed upcoming relationship work matched this prompt.",
      zh: "没有匹配这次问题的有来源待办。",
    });
  }

  const top = items[0];
  const count = items.length;

  return localize(locale, {
    en: `Upcoming relationship work: ${count} source-backed item(s). Start with "${top.title}" because ${top.reason}`,
    zh: `待办摘要：共有 ${count} 个有来源的关系事项。先处理「${top.title}」，因为${top.reason}`,
  });
}

function evidenceIdsFor(items: readonly OrbitAiTodoSummaryItem[]): readonly string[] {
  return Array.from(new Set(items.flatMap((item) => item.evidenceIds)));
}

function defaultedInput(input: OrbitAiTodoSummaryInput) {
  const now = input.now ?? defaultNow;

  return {
    birthdays: input.birthdays ?? defaultBirthdays(),
    conversationRecords:
      input.conversationRecords ?? defaultConversationRecords(now),
    introductionOpportunities:
      input.introductionOpportunities ?? defaultIntroductionOpportunities(),
    relationshipReminders:
      input.relationshipReminders ?? defaultRelationshipReminders(),
    scheduleRecords: input.scheduleRecords ?? defaultScheduleRecords(),
  };
}

export const ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES: readonly OrbitAiTodoSummaryEvaluationCase[] =
  [
    {
      expectedRequiredItemIds: [
        "conversation:aoba-pilot-recap",
        "schedule:storage-operator-breakfast",
        "intro:maya-kai",
      ],
      expectedTopItemId: "conversation:aoba-pilot-recap",
      id: "today_agenda",
      locale: "en",
      now: defaultNow,
      query: "What should I do today in Orbit?",
    },
    {
      expectedRequiredItemIds: [
        "reminder:amina-weekend-checkin",
        "schedule:weekend-community-dinner",
      ],
      expectedTopItemId: "reminder:amina-weekend-checkin",
      id: "weekend_social_reminder",
      locale: "en",
      now: defaultNow,
      query: "What social reminders should I keep for the weekend?",
    },
    {
      expectedRequiredItemIds: ["birthday:hana-sato"],
      expectedTopItemId: "birthday:hana-sato",
      id: "birthday_mention",
      locale: "en",
      now: defaultNow,
      query: "Who has a birthday I should mention?",
    },
    {
      expectedRequiredItemIds: ["intro:maya-kai"],
      expectedTopItemId: "intro:maya-kai",
      id: "friend_introduction_request",
      locale: "en",
      now: defaultNow,
      query: "Which friend introduction request needs action today?",
    },
    {
      expectedRequiredItemIds: [
        "conversation:aoba-pilot-recap",
        "schedule:seed-founder-salon",
      ],
      expectedTopItemId: "conversation:aoba-pilot-recap",
      id: "business_followup_after_event",
      locale: "en",
      now: defaultNow,
      query: "What business follow-up should happen after an event?",
    },
  ];

function recallScore(
  cases: readonly OrbitAiTodoSummaryEvaluationCase[],
  results: readonly (OrbitAiTodoSummaryResult & { id: string })[],
): number {
  const requiredIds = cases.flatMap((item) =>
    item.expectedRequiredItemIds.map((expectedId) => ({
      caseId: item.id,
      expectedId,
    })),
  );
  const recalled = requiredIds.filter(({ caseId, expectedId }) => {
    const result = results.find((item) => item.id === caseId);

    return result?.items.some((item) => item.id === expectedId) === true;
  });

  return requiredIds.length ? recalled.length / requiredIds.length : 1;
}

function priorityScore(
  cases: readonly OrbitAiTodoSummaryEvaluationCase[],
  results: readonly (OrbitAiTodoSummaryResult & { id: string })[],
): number {
  const correct = cases.filter((evaluationCase) => {
    const result = results.find((item) => item.id === evaluationCase.id);

    return result?.items[0]?.id === evaluationCase.expectedTopItemId;
  });

  return cases.length ? correct.length / cases.length : 1;
}

function generatedViewFor(
  result: OrbitAiTodoSummaryResult,
  locale: OrbitAiTodoSummaryLocale,
): OrbitAgentArtifactGeneratedView {
  return {
    sections: [
      {
        body: localize(locale, {
          en: "Prioritized from conversation next actions, event timing, schedule entries, birthdays, introduction opportunities, and relationship reminders.",
          zh: "根据对话下一步、活动时间、日程、生日、引荐机会和关系提醒排序。",
        }),
        items: result.items.map((item) => ({
          actions: [
            {
              actionId: `todo:review:${item.id}`,
              href: item.href,
              label:
                item.sourceContext === "schedule"
                  ? localize(locale, { en: "Review event", zh: "复核活动" })
                  : localize(locale, { en: "Review person", zh: "复核关系" }),
              requiresConfirmation: true,
            },
          ],
          body: localize(locale, {
            en: `Due: ${item.dueLabel}. Source context: ${item.sourceContext}.`,
            zh: `到期：${item.dueLabel}。来源上下文：${item.sourceContext === "conversation" ? "对话" : "日程"}。`,
          }),
          confidenceLabel: localize(locale, {
            en: `${item.priority} priority · ${item.score}`,
            zh: `${item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}优先级 · ${item.score}`,
          }),
          evidenceIds: item.evidenceIds,
          id: item.id,
          metadata: [
            {
              label: localize(locale, { en: "Due", zh: "到期" }),
              value: item.dueLabel,
            },
            {
              label: localize(locale, { en: "Start", zh: "开始" }),
              value: item.dueAt,
            },
            {
              label: localize(locale, { en: "Reason", zh: "原因" }),
              value: item.reason,
            },
            {
              label: localize(locale, {
                en: "Source context",
                zh: "来源上下文",
              }),
              value: item.sourceContext,
            },
            {
              label: localize(locale, { en: "Source", zh: "来源" }),
              value: item.sourceLabel,
            },
          ],
          reason: item.reason,
          subtitle: `${item.dueLabel} · ${item.sourceLabel}`,
          title: item.title,
        })),
        title: localize(locale, {
          en: "Prioritized next actions",
          zh: "优先下一步",
        }),
      },
    ],
    summary: result.answer,
  };
}

function artifactPresentation(
  locale: OrbitAiTodoSummaryLocale,
): OrbitAgentArtifactPresentation {
  return {
    preferredSurface: "side_panel",
    subtitle: localize(locale, {
      en: "Conversation and schedule context",
      zh: "来自对话和日程上下文",
    }),
    title: localize(locale, {
      en: "Upcoming relationship work",
      zh: "关系待办摘要",
    }),
    widthHint: "half",
  };
}

function toolTraceFor(
  result: OrbitAiTodoSummaryResult,
  locale: OrbitAiTodoSummaryLocale,
): readonly OrbitAgentArtifactToolCallTrace[] {
  return [
    {
      evidenceIds: result.provenance.evidenceIds,
      reason: localize(locale, {
        en: "Orbit AI synthesized upcoming work from structured conversation and schedule records without creating calendar events, tasks, reminders, messages, or notifications.",
        zh: "Orbit AI 只从结构化对话和日程记录整理待办，未创建日历、任务、提醒、消息或通知。",
      }),
      status: "completed",
      toolCallId: "toolcall:todo-summary:structured-context",
      toolName: "todos.summarizeUpcomingWork",
    },
  ];
}

function artifactProvenanceFor(
  result: OrbitAiTodoSummaryResult,
  locale: OrbitAiTodoSummaryLocale,
): OrbitAgentArtifactProvenance {
  return {
    evidenceIds: result.provenance.evidenceIds,
    generatedAt: result.provenance.generatedAt,
    generationMethod: "artifact-producer-generated-view",
    source: ORBIT_AI_TODO_SUMMARY_SOURCE,
    sourceModules: result.provenance.sourceModules,
    toolCalls: toolTraceFor(result, locale),
  };
}

export function todoSummaryResultToArtifactPayload(input: {
  conversationId?: string | null;
  locale?: OrbitAiTodoSummaryLocale | string | null;
  query: string;
  result: OrbitAiTodoSummaryResult;
}): OrbitAgentArtifactPayload {
  const locale = normalizeLocale(input.locale);
  const presentation = artifactPresentation(locale);
  const task: OrbitAgentArtifactTask = {
    artifactId: "artifact:todo-summary:structured-context",
    artifactProducer: "followup_review_producer",
    conversationId: input.conversationId?.trim() || defaultConversationId,
    createdAt: generatedAt,
    kind: "followup_queue",
    presentation,
    query: input.query,
    status: "ready",
    taskId: "task:todo-summary:structured-context",
    updatedAt: generatedAt,
  };
  const artifactResult: OrbitAgentArtifactResult = {
    artifactId: task.artifactId,
    generatedView: generatedViewFor(input.result, locale),
    kind: "followup_queue",
    nextAction: localize(locale, {
      en: "Review the linked person or event before sending, scheduling, notifying, or writing anything.",
      zh: "发送、安排、通知或写入前，请先打开对应人或活动复核。",
    }),
    presentation,
    provenance: artifactProvenanceFor(input.result, locale),
    safety,
    status: "ready",
    taskId: task.taskId,
  };

  return {
    result: artifactResult,
    task,
  };
}

export function createOrbitAiTodoSummaryService() {
  return {
    answerUpcomingWork(input: OrbitAiTodoSummaryInput): OrbitAiTodoSummaryResult {
      const locale = normalizeLocale(input.locale);
      const now = input.now ?? defaultNow;
      const resolved = defaultedInput(input);
      const maxItems =
        typeof input.maxItems === "number" && Number.isFinite(input.maxItems)
          ? Math.max(1, Math.floor(input.maxItems))
          : 5;
      const items = rankedItems({
        candidates: candidatesFor(resolved),
        locale,
        maxItems,
        now,
        query: input.query,
      });
      const evidenceIds = evidenceIdsFor(items);

      return {
        answer: answerFor(items, locale),
        items,
        provenance: {
          evidenceIds:
            evidenceIds.length > 0
              ? evidenceIds
              : ["evidence:orbit-agent:todo-summary:empty"],
          generatedAt,
          source: ORBIT_AI_TODO_SUMMARY_SOURCE,
          sourceModules: ["orbit-ai", "chat", "followups", "events"],
        },
        rejectedPreparedFinalResponse: Boolean(input.preparedFinalResponse),
      };
    },

    evaluateCases(): OrbitAiTodoSummaryEvaluationResult {
      const results = ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES.map(
        (evaluationCase) => ({
          id: evaluationCase.id,
          ...this.answerUpcomingWork(evaluationCase),
        }),
      );

      return {
        priorityAccuracy: priorityScore(
          ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES,
          results,
        ),
        results,
        taskRecall: recallScore(ORBIT_AI_TODO_SUMMARY_EVALUATION_CASES, results),
      };
    },
  };
}
