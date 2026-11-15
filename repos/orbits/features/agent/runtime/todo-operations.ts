/**
 * agent-design AG02: the two to-do operations a card can carry in this sprint (设计稿附录 B「Todo」),
 * todo.create and todo.update — how an operation is frozen from an intent and the current data,
 * how its target is read back at the click, the plain text a user reads on the card, and the
 * executors that apply an approved operation through the to-do service (its own idempotency key
 * and, for an update, the record's updatedAt as the expected version).
 */
import type { TaskItemDTO } from "../../tasks/contract";
import type { TaskService } from "../../tasks/service";
import type { AgentActionOperationPayload } from "./contract";
import type { AgentActionExecutor } from "./executor-registry";

export const TODO_CREATE = "todo.create";
export const TODO_UPDATE = "todo.update";
export const TODO_FIELDS = ["title", "plannedDate", "dueAt"] as const;
export type TodoField = (typeof TODO_FIELDS)[number];

export type TodoOperationIntent =
  | { capability: typeof TODO_CREATE; set: Partial<Record<TodoField, string>> }
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
}

export interface TodoReader {
  read(taskId: string): Promise<TodoSnapshot | null>;
}

export function createTodoReader(tasks: Pick<TaskService, "get">, actorId: string): TodoReader {
  return {
    async read(taskId) {
      const task: TaskItemDTO | null = await tasks.get({ actorId, taskId });
      if (!task || task.status === "cancelled") return null;
      return { dueAt: task.dueAt ?? null, plannedDate: task.plannedDate ?? null, status: task.status, title: task.title, updatedAt: task.updatedAt };
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
    cardMany: (count) => `待办的 ${count} 项修改`,
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
    const details = TODO_FIELDS.filter((field) => field !== "title" && after[field])
      .map((field) => (locale === "en" ? `${words.field[field]} ${valueText(field, after[field], locale, timeZone)}` : `${words.field[field]} ${valueText(field, after[field], locale, timeZone)}`))
      .join(locale === "en" ? ", " : "，");
    return words.create(String(after.title ?? ""), details);
  }
  const before = (op.before ?? {}) as Record<string, unknown>;
  const title = String((op.shown as Record<string, unknown> | undefined)?.title ?? "");
  const changes = TODO_FIELDS.filter((field) => field in after)
    .map((field) => `${words.field[field]} ${valueText(field, before[field], locale, timeZone)} → ${valueText(field, after[field], locale, timeZone)}`)
    .join(locale === "en" ? "; " : "；");
  return words.update(title, changes);
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
    const after = clean({ dueAt: intent.set.dueAt, plannedDate: intent.set.plannedDate, title: intent.set.title });
    const op: AgentActionOperationPayload = {
      ...base,
      after,
      capability: TODO_CREATE,
      executorKey: TODO_CREATE,
      operationType: "create_todo",
      payload: { ...after },
      preconditions: { targetExists: false },
      preview: "",
    };
    return { ...op, preview: todoOperationText(op, input.locale) };
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
  return { ...op, preview: todoOperationText(op, input.locale) };
}

/** The intent an operation was frozen from (regeneration keeps it, 设计稿 §5.2). */
export function todoIntentOf(op: AgentActionOperationPayload): TodoOperationIntent | null {
  if (op.capability === TODO_CREATE) return { capability: TODO_CREATE, set: { ...(op.after as Record<string, string>) } };
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
    const now = current[field as TodoField] ?? null;
    if ((value ?? null) !== now) rows.push({ field, now, shownBefore: value ?? null, to: (op.after as Record<string, unknown> | undefined)?.[field] });
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
