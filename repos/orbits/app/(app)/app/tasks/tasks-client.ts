import { z } from "zod";
import { taskPageSchema } from "../../../../shared/api-schema/task-page";
import { calendarDate, validTimeZone } from "../../../../features/tasks/local-date-time";
import {
  activitiesToView, remindersToView, suggestionsToView, taskToView,
  type TaskView, type TaskRowView,
} from "./tasks-view-model";

export class TasksClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function tasksErrorMessage(error: unknown, english: boolean): string {
  const code = error instanceof TasksClientError ? error.code : "UNKNOWN";
  const copy: Record<string, [string, string]> = {
    UNAUTHORIZED: ["登录已失效，请重新登录。", "Your session expired. Sign in again."],
    NOT_FOUND: ["这条待办已删除或无权查看。", "This task was deleted or is not accessible."],
    CONFLICT: ["待办已在其他页面更新。请保留输入，刷新后再保存。", "This task changed elsewhere. Keep your draft and refresh before saving."],
    INVALID_RESPONSE: ["待办数据暂时无法读取，请重试。", "Task data could not be read. Try again."],
    NETWORK_ERROR: ["连接失败，请检查网络后重试。", "Connection failed. Check your network and try again."],
    EMPTY_TITLE: ["请填写待办标题。", "Enter a task title."],
    NOTES_CLEAR_UNSUPPORTED: ["暂不支持清空已有备注，请保留或修改内容。", "Existing notes cannot be cleared yet. Keep or edit the text."],
    INVALID_REMINDER: ["提醒时间已过或无效。请返回列表并重新打开待办，再设置新提醒。", "The reminder time has passed or is invalid. Return to All tasks and reopen this task to set a new reminder."],
  };
  return copy[code]?.[english ? 1 : 0] ?? (english ? "The action failed. Try again." : "操作未完成，请重试。");
}

export function createTasksClient(fetcher: typeof fetch = fetch) {
  // Retain an uncertain operation within this mounted client. A changed payload
  // is new intent; a successful operation releases its key for intentional repeats.
  const pending = new Map<string, { fingerprint: string; key: string }>();
  const reminderTimes = new Map<string, { kind: "one_hour" | "explicit"; fireAt: string }>();
  async function request<T>(path: string, decode: (value: unknown) => T, method = "GET", body?: object): Promise<T> {
    const slot = `${method}:${path}`;
    let operation: { fingerprint: string; key: string } | undefined;
    if (body) {
      const { idempotencyKey: _key, ...input } = body as Record<string, unknown>;
      const fingerprint = JSON.stringify(input);
      operation = pending.get(slot);
      if (operation?.fingerprint !== fingerprint) operation = { fingerprint, key: key() };
      pending.set(slot, operation);
      body = { ...input, idempotencyKey: operation.key };
    }
    let response: Response;
    try {
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
    } catch { throw new TasksClientError("NETWORK_ERROR", "Network request failed"); }
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      const code = response.status === 401 ? "UNAUTHORIZED" : payload?.error?.code ?? "INVALID_RESPONSE";
      throw new TasksClientError(code, payload?.error?.message ?? "Request failed");
    }
    try {
      const decoded = decode(payload.data);
      if (pending.get(slot) === operation) pending.delete(slot);
      return decoded;
    }
    catch { throw new TasksClientError("INVALID_RESPONSE", "Unexpected response data"); }
  }

  const key = () => `web:task:${globalThis.crypto.randomUUID()}`;
  const pathFor = (id: string) => `/api/tasks/${encodeURIComponent(id)}`;
  const single = (data: unknown) => taskToView(z.object({ task: z.unknown() }).parse(data).task);
  const dismissed = (id: string) => (data: unknown) => {
    z.object({ suggestion: z.object({ id: z.literal(id), status: z.literal("dismissed") }) }).parse(data);
  };
  const ignore = (data: unknown) => { z.record(z.string(), z.unknown()).parse(data); };
  function titleValue(title: string) {
    if (!title.trim()) throw new TasksClientError("EMPTY_TITLE", "Empty title");
    return title.trim();
  }

  return {
    loadPage: (status: "open" | "completed", query = "", cursor: string | null = null) => {
      const params = new URLSearchParams({ status, query: query.trim(), limit: "30" });
      if (cursor) params.set("cursor", cursor);
      return request(`/api/tasks/page?${params}`, value => {
        const page = taskPageSchema.parse(value);
        if (page.status !== status || page.scope !== "all" || page.query !== query.trim()) throw new Error("Task page scope mismatch");
        const items: TaskRowView[] = page.items.map(item => ({ id: item.id, title: item.titlePreview, status: item.status, category: item.category,
          ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}), ...(item.dueAt ? { dueAt: item.dueAt } : {}), href: `/app/tasks/${encodeURIComponent(item.id)}` }));
        return { ...page, items };
      });
    },
    /** New Task-list source. The legacy loadPage URL and row shape stay unchanged. */
    loadScopedPage: (status: "open" | "completed", scope: "all" | "relationship" | "personal", query = "", cursor: string | null = null, context?: { today: string; timeZone: string }) => {
      const params = new URLSearchParams({ status, scope, query: query.trim(), limit: "30" });
      if (cursor) params.set("cursor", cursor);
      if (context) { params.set("today", context.today); params.set("timeZone", context.timeZone); }
      return request(`/api/tasks/page?${params}`, value => {
        const page = taskPageSchema.parse(value);
        if (page.status !== status || page.scope !== scope || page.query !== query.trim()) throw new Error("Task page scope mismatch");
        const items: TaskRowView[] = page.items.map(item => ({ id: item.id, title: item.titlePreview, status: item.status, category: item.category,
          ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}), ...(item.dueAt ? { dueAt: item.dueAt } : {}),
          relatedContact: item.relatedContact, relationship: item.relationship ?? (item.category === "relationship" || Boolean(item.relatedContact)), href: `/app/tasks/${encodeURIComponent(item.id)}` }));
        return { ...page, items };
      });
    },
    loadTask: (id: string) => request(pathFor(id), single),
    loadSuggestions: () => request("/api/task-suggestions", suggestionsToView),
    loadActivities: (id: string) => request(`${pathFor(id)}/activities`, activitiesToView),
    loadReminders: (id: string) => request(`/api/reminders?${new URLSearchParams({ targetType: "task", targetId: id })}`, remindersToView),
    async create(title: string, plannedDate?: string) {
      const normalized = titleValue(title);
      if (plannedDate !== undefined && !calendarDate(plannedDate)) throw new TasksClientError("INVALID_DATE", "Invalid calendar date");
      const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).formatToParts(new Date());
      const field = (type: string) => parts.find((part) => part.type === type)!.value;
      return request("/api/tasks", value => {
        const task = single(value);
        if (plannedDate !== undefined && task.plannedDate !== plannedDate) throw new Error("Task create receipt date mismatch");
        return task;
      }, "POST", {
        title: normalized, category: "other", plannedDate: plannedDate ?? `${field("year")}-${field("month")}-${field("day")}`, idempotencyKey: key(),
      });
    },
    async update(task: TaskView, title: string, notes: string) {
      const normalized = titleValue(title);
      if (task.notes && !notes.trim()) throw new TasksClientError("NOTES_CLEAR_UNSUPPORTED", "Cannot clear notes");
      return request(pathFor(task.id), single, "PATCH", {
        action: "update", expectedUpdatedAt: task.updatedAt, idempotencyKey: key(),
        patch: { title: normalized, ...(notes.trim() ? { notes: notes.trim() } : {}) },
      });
    },
    updateSchedule: (baseline: TaskView, patch: { plannedDate?: string | null; dueAt?: string | null; location?: string | null }) => request(pathFor(baseline.id), data => {
      const updated = single(data);
      if (updated.id !== baseline.id || !baseline.ownerUserId || updated.ownerUserId !== baseline.ownerUserId || updated.accountId !== baseline.accountId || updated.status === "cancelled" || Date.parse(updated.updatedAt) <= Date.parse(baseline.updatedAt)) throw new Error("Invalid task receipt");
      for (const field of ["plannedDate", "dueAt", "location"] as const) {
        if (patch[field] === undefined) continue;
        if (patch[field] === null ? updated[field] !== undefined : field === "dueAt" ? Date.parse(updated[field] ?? "") !== Date.parse(patch[field]!) : updated[field] !== patch[field]) throw new Error("Task receipt does not match saved fields");
      }
      return updated;
    }, "PATCH", { action: "update", expectedUpdatedAt: baseline.updatedAt, patch, idempotencyKey: key() }),
    setCompleted: (id: string, completed: boolean) => request(pathFor(id), single, "PATCH", {
      action: completed ? "complete" : "reopen", idempotencyKey: key(),
    }),
    remove: (id: string) => request(pathFor(id), ignore, "DELETE", { idempotencyKey: key() }),
    /** New task-list delete: stale details cannot silently delete a changed task. */
    removeWithVersion: (id: string, expectedUpdatedAt: string) => request(pathFor(id), data => {
      const removed = single(data);
      if (removed.id !== id) throw new Error("Task delete receipt mismatch");
      return removed;
    }, "DELETE", { expectedUpdatedAt, idempotencyKey: key() }),
    resolveSuggestion: (id: string, action: "accept" | "dismiss") => request<TaskView | void>(
      `/api/task-suggestions/${encodeURIComponent(id)}/${action}`, action === "accept" ? single : dismissed(id),
      "POST", { idempotencyKey: key() },
    ),
    async addReminder(task: TaskView, fireAt?: string, timeZone = "Asia/Tokyo", title = "待办提醒") {
      const kind = fireAt === undefined ? "one_hour" : "explicit";
      const previous = reminderTimes.get(task.id);
      fireAt ??= previous?.kind === "one_hour" ? previous.fireAt : new Date(Date.now() + 60 * 60 * 1000).toISOString();
      if (!Number.isFinite(Date.parse(fireAt)) || Date.parse(fireAt) <= Date.now()) throw new TasksClientError("INVALID_REMINDER", "Invalid reminder time");
      if (!validTimeZone(timeZone)) throw new TasksClientError("INVALID_TIME_ZONE", "Invalid time zone");
      reminderTimes.set(task.id, { kind, fireAt });
      await request("/api/reminders", ignore, "POST", {
        targetType: "task", targetId: task.id, fireAt, timeZone, channels: ["in_app"],
        title, body: task.title, deepLink: `/tasks/${encodeURIComponent(task.id)}`,
        createdBy: "user", idempotencyKey: key(),
      });
      reminderTimes.delete(task.id);
    },
    cancelReminder: (id: string) => request(`/api/reminders/${encodeURIComponent(id)}`, ignore, "PATCH", { action: "cancel", idempotencyKey: key() }),
  };
}

export type TasksClient = ReturnType<typeof createTasksClient>;
