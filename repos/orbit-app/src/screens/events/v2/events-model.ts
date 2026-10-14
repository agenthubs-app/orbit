// R26 イベント (App): pure view helpers (dates in Tokyo time, chips, ring colour, list order). No IO, no clock.
import { EVENT_PRICE_FREE } from "../../../api/compute/event-score-input";
import type { EventAssessmentContract, EventAssessmentVerdict } from "../../../api/contract/event-assessment";

const TOKYO = 9 * 3_600_000;
const LOCALE: Record<string, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };

function parts(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time + TOKYO);
  return { day: Math.floor((time + TOKYO) / 86_400_000), hh: date.getUTCHours(), mm: date.getUTCMinutes(), time };
}

/** 「10月16日（金）」, 「10月7日（水）19:00」 for evening / early starts (app.html #15). */
export function appEventWhen(iso: string | undefined | null, language: string): string {
  const p = iso ? parts(iso) : null;
  if (!p) return "";
  const locale = LOCALE[language] ?? "ja-JP";
  const md = new Intl.DateTimeFormat(locale, language === "en" ? { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" } : { day: "numeric", month: "long", timeZone: "Asia/Tokyo" }).format(new Date(p.time));
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Tokyo", weekday: "short" }).format(new Date(p.time));
  const clock = p.hh >= 17 || p.hh < 9 ? `${p.hh}:${String(p.mm).padStart(2, "0")}` : "";
  if (language === "en") return `${weekday} ${md}${clock ? ` ${clock}` : ""}`;
  return `${md}（${weekday}）${clock}`;
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

export function verdictKey(verdict: EventAssessmentVerdict): "verdictRecommend" | "verdictConditional" | "verdictSkip" {
  return verdict === "recommend" ? "verdictRecommend" : verdict === "conditional" ? "verdictConditional" : "verdictSkip";
}

export function verdictTone(verdict: EventAssessmentVerdict): "teal" | "apricot" | "neutral" {
  return verdict === "recommend" ? "teal" : verdict === "conditional" ? "apricot" : "neutral";
}

/** Ring colour key by score: ≥70 plum-700, 50–69 plum-500, <50 rose-500. */
export function ringColor(score: number): "plum700" | "plum500" | "rose500" {
  return score >= 70 ? "plum700" : score >= 50 ? "plum500" : "rose500";
}

export function meetCountOf(item: EventAssessmentContract): number | null {
  const people = (item.meetCandidates ?? []).filter((meet) => meet.source !== "known" && meet.emoji !== "👋");
  return people.length ? people.reduce((sum, meet) => sum + (meet.count ?? 0), 0) : null;
}

/** 評価したイベント · スコア順; reading first, 見送り last. */
export function orderAssessed(items: readonly EventAssessmentContract[]): EventAssessmentContract[] {
  const rank = (item: EventAssessmentContract) => (item.status === "reading" ? 0 : item.userDecision === "dismissed" ? 2 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || b.total - a.total || b.createdAt.localeCompare(a.createdAt));
}
