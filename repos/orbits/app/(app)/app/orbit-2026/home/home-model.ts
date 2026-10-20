import type { HomeLayoutContract, HomeWidgetKey, HomeWidgetSlot } from "../../../../../shared/contract/home-layout";
import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";

/** R28: the home prompt uses the same guide projection as the three-step card. */
export function homeContactCopyKeys(projection: { completed: number; nextStep?: "contacts" | "goal" | "plan" | null; steps: { contacts: boolean } } | null) {
  return {
    intro: projection?.nextStep === "contacts" && !projection.steps.contacts ? "railAbout" : "railAboutReady",
    contacts: projection?.steps.contacts ? "guideContactsDone" : "guideContacts",
  } as const;
}

export const HOME_CATALOG: readonly { key: HomeWidgetKey; category: "today" | "network" | "event" | "plan" | "secretary" }[] = [
  { key: "today", category: "today" }, { key: "pending", category: "today" }, { key: "week", category: "today" },
  { key: "planScore", category: "plan" }, { key: "nextEvent", category: "event" },
  { key: "eventPick", category: "event" }, { key: "network", category: "network" },
  { key: "secretary", category: "secretary" }, { key: "memo", category: "today" },
];

export function homeOpeningGeometry(layout: HomeLayoutContract): boolean {
  return !layout.webCustomizedAt;
}

export function moveHomeWidget(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey, to: number): HomeWidgetSlot[] {
  const from = slots.findIndex((slot) => slot.key === key);
  if (from < 0 || to < 0 || to >= slots.length || from === to) return [...slots];
  const next = [...slots];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

export function resizeHomeWidget(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey, size: HomeWidgetSlot["size"]): HomeWidgetSlot[] {
  return slots.map((slot) => slot.key === key ? { ...slot, size } : slot);
}

export function removeHomeWidget(slots: readonly HomeWidgetSlot[], key: HomeWidgetKey): HomeWidgetSlot[] {
  return slots.filter((slot) => slot.key !== key);
}

export function addHomeWidget(slots: readonly HomeWidgetSlot[], slot: HomeWidgetSlot): HomeWidgetSlot[] {
  if (!HOME_CATALOG.some((item) => item.key === slot.key) || slots.some((item) => item.key === slot.key) || slots.length >= 10) return [...slots];
  return [...slots, slot];
}

export function selectNextRegisteredEvent<T extends { eventId: string; status: string; startsAt: string; endsAt?: string | null }>(
  items: readonly T[], now: Date,
): T | null {
  return items.filter((event) => event.status === "registered" && Number.isFinite(Date.parse(event.startsAt))
    && Date.parse(event.endsAt ?? event.startsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
}

export function signedTodayDelta(value: number): string {
  if (value < 0) return `−${Math.abs(value)}`;
  return value > 0 ? `+${value}` : "0";
}

export function homeWeekWindow(now: Date, timeZone: string): { from: string; to: string } | null {
  if (!Number.isFinite(now.getTime()) || !validTimeZone(timeZone)) return null;
  const day = calendarDate(localParts(now, timeZone).date);
  if (!day) return null;
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
  const following = new Date(monday.getTime() + 7 * 86_400_000);
  const from = resolveLocalDateTime(monday.toISOString().slice(0, 10), "00:00", timeZone);
  const to = resolveLocalDateTime(following.toISOString().slice(0, 10), "00:00", timeZone);
  return from && to ? { from, to } : null;
}
