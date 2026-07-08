import type {
  OrbitAiProactiveCalendarActivity,
  OrbitAiProactiveCalendarConversation,
  OrbitAiProactiveCalendarMessage,
  OrbitAiProactiveCalendarMessageInput,
  OrbitAiProactiveCalendarMessagePayload,
  OrbitAiProactiveCalendarMessageResult,
  OrbitAiProactiveCalendarMessageService,
  OrbitAiProactiveCalendarProvenance,
  OrbitAiProactiveCalendarSafetyLedger,
} from "./proactive-contract";

const fixtureSource =
  "fixture:features/orbit-ai/proactive-calendar-service.ts" as const;
const defaultNow = "2026-07-08T09:00:00.000Z";
const oneHourMs = 60 * 60 * 1000;

const safetyLedger: OrbitAiProactiveCalendarSafetyLedger = {
  calendarProviderRequested: false,
  calendarUpdateExecuted: false,
  emailProviderRequested: false,
  externalNetworkRequested: false,
  externalSideEffectsExecuted: false,
  notificationDelivered: false,
  pushProviderRequested: false,
  smsProviderRequested: false,
};

const appDemoActivities: readonly OrbitAiProactiveCalendarActivity[] = [
  {
    activityId: "event:seed-investor-preparation-call",
    title: "Seed investor preparation call",
    startsAt: "2026-07-08T09:45:00.000Z",
    endsAt: "2026-07-08T10:15:00.000Z",
    people: [
      {
        context: "warm intro from last week's founder salon",
        name: "Mina Park",
      },
    ],
    recommendedPreparation:
      "Review the investor's climate portfolio and prepare two follow-up paths.",
    relationshipContext:
      "Mina is connected through the founder salon and asked for a short operator update.",
    sourceLabel: "Local calendar fixture",
    evidenceIds: ["evidence:calendar:seed-investor-preparation-call"],
  },
];

function readDate(value: string): Date | null {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function compactIso(value: string): string {
  return value.replace(/[^0-9a-z]/gi, "").slice(0, 15).toLowerCase();
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function timeLabel(value: string): string {
  const timeMatch = value.match(/T(\d{2}:\d{2})/);

  return timeMatch?.[1] ?? value;
}

function dedupeKeyFor(input: {
  activity: OrbitAiProactiveCalendarActivity;
  windowStartsAt: string;
}): string {
  return [
    "orbit-ai-proactive-calendar",
    input.activity.activityId,
    input.activity.startsAt,
    input.windowStartsAt,
  ].join("|");
}

function peopleContextFor(
  activity: OrbitAiProactiveCalendarActivity,
): string {
  if (activity.people.length === 0) {
    return "No named people are attached yet; review the event source before preparing outreach.";
  }

  return activity.people
    .map((person) => `${person.name}: ${person.context}`)
    .join("; ");
}

function messageIdFor(activity: OrbitAiProactiveCalendarActivity): string {
  return `proactive-calendar-message-${slug(activity.activityId)}-${compactIso(activity.startsAt)}`;
}

function conversationIdFor(activity: OrbitAiProactiveCalendarActivity): string {
  return `proactive-calendar-conversation-${slug(activity.activityId)}-${compactIso(activity.startsAt)}`;
}

function messageFor(input: {
  activity: OrbitAiProactiveCalendarActivity;
  dedupeKey: string;
}): OrbitAiProactiveCalendarMessage {
  const activity = input.activity;
  const messageId = messageIdFor(activity);
  const conversationId = conversationIdFor(activity);
  const peopleContext = peopleContextFor(activity);
  const startsAt = timeLabel(activity.startsAt);

  return {
    activityId: activity.activityId,
    body: [
      `${activity.title} starts at ${startsAt}.`,
      `People context: ${peopleContext}.`,
      `Relationship context: ${activity.relationshipContext}`,
      `Preparation prompt: ${activity.recommendedPreparation}`,
      "This is a local Orbit Agent inbox message. Nothing has been delivered outside Orbit.",
    ].join(" "),
    conversationHref: `/app/agent?proactive=${encodeURIComponent(messageId)}`,
    conversationId,
    dedupeKey: input.dedupeKey,
    deliverySurface: "orbit_in_app_inbox",
    evidenceIds: activity.evidenceIds,
    messageId,
    peopleContext,
    preparationPrompt: activity.recommendedPreparation,
    sourceLabel: activity.sourceLabel,
    subject: `Upcoming: ${activity.title}`,
    timeLabel: startsAt,
  };
}

function conversationFor(input: {
  activity: OrbitAiProactiveCalendarActivity;
  message: OrbitAiProactiveCalendarMessage;
}): OrbitAiProactiveCalendarConversation {
  const activity = input.activity;
  const peopleContext = peopleContextFor(activity);

  return {
    activityId: activity.activityId,
    activityTitle: activity.title,
    conversationId: input.message.conversationId,
    firstAssistantResponse: [
      `主动提醒：${activity.title} 在 ${input.message.timeLabel} 开始。`,
      `People context: ${peopleContext}.`,
      `Preparation: ${activity.recommendedPreparation}`,
      "我会把这次日历活动保留在 Orbit AI 对话里；不会发送邮件、短信、推送或修改日历。",
    ].join(" "),
    initialPrompt: [
      `Prepare me for ${activity.title} at ${input.message.timeLabel}.`,
      `People: ${peopleContext}.`,
      `Relationship context: ${activity.relationshipContext}`,
      `Preparation: ${activity.recommendedPreparation}`,
    ].join(" "),
    peopleContext,
    preparationPrompt: activity.recommendedPreparation,
    relationshipContext: activity.relationshipContext,
    sourceLabel: activity.sourceLabel,
    sourceMessageId: input.message.messageId,
    timeLabel: input.message.timeLabel,
  };
}

function provenanceFor(input: {
  collectedAt: string;
  evidenceIds: readonly string[];
  windowEndsAt: string;
  windowStartsAt: string;
}): OrbitAiProactiveCalendarProvenance {
  return {
    collectedAt: input.collectedAt,
    evidenceIds: input.evidenceIds,
    generationMethod: "local-calendar-window-rule",
    privacy: "local-proactive-calendar-message-only",
    safety: safetyLedger,
    source: fixtureSource,
    sourceLabel: "Orbit AI proactive calendar local rule",
    windowEndsAt: input.windowEndsAt,
    windowStartsAt: input.windowStartsAt,
  };
}

function payloadFor(input: {
  collectedAt: string;
  conversations: readonly OrbitAiProactiveCalendarConversation[];
  messages: readonly OrbitAiProactiveCalendarMessage[];
  windowEndsAt: string;
  windowStartsAt: string;
}): OrbitAiProactiveCalendarMessagePayload {
  return {
    conversations: input.conversations,
    messages: input.messages,
    provenance: provenanceFor({
      collectedAt: input.collectedAt,
      evidenceIds: Array.from(
        new Set(input.messages.flatMap((message) => message.evidenceIds)),
      ),
      windowEndsAt: input.windowEndsAt,
      windowStartsAt: input.windowStartsAt,
    }),
  };
}

function isWithinOneHour(input: {
  activity: OrbitAiProactiveCalendarActivity;
  windowEndsAt: Date;
  windowStartsAt: Date;
}): boolean {
  const startsAt = readDate(input.activity.startsAt);

  if (!startsAt) return false;

  return startsAt >= input.windowStartsAt && startsAt <= input.windowEndsAt;
}

function success(
  payload: OrbitAiProactiveCalendarMessagePayload,
): OrbitAiProactiveCalendarMessageResult {
  return {
    data: JSON.parse(JSON.stringify(payload)) as OrbitAiProactiveCalendarMessagePayload,
    success: true,
  };
}

export interface OrbitAiProactiveCalendarMessageServiceOptions {
  now?: () => string;
}

export function createOrbitAiProactiveCalendarMessageService({
  now = () => defaultNow,
}: OrbitAiProactiveCalendarMessageServiceOptions = {}): OrbitAiProactiveCalendarMessageService {
  return {
    createMessagesForUpcomingActivities(
      input: OrbitAiProactiveCalendarMessageInput,
    ): OrbitAiProactiveCalendarMessageResult {
      const collectedAt = now();
      const windowStartsAt = readDate(collectedAt) ?? readDate(defaultNow)!;
      const windowEndsAt = new Date(windowStartsAt.getTime() + oneHourMs);
      const delivered = new Set(input.deliveredDedupeKeys ?? []);
      const messages: OrbitAiProactiveCalendarMessage[] = [];
      const conversations: OrbitAiProactiveCalendarConversation[] = [];

      for (const activity of input.activities) {
        if (!isWithinOneHour({ activity, windowEndsAt, windowStartsAt })) {
          continue;
        }

        const dedupeKey = dedupeKeyFor({
          activity,
          windowStartsAt: windowStartsAt.toISOString(),
        });

        if (delivered.has(dedupeKey)) {
          continue;
        }

        const message = messageFor({ activity, dedupeKey });

        messages.push(message);
        conversations.push(conversationFor({ activity, message }));
      }

      return success(
        payloadFor({
          collectedAt,
          conversations,
          messages,
          windowEndsAt: windowEndsAt.toISOString(),
          windowStartsAt: windowStartsAt.toISOString(),
        }),
      );
    },
  };
}

export function loadOrbitAiProactiveCalendarMessagesForApp(): OrbitAiProactiveCalendarMessageResult {
  return createOrbitAiProactiveCalendarMessageService().createMessagesForUpcomingActivities(
    {
      activities: appDemoActivities,
    },
  );
}

export function findOrbitAiProactiveCalendarConversationForApp(
  messageId: string | null,
): OrbitAiProactiveCalendarConversation | null {
  if (!messageId) return null;

  const result = loadOrbitAiProactiveCalendarMessagesForApp();

  return (
    result.data.conversations.find(
      (conversation) => conversation.sourceMessageId === messageId,
    ) ?? null
  );
}
