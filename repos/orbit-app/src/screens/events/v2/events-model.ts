// R26 イベント (App): pure view helpers (dates in Tokyo time, chips, list order). No IO, no clock.
import { EVENT_PRICE_FREE } from "../../../api/compute/event-score-input";
import type { EventAssessmentContract } from "../../../api/contract/event-assessment";

const TOKYO = 9 * 3_600_000;
const LOCALE: Record<string, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

function parts(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time + TOKYO);
  return { day: Math.floor((time + TOKYO) / 86_400_000), hh: date.getUTCHours(), mm: date.getUTCMinutes(), time };
}

/** 「10月16日（金）」, 「10月7日（水）19:00」 for evening / early starts (app.html #15). */
/** AG20a: `allDayLabel` (the copy's 「全天」) for an all-day event — the day, and the label where the time would be. */
export function appEventWhen(iso: string | undefined | null, language: string, allDayLabel?: string | null): string {
  const p = iso ? parts(iso) : null;
  if (!p) return "";
  const locale = LOCALE[language] ?? "ja-JP";
  const md = new Intl.DateTimeFormat(locale, language === "en" ? { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" } : { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(new Date(p.time));
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Tokyo", weekday: "short" }).format(new Date(p.time));
  const clock = allDayLabel ? allDayLabel : p.hh >= 17 || p.hh < 9 ? `${p.hh}:${String(p.mm).padStart(2, "0")}` : "";
  if (language === "en") return `${weekday} ${md}${clock ? ` ${clock}` : ""}`;
  return `${md}（${weekday}）${clock}`;
}

/** AG20a: the copy's 「全天」 for an all-day item of 「我的活动」, else nothing. */
export function appAllDayLabel(item: { allDay?: boolean | undefined }, label: string): string | null {
  return item.allDay === true ? label : null;
}

/** 「10月16日（金） · ¥15,000」 (the 評価したイベント row). */
export function appCardLine(item: EventAssessmentContract, language: string, freeLabel: string): string {
  const price = item.facts.price === EVENT_PRICE_FREE ? freeLabel : item.facts.price;
  return [appEventWhen(item.facts.startsAt, language), price].filter(Boolean).join(" · ");
}

export function relativeDay(iso: string | undefined | null, now: Date): "tonight" | "today" | "tomorrow" | null {
  const p = iso ? parts(iso) : null;
  const n = parts(now.toISOString());
  if (!p || !n) return null;
  if (p.day === n.day) return p.hh >= 17 ? "tonight" : "today";
  if (p.day === n.day + 1) return "tomorrow";
  return null;
}

export function monthOf(now: Date): number {
  return new Date(now.getTime() + TOKYO).getUTCMonth() + 1;
}

export function meetCountOf(item: EventAssessmentContract): number | null {
  const people = (item.meetCandidates ?? []).filter((meet) => meet.source !== "known" && meet.emoji !== "👋");
  return people.length ? people.reduce((sum, meet) => sum + (meet.count ?? 0), 0) : null;
}

/** 調べたイベント · 新しい順（2026-11-15 去分数：不再按分数排）；読み取り中が先頭。 */
export function orderAssessed(items: readonly EventAssessmentContract[]): EventAssessmentContract[] {
  const rank = (item: EventAssessmentContract) => (item.status === "reading" ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
}

/** 「7」/「10」（.datebox：東京の日と月）。 */
export function tokyoDay(iso: string): { day: number; month: number } | null {
  const p = parts(iso);
  if (!p) return null;
  const date = new Date(p.time + TOKYO);
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1 };
}

/** 「19:00」（ページ内のイベント行；0:00 = 時刻なし）。 */
export function appEventTime(iso: string, _language: string): string | null {
  const p = parts(iso);
  if (!p || (p.hh === 0 && p.mm === 0)) return null;
  return `${p.hh}:${String(p.mm).padStart(2, "0")}`;
}

/** The first http(s) link in copied text (「粘贴网址」 fills the field with it). */
export function clipboardEventUrl(text: string | null | undefined): string | null {
  return text?.match(/https?:\/\/[^\s<>"'「」]+/u)?.[0] ?? null;
}
