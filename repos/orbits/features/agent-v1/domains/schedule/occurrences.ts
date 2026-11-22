/**
 * Hotfix 2026-11-20 (AE-SCL-025: the meeting moved to 15:00 "只改这一次" still showed 10:00): a repeating schedule item read
 * for a window is given as the occurrence in it — its start, its end (the series' length, or the end set for that one
 * time) and any other value changed for that one time (personal-schedule/occurrence-exceptions.ts stores those as
 * `<series id>:occurrence:<YYYY-MM-DD>` records with a `patch`). A cancelled occurrence is no occurrence.
 */
import type { RecordSource } from "../source";
import type { RecordView } from "../types";

export const OCCURRENCE_EXCEPTIONS = "personal_schedule_occurrence_exceptions";

/** "2026-11-16" — the occurrence's local day in the item's time zone. */
function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(new Date(iso));
}

const PATCHED = ["title", "location", "notes", "details", "allDay"] as const;

/**
 * The views with each repeating item's occurrence applied (`occurrences`: ref → the occurrence's start, as resolve found it).
 * Items that do not repeat are returned as they are; a cancelled occurrence is left out.
 */
export async function occurrenceViews(source: RecordSource, scope: { accountId: string; workspaceId: string }, views: readonly RecordView[], occurrences: ReadonlyMap<string, string>, timeZone: string): Promise<RecordView[]> {
  const series = views.filter((view) => typeof view.fields.recurrence === "string" && typeof view.fields.startsAt === "string");
  if (!series.length) return [...views];
  const startOf = (view: RecordView) => occurrences.get(view.ref) ?? String(view.fields.startsAt);
  const idOf = (view: RecordView) => `${view.id}:occurrence:${localDay(startOf(view), typeof view.fields.timeZone === "string" ? view.fields.timeZone : timeZone)}`;
  const ids = series.map(idOf);
  const rows = await source.page(scope, { collection: OCCURRENCE_EXCEPTIONS, ids, order: { direction: "asc", paths: [["occurrenceDate"]] } }, null, ids.length);
  const byId = new Map(rows.map((row) => [row.id, row.payload]));
  const out: RecordView[] = [];
  for (const view of views) {
    if (!series.includes(view)) {
      out.push(view);
      continue;
    }
    const start = startOf(view);
    const exception = byId.get(idOf(view));
    if (exception?.cancelled === true) continue;
    const patch = (exception?.patch && typeof exception.patch === "object" ? exception.patch : {}) as Record<string, unknown>;
    const seriesStart = Date.parse(String(view.fields.startsAt));
    const seriesEnd = typeof view.fields.endsAt === "string" ? Date.parse(view.fields.endsAt) : NaN;
    const startsAt = typeof patch.startsAt === "string" ? patch.startsAt : start;
    const endsAt = typeof patch.endsAt === "string" ? patch.endsAt : Number.isFinite(seriesEnd) ? new Date(Date.parse(startsAt) + seriesEnd - seriesStart).toISOString() : undefined;
    const fields: Record<string, unknown> = { ...view.fields, startsAt, ...(endsAt ? { endsAt } : {}) };
    for (const key of PATCHED) if (patch[key] !== undefined) fields[key] = patch[key];
    out.push({ ...view, fields });
  }
  return out;
}
