import type { EventRecordContract } from "../api/contract/events";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";
import { currentOrbitLanguage } from "../i18n/locale-core";
export interface EventSummary {
  actionLabel: string;
  coverPath: string;
  id: string;
  location: string;
  participantCountLabel: string;
  startsAt: string;
  status: string;
  subtitle: string;
  topics: string[];
  title: string;
}

export type EventDiscoveryStatusFilter = "active" | "all" | "ended" | "upcoming";

export interface EventDiscoveryFilters {
  query?: string;
  status?: EventDiscoveryStatusFilter;
  topic?: string;
}

export function eventDiscoveryState(
  event: EventSummary
): Exclude<EventDiscoveryStatusFilter, "all"> {
  // Labels come from statusLabel / eventActionLabel in whichever language built the summary.
  if (/已结束|已取消|取消|结束|終了|中止|キャンセル|ended|cancelled|canceled|past/iu.test(event.status)) {
    return "ended";
  }

  if (VIEW_ACTION_LABELS.has(event.actionLabel)) {
    return "ended";
  }

  if (/进行中|active|live/iu.test(event.status)) {
    return "active";
  }

  return "upcoming";
}

const VIEW_ACTION_LABELS = new Set(
  (["zh", "ja", "en"] as const).map((language) => createTranslator(language)("events.vm.view"))
);

function localeTag(language: OrbitLanguage): string {
  return language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
}

export function eventDiscoveryFilterCounts(
  events: EventSummary[]
): Record<EventDiscoveryStatusFilter, number> {
  return {
    active: events.filter((event) => eventDiscoveryState(event) === "active").length,
    all: events.length,
    ended: events.filter((event) => eventDiscoveryState(event) === "ended").length,
    upcoming: events.filter((event) => eventDiscoveryState(event) === "upcoming")
      .length
  };
}

export function eventDiscoveryTopics(events: EventSummary[]): string[] {
  return uniqueStrings(events.flatMap((event) => event.topics));
}

function eventDiscoverySearchText(event: EventSummary): string {
  return [
    event.title,
    event.subtitle,
    event.startsAt,
    event.location,
    event.status,
    event.participantCountLabel,
    event.actionLabel,
    ...event.topics
  ]
    .join(" ")
    .toLowerCase();
}

export function filterEventSummaries<T extends EventSummary>(
  events: T[],
  filters: EventDiscoveryFilters = {}
): T[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const status = filters.status ?? "all";
  const topic = filters.topic?.trim() ?? "";

  return events.filter((event) => {
    const matchesQuery =
      !query || eventDiscoverySearchText(event).includes(query);
    const matchesStatus =
      status === "all" || eventDiscoveryState(event) === status;
    const matchesTopic = !topic || event.topics.includes(topic);

    return matchesQuery && matchesStatus && matchesTopic;
  });
}

export interface EventDetailSummary extends EventSummary {
  aboutSections: EventDetailAboutSectionView[];
  address: string;
  agenda: EventDetailAgendaItemView[];
  attendeeCountLabel: string;
  attendeePreview: EventDetailAttendeePreviewView[];
  description: string;
  evidenceExcerpts: string[];
  feeLabel: string;
  nextAction: string;
  organizerName: string;
  preparation: string;
  registrationActionLabel: string;
  registrationDetail: string;
  relationshipContext: string;
  sourceLabel: string;
  venueDetail: string;
}

export interface EventDetailHeroView {
  coverPath: string;
  detailLine: string;
  status: string;
  summary: string;
  title: string;
}

export interface EventDetailAboutSectionView {
  body: string;
  iconName: string;
  id: string;
  title: string;
}

export interface EventDetailAgendaItemView {
  description: string;
  id: string;
  time: string;
  title: string;
}

export interface EventDetailAttendeePreviewView {
  id: string;
  initial: string;
  name: string;
  role: string;
}

export interface EventReadinessChecklistView {
  detail: string;
  id: string;
  ownerLabel: string;
  statusLabel: string;
  title: string;
}

export interface EventGoalSuggestionView {
  detail: string;
  goalText: string;
  id: string;
  selected: boolean;
  title: string;
}

export interface EventReadinessView {
  canConfirmGoal: boolean;
  checklist: EventReadinessChecklistView[];
  goal: string;
  nextAction: string;
  scoreLabel: string;
  selectedSuggestionId: string;
  stateLabel: string;
  suggestedGoals: EventGoalSuggestionView[];
}

export interface EventGoalRequest {
  goalText: string;
  selectedSuggestionId?: string;
}

export interface EventGoalDraftInput {
  goalText?: string | null;
  selectedSuggestionId?: string | null;
}

export interface EventRecommendedPersonView {
  attendeeId: string;
  id: string;
  name: string;
  opener: string;
  organizationRole: string;
  rankLabel: string;
  reason: string;
  scoreLabel: string;
  suggestedAction: string;
}

export interface EventRecommendationsView {
  nextAction: string;
  people: EventRecommendedPersonView[];
  title: string;
}

export interface EventValueRecommendationCardView {
  action: string;
  detail: string;
  id: string;
  reason: string;
  scoreBandLabel: string;
  scoreLabel: string;
  title: string;
}

export interface EventValueRecommendationsView {
  emptyText: string;
  nextAction: string;
  profileLine: string;
  recommendations: EventValueRecommendationCardView[];
  title: string;
}

export interface EventValueRecommendationAcceptanceView {
  detail: string;
  eventId: string;
  nextAction: string;
  safetyLabel: string;
  scoreLabel: string;
  title: string;
}

export interface EventOpeningLineView {
  opener: string;
  statusLabel: string;
}

export interface EventPostEventContactView {
  followUpDraft: string;
  headline: string;
  id: string;
  name: string;
  organizationRole: string;
  tags: string[];
  urgencyLabel: string;
  whyNow: string;
}

export interface EventPostEventReviewView {
  contactCountLabel: string;
  contacts: EventPostEventContactView[];
  nextAction: string;
  stateLabel: string;
  title: string;
}

export interface EventPostEventConfirmRequest {
  contactDraftIds: string[];
}

export interface EventPostEventConfirmView {
  confirmedCountLabel: string;
  feedback: string;
  nextAction: string;
  /** R12: the draft queue (確認待ちの下書き), with the event when it is known (参加者から取り込む). */
  reviewQueueHref: "/contacts/new/drafts" | `/contacts/new/drafts?eventId=${string}`;
  reviewQueueLabel: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

// 字段名受跨端契约约束：服务端改名，这里立刻编译报错。
// 契约之外的兼容字段（name、location、coverUrl 等老 payload 形状）继续走 stringField。
function eventField(
  record: Record<string, unknown>,
  fieldName: keyof EventRecordContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function optionalNumberField(
  record: Record<string, unknown>,
  fieldName: string
): number | null {
  const value = record[fieldName];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordField(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];

  return isRecord(value) ? value : {};
}

function arrayField(
  record: Record<string, unknown>,
  fieldName: string
): unknown[] {
  const value = record[fieldName];

  return Array.isArray(value) ? value : [];
}

function nestedStringField(
  record: Record<string, unknown>,
  parentField: string,
  fieldName: string
): string {
  const parent = record[parentField];
  return isRecord(parent) ? stringField(parent, fieldName) : "";
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

function cleanEventDisplayText(value: string): string {
  return value
    .replace(/报名测试会/gu, "交流会")
    .replace(
      /用于测试新参与者通过报名表填写兴趣、可提供价值和希望介绍对象的未开始活动。?/gu,
      "通过报名表确认兴趣、可提供的资源和希望介绍的人。"
    )
    .trim();
}

function containsImplementationLabel(value: string): boolean {
  return /\b(source-backed|storage-backed|live-store|generated|fixture|fixtures|provider|profile_orbit|source:|evidence:|live storage)\b/i.test(
    value
  );
}

function userFacingText(value: string, fallback: string): string {
  const chinese = preferredChineseSegment(value);

  if (!chinese || containsImplementationLabel(chinese)) {
    return fallback;
  }

  return cleanEventDisplayText(chinese);
}

function chineseDisplayText(value: string, fallback: string): string {
  const chinese = preferredChineseSegment(value);

  if (
    !chinese ||
    !segmentLooksChinese(chinese) ||
    containsImplementationLabel(chinese)
  ) {
    return fallback;
  }

  return cleanEventDisplayText(chinese);
}

function eventTitle(event: Record<string, unknown>, t: OrbitTranslator): string {
  const rawTitle = eventField(event, "title") || stringField(event, "name");
  const preferredTitle = cleanEventDisplayText(preferredChineseSegment(rawTitle));

  if (preferredTitle && segmentLooksChinese(preferredTitle)) {
    return preferredTitle;
  }

  const sourceLabel = nestedStringField(event, "sourceMetadata", "label");
  return (
    cleanEventDisplayText(preferredChineseSegment(sourceLabel)) ||
    preferredTitle ||
    t("events.vm.fallbackTitle")
  );
}

// Cover artwork comes from the event record (`coverPath`, written by the seed and
// the event-display backfill). The App keeps only a neutral placeholder for
// events that genuinely have no artwork yet — no id lookup table, no guessing
// a cover from words in the title.
const EVENT_COVER_PLACEHOLDER = "/orbit-covers/meeting.jpg";

function eventCoverPath(event: Record<string, unknown>): string {
  return (
    stringField(event, "coverPath") ||
    stringField(event, "coverUrl") ||
    stringField(event, "imageUrl") ||
    nestedStringField(event, "sourceMetadata", "coverPath") ||
    nestedStringField(event, "sourceMetadata", "coverUrl") ||
    EVENT_COVER_PLACEHOLDER
  );
}

function formatDateTime(
  value: string,
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = currentOrbitLanguage()
): string {
  const t = createTranslator(language);
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value || t("events.vm.timePending");
  }

  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekday = new Intl.DateTimeFormat(localeTag(language), { timeZone, weekday: "short" }).format(date);
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return t("events.vm.dateTime", {
    day: partValue("day"),
    month: partValue("month"),
    time,
    weekday
  }).trim();
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function statusLabel(value: string, t: OrbitTranslator): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "cancelled" || normalized === "canceled") {
    return t("events.vm.statusCancelled");
  }

  if (normalized === "completed" || normalized === "ended") {
    return t("events.vm.statusEnded");
  }

  if (normalized === "confirmed" || normalized === "scheduled") {
    return t("events.vm.statusConfirmed");
  }

  return value || t("events.vm.statusPending");
}

function sourceLabel(event: Record<string, unknown>): string {
  return cleanEventDisplayText(
    preferredChineseSegment(nestedStringField(event, "sourceMetadata", "label"))
  );
}

function evidenceExcerpts(event: Record<string, unknown>): string[] {
  return uniqueStrings(
    listFromPayload(event, "evidence")
      .filter(isRecord)
      .map((evidence) => preferredChineseSegment(stringField(evidence, "excerpt")))
      .filter((excerpt) => excerpt && !containsImplementationLabel(excerpt))
  ).slice(0, 3);
}

function aboutIconName(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("user") || normalized.includes("people")) {
    return "people-outline";
  }

  if (normalized.includes("network") || normalized.includes("relationship")) {
    return "git-network-outline";
  }

  if (normalized.includes("flag") || normalized.includes("preparation")) {
    return "flag-outline";
  }

  if (normalized.includes("map") || normalized.includes("location")) {
    return "map-outline";
  }

  return "information-circle-outline";
}

function eventAboutSections(
  event: Record<string, unknown>,
  input: {
    description: string;
    preparation: string;
    relationshipContext: string;
  },
  t: OrbitTranslator
): EventDetailAboutSectionView[] {
  const explicitSections = arrayField(event, "about")
    .filter(isRecord)
    .map((section, index) => {
      const title =
        userFacingText(stringField(section, "label"), "") || t("events.vm.aboutSection", { number: index + 1 });
      const body = userFacingText(stringField(section, "body"), "");

      return {
        body,
        iconName: aboutIconName(stringField(section, "icon")),
        id: title,
        title
      };
    })
    .filter((section) => section.body);

  if (explicitSections.length > 0) {
    return explicitSections;
  }

  return [
    {
      body: input.description,
      iconName: "information-circle-outline",
      id: "overview",
      title: t("events.vm.aboutOverview")
    },
    {
      body: input.relationshipContext,
      iconName: "git-network-outline",
      id: "relationship",
      title: t("events.vm.aboutRelationship")
    },
    {
      body: input.preparation,
      iconName: "flag-outline",
      id: "preparation",
      title: t("events.vm.aboutPreparation")
    }
  ].filter((section) => section.body);
}

function eventAgenda(
  event: Record<string, unknown>,
  input: {
    location: string;
    startsAt: string;
  },
  t: OrbitTranslator
): EventDetailAgendaItemView[] {
  const explicitAgenda = arrayField(event, "agenda")
    .filter(isRecord)
    .map((item, index) => {
      const time = stringField(item, "time");
      const title =
        userFacingText(stringField(item, "label"), "") ||
        userFacingText(stringField(item, "title"), "") ||
        t("events.vm.agendaItem", { number: index + 1 });
      const description = userFacingText(stringField(item, "description"), "");

      return {
        description,
        id: `${time || index}-${title}`,
        time,
        title
      };
    })
    .filter((item) => item.title);

  if (explicitAgenda.length > 0) {
    return explicitAgenda;
  }

  if (!input.startsAt || input.startsAt === t("events.vm.timePending")) {
    return [];
  }

  return [
    {
      description: input.location,
      id: "start",
      time: input.startsAt,
      title: t("events.vm.agendaStart")
    }
  ];
}

function attendeePreview(
  event: Record<string, unknown>,
  t: OrbitTranslator
): EventDetailAttendeePreviewView[] {
  const stats = recordField(event, "stats");

  return arrayField(stats, "attendees")
    .filter(isRecord)
    .map((attendee, index) => {
      const name = stringField(attendee, "name", t("events.vm.attendeeFallback", { number: index + 1 }));

      return {
        id: `${name}-${index}`,
        initial: stringField(attendee, "initial") || name.slice(0, 1),
        name,
        role: stringField(attendee, "role")
      };
    })
    .slice(0, 4);
}

function attendeeCountLabel(
  event: Record<string, unknown>,
  attendees: EventDetailAttendeePreviewView[],
  t: OrbitTranslator
): string {
  const stats = recordField(event, "stats");
  const count =
    optionalNumberField(stats, "count") ??
    optionalNumberField(event, "participantCount") ??
    attendees.length;

  return count > 0 ? t("events.vm.attendeeCount", { count }) : t("events.vm.attendeesPending");
}

function eventParticipantCountLabel(event: Record<string, unknown>, t: OrbitTranslator): string {
  const stats = recordField(event, "stats");
  const count =
    optionalNumberField(stats, "count") ??
    optionalNumberField(event, "participantCount");

  return count !== null ? t("events.vm.registeredCount", { count }) : t("events.vm.registeredPending");
}

/** A placeholder organizer label (「Organizer #1Q8PXWU」) is an internal id, never shown. */
function publicHostText(value: string): string {
  return /^Organizer #[0-9A-Z]+$/u.test(value.trim()) ? "" : value;
}

function eventSubtitle(event: Record<string, unknown>): string {
  return uniqueStrings([
    userFacingText(stringField(event, "theme"), ""),
    publicHostText(userFacingText(stringField(event, "host"), "")) ||
      publicHostText(userFacingText(stringField(event, "organizer"), ""))
  ]).join(" · ");
}

function stringListField(
  record: Record<string, unknown>,
  fieldName: string
): string[] {
  return arrayField(record, fieldName).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function eventTopics(event: Record<string, unknown>): string[] {
  return uniqueStrings([
    userFacingText(stringField(event, "industry"), ""),
    userFacingText(stringField(event, "theme"), ""),
    ...stringListField(event, "tags").map((tag) => userFacingText(tag, ""))
  ]);
}

function eventActionLabel(rawStatus: string, t: OrbitTranslator): string {
  const normalized = rawStatus.trim().toLowerCase();

  return normalized === "ended" ||
    normalized === "completed" ||
    normalized === "cancelled" ||
    normalized === "canceled"
    ? t("events.vm.view")
    : t("events.vm.register");
}

function eventVenueDetail(location: string, address: string, t: OrbitTranslator): string {
  return uniqueStrings([location, address]).join(" · ") || t("events.vm.venuePending");
}

function eventRegistrationActionLabel(rawStatus: string, youRsvped: boolean, t: OrbitTranslator): string {
  const status = rawStatus.trim().toLowerCase();

  if (status === "ended" || status === "completed" || status === "cancelled") {
    return t("events.vm.viewEvent");
  }

  return youRsvped ? t("events.vm.manageRegistration") : t("events.vm.registerAction");
}

function eventRegistrationDetail(youRsvped: boolean, t: OrbitTranslator): string {
  return youRsvped
    ? t("events.vm.registeredDetail")
    : t("events.vm.registerDetail");
}

export function eventsToSummaries(
  data: unknown,
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = currentOrbitLanguage()
): EventSummary[] {
  const t = createTranslator(language);
  return listFromPayload(data, "events")
    .filter(isRecord)
    .map((event) => {
      const title = eventTitle(event, t);
      const rawStatus = eventField(event, "status", "scheduled");

      return {
        actionLabel: eventActionLabel(rawStatus, t),
        coverPath: eventCoverPath(event),
        id: eventField(event, "id", "event"),
        location:
          eventField(event, "venue") ||
          stringField(event, "location") ||
          stringField(event, "locationLabel"),
        participantCountLabel: eventParticipantCountLabel(event, t),
        startsAt: formatDateTime(eventField(event, "startsAt"), timeZone, language),
        status: statusLabel(rawStatus, t),
        subtitle: eventSubtitle(event),
        topics: eventTopics(event),
        title
      };
    });
}

export function eventDetailHeroToView(
  event: EventDetailSummary
): EventDetailHeroView {
  return {
    coverPath: event.coverPath,
    detailLine: [event.startsAt, event.location].filter(Boolean).join(" · "),
    status: event.status,
    summary: event.description || event.relationshipContext || event.status,
    title: event.title
  };
}

function eventRecordFromPayload(data: unknown): Record<string, unknown> | null {
  if (isRecord(data) && isRecord(data.event)) {
    return data.event;
  }

  return isRecord(data) ? data : null;
}

export function eventDetailToSummary(
  data: unknown,
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = currentOrbitLanguage()
): EventDetailSummary {
  const t = createTranslator(language);
  const event = eventRecordFromPayload(data);

  if (!event) {
    return {
      actionLabel: t("events.vm.register"),
      aboutSections: [],
      address: "",
      agenda: [],
      attendeeCountLabel: t("events.vm.attendeesPending"),
      attendeePreview: [],
      coverPath: "/orbit-covers/meeting.jpg",
      description: "",
      evidenceExcerpts: [],
      feeLabel: t("events.vm.feeOnSite"),
      id: "event",
      location: "",
      nextAction: t("events.vm.nextActionInfo"),
      organizerName: t("events.vm.organizerPending"),
      participantCountLabel: t("events.vm.registeredPending"),
      preparation: t("events.vm.preparationDefault"),
      registrationActionLabel: t("events.vm.registerAction"),
      registrationDetail: t("events.vm.registerDetail"),
      relationshipContext: t("events.vm.relationshipPending"),
      sourceLabel: "",
      startsAt: t("events.vm.timePending"),
      status: "scheduled",
      subtitle: "",
      title: t("events.vm.fallbackTitle"),
      topics: [],
      venueDetail: t("events.vm.venuePending")
    };
  }

  const title = eventTitle(event, t);
  const rawStatus = eventField(event, "status", "scheduled");
  const location =
    eventField(event, "venue") ||
    stringField(event, "location") ||
    stringField(event, "locationLabel");
  const startsAt = formatDateTime(eventField(event, "startsAt"), timeZone, language);
  const description = userFacingText(eventField(event, "description"), "");
  const nextAction = userFacingText(
    eventField(event, "nextAction"),
    t("events.vm.nextActionRegistration")
  );
  const preparation = userFacingText(
    eventField(event, "recommendedPreparation"),
    t("events.vm.preparationDefault")
  );
  const relationshipContext = userFacingText(
    eventField(event, "relationshipContext"),
    t("events.vm.relationshipPending")
  );
  const stats = recordField(event, "stats");
  const youRsvped = Boolean(stats.youRsvped);
  const source = sourceLabel(event);
  const address = stringField(event, "address");
  const attendees = attendeePreview(event, t);

  return {
    actionLabel: eventActionLabel(rawStatus, t),
    aboutSections: eventAboutSections(event, {
      description,
      preparation,
      relationshipContext
    }, t),
    address,
    agenda: eventAgenda(event, { location, startsAt }, t),
    attendeeCountLabel: attendeeCountLabel(event, attendees, t),
    attendeePreview: attendees,
    coverPath: eventCoverPath(event),
    description,
    evidenceExcerpts: evidenceExcerpts(event),
    feeLabel: userFacingText(stringField(event, "feeLabel"), t("events.vm.feeOnSite")),
    id: eventField(event, "id", "event"),
    location,
    nextAction,
    organizerName:
      publicHostText(userFacingText(stringField(event, "organizer"), "")) ||
      publicHostText(userFacingText(stringField(event, "host"), "")) ||
      t("events.vm.organizerPending"),
    participantCountLabel: eventParticipantCountLabel(event, t),
    preparation,
    registrationActionLabel: eventRegistrationActionLabel(rawStatus, youRsvped, t),
    registrationDetail: eventRegistrationDetail(youRsvped, t),
    relationshipContext,
    sourceLabel: source,
    startsAt,
    status: statusLabel(rawStatus, t),
    subtitle: eventSubtitle(event),
    title,
    topics: eventTopics(event),
    venueDetail: eventVenueDetail(location, address, t)
  };
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function readinessStatusLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "ready") {
    return "已准备";
  }

  if (normalized === "blocked") {
    return "有阻塞";
  }

  return "待确认";
}

function readinessOwnerLabel(value: string): string {
  return value.trim().toLowerCase() === "orbit" ? "Orbit 处理" : "我来确认";
}

function readinessStateLabel(score: number): string {
  if (score >= 80) {
    return "已准备";
  }

  if (score >= 50) {
    return "准备中";
  }

  return "需要补齐";
}

function readinessChecklistTitle(value: string): string {
  const fallbackByLabel: Record<string, string> = {
    "calendar conflict checked locally": "确认日程没有冲突",
    "event goal selected": "确认这场活动的目标",
    "follow-up owner confirmed": "确认会后联系负责人",
    "relationship brief reviewed": "已看过重点关系背景"
  };
  const normalized = value.trim().toLowerCase();

  return chineseDisplayText(value, fallbackByLabel[normalized] ?? "确认会前准备项");
}

function readinessChecklistDetail(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "ready") {
    return "准备项已完成。";
  }

  if (normalized === "blocked") {
    return "这里还有阻塞，先处理再入场。";
  }

  return "需要会前再确认。";
}

function readinessSuggestedGoals(
  record: Record<string, unknown>,
  selectedSuggestionId: string
): EventGoalSuggestionView[] {
  return listFromPayload(record.suggestedGoals, "suggestedGoals")
    .filter(isRecord)
    .map((goal) => {
      const goalText = chineseDisplayText(stringField(goal, "intent"), "");
      const title =
        chineseDisplayText(stringField(goal, "label"), "") || goalText;
      const detail = chineseDisplayText(stringField(goal, "rationale"), "");
      const id = stringField(goal, "goalId");

      return {
        detail,
        goalText,
        id,
        selected: Boolean(id) && id === selectedSuggestionId,
        title
      };
    })
    .filter((goal) => goal.id && goal.goalText && goal.title)
    .slice(0, 3);
}

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> | null {
  const value = record[fieldName];
  return isRecord(value) ? value : null;
}

function numberField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function eventReadinessToView(data: unknown): EventReadinessView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const preparationState = nestedRecord(record, "preparationState") ?? {};
  const goal = nestedRecord(record, "goal");
  const goalIntent = goal ? stringField(goal, "intent") : "";
  const selectedSuggestionId = goal
    ? stringField(goal, "selectedSuggestionId")
    : "";
  const confirmableGoal = chineseDisplayText(goalIntent, "");
  const score = Math.max(
    0,
    Math.min(100, Math.round(numberField(preparationState, "readinessScore")))
  );
  const checklist = listFromPayload(record.readinessChecklist, "readinessChecklist")
    .filter(isRecord)
    .slice(0, 4)
    .map((item, index) => {
      const status = stringField(item, "status", "pending");

      return {
        detail: chineseDisplayText(
          stringField(item, "rationale"),
          readinessChecklistDetail(status)
        ),
        id: stringField(item, "itemId", `readiness-${index}`),
        ownerLabel: readinessOwnerLabel(stringField(item, "owner")),
        statusLabel: readinessStatusLabel(status),
        title: readinessChecklistTitle(stringField(item, "label"))
      };
    });

  return {
    canConfirmGoal: Boolean(confirmableGoal),
    checklist,
    goal:
      confirmableGoal ||
      "先明确这场活动最想认识的人和可以主动提供的资源。",
    nextAction: chineseDisplayText(
      stringField(preparationState, "nextPreparationStep") ||
        stringField(record, "nextAction"),
      "先确认会后联系负责人，再带着目标入场。"
    ),
    scoreLabel: `${score}%`,
    selectedSuggestionId,
    stateLabel: readinessStateLabel(score),
    suggestedGoals: readinessSuggestedGoals(record, selectedSuggestionId)
  };
}

export function eventGoalRequestFromReadiness(
  readiness: EventReadinessView,
  input: EventGoalDraftInput = {}
): EventGoalRequest | null {
  const hasInputGoal = input.goalText !== undefined && input.goalText !== null;
  const goalText = (hasInputGoal ? input.goalText ?? "" : readiness.goal).trim();

  if ((!hasInputGoal && !readiness.canConfirmGoal) || !goalText) {
    return null;
  }

  const selectedSuggestionId = (
    input.selectedSuggestionId ||
    readiness.selectedSuggestionId
  ).trim();

  return selectedSuggestionId ? { goalText, selectedSuggestionId } : { goalText };
}

function scoreLabel(value: number): string {
  const score = Math.max(0, Math.min(100, Math.round(value)));
  return `${score}%`;
}

function recommendationReason(values: unknown): string {
  if (!Array.isArray(values)) {
    return "对方背景和这场活动目标匹配。";
  }

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const text = chineseDisplayText(value, "");
    if (text) {
      return text;
    }
  }

  return "对方背景和这场活动目标匹配。";
}

function recommendationAction(value: string): string {
  return chineseDisplayText(
    value,
    "现场先约 10 分钟，确认是否适合后续引荐。"
  );
}

function organizationRole(
  attendee: Record<string, unknown>
): string {
  return [stringField(attendee, "organization"), stringField(attendee, "role")]
    .filter(Boolean)
    .join(" · ");
}

export function eventRecommendationsToView(
  data: unknown
): EventRecommendationsView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const recommendations = listFromPayload(record.recommendations, "recommendations")
    .filter(isRecord)
    .slice(0, 3)
    .map((recommendation, index) => {
      const attendee = nestedRecord(recommendation, "attendee") ?? {};
      const openingLine = nestedRecord(recommendation, "openingLine") ?? {};
      const rank = Math.max(1, Math.round(numberField(recommendation, "rank", index + 1)));
      const attendeeId =
        stringField(attendee, "attendeeId") ||
        stringField(attendee, "contactId") ||
        stringField(attendee, "targetPersonId") ||
        stringField(
          recommendation,
          "recommendationId",
          `recommendation-${index}`
        );

      return {
        attendeeId,
        id: stringField(
          recommendation,
          "recommendationId",
          attendeeId
        ),
        name: stringField(attendee, "displayName", "推荐对象"),
        opener: chineseDisplayText(
          stringField(openingLine, "text"),
          "可以从对方的业务背景切入，先问一个具体问题，再判断是否适合继续聊。"
        ),
        organizationRole: organizationRole(attendee),
        rankLabel: `第 ${rank} 位`,
        reason: recommendationReason(recommendation.reasons),
        scoreLabel: scoreLabel(numberField(recommendation, "score")),
        suggestedAction: recommendationAction(
          stringField(recommendation, "recommendedAction")
        )
      };
    });

  return {
    nextAction: chineseDisplayText(
      stringField(record, "nextAction"),
      "先挑 1-2 个最值得见的人，现场确认后再继续联系。"
    ),
    people: recommendations,
    title: "推荐认识的人"
  };
}

function eventValueTitle(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "climate operators breakfast": "气候运营方早餐会",
    "fintech partnership salon": "金融科技合作沙龙",
    "founder pipeline clinic": "创始人管线诊断会"
  };

  return labels[normalized] ?? chineseDisplayText(value, value || "推荐活动");
}

function placeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    osaka: "大阪",
    tokyo: "东京"
  };

  return labels[normalized] ?? value.trim();
}

function industryLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    climate: "气候科技",
    fintech: "金融科技",
    "startup operations": "创业运营"
  };

  return labels[normalized] ?? value.trim();
}

function calendarFitLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    conflict: "时间冲突",
    open: "时间合适",
    tight: "时间紧"
  };

  return labels[normalized] ?? "";
}

function eventValueScoreBandLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    high: "优先参加",
    low: "低优先级",
    medium: "可以备选"
  };

  return labels[normalized] ?? "待判断";
}

function eventValueAction(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("operator discovery")) {
    return "适合用来找运营方。现场先记下背景，再决定要不要联系。";
  }

  if (normalized.includes("secondary option")) {
    return "如果这周重点是验证合作渠道，可以作为第二选择。";
  }

  if (normalized.includes("learning event")) {
    return "更适合学习方法，不必当作主要拓展场。";
  }

  if (normalized.includes("profile goal")) {
    return "先补个人主页里的参会目标。";
  }

  return chineseDisplayText(value, "先看推荐理由，再决定要不要报名。");
}

function eventValueSignalReason(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("near-term climate purchasing needs")) {
    return "参会者里有近期在看气候方案的运营方。";
  }

  if (normalized.includes("free morning slot")) {
    return "这段时间没有明显冲突。";
  }

  if (normalized.includes("bd leaders")) {
    return "适合比较不同渠道合作的限制。";
  }

  if (normalized.includes("local to the demo profile")) {
    return "地点和当前活动范围匹配。";
  }

  if (normalized.includes("useful process learning")) {
    return "能学到流程方法，但直接客户匹配弱一些。";
  }

  if (normalized.includes("outside tokyo")) {
    return "地点不在主要活动范围内。";
  }

  return chineseDisplayText(value, "这场活动和当前目标有匹配。");
}

function eventValueReason(recommendation: Record<string, unknown>): string {
  const signals = listFromPayload(recommendation.signals, "signals").filter(isRecord);
  const signal = signals[0];

  if (!signal) {
    return "这场活动和当前目标有匹配。";
  }

  return eventValueSignalReason(
    stringField(signal, "detail") || stringField(signal, "label")
  );
}

function eventValueProfileLine(profile: Record<string, unknown>): string {
  const segments = [
    placeLabel(stringField(profile, "location")),
    industryLabel(stringField(profile, "industryPreference")),
    calendarFitLabel(stringField(profile, "calendarFit"))
  ].filter(Boolean);

  return segments.join(" · ");
}

export function eventValueRecommendationsToView(
  data: unknown
): EventValueRecommendationsView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const profile = nestedRecord(record, "profile") ?? {};
  const recommendations = listFromPayload(record.recommendations, "recommendations")
    .filter(isRecord)
    .slice(0, 3)
    .map((recommendation) => {
      const detail = [
        formatDateTime(stringField(recommendation, "startsAt")),
        stringField(recommendation, "location"),
        stringField(recommendation, "venue")
      ].filter(Boolean);

      return {
        action: eventValueAction(stringField(recommendation, "recommendedAction")),
        detail: detail.join(" · "),
        id: stringField(recommendation, "eventId", "event"),
        reason: eventValueReason(recommendation),
        scoreBandLabel: eventValueScoreBandLabel(
          stringField(recommendation, "scoreBand")
        ),
        scoreLabel: `${Math.round(numberField(recommendation, "valueScore"))} 分`,
        title: eventValueTitle(stringField(recommendation, "title"))
      };
    });

  return {
    emptyText:
      recommendations.length === 0
        ? "暂时没有比当前列表更值得优先参加的活动。"
        : "",
    nextAction: eventValueAction(stringField(record, "nextAction")),
    profileLine: eventValueProfileLine(profile),
    recommendations,
    title: "推荐参加"
  };
}

function eventValueAcceptedNextAction(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes("source-backed") ||
    normalized.includes("action sandbox") ||
    normalized.includes("follow-up")
  ) {
    return "已记录这个选择。下一步去活动页确认报名和会前准备。";
  }

  return chineseDisplayText(
    value,
    "已记录这个选择。下一步去活动页确认报名和会前准备。"
  );
}

function eventValueAcceptanceSafetyLabel(
  action: Record<string, unknown>
): string {
  const calendarRequested = action.calendarProviderRequested === true;
  const notificationDelivered = action.notificationDelivered === true;

  if (!calendarRequested && !notificationDelivered) {
    return "未写日历、未发送通知";
  }

  return "已记录推荐选择";
}

export function eventValueRecommendationAcceptanceToView(
  data: unknown
): EventValueRecommendationAcceptanceView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const acceptedEvent = nestedRecord(record, "acceptedEvent") ?? {};
  const action = nestedRecord(record, "action") ?? {};
  const detail = [
    formatDateTime(stringField(acceptedEvent, "startsAt")),
    stringField(acceptedEvent, "location"),
    stringField(acceptedEvent, "venue")
  ].filter(Boolean);
  const eventId = stringField(acceptedEvent, "eventId", "event");

  return {
    detail: detail.join(" · "),
    eventId,
    nextAction: eventValueAcceptedNextAction(stringField(record, "nextAction")),
    safetyLabel: eventValueAcceptanceSafetyLabel(action),
    scoreLabel: `${Math.round(numberField(acceptedEvent, "valueScore"))} 分`,
    title: `已接受推荐：${eventValueTitle(stringField(acceptedEvent, "title"))}`
  };
}

export function eventOpeningLineToView(data: unknown): EventOpeningLineView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const openingLine = nestedRecord(record, "openingLine") ?? {};

  return {
    opener: chineseDisplayText(
      stringField(openingLine, "text"),
      "可以从对方的业务背景切入，先问一个具体问题，再判断是否适合继续聊。"
    ),
    statusLabel: "开场白已更新"
  };
}

function postEventStateLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "pending") {
    return "等待导入";
  }

  if (normalized === "empty") {
    return "暂无复核";
  }

  return "会后待复核";
}

function postEventUrgencyLabel(value: string): string {
  return value.trim().toLowerCase() === "today" ? "今天处理" : "本周处理";
}

function postEventTags(contact: Record<string, unknown>): string[] {
  const tags = listFromPayload(contact.tags, "tags")
    .filter(isRecord)
    .map((tag) => chineseDisplayText(stringField(tag, "label"), ""))
    .filter(Boolean);

  return uniqueStrings(tags).slice(0, 4);
}

export function eventPostEventReviewToView(
  data: unknown
): EventPostEventReviewView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const contacts = listFromPayload(record.contacts, "contacts")
    .filter(isRecord)
    .slice(0, 4)
    .map((contact, index) => {
      const summary = nestedRecord(contact, "summary") ?? {};
      const followUp = nestedRecord(contact, "followUpSuggestion") ?? {};
      const tags = postEventTags(contact);

      return {
        followUpDraft: chineseDisplayText(
          stringField(followUp, "messageDraft"),
          "先写一段简短消息，确认对方是否愿意继续聊。"
        ),
        headline: chineseDisplayText(
          stringField(summary, "headline"),
          "活动后有一位新联系人需要复核。"
        ),
        id: stringField(contact, "contactDraftId", `post-event-${index}`),
        name: stringField(contact, "displayName", "待复核联系人"),
        organizationRole: [
          stringField(contact, "organization"),
          stringField(contact, "role")
        ]
          .filter(Boolean)
          .join(" · "),
        tags: tags.length > 0 ? tags : ["活动后", "待复核"],
        urgencyLabel: postEventUrgencyLabel(
          stringField(followUp, "urgency", "this_week")
        ),
        whyNow: chineseDisplayText(
          stringField(summary, "whyNow"),
          "趁活动背景还清楚，先判断是否值得继续联系。"
        )
      };
    });

  return {
    contactCountLabel:
      contacts.length > 0 ? `${contacts.length} 位待复核` : "暂无联系人",
    contacts,
    nextAction:
      contacts.length > 0
        ? chineseDisplayText(
            stringField(record, "nextAction"),
            "先确认这些联系人，再决定是否保留记录或写联系草稿。"
          )
        : "这场活动暂时没有需要复核的新联系人。",
    stateLabel: postEventStateLabel(stringField(record, "state", "success")),
    title: "会后复核"
  };
}

export function eventPostEventConfirmRequestFromReview(
  review: EventPostEventReviewView
): EventPostEventConfirmRequest | null {
  const contactDraftIds = uniqueStrings(
    review.contacts.map((contact) => contact.id)
  );

  return contactDraftIds.length > 0 ? { contactDraftIds } : null;
}

export function eventPostEventConfirmToView(
  data: unknown,
  eventId?: string | null
): EventPostEventConfirmView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const confirmedCount = listFromPayload(
    record.confirmedContacts,
    "confirmedContacts"
  ).filter(isRecord).length;
  const count = Math.max(0, confirmedCount);
  const countLabel = count > 0 ? `${count} 位已确认` : "已确认";

  return {
    confirmedCountLabel: countLabel,
    feedback:
      count > 0
        ? `已确认 ${count} 位候选。发送消息仍需另外确认。`
        : "候选已确认。发送消息仍需另外确认。",
    nextAction: chineseDisplayText(
      stringField(record, "nextAction"),
      "先检查确认记录，再决定是否写入联系人或发送消息。"
    ),
    reviewQueueHref: eventId?.trim()
      ? `/contacts/new/drafts?eventId=${encodeURIComponent(eventId.trim())}`
      : "/contacts/new/drafts",
    reviewQueueLabel: "去复核联系人",
    title: "会后复核已确认"
  };
}
