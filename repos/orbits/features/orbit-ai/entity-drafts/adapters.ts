import type { EntityDraft } from "./contract";
import type { EntityDraftWriteAdapter } from "./service";

/**
 * Sprint 0085: one adapter per entity kind.
 *
 * Each one writes through the domain service that already owns that record —
 * no new write endpoint exists for the agent, so every rule those services
 * enforce (ownership, idempotency, validation) applies unchanged to a draft the
 * user confirmed. The adapters take narrow structural dependencies so they can
 * be tested without standing up the real services.
 */

function required(draft: EntityDraft, field: string): string {
  const value = draft.fields[field]?.trim();
  if (!value) throw new Error(`草稿缺少必填字段：${field}`);
  return value;
}

function optional(draft: EntityDraft, field: string): string | undefined {
  const value = draft.fields[field]?.trim();
  return value ? value : undefined;
}

function instant(draft: EntityDraft, field: string): string | undefined {
  const value = optional(draft, field);
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} 不是一个可识别的时间`);
  return new Date(parsed).toISOString();
}

function sourceIds(draft: EntityDraft, kind: EntityDraft["sourceRefs"][number]["kind"]): string[] {
  return draft.sourceRefs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
}

/** Mirrors the categories the existing task-interaction service already infers. */
const TASK_CATEGORY_PATTERNS = [
  [/(?:联系|跟进|回复|引荐|介绍|人脉)/u, "relationship"],
  [/(?:会面|见面|会议|拜访|面谈)/u, "meeting"],
  [/(?:活动|交流会|路演|展会|峰会)/u, "event"],
  [/(?:购买|家里|个人|健身|医院)/u, "personal"],
] as const;

export function taskCategoryForTitle(title: string): string {
  for (const [pattern, category] of TASK_CATEGORY_PATTERNS) {
    if (pattern.test(title)) return category;
  }
  return "work";
}

export interface TaskCreatePort {
  create: (input: {
    actorId: string;
    title: string;
    category: string;
    notes?: string;
    dueAt?: string;
    idempotencyKey: string;
    now: string;
    relatedContactId?: string;
    sourceNoteId?: string;
  }) => Promise<{ task: { id: string } }>;
}

export function createTaskDraftAdapter(port: TaskCreatePort): EntityDraftWriteAdapter {
  return {
    kind: "task",
    async write({ actorId, draft, idempotencyKey, now }) {
      const title = required(draft, "title");
      const [contactId] = sourceIds(draft, "contact");
      const [noteId] = sourceIds(draft, "note");
      const result = await port.create({
        actorId,
        category: draft.fields.category?.trim() || taskCategoryForTitle(title),
        idempotencyKey,
        now,
        title,
        ...(instant(draft, "dueAt") ? { dueAt: instant(draft, "dueAt") } : {}),
        ...(optional(draft, "notes") ? { notes: optional(draft, "notes") } : {}),
        ...(contactId ? { relatedContactId: contactId } : {}),
        ...(noteId ? { sourceNoteId: noteId } : {}),
      });
      return { recordId: result.task.id };
    },
  };
}

export interface NoteCreatePort {
  create: (input: {
    actorId: string;
    title?: string;
    body: string;
    contactIds?: readonly string[];
    eventIds?: readonly string[];
    idempotencyKey: string;
    now: string;
  }) => Promise<{ id: string }>;
}

export function createNoteDraftAdapter(port: NoteCreatePort): EntityDraftWriteAdapter {
  return {
    kind: "note",
    async write({ actorId, draft, idempotencyKey, now }) {
      const title = required(draft, "title");
      const created = await port.create({
        actorId,
        // A note whose body the model left empty still has its title to carry;
        // writing an empty body would create a record with nothing in it.
        body: optional(draft, "body") ?? title,
        contactIds: sourceIds(draft, "contact"),
        eventIds: sourceIds(draft, "event"),
        idempotencyKey,
        now,
        title,
      });
      return { recordId: created.id };
    },
  };
}

export interface ScheduleCreatePort {
  create: (
    actorId: string,
    body: {
      title: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
      idempotencyKey: string;
    },
  ) => Promise<{ id: string }>;
}

export function createScheduleDraftAdapter(port: ScheduleCreatePort): EntityDraftWriteAdapter {
  return {
    kind: "schedule",
    async write({ actorId, draft, idempotencyKey }) {
      const startsAt = instant(draft, "startsAt");
      if (!startsAt) throw new Error("草稿缺少必填字段：startsAt");
      const created = await port.create(actorId, {
        idempotencyKey,
        startsAt,
        title: required(draft, "title"),
        ...(instant(draft, "endsAt") ? { endsAt: instant(draft, "endsAt") } : {}),
        ...(optional(draft, "location") ? { location: optional(draft, "location") } : {}),
      });
      return { recordId: created.id };
    },
  };
}

export interface EventCreatePort {
  createEvent: (input: {
    actorId: string;
    title: string;
    startsAt: string;
    endsAt?: string;
    venue?: string;
    description?: string;
  }) => Promise<
    | { success: true; data: { event: { id: string } } }
    | { success: false; error?: { message?: string } }
  >;
}

export function createEventDraftAdapter(port: EventCreatePort): EntityDraftWriteAdapter {
  return {
    kind: "event",
    async write({ actorId, draft }) {
      const startsAt = instant(draft, "startsAt");
      if (!startsAt) throw new Error("草稿缺少必填字段：startsAt");
      const result = await port.createEvent({
        actorId,
        startsAt,
        title: required(draft, "title"),
        ...(instant(draft, "endsAt") ? { endsAt: instant(draft, "endsAt") } : {}),
        ...(optional(draft, "location") ? { venue: optional(draft, "location") } : {}),
        ...(optional(draft, "description") ? { description: optional(draft, "description") } : {}),
      });
      if (result.success !== true) {
        throw new Error(result.error?.message ?? "活动创建未成功");
      }
      return { recordId: result.data.event.id };
    },
  };
}
