/**
 * agent-design AG02: the two to-do operations a card can carry in this sprint (设计稿附录 B「Todo」),
 * todo.create and todo.update — how an operation is frozen from an intent and the current data,
 * how its target is read back at the click, the plain text a user reads on the card, and the
 * executors that apply an approved operation through the to-do service (its own idempotency key
 * and, for an update, the record's updatedAt as the expected version).
 */
import type { ContactCardReader } from "../../agent-v1/domains/contact/types";
import type { TaskItemDTO } from "../../tasks/contract";
import { taskLinksOf } from "../../tasks/task-links";
import type { TaskService } from "../../tasks/service";
import type { AgentCardOperationDisplayContract } from "../../../shared/contract/agent-v1";
import type { AgentActionOperationPayload } from "./contract";
import type { AgentActionExecutor } from "./executor-registry";

export const TODO_CREATE = "todo.create";
export const TODO_UPDATE = "todo.update";
export const TODO_FIELDS = ["title", "plannedDate", "dueAt"] as const;
export type TodoField = (typeof TODO_FIELDS)[number];

/**
 * agent-design AG10 (设计稿 §3.5 从同一篇笔记到 Todo): what a to-do made from a memo also holds — the person it is about,
 * the memo and its version, and the memo's own sentence (kept in the to-do's notes, so the same sentence is found again
 * when the memo is organized a second time). Display names are frozen with the card.
 */
export interface TodoFromMemo {
  relatedContactIds?: string[];
  sourceNoteId?: string;
  sourceNoteVersion?: number;
  notes?: string;
}

export interface TodoCreateShown {
  /** Contact id → name, for the card's "about" row. */
  names?: Record<string, string>;
  /** The memo's title, for the card's "from" row. */
  sourceTitle?: string;
  /** The memo's sentence the to-do comes from. */
  sentence?: string;
  /** The deadline was said as a day only ("最迟 11 月 25 日"): the card shows the day, not a time. */
  dueDayOnly?: boolean;
}

export type TodoOperationIntent =
  | { capability: typeof TODO_CREATE; set: Partial<Record<TodoField, string | null>> & TodoFromMemo; shown?: TodoCreateShown }
  | { capability: typeof TODO_UPDATE; targetId: string; set: Partial<Record<TodoField, string | null>> };

export type CardLocale = "zh" | "ja" | "en";

export function cardLocale(value: string | null | undefined): CardLocale {
  return value === "ja" || value === "en" ? value : "zh";
}

/** What a target looks like now: null when it no longer exists (or is not this account's). */
export interface TodoSnapshot {
  title: string;
  plannedDate: string | null;
  dueAt: string | null;
  updatedAt: string;
  status: string;
  /** agent-design AG13: the people and events, read as lists (an older to-do's single fields become zero or one). */
  relatedContactIds?: string[];
  relatedEventRefs?: { kind: "platform" | "private"; id: string }[];
}

export interface TodoReader {
  read(taskId: string): Promise<TodoSnapshot | null>;
  /** agent-design AG12: the contact items of a card read through this (absent: contact items cannot be prepared). */
  contacts?: ContactCardReader | null;
}

export function createTodoReader(tasks: Pick<TaskService, "get">, actorId: string): TodoReader {
  return {
    async read(taskId) {
      const task: TaskItemDTO | null = await tasks.get({ actorId, taskId });
      if (!task || task.status === "cancelled") return null;
      const links = taskLinksOf(task);
      return { dueAt: task.dueAt ?? null, plannedDate: task.plannedDate ?? null, relatedContactIds: links.contactIds, relatedEventRefs: links.eventRefs, status: task.status, title: task.title, updatedAt: task.updatedAt };
    },
  };
}

const WEEKDAY: Record<"ja" | "zh", string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A calendar day (YYYY-MM-DD) as a reader sees it, with its weekday. */
export function dayText(value: string, locale: CardLocale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  if (locale === "en") return `${WEEKDAY_EN[weekday]}, ${MONTH_EN[month]} ${day}`;
  if (locale === "ja") return `${month + 1}月${day}日（${WEEKDAY.ja[weekday]}）`;
  return `${month + 1}月${day}日（${WEEKDAY.zh[weekday]}）`;
}

function instantText(value: string, locale: CardLocale, timeZone: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" })
    .formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return `${dayText(`${parts.year}-${parts.month}-${String(parts.day).padStart(2, "0")}`, locale)} ${parts.hour}:${parts.minute}`;
}

const WORDS: Record<CardLocale, {
  field: Record<TodoField, string>;
  none: string;
  create: (title: string, details: string) => string;
  update: (title: string, changes: string) => string;
  cardCreate: string;
  cardUpdate: string;
  cardMany: (count: number) => string;
}> = {
  en: {
    cardCreate: "Add a to-do",
    cardMany: (count) => `${count} changes to your to-dos`,
    cardUpdate: "Change a to-do",
    create: (title, details) => `New to-do "${title}"${details ? `, ${details}` : ""}`,
    field: { dueAt: "due", plannedDate: "planned for", title: "title" },
    none: "not set",
    update: (title, changes) => `To-do "${title}": ${changes}`,
  },
  ja: {
    cardCreate: "タスクを追加",
    cardMany: (count) => `タスクの変更 ${count} 件`,
    cardUpdate: "タスクを変更",
    create: (title, details) => `タスク「${title}」を追加${details ? `（${details}）` : ""}`,
    field: { dueAt: "期限", plannedDate: "予定日", title: "タイトル" },
    none: "未設定",
    update: (title, changes) => `タスク「${title}」：${changes}`,
  },
  zh: {
    cardCreate: "新增一条待办",
    cardMany: (count) => `待办的${count}项修改`,
    cardUpdate: "修改一条待办",
    create: (title, details) => `新增待办「${title}」${details ? `，${details}` : ""}`,
    field: { dueAt: "截止", plannedDate: "计划日", title: "标题" },
    none: "未设",
    update: (title, changes) => `待办「${title}」：${changes}`,
  },
};

function valueText(field: TodoField, value: unknown, locale: CardLocale, timeZone: string): string {
  if (value === null || value === undefined || value === "") return WORDS[locale].none;
  const text = String(value);
  if (field === "plannedDate") return dayText(text, locale);
  if (field === "dueAt") return instantText(text, locale, timeZone);
  return locale === "en" ? `"${text}"` : `「${text}」`;
}

/** The line a user reads for one operation: what record, from what to what, days with weekdays. */
export function todoOperationText(op: Pick<AgentActionOperationPayload, "capability" | "before" | "after" | "shown">, locale: CardLocale, timeZone = process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo"): string {
  const words = WORDS[locale];
  const after = (op.after ?? {}) as Record<string, unknown>;
  if (op.capability === TODO_CREATE) {
    const shown = (op.shown ?? {}) as TodoCreateShown;
    const details = TODO_FIELDS.filter((field) => field !== "title" && after[field])
      .map((field) => (field === "dueAt" && shown.dueDayOnly && typeof after.dueAt === "string" ? `${FROM_MEMO[locale].dueBy} ${dayText(localDay(after.dueAt, timeZone), locale)}` : `${words.field[field]} ${valueText(field, after[field], locale, timeZone)}`))
      .join(locale === "en" ? ", " : "，");
    // AG21c (R54): the text line names everything the card row names — the people the to-do is linked to too.
    const related = Array.isArray(after.relatedContactIds) ? (after.relatedContactIds as string[]).map((id) => shown.names?.[id] ?? "").filter(Boolean) : [];
    const people = related.length ? `${FROM_MEMO[locale].about} ${related.join(FROM_MEMO[locale].join)}` : "";
    return words.create(String(after.title ?? ""), [details, people].filter(Boolean).join(locale === "en" ? ", " : "，"));
  }
  const before = (op.before ?? {}) as Record<string, unknown>;
  const title = String((op.shown as Record<string, unknown> | undefined)?.title ?? "");
  const changes = TODO_FIELDS.filter((field) => field in after)
    .map((field) => `${words.field[field]} ${valueText(field, before[field], locale, timeZone)} → ${valueText(field, after[field], locale, timeZone)}`)
    .join(locale === "en" ? "; " : "；");
  return words.update(title, changes);
}

const DISPLAY: Record<CardLocale, { record: (title: string) => string; label: Record<TodoField, string> }> = {
  en: { label: { dueAt: "Due", plannedDate: "Planned date", title: "Title" }, record: (title) => `To-do "${title}"` },
  ja: { label: { dueAt: "期限", plannedDate: "予定日", title: "タイトル" }, record: (title) => `タスク「${title}」` },
  zh: { label: { dueAt: "截止时间", plannedDate: "计划日期", title: "标题" }, record: (title) => `待办「${title}」` },
};

/**
 * AG07 (approved visual draft): how the card shows one to-do item — which record, and one row per field with
 * its label and the value before and after, in the card's language. Frozen with the card; clients render it as is.
 */
export function todoOperationDisplay(op: Pick<AgentActionOperationPayload, "capability" | "before" | "after" | "shown">, locale: CardLocale, timeZone = process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo"): AgentCardOperationDisplayContract {
  const words = DISPLAY[locale];
  const after = (op.after ?? {}) as Record<string, unknown>;
  const plain = (field: TodoField, value: unknown) => (field === "title" ? (value === null || value === undefined || value === "" ? WORDS[locale].none : String(value)) : valueText(field, value, locale, timeZone));
  if (op.capability === TODO_CREATE) {
    const shown = (op.shown ?? {}) as TodoCreateShown;
    const rows: AgentCardOperationDisplayContract["rows"][number][] = TODO_FIELDS.filter((field) => field !== "title" && after[field]).map((field) => (field === "dueAt" && shown.dueDayOnly && typeof after.dueAt === "string"
      ? { after: dayText(localDay(after.dueAt, timeZone), locale), field, label: FROM_MEMO[locale].dueBy }
      : { after: plain(field, after[field]), field, label: words.label[field] }));
    // AG10: a to-do from a memo also shows who it is about and the memo's sentence it comes from.
    const related = Array.isArray(after.relatedContactIds) ? (after.relatedContactIds as string[]) : [];
    if (related.length) rows.push({ after: related.map((id) => shown.names?.[id] ?? id).join(FROM_MEMO[locale].join), field: "relatedContactIds", label: FROM_MEMO[locale].about });
    if (shown.sentence) rows.push({ after: FROM_MEMO[locale].from(shown.sourceTitle ?? "", shown.sentence), field: "sourceNoteId", label: FROM_MEMO[locale].fromLabel });
    return { change: "create", record: words.record(String(after.title ?? "")), rows };
  }
  const before = (op.before ?? {}) as Record<string, unknown>;
  return {
    change: "update",
    record: words.record(String((op.shown as Record<string, unknown> | undefined)?.title ?? "")),
    rows: TODO_FIELDS.filter((field) => field in after).map((field) => ({ after: plain(field, after[field]), before: plain(field, before[field]), field, label: words.label[field] })),
  };
}

const FROM_MEMO: Record<CardLocale, { about: string; dueBy: string; fromLabel: string; join: string; from: (title: string, sentence: string) => string }> = {
  en: { about: "About", dueBy: "Due by", from: (title, sentence) => `${title ? `note "${title}": ` : ""}"${sentence}"`, fromLabel: "From", join: ", " },
  ja: { about: "関連", dueBy: "期限（この日まで）", from: (title, sentence) => `${title ? `メモ「${title}」：` : ""}「${sentence}」`, fromLabel: "元のメモ", join: "、" },
  zh: { about: "关联人", dueBy: "最迟", from: (title, sentence) => `${title ? `笔记「${title}」：` : ""}「${sentence}」`, fromLabel: "出自", join: "、" },
};

function localDay(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function todoCardTitle(operations: readonly Pick<AgentActionOperationPayload, "capability">[], locale: CardLocale): string {
  const words = WORDS[locale];
  if (operations.length !== 1) return words.cardMany(operations.length);
  return operations[0].capability === TODO_CREATE ? words.cardCreate : words.cardUpdate;
}

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

/**
 * Freezes one operation from its intent and the current data. For an update the target must still
 * exist; `before` holds only the fields being changed and `shown` the title the card names it by.
 * Returns null for an update whose target is gone (the caller reports it).
 */
export async function prepareTodoOperation(input: {
  intent: TodoOperationIntent;
  actionId: string;
  revision: number;
  index: number;
  reader: TodoReader;
  locale: CardLocale;
}): Promise<AgentActionOperationPayload | null> {
  const { intent } = input;
  const operationId = `${input.actionId}:op${input.index + 1}`;
  const base = {
    compensation: { supported: false },
    dependsOn: [] as string[],
    effects: [] as string[],
    idempotencyKey: `${input.actionId}:r${input.revision}:op${input.index + 1}`,
    operationId,
    partId: "p1",
    payloadVersion: 1,
    riskLevel: "write" as const,
  };
  if (intent.capability === TODO_CREATE) {
    // AG10: a to-do from a memo states both dates (null when the memo gives none) and keeps its source and person.
    const fromMemo = Boolean(intent.set.sourceNoteId);
    const after = fromMemo
      ? clean({ dueAt: intent.set.dueAt ?? null, notes: intent.set.notes, plannedDate: intent.set.plannedDate ?? null, relatedContactIds: intent.set.relatedContactIds?.length ? [...intent.set.relatedContactIds] : undefined, sourceNoteId: intent.set.sourceNoteId, sourceNoteVersion: intent.set.sourceNoteVersion, title: intent.set.title })
      : clean({ dueAt: intent.set.dueAt, plannedDate: intent.set.plannedDate, relatedContactIds: intent.set.relatedContactIds?.length ? [...intent.set.relatedContactIds] : undefined, title: intent.set.title });
    const op: AgentActionOperationPayload = {
      ...base,
      after,
      capability: TODO_CREATE,
      executorKey: TODO_CREATE,
      operationType: "create_todo",
      payload: { ...after },
      preconditions: { targetExists: false },
      preview: "",
      ...(intent.shown ? { shown: { ...intent.shown } } : {}),
    };
    return { ...op, display: todoOperationDisplay(op, input.locale), preview: todoOperationText(op, input.locale) };
  }
  const current = await input.reader.read(intent.targetId);
  if (!current) return null;
  const fields = TODO_FIELDS.filter((field) => field in intent.set);
  const before = Object.fromEntries(fields.map((field) => [field, current[field]]));
  const after = Object.fromEntries(fields.map((field) => [field, intent.set[field] ?? null]));
  const op: AgentActionOperationPayload = {
    ...base,
    after,
    before,
    capability: TODO_UPDATE,
    executorKey: TODO_UPDATE,
    operationType: "update_todo",
    payload: { patch: after, taskId: intent.targetId },
    preconditions: { targetExists: true, versionToken: current.updatedAt },
    preview: "",
    shown: { title: current.title },
    targetRef: { collection: "tasks", id: intent.targetId },
  };
  return { ...op, display: todoOperationDisplay(op, input.locale), preview: todoOperationText(op, input.locale) };
}

/** The intent an operation was frozen from (regeneration keeps it, 设计稿 §5.2). */
export function todoIntentOf(op: AgentActionOperationPayload): TodoOperationIntent | null {
  if (op.capability === TODO_CREATE) return { capability: TODO_CREATE, set: { ...(op.after as Record<string, string>) }, ...(op.shown ? { shown: { ...(op.shown as TodoCreateShown) } } : {}) };
  if (op.capability === TODO_UPDATE && op.targetRef) return { capability: TODO_UPDATE, set: { ...(op.after as Record<string, string | null>) }, targetId: op.targetRef.id };
  return null;
}

export interface TodoTargetCheck {
  changed: boolean;
  versionToken?: string;
  rows: { field: string; shownBefore: unknown; now: unknown; to?: unknown }[];
}

/**
 * At the click: what the card showed — the values being changed, the title naming the record,
 * the record existing — compared with now. Other fields changing does not count (设计稿 §5.2).
 */
export async function checkTodoTarget(op: AgentActionOperationPayload, reader: TodoReader): Promise<TodoTargetCheck> {
  if (op.capability !== TODO_UPDATE || !op.targetRef) return { changed: false, rows: [] };
  const current = await reader.read(op.targetRef.id);
  if (!current) return { changed: true, rows: [{ field: "record", now: null, shownBefore: (op.shown as Record<string, unknown> | undefined)?.title ?? null }] };
  const rows: TodoTargetCheck["rows"] = [];
  const shownTitle = (op.shown as Record<string, unknown> | undefined)?.title;
  if (shownTitle !== undefined && shownTitle !== current.title) rows.push({ field: "title", now: current.title, shownBefore: shownTitle });
  for (const [field, value] of Object.entries(op.before ?? {})) {
    const now = (current as unknown as Record<string, unknown>)[field] ?? null;
    // AG13: the link lists compare by value.
    if (JSON.stringify(value ?? null) !== JSON.stringify(now)) rows.push({ field, now, shownBefore: value ?? null, to: (op.after as Record<string, unknown> | undefined)?.[field] });
  }
  return { changed: rows.length > 0, rows, versionToken: current.updatedAt };
}

/** The two executors (AG02 scope: only to-dos). They write through the to-do service. */
export function createTodoExecutors(input: { tasks: Pick<TaskService, "create" | "update">; actorId: string }): readonly AgentActionExecutor[] {
  const text = (payload: Readonly<Record<string, unknown>>, key: string) => (typeof payload[key] === "string" && String(payload[key]).trim() ? String(payload[key]).trim() : undefined);
  return [
    {
      key: TODO_CREATE,
      riskLevel: "write",
      async execute(payload, context) {
        const title = text(payload, "title");
        if (!title) throw new Error("title is required.");
        const result = await input.tasks.create({
          actorId: input.actorId,
          category: "work",
          idempotencyKey: context.idempotencyKey,
          now: context.now,
          source: "ai_confirmed",
          title,
          ...(text(payload, "plannedDate") ? { plannedDate: text(payload, "plannedDate") } : {}),
          ...(text(payload, "dueAt") ? { dueAt: text(payload, "dueAt") } : {}),
        });
        return { resultRef: `tasks:${result.task.id}`, summary: "To-do created in Orbit." };
      },
    },
    {
      key: TODO_UPDATE,
      riskLevel: "write",
      async execute(payload, context) {
        const taskId = text(payload, "taskId");
        const expectedUpdatedAt = text(payload, "expectedUpdatedAt");
        if (!taskId || !expectedUpdatedAt) throw new Error("taskId and expectedUpdatedAt are required.");
        const patch = (payload.patch ?? {}) as Record<string, string | null>;
        const result = await input.tasks.update({ actorId: input.actorId, expectedUpdatedAt, idempotencyKey: context.idempotencyKey, now: context.now, patch, taskId });
        return { resultRef: `tasks:${result.task.id}`, summary: "To-do updated in Orbit." };
      },
    },
  ];
}
