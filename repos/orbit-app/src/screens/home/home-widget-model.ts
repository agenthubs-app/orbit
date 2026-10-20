import type { HomeWidgetKey, HomeWidgetSlot } from "../../api/contract/home-layout";

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
