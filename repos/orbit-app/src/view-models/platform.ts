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
  href: `/events/${string}`;
  id: string;
  location: string;
  state: PlatformEventState;
  stateLabel: string;
  submitted: string;
  title: string;
}

export interface PlatformOrgAccountView {
  events: string;
  id: string;
  initial: string;
  name: string;
  owner: string;
  statusLabel: string;
}

export interface PlatformView {
  emptyReviewMessage: string;
  emptyReviewTitle: string;
  orgAccounts: PlatformOrgAccountView[];
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

function numberField(record: UnknownRecord, fieldName: string, fallback = 0) {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  return /\b(mock|fixture|provider|source-backed|generated|live-record|source:|evidence:|implementation|command-center|database|postgres)\b/iu.test(
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
  return cleanText(
    stringField(event, "relationshipValue") ||
      stringField(event, "nextAction") ||
      stringField(event, "description") ||
      stringField(event, "summary"),
    "确认活动信息、目标人群和主办方承接安排。"
  );
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
    href: `/events/${encodeURIComponent(id)}`,
    id,
    location: eventLocation(event),
    state,
    stateLabel: stateLabel(state),
    submitted: formatDateTime(stringField(event, "startsAt")),
    title: eventTitle(event)
  };
}

function profileRecord(data: unknown): UnknownRecord {
  if (!isRecord(data)) {
    return {};
  }

  const profile = data.profile;
  return isRecord(profile) ? profile : data;
}

function accountFromProfile(
  profile: UnknownRecord,
  eventCount: number
): PlatformOrgAccountView {
  const name = cleanText(
    stringField(profile, "company") || stringField(profile, "organization"),
    "Orbit"
  );
  const owner = cleanText(
    stringField(profile, "fullName") || stringField(profile, "name"),
    "平台负责人"
  );

  return {
    events: `${eventCount} 场活动`,
    id: name.toLowerCase().replace(/[^a-z0-9]+/giu, "-") || "orbit",
    initial: name.trim().slice(0, 1).toUpperCase() || "O",
    name,
    owner,
    statusLabel: "已认证"
  };
}

function relationshipAssetCount(dashboard: unknown): number {
  if (!isRecord(dashboard)) {
    return 0;
  }

  const totals = nestedRecord(dashboard, "relationshipAssetTotals");
  return numberField(totals, "contacts");
}

export function platformToView({
  dashboard,
  events,
  now = new Date(),
  profile
}: {
  dashboard?: unknown;
  events: unknown;
  now?: Date;
  profile?: unknown;
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
  const profileView = profileRecord(profile);
  const orgAccount = accountFromProfile(profileView, rawEvents.length);
  const upcomingCount = reviewQueue.filter((event) => event.state === "upcoming").length;
  const summary =
    upcomingCount > 0
      ? `整个平台当前有 ${upcomingCount} 场即将开始的公开活动，优先确认活动质量和主办方承接能力。`
      : "当前没有即将开始的公开活动，先保持主办方资料和历史活动清晰。";

  return {
    emptyReviewMessage: "有新的公开活动后，这里会显示需要优先复核的内容。",
    emptyReviewTitle: "暂无需要复核的活动",
    orgAccounts: [orgAccount],
    reviewQueue,
    stats: [
      {
        id: "organizers",
        label: "主办方账号",
        note: "已认证",
        tone: "accent",
        value: "1"
      },
      {
        id: "events",
        label: "累计活动",
        note: "公开记录",
        tone: "green",
        value: String(rawEvents.length)
      },
      {
        id: "review",
        label: "待复核",
        note: "活动质量",
        tone: "amber",
        value: String(reviewQueue.length)
      },
      {
        id: "relationships",
        label: "关系资产",
        note: "人脉覆盖",
        tone: "blue",
        value: String(relationshipAssetCount(dashboard))
      }
    ],
    summary,
    title: "平台总览"
  };
}
