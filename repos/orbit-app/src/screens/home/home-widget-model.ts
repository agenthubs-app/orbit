import type { HomeWidgetKey, HomeWidgetSlot } from "../../api/contract/home-layout";
import type { SyncRecord } from "../../api/contract/sync";
import { localEventDay, type LocalRegisteredEvent } from "../../view-models/event-day-local";

export const HOME_WIDGETS: readonly { key: HomeWidgetKey; category: "today" | "network" | "event" | "plan" | "secretary" }[] = [
  { key: "today", category: "today" }, { key: "pending", category: "today" }, { key: "week", category: "today" },
  { key: "planScore", category: "plan" }, { key: "nextEvent", category: "event" }, { key: "eventPick", category: "event" },
  { key: "network", category: "network" }, { key: "secretary", category: "secretary" }, { key: "memo", category: "today" },
];

export function moveWidget(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey, step: -1 | 1): HomeWidgetSlot[] {
  const from = slots.findIndex(slot => slot.key === key), to = from + step;
  if (from < 0 || to < 0 || to >= slots.length) return [...slots];
  const result = [...slots]; result.splice(to, 0, result.splice(from, 1)[0]!); return result;
}
export function moveWidgetTo(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey, to: number): HomeWidgetSlot[] {
  const from = slots.findIndex(slot => slot.key === key);
  if (from < 0 || to < 0 || to >= slots.length || from === to) return [...slots];
  const result = [...slots]; result.splice(to, 0, result.splice(from, 1)[0]!); return result;
}
export function dragTargetIndex(from: number, count: number, cellHeight: number, dx: number, dy: number): number {
  if (count <= 0) return 0;
  const vertical = Math.round(dy / Math.max(1, cellHeight));
  const horizontal = dx > 100 ? 1 : dx < -100 ? -1 : 0;
  return Math.max(0, Math.min(count - 1, from + vertical + horizontal));
}
export function resizeWidget(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey, size?: "s" | "m"): HomeWidgetSlot[] {
  return slots.map(slot => slot.key === key ? { ...slot, size: size ?? (slot.size === "s" ? "m" : "s") } : slot);
}
export function addWidget(slots: readonly HomeWidgetSlot[], slot: HomeWidgetSlot): HomeWidgetSlot[] {
  return slots.length >= 10 || slots.some(item => item.key === slot.key) || !HOME_WIDGETS.some(item => item.key === slot.key) ? [...slots] : [...slots, slot];
}
export function removeWidget(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey): HomeWidgetSlot[] { return slots.filter(slot => slot.key !== key); }
export function nextRegisteredEvent<T extends { status: string; startsAt: string; endsAt?: string | null }>(items: readonly T[], now: Date): T | null {
  return items.filter(item => item.status === "registered" && Number.isFinite(Date.parse(item.startsAt))
    && Date.parse(item.endsAt ?? item.startsAt) > now.getTime()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
}
export function signedDelta(value: number): string { return value < 0 ? `−${Math.abs(value)}` : value > 0 ? `+${value}` : "0"; }

/** LF1: how long a Home page copy (plan score, week, schedule, picks) is shown without re-reading the server. */
export const HOME_COPY_FRESH_MS = 3 * 60_000;

/**
 * LF1: the next event the attendee is going to, from the device's event-day domains — the same rule as
 * nextRegisteredEvent over GET /api/events/mine (registered = an rsvped membership; not cancelled; not over).
 */
export function nextLocalRegisteredEvent(
  events: readonly LocalRegisteredEvent[], registrations: readonly SyncRecord[], now: Date,
): LocalRegisteredEvent | null {
  const going = (eventId: string) => localEventDay({ registrations, events: [], results: [] }, eventId).registration?.membershipStatus === "rsvped";
  return events.filter(event => going(event.eventId) && event.lifecycleState !== "cancelled" && Date.parse(event.endsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
}

export type HomeTodayRow = { key: string; title: string };
/** A date key (YYYY-MM-DD) in `timeZone`: a due time's local day, else the planned day — the to-do tab's grouping rule. */
function homeTaskDateKey(dueAt: string | null | undefined, plannedDate: string | null | undefined, timeZone: string): string | undefined {
  if (dueAt && Number.isFinite(Date.parse(dueAt))) return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dueAt));
  return plannedDate ?? undefined;
}
/**
 * UX: the Today card counts what the to-do tab shows under 今天 and 已逾期 — open tasks and open relationship
 * follow-ups, by due time (else planned day). `capped`: the task window ended while still on or before today.
 */
export function homeTodaySummary(
  tasks: readonly { id: string; title: string; dueAt?: string | null | undefined; plannedDate?: string | null | undefined }[] | null,
  followUps: readonly { itemKey: string; titlePreview: string; dueAt: string | null }[] | null,
  today: string, timeZone: string, moreTasks = false,
): { today: HomeTodayRow[]; overdue: HomeTodayRow[]; capped: boolean } {
  const result = { today: [] as HomeTodayRow[], overdue: [] as HomeTodayRow[], capped: false };
  const add = (key: string, title: string, day: string | undefined) => {
    if (!day || day > today) return;
    (day === today ? result.today : result.overdue).push({ key, title });
  };
  for (const task of tasks ?? []) add(`task:${task.id}`, task.title, homeTaskDateKey(task.dueAt, task.plannedDate, timeZone));
  for (const item of followUps ?? []) add(`followup:${item.itemKey}`, item.titlePreview, homeTaskDateKey(item.dueAt, null, timeZone));
  const last = tasks?.at(-1);
  const lastDay = last ? homeTaskDateKey(last.dueAt, last.plannedDate, timeZone) : undefined;
  result.capped = moreTasks && Boolean(lastDay && lastDay <= today);
  return result;
}
/** The next of today's calendar items: the first that has not ended yet (all-day items count), else none. */
export function nextTodayScheduleItem<T extends { timeLabel: string; durationMinutes: number }>(items: readonly T[], nowMinutes: number): T | null {
  return items.find(item => {
    const match = /^(\d{1,2}):(\d{2})/u.exec(item.timeLabel);
    return !match || Number(match[1]) * 60 + Number(match[2]) + Math.max(0, item.durationMinutes) > nowMinutes;
  }) ?? null;
}
