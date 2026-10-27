import { resolveLocalDateTime } from "../time/date-time";
import type { ReminderPlanContract } from "../api/contract/reminders";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";

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

function tokyoDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
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

// QA-D: labels follow the UI language (they were fixed Chinese in the Japanese UI).
export function reminderQuickOptions(now: Date, timeZone = "Asia/Tokyo", t: OrbitTranslator = createTranslator("zh")): ReminderQuickOption[] {
  const dateKey = tokyoDateKey(now, timeZone);
  const inOneHour = new Date(now.getTime() + 60 * 60_000);
  const todayEvening = resolveLocalDateTime(dateKey, "18:00", timeZone);
  const tomorrowMorning = resolveLocalDateTime(nextDateKey(dateKey), "09:00", timeZone);
  const options: ReminderQuickOption[] = [
    { fireAt: inOneHour.toISOString(), label: t("taskDetail.remindInHour") },
  ];
  if (todayEvening && Date.parse(todayEvening) > now.getTime()) {
    options.push({ fireAt: todayEvening, label: t("taskDetail.remindTonight") });
  }
  if (tomorrowMorning) options.push({ fireAt: tomorrowMorning, label: t("taskDetail.remindTomorrow") });
  return options;
}

export function reminderPlansToView(payload: unknown, timeZone = "Asia/Tokyo", language: "zh" | "ja" | "en" = "zh"): ReminderPlanRow[] {
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
      timeZone,
    }).formatToParts(new Date(value.fireAt));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const english = new Date(value.fireAt);
    return [{
      id: value.id,
      label: language === "en"
        ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(english)
        : `${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`,
      status,
    }];
  }).sort((left, right) => left.label.localeCompare(right.label));
}
