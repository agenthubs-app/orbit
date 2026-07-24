export type OrganizerPublicEventState = "active" | "ended" | "upcoming";

export interface OrganizerPublicEventView {
  detailLine: string;
  href: `/events/${string}`;
  id: string;
  location: string;
  startsAt: string;
  state: OrganizerPublicEventState;
  title: string;
}

export interface OrganizerPublicView {
  actions: {
    href: `/events/${string}` | "/events";
    label: string;
  }[];
  emptyMessage: string;
  emptyTitle: string;
  events: OrganizerPublicEventView[];
  handle: string;
  initial: string;
  name: string;
  primaryEvent: OrganizerPublicEventView | null;
  stats: {
    active: string;
    ended: string;
    events: string;
    upcoming: string;
  };
  summary: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: UnknownRecord, fieldName: string, fallback = "") {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
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

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|source-backed|generated|live-record|source:|evidence:|implementation)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback: string): string {
  const text = preferredChineseSegment(value);
  return text && !containsImplementationLabel(text) ? text : fallback;
}

function hasMixedLanguageTitle(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value) || /\s\/\s*[A-Za-z]/u.test(value);
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, "").toLowerCase();
}

function matchesSlug(event: UnknownRecord, slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  const id = stringField(event, "id");
  const code = stringField(event, "code", id);

  return (
    id.toLowerCase() === normalized ||
    code.toLowerCase() === normalized ||
    compactId(id) === normalized ||
    compactId(code) === normalized
  );
}

function organizerName(event: UnknownRecord): string {
  const source = nestedRecord(event, "sourceMetadata");
  return userFacingText(
    stringField(source, "label") ||
      stringField(event, "organizer") ||
      stringField(event, "host"),
    "主办方"
  );
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventState(
  event: UnknownRecord,
  now: number
): OrganizerPublicEventState {
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

function eventTitle(event: UnknownRecord): string {
  const rawTitle = stringField(event, "title") || stringField(event, "name");
  const title = userFacingText(rawTitle, "");
  const source = nestedRecord(event, "sourceMetadata");
  const sourceLabel = userFacingText(stringField(source, "label"), "");

  if (sourceLabel && rawTitle && hasMixedLanguageTitle(rawTitle)) {
    return sourceLabel;
  }

  return title || sourceLabel || "活动";
}

function eventLocation(event: UnknownRecord): string {
  return userFacingText(
    stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    ""
  );
}

function eventToView(
  event: UnknownRecord,
  now: number
): OrganizerPublicEventView {
  const id = stringField(event, "id", "event");
  const startsAt = formatDateTime(stringField(event, "startsAt"));
  const location = eventLocation(event);

  return {
    detailLine: [startsAt, location].filter(Boolean).join(" · "),
    href: `/events/${encodeURIComponent(id)}`,
    id,
    location,
    startsAt,
    state: eventState(event, now),
    title: eventTitle(event)
  };
}

function stats(events: OrganizerPublicEventView[]): OrganizerPublicView["stats"] {
  return {
    active: String(events.filter((event) => event.state === "active").length),
    ended: String(events.filter((event) => event.state === "ended").length),
    events: String(events.length),
    upcoming: String(events.filter((event) => event.state === "upcoming").length)
  };
}

export function organizerPublicToView({
  events,
  now = new Date(),
  slug
}: {
  events: unknown;
  now?: Date;
  slug: string;
}): OrganizerPublicView {
  const rawEvents = listFromPayload(events);
  const selected = rawEvents.find((event) => matchesSlug(event, slug)) ?? rawEvents[0];

  if (!selected) {
    return {
      actions: [
        {
          href: "/events",
          label: "查看活动"
        }
      ],
      emptyMessage: "主办方公开页会在有活动后显示。",
      emptyTitle: "暂时没有公开活动",
      events: [],
      handle: "没有可展示的活动",
      initial: "主",
      name: "主办方",
      primaryEvent: null,
      stats: {
        active: "0",
        ended: "0",
        events: "0",
        upcoming: "0"
      },
      summary: "这里只展示已公开的活动，不会读取报名名单或后台数据。"
    };
  }

  const name = organizerName(selected);
  const organizerEvents = rawEvents
    .filter((event) => organizerName(event) === name)
    .map((event) => eventToView(event, now.getTime()));
  const publicEvents = organizerEvents.length
    ? organizerEvents
    : [eventToView(selected, now.getTime())];
  const primaryEvent =
    publicEvents.find((event) => event.id === stringField(selected, "id")) ??
    publicEvents[0] ??
    null;

  return {
    actions: primaryEvent
      ? [
          {
            href: primaryEvent.href,
            label: primaryEvent.state === "ended" ? "查看活动" : "查看并报名"
          },
          {
            href: "/events",
            label: "全部活动"
          }
        ]
      : [
          {
            href: "/events",
            label: "全部活动"
          }
        ],
    emptyMessage: "这个主办方暂时没有公开活动。",
    emptyTitle: "暂时没有公开活动",
    events: publicEvents,
    handle: `已记录 ${publicEvents.length} 场活动`,
    initial: name.slice(0, 1) || "主",
    name,
    primaryEvent,
    stats: stats(publicEvents),
    summary: "先看这个主办方最近的活动，再决定要不要报名或回看。"
  };
}
