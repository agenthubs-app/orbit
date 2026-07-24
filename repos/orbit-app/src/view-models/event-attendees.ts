export interface EventAttendeeCardView {
  canWantConnect: boolean;
  contactId: string;
  id: string;
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

function attendeeCard(attendee: Record<string, unknown>): EventAttendeeCardView {
  const contactId = contactIdFor(attendee);
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

export function buildWantConnectRequest(
  attendee: EventAttendeeCardView
): { targetContactId: string } {
  return {
    targetContactId: attendee.contactId
  };
}
