import { eventsToSummaries, type EventSummary } from "./events";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator } from "../i18n/messages";

export type AdminSurface = "access" | "dashboard" | "events";
export type AdminEventState = "active" | "ended" | "upcoming";

export interface AdminLoginView {
  boundary: string;
  primaryHref: "/admin" | "/account/login?next=%2Fadmin";
  primaryLabel: string;
  summary: string;
  title: string;
}

export interface AdminStatView {
  id: string;
  label: string;
  note: string;
  value: string;
}

export interface AdminEventView {
  coverPath?: string;
  detail: string;
  href: `/events/${string}`;
  id: string;
  location: string;
  state: AdminEventState;
  stateLabel: string;
  startsAt: string;
  title: string;
}

export interface AdminMemberView {
  email: string;
  id: string;
  initial: string;
  name: string;
  role: string;
}

export interface AdminView {
  activeTab: AdminSurface;
  boundary: string;
  emptyEventMessage: string;
  emptyEventTitle: string;
  events: AdminEventView[];
  members: AdminMemberView[];
  nav: {
    href: "/admin" | "/admin/access" | "/admin/events";
    id: AdminSurface;
    label: string;
  }[];
  org: {
    initial: string;
    name: string;
    owner: string;
  };
  stats: AdminStatView[];
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
  return /\b(mock|fixture|provider|source-backed|storage-backed|generated|live-record|live-store|source:|evidence:|implementation|command-center|database|postgres|hybrid)\b/iu.test(
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
  const t = createTranslator(language);
  const rawTitle = stringField(event, "title") || stringField(event, "name");
  const title = cleanText(rawTitle, "");
  const source = nestedRecord(event, "sourceMetadata");
  const sourceLabel = cleanText(stringField(source, "label"), "");

  if (sourceLabel && rawTitle && hasMixedLanguageTitle(rawTitle)) {
    return sourceLabel;
  }

  return title || sourceLabel || t("admin.event.nameUnknown");
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventState(event: UnknownRecord, now: number): AdminEventState {
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

function stateLabel(state: AdminEventState, language: OrbitLanguage): string {
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

function eventLocation(event: UnknownRecord, language: OrbitLanguage): string {
  return cleanText(
    stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    createTranslator(language)("admin.event.placeUnknown")
  );
}

function eventDetail(event: UnknownRecord, language: OrbitLanguage): string {
  return cleanText(
    stringField(event, "relationshipValue") ||
      stringField(event, "nextAction") ||
      stringField(event, "description") ||
      stringField(event, "summary"),
    createTranslator(language)("admin.event.detailUnknown")
  );
}

function eventToView(
  event: UnknownRecord,
  now: number,
  language: OrbitLanguage,
  summary?: EventSummary
): AdminEventView {
  const id = stringField(event, "id", "event");
  const state = eventState(event, now);

  return {
    ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
    detail: eventDetail(event, language),
    href: `/events/${encodeURIComponent(id)}`,
    id,
    location: eventLocation(event, language),
    state,
    stateLabel: stateLabel(state, language),
    startsAt: formatDateTime(stringField(event, "startsAt"), language),
    title: eventTitle(event, language)
  };
}

function profileRecord(data: unknown): UnknownRecord {
  if (!isRecord(data)) {
    return {};
  }

  const profile = data.profile;
  return isRecord(profile) ? profile : data;
}

function titleForSurface(surface: AdminSurface, language: OrbitLanguage): string {
  const t = createTranslator(language);
  if (surface === "events") {
    return t("admin.events.title");
  }

  if (surface === "access") {
    return t("admin.access.title");
  }

  return t("admin.dashboard.title");
}

export function adminLoginToView({
  signedIn = false,
  language = "zh",
}: {
  signedIn?: boolean;
  language?: OrbitLanguage;
} = {}): AdminLoginView {
  const t = createTranslator(language);
  return {
    boundary: t("admin.login.boundary"),
    primaryHref: signedIn ? "/admin" : "/account/login?next=%2Fadmin",
    primaryLabel: signedIn ? t("admin.login.open") : t("admin.login.signIn"),
    summary: signedIn ? t("admin.login.summaryIn") : t("admin.login.summaryOut"),
    title: t("admin.login.title")
  };
}

export function adminToView({
  dashboard,
  events,
  language = "zh",
  now = new Date(),
  profile,
  surface = "dashboard"
}: {
  dashboard?: unknown;
  events: unknown;
  language?: OrbitLanguage;
  now?: Date;
  profile?: unknown;
  surface?: AdminSurface;
}): AdminView {
  const t = createTranslator(language);
  const rawEvents = listFromPayload(events);
  const nowTime = now.getTime();
  const summaryById = new Map(
    eventsToSummaries(events).map((event) => [event.id, event])
  );
  const eventViews = rawEvents.map((event) =>
    eventToView(
      event,
      nowTime,
      language,
      summaryById.get(stringField(event, "id", "event"))
    )
  );
  const profileView = profileRecord(profile);
  const orgName = cleanText(
    stringField(profileView, "company") ||
      stringField(profileView, "organization"),
    "Orbit"
  );
  const owner = cleanText(
    stringField(profileView, "fullName") || stringField(profileView, "name"),
    t("admin.profile.ownerUnknown")
  );
  const role = cleanText(stringField(profileView, "title"), t("admin.profile.roleUnknown"));
  const ownerEmail = stringField(profileView, "email");
  const activeCount = eventViews.filter((event) => event.state === "active").length;
  const upcomingCount = eventViews.filter((event) => event.state === "upcoming").length;
  const endedCount = eventViews.filter((event) => event.state === "ended").length;

  return {
    activeTab: surface,
    boundary: t("admin.source.boundary"),
    emptyEventMessage: t("admin.event.emptyMessage"),
    emptyEventTitle: t("admin.event.emptyTitle"),
    events: eventViews,
    members: ownerEmail
      ? [
          {
            email: ownerEmail,
            id: "workspace-owner",
            initial: owner.trim().slice(0, 1).toUpperCase() || "O",
            name: owner,
            role
          }
        ]
      : [],
    nav: [
      {
        href: "/admin",
        id: "dashboard",
        label: t("admin.nav.dashboard")
      },
      {
        href: "/admin/events",
        id: "events",
        label: t("admin.nav.events")
      }
    ],
    org: {
      initial: orgName.trim().slice(0, 1).toUpperCase() || "O",
      name: orgName,
      owner
    },
    stats: [
      {
        id: "events",
        label: t("admin.event.count"),
        note: t("admin.event.all"),
        value: String(eventViews.length)
      },
      {
        id: "active",
        label: t("admin.event.active"),
        note: t("admin.source.readOnly"),
        value: String(activeCount)
      },
      {
        id: "upcoming",
        label: t("admin.event.upcoming"),
        note: t("admin.source.readOnly"),
        value: String(upcomingCount)
      },
      {
        id: "ended",
        label: t("admin.event.ended"),
        note: t("admin.source.readOnly"),
        value: String(endedCount)
      }
    ],
    summary: eventViews.length > 0
      ? t("admin.source.summaryCount", { count: eventViews.length })
      : t("admin.source.summaryEmpty"),
    title: titleForSurface(surface, language)
  };
}
