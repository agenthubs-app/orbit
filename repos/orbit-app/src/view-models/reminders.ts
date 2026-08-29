import type { ReminderPlanContract } from "../api/contract/reminders";

export interface ReminderQuickOption {
  fireAt: string;
  label: string;
}

export interface ReminderPlanRow {
  id: string;
  label: string;
  status: ReminderPlanContract["status"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokyoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function nextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function reminderQuickOptions(now: Date): ReminderQuickOption[] {
  const dateKey = tokyoDateKey(now);
  const inOneHour = new Date(now.getTime() + 60 * 60_000);
  const todayEvening = new Date(`${dateKey}T18:00:00+09:00`);
  const tomorrowMorning = new Date(`${nextDateKey(dateKey)}T09:00:00+09:00`);
  const options: ReminderQuickOption[] = [
    { fireAt: inOneHour.toISOString(), label: "1 小时后" },
  ];
  if (todayEvening.getTime() > now.getTime()) {
    options.push({ fireAt: todayEvening.toISOString(), label: "今天 18:00" });
  }
  options.push({ fireAt: tomorrowMorning.toISOString(), label: "明天 09:00" });
  return options;
}

export function reminderPlansToView(payload: unknown): ReminderPlanRow[] {
  if (!isRecord(payload) || !Array.isArray(payload.reminders)) return [];
  return payload.reminders.flatMap((value): ReminderPlanRow[] => {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.fireAt !== "string") return [];
    const status = value.status;
    if (status !== "scheduled" && status !== "delivered" && status !== "cancelled" && status !== "failed") return [];
    const parts = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "numeric",
      timeZone: "Asia/Tokyo",
    }).formatToParts(new Date(value.fireAt));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return [{
      id: value.id,
      label: `${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`,
      status,
    }];
  }).sort((left, right) => left.label.localeCompare(right.label));
}
