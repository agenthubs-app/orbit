import type { CalendarEntry } from "./calendar-view-model";
export function calendarDraftOverlaps(target: { id?: string; sourceId?: string; startsAt: string; endsAt?: string; allDay?: boolean }, items: readonly CalendarEntry[], coverage: { from: string; to: string; complete: boolean }): { items: CalendarEntry[]; coverageComplete: boolean } {
  const start = Date.parse(target.startsAt), end = target.endsAt ? Date.parse(target.endsAt) : NaN;
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const coverageComplete = valid && coverage.complete && start >= Date.parse(coverage.from) && end <= Date.parse(coverage.to);
  if (!valid || target.allDay) return { items: [], coverageComplete: false };
  return { coverageComplete, items: items.filter(item => {
    if (item.allDay || !item.endsAt || item.kind === "personal" && (item.id === target.id || item.sourceId === target.sourceId && Date.parse(item.startsAt) === start)) return false;
    const otherStart = Date.parse(item.startsAt), otherEnd = Date.parse(item.endsAt);
    return Number.isFinite(otherStart) && Number.isFinite(otherEnd) && otherStart < end && otherEnd > start;
  }) };
}
