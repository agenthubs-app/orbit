import type { PersonalScheduleContract } from "../api/contract/tasks";
import type { LocalSyncQueuedMutation } from "../data/sync/local-sync-repository";
import type { MirrorScheduleSeries } from "./personal-schedule-occurrences";

/**
 * Sprint 0134: the actor's queued personal-schedule writes as a presentation
 * overlay on the mirrored rows (the mirror itself stays the server's). A local
 * create appears under its `local:` id, an edit applies its patch, a delete
 * hides the row unless it is in conflict or failed (then it stays, marked).
 */
export type ScheduleMutationState = "queued" | "conflict" | "failed";

const CLEARABLE = ["location", "endsAt", "allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "recurrence", "reminderMinutes"];
const CREATE_FIELDS = ["title", "startsAt", "endsAt", "location", "allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "reminderMinutes"];
const RANK: Record<ScheduleMutationState, number> = { queued: 0, failed: 1, conflict: 2 };

function stateOf(mutation: LocalSyncQueuedMutation): ScheduleMutationState {
  return mutation.state === "conflict" ? "conflict" : mutation.state === "failed" ? "failed" : "queued";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyMutations(items: readonly Record<string, unknown>[], mutations: readonly LocalSyncQueuedMutation[], actorId: string) {
  const byId = new Map<string, Record<string, unknown>>(items.map(entry => [String(entry.id), entry]));
  const states: Record<string, ScheduleMutationState> = {};
  const mark = (id: string, state: ScheduleMutationState) => { if (!states[id] || RANK[state] > RANK[states[id]!]) states[id] = state; };
  for (const mutation of mutations) {
    if (mutation.domainId !== "personal-schedule" || mutation.kind !== "personal_schedule" || mutation.actorId !== actorId || !isRecord(mutation.patch)) continue;
    const patch = mutation.patch;
    const prior = byId.get(mutation.id);
    if (mutation.operation === "create") {
      if (prior || !mutation.id.startsWith("local:") || typeof patch.title !== "string" || typeof patch.startsAt !== "string") continue;
      const created: Record<string, unknown> = { id: mutation.id, sourceId: mutation.id, accountId: actorId, ownerUserId: actorId, kind: "personal", category: "personal",
        state: "upcoming", createdAt: mutation.createdAt, updatedAt: mutation.createdAt };
      for (const key of CREATE_FIELDS) if (patch[key] !== undefined && patch[key] !== null) created[key] = patch[key];
      byId.set(mutation.id, created);
      mark(mutation.id, stateOf(mutation));
      continue;
    }
    if (!prior || prior.kind !== "personal" || prior.ownerUserId !== actorId) continue;
    mark(mutation.id, stateOf(mutation));
    if (mutation.operation === "delete") {
      if (mutation.state === "conflict" || mutation.state === "failed") continue;
      byId.delete(mutation.id);
      continue;
    }
    if (mutation.operation !== "update") continue;
    const next: Record<string, unknown> = { ...prior };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) { if (CLEARABLE.includes(key)) delete next[key]; }
      else next[key] = value;
    }
    byId.set(mutation.id, next);
  }
  return { items: [...byId.values()], states };
}

/** The list/detail overlay: series in, series out (offline writes only touch non-recurring rows, which have no exceptions). */
export function overlayQueuedScheduleSeries(series: readonly MirrorScheduleSeries[], mutations: readonly LocalSyncQueuedMutation[], actorId: string): { series: MirrorScheduleSeries[]; states: Record<string, ScheduleMutationState> } {
  const exceptions = new Map(series.map(entry => [entry.item.id, entry.exceptions]));
  const { items, states } = applyMutations(series.map(entry => entry.item as unknown as Record<string, unknown>), mutations, actorId);
  return { series: items.map(entry => ({ item: entry as unknown as PersonalScheduleContract, exceptions: exceptions.get(String(entry.id)) ?? [] })), states };
}

/** The calendar overlay on raw schedule payloads (meetings and events pass through); changed rows carry `localMutationState`. */
export function overlayQueuedScheduleItems(payloads: readonly Record<string, unknown>[], mutations: readonly LocalSyncQueuedMutation[], actorId: string): Array<Record<string, unknown> & { localMutationState?: ScheduleMutationState }> {
  if (!mutations.length) return [...payloads];
  const { items, states } = applyMutations(payloads, mutations, actorId);
  return items.map(entry => states[String(entry.id)] ? { ...entry, localMutationState: states[String(entry.id)] } : entry);
}
