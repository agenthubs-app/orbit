/**
 * W0046：关系时间线纯函数。输入是「已读出的各来源行」（可含多位联系人），输出某位联系人的时间线。
 * 不读时钟、不读库；W0047 批量计分复用它（契约见 shared/contract/relationship-timeline.ts）。
 */
import type {
  RelationshipTimelineCaptureMethod,
  RelationshipTimelineItem,
  RelationshipTimelineResult,
  RelationshipTimelineSource,
} from "../../shared/contract/relationship-timeline";
import { parseStrictTokyoInstant } from "../../shared/compute/tokyo-calendar-days";

export const RELATIONSHIP_TIMELINE_SOURCES: readonly RelationshipTimelineSource[] = [
  "memo",
  "encounter",
  "note",
  "plan",
  "schedule",
  "followup_done",
  "capture",
];

/** 用户 memo（含 W0046 以前「记录跟进」写入的备注）的 noteId 前缀；其余 notes 是投影，不单列。 */
export const MEMO_NOTE_ID_PREFIX = "note:live-contact-detail-update:";
export const TIMELINE_EXCERPT_MAX = 160;

export interface TimelineContactRow {
  id: string;
  createdAt: string;
  sourceType?: string | null;
  metEventId?: string | null;
  metEventTitle?: string | null;
}

export interface TimelineDetailNoteRow {
  noteId: string;
  body: string;
  createdAt: string;
  /** memo 选的东京日期 `YYYY-MM-DD`（W0046 起）。 */
  occurredAt?: string | null;
  eventId?: string | null;
  kind?: string | null;
}

export interface TimelineDetailStateRow {
  actorId: string;
  contactId: string;
  notes: readonly TimelineDetailNoteRow[];
}

export interface TimelineEncounterRow {
  encounterId: string;
  contactId: string;
  observedAt: string;
  eventId?: string | null;
  noteText?: string | null;
}

export interface TimelineNoteRow {
  id: string;
  contactIds: readonly string[];
  title: string;
  body: string;
  createdAt: string;
  eventIds?: readonly string[];
}

export interface TimelinePlanLogRow {
  id: string;
  event: string;
  kind: string;
  body: string;
  linkedContactIds: readonly string[];
  linkedEventId?: string | null;
  createdAt: string;
}

export interface TimelineScheduleRow {
  id: string;
  kind: "meeting" | "event" | "personal";
  title: string;
  startsAt: string;
  state: string;
  contactIds?: readonly string[];
  contactId?: string | null;
  eventId?: string | null;
}

export interface TimelineTaskRow {
  taskId: string;
  contactId: string;
  status: string;
  title: string;
  updatedAt: string;
}

export interface RelationshipTimelineSources {
  contacts?: readonly TimelineContactRow[];
  detailStates?: readonly TimelineDetailStateRow[];
  encounters?: readonly TimelineEncounterRow[];
  notes?: readonly TimelineNoteRow[];
  planLog?: readonly TimelinePlanLogRow[];
  schedule?: readonly TimelineScheduleRow[];
  tasks?: readonly TimelineTaskRow[];
  /** 读失败的来源（读取器传入）；纯函数原样带到结果里。 */
  unavailableSources?: readonly RelationshipTimelineSource[];
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 任意 ISO（或 `YYYY-MM-DD` 东京日期）→ UTC ISO；非法返回 null。 */
function normalizedInstant(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const strict = parseStrictTokyoInstant(value);
  if (strict !== null) return new Date(strict).toISOString();
  const loose = Date.parse(value);
  return Number.isFinite(loose) ? new Date(loose).toISOString() : null;
}

export function timelineExcerpt(text: string | null | undefined): string | undefined {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return undefined;
  const chars = Array.from(trimmed);
  return chars.length <= TIMELINE_EXCERPT_MAX ? trimmed : `${chars.slice(0, TIMELINE_EXCERPT_MAX - 1).join("")}…`;
}

function optional(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function memoItems(rows: readonly TimelineDetailStateRow[], contactId: string): RelationshipTimelineItem[] {
  const items: RelationshipTimelineItem[] = [];
  for (const state of rows) {
    if (state.contactId !== contactId) continue;
    const recordId = `contact-detail:${encodeURIComponent(state.actorId)}:${encodeURIComponent(state.contactId)}`;
    for (const note of state.notes) {
      // 只列用户 memo；`note:<encounterId>` 等投影以 human_encounters 为准，不重复。
      if (!note.noteId.startsWith(MEMO_NOTE_ID_PREFIX)) continue;
      const day = typeof note.occurredAt === "string" && DAY.test(note.occurredAt) ? note.occurredAt : null;
      const occurredAt = normalizedInstant(day ?? note.createdAt);
      if (!occurredAt) continue;
      const eventId = optional(note.eventId);
      items.push({
        id: `memo:${note.noteId}`,
        source: "memo",
        contactId,
        occurredAt,
        occurredAtPrecision: day ? "day" : "instant",
        title: { zh: "写了 memo", en: "Wrote a memo" },
        ...(timelineExcerpt(note.body) ? { excerpt: timelineExcerpt(note.body) } : {}),
        ...(eventId ? { eventId } : {}),
        ref: { store: "contact_detail_states", recordId, subId: note.noteId },
      });
    }
  }
  return items;
}

function encounterItems(rows: readonly TimelineEncounterRow[], contactId: string): RelationshipTimelineItem[] {
  return rows.flatMap((row): RelationshipTimelineItem[] => {
    if (row.contactId !== contactId) return [];
    const occurredAt = normalizedInstant(row.observedAt);
    if (!occurredAt) return [];
    const eventId = optional(row.eventId);
    const excerpt = timelineExcerpt(row.noteText);
    return [{
      id: `encounter:${row.encounterId}`,
      source: "encounter",
      contactId,
      occurredAt,
      occurredAtPrecision: "instant",
      title: eventId ? { zh: "在活动上见面", en: "Met at an event" } : { zh: "记录了一次见面", en: "Logged a meeting" },
      ...(excerpt ? { excerpt } : {}),
      ...(eventId ? { eventId } : {}),
      ref: { store: "human_encounters", recordId: row.encounterId },
    }];
  });
}

function noteItems(rows: readonly TimelineNoteRow[], contactId: string): RelationshipTimelineItem[] {
  return rows.flatMap((row): RelationshipTimelineItem[] => {
    if (!row.contactIds.includes(contactId)) return [];
    const occurredAt = normalizedInstant(row.createdAt);
    if (!occurredAt) return [];
    const title = row.title.trim();
    const eventId = optional(row.eventIds?.[0]);
    const excerpt = timelineExcerpt(row.body);
    return [{
      id: `note:${row.id}`,
      source: "note",
      contactId,
      occurredAt,
      occurredAtPrecision: "instant",
      title: title ? { zh: `笔记：${title}`, en: `Note: ${title}` } : { zh: "写了笔记", en: "Wrote a note" },
      ...(excerpt ? { excerpt } : {}),
      ...(eventId ? { eventId } : {}),
      ref: { store: "notes", recordId: row.id },
    }];
  });
}

const PLAN_EVENT_TITLE: Record<string, { zh: string; en: string }> = {
  contact_linked: { zh: "计划：关联到计划人脉需求", en: "Plan: linked to a plan need" },
  contact_established: { zh: "计划：确认已建立联系", en: "Plan: connection confirmed" },
  contact_unlinked: { zh: "计划：取消关联", en: "Plan: unlinked" },
  item_status_changed: { zh: "计划：行动状态更新", en: "Plan: action status updated" },
  action_deferred: { zh: "计划：行动顺延", en: "Plan: action deferred" },
  note: { zh: "计划：记录", en: "Plan: note" },
};

function planItems(rows: readonly TimelinePlanLogRow[], contactId: string): RelationshipTimelineItem[] {
  return rows.flatMap((row): RelationshipTimelineItem[] => {
    if (!row.linkedContactIds.includes(contactId)) return [];
    const occurredAt = normalizedInstant(row.createdAt);
    if (!occurredAt) return [];
    const eventId = optional(row.linkedEventId);
    // 只有手动记录的正文是用户原文；系统事件正文是规则文案，不当节选。
    const excerpt = row.kind === "manual" ? timelineExcerpt(row.body) : undefined;
    return [{
      id: `plan:${row.id}`,
      source: "plan",
      contactId,
      occurredAt,
      occurredAtPrecision: "instant",
      title: PLAN_EVENT_TITLE[row.event] ?? { zh: "计划：更新", en: "Plan: updated" },
      ...(excerpt ? { excerpt } : {}),
      ...(eventId ? { eventId } : {}),
      ref: { store: "plan_log", recordId: row.id },
      detail: { planEvent: row.event },
    }];
  });
}

function scheduleItems(rows: readonly TimelineScheduleRow[], contactId: string): RelationshipTimelineItem[] {
  return rows.flatMap((row): RelationshipTimelineItem[] => {
    if (row.state === "cancelled") return [];
    if (!(row.contactIds ?? []).includes(contactId) && row.contactId !== contactId) return [];
    const occurredAt = normalizedInstant(row.startsAt);
    if (!occurredAt) return [];
    const title = row.title.trim();
    const eventId = optional(row.eventId);
    const label = row.kind === "event"
      ? { zh: `参加活动：${title}`, en: `Attended event: ${title}` }
      : row.kind === "meeting"
        ? { zh: `会面：${title}`, en: `Meeting: ${title}` }
        : { zh: `日程：${title}`, en: `Schedule: ${title}` };
    return [{
      id: `schedule:${row.id}`,
      source: "schedule",
      contactId,
      occurredAt,
      occurredAtPrecision: "instant",
      title: label,
      ...(eventId ? { eventId } : {}),
      ref: { store: "personal_schedule_items", recordId: row.id },
      detail: { scheduleKind: row.kind },
    }];
  });
}

function taskItems(rows: readonly TimelineTaskRow[], contactId: string): RelationshipTimelineItem[] {
  return rows.flatMap((row): RelationshipTimelineItem[] => {
    if (row.contactId !== contactId || row.status !== "completed") return [];
    const occurredAt = normalizedInstant(row.updatedAt);
    if (!occurredAt) return [];
    const title = row.title.trim();
    return [{
      id: `followup_done:${row.taskId}`,
      source: "followup_done",
      contactId,
      occurredAt,
      occurredAtPrecision: "instant",
      title: title ? { zh: `完成跟进：${title}`, en: `Follow-up done: ${title}` } : { zh: "完成了一次跟进", en: "Completed a follow-up" },
      ref: { store: "tasks", recordId: row.taskId },
    }];
  });
}

export function captureMethodFor(sourceType: string | null | undefined): RelationshipTimelineCaptureMethod {
  switch (sourceType) {
    case "business_card_ocr": return "business_card";
    case "qr_scan": return "qr";
    case "event_import": return "event_exchange";
    case "manual": return "manual";
    default: return "other";
  }
}

const CAPTURE_TITLE: Record<RelationshipTimelineCaptureMethod, { zh: string; en: string }> = {
  business_card: { zh: "扫描名片，建立联系", en: "Added from a business card" },
  qr: { zh: "扫码交换，建立联系", en: "Connected by QR code" },
  event_exchange: { zh: "在活动中交换名片", en: "Exchanged cards at an event" },
  manual: { zh: "手动添加联系人", en: "Added manually" },
  other: { zh: "建立联系", en: "Connected" },
};

function captureItem(rows: readonly TimelineContactRow[], contactId: string): RelationshipTimelineItem[] {
  const row = rows.find((contact) => contact.id === contactId);
  if (!row) return [];
  const occurredAt = normalizedInstant(row.createdAt);
  if (!occurredAt) return [];
  const method = captureMethodFor(row.sourceType);
  const eventId = optional(row.metEventId);
  const eventTitle = optional(row.metEventTitle);
  const title = eventTitle && (method === "event_exchange" || method === "business_card" || method === "qr")
    ? { zh: `在「${eventTitle}」认识`, en: `Met at ${eventTitle}` }
    : CAPTURE_TITLE[method];
  return [{
    id: `capture:${row.id}`,
    source: "capture",
    contactId,
    occurredAt,
    occurredAtPrecision: "instant",
    title,
    ...(eventId ? { eventId } : {}),
    ref: { store: "contacts", recordId: row.id },
    detail: { captureMethod: method },
  }];
}

function compareItems(left: RelationshipTimelineItem, right: RelationshipTimelineItem): number {
  // occurredAt 都是 toISOString() 形式，字典序即时间序。
  if (left.occurredAt !== right.occurredAt) return left.occurredAt < right.occurredAt ? 1 : -1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** 跨联系人按 occurredAt 降序取前 N（同刻按 id），按 id 去重。 */
export function mergeRelationshipTimelineItems(
  items: readonly RelationshipTimelineItem[],
  limit: number,
): RelationshipTimelineItem[] {
  const seen = new Set<string>();
  const unique: RelationshipTimelineItem[] = [];
  for (const item of [...items].sort(compareItems)) {
    const key = `${item.contactId}\u0000${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.slice(0, Math.max(0, Math.floor(limit)));
}

export function buildRelationshipTimeline(
  input: RelationshipTimelineSources,
  contactId: string,
): RelationshipTimelineResult {
  const items = [
    ...memoItems(input.detailStates ?? [], contactId),
    ...encounterItems(input.encounters ?? [], contactId),
    ...noteItems(input.notes ?? [], contactId),
    ...planItems(input.planLog ?? [], contactId),
    ...scheduleItems(input.schedule ?? [], contactId),
    ...taskItems(input.tasks ?? [], contactId),
    ...captureItem(input.contacts ?? [], contactId),
  ];
  const unavailable = new Set(input.unavailableSources ?? []);
  return {
    items: mergeRelationshipTimelineItems(items, Number.MAX_SAFE_INTEGER),
    unavailableSources: RELATIONSHIP_TIMELINE_SOURCES.filter((source) => unavailable.has(source)),
  };
}
