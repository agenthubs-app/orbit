import { eventsToSummaries, type EventSummary } from "./events";

export type PlatformEventState = "active" | "ended" | "upcoming";

export interface PlatformStatView {
  id: string;
  label: string;
  note: string;
  tone: "accent" | "amber" | "blue" | "green";
  value: string;
}

export interface PlatformReviewItemView {
  coverPath?: string;
  detail: string;
  id: string;
  location: string;
  state: PlatformEventState;
  stateLabel: string;
  submitted: string;
  title: string;
}

export interface PlatformView {
  boundary: string;
  emptyReviewMessage: string;
  emptyReviewTitle: string;
  reviewQueue: PlatformReviewItemView[];
  stats: PlatformStatView[];
  summary: string;
  title: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function stringField(record: UnknownRecord, fieldName: string, fallback = "") {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listFromPayload(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) {
    return [];
  }

  const events = data.events;
  return Array.isArray(events) ? events.filter(isRecord) : [];
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|source-backed|storage-backed|generated|live-record|live-store|source:|evidence:|implementation|command-center|database|postgres)\b/iu.test(
    value
  );
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(value);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? value.trim();
}

function cleanText(value: string, fallback: string): string {
  const text = preferredChineseSegment(value);
  return text && !containsImplementationLabel(text) ? text : fallback;
}

function hasMixedLanguageTitle(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value) || /\s\/\s*[A-Za-z]/u.test(value);
}

function eventTitle(event: UnknownRecord): string {
  const rawTitle = stringField(event, "title") || stringField(event, "name");
  const title = cleanText(rawTitle, "");
  const source = nestedRecord(event, "sourceMetadata");
  const sourceLabel = cleanText(stringField(source, "label"), "");

  if (sourceLabel && rawTitle && hasMixedLanguageTitle(rawTitle)) {
    return sourceLabel;
  }

  return title || sourceLabel || "未命名活动";
}

function eventLocation(event: UnknownRecord): string {
  return cleanText(
    stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    "地点待定"
  );
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventState(event: UnknownRecord, now: number): PlatformEventState {
  const rawStatus = stringField(event, "status").toLowerCase();
  const startsAt = timestamp(stringField(event, "startsAt"));
  const endsAt = timestamp(stringField(event, "endsAt"));

  if (rawStatus === "cancelled" || rawStatus === "canceled" || rawStatus === "ended") {
    return "ended";
  }

  if (endsAt !== null && endsAt < now) {
    return "ended";
  }

  if (
    startsAt !== null &&
    endsAt !== null &&
    startsAt <= now &&
    now <= endsAt
  ) {
    return "active";
  }

  return "upcoming";
}

function stateLabel(state: PlatformEventState): string {
  if (state === "active") {
    return "进行中";
  }

  if (state === "ended") {
    return "已结束";
  }

  return "即将开始";
}

const enWeekdayToZh: Record<string, string> = {
  Fri: "周五",
  Mon: "周一",
  Sat: "周六",
  Sun: "周日",
  Thu: "周四",
  Tue: "周二",
  Wed: "周三"
};

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return value || "时间待定";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).formatToParts(new Date(parsed));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return `${partValue("month")}月${partValue("day")}日 ${
    enWeekdayToZh[partValue("weekday")] ?? ""
  } ${time}`.trim();
}

function detailForEvent(event: UnknownRecord): string {
  const detail = cleanText(
    stringField(event, "relationshipValue") ||
      stringField(event, "description") ||
      stringField(event, "summary") ||
      stringField(event, "nextAction"),
    ""
  );

  return segmentLooksChinese(detail)
    ? detail
    : "确认活动信息、目标人群和主办方承接安排。";
}

function eventToReviewItem(
  event: UnknownRecord,
  now: number,
  summary?: EventSummary
): PlatformReviewItemView {
  const id = stringField(event, "id", "event");
  const state = eventState(event, now);

  return {
    ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
    detail: detailForEvent(event),
    id,
    location: eventLocation(event),
    state,
    stateLabel: stateLabel(state),
    submitted: formatDateTime(stringField(event, "startsAt")),
    title: eventTitle(event)
  };
}

export function platformToView({
  events,
  now = new Date()
}: {
  events: unknown;
  now?: Date;
}): PlatformView {
  const rawEvents = listFromPayload(events);
  const nowTime = now.getTime();
  const summaryById = new Map(
    eventsToSummaries(events).map((event) => [event.id, event])
  );
  const reviewQueue = rawEvents
    .map((event) =>
      eventToReviewItem(
        event,
        nowTime,
        summaryById.get(stringField(event, "id", "event"))
      )
    )
    .filter((event) => event.state !== "ended")
    .slice(0, 8);
  const upcomingCount = reviewQueue.filter((event) => event.state === "upcoming").length;
  const activeCount = reviewQueue.filter((event) => event.state === "active").length;
  const endedCount = rawEvents.length - reviewQueue.length;
  const summary =
    reviewQueue.length > 0
      ? `公开目录中有 ${reviewQueue.length} 场尚未结束的活动；移动端仅核对来源和公开内容。`
      : "公开目录当前没有尚未结束的活动。";

  return {
    boundary:
      "当前数据来自公开活动目录；没有平台账号目录或具备身份校验的审核写接口。",
    emptyReviewMessage: "公开目录有新活动后，这里会展示来源和公开内容供核对。",
    emptyReviewTitle: "暂无近期公开活动",
    reviewQueue,
    stats: [
      {
        id: "events",
        label: "公开活动",
        note: "目录记录",
        tone: "accent",
        value: String(rawEvents.length)
      },
      {
        id: "upcoming",
        label: "即将开始",
        note: "近期活动",
        tone: "green",
        value: String(upcomingCount)
      },
      {
        id: "active",
        label: "进行中",
        note: "当前活动",
        tone: "amber",
        value: String(activeCount)
      },
      {
        id: "ended",
        label: "已结束",
        note: "目录历史",
        tone: "blue",
        value: String(endedCount)
      }
    ],
    summary,
    title: "平台总览"
  };
}
