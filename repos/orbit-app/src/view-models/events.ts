export interface EventSummary {
  coverPath: string;
  id: string;
  location: string;
  startsAt: string;
  status: string;
  title: string;
}

export interface EventDetailSummary extends EventSummary {
  description: string;
  evidenceExcerpts: string[];
  nextAction: string;
  preparation: string;
  relationshipContext: string;
  sourceLabel: string;
}

export interface EventDetailHeroView {
  coverPath: string;
  detailLine: string;
  status: string;
  summary: string;
  title: string;
}

export interface EventReadinessChecklistView {
  detail: string;
  id: string;
  ownerLabel: string;
  statusLabel: string;
  title: string;
}

export interface EventReadinessView {
  checklist: EventReadinessChecklistView[];
  goal: string;
  nextAction: string;
  scoreLabel: string;
  stateLabel: string;
}

export interface EventRecommendedPersonView {
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

const enWeekdayToZh: Record<string, string> = {
  Fri: "周五",
  Mon: "周一",
  Sat: "周六",
  Sun: "周日",
  Thu: "周四",
  Tue: "周二",
  Wed: "周三",
};

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
  return /\b(source-backed|generated|fixture|fixtures|provider|profile_orbit|source:|evidence:|live storage)\b/i.test(
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

function eventTitle(event: Record<string, unknown>): string {
  const sourceLabel = nestedStringField(event, "sourceMetadata", "label");
  const rawTitle = sourceLabel || stringField(event, "title") || stringField(event, "name");
  return cleanEventDisplayText(preferredChineseSegment(rawTitle)) || "活动";
}

const eventCoverById: Record<string, string> = {
  event_01: "/orbit-covers/restaurant.jpg",
  event_02: "/orbit-covers/events/ai-workflow-poc-roundtable.jpg",
  event_03: "/orbit-covers/events/cross-border-ecommerce-meetup.jpg",
  event_04: "/orbit-covers/events/investor-founder-salon.jpg",
  event_05: "/orbit-covers/events/chinese-business-community-salon.jpg",
  event_06: "/orbit-covers/chip.jpg",
  event_07: "/orbit-covers/finance.jpg",
  event_08: "/orbit-covers/ai.jpg",
  event_09: "/orbit-covers/fashion.jpg",
  event_10: "/orbit-covers/fashion.jpg",
  event_signup_01: "/orbit-covers/events/kansai-business-connect.jpg",
  event_signup_02: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
  event_signup_03: "/orbit-covers/events/investor-founder-salon.jpg"
};

function eventCoverPath(event: Record<string, unknown>, title: string): string {
  const explicitCover =
    stringField(event, "coverPath") ||
    stringField(event, "coverUrl") ||
    stringField(event, "imageUrl") ||
    nestedStringField(event, "sourceMetadata", "coverPath") ||
    nestedStringField(event, "sourceMetadata", "coverUrl");

  if (explicitCover) {
    return explicitCover;
  }

  const id = stringField(event, "id");

  if (eventCoverById[id]) {
    return eventCoverById[id];
  }

  const normalized = title.toLowerCase();

  if (normalized.includes("关西") || normalized.includes("kansai")) {
    return "/orbit-covers/events/kansai-business-connect.jpg";
  }

  if (normalized.includes("ai")) {
    return "/orbit-covers/events/tokyo-ai-partner-meetup.jpg";
  }

  if (normalized.includes("投资") || normalized.includes("创始")) {
    return "/orbit-covers/events/investor-founder-salon.jpg";
  }

  if (normalized.includes("电商") || normalized.includes("跨境")) {
    return "/orbit-covers/events/cross-border-ecommerce-meetup.jpg";
  }

  return "/orbit-covers/meeting.jpg";
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value || "Time pending";
  }

  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const tokyoWeekday = enWeekdayToZh[partValue("weekday")] ?? "";
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return `${partValue("month")}月${partValue("day")}日 ${tokyoWeekday} ${time}`.trim();
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

function statusLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "cancelled" || normalized === "canceled") {
    return "已取消";
  }

  if (normalized === "completed" || normalized === "ended") {
    return "已结束";
  }

  if (normalized === "confirmed" || normalized === "scheduled") {
    return "已确认";
  }

  return value || "待确认";
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

export function eventsToSummaries(data: unknown): EventSummary[] {
  return listFromPayload(data, "events")
    .filter(isRecord)
    .map((event) => {
      const title = eventTitle(event);

      return {
        coverPath: eventCoverPath(event, title),
        id: stringField(event, "id", "event"),
        location:
          stringField(event, "venue") ||
          stringField(event, "location") ||
          stringField(event, "locationLabel"),
        startsAt: formatDateTime(stringField(event, "startsAt", "Time pending")),
        status: statusLabel(stringField(event, "status", "scheduled")),
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

export function eventDetailToSummary(data: unknown): EventDetailSummary {
  const event = eventRecordFromPayload(data);

  if (!event) {
    return {
      coverPath: "/orbit-covers/meeting.jpg",
      description: "",
      evidenceExcerpts: [],
      id: "event",
      location: "",
      nextAction: "先看活动信息，再决定要准备的介绍和会谈重点。",
      preparation: "整理参会者背景、想认识的人和可以主动提供的资源。",
      relationshipContext: "关系线索待补充。",
      sourceLabel: "",
      startsAt: "Time pending",
      status: "scheduled",
      title: "Event"
    };
  }

  const title = eventTitle(event);

  return {
    coverPath: eventCoverPath(event, title),
    description: userFacingText(stringField(event, "description"), ""),
    evidenceExcerpts: evidenceExcerpts(event),
    id: stringField(event, "id", "event"),
    location:
      stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    nextAction: userFacingText(
      stringField(event, "nextAction"),
      "先看报名信息，再决定要准备的介绍和会谈重点。"
    ),
    preparation: userFacingText(
      stringField(event, "recommendedPreparation"),
      "整理参会者背景、想认识的人和可以主动提供的资源。"
    ),
    relationshipContext: userFacingText(
      stringField(event, "relationshipContext"),
      "关系线索待补充。"
    ),
    sourceLabel: sourceLabel(event),
    startsAt: formatDateTime(stringField(event, "startsAt", "Time pending")),
    status: statusLabel(stringField(event, "status", "scheduled")),
    title
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
    "follow-up owner confirmed": "确认会后跟进负责人",
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
    checklist,
    goal: chineseDisplayText(
      goal ? stringField(goal, "intent") : "",
      "先明确这场活动最想认识的人和可以主动提供的资源。"
    ),
    nextAction: chineseDisplayText(
      stringField(preparationState, "nextPreparationStep") ||
        stringField(record, "nextAction"),
      "先确认会后跟进负责人，再带着目标入场。"
    ),
    scoreLabel: `${score}%`,
    stateLabel: readinessStateLabel(score)
  };
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

      return {
        id: stringField(
          recommendation,
          "recommendationId",
          stringField(attendee, "attendeeId", `recommendation-${index}`)
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
      "先挑 1-2 个最值得见的人，现场确认后再继续跟进。"
    ),
    people: recommendations,
    title: "推荐认识的人"
  };
}
