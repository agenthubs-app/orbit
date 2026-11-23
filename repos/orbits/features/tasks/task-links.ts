/**
 * agent-design AG13 (设计稿附录 E; PLANNER 易错边界 5): a to-do's links to several people and events, and the old
 * single fields beside them.
 *
 * - Read: a to-do written before AG13 has only `relatedContactId` / `relatedEventId`; it reads as arrays of zero or one.
 * - Write (arrays given): the arrays are de-duplicated in order; `relatedContactId` mirrors the first person and
 *   `relatedEventId` the first platform event (a private event has no single field).
 * - An old client that sends only other fields (a title) leaves the arrays as they are.
 * - An old client that changes a single field replaces only the mirrored item; the other people and events stay.
 *   (Planner's choice, PLANNER 易错边界 5.) A to-do that has no arrays keeps the old single-field behaviour: nothing
 *   is materialized, so its stored record changes only where the client asked.
 */
import type { TaskItemDTO } from "./contract";

export type TaskEventRef = { kind: "platform" | "private"; id: string };

export interface TaskLinks {
  contactIds: string[];
  eventRefs: TaskEventRef[];
}

const uniqueIds = (ids: readonly string[]) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))];

export function uniqueRefs(refs: readonly TaskEventRef[]): TaskEventRef[] {
  const seen = new Set<string>();
  const out: TaskEventRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}\u0000${ref.id}`;
    if (!ref.id || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: ref.id, kind: ref.kind });
  }
  return out;
}

/** The to-do's people and events, whether it holds the arrays or only the old single fields. */
export function taskLinksOf(task: Pick<TaskItemDTO, "relatedContactId" | "relatedEventId" | "relatedContactIds" | "relatedEventRefs">): TaskLinks {
  const contactIds = Array.isArray(task.relatedContactIds) ? uniqueIds(task.relatedContactIds) : task.relatedContactId ? [task.relatedContactId] : [];
  const eventRefs = Array.isArray(task.relatedEventRefs) ? uniqueRefs(task.relatedEventRefs) : task.relatedEventId ? [{ id: task.relatedEventId, kind: "platform" as const }] : [];
  return { contactIds, eventRefs };
}

/** True when the stored record already holds the arrays (written by AG13 or later). */
export function holdsLinkArrays(task: Pick<TaskItemDTO, "relatedContactIds" | "relatedEventRefs">): boolean {
  return Array.isArray(task.relatedContactIds) || Array.isArray(task.relatedEventRefs);
}

export interface TaskLinkPatch {
  relatedContactId?: string | null;
  relatedEventId?: string | null;
  relatedContactIds?: readonly string[] | null;
  relatedEventRefs?: readonly TaskEventRef[] | null;
}

/**
 * The link fields of a to-do after a patch: what to set (a value) and what to drop (null). Fields the patch does not
 * touch are not in the result.
 */
export function linkFieldsAfter(task: TaskItemDTO, patch: TaskLinkPatch): Partial<Record<"relatedContactId" | "relatedEventId" | "relatedContactIds" | "relatedEventRefs", unknown>> {
  // People and events are two sides: a side the patch does not touch is left exactly as stored.
  const out: Partial<Record<"relatedContactId" | "relatedEventId" | "relatedContactIds" | "relatedEventRefs", unknown>> = {};
  const current = taskLinksOf(task);
  if (patch.relatedContactIds !== undefined) {
    const contactIds = uniqueIds(patch.relatedContactIds ?? []);
    Object.assign(out, { relatedContactId: contactIds[0] ?? null, relatedContactIds: contactIds });
  } else if (patch.relatedContactId !== undefined) {
    if (!Array.isArray(task.relatedContactIds)) out.relatedContactId = patch.relatedContactId;
    else {
      // Only the mirrored item (the first person) is replaced or removed.
      const rest = current.contactIds.slice(1).filter((id) => id !== patch.relatedContactId);
      const contactIds = patch.relatedContactId ? [patch.relatedContactId, ...rest] : rest;
      Object.assign(out, { relatedContactId: contactIds[0] ?? null, relatedContactIds: contactIds });
    }
  }
  if (patch.relatedEventRefs !== undefined) {
    const eventRefs = uniqueRefs(patch.relatedEventRefs ?? []);
    Object.assign(out, { relatedEventId: eventRefs.find((ref) => ref.kind === "platform")?.id ?? null, relatedEventRefs: eventRefs });
  } else if (patch.relatedEventId !== undefined) {
    if (!Array.isArray(task.relatedEventRefs)) out.relatedEventId = patch.relatedEventId;
    else {
      // Only the mirrored item (the first platform event) is replaced or removed.
      const at = current.eventRefs.findIndex((ref) => ref.kind === "platform");
      const without = current.eventRefs.filter((_ref, index) => index !== at).filter((ref) => !(ref.kind === "platform" && ref.id === patch.relatedEventId));
      if (patch.relatedEventId) without.splice(at >= 0 ? Math.min(at, without.length) : 0, 0, { id: patch.relatedEventId, kind: "platform" });
      Object.assign(out, { relatedEventId: without.find((ref) => ref.kind === "platform")?.id ?? null, relatedEventRefs: without });
    }
  }
  return out;
}

/** The private events a patch adds that the to-do did not link before (their owner and state are checked). */
export function addedPrivateEvents(task: TaskItemDTO | null, refs: readonly TaskEventRef[] | null | undefined): string[] {
  if (!refs) return [];
  const before = new Set(task ? taskLinksOf(task).eventRefs.filter((ref) => ref.kind === "private").map((ref) => ref.id) : []);
  return [...new Set(refs.filter((ref) => ref.kind === "private" && !before.has(ref.id)).map((ref) => ref.id))];
}
