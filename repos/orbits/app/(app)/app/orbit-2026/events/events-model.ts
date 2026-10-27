// R26 イベント: pure view helpers for the Web page (dates, chips, tones, list order). No IO, no clock — `now` is passed in.
import type { EventAssessmentContract, EventAssessmentVerdict } from "../../../../../shared/contract/event-assessment";
import type { MyEventItem } from "../../../../../shared/contract/events-mine";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { EVENT_PRICE_FREE } from "../../../../../shared/compute/event-score-input";

export type Tone = "teal" | "apricot" | "pink" | "lav" | "blue" | "neutral";

const TOKYO = 9 * 3_600_000;

function tokyo(iso: string): { y: number; m: number; d: number; wd: number; hh: number; mm: number; day: number } | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time + TOKYO);
  return { d: date.getUTCDate(), day: Math.floor((time + TOKYO) / 86_400_000), hh: date.getUTCHours(), m: date.getUTCMonth() + 1, mm: date.getUTCMinutes(), wd: date.getUTCDay(), y: date.getUTCFullYear() };
}

const LOCALE: Record<OrbitLanguage, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

/** 「10月16日」 / 「10/16」 in Tokyo time. */
export function eventMonthDay(iso: string | undefined | null, language: OrbitLanguage): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat(LOCALE[language], language === "en" ? { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" } : { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(new Date(time));
}

/** 「10月16日（金）」; with `time`: 「10月7日（水）19:00」 (the board's list and card format). */
export function eventDate(iso: string | undefined | null, language: OrbitLanguage, options: { time?: boolean } = {}): string {
  if (!iso) return "";
  const t = tokyo(iso);
  if (!t) return "";
  const weekday = new Intl.DateTimeFormat(LOCALE[language], { timeZone: "Asia/Tokyo", weekday: "short" }).format(new Date(Date.parse(iso)));
  const clock = options.time ? `${t.hh}:${String(t.mm).padStart(2, "0")}` : "";
  const md = eventMonthDay(iso, language);
  if (language === "en") return `${weekday} ${md}${clock ? ` ${clock}` : ""}`;
  return `${md}\uFF08${weekday}\uFF09${clock}`;
}

/** The board shows a time only for evening / early events (「19:00」「8:00」), the date alone for day-long ones. */
export function showsTime(iso: string | undefined | null): boolean {
  const t = iso ? tokyo(iso) : null;
  return Boolean(t && (t.hh >= 17 || t.hh < 9));
}

export function eventWhen(iso: string | undefined | null, language: OrbitLanguage): string {
  return eventDate(iso, language, { time: showsTime(iso) });
}

/** 今夜 / 今日 / 明日 chip (null otherwise). */
export function relativeDay(iso: string | undefined | null, now: Date): "tonight" | "today" | "tomorrow" | null {
  const t = iso ? tokyo(iso) : null;
  const n = tokyo(now.toISOString());
  if (!t || !n) return null;
  if (t.day === n.day) return t.hh >= 17 ? "tonight" : "today";
  if (t.day === n.day + 1) return "tomorrow";
  return null;
}

export function verdictTone(verdict: EventAssessmentVerdict): Tone {
  return verdict === "recommend" ? "teal" : verdict === "conditional" ? "apricot" : "pink";
}

/** Ring colour by score (web.html #12): ≥70 plum-700, 50–69 plum-500, <50 rose-500. */
export function ringColor(score: number): `var(--${string})` {
  return score >= 70 ? "var(--plum-700)" : score >= 50 ? "var(--plum-500)" : "var(--rose-500)";
}

/** 会いたい人 N名: the plan types expected there (not the people you already know). */
export function meetCount(assessment: EventAssessmentContract): number | null {
  const items = (assessment.meetCandidates ?? []).filter((item) => item.emoji !== "👋");
  if (items.length === 0) return null;
  return items.reduce((sum, item) => sum + (item.count ?? 0), 0);
}

/** Card subtitle: date · venue · fee (the board's 「10月16日（金） · 東京国際フォーラム · ¥15,000」). */
export function cardLine(assessment: EventAssessmentContract, language: OrbitLanguage, freeLabel: string, options: { venue?: boolean } = {}): string {
  const facts = assessment.facts;
  const price = facts.price === EVENT_PRICE_FREE || facts.price === "Free" ? freeLabel : facts.price;
  return [eventWhen(facts.startsAt, language), options.venue === false ? null : facts.venue ?? facts.area, price].filter(Boolean).join(" · ");
}

/** 評価したイベント · スコア順; 見送り at the bottom; still-reading first so the person sees it. */
export function orderAssessed(items: readonly EventAssessmentContract[]): EventAssessmentContract[] {
  const rank = (item: EventAssessmentContract) => (item.status === "reading" ? 0 : item.userDecision === "dismissed" ? 2 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || b.total - a.total || b.createdAt.localeCompare(a.createdAt));
}

/** Only ready / needs-input assessments are cards in the grid; failed ones open their failure screen. */
export function isShownInGrid(item: EventAssessmentContract): boolean {
  return item.status !== "failed" || item.failureReason === "login_required" || item.failureReason === "not_event_page";
}

export function nextGoing(items: readonly MyEventItem[]): MyEventItem | null {
  return items.find((item) => item.status !== "cancelled" && item.status !== "rejected") ?? null;
}

export function monthOf(now: Date): number {
  return new Date(now.getTime() + TOKYO).getUTCMonth() + 1;
}

/** `?tab=` → the tab. 2026-10-27：探す opens first (評価 by `?tab=assess`); the segment order stays 評価 / 参加予定 / 探す. */
export function tabOf(value: string | null | undefined): "assess" | "going" | "discover" {
  return value === "going" || value === "assess" ? value : "discover";
}
