import { eventsToSummaries, type EventSummary } from "./events";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator } from "../i18n/messages";

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

function eventTitle(event: UnknownRecord, language: OrbitLanguage): string {
  const rawTitle = stringField(event, "title") || stringField(event, "name");
  const title = cleanText(rawTitle, "");
  const source = nestedRecord(event, "sourceMetadata");
  const sourceLabel = cleanText(stringField(source, "label"), "");

  if (sourceLabel && rawTitle && hasMixedLanguageTitle(rawTitle)) {
    return sourceLabel;
  }

  return title || sourceLabel || createTranslator(language)("admin.event.nameUnknown");
}

function eventLocation(event: UnknownRecord, language: OrbitLanguage): string {
  return cleanText(
    stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    createTranslator(language)("admin.event.placeUnknown")
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

function stateLabel(state: PlatformEventState, language: OrbitLanguage): string {
  const t = createTranslator(language);
  if (state === "active") {
    return t("admin.event.active");
  }

  if (state === "ended") {
    return t("admin.event.ended");
  }

  return t("admin.event.upcoming");
}

function formatDateTime(value: string, language: OrbitLanguage): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return value || createTranslator(language)("admin.event.dateUnknown");
  }

  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(parsed));
}

function detailForEvent(event: UnknownRecord, language: OrbitLanguage): string {
  const detail = cleanText(
    stringField(event, "relationshipValue") ||
      stringField(event, "description") ||
      stringField(event, "summary"),
    ""
  );

  return detail || createTranslator(language)("admin.event.detailUnknown");
}

function eventToReviewItem(
  event: UnknownRecord,
  now: number,
  language: OrbitLanguage,
  summary?: EventSummary
): PlatformReviewItemView {
  const id = stringField(event, "id", "event");
  const state = eventState(event, now);

  return {
    ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
    detail: detailForEvent(event, language),
    id,
    location: eventLocation(event, language),
    state,
    stateLabel: stateLabel(state, language),
    submitted: formatDateTime(stringField(event, "startsAt"), language),
    title: eventTitle(event, language)
  };
}

export function platformToView({
  events,
  language = "zh",
  now = new Date()
}: {
  events: unknown;
  language?: OrbitLanguage;
  now?: Date;
}): PlatformView {
  const t = createTranslator(language);
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
        language,
        summaryById.get(stringField(event, "id", "event"))
      )
    );
  const summary =
    reviewQueue.length > 0
      ? t("admin.platform.summaryCount", { count: reviewQueue.length })
      : t("admin.platform.summaryEmpty");

  return {
    boundary: t("admin.platform.boundary"),
    emptyReviewMessage: t("admin.platform.emptyMessage"),
    emptyReviewTitle: t("admin.platform.emptyTitle"),
    reviewQueue,
    stats: [
      {
        id: "events",
        label: t("admin.platform.catalogue"),
        note: t("admin.source.readOnly"),
        tone: "accent",
        value: String(rawEvents.length)
      }
    ],
    summary,
    title: t("admin.platform.title")
  };
}
