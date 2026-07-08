export const ORBIT_AI_CALENDAR_ACTION_SOURCE =
  "runtime:features/orbit-ai/calendar-action-service.ts" as const;

export const ORBIT_AI_CALENDAR_ACTION_SUPPORTED_ARTIFACT_KINDS = [
  "contact_recommendations",
  "event_recommendations",
  "followup_queue",
  "todo_summary",
] as const;

export interface OrbitAiCalendarActionSideEffects {
  externalCalendarMutation: false;
  messageSend: false;
  notificationDelivery: false;
  outsideNetworkRequest: false;
  savedRecordWrite: false;
}

export interface OrbitAiCalendarActionCompletionBoundary {
  confirmationAvailable: false;
  noExternalEventCreated: true;
  state: "awaiting_live_calendar_adapter";
}

export interface OrbitAiCalendarActionPreview {
  actionId: string;
  artifactId: string;
  confirmationStatus: "unconfirmed";
  completionBoundary: OrbitAiCalendarActionCompletionBoundary;
  itemId: string;
  label: string;
  localOnly: true;
  source: {
    artifactSource: string;
    evidenceIds: readonly string[];
    label: string;
  };
  state: "staged_unconfirmed";
  sideEffects: OrbitAiCalendarActionSideEffects;
  wouldAdd: {
    date: string;
    endTime: string | null;
    location: string | null;
    reason: string;
    relatedLink: {
      href: string;
      label: string;
    };
    startTime: string;
    time: string;
    timeZone: string;
    title: string;
  };
}

export interface OrbitAiCalendarActionPreviewResult {
  data: {
    previews: readonly OrbitAiCalendarActionPreview[];
    safety: OrbitAiCalendarActionSideEffects;
  };
  success: true;
}

export interface OrbitAiCalendarActionStageResult {
  data: OrbitAiCalendarActionPreview;
  success: true;
}

export interface OrbitAiCalendarActionCancelResult {
  data: {
    actionId: string;
    state: "cancelled";
    sideEffects: OrbitAiCalendarActionSideEffects;
  };
  success: true;
}

export interface OrbitAiCalendarActionService {
  cancelPreview: (input: {
    actionId: string;
  }) => OrbitAiCalendarActionCancelResult;
  createPreviews: (input: {
    conversation: {
      artifacts?: readonly unknown[];
    };
    locale?: "en" | "zh" | string | null;
  }) => OrbitAiCalendarActionPreviewResult;
  stagePreview: (input: {
    preview: OrbitAiCalendarActionPreview;
  }) => OrbitAiCalendarActionStageResult;
}

const noSideEffects: OrbitAiCalendarActionSideEffects = {
  externalCalendarMutation: false,
  messageSend: false,
  notificationDelivery: false,
  outsideNetworkRequest: false,
  savedRecordWrite: false,
};

const noCompletionBoundary: OrbitAiCalendarActionCompletionBoundary = {
  confirmationAvailable: false,
  noExternalEventCreated: true,
  state: "awaiting_live_calendar_adapter",
};

const supportedKinds = new Set<string>(
  ORBIT_AI_CALENDAR_ACTION_SUPPORTED_ARTIFACT_KINDS,
);

const timeLabels = [
  "Due",
  "Timing",
  "When",
  "Time",
  "到期",
  "时间",
] as const;

const startTimeLabels = [
  "Start",
  "Starts at",
  "Start time",
  "开始",
  "开始时间",
] as const;

const endTimeLabels = ["End", "Ends at", "End time", "结束", "结束时间"] as const;
const locationLabels = ["Location", "Venue", "地点", "场地"] as const;
const sourceLabels = ["Source", "Data source", "来源", "数据来源"] as const;
const reasonLabels = ["Reason", "原因"] as const;

type CalendarActionLocale = "en" | "zh";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): readonly string[] {
  return readArray(value).filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0,
  );
}

function metadataValue(
  item: Record<string, unknown>,
  labels: readonly string[],
): string | null {
  const normalizedLabels = new Set(labels.map((label) => label.toLowerCase()));
  const metadata = readArray(item.metadata);

  for (const entry of metadata) {
    if (!isRecord(entry)) continue;
    const label = readString(entry.label);
    const value = readString(entry.value);

    if (label && value && normalizedLabels.has(label.toLowerCase())) {
      return value;
    }
  }

  return null;
}

function concreteTime(value: string | null): string | null {
  if (!value) return null;

  if (/^(today|tomorrow|overdue|今天|明天|已逾期)$/i.test(value)) {
    return null;
  }

  return value;
}

function normalizeLocale(locale: "en" | "zh" | string | null | undefined): CalendarActionLocale {
  return locale === "zh" ? "zh" : "en";
}

function userFacingSourceLabel(
  label: string,
  locale: CalendarActionLocale,
): string {
  const sourceLabelsByName: Record<string, Record<CalendarActionLocale, string>> = {
    "Attendee intent notes": {
      en: "Attendee intent notes",
      zh: "参会者意图记录",
    },
    "Event topic record": {
      en: "Event topic record",
      zh: "活动主题记录",
    },
    "Events service": {
      en: "Events service",
      zh: "活动服务",
    },
    "Followups service": {
      en: "Follow-ups service",
      zh: "跟进来源",
    },
    "Local schedule review": {
      en: "Local schedule review",
      zh: "本地日程复核",
    },
    "Profile fit summary": {
      en: "Profile fit summary",
      zh: "画像匹配摘要",
    },
    "Relationship graph": {
      en: "Relationship graph",
      zh: "关系图谱",
    },
    "Relationship opportunity graph": {
      en: "Relationship opportunity graph",
      zh: "关系机会图谱",
    },
    "Saved relationship conversation": {
      en: "Saved relationship conversation",
      zh: "已保存关系对话",
    },
    "Schedule timing record": {
      en: "Schedule timing record",
      zh: "日程时间记录",
    },
  };

  return sourceLabelsByName[label]?.[locale] ?? label;
}

function timeZoneForOffset(offset: string | undefined): string {
  if (offset === "+09:00" || offset === "+0900") {
    return "Asia/Tokyo";
  }

  if (offset === "Z") {
    return "UTC";
  }

  return "Asia/Tokyo";
}

function calendarTimeParts(value: string): {
  date: string;
  time: string;
  timeZone: string;
} | null {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d{3})?)?(Z|[+-]\d{2}:?\d{2})?$/,
  );

  if (!match) return null;

  return {
    date: match[1],
    time: match[2],
    timeZone: timeZoneForOffset(match[3]),
  };
}

function calendarFieldsFor(item: Record<string, unknown>): Pick<
  OrbitAiCalendarActionPreview["wouldAdd"],
  "date" | "endTime" | "location" | "startTime" | "time" | "timeZone"
> | null {
  const displayTime = concreteTime(metadataValue(item, timeLabels));
  const startTime = concreteTime(metadataValue(item, startTimeLabels)) ?? displayTime;

  if (!displayTime || !startTime) {
    return null;
  }

  const startParts = calendarTimeParts(startTime);

  if (!startParts) {
    return {
      date: startTime,
      endTime: null,
      location: metadataValue(item, locationLabels),
      startTime,
      time: displayTime,
      timeZone: "Asia/Tokyo",
    };
  }

  const endParts = concreteTime(metadataValue(item, endTimeLabels));
  const parsedEnd = endParts ? calendarTimeParts(endParts) : null;

  return {
    date: startParts.date,
    endTime: parsedEnd?.time ?? null,
    location: metadataValue(item, locationLabels),
    startTime: startParts.time,
    time: displayTime,
    timeZone: startParts.timeZone,
  };
}

function relatedLinkFor(
  item: Record<string, unknown>,
): OrbitAiCalendarActionPreview["wouldAdd"]["relatedLink"] | null {
  const action = readArray(item.actions)
    .map((candidate) => (isRecord(candidate) ? candidate : null))
    .find((candidate) => {
      const href = candidate ? readString(candidate.href) : null;

      return Boolean(
        href &&
          (/^\/app\/contacts\//.test(href) || /^\/app\/events\//.test(href)),
      );
    });

  if (!action) return null;

  const href = readString(action.href);
  if (!href) return null;

  return {
    href,
    label: readString(action.label) ?? "Review source",
  };
}

function artifactSourceFor(artifact: Record<string, unknown>): string {
  const result = isRecord(artifact.result) ? artifact.result : {};
  const provenance = isRecord(result.provenance) ? result.provenance : {};

  return (
    readString(provenance.source) ??
    readString(isRecord(artifact.task) ? artifact.task.kind : null) ??
    ORBIT_AI_CALENDAR_ACTION_SOURCE
  );
}

function artifactIdFor(
  artifact: Record<string, unknown>,
  artifactIndex: number,
): string {
  const task = isRecord(artifact.task) ? artifact.task : {};
  const result = isRecord(artifact.result) ? artifact.result : {};

  return (
    readString(task.artifactId) ??
    readString(result.artifactId) ??
    `artifact:calendar-action:${artifactIndex + 1}`
  );
}

function artifactKindFor(artifact: Record<string, unknown>): string | null {
  const task = isRecord(artifact.task) ? artifact.task : {};
  const result = isRecord(artifact.result) ? artifact.result : {};

  return readString(task.kind) ?? readString(result.kind);
}

function evidenceIdsFor(
  artifact: Record<string, unknown>,
  item: Record<string, unknown>,
): readonly string[] {
  const result = isRecord(artifact.result) ? artifact.result : {};
  const provenance = isRecord(result.provenance) ? result.provenance : {};
  const evidenceIds = [
    ...readStringArray(item.evidenceIds),
    ...readStringArray(provenance.evidenceIds),
  ];

  return evidenceIds.length > 0
    ? Array.from(new Set(evidenceIds))
    : ["evidence:orbit-ai:calendar-action-preview"];
}

function previewForItem(input: {
  artifact: Record<string, unknown>;
  artifactIndex: number;
  item: Record<string, unknown>;
  itemIndex: number;
  locale: CalendarActionLocale;
}): OrbitAiCalendarActionPreview | null {
  const kind = artifactKindFor(input.artifact);

  if (!kind || !supportedKinds.has(kind)) {
    return null;
  }

  const title = readString(input.item.title);
  const calendarFields = calendarFieldsFor(input.item);
  const reason =
    readString(input.item.reason) ?? metadataValue(input.item, reasonLabels);
  const relatedLink = relatedLinkFor(input.item);

  if (!title || !calendarFields || !reason || !relatedLink) {
    return null;
  }

  const artifactId = artifactIdFor(input.artifact, input.artifactIndex);
  const itemId =
    readString(input.item.id) ??
    `${artifactId}:item:${input.itemIndex + 1}`;
  const sourceLabel =
    metadataValue(input.item, sourceLabels) ?? artifactSourceFor(input.artifact);
  const userSourceLabel = userFacingSourceLabel(sourceLabel, input.locale);

  return {
    actionId: `calendar:add-preview:${artifactId}:${itemId}`,
    artifactId,
    confirmationStatus: "unconfirmed",
    completionBoundary: noCompletionBoundary,
    itemId,
    label: "Preview add to calendar",
    localOnly: true,
    source: {
      artifactSource: artifactSourceFor(input.artifact),
      evidenceIds: evidenceIdsFor(input.artifact, input.item),
      label: userSourceLabel,
    },
    state: "staged_unconfirmed",
    sideEffects: noSideEffects,
    wouldAdd: {
      date: calendarFields.date,
      endTime: calendarFields.endTime,
      location: calendarFields.location,
      reason,
      relatedLink,
      startTime: calendarFields.startTime,
      time: calendarFields.time,
      timeZone: calendarFields.timeZone,
      title,
    },
  };
}

function previewsForArtifact(
  artifact: unknown,
  artifactIndex: number,
  locale: CalendarActionLocale,
): readonly OrbitAiCalendarActionPreview[] {
  if (!isRecord(artifact)) return [];

  const result = isRecord(artifact.result) ? artifact.result : {};
  const generatedView = isRecord(result.generatedView)
    ? result.generatedView
    : {};

  return readArray(generatedView.sections).flatMap((section, sectionIndex) => {
    if (!isRecord(section)) return [];

    return readArray(section.items)
      .map((item, itemIndex) =>
        isRecord(item)
          ? previewForItem({
              artifact,
              artifactIndex,
              item,
              itemIndex: sectionIndex * 100 + itemIndex,
              locale,
            })
          : null,
      )
      .filter(
        (preview): preview is OrbitAiCalendarActionPreview =>
          Boolean(preview),
      );
  });
}

export function createOrbitAiCalendarActionService(): OrbitAiCalendarActionService {
  return {
    cancelPreview(input): OrbitAiCalendarActionCancelResult {
      return {
        data: {
          actionId: input.actionId,
          sideEffects: noSideEffects,
          state: "cancelled",
        },
        success: true,
      };
    },

    createPreviews(input): OrbitAiCalendarActionPreviewResult {
      const locale = normalizeLocale(input.locale);

      return {
        data: {
          previews: readArray(input.conversation.artifacts).flatMap(
            (artifact, artifactIndex) =>
              previewsForArtifact(artifact, artifactIndex, locale),
          ),
          safety: noSideEffects,
        },
        success: true,
      };
    },

    stagePreview(input): OrbitAiCalendarActionStageResult {
      return {
        data: {
          ...input.preview,
          confirmationStatus: "unconfirmed",
          completionBoundary: noCompletionBoundary,
          localOnly: true,
          sideEffects: noSideEffects,
          state: "staged_unconfirmed",
        },
        success: true,
      };
    },
  };
}
