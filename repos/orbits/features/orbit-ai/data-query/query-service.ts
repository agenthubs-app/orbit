import { AppError } from "../../../shared/errors/app-error";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { noteRecordFromLiveRecord } from "../../notes/note-record";
import { taskRecordFromLiveRecord } from "../../tasks/task-record";
import type { TaskItemDTO } from "../../tasks/contract";
import { canonicalScheduleItemSchema, type CanonicalScheduleItem } from "../../personal-schedule/authority-contract";

export const ACTOR_QUERY_TOOL_NAMES = [
  "notes.query",
  "tasks.query",
  "followups.query",
  "schedule.query",
] as const;

export type ActorQueryToolName = (typeof ACTOR_QUERY_TOOL_NAMES)[number];
export type ActorQueryDomain = "notes" | "tasks" | "followups" | "schedule";

export interface ActorScopedQueryInput {
  operation: "list" | "search" | "get";
  query: string;
  id?: string;
  cursor?: string;
  limit?: number;
  status?: string;
  from?: string;
  to?: string;
  contactId?: string;
  eventId?: string;
}

export interface ActorScopedQueryResult {
  domain: ActorQueryDomain;
  operation: ActorScopedQueryInput["operation"];
  items: readonly Record<string, unknown>[];
  total: number;
  truncated: boolean;
  nextCursor?: string;
  evidenceIds: readonly string[];
  usedDataDomains: readonly ActorQueryDomain[];
  unreadDataDomains: readonly ActorQueryDomain[];
}

const domains = ["notes", "tasks", "followups", "schedule"] as const;
const listBodyLimit = 240;
const detailBodyLimit = 4_000;
const taskDescriptionLimit = 1_000;
const scheduleDetailsLimit = 1_000;

function domainFor(toolName: ActorQueryToolName): ActorQueryDomain {
  return toolName.slice(0, toolName.indexOf(".")) as ActorQueryDomain;
}

function boundedText(value: string, max: number): { text: string; truncated: boolean } {
  return value.length > max
    ? { text: value.slice(0, max), truncated: true }
    : { text: value, truncated: false };
}

function decodeCursor(cursor: string | undefined, scope: string): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (decoded.scope !== scope || !Number.isSafeInteger(decoded.offset) || Number(decoded.offset) < 0) throw new Error();
    return Number(decoded.offset);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Query cursor is invalid for this request.");
  }
}

function encodeCursor(offset: number, scope: string): string {
  return Buffer.from(JSON.stringify({ offset, scope }), "utf8").toString("base64url");
}

function result(input: {
  domain: ActorQueryDomain;
  operation: ActorScopedQueryInput["operation"];
  items: readonly Record<string, unknown>[];
  total: number;
  nextCursor?: string;
}): ActorScopedQueryResult {
  const evidenceIds = [...new Set(input.items.flatMap((item) => Array.isArray(item.evidenceIds)
    ? item.evidenceIds.filter((id): id is string => typeof id === "string")
    : []))];
  return {
    domain: input.domain,
    operation: input.operation,
    items: input.items,
    total: input.total,
    truncated: Boolean(input.nextCursor),
    ...(input.nextCursor ? { nextCursor: input.nextCursor } : {}),
    evidenceIds,
    usedDataDomains: [input.domain],
    unreadDataDomains: domains.filter((domain) => domain !== input.domain),
  };
}

function assertGetIsAuthorized(input: ActorScopedQueryInput): string {
  const id = input.id?.trim();
  if (!id || !input.query.includes(id)) {
    throw new AppError("FORBIDDEN", "The requested id must appear in the current user instruction.");
  }
  return id;
}

async function queryNotes(input: {
  actorId: string;
  query: ActorScopedQueryInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ActorScopedQueryResult> {
  const records = await input.store.listRecords({
    collectionName: "notes",
    userId: input.actorId,
    workspaceId: input.workspaceId,
  });
  const notes = records
    .flatMap((record) => {
      const parsed = record.userId === input.actorId ? noteRecordFromLiveRecord(record, input.actorId) : null;
      return parsed ? [parsed.note] : [];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  if (input.query.operation === "get") {
    const id = assertGetIsAuthorized(input.query);
    const note = notes.find((candidate) => candidate.id === id);
    if (!note) return result({ domain: "notes", operation: "get", items: [], total: 0 });
    const body = boundedText(note.body, detailBodyLimit);
    return result({
      domain: "notes",
      operation: "get",
      items: [{
        id: note.id,
        title: note.title,
        body: body.text,
        bodyTruncated: body.truncated,
        contactIds: note.contactIds,
        eventIds: note.eventIds,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        evidenceIds: [],
      }],
      total: 1,
    });
  }
  const search = input.query.operation === "search" ? input.query.query.trim().toLocaleLowerCase() : "";
  const matched = notes.filter((note) =>
    (!input.query.contactId || note.contactIds.includes(input.query.contactId)) &&
    (!input.query.eventId || note.eventIds.includes(input.query.eventId)) &&
    (!search || `${note.title}\n${note.body}`.toLocaleLowerCase().includes(search)),
  );
  const limit = Math.min(10, Math.max(1, input.query.limit ?? 10));
  const scope = JSON.stringify(["notes", search, input.query.contactId ?? "", input.query.eventId ?? "", limit]);
  const offset = decodeCursor(input.query.cursor, scope);
  const page = matched.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return result({
    domain: "notes",
    operation: input.query.operation,
    items: page.map((note) => ({
      id: note.id,
      title: note.title,
      snippet: boundedText(note.body, listBodyLimit).text,
      contactIds: note.contactIds,
      eventIds: note.eventIds,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      evidenceIds: [],
    })),
    total: matched.length,
    ...(nextOffset < matched.length ? { nextCursor: encodeCursor(nextOffset, scope) } : {}),
  });
}

function legacyTask(record: { payload: Record<string, unknown>; recordId: string; userId?: string | null }, actorId: string): TaskItemDTO | null {
  const value = record.payload;
  if (record.userId !== actorId || value.accountId !== actorId || typeof value.title !== "string") return null;
  const status = value.status === "completed" ? "completed" : value.status === "cancelled" || value.status === "dismissed" ? "cancelled" : "open";
  return {
    accountId: actorId,
    category: ["relationship", "meeting", "event", "work", "personal", "other"].includes(String(value.category))
      ? value.category as TaskItemDTO["category"]
      : "relationship",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "1970-01-01T00:00:00.000Z",
    ...(typeof value.dueAt === "string" ? { dueAt: value.dueAt } : {}),
    id: typeof value.id === "string" ? value.id : record.recordId,
    ...(typeof value.notes === "string" ? { notes: value.notes } : {}),
    ownerUserId: actorId,
    priority: value.priority === "high" ? "high" : "normal",
    ...(typeof value.contactId === "string" ? { relatedContactId: value.contactId } : {}),
    ...(typeof value.eventId === "string" ? { relatedEventId: value.eventId } : {}),
    ...(typeof value.meetingId === "string" ? { relatedMeetingId: value.meetingId } : {}),
    source: "ai_confirmed",
    status,
    title: value.title,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : typeof value.createdAt === "string" ? value.createdAt : "1970-01-01T00:00:00.000Z",
    ...(status === "completed" ? {
      completedAt: typeof value.completedAt === "string" ? value.completedAt : typeof value.updatedAt === "string" ? value.updatedAt : "1970-01-01T00:00:00.000Z",
      completedBy: actorId,
      completionSource: "agent_confirmed",
    } : {}),
  };
}

async function ownedTasks(input: {
  actorId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}) {
  const records = await input.store.listRecords({ collectionName: "tasks", userId: input.actorId, workspaceId: input.workspaceId });
  return records.flatMap((record) => {
    if (record.userId !== input.actorId) return [];
    const canonical = taskRecordFromLiveRecord(record, input.actorId)?.task;
    const task = canonical ?? legacyTask(record, input.actorId);
    return task ? [{ evidenceIds: record.evidenceIds, task }] : [];
  }).sort((left, right) => right.task.updatedAt.localeCompare(left.task.updatedAt) || left.task.id.localeCompare(right.task.id));
}

function taskView(task: TaskItemDTO, evidenceIds: readonly string[]): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    ...(task.notes ? { description: boundedText(task.notes, taskDescriptionLimit).text } : {}),
    status: task.status,
    category: task.category,
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(task.relatedContactId ? { contactId: task.relatedContactId } : {}),
    ...(task.relatedEventId ? { eventId: task.relatedEventId } : {}),
    ...(task.relatedMeetingId ? { scheduleId: task.relatedMeetingId } : {}),
    source: task.source,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    evidenceIds: [...evidenceIds],
  };
}

async function queryTasks(input: {
  actorId: string;
  query: ActorScopedQueryInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ActorScopedQueryResult> {
  const tasks = await ownedTasks(input);
  if (input.query.operation === "get") {
    const id = assertGetIsAuthorized(input.query);
    const found = tasks.find(({ task }) => task.id === id);
    return result({ domain: "tasks", operation: "get", items: found ? [taskView(found.task, found.evidenceIds)] : [], total: found ? 1 : 0 });
  }
  const search = input.query.operation === "search" ? input.query.query.trim().toLocaleLowerCase() : "";
  const matched = tasks.filter(({ task }) =>
    (!input.query.status || task.status === input.query.status) &&
    (!input.query.contactId || task.relatedContactId === input.query.contactId) &&
    (!input.query.eventId || task.relatedEventId === input.query.eventId) &&
    (!input.query.from || Boolean(task.dueAt && task.dueAt >= input.query.from)) &&
    (!input.query.to || Boolean(task.dueAt && task.dueAt <= input.query.to)) &&
    (!search || `${task.title}\n${task.notes ?? ""}`.toLocaleLowerCase().includes(search)),
  );
  const limit = Math.min(10, Math.max(1, input.query.limit ?? 10));
  const scope = JSON.stringify(["tasks", search, input.query.status ?? "", input.query.contactId ?? "", input.query.eventId ?? "", input.query.from ?? "", input.query.to ?? "", limit]);
  const offset = decodeCursor(input.query.cursor, scope);
  const page = matched.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return result({
    domain: "tasks",
    operation: input.query.operation,
    items: page.map(({ task, evidenceIds }) => taskView(task, evidenceIds)),
    total: matched.length,
    ...(nextOffset < matched.length ? { nextCursor: encodeCursor(nextOffset, scope) } : {}),
  });
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function queryFollowups(input: {
  actorId: string;
  query: ActorScopedQueryInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ActorScopedQueryResult> {
  const [taskRecords, connectionRecords, evidenceRecords] = await Promise.all([
    input.store.listRecords({ collectionName: "tasks", userId: input.actorId, workspaceId: input.workspaceId }),
    input.store.listRecords({ collectionName: "connections", userId: input.actorId, workspaceId: input.workspaceId }),
    input.store.listRecords({ collectionName: "evidence", userId: input.actorId, workspaceId: input.workspaceId }),
  ]);
  const connectionByContact = new Map(connectionRecords.flatMap((record) => {
    const contactId = record.userId === input.actorId ? text(record.payload.contactId) : undefined;
    return contactId ? [[contactId, record.recordId] as const] : [];
  }));
  const evidenceSummary = new Map(evidenceRecords.flatMap((record) => {
    if (record.userId !== input.actorId) return [];
    const summary = text(record.payload.summary) ?? text(record.payload.title);
    return summary ? [[record.recordId, boundedText(summary, 500).text] as const] : [];
  }));
  const candidates = taskRecords.flatMap((record) => {
    if (record.userId !== input.actorId) return [];
    const canonical = taskRecordFromLiveRecord(record, input.actorId)?.task;
    const payload = record.payload;
    const task = canonical ?? legacyTask(record, input.actorId);
    if (!task) return [];
    const contactId = canonical?.relatedContactId ?? text(payload.contactId);
    const connectionId = text(payload.connectionId) ?? (contactId ? connectionByContact.get(contactId) : undefined);
    if (!connectionId || !connectionRecords.some((connection) => connection.recordId === connectionId && connection.userId === input.actorId)) return [];
    const summaries = record.evidenceIds.flatMap((id) => evidenceSummary.get(id) ?? []);
    const source = canonical?.source ?? (typeof payload.source === "object" && payload.source !== null
      ? text((payload.source as Record<string, unknown>).label) ?? "confirmed_task"
      : "confirmed_task");
    return [{
      id: task.id,
      title: task.title,
      status: task.status,
      ...(contactId ? { contactId } : {}),
      connectionId,
      ...(task.dueAt ? { dueAt: task.dueAt } : {}),
      source,
      ...(summaries.length ? { evidenceSummary: boundedText(summaries.join(" "), 500).text } : {}),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      evidenceIds: [...record.evidenceIds],
    }];
  }).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || String(left.id).localeCompare(String(right.id)));
  if (input.query.operation === "get") {
    const id = assertGetIsAuthorized(input.query);
    const found = candidates.find((candidate) => candidate.id === id);
    return result({ domain: "followups", operation: "get", items: found ? [found] : [], total: found ? 1 : 0 });
  }
  const search = input.query.operation === "search" ? input.query.query.trim().toLocaleLowerCase() : "";
  const matched = candidates.filter((candidate) =>
    (!input.query.status || candidate.status === input.query.status) &&
    (!input.query.contactId || candidate.contactId === input.query.contactId) &&
    (!input.query.from || Boolean(candidate.dueAt && String(candidate.dueAt) >= input.query.from)) &&
    (!input.query.to || Boolean(candidate.dueAt && String(candidate.dueAt) <= input.query.to)) &&
    (!search || `${candidate.title}\n${candidate.evidenceSummary ?? ""}`.toLocaleLowerCase().includes(search)),
  );
  const limit = Math.min(10, Math.max(1, input.query.limit ?? 10));
  const scope = JSON.stringify(["followups", search, input.query.status ?? "", input.query.contactId ?? "", input.query.from ?? "", input.query.to ?? "", limit]);
  const offset = decodeCursor(input.query.cursor, scope);
  const page = matched.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return result({
    domain: "followups",
    operation: input.query.operation,
    items: page,
    total: matched.length,
    ...(nextOffset < matched.length ? { nextCursor: encodeCursor(nextOffset, scope) } : {}),
  });
}

function scheduleView(item: CanonicalScheduleItem): Record<string, unknown> {
  const missingFields = item.kind === "meeting"
    ? [!item.meetingMethod ? "meetingMethod" : null, !item.location ? "location" : null].filter((value): value is string => value !== null)
    : [];
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    category: item.category,
    startsAt: item.startsAt,
    ...(item.endsAt ? { endsAt: item.endsAt } : {}),
    ...(item.allDay !== undefined ? { allDay: item.allDay } : {}),
    ...(item.timeZone ? { timeZone: item.timeZone } : {}),
    ...(item.location ? { location: item.location } : {}),
    ...(item.meetingMethod ? { meetingMethod: item.meetingMethod } : {}),
    ...(item.contactId ? { contactId: item.contactId } : {}),
    ...(item.eventId ? { eventId: item.eventId } : {}),
    ...(item.meetingId ? { meetingId: item.meetingId } : {}),
    ...(item.details ? { details: boundedText(item.details, scheduleDetailsLimit).text } : {}),
    missingFields,
    evidenceIds: [...item.evidenceIds],
  };
}

async function querySchedule(input: {
  actorId: string;
  query: ActorScopedQueryInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ActorScopedQueryResult> {
  const records = await input.store.listRecords({
    collectionName: "personal_schedule_items",
    userId: input.actorId,
    workspaceId: input.workspaceId,
  });
  const items = records.flatMap((record) => {
    if (record.userId !== input.actorId) return [];
    const parsed = canonicalScheduleItemSchema.safeParse(record.payload);
    return parsed.success && parsed.data.accountId === input.actorId && parsed.data.ownerUserId === input.actorId && parsed.data.state !== "cancelled"
      ? [parsed.data]
      : [];
  }).sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id));
  if (input.query.operation === "get") {
    const id = assertGetIsAuthorized(input.query);
    const found = items.find((item) => item.id === id);
    return result({ domain: "schedule", operation: "get", items: found ? [scheduleView(found)] : [], total: found ? 1 : 0 });
  }
  const search = input.query.operation === "search" ? input.query.query.trim().toLocaleLowerCase() : "";
  const matched = items.filter((item) =>
    (!input.query.contactId || item.contactId === input.query.contactId) &&
    (!input.query.eventId || item.eventId === input.query.eventId) &&
    (!input.query.from || (item.endsAt ?? item.startsAt) >= input.query.from) &&
    (!input.query.to || item.startsAt <= input.query.to) &&
    (!search || `${item.title}\n${item.details ?? ""}\n${item.location ?? ""}`.toLocaleLowerCase().includes(search)),
  );
  const limit = Math.min(10, Math.max(1, input.query.limit ?? 10));
  const scope = JSON.stringify(["schedule", search, input.query.contactId ?? "", input.query.eventId ?? "", input.query.from ?? "", input.query.to ?? "", limit]);
  const offset = decodeCursor(input.query.cursor, scope);
  const page = matched.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return result({
    domain: "schedule",
    operation: input.query.operation,
    items: page.map(scheduleView),
    total: matched.length,
    ...(nextOffset < matched.length ? { nextCursor: encodeCursor(nextOffset, scope) } : {}),
  });
}

export async function executeActorScopedQuery(input: {
  actorId: string;
  input: ActorScopedQueryInput;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  toolName: ActorQueryToolName;
  workspaceId: string;
}): Promise<ActorScopedQueryResult> {
  if (!input.actorId.trim()) throw new AppError("UNAUTHORIZED", "An authenticated actor is required.");
  if (input.toolName === "notes.query") return queryNotes({ actorId: input.actorId, query: input.input, store: input.store, workspaceId: input.workspaceId });
  if (input.toolName === "tasks.query") return queryTasks({ actorId: input.actorId, query: input.input, store: input.store, workspaceId: input.workspaceId });
  if (input.toolName === "followups.query") return queryFollowups({ actorId: input.actorId, query: input.input, store: input.store, workspaceId: input.workspaceId });
  if (input.toolName === "schedule.query") return querySchedule({ actorId: input.actorId, query: input.input, store: input.store, workspaceId: input.workspaceId });
  throw new AppError("SERVICE_UNAVAILABLE", `${input.toolName} is not available yet.`);
}
