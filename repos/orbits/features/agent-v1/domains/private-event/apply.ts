/**
 * agent-design AG13: applyApproved for the card items of domains/private-event/ops.ts. They run only in the executor after
 * the click, each through its own service with the item's idempotency key, and check what the card showed first: a
 * record that changed since is not written (a permanent failure, never retried).
 *
 * - privateEvent.delete looks the references up again under the link locks; any left (or added since the card) keep the
 *   event: `KEPT_REFERENCED:` and the records, which the card's receipt says in the user's words (ops.ts outcomeOf).
 * - attendance.create never writes a check-in or a registration; schedule.create never registers for the event.
 */
import type { AgentActionExecutor } from "../../../agent/runtime/executor-registry";
import { AgentExecutionPermanentError } from "../../../agent/runtime/service";
import type { AttendanceService } from "../../../events/attendance-notes/service";
import { AttendanceError } from "../../../events/attendance-notes/service";
import type { PrivateEventService } from "../../../events/private-events/service";
import { PrivateEventError } from "../../../events/private-events/service";
import type { PersonalScheduleService } from "../../../personal-schedule/service";
import type { TaskService } from "../../../tasks/service";
import { TaskServiceError } from "../../../tasks/service";
import { ATTENDANCE_CREATE, ATTENDANCE_DELETE, ATTENDANCE_UPDATE, PRIVATE_EVENT_CREATE, PRIVATE_EVENT_DELETE, PRIVATE_EVENT_UPDATE, SCHEDULE_CREATE, SCHEDULE_DELETE, SCHEDULE_UPDATE, TODO_COMPLETE, TODO_DELETE, TODO_REOPEN } from "./ops";

export interface EventWriteDeps {
  actorId: string;
  privateEvents?: PrivateEventService | null;
  attendance?: AttendanceService | null;
  schedule?: Pick<PersonalScheduleService, "create" | "update" | "remove" | "get"> | null;
  tasks?: Pick<TaskService, "get" | "complete" | "reopen" | "delete"> | null;
}

const text = (payload: Readonly<Record<string, unknown>>, key: string) => (typeof payload[key] === "string" && String(payload[key]).trim() ? String(payload[key]).trim() : undefined);
const changed = (what: string) => new AgentExecutionPermanentError(`CARD_CONTENT_CHANGED: ${what}; nothing was written.`);

function permanentFor(error: unknown): never {
  if (error instanceof PrivateEventError || error instanceof AttendanceError) {
    if (error.code === "NOT_FOUND" || error.code === "VERSION_CONFLICT" || error.code === "EVENT_UNAVAILABLE") throw changed(error.message);
    throw new AgentExecutionPermanentError(`${error.code}: ${error.message}`);
  }
  if (error instanceof TaskServiceError && error.code !== "TASK_VERSION_CONFLICT") throw changed(error.message);
  if (error && typeof error === "object" && "code" in error && ["NOT_FOUND", "VALIDATION_ERROR", "CONFLICT"].includes(String((error as { code: unknown }).code))) throw changed(error instanceof Error ? error.message : String(error));
  throw error;
}

export function eventWriteExecutors(deps: EventWriteDeps): AgentActionExecutor[] {
  const out: AgentActionExecutor[] = [];
  const add = (key: string, execute: AgentActionExecutor["execute"]) => out.push({ execute: async (payload, context) => { try { return await execute(payload, context); } catch (error) { if (error instanceof AgentExecutionPermanentError) throw error; return permanentFor(error); } }, key, riskLevel: "write" });
  const events = deps.privateEvents;
  const notes = deps.attendance;
  if (events) {
    add(PRIVATE_EVENT_CREATE, async (payload, context) => {
      const title = text(payload, "title");
      const startsAt = text(payload, "startsAt");
      if (!title || !startsAt) throw new AgentExecutionPermanentError("title and startsAt are required.");
      const event = await events.create(deps.actorId, { idempotencyKey: context.idempotencyKey, startsAt, title, ...(text(payload, "endsAt") ? { endsAt: text(payload, "endsAt") } : {}), ...(text(payload, "venue") ? { venue: text(payload, "venue") } : {}), ...(payload.allDay === true ? { allDay: true } : {}) });
      return { resultRef: `private_events:${event.id}`, summary: "Private event created in Orbit." };
    });
    add(PRIVATE_EVENT_UPDATE, async (payload) => {
      const id = text(payload, "eventId");
      if (!id || typeof payload.expectedVersion !== "number") throw new AgentExecutionPermanentError("eventId and expectedVersion are required.");
      const event = await events.update(deps.actorId, id, { expectedVersion: payload.expectedVersion, patch: (payload.patch ?? {}) as Record<string, string | null> });
      return { resultRef: `private_events:${event.id}`, summary: "Private event changed in Orbit." };
    });
    add(PRIVATE_EVENT_DELETE, async (payload) => {
      const id = text(payload, "eventId");
      if (!id) throw new AgentExecutionPermanentError("eventId is required.");
      const result = await events.delete(deps.actorId, id, typeof payload.expectedVersion === "number" ? { expectedVersion: payload.expectedVersion } : {});
      if (result.deleted === false) throw new AgentExecutionPermanentError(`KEPT_REFERENCED:${JSON.stringify(result.references.map((ref) => ({ id: ref.id, kind: ref.kind, label: ref.label })))}`);
      return { resultRef: `private_events:${id}`, summary: "Private event deleted in Orbit." };
    });
  }
  if (notes) {
    add(ATTENDANCE_CREATE, async (payload, context) => {
      const ref = payload.eventRef as { kind?: string; id?: string; localCreateRef?: unknown } | undefined;
      const attendedOn = text(payload, "attendedOn");
      if (!ref || typeof ref.id !== "string" || (ref.kind !== "platform" && ref.kind !== "private") || !attendedOn) throw new AgentExecutionPermanentError("eventRef { kind, id } and attendedOn are required (a localCreateRef is replaced before this runs).");
      const note = await notes.create(deps.actorId, { attendedOn, eventRef: { id: ref.id, kind: ref.kind }, idempotencyKey: context.idempotencyKey, ...(Array.isArray(payload.dayParts) ? { dayParts: payload.dayParts as never } : {}), ...(text(payload, "selfNote") ? { selfNote: text(payload, "selfNote") } : {}) });
      return { resultRef: `event_attendance_notes:${note.id}`, summary: "«I went» recorded in Orbit (your own note; no check-in or registration)." };
    });
    add(ATTENDANCE_UPDATE, async (payload) => {
      const id = text(payload, "attendanceId");
      if (!id || typeof payload.expectedVersion !== "number") throw new AgentExecutionPermanentError("attendanceId and expectedVersion are required.");
      const note = await notes.update(deps.actorId, id, { expectedVersion: payload.expectedVersion, patch: (payload.patch ?? {}) as never });
      return { resultRef: `event_attendance_notes:${note.id}`, summary: "«I went» moved in Orbit." };
    });
    add(ATTENDANCE_DELETE, async (payload) => {
      const id = text(payload, "attendanceId");
      if (!id) throw new AgentExecutionPermanentError("attendanceId is required.");
      await notes.delete(deps.actorId, id, typeof payload.expectedVersion === "number" ? { expectedVersion: payload.expectedVersion } : {});
      return { resultRef: `event_attendance_notes:${id}`, summary: "«I went» deleted in Orbit." };
    });
  }
  const schedule = deps.schedule;
  if (schedule) {
    add(SCHEDULE_CREATE, async (payload, context) => {
      const title = text(payload, "title");
      const startsAt = text(payload, "startsAt");
      if (!title || !startsAt) throw new AgentExecutionPermanentError("title and startsAt are required.");
      const result = await schedule.create(deps.actorId, {
        idempotencyKey: context.idempotencyKey, startsAt, title,
        ...(text(payload, "endsAt") ? { endsAt: text(payload, "endsAt") } : {}),
        ...(text(payload, "timeZone") ? { timeZone: text(payload, "timeZone") } : {}),
        // AG20a: an item made from an all-day event is all day (the schedule service checks its zone and end).
        ...(payload.allDay === true ? { allDay: true } : {}),
        ...(Array.isArray(payload.eventRefs) && payload.eventRefs.length ? { eventRefs: payload.eventRefs as never } : {}),
        ...(Array.isArray(payload.contactIds) && payload.contactIds.length ? { contactIds: payload.contactIds as string[] } : {}),
      } as never);
      return { resultRef: `personal_schedule_items:${result.scheduleItem.id}`, summary: "Added to your schedule in Orbit (no registration)." };
    });
    const current = async (payload: Readonly<Record<string, unknown>>) => {
      const id = text(payload, "scheduleId");
      if (!id) throw new AgentExecutionPermanentError("scheduleId is required.");
      const item = await schedule.get({ actorId: deps.actorId, id }).catch(() => null);
      if (!item || item.state === "cancelled") throw changed("the schedule item is no longer there");
      return { id, item };
    };
    add(SCHEDULE_UPDATE, async (payload, context) => {
      const { id, item } = await current(payload);
      const before = (payload.shownBefore ?? {}) as { startsAt?: string; endsAt?: string | null };
      const patch = (payload.patch ?? {}) as Record<string, unknown>;
      const same = (left: string | null | undefined, right: string | null | undefined) => (left ? Date.parse(left) : null) === (right ? Date.parse(right) : null);
      // What the card showed (this time's start and end) is still what is there, or our own write already (a replay).
      const replay = same(item.startsAt, patch.startsAt as string | undefined) && (patch.endsAt === undefined || same(item.endsAt, patch.endsAt as string | undefined));
      if (!replay && (!same(item.startsAt, before.startsAt) || (before.endsAt !== undefined && !same(item.endsAt, before.endsAt)))) throw changed("the schedule item's time changed since the card was shown");
      const result = await schedule.update(deps.actorId, id, { expectedUpdatedAt: item.updatedAt, idempotencyKey: context.idempotencyKey, patch: patch as never, ...(payload.scope ? { scope: payload.scope as "occurrence" | "series" } : {}) });
      return { resultRef: `personal_schedule_items:${result.scheduleItem.id}`, summary: payload.scope === "occurrence" ? "Changed only this time in Orbit; the series stays." : "Schedule changed in Orbit." };
    });
    add(SCHEDULE_DELETE, async (payload, context) => {
      const { id, item } = await current(payload);
      const result = await schedule.remove(deps.actorId, id, { expectedUpdatedAt: item.updatedAt, idempotencyKey: context.idempotencyKey, ...(payload.scope ? { scope: payload.scope as "occurrence" | "series" } : {}) });
      return { resultRef: `personal_schedule_items:${result.scheduleItem.id}`, summary: "Schedule item deleted in Orbit." };
    });
  }
  const tasks = deps.tasks;
  if (tasks) {
    const todo = async (payload: Readonly<Record<string, unknown>>) => {
      const taskId = text(payload, "taskId");
      if (!taskId) throw new AgentExecutionPermanentError("taskId is required.");
      const task = await tasks.get({ actorId: deps.actorId, taskId });
      if (!task || task.status === "cancelled") throw changed("the to-do is no longer there");
      if (text(payload, "shownTitle") && task.title !== text(payload, "shownTitle")) throw changed("the to-do was renamed since the card was shown");
      return task;
    };
    add(TODO_COMPLETE, async (payload, context) => {
      const task = await todo(payload);
      const result = await tasks.complete({ actorId: deps.actorId, completedBy: deps.actorId, completionSource: "agent_confirmed", idempotencyKey: context.idempotencyKey, now: context.now, taskId: task.id });
      return { resultRef: `tasks:${result.task.id}`, summary: "To-do marked done in Orbit." };
    });
    add(TODO_REOPEN, async (payload, context) => {
      const task = await todo(payload);
      const result = await tasks.reopen({ actorId: deps.actorId, idempotencyKey: context.idempotencyKey, now: context.now, taskId: task.id });
      return { resultRef: `tasks:${result.task.id}`, summary: "To-do reopened in Orbit." };
    });
    add(TODO_DELETE, async (payload, context) => {
      const task = await todo(payload);
      const result = await tasks.delete({ actorId: deps.actorId, expectedUpdatedAt: task.updatedAt, idempotencyKey: context.idempotencyKey, now: context.now, taskId: task.id });
      return { resultRef: `tasks:${result.task.id}`, summary: "To-do deleted in Orbit (it cannot be brought back)." };
    });
  }
  return out;
}
