/**
 * The to-do write adapter (设计稿附录 B「Todo」, §5.2; agent-design AG06). `prepare` is read-only and freezes
 * an operation for the card (features/agent/runtime/card-operations.ts); `applyApproved` runs only in the
 * executor after the user's click, through the to-do service with its own idempotency key.
 *
 * An update re-reads the record when it runs (PLANNER 易错边界 3): when what the card showed — the title
 * naming it, the values being changed, the record existing — is unchanged, it writes with the updatedAt
 * it just read as the expected version (another field changing in the meantime is no conflict). When a
 * shown value changed it does not write: a permanent failure, never retried. A replay of the same key
 * finds its own values and the service returns the first result. Fields the card does not touch — the
 * multi-value links of 附录 E among them — are kept as stored (the service spreads the record).
 */
import type { TaskService } from "../../../tasks/service";
import { AgentExecutionPermanentError } from "../../../agent/runtime/service";
import type { AgentActionExecutor } from "../../../agent/runtime/executor-registry";
import { TODO_CREATE, TODO_UPDATE } from "../../../agent/runtime/todo-operations";
import { taskLinksOf } from "../../../tasks/task-links";

export { prepareCardOperation as prepare } from "../../../agent/runtime/card-operations";

const text = (payload: Readonly<Record<string, unknown>>, key: string) => (typeof payload[key] === "string" && String(payload[key]).trim() ? String(payload[key]).trim() : undefined);

export function todoWriteExecutors(input: { tasks: Pick<TaskService, "create" | "update" | "get">; actorId: string }): AgentActionExecutor[] {
  return [
    {
      key: TODO_CREATE,
      riskLevel: "write",
      async execute(payload, context) {
        const title = text(payload, "title");
        if (!title) throw new AgentExecutionPermanentError("title is required.");
        // AG10: a to-do from a memo keeps the person it is about (one until AG13), the memo, its version and the memo's sentence.
        const related = Array.isArray(payload.relatedContactIds) ? payload.relatedContactIds.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
        const result = await input.tasks.create({
          actorId: input.actorId,
          category: related.length ? "relationship" : "work",
          idempotencyKey: context.idempotencyKey,
          now: context.now,
          source: "ai_confirmed",
          title,
          ...(text(payload, "plannedDate") ? { plannedDate: text(payload, "plannedDate") } : {}),
          ...(text(payload, "dueAt") ? { dueAt: text(payload, "dueAt") } : {}),
          ...(related.length > 1 ? { relatedContactIds: related } : related[0] ? { relatedContactId: related[0] } : {}),
          ...(Array.isArray(payload.relatedEventRefs) && payload.relatedEventRefs.length ? { relatedEventRefs: payload.relatedEventRefs as { kind: "platform" | "private"; id: string }[] } : {}),
          ...(text(payload, "sourceNoteId") ? { sourceNoteId: text(payload, "sourceNoteId") } : {}),
          ...(typeof payload.sourceNoteVersion === "number" ? { sourceNoteVersion: payload.sourceNoteVersion } : {}),
          ...(text(payload, "notes") ? { notes: text(payload, "notes") } : {}),
        });
        return { resultRef: `tasks:${result.task.id}`, summary: "To-do created in Orbit." };
      },
    },
    {
      key: TODO_UPDATE,
      riskLevel: "write",
      execute: (payload, context) => applyApprovedTodoUpdate(input, payload, context),
    },
  ];
}

/** applyApproved for todo.update: re-read, check what the card showed, write against the version just read. */
export async function applyApprovedTodoUpdate(
  input: { tasks: Pick<TaskService, "update" | "get">; actorId: string },
  payload: Readonly<Record<string, unknown>>,
  context: { idempotencyKey: string; now: string },
): Promise<{ resultRef: string; summary: string }> {
  const taskId = text(payload, "taskId");
  if (!taskId) throw new AgentExecutionPermanentError("taskId is required.");
  const patch = (payload.patch ?? {}) as Record<string, unknown>;
  const before = (payload.before ?? {}) as Record<string, unknown>;
  const shown = (payload.shown ?? {}) as Record<string, unknown>;
  const current = await input.tasks.get({ actorId: input.actorId, taskId });
  if (!current || current.status === "cancelled") throw new AgentExecutionPermanentError("CARD_CONTENT_CHANGED: the to-do is no longer there; nothing was written.");
  if (typeof shown.title === "string" && shown.title !== current.title) throw new AgentExecutionPermanentError("CARD_CONTENT_CHANGED: the to-do was renamed since the card was shown; nothing was written.");
  const fields = Object.entries(before);
  // AG13: the people and events as lists (an older to-do's single fields read as zero or one), compared by value.
  const links = taskLinksOf(current);
  const valueOf = (field: string) => (field === "relatedContactIds" ? links.contactIds : field === "relatedEventRefs" ? links.eventRefs : (current as unknown as Record<string, unknown>)[field] ?? null);
  const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  for (const [field, shownValue] of fields) {
    const now = valueOf(field);
    // Our own earlier write (a replay of this key) shows the new value already; anything else is a change.
    if (!same(now, shownValue) && !same(now, patch[field])) throw new AgentExecutionPermanentError(`CARD_CONTENT_CHANGED: ${field} changed since the card was shown; nothing was written.`);
  }
  // A replay after a lost receipt: every value is already the new one, so the first attempt wrote it. The
  // to-do service answers the same key with its first result only for the same expected version — the one
  // read at the click. Otherwise the version read now is the precondition.
  const clicked = text(payload, "expectedUpdatedAt");
  const ownWrite = fields.length > 0 && fields.every(([field, shownValue]) => same(valueOf(field), patch[field]) && !same(valueOf(field), shownValue));
  const expectedUpdatedAt = ownWrite && clicked ? clicked : current.updatedAt;
  const result = await input.tasks.update({ actorId: input.actorId, expectedUpdatedAt, idempotencyKey: context.idempotencyKey, now: context.now, patch: patch as never, taskId });
  return { resultRef: `tasks:${result.task.id}`, summary: "To-do updated in Orbit." };
}
