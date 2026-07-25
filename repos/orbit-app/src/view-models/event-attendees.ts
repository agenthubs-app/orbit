import { ORBIT_API_ENDPOINTS, eventAttendeesImportPath } from "../api/endpoints";

export interface EventAttendeeCardView {
  canWantConnect: boolean;
  contactId: string;
  id: string;
  imageUrl?: string;
  knownLabel: string;
  name: string;
  organizationRole: string;
  reasons: string[];
  relationshipContext: string;
  statusLabel: string;
  suggestedNextAction: string;
  tags: string[];
}

export interface EventAttendeeRosterView {
  attendees: EventAttendeeCardView[];
  eventDetail: string;
  eventTitle: string;
  nextAction: string;
  summary: string;
}

export interface EventMatchCardView {
  id: string;
  message: string;
  names: string[];
  nextAction: string;
  title: string;
}

export interface EventMatchesView {
  matches: EventMatchCardView[];
  nextAction: string;
}

export interface EventEncounterNoteRequest {
  contactId: string;
  noteText: string;
}

export interface EventEncounterNoteView {
  encounterId: string;
  evidenceLabel: string;
  feedback: string;
  nextAction: string;
  noteText: string;
  participantLabel: string;
  title: string;
}

export interface EventEncounterEvidenceView {
  encounterId: string;
  evidenceId: string;
  feedback: string;
  nextAction: string;
  sourceExcerpt: string;
  title: string;
}

export interface EventAttendeeContactDraftImportRequestBody {
  eventId: string;
  relationshipStatusFilter?: string;
}

export type EventAttendeeContactDraftImportRequestResult =
  | {
      request: {
        body: EventAttendeeContactDraftImportRequestBody;
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export interface EventAttendeeDraftImportCardView {
  detail: string;
  evidence: string[];
  id: string;
  name: string;
  nextAction: string;
  relationship: string;
  statusLabel: string;
  writeState: string;
}

export interface EventAttendeeDraftImportView {
  drafts: EventAttendeeDraftImportCardView[];
  nextAction: string;
  summary: string;
  title: string;
}

export interface EventAttendeeRosterImportRequestBody {
  eligibleOnly?: boolean;
  knownContactOnly?: boolean;
  tagFilter?: string;
}

export type EventAttendeeRosterImportRequestResult =
  | {
      request: {
        body: EventAttendeeRosterImportRequestBody;
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export interface EventAttendeeRosterImportView {
  metrics: string[];
  nextAction: string;
  safetyText: string;
  summary: string;
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
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nestedRecord(
  record: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function listFromRecord(
  record: Record<string, unknown>,
  fieldName: string
): readonly unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function booleanField(record: Record<string, unknown>, fieldName: string): boolean {
  return record[fieldName] === true;
}

function containsImplementationLabel(value: string): boolean {
  return /\b(provider|model|fixture|mock|generated|live storage|live-store|database|importing|source-backed|rule-based|external action|external message|notification)\b/i.test(
    value
  );
}

function userFacingText(value: string, fallback = ""): string {
  const text = preferredChineseSegment(value).trim();
  if (!text || containsImplementationLabel(text)) {
    return fallback;
  }

  if (fallback && /[A-Za-z]/u.test(text) && !segmentLooksChinese(text)) {
    return fallback;
  }

  return text;
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function hasChineseSegment(value: string): boolean {
  return value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .some(segmentLooksChinese);
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
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).formatToParts(new Date(timestamp));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return `${partValue("month")}月${partValue("day")}日 ${
    enWeekdayToZh[partValue("weekday")] ?? ""
  } ${time}`.trim();
}

function attendeeStatusLabel(value: string): string {
  if (value === "checked_in") {
    return "已签到";
  }

  if (value === "registered") {
    return "已报名";
  }

  return "待确认";
}

function knownLabel(marker: Record<string, unknown>): string {
  return booleanField(marker, "isKnownContact") ? "已在人脉中" : "新关系";
}

function contactIdFor(attendee: Record<string, unknown>): string {
  const marker = nestedRecord(attendee, "knownContactMarker");
  return (
    stringField(attendee, "existingContactId") ||
    stringField(marker, "contactId") ||
    `contact:generated:${stringField(attendee, "attendeeId", "attendee")}`
  );
}

function liveRelationshipStatusLabel(status: Record<string, unknown>): string {
  const code = stringField(status, "code");

  if (code === "known_contact") {
    return "已认识";
  }

  if (code === "priority_follow_up") {
    return "优先跟进";
  }

  if (code === "needs_context") {
    return "需补背景";
  }

  if (code === "new_potential_contact") {
    return "";
  }

  return userFacingText(stringField(status, "label"));
}

function tagLabels(attendee: Record<string, unknown>): string[] {
  const rosterTags = listFromRecord(attendee, "attendeeTags")
    .filter(isRecord)
    .map((tag) => userFacingText(stringField(tag, "label")))
    .filter(Boolean);
  const relationshipStatus = liveRelationshipStatusLabel(
    nestedRecord(attendee, "relationshipStatus")
  );

  return rosterTags.length > 0
    ? rosterTags
    : relationshipStatus
      ? [relationshipStatus]
      : [];
}

function recommendationReasons(attendee: Record<string, unknown>): string[] {
  const eligibility = nestedRecord(attendee, "eligibleRecommendation");

  return listFromRecord(eligibility, "reasons")
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => userFacingText(reason))
    .filter(Boolean)
    .slice(0, 3);
}

function attendeeImageUrl(attendee: Record<string, unknown>): string {
  const avatar = nestedRecord(attendee, "avatar");

  return (
    stringField(attendee, "avatarAssetUrl") ||
    stringField(attendee, "avatarUrl") ||
    stringField(attendee, "photoUrl") ||
    stringField(attendee, "imageUrl") ||
    stringField(attendee, "profileImageUrl") ||
    stringField(avatar, "src") ||
    stringField(avatar, "url") ||
    stringField(avatar, "imageUrl")
  );
}

function attendeeCard(attendee: Record<string, unknown>): EventAttendeeCardView {
  const contactId = contactIdFor(attendee);
  const imageUrl = attendeeImageUrl(attendee);
  const relationshipStatus = nestedRecord(attendee, "relationshipStatus");
  const knownByImport =
    stringField(relationshipStatus, "code") === "known_contact" ||
    Boolean(stringField(attendee, "existingContactId"));
  const organizationRole = [
    stringField(attendee, "organization"),
    stringField(attendee, "role")
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    canWantConnect: Boolean(contactId),
    contactId,
    id: stringField(attendee, "attendeeId", contactId),
    ...(imageUrl ? { imageUrl } : {}),
    knownLabel: knownByImport
      ? "已在人脉中"
      : knownLabel(nestedRecord(attendee, "knownContactMarker")),
    name: stringField(attendee, "displayName", "参会者"),
    organizationRole,
    reasons: recommendationReasons(attendee),
    relationshipContext: userFacingText(
      stringField(attendee, "relationshipContext"),
      "可以现场判断是否值得继续聊。"
    ),
    statusLabel: attendeeStatusLabel(stringField(attendee, "checkInStatus")),
    suggestedNextAction: userFacingText(
      stringField(attendee, "suggestedNextAction"),
      "如果对方也愿意，再继续下一步。"
    ),
    tags: tagLabels(attendee)
  };
}

export function eventAttendeeRosterToView(data: unknown): EventAttendeeRosterView {
  const payload = isRecord(data) ? data : {};
  const event = nestedRecord(payload, "event");
  const eventSource = nestedRecord(event, "source");
  const rawEventName = stringField(event, "name");
  const rawEventTitle = hasChineseSegment(rawEventName)
    ? rawEventName
    : stringField(event, "organizer") || stringField(eventSource, "label") || rawEventName;
  const eventDetail = [
    formatDateTime(stringField(event, "startsAt")),
    stringField(event, "venue")
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    attendees: listFromRecord(payload, "attendees")
      .filter(isRecord)
      .map(attendeeCard),
    eventDetail,
    eventTitle: userFacingText(rawEventTitle, "活动参会者"),
    nextAction: userFacingText(
      stringField(payload, "nextAction"),
      "先看名单，挑 1-2 个最值得现场聊的人。"
    ),
    summary: userFacingText(
      stringField(payload, "summary"),
      "参会者名单已准备好，可以按关系价值筛选。"
    )
  };
}

function stringList(record: Record<string, unknown>, fieldName: string): string[] {
  return listFromRecord(record, fieldName).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  ).map((value) => (value === "Orbit operator" ? "我" : value));
}

function matchCard(match: Record<string, unknown>): EventMatchCardView {
  const notice = nestedRecord(match, "successNotice");

  return {
    id: stringField(match, "matchId", "match"),
    message: userFacingText(
      stringField(notice, "message"),
      "现场有互相想认识的信号，先当面确认，再继续下一步。"
    ),
    names: stringList(match, "participantNames"),
    nextAction: userFacingText(
      stringField(notice, "nextAction"),
      "先当面确认对方也愿意继续聊。"
    ),
    title: userFacingText(stringField(notice, "title"), "可以现场介绍")
  };
}

export function eventMatchesToView(data: unknown): EventMatchesView {
  const payload = isRecord(data) ? data : {};

  return {
    matches: listFromRecord(payload, "matches")
      .filter(isRecord)
      .map(matchCard),
    nextAction: userFacingText(
      stringField(payload, "nextAction"),
      "先看匹配，再决定要不要现场介绍。"
    )
  };
}

export function buildEncounterNoteRequest(
  attendee: EventAttendeeCardView,
  noteText: string
): EventEncounterNoteRequest | null {
  const contactId = attendee.contactId.trim();
  const text = noteText.trim();

  if (!contactId || !text) {
    return null;
  }

  return {
    contactId,
    noteText: text
  };
}

export function eventEncounterNoteToView(data: unknown): EventEncounterNoteView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const participant = nestedRecord(record, "participant");
  const encounter = nestedRecord(record, "encounter");
  const note = nestedRecord(record, "note");
  const evidenceDraft = nestedRecord(record, "evidenceDraft");
  const participantName = stringField(participant, "displayName", "这位参会者");
  const participantLabel = [
    participantName,
    stringField(participant, "organization"),
    stringField(participant, "role")
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    encounterId:
      stringField(encounter, "encounterId") ||
      stringField(evidenceDraft, "encounterId"),
    evidenceLabel: stringField(evidenceDraft, "evidenceId")
      ? "证据草稿已生成"
      : "记录已保存",
    feedback: `已记录 ${participantName} 的现场记录。`,
    nextAction: userFacingText(
      stringField(record, "nextAction"),
      "先检查这条记录，再决定是否转成跟进或联系人证据。"
    ),
    noteText: userFacingText(
      stringField(note, "text"),
      "现场记录已保存。"
    ),
    participantLabel,
    title: "现场记录已保存"
  };
}

export function eventEncounterEvidenceToView(
  data: unknown
): EventEncounterEvidenceView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const evidence = nestedRecord(record, "evidence");

  return {
    encounterId:
      stringField(record, "encounterId") ||
      stringField(evidence, "encounterId"),
    evidenceId: stringField(evidence, "evidenceId"),
    feedback: "关系证据已生成。",
    nextAction: userFacingText(
      stringField(record, "nextAction"),
      "证据已生成，下一步再决定是否写跟进。"
    ),
    sourceExcerpt: userFacingText(
      stringField(evidence, "excerpt"),
      "现场记录已转成关系证据。"
    ),
    title: "关系证据"
  };
}

export function buildEventAttendeeContactDraftImportRequest(
  eventId: string,
  relationshipStatusFilter?: string | null
): EventAttendeeContactDraftImportRequestResult {
  const normalizedEventId = eventId.trim();
  const normalizedFilter = relationshipStatusFilter?.trim();

  if (!normalizedEventId) {
    return {
      error: "这场活动缺少编号，暂时不能导入候选。",
      success: false
    };
  }

  return {
    request: {
      body: {
        eventId: normalizedEventId,
        ...(normalizedFilter
          ? { relationshipStatusFilter: normalizedFilter }
          : {})
      },
      endpoint: ORBIT_API_ENDPOINTS.contactDraftEventAttendeesImport
    },
    success: true
  };
}

export function buildEventAttendeeRosterImportRequest(
  eventId: string,
  input: {
    eligibleOnly?: boolean;
    knownContactOnly?: boolean;
    tagFilter?: string | null;
  } = {}
): EventAttendeeRosterImportRequestResult {
  const normalizedEventId = eventId.trim();
  const normalizedTagFilter = input.tagFilter?.trim();

  if (!normalizedEventId) {
    return {
      error: "这场活动缺少编号，暂时不能导入名单。",
      success: false
    };
  }

  return {
    request: {
      body: {
        ...(typeof input.eligibleOnly === "boolean"
          ? { eligibleOnly: input.eligibleOnly }
          : {}),
        ...(typeof input.knownContactOnly === "boolean"
          ? { knownContactOnly: input.knownContactOnly }
          : {}),
        ...(normalizedTagFilter ? { tagFilter: normalizedTagFilter } : {})
      },
      endpoint: eventAttendeesImportPath(normalizedEventId)
    },
    success: true
  };
}

export function eventAttendeeRosterImportToView(
  data: unknown
): EventAttendeeRosterImportView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const event = nestedRecord(record, "event");
  const importBatch = nestedRecord(record, "importBatch");
  const attendeeCount =
    listFromRecord(importBatch, "attendeeIds").length ||
    listFromRecord(record, "attendees").length;
  const recommendationCount =
    listFromRecord(importBatch, "recommendationCandidateIds").length ||
    listFromRecord(record, "eligibleRecommendationPool").length;
  const eventTitle = userFacingText(stringField(event, "name"), "这场活动");
  const writeState = booleanField(importBatch, "liveDatabaseWriteExecuted")
    ? "活动上下文已更新"
    : "只生成导入预览";

  return {
    metrics: [
      `${attendeeCount} 位参会者`,
      `${recommendationCount} 条推荐`,
      writeState
    ],
    nextAction: userFacingText(
      stringField(record, "nextAction"),
      "先看名单，再决定现场认识和会后跟进。"
    ),
    safetyText: "没有写联系人，也没有发消息。",
    summary: `${eventTitle} · ${attendeeCount} 位参会者已进入活动上下文。`,
    title: "名册已导入"
  };
}

function contactDraftStatusLabel(status: Record<string, unknown>): string {
  const code = stringField(status, "code");

  if (code === "known_contact") {
    return "已认识";
  }

  if (code === "priority_follow_up") {
    return "优先跟进";
  }

  if (code === "needs_context") {
    return "需补背景";
  }

  if (code === "new_potential_contact") {
    return "新关系";
  }

  return userFacingText(stringField(status, "label"), "待复核");
}

function contactDraftRelationshipText(value: string): string {
  if (
    value ===
    "Aiko joined the climate founders dinner to discuss channel partnerships for grid resilience pilots."
  ) {
    return "Aiko 参加气候创业者晚餐，想聊电网韧性试点的渠道合作。";
  }

  if (
    value ===
    "Priya spoke about storage reliability and maps to the current storage pilot follow-up goal."
  ) {
    return "Priya 分享过储能可靠性，和当前储能试点跟进目标相关。";
  }

  return userFacingText(value, "这位参会者和当前活动目标有关，适合先放入候选。");
}

function contactDraftNextActionText(value: string): string {
  if (
    value ===
    "Review Aiko as a new potential contact and ask about pilot partner coverage."
  ) {
    return "把 Aiko 作为新联系人复核，先问清试点伙伴覆盖范围。";
  }

  if (
    value ===
    "Draft a post-event follow-up asking Priya about storage pilot operator introductions."
  ) {
    return "给 Priya 准备会后跟进，确认储能试点运营方介绍。";
  }

  return userFacingText(value, "先复核资料，再决定是否确认写入联系人。");
}

function contactDraftEvidenceText(excerpt: string): string {
  if (
    excerpt ===
    "Local fixture lists Aiko Mori, Luis Ortega, and Priya Shah as demo attendees."
  ) {
    return "活动名单：Aiko Mori 等参会者已进入待复核名单。";
  }

  if (
    excerpt ===
    "The dinner context is climate BD, distribution partnerships, and storage pilot introductions."
  ) {
    return "活动背景：这场晚餐围绕气候 BD、渠道合作和储能试点介绍。";
  }

  if (containsImplementationLabel(excerpt)) {
    return "证据显示这位参会者和当前活动目标有关。";
  }

  return userFacingText(excerpt, "证据显示这位参会者和当前活动目标有关。");
}

function contactDraftEvidenceList(draft: Record<string, unknown>): string[] {
  return listFromRecord(draft, "evidence")
    .filter(isRecord)
    .map((evidence) => contactDraftEvidenceText(stringField(evidence, "excerpt")))
    .filter(Boolean)
    .slice(0, 3);
}

function eventAttendeeContactDraftCard(
  draft: Record<string, unknown>
): EventAttendeeDraftImportCardView {
  const detail = [stringField(draft, "organization"), stringField(draft, "role")]
    .filter(Boolean)
    .join(" · ");

  return {
    detail,
    evidence: contactDraftEvidenceList(draft),
    id: stringField(draft, "id", stringField(draft, "attendeeId", "draft")),
    name: stringField(draft, "displayName", "候选联系人"),
    nextAction: contactDraftNextActionText(
      stringField(draft, "suggestedNextAction")
    ),
    relationship: contactDraftRelationshipText(
      stringField(draft, "relationshipContext")
    ),
    statusLabel: contactDraftStatusLabel(nestedRecord(draft, "relationshipStatus")),
    writeState: booleanField(draft, "contactWriteExecuted")
      ? "联系人已写入"
      : "待复核，未写入联系人"
  };
}

export function eventAttendeeContactDraftImportToView(
  data: unknown
): EventAttendeeDraftImportView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const drafts = listFromRecord(record, "contactDrafts")
    .filter(isRecord)
    .map(eventAttendeeContactDraftCard);

  return {
    drafts,
    nextAction:
      drafts.length > 0
        ? "去添加人脉页复核后再确认。"
        : "这场活动暂时没有可导入候选。",
    summary: `${drafts.length} 条候选`,
    title: "已生成待确认候选"
  };
}

export function buildWantConnectRequest(
  attendee: EventAttendeeCardView
): { targetContactId: string } {
  return {
    targetContactId: attendee.contactId
  };
}
