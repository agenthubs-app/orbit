// R17 主催：画面で使う純関数（翻訳・日付・行の文言・色）。React なし、テストから直接呼べる。
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { HostCenterEventRow, HostEventStatus } from "../../../../../shared/contract/host-events";
import { hostCopy, type HostCopyKey } from "../copy/host";
import { pickCopy } from "../copy/types";

export type HostT = (key: HostCopyKey, values?: Record<string, string | number>) => string;

export function hostTranslator(language: OrbitLanguage): HostT {
  return (key, values) => {
    let text = pickCopy(hostCopy[key], language);
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
}

const WEEK: Record<OrbitLanguage, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 「10月」/「Oct」（日期文案的 {mon}）。 */
const monthLabel = (month: number, language: OrbitLanguage) => (language === "en" ? MONTHS[month - 1]! : `${month}月`);

/** 東京の日付部品（主催の日時は会場の時間で出す；会場はすべて Asia/Tokyo）。 */
export function tokyoParts(iso: string | null | undefined) {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return null;
  const t = new Date(time + 9 * 3_600_000);
  return { day: t.getUTCDate(), hour: t.getUTCHours(), minute: t.getUTCMinutes(), month: t.getUTCMonth() + 1, wd: t.getUTCDay(), year: t.getUTCFullYear() };
}

/** 「19:00」「8:00」（画板は時の先頭 0 を付けない）。 */
export function hostTime(iso: string | null | undefined): string {
  const p = tokyoParts(iso);
  return p ? `${p.hour}:${String(p.minute).padStart(2, "0")}` : "";
}

/** 「10月7日（水）19:00」。 */
export function hostDateLong(iso: string | null | undefined, language: OrbitLanguage, t: HostT): string {
  const p = tokyoParts(iso);
  if (!p) return "";
  return t("dateLong", { d: p.day, mon: monthLabel(p.month, language), time: hostTime(iso), wd: WEEK[language][p.wd]! }).trim();
}

/** 「11月5日」。 */
export function hostDateDay(iso: string | null | undefined, t: HostT, language: OrbitLanguage = "ja"): string {
  const p = tokyoParts(iso);
  return p ? t("dateDay", { d: p.day, mon: monthLabel(p.month, language) }) : "";
}

/** 「10/14」。 */
export function hostDateShort(iso: string | null | undefined, t: HostT): string {
  const p = tokyoParts(iso);
  return p ? t("dateShort", { d: p.day, m: p.month }) : "";
}

export function sameTokyoDay(a: string | null | undefined, now: Date): boolean {
  const p = tokyoParts(a);
  const q = tokyoParts(now.toISOString());
  return Boolean(p && q && p.year === q.year && p.month === q.month && p.day === q.day);
}

export type HostTone = "lav" | "blue" | "pink" | "apricot" | "teal";
const EMOJI_TONES: Record<string, HostTone> = { "🍱": "apricot", "🏭": "blue", "💰": "pink", "🥂": "lav" };
const TONES: readonly HostTone[] = ["lav", "blue", "pink", "apricot", "teal"];

/** emoji の地色（画板：🥂 lav / 🏭 blue / 💰 pink / 🍱 apricot；それ以外は eventId で固定）。 */
export function eventTone(emoji: string | null, eventId: string): HostTone {
  if (emoji && EMOJI_TONES[emoji]) return EMOJI_TONES[emoji]!;
  let hash = 0;
  for (const char of eventId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export type StatusChip = { label: HostCopyKey; tone: "teal" | "blue" | "apricot" | "coral" | null; live: boolean };

export function statusChip(status: HostEventStatus): StatusChip {
  switch (status) {
    case "live": return { label: "fLive", live: true, tone: "teal" };
    case "upcoming": return { label: "fUpcoming", live: false, tone: "blue" };
    case "ended": return { label: "fEnded", live: false, tone: null };
    case "draft": return { label: "sDraft", live: false, tone: "apricot" };
    case "cancelled": return { label: "sCancelled", live: false, tone: "coral" };
    case "archived": return { label: "sArchived", live: false, tone: null };
  }
}

/** 申込 / 定員 のバー幅（%、整数）。定員なしは 0。 */
export function fillPercent(applied: number, capacity: number | null): number {
  if (!capacity || capacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((applied / capacity) * 100)));
}

/** 行のひとこと（受付中 · 残り N名 / マッチング未生成 / 審査待ち N名 / 会後フォロー N% / 下書き / 中止 / アーカイブ）。 */
export function rowNote(row: HostCenterEventRow, t: HostT): string {
  const note = row.note;
  switch (note.kind) {
    case "check_in_open": return t("nCheckInOpen", { n: note.count ?? 0 });
    case "matching_missing": return t("todoMatching");
    case "review_pending": return t("todoReview", { n: note.count ?? 0 });
    case "followup": return t("nFollowup", { r: note.rate == null ? "—" : `${note.rate}%` });
    case "draft": return t("nDraft");
    case "cancelled": return t("nCancelled", { d: hostDateShort(note.at, t), n: note.count ?? row.applied });
    case "archived": return t("nArchived");
    case "none": return "";
  }
}

export const consoleHref = (eventId: string, tab?: string) => `/app/events/${encodeURIComponent(eventId)}/operations${tab ? `?tab=${tab}` : ""}`;
export const checkInHref = (eventId: string) => `/app/events/${encodeURIComponent(eventId)}/operations/check-in`;
export const CREATE_HREF = "/app/events/center/new";
export const JOIN_HREF = "/app/host/join";
