import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { personalScheduleSeriesFromMirror, personalScheduleWindow } from "../../view-models/personal-schedule-occurrences";
import { buildPersonalScheduleChange, type PersonalScheduleDraft } from "../../view-models/personal-schedule-editor";

export type PersonalScheduleOverlap = { kind: "known_overlap"; itemId: string; title: string } | { kind: "none_seen" | "unavailable" };

/** Warn only about a collision present in the actor's device mirror; never infer free time. */
export function personalScheduleDraftOverlap(input: {
  actorId: string;
  baseline: PersonalScheduleContract | null;
  draft: PersonalScheduleDraft;
  now: number;
  records: readonly { payload: unknown; deletedAt?: string | null }[];
  zone: string;
}): PersonalScheduleOverlap {
  if (!input.actorId) return { kind: "unavailable" };
  if (input.draft.allDay) return { kind: "none_seen" };
  const change = buildPersonalScheduleChange(input.baseline, input.draft, input.zone);
  if (change.kind === "invalid") return { kind: "none_seen" };
  const fields = change.kind === "ready" ? change.fields : {};
  const startValue = fields.startsAt ?? input.baseline?.startsAt;
  const endValue = Object.hasOwn(fields, "endsAt") ? fields.endsAt : input.baseline?.endsAt;
  if (typeof startValue !== "string" || typeof endValue !== "string") return { kind: "none_seen" };
  const start = Date.parse(startValue), end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { kind: "none_seen" };
  const records = input.records.filter(record => !record.deletedAt).map(record => ({ payload: record.payload }));
  const series = personalScheduleSeriesFromMirror(records, input.actorId);
  if (!series) return { kind: "unavailable" };
  const from = start - 2 * 86_400_000, to = end + 2 * 86_400_000;
  if (to - from > 366 * 86_400_000) return { kind: "unavailable" };
  try {
    const items = personalScheduleWindow(series, { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, input.now);
    const overlap = items.find(item => item.id !== input.baseline?.id && !item.allDay && typeof item.endsAt === "string" && Date.parse(item.startsAt) < end && Date.parse(item.endsAt) > start);
    return overlap ? { kind: "known_overlap", itemId: overlap.id, title: overlap.title } : { kind: "none_seen" };
  } catch {
    return { kind: "unavailable" };
  }
}
