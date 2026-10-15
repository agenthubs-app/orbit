// R27 イベント参加者の動線（App）的纯函数：日期（东京时间）、色调、标签（与 Web orbit-2026/events/DiscoverTab.tsx 同口径）。
import type { EventDiscoverArea, EventDiscoverPeriod, EventDiscoverRow, EventDiscoverTheme } from "../../../api/contract/event-discover";

export type JourneyTone = "teal" | "lav" | "blue" | "apricot" | "pink";
const RECOMMEND_TONES: readonly JourneyTone[] = ["teal", "lav", "blue"];
const WEEKDAYS: Record<string, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };

export function tokyo(iso: string | null | undefined): { year: number; month: number; day: number; weekday: number; hh: number; mm: number } | null {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(time)) return null;
  const d = new Date(time + 9 * 3_600_000);
  return { day: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), month: d.getUTCMonth() + 1, weekday: d.getUTCDay(), year: d.getUTCFullYear() };
}
export const weekday = (language: string, index: number) => (WEEKDAYS[language] ?? WEEKDAYS.ja!)[index]!;
export const hm = (iso: string | null | undefined) => { const p = tokyo(iso); return p ? `${p.hh}:${String(p.mm).padStart(2, "0")}` : ""; };

/** 「10/16（金）」/ 晚上的场次带时刻「10/27（火）19:00」。 */
export function discoverWhen(iso: string, language: string, withTime = true): string {
  const p = tokyo(iso);
  if (!p) return "";
  const wd = weekday(language, p.weekday);
  const date = language === "en" ? `${wd} ${p.month}/${p.day}` : `${p.month}/${p.day}（${wd}）`;
  return withTime && p.hh >= 17 ? `${date}${p.hh}:${String(p.mm).padStart(2, "0")}` : date;
}
/** 「10/7（水）19:00–21:30」 */
export function eventRange(startsAt: string, endsAt: string | null | undefined, language: string): string {
  const s = tokyo(startsAt);
  if (!s) return "";
  const wd = weekday(language, s.weekday);
  const date = language === "en" ? `${wd} ${s.month}/${s.day} ` : `${s.month}/${s.day}（${wd}）`;
  const e = endsAt ? hm(endsAt) : "";
  return `${date}${hm(startsAt)}${e ? `–${e}` : ""}`;
}
export const monthDaySlash = (iso: string | null | undefined) => { const p = tokyo(iso); return p ? `${p.month}/${p.day}` : ""; };

export function rowTone(row: Pick<EventDiscoverRow, "verdict">, index: number): { emo: JourneyTone; chip: JourneyTone | null } {
  if (row.verdict === "conditional") return { chip: "apricot", emo: "apricot" };
  if (row.verdict === "skip") return { chip: null, emo: "pink" };
  const tone = RECOMMEND_TONES[index % RECOMMEND_TONES.length]!;
  return { chip: tone, emo: tone };
}

export type JourneyT = (key: string, values?: Record<string, string | number>) => string;
type T = JourneyT;
export const feeText = (yen: number | null | undefined, t: T) => (yen === 0 ? t("free") : typeof yen === "number" ? `¥${yen.toLocaleString("en-US")}` : null);
export const periodLabel = (p: EventDiscoverPeriod, t: T) => t(`${p === "this_week" ? "pThisWeek" : p === "this_month" ? "pThisMonth" : p === "next_month" ? "pNextMonth" : "pCustom"}`);
export const areaLabel = (a: EventDiscoverArea, t: T) => t(`${a === "online" ? "aOnline" : a === "tokyo" ? "aTokyo" : a === "osaka" ? "aOsaka" : "aNagoya"}`);
export const themeLabel = (x: EventDiscoverTheme, t: T) => t(`${({ funding: "tFunding", global: "tGlobal", hiring: "tHiring", ipo: "tIpo", management: "tManagement", manufacturing_dx: "tMfgDx", networking: "tNetworking", saas: "tSaas" } as const)[x]}`);
export const PERIODS: readonly EventDiscoverPeriod[] = ["this_week", "this_month", "next_month"];
export const AREAS: readonly EventDiscoverArea[] = ["online", "tokyo", "osaka", "nagoya"];
export const THEMES: readonly EventDiscoverTheme[] = ["funding", "saas", "manufacturing_dx", "hiring", "management", "networking", "ipo", "global"];
