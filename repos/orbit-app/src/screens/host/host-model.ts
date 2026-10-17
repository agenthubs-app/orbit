// R17 主催（App）：画面用的纯函数（日期、行内一句、颜色、路由）。没有 React，测试直接调。与 Web host-model.ts 同口径。
import type { HostCenterEventRow, HostCenterSummary, HostEventStatus } from "../../api/contract/host-events";

export type HostT = (key: string, values?: Record<string, string | number>) => string;
export type HostLanguage = "ja" | "zh" | "en";

const lang = (language: string): HostLanguage => (language === "zh" || language === "en" ? language : "ja");
const LOCALE: Record<HostLanguage, string> = { en: "en-US", ja: "ja-JP", zh: "zh-CN" };
/** 「10月」/「Oct」与「水」/「三」/「Wed」（Intl，按东京日期：部品已平移 +9h，这里用 UTC 取）。 */
const intlPart = (utc: Date, language: HostLanguage, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE[language], { ...options, timeZone: "UTC" }).format(utc);
const monthLabel = (utc: Date, language: HostLanguage) => intlPart(utc, language, { month: language === "en" ? "short" : "numeric" });
const weekdayLabel = (utc: Date, language: HostLanguage) => intlPart(utc, language, { weekday: "short" }).replace(/^周|^星期/u, "");

/** 東京の日付部品（会場はすべて Asia/Tokyo）。 */
export function tokyoParts(iso: string | null | undefined) {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return null;
  const t = new Date(time + 9 * 3_600_000);
  return { day: t.getUTCDate(), hour: t.getUTCHours(), minute: t.getUTCMinutes(), month: t.getUTCMonth() + 1, shifted: t, wd: t.getUTCDay(), year: t.getUTCFullYear() };
}

/** 「19:00」「8:00」（画板时不补 0）。 */
export function hostTime(iso: string | null | undefined): string {
  const p = tokyoParts(iso);
  return p ? `${p.hour}:${String(p.minute).padStart(2, "0")}` : "";
}

/** 「10月7日（水）19:00」。 */
export function hostDateLong(iso: string | null | undefined, language: string, t: HostT): string {
  const p = tokyoParts(iso);
  if (!p) return "";
  const l = lang(language);
  return t("dateLong", { d: p.day, mon: monthLabel(p.shifted, l), time: hostTime(iso), wd: weekdayLabel(p.shifted, l) }).trim();
}

/** 「11月5日」。 */
export function hostDateDay(iso: string | null | undefined, language: string, t: HostT): string {
  const p = tokyoParts(iso);
  return p ? t("dateDay", { d: p.day, mon: monthLabel(p.shifted, lang(language)) }) : "";
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

/** emoji 的底色（画板：🥂 lav / 🏭 blue / 💰 pink / 🍱 apricot；其他按 eventId 固定）。 */
export function eventTone(emoji: string | null, eventId: string): HostTone {
  if (emoji && EMOJI_TONES[emoji]) return EMOJI_TONES[emoji]!;
  let hash = 0;
  for (const char of eventId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export type StatusChip = { label: string; tone: "teal" | "blue" | "apricot" | "coral" | null; live: boolean };

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

/** 申込 / 定員 的进度条宽（%）。没有定员为 0。 */
export function fillPercent(applied: number, capacity: number | null): number {
  if (!capacity || capacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((applied / capacity) * 100)));
}

/** 行内一句（受付中 · 残り N名 / マッチング未生成 / 審査待ち N名 / 会後フォロー N% / 下書き / 中止 / アーカイブ）。 */
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

/** 运营台页头一句：「本日 19:00 · 開催中」/「10月21日（水）8:00 · 開催前」。 */
export function consoleSubtitle(startsAt: string | null, status: HostEventStatus, now: Date, language: string, t: HostT): string {
  const when = sameTokyoDay(startsAt, now) ? `${t("today")} ${hostTime(startsAt)}` : hostDateLong(startsAt, language, t);
  return [when, t(statusChip(status).label)].filter(Boolean).join(" · ");
}

export type HostSeg = "overview" | "matching" | "people" | "check-in" | "report";
export const HOST_SEGS: readonly HostSeg[] = ["overview", "matching", "people", "check-in", "report"];
export const parseSeg = (value: unknown): HostSeg => (HOST_SEGS.includes(value as HostSeg) ? (value as HostSeg) : "overview");

export const centerHref = "/events/center";
export const consoleHref = (eventId: string, seg?: HostSeg) => `/events/${encodeURIComponent(eventId)}/operations${seg && seg !== "overview" ? `?seg=${seg}` : ""}`;
export const checkInHref = (eventId: string) => `/events/${encodeURIComponent(eventId)}/operations/check-in`;
/** 旧运营子页（admission / experience / roles / analytics）→ 新运营台的哪一段。 */
export const LEGACY_SEG: Record<"admission" | "experience" | "roles" | "analytics", HostSeg> = { admission: "people", analytics: "report", experience: "overview", roles: "overview" };

/** 「PC で開く」各画面在 Web 上的地址（desktop-link 的 path）。 */
export const desktopPath = {
  center: "/app/events/center",
  create: "/app/events/center/new",
  edit: (eventId: string) => `/app/events/${encodeURIComponent(eventId)}/edit`,
  profiles: "/app/events/center/profiles",
  report: (eventId: string) => `/app/events/${encodeURIComponent(eventId)}/operations?tab=report`,
  template: (template: "mixer" | "study" | "roundtable") => `/app/events/center/new?template=${template}`,
} as const;

/** 受付で表示する「19:46」。 */
export const clock = (iso: string) => hostTime(iso);

/** マイページ「主催したイベント」行的第二行（HostEventsRow）。 */
export function hostEventsRowSub(summary: HostCenterSummary | null, t: HostT): string {
  if (!summary || summary.eventCount === 0) return t("appRowEmpty");
  return summary.activeCount > 0 ? t("appRowCountActive", { a: summary.activeCount, n: summary.eventCount }) : t("appRowCount", { n: summary.eventCount });
}

