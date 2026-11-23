"use client";

// R27 イベント › 探す（Web；b2 #11 空 / #12 少量 / #13 大量 + テーマ弹层，b12 #346 / #348 1024 / 390）。
// 数据来自 GET /api/events/discover；2026-11-15 起不显示分数，卡片只列「あなたに関係すること」标签（Relevance.tsx），
// 「会いたい人が来る」= 服务端 planFit（people 组，按日期），すべて 一律按日期。保存 = 参加予定に追加。
// 興味なし（契约 9）在表格行的菜单里。检索走 /api/events/search（R30 同一服务）。
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { EventDiscoverArea, EventDiscoverFormat, EventDiscoverPeriod, EventDiscoverQuery, EventDiscoverResponse, EventDiscoverRow, EventDiscoverTheme } from "../../../../../shared/contract/event-discover";
import type { EventRelevance } from "../../../../../shared/contract/event-relevance";
import type { EventRecommendationDismissReason } from "../../../../../shared/contract/event-recommendation-feedback";
import type { EventSearchResponse } from "../../../../../shared/contract/event-search";
import type { EventSummaryResponse } from "../../../../../shared/contract/event-summary";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { PageSkeletonBody } from "../shell/PageSkeleton";
import { eventsJourneyCopy as jc } from "../copy/eventsJourney";
import { DefaultRail } from "../shell/Orbit2026Shell";
import { pickCopy } from "../copy/types";
import { BottomSheet, ContextMenu, Drawer, FilterOption, Icon, Kbd, SampleTag, Toggle, useStandardCopy, useToast, type MenuItem } from "../ui";
import { EventSidePanel, type PanelSeed, type PanelTone } from "./EventSidePanel";
import { translator as assessTranslator } from "./AssessmentDetail";
import { eventsApi, newIdempotencyKey } from "./events-api";
import { ringColor } from "./events-model";
import { RelevanceCard, RelevanceChips, registrationChipText, relevanceRows, relevanceTitle } from "./Relevance";
import { journeyApi } from "./journey-api";
import { readSavedPlanGoal, type SavedPlanGoal } from "../plan/saved-goal";
import styles from "./events.module.css";
import d from "./discover.module.css";
import r from "./record.module.css";
import sp from "./side-panel.module.css";

export type JourneyT = (key: keyof typeof jc, values?: Record<string, string | number>) => string;
export function journeyTranslator(language: OrbitLanguage): JourneyT {
  return (key, values) => {
    let text = pickCopy(jc[key], language);
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
}

type Tier = "wide" | "medium" | "narrow";
type Tone = "teal" | "lav" | "blue" | "apricot" | "pink";
const RECOMMEND_TONES: readonly Tone[] = ["teal", "lav", "blue"];
/** chip 色：R26 的 events.module.css 没有 blue，这里补。 */
export const toneClass = (tone: Tone) => (tone === "blue" ? d.c_blue : styles[`c_${tone}`]);

/** 推荐行按顺序轮换 teal / lav / blue；条件付き = apricot；見送り推奨 = emoji pink、chip 无色（b2 #12 / #13）。 */
export function rowTone(row: Pick<EventDiscoverRow, "verdict">, index: number): { emo: Tone; chip: Tone | null } {
  if (row.verdict === "conditional") return { chip: "apricot", emo: "apricot" };
  if (row.verdict === "skip") return { chip: null, emo: "pink" };
  const tone = RECOMMEND_TONES[index % RECOMMEND_TONES.length]!;
  return { chip: tone, emo: tone };
}

const WEEKDAYS: Record<OrbitLanguage, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };
function tokyo(iso: string): { month: number; day: number; weekday: number; hh: string; mm: string } | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const t = new Date(time + 9 * 3_600_000);
  return { day: t.getUTCDate(), hh: String(t.getUTCHours()).padStart(2, "0"), mm: String(t.getUTCMinutes()).padStart(2, "0"), month: t.getUTCMonth() + 1, weekday: t.getUTCDay() };
}
/** 「10/16（金）」「10/27（火）19:00」：只在夜间（≥17 时）带时间，与画板一致。 */
export function discoverWhen(iso: string, language: OrbitLanguage, withTime = true): string {
  const p = tokyo(iso);
  if (!p) return "";
  const wd = WEEKDAYS[language][p.weekday];
  const date = language === "en" ? `${wd} ${p.month}/${p.day}` : `${p.month}/${p.day}（${wd}）`;
  // 英文「Tue 10/27 19:00」要空格；日中「10/27（火）19:00」括号后不空。
  return withTime && Number(p.hh) >= 17 ? `${date}${language === "en" ? " " : ""}${p.hh}:${p.mm}` : date;
}
export const monthDay = (iso: string) => { const p = tokyo(iso); return p ? `${p.month}/${p.day}` : ""; };
export const dayMonth = (iso: string, t: JourneyT) => { const p = tokyo(iso); return p ? { day: p.day, month: t("monthLabel", { m: p.month }) } : { day: 0, month: "" }; };
export const feeText = (yen: number | null | undefined, t: JourneyT) => (yen === 0 ? t("free") : typeof yen === "number" ? `¥${yen.toLocaleString("en-US")}` : null);

/** DISCOVER-RULES 2026-10-29 D3：これから · 今週 · 今月 · 来月 · 開催済み。 */
const PERIODS: readonly EventDiscoverPeriod[] = ["upcoming", "this_week", "this_month", "next_month", "past"];
const AREAS: readonly EventDiscoverArea[] = ["online", "tokyo", "osaka", "nagoya"];
const THEMES: readonly EventDiscoverTheme[] = ["funding", "saas", "manufacturing_dx", "hiring", "management", "networking", "ipo", "global"];
const FORMATS: readonly EventDiscoverFormat[] = ["speakers", "networking", "small"];
export const periodLabel = (p: EventDiscoverPeriod, t: JourneyT) => t(p === "upcoming" ? "pUpcoming" : p === "past" ? "pPast" : p === "this_week" ? "pThisWeek" : p === "this_month" ? "pThisMonth" : p === "next_month" ? "pNextMonth" : "pCustom");
export const areaLabel = (a: EventDiscoverArea, t: JourneyT) => t(a === "online" ? "aOnline" : a === "tokyo" ? "aTokyo" : a === "osaka" ? "aOsaka" : "aNagoya");
export const themeLabel = (x: EventDiscoverTheme, t: JourneyT) => t(({ funding: "tFunding", global: "tGlobal", hiring: "tHiring", ipo: "tIpo", management: "tManagement", manufacturing_dx: "tMfgDx", networking: "tNetworking", saas: "tSaas" } as const)[x]);
export const formatLabel = (f: EventDiscoverFormat, t: JourneyT) => t(f === "speakers" ? "fSpeakers" : f === "networking" ? "fNetworking" : "fSmall");

/** 默认条件（DISCOVER-RULES 2026-10-29 D1 / D2）：これから · 場所 不限、テーマ 未选、おすすめ順。 */
export const DEFAULT_DISCOVER_QUERY: EventDiscoverQuery = { areas: [], period: "upcoming", planFirst: true, sort: "recommended", themes: [] };

/** URL 上的条件（可分享；`?tab=discover&period=this_week&areas=tokyo&themes=manufacturing_dx`）。 */
/** The last discover answer for a query (orbit-last-answer: back on 探す, the cards show at once). */
const discoverAnswerKey = (query: EventDiscoverQuery) => `events:discover:${JSON.stringify(query)}`;

export function queryFromParams(params: URLSearchParams | null): EventDiscoverQuery {
  if (!params) return DEFAULT_DISCOVER_QUERY;
  const list = <T extends string>(key: string, allowed: readonly T[]) => (params.get(key) ?? "").split(",").filter((value): value is T => (allowed as readonly string[]).includes(value));
  const period = params.get("period");
  return {
    ...DEFAULT_DISCOVER_QUERY,
    ...(period && (PERIODS as readonly string[]).includes(period) ? { period: period as EventDiscoverPeriod } : {}),
    ...(params.has("areas") ? { areas: list("areas", AREAS) } : {}),
    ...(params.has("themes") ? { themes: list("themes", THEMES) } : {}),
    ...(params.has("formats") ? { formats: list("formats", FORMATS) } : {}),
    ...(params.get("sort") === "date" ? { sort: "date" as const } : {}),
  };
}

/** 2026-11-23 简介栏：点了哪张卡（1440 画在右栏；834 / 390 由 DiscoverTab 自己画浮层 / 底部面板）。 */
export interface DiscoverPanelState { eventId: string; seed: PanelSeed | null; tone: PanelTone; now: Date; onClose: () => void; onSelect: (eventId: string) => void }
/** `loaded`: false until the first discover answer is in (the page keeps the shell's rail skeleton till then). */
export interface DiscoverRailState { loaded: boolean; row: EventDiscoverRow | null; signedOut: boolean; panel?: DiscoverPanelState | null }

/** The saved goal (no-plan guide card) as last read: `{ goal }` so a remembered "no goal" is told apart from "not read". */
const SAVED_GOAL_KEY = "events:discover:savedGoal";

/** 没有计划、一场活动都没有时的「プランができると」示例卡：只放事实标签（不放分数）。 */
const SAMPLE_RELEVANCE: readonly EventRelevance[] = [
  { group: "people", known: null, people: [{ count: 3, emoji: "💼", label: "VC", source: "speakers", typeKey: "vc" }], topic: null, warnings: [] },
  { group: "people", known: null, people: [{ count: 20, emoji: "🏢", label: "CVC", source: "registrants", typeKey: "cvc" }], topic: null, warnings: [] },
  { group: "topic", known: { count: 1, names: [] }, people: [], topic: { labels: ["CFO"] }, warnings: [] },
];

/** 卡片 emoji 底色按位置轮换（不再按判定上色）。 */
const emoTone = (index: number): Tone => RECOMMEND_TONES[index % RECOMMEND_TONES.length]!;

/**
 * D2（2026-11-20 用户拍板）：同一排（宽屏 3 张一排）只要有一张有图，没图的卡顶部画 2:1 色带 + 自己的 emoji 补齐；整排都没图保持现样。
 * 返回每张卡要不要画色带（有图的卡自己画图，不算色带）。
 */
export function coverBands(rows: readonly { coverUrl?: string | null }[], perRow = 3): boolean[] {
  return rows.map((row, index) => {
    if (row.coverUrl) return false;
    const start = index - (index % perRow);
    return rows.slice(start, start + perRow).some((item) => Boolean(item.coverUrl));
  });
}

/**
 * 探す 活动卡（2026-11-21 event-card-compact-proposal 推荐案）：
 * <768 = 方案 B 左图右文列表行（88×88 缩略图：封面居中裁方 / 没封面 = emoji 色块；右边 标题 ≤2 行 · 日期 · 地点 1 行 · 标签 · 报名人数 · 费用）；
 * ≥768 = 方案 A 卡（封面保持 2:1 · 标题 · 日期 · 地点 · 底部一行 标签 + 费用）。整张可点（Enter / Space），不放「詳細」按钮。
 */
export function EventCard({ row, index, language, t, selected, faded, ended, metaOverride, onSelect, onOpen, band = false, coverPosition, listRow = false }: { row: EventDiscoverRow; index: number; language: OrbitLanguage; t: JourneyT; selected?: boolean; faded?: boolean; ended?: boolean; metaOverride?: string; onSelect?: () => void; onOpen: () => void; /** D2：同排有图时没图的卡画 2:1 色带。 */ band?: boolean; /** 主办表单预览：还没裁的图按 focusY 定位。 */ coverPosition?: string; /** 手机列表里的一行（data-discover-row）。 */ listRow?: boolean }) {
  const meta = metaOverride ?? [discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ");
  const registered = ended ? null : registrationChipText(row.registrationCount, language);
  const fee = feeText(row.priceYen, t);
  const tone = emoTone(index);
  const activate = onSelect ?? onOpen;
  // 2026-11-23：已结束卡封面保持原色，左上角加「已结束」（取代 10-29 的灰卡片）；底部不再放「終了」chip。
  const endTag = ended ? <span className={sp.endTag} data-discover-end-tag="">{t("endedChip")}</span> : null;
  const card = (
    <div role="button" tabIndex={0} className={`${styles.evc} ${d.evc} ${d.ec} ${selected ? `${styles.sel} ${sp.sel}` : ""}`} onClick={activate} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }} data-discover-card={row.eventId} style={faded ? { flex: 1 } : undefined}>
      {row.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（Blob / 站内路径），服务端已裁成 2:1
        <div className={d.ecCover} data-discover-cover=""><img src={row.coverUrl} alt="" loading="lazy" style={coverPosition ? { objectPosition: coverPosition } : undefined} />{endTag}</div>
      ) : band ? (
        <div className={`${d.ecTile} ${d.ecBand} ${r[`band_${tone}`]} ${d[`tile_${tone}`]}`} data-discover-band=""><span className={`${styles.emo} ${r.bandEmo} ${d.ecEmo}`}>{row.emoji}</span>{endTag}</div>
      ) : (
        <div className={`${d.ecTile} ${d.ecPlain} ${d[`tile_${tone}`]}`}><span className={`${styles.emo} ${styles[`t_${tone}`]} ${d.ecEmo}`}>{row.emoji}</span>{endTag}</div>
      )}
      {registered ? <span className={`${styles.chip} ${styles.regChip} ${row.coverUrl || band ? r.onImg : ""} ${d.ecReg}`} data-discover-registered="">{registered}</span> : null}
      <div className={d.ecBody}>
        <b className={d.ecTitle}>{row.title}</b>
        <span className={d.ecMeta}>{meta}</span>
        <div className={d.ecFoot}>
          <div className={d.ecChips}>{ended ? null : <RelevanceChips relevance={row.relevance} language={language} className={d.ecChipRow} />}</div>
          {registered ? <span className={`${styles.lbl} ${d.ecRegText}`}>{registered}</span> : null}
          {ended ? null : fee ? <b className={d.ecFee}>{fee}</b> : null}
        </div>
      </div>
    </div>
  );
  return <div className={`${styles.span4} ${d.ecCell} ${faded ? d.faded : ""}`} style={{ display: "flex" }} data-discover-ended={ended ? "" : undefined} data-discover-row={listRow ? "" : undefined}>{card}</div>;
}

function FilterPopover({ open, onClose, children, align }: { open: boolean; onClose: () => void; children: ReactNode; align?: "right" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const click = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("mousedown", click); };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={`${d.popover} ${align === "right" ? d.popRight : ""}`} role="dialog" data-discover-popover="">{children}</div>;
}

function SearchResults({ data, language, t, onOpen, onFollow }: { data: EventSearchResponse; language: OrbitLanguage; t: JourneyT; onOpen: (href: string) => void; onFollow: (organizerId: string, following: boolean) => void }) {
  const status = (s: string | null | undefined) => (s === "registered" ? t("stRegistered") : s === "pending_review" ? t("stPending") : s === "attended" ? t("stAttended") : s === "planned" ? t("stPlanned") : null);
  return (
    <div className={`${styles.card} ${d.searchPanel}`} data-discover-search="">
      <div className={styles.cardH}><h3>{t("searchEvents")}</h3><span className={styles.more}>{t("countN", { n: data.eventsTotal })}</span></div>
      {data.events.length === 0 ? <div className={styles.lbl}>{t("noResults")}</div> : data.events.map((hit) => {
        const dm = dayMonth(hit.startsAt, t);
        return (
          <button key={hit.eventId} type="button" className={`btn ${d.searchRow}`} onClick={() => onOpen(hit.href)}>
            <div className={d.datebox}><b>{dm.day}</b><small>{dm.month}</small></div>
            <div className={d.grow}><b className={d.ell}>{hit.title}</b><div className={styles.lbl}>{[hit.venue, status(hit.myStatus) ?? (hit.badges?.includes("early_access") ? t("badgeEarly") : feeText(hit.priceYen, t))].filter(Boolean).join(" · ")}</div></div>
          </button>
        );
      })}
      {data.organizers.length ? <><div className={d.groupLbl}>{t("searchOrganizers")}</div>{data.organizers.map((org) => (
        <div key={org.organizerId} className={d.searchRow}>
          <span className={`${styles.emo} ${styles.emoSm} ${styles.t_lav}`}>{org.emoji}</span>
          <div className={d.grow}><b>{org.name}</b><div className={styles.lbl}>{t("orgEditions", { n: org.eventCount })}{org.following ? ` · ${t("youFollow")}` : ""}</div></div>
          <button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => onFollow(org.organizerId, !org.following)}>{org.following ? t("following") : t("follow")}</button>
        </div>
      ))}</> : null}
      {data.people.length ? <><div className={d.groupLbl}>{t("searchPeople")}</div>{data.people.map((person) => (
        <div key={person.contactId} className={d.searchRow}>
          <span className={d.av}>{person.initial}</span>
          <div className={d.grow}><b>{[person.name, [person.org, person.role].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</b><div className={styles.lbl}>{t("personEvents", { n: person.eventCount })}</div></div>
        </div>
      ))}</> : null}
      <Link className={`${styles.mac} ${styles.macApricot} ${d.pasteRow}`} href="/app/events?tab=assess"><span>🔗</span><div className={d.grow}><b>{t("searchNotFound")}</b><div className={styles.lbl}>{t("searchPasteUrl")}</div></div><span className={`btn ${styles.btn} ${styles.sm}`}>{t("paste")}</span></Link>
    </div>
  );
}

/** 768–1023（iPad 竖屏 834）卡片两列，≥1024 三列：D2 色带按同一排的张数算。 */
function useCardsPerRow(): number {
  const [perRow, setPerRow] = useState(3);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const update = () => setPerRow(media.matches ? 2 : 3);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return perRow;
}

export function DiscoverTab({ language, tier, signedIn, onRail, onSubtitle, nowIso, phoneSearch = true, myStatus }: { language: OrbitLanguage; tier: Tier; signedIn: boolean; onRail: (state: DiscoverRailState) => void; onSubtitle: (text: string) => void; /** 服务端给的「今」（本机示例时钟）；缺省 = 现在。 */ nowIso?: string; /** 2026-11-23 手机：搜索框收进顶栏的搜索图标，打开时才显示（宽屏一直显示）。 */ phoneSearch?: boolean; /** 简介栏第一帧的报名状态（页面已读的「参加的活动」）；undefined = 还不知道。 */ myStatus?: Readonly<Record<string, EventSummaryResponse["status"]>> }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const params = useSearchParams();
  const [query, setQuery] = useState<EventDiscoverQuery>(() => queryFromParams(params));
  const std = useStandardCopy();
  const perRow = useCardsPerRow();
  const [data, setData] = useState<EventDiscoverResponse | null>(() => lastAnswer<EventDiscoverResponse>(discoverAnswerKey(queryFromParams(params))) ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pop, setPop] = useState<"period" | "area" | "theme" | null>(null);
  const [draftThemes, setDraftThemes] = useState<EventDiscoverTheme[]>([]);
  // R30：全局搜索「イベントで探す」带 ?q= 进来时直接开始搜（App 的 DiscoverPage 同一参数）。
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [results, setResults] = useState<EventSearchResponse | null>(null);
  const showSearch = tier !== "narrow" || phoneSearch;
  // 手机上收起搜索框 = 不再搜索（与 iOS「取消」相同）。
  useEffect(() => { if (!showSearch) setSearch(""); }, [showSearch]);

  const load = useCallback(async (next: EventDiscoverQuery) => {
    const result = await journeyApi.discover(next);
    if (result.ok) rememberAnswer(discoverAnswerKey(next), result.data);
    setData(result.ok ? result.data : { all: [], community: [], planFit: [], planFitTotal: 0, popularityFallback: true, total: 0 });
  }, []);
  useEffect(() => { if (!answerFresh(discoverAnswerKey(query), FRESH.list)) void load(query); }, [load, query]);
  // The guide card's copy depends on the profile goal: read it alongside discover (not after it) when the card may
  // show, and keep the card a skeleton until it is in (undefined = not read yet).
  const [savedGoal, setSavedGoal] = useState<SavedPlanGoal | null | undefined>(() => lastAnswer<{ goal: SavedPlanGoal | null }>(SAVED_GOAL_KEY)?.goal);
  const goalWanted = signedIn && (data === null || (data.popularityFallback && !data.signedOut));
  const goalStarted = useRef(false);
  useEffect(() => {
    if (!goalWanted || goalStarted.current) return;
    goalStarted.current = true;
    if (answerFresh(SAVED_GOAL_KEY, FRESH.slow)) return;
    // Started once (a ref, not an effect cleanup flag: StrictMode's re-run must still see the answer land).
    readSavedPlanGoal().then((goal) => { rememberAnswer(SAVED_GOAL_KEY, { goal }); setSavedGoal(goal); }, () => setSavedGoal((value) => value ?? null));
  }, [goalWanted]);
  const goal = signedIn ? savedGoal : null;

  useEffect(() => {
    const q = search.trim();
    if (!q || !signedIn) { setResults(null); return; }
    const timer = setTimeout(async () => { const result = await journeyApi.search(q); setResults(result.ok ? result.data : null); }, 250);
    return () => clearTimeout(timer);
  }, [search, signedIn]);

  const past = query.period === "past";
  const flat = data !== null && !past && !data.popularityFallback && data.total <= 5 && data.all.length > 0;
  const firstRow = data ? (flat ? data.all[0] : data.planFit[0]) ?? null : null;
  // 2026-11-23：没点卡片时右栏照旧（第一场的「選択中のイベント」或帮你挑活动）；点了卡片右栏换成简介栏（EventSidePanel）。
  const railRow = firstRow;
  const now = useMemo(() => (nowIso ? new Date(nowIso) : new Date()), [nowIso]);
  // 可点开简介的卡片（按页面上的顺序，↑↓ 用）与各自的色调；「看下一场」换到列表外的活动时 seed 为 null。
  const panelRows = useMemo(() => {
    if (!data) return [] as { row: EventDiscoverRow; tone: PanelTone }[];
    const lists = past ? [data.all] : data.popularityFallback ? [data.past ?? []] : flat ? [data.all, data.past ?? []] : tier === "narrow" ? [data.planFit, data.all, data.past ?? []] : [data.planFit, data.past ?? []];
    return lists.flatMap((list) => list.map((row, index) => ({ row, tone: emoTone(index) as PanelTone })));
  }, [data, past, flat, tier]);
  const closePanel = useCallback(() => setSelected(null), []);
  const panelEntry = selected ? panelRows.find((item) => item.row.eventId === selected) ?? null : null;
  const panel: DiscoverPanelState | null = selected ? { eventId: selected, now, onClose: closePanel, onSelect: setSelected, seed: panelEntry?.row ?? null, tone: panelEntry?.tone ?? "teal" } : null;
  const panelKey = selected ? `${selected}:${panelEntry ? "seed" : "none"}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- panel 由 panelKey 决定（seed 对象每次渲染都是新的）
  useEffect(() => { onRail({ loaded: data !== null, panel: tier === "wide" ? panel : null, row: data && !past && !data.popularityFallback ? railRow : null, signedOut: Boolean(data?.signedOut) }); }, [data, past, railRow, onRail, panelKey, tier, now]);
  useEffect(() => {
    if (!data) return;
    onSubtitle(past ? t("dSubtitlePast", { n: data.total }) : data.popularityFallback ? t("dSubtitleEmpty") : flat ? t("dSubtitleFew", { n: data.total }) : t("dSubtitleMany", { n: data.planFitTotal, period: query.period ? periodLabel(query.period, t) : "", total: data.total }));
  }, [data, flat, onSubtitle, past, query.period, t]);

  // 2026-11-21 站内跳转（不整页重载：外壳、脚本、登录不重来，详情页能先画上次的结果）。
  const router = useRouter();
  const open = (href: string) => { router.push(`/app${href}`); };
  // 点卡片：1440 第一次点 → 右栏简介，栏开着再点同一张 → 进详情；834 / 390 → 浮层 / 底部面板（只靠「查看详情」进详情）。
  const pick = (row: EventDiscoverRow) => { if (tier === "wide" && selected === row.eventId) open(row.href); else setSelected(row.eventId); };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  // 键盘（1440，栏开着）：↑ ↓ 换卡，Enter 进详情，Esc 关闭。输入框、弹层里不接管。
  useEffect(() => {
    if (tier !== "wide" || !selected) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]") !== null)) return;
      if (event.key === "Escape") { setSelected(null); return; }
      const at = panelRows.findIndex((item) => item.row.eventId === selected);
      if (event.key === "Enter") { const row = panelRows[at]?.row; if (row && !target?.closest("a, button, [role=button]")) { event.preventDefault(); router.push(`/app${row.href}`); } return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const next = panelRows[at + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      setSelected(next.row.eventId);
      document.querySelector(`[data-discover-card="${CSS.escape(next.row.eventId)}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tier, selected, panelRows, router]);
  const filterOn = data ? past || !data.popularityFallback : false;
  const set = (patch: Partial<EventDiscoverQuery>) => { setQuery((current) => ({ ...current, ...patch })); setPop(null); };
  const dismiss = async (row: EventDiscoverRow, reason: EventRecommendationDismissReason) => {
    const result = await journeyApi.dismiss(row.eventId, reason);
    if (result.ok) { toast.success(t("dismissed")); void load(query); } else toast.error(at("genericError"));
  };
  const save = async (row: EventDiscoverRow) => {
    const created = await eventsApi.create({ eventId: row.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    const added = created.ok ? await eventsApi.addToPlan(created.data.id) : null;
    if (added?.ok) toast.success(t("saved")); else toast.error(at("genericError"));
  };

  const themeCount = query.themes?.length ?? 0;
  const filters = (
    <div className={`${styles.span12} ${styles.row} ${d.filterRow}`}>
      {showSearch ? <label className={d.search}>
        <Icon name="search" size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
        {tier === "wide" ? <span className={styles.lbl} style={{ marginLeft: "auto" }}>{t("kbdSearch")}</span> : null}
      </label> : null}
      <div className={d.filterScroll}>
      <div className={d.popWrap}>
        <button type="button" className={`btn ${d.wfilter} ${filterOn ? d.on : ""}`} onClick={() => setPop(pop === "period" ? null : "period")}><Icon name="calendar" size={16} />{t("filterPeriod", { v: periodLabel(query.period ?? "upcoming", t) })}<Icon name="down" size={16} /></button>
        <FilterPopover open={pop === "period"} onClose={() => setPop(null)}><b>{t("periodLbl")}</b><div className={`${styles.chips} ${d.optChips}`}>{PERIODS.map((p) => <FilterOption key={p} label={periodLabel(p, t)} selected={query.period === p} onToggle={() => set({ period: p })} />)}</div></FilterPopover>
      </div>
      <div className={d.popWrap}>
        <button type="button" className={`btn ${d.wfilter} ${filterOn ? d.on : ""}`} onClick={() => setPop(pop === "area" ? null : "area")}><Icon name="pin" size={16} />{t("filterArea", { v: query.areas?.length ? query.areas.map((a) => areaLabel(a, t)).join(t("listSep")) : t("aAny") })}<Icon name="down" size={16} /></button>
        <FilterPopover open={pop === "area"} onClose={() => setPop(null)}><b>{t("areaLbl")}</b><div className={`${styles.chips} ${d.optChips}`}>{AREAS.map((a) => <FilterOption key={a} label={areaLabel(a, t)} selected={query.areas?.includes(a)} onToggle={() => set({ areas: query.areas?.includes(a) ? query.areas.filter((x) => x !== a) : [...(query.areas ?? []), a] })} />)}</div></FilterPopover>
      </div>
      <div className={d.popWrap}>
        <button type="button" data-discover-filter="theme" className={`btn ${d.wfilter} ${filterOn && themeCount ? d.on : ""}`} onClick={() => { setDraftThemes([...(query.themes ?? [])]); setPop(pop === "theme" ? null : "theme"); }}><Icon name="layers" size={16} />{themeCount ? t("filterThemeN", { n: themeCount }) : t("filterTheme")}<Icon name="down" size={16} /></button>
        <FilterPopover open={pop === "theme"} onClose={() => setPop(null)} align="right">
          <div className={`${styles.row} ${styles.between}`}><b>{t("themeLbl")}</b><button type="button" className={`btn ${styles.btn} ${styles.sm} ${d.ghost}`} onClick={() => setDraftThemes([])}>{t("clear")}</button></div>
          <div className={`${styles.chips} ${d.optChips}`}>{THEMES.map((x) => <FilterOption key={x} label={themeLabel(x, t)} selected={draftThemes.includes(x)} onToggle={() => setDraftThemes((list) => (list.includes(x) ? list.filter((v) => v !== x) : [...list, x]))} />)}</div>
          <div className={`${styles.row} ${styles.between} ${d.toggleRow}`}>{t("planFirst")}<Toggle checked={query.planFirst !== false} onChange={(value: boolean) => setQuery((current) => ({ ...current, planFirst: value }))} label={t("planFirst")} /></div>
          <div className={`${styles.row} ${d.popFoot}`}><span className={styles.lbl}><Kbd>Esc</Kbd> {t("escClose")}</span><button type="button" className={`btn ${styles.btn} ${styles.primary} ${styles.sm}`} style={{ marginLeft: "auto" }} onClick={() => set({ themes: draftThemes })}>{t("showN", { n: data?.total ?? 0 })}</button></div>
        </FilterPopover>
      </div>
      </div>
    </div>
  );

  if (results) {
    return <div className={styles.wgrid} data-events-discover-tab="">{filters}<div className={styles.span12}><SearchResults data={results} language={language} t={t} onOpen={open} onFollow={async (id, following) => { const r = await journeyApi.follow(id, following); if (r.ok) setResults((cur) => cur ? { ...cur, organizers: cur.organizers.map((o) => (o.organizerId === id ? { ...o, following } : o)) } : cur); }} /></div></div>;
  }
  if (!data) return <div className={styles.wgrid} data-events-discover-tab="">{filters}<div className={styles.span12}><PageSkeletonBody kind="events" label={std.loading.loading} bare /></div></div>;

  // 2026-10-29：活动还少，開催済み以灰卡片平铺在结果下方（不折叠成入口行）；超过上限才给「すべて見る」。
  const endedCards = (rows: readonly EventDiscoverRow[]) => { const bands = coverBands(rows, perRow); return rows.map((row, index) => <EventCard key={row.eventId} ended row={row} index={index} band={bands[index]} language={language} t={t} selected={selected === row.eventId} onSelect={() => pick(row)} onOpen={() => open(row.href)} />); };
  const pastSection = !past && data.past?.length ? (
    <>
      <div className={`${styles.span12} ${styles.cardH} ${d.sectionHead}`} data-discover-past-section=""><h3>{t("pastTitle", { n: data.pastTotal ?? data.past.length })}</h3>{(data.pastTotal ?? 0) > data.past.length ? <button type="button" className={`btn ${styles.more} ${d.moreBtn}`} onClick={() => set({ period: "past" })}>{t("pastSeeAll")} <Icon name="right" size={16} /></button> : <span className={styles.lbl}>{t("byNewest")}</span>}</div>
      {endedCards(data.past)}
    </>
  ) : null;

  const overlay = panel && tier !== "wide" ? (
    tier === "medium" ? (
      <Drawer open bare size="sm" className={sp.drawer} onClose={closePanel} title={panelEntry?.row.title ?? t("seeDetail")}>
        <EventSidePanel key={panel.eventId} eventId={panel.eventId} seed={panel.seed} tone={panel.tone} language={language} now={now} mode="drawer" onClose={closePanel} onSelect={setSelected} statusHint={myStatus ? myStatus[panel.eventId] ?? "none" : undefined} />
      </Drawer>
    ) : (
      <BottomSheet open className={sp.sheet} onClose={closePanel} label={panelEntry?.row.title ?? t("seeDetail")}>
        <EventSidePanel key={panel.eventId} eventId={panel.eventId} seed={panel.seed} tone={panel.tone} language={language} now={now} mode="sheet" onClose={closePanel} onSelect={setSelected} statusHint={myStatus ? myStatus[panel.eventId] ?? "none" : undefined} />
      </BottomSheet>
    )
  ) : null;

  if (tier === "narrow" && (past || (!data.popularityFallback && !flat)) && !data.signedOut) {
    return <>{overlay}<PhoneDiscover showSearch={showSearch} onPick={pick} data={data} query={query} language={language} t={t} search={search} onSearch={setSearch} onQuery={(patch) => setQuery((current) => ({ ...current, ...patch }))} onClear={(key) => setQuery((current) => { const next = { ...current }; delete next[key]; return key === "period" ? { ...next, period: "upcoming" } : next; })} onOpen={open} /></>;
  }

  const card = (row: EventDiscoverRow, index: number, band = false) => <EventCard key={row.eventId} row={row} index={index} band={band} language={language} t={t} selected={selected === row.eventId} onSelect={() => pick(row)} onOpen={() => open(row.href)} />;

  return (
    <div className={styles.wgrid} data-events-discover-tab="">
      {filters}
      {data.signedOut ? <div className={`${styles.span12} ${styles.card} ${d.signedOut}`}>{t("signedOutBanner")}</div> : null}
      {past ? (
        data.all.length ? <><div className={`${styles.span12} ${styles.cardH} ${d.sectionHead}`}><h3>{t("pastTitle", { n: data.total })}</h3><span className={styles.lbl}>{t("byNewest")}</span></div>{endedCards(data.all)}</>
          : <div className={`${styles.card} ${styles.span12} ${styles.flat}`} data-discover-past-empty=""><b>{t("pastEmpty")}</b><div className={styles.lbl}>{t("pastEmptySub")}</div></div>
      ) : data.popularityFallback && !data.signedOut ? (
        <>
          <div className={`${styles.card} ${styles.span12} ${styles.guide}`} data-discover-empty="">
            <div className={`${styles.row} ${d.guideRow}`}>
              <div style={{ flex: 1 }}>
                <div className={styles.lbl}>{t("noPlanLbl")}</div>
                {goal === undefined ? (
                  <div aria-busy aria-label={std.loading.loading} data-discover-goal-pending="">
                    <div className={d.guideTitle}><i className={styles.pendBone} style={{ width: "48%", height: 18 }} aria-hidden /></div>
                    <div className={styles.sub}><i className={styles.pendBone} style={{ width: "72%" }} aria-hidden /></div>
                  </div>
                ) : (
                  <>
                    <div className={d.guideTitle}>{t(goal ? "noPlanTitleGoal" : "noPlanTitle")}</div>
                    <div className={styles.sub}>{t(goal ? "noPlanSubGoal" : "noPlanSub")}</div>
                  </>
                )}
              </div>
              {goal === undefined
                ? <span className={styles.pendSeg} aria-hidden><span className={`btn ${styles.btn} ${styles.primary} ${styles.tall}`}><Icon name="target" size={16} />{t("planFromGoal")}</span></span>
                : <a className={`btn ${styles.btn} ${styles.primary} ${styles.tall}`} href="/app/tasks?tab=plan"><Icon name="target" size={16} />{t(goal ? "planFromGoal" : "setGoal")}</a>}
            </div>
            <div className={styles.grid3}>
              {([["🔗", "tileUrl", "tileUrlSub", "/app/events?tab=assess"], ["🎟️", "tileCode", "tileCodeSub", "/app/events?tab=assess&code=1"], ["👥", "tileCommunity", "tileCommunitySub", "/app/events?tab=discover"]] as const).map(([emoji, title, sub, href]) => (
                <a key={title} href={href} className={`${styles.mac} ${styles.macApricot} ${styles.row}`} style={{ gap: 10 }}><span className={styles.guideEmoji}>{emoji}</span><div><b className={styles.guideName}>{t(title)}</b><div className={styles.lbl}>{t(sub)}</div></div></a>
              ))}
            </div>
          </div>
          {/* 2026-10-27：没有目标也直接列真实活动（人気順，在引导卡正下方）；只有一场都没有时才画「有了计划后」示例。 */}
          {data.all.length ? null : <div className={`${styles.span12} ${styles.cardH} ${d.sectionHead}`}><h3>{t("samplePreview")} <SampleTag /></h3></div>}
          {data.all.length ? null : ([1, 2, 3] as const).map((n, index) => (
            <EventCard key={n} faded index={index} language={language} t={t} onOpen={() => undefined} metaOverride={t(`sample${n}Meta`)} row={{ emoji: ["🎤", "🤝", "📚"][index]!, eventId: `sample-${n}`, href: "#", relevance: SAMPLE_RELEVANCE[index]!, startsAt: "", title: t(`sample${n}Title`) }} />
          ))}
          {data.all.length ? <AllTable rows={data.all} total={data.total} language={language} t={t} onOpen={open} onSave={save} onDismiss={dismiss} /> : null}
        </>
      ) : flat ? (
        <>
          <div className={`${styles.span12} ${styles.chips}`} data-discover-active="">
            {query.period && query.period !== "upcoming" ? <button type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => set({ period: "upcoming" })}>{periodLabel(query.period, t)} ✕</button> : null}
            {(query.areas ?? []).map((a) => <button key={a} type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => set({ areas: (query.areas ?? []).filter((x) => x !== a) })}>{areaLabel(a, t)} ✕</button>)}
            {(query.themes ?? []).map((x) => <button key={x} type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => set({ themes: (query.themes ?? []).filter((v) => v !== x) })}>{themeLabel(x, t)} ✕</button>)}
          </div>
          {(() => { const bands = coverBands(data.all, perRow); return data.all.map((row, index) => card(row, index, bands[index])); })()}
          {data.widen?.length ? (
            <div className={`${styles.card} ${styles.span12} ${styles.flat}`} data-discover-widen="">
              <div className={styles.row} style={{ gap: 12 }}>
                <span className={`${styles.emo} ${styles.t_apricot}`}>💡</span>
                <div style={{ flex: 1 }}><b>{t("widenTitle")}</b><div className={styles.lbl}>{t("widenSub")}</div></div>
                {data.widen.map((item) => (
                  <button key={`${item.kind}:${item.value}`} type="button" className={`btn ${styles.btn} ${styles.sm} ${d.widenBtn}`} onClick={() => set(item.kind === "period" ? { period: item.value as EventDiscoverPeriod } : item.kind === "area" ? { areas: [...(query.areas ?? []), item.value as EventDiscoverArea] } : { themes: [...(query.themes ?? []), item.value as EventDiscoverTheme] })}>
                    {item.kind === "period" ? t("widenPeriod", { v: periodLabel(item.value as EventDiscoverPeriod, t) }) : t("widenAdd", { v: item.kind === "area" ? areaLabel(item.value as EventDiscoverArea, t) : themeLabel(item.value as EventDiscoverTheme, t) })}
                    <span className={`${styles.chip} ${styles.c_teal}`}>{t("plusN", { n: item.extra })}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {data.community.length ? (
            <div className={`${styles.card} ${styles.span12} ${d.community}`} data-discover-community="">
              <div className={styles.cardH} style={{ marginBottom: 8 }}><h3>{t("communityTitle")}</h3><span className={styles.lbl}>{t("communitySub")}</span></div>
              <div className={styles.grid2}>
                {data.community.map((row) => {
                  const dm = dayMonth(row.startsAt, t);
                  const badge = row.badges?.includes("members_only") ? "members_only" : row.badges?.includes("early_access") ? "early_access" : null;
                  return (
                    <button key={row.eventId} type="button" className={`btn ${d.commRow}`} onClick={() => open(row.href)}>
                      <div className={d.datebox} style={{ background: "var(--surface)" }}><b>{dm.day}</b><small>{dm.month}</small></div>
                      <div className={d.grow}><b className={d.ell}>{row.title}</b><div className={styles.lbl}>{[row.venue, row.communityReason === "following" ? t("following") : t("attended")].filter(Boolean).join(" · ")}</div></div>
                      {badge ? <span className={`${styles.chip} ${badge === "members_only" ? styles.c_lav : styles.c_teal}`}>{badge === "members_only" ? t("badgeMembers") : t("badgeEarly")}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {data.planFit.length ? <div className={`${styles.span12} ${styles.cardH} ${d.sectionHead}`} data-discover-planfit-head=""><h3>{t("planFitTitle")}</h3><span className={styles.lbl}>{t("countN", { n: data.planFitTotal })} · {t("byDate")}</span></div> : null}
          {(() => { const bands = coverBands(data.planFit, perRow); return data.planFit.map((row, index) => card(row, index, bands[index])); })()}
          {data.all.length ? <AllTable rows={data.all} total={data.total} language={language} t={t} onOpen={open} onSave={save} onDismiss={dismiss} /> : null}
        </>
      )}
      {pastSection}
      {overlay}
    </div>
  );
}

function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" className={`btn ${d.lbtn}`} aria-label={label} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}><Icon name="arrow" size={16} /></button>
      <ContextMenu open={open} onClose={() => setOpen(false)} anchor={ref} label={label} items={items} />
    </>
  );
}

/** すべて：服务端按日期排（2026-11-15 起与有无计划无关）；「あなたに関係すること」列放标签，没有就空着。 */
function AllTable({ rows, total, language, t, onOpen, onSave, onDismiss }: { rows: readonly EventDiscoverRow[]; total: number; language: OrbitLanguage; t: JourneyT; onOpen: (href: string) => void; onSave: (row: EventDiscoverRow) => void; onDismiss: (row: EventDiscoverRow, reason: EventRecommendationDismissReason) => void }) {
  return (
    <div className={`${styles.card} ${styles.span12}`} data-discover-all="">
      <div className={styles.cardH}><h3>{t("allTitle", { n: total })}</h3><span className={styles.lbl}>{t("byDate")}</span></div>
      <table className={d.table}>
        <thead><tr><th>{t("colDate")}</th><th>{t("colEvent")}</th><th>{t("colPlace")}</th><th>{t("colFee")}</th><th>{relevanceTitle(language)}</th><th /></tr></thead>
        <tbody>
          {rows.map((row) => {
            return (
              <tr key={row.eventId} onClick={(event) => {
                // 行内操作（☆ / ↗ 菜单，菜单在 portal 里）不打开详情。
                const target = event.target as HTMLElement;
                if (!event.currentTarget.contains(target) || target.closest("[data-row-actions]")) return;
                onOpen(row.href);
              }} data-discover-row={row.eventId}>
                <td className={styles.score}>{monthDay(row.startsAt)}</td>
                <td><b>{row.title}</b></td>
                <td className={d.muted}>{row.venue}</td>
                <td>{feeText(row.priceYen, t) ?? "—"}</td>
                <td><RelevanceChips relevance={row.relevance} language={language} /></td>
                <td data-row-actions="">
                  <div className={d.hovActs}>
                    <button type="button" className={`btn ${d.lbtn}`} aria-label={t("save")} onClick={() => onSave(row)}><Icon name="star" size={16} /></button>
                    <RowMenu label={t("notInterested")} items={[
                      { key: "open", label: t("detail"), onSelect: () => onOpen(row.href) },
                      { key: "schedule", label: `${t("notInterested")} · ${t("dismissSchedule")}`, onSelect: () => onDismiss(row, "schedule") },
                      { key: "distance", label: `${t("notInterested")} · ${t("dismissDistance")}`, onSelect: () => onDismiss(row, "distance") },
                      { key: "content", label: `${t("notInterested")} · ${t("dismissContent")}`, onSelect: () => onDismiss(row, "content") },
                      { key: "known", label: `${t("notInterested")} · ${t("dismissKnown")}`, onSelect: () => onDismiss(row, "known") },
                    ]} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 1440 右栏「選択中のイベント」（event-relevance-proposal ⑤）：标题 + 日期·场所·费用、「あなたに関係すること」卡、詳細を見る / 参加予定に追加。 */
export function DiscoverRail({ row, language }: { row: EventDiscoverRow; language: OrbitLanguage }) {
  const t = journeyTranslator(language);
  const at = assessTranslator(language);
  const toast = useToast();
  const save = async () => {
    const created = await eventsApi.create({ eventId: row.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    const added = created.ok ? await eventsApi.addToPlan(created.data.id) : null;
    if (added?.ok) toast.success(t("saved")); else toast.error(at("genericError"));
  };
  const hasFacts = relevanceRows(row.relevance, language).length > 0;
  return (
    <div className={`${styles.rail} ${d.rail}`} data-discover-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="sparkle" size={16} />{t("railTitle")}</h4>
      <div className={`${styles.card} ${d.railHero}`}>
        <b className={d.railName}>{row.title}</b>
        <div className={styles.lbl}>{[discoverWhen(row.startsAt, language), row.venue, feeText(row.priceYen, t)].filter(Boolean).join(" · ")}</div>
      </div>
      {hasFacts ? <div className={d.railSub}>{relevanceTitle(language)}</div> : null}
      <RelevanceCard relevance={row.relevance} language={language} heading={false} />
      <div className={d.spacer} />
      <div className={styles.grid2}>
        <a className={`btn ${styles.btn}`} href={`/app${row.href}`}>{t("seeDetail")}</a>
        <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={() => void save()}>{at("addToPlan")}</button>
      </div>
    </div>
  );
}

/** 探す 没有选中活动时的右栏（b2 #11）：iOrbit 的探す专用开场与两条提问。 */
// ---------- 390（b12 #348）：App 式探す——搜索 + 筛选按钮（件数）、已选 chip、コミュニティ列表、プランに効く横滑卡、すべて列表 ----------
function PhoneDiscover({ showSearch, data, query, language, t, search, onSearch, onQuery, onClear, onOpen, onPick }: { showSearch: boolean; data: EventDiscoverResponse; query: EventDiscoverQuery; language: OrbitLanguage; t: JourneyT; search: string; onSearch: (value: string) => void; onQuery: (patch: Partial<EventDiscoverQuery>) => void; onClear: (key: keyof EventDiscoverQuery) => void; onOpen: (href: string) => void; /** 2026-11-23：卡片点开底部简介面板。 */ onPick: (row: EventDiscoverRow) => void }) {
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(0);
  const count = (query.period && query.period !== "upcoming" ? 1 : 0) + (query.areas?.length ?? 0) + (query.themes?.length ?? 0) + (query.freeOnly ? 1 : 0);
  const past = query.period === "past";
  const rows = data.all;
  const datebox = (iso: string) => { const dm = dayMonth(iso, t); return <div className={d.pDate}><b>{dm.day}</b><small>{dm.month}</small></div>; };
  // 2026-11-21 方案 B：すべて / 開催済み 都是左图右文列表行（EventCard 在 <768 的样子），整行可点。
  const listRows = (list: readonly EventDiscoverRow[], ended: boolean) => <div className={d.pRows}>{list.map((row, index) => <EventCard key={row.eventId} listRow ended={ended} row={row} index={index} language={language} t={t} onSelect={() => onPick(row)} onOpen={() => onOpen(row.href)} />)}</div>;
  return (
    <div data-events-discover-tab="" data-discover-phone="">
      {/* 2026-11-23：搜索框只在点了顶栏的搜索图标后出现；筛选按钮是正文第一行的开头（随内容滚走）。 */}
      {showSearch ? <div className={`${styles.row} ${d.pSearchRow}`}>
        <label className={d.pSearch}><Icon name="search" size={16} /><input autoFocus value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} /></label>
      </div> : null}
      <div className={`${styles.chips} ${d.pChips} ${showSearch ? "" : d.pChipsFirst}`} data-discover-active="">
        <button type="button" className={`btn ${d.pFilter}`} aria-label={t("filtersLbl")} onClick={() => setSheet(true)}><Icon name="sliders" size={20} />{count ? <span className={d.pBadge}>{count}</span> : null}</button>
        {query.period && query.period !== "upcoming" ? <button type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => onClear("period")}>{periodLabel(query.period, t)} ✕</button> : null}
        {(query.areas ?? []).map((a) => <button key={a} type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => onQuery({ areas: (query.areas ?? []).filter((x) => x !== a) })}>{areaLabel(a, t)} ✕</button>)}
        {(query.themes ?? []).map((x) => <button key={x} type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => onQuery({ themes: (query.themes ?? []).filter((v) => v !== x) })}>{themeLabel(x, t)} ✕</button>)}
        {query.freeOnly ? <button type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => onClear("freeOnly")}>{t("freeOnly")} ✕</button> : null}
        {query.themes?.length ? null : <button type="button" className={`btn ${styles.chip} ${d.activeChip}`} onClick={() => setSheet(true)}>{t("filterTheme")} <Icon name="down" size={16} /></button>}
        {query.freeOnly ? null : <button type="button" className={`btn ${styles.chip} ${d.activeChip}`} onClick={() => setSheet(true)}>{t("feeLbl")} <Icon name="down" size={16} /></button>}
      </div>
      {data.community.length ? (
        <div className={`${styles.card} ${d.pComm}`} data-discover-community="">
          <div className={`${styles.cardH} ${d.pCardH}`}><h3>{t("communityTitle")}</h3><span className={d.pMore}>{t("countN", { n: data.community.length })}</span></div>
          <div className={d.pList}>
            {data.community.map((row) => {
              const badge = row.badges?.includes("members_only") ? "members_only" : row.badges?.includes("early_access") ? "early_access" : null;
              return (
                <button key={row.eventId} type="button" className={`btn ${d.pLi}`} onClick={() => onOpen(row.href)}>
                  {datebox(row.startsAt)}
                  <div className={d.pMeta}><b>{row.title}</b><span>{[row.venue, row.communityReason === "following" ? t("following") : t("attended")].filter(Boolean).join(" · ")}</span></div>
                  {badge ? <span className={`${styles.chip} ${badge === "members_only" ? styles.c_lav : styles.c_teal}`}>{badge === "members_only" ? t("badgeMembers") : t("badgeEarly")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {data.planFit.length ? (
        <div className={d.pSection} data-discover-planfit="">
          <div className={styles.cardH}><h3>{t("planFitTitle")}</h3><span className={d.pMore}>{t("countN", { n: data.planFitTotal })}</span></div>
          <div className={d.pCarousel} onScroll={(event) => { const el = event.currentTarget; setPage(Math.round(el.scrollLeft / 272)); }}>
            {data.planFit.map((row, index) => (
              <div key={row.eventId} className={d.pCard} role="button" tabIndex={0} data-discover-card={row.eventId} onClick={() => onPick(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(row); } }}>
                <div className={`${styles.row} ${styles.between}`}>
                  <span className={`${styles.emo} ${styles[`t_${emoTone(index)}`]}`}>{row.emoji}</span>
                  {registrationChipText(row.registrationCount, language) ? <span className={`${styles.chip} ${styles.regChip}`}>{registrationChipText(row.registrationCount, language)}</span> : null}
                </div>
                <b className={d.pCardTitle}>{row.title}</b>
                <div className={`${styles.lbl} ${d.pCardMeta}`}>{[discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ")}</div>
                <RelevanceChips relevance={row.relevance} language={language} className={d.pReason} />
                {feeText(row.priceYen, t) ? <div className={`${styles.row} ${d.pCardFoot}`}><b className={d.ecFee}>{feeText(row.priceYen, t)}</b></div> : null}
              </div>
            ))}
          </div>
          <div className={d.pDots}>{data.planFit.map((row, index) => <i key={row.eventId} className={index === Math.min(page, data.planFit.length - 1) ? d.pDotOn : undefined} />)}</div>
        </div>
      ) : null}
      {rows.length ? (
        <section className={d.pSection} data-discover-all="">
          <div className={`${styles.cardH} ${d.pListH}`}><h3>{past ? t("pastTitle", { n: data.total }) : t("allPlain")}</h3><span className={styles.lbl}>{past ? t("byNewest") : t("byDate")}</span></div>
          {listRows(rows, past)}
        </section>
      ) : past ? <div className={`${styles.card} ${styles.flat} ${d.pAll}`} data-discover-past-empty=""><b>{t("pastEmpty")}</b><div className={styles.lbl}>{t("pastEmptySub")}</div></div> : null}
      {!past && data.past?.length ? (
        <section className={d.pSection} data-discover-past-section="">
          <div className={`${styles.cardH} ${d.pListH}`}><h3>{t("pastTitle", { n: data.pastTotal ?? data.past.length })}</h3>{(data.pastTotal ?? 0) > data.past.length ? <button type="button" className={`btn ${d.pMore}`} onClick={() => onQuery({ period: "past" })}>{t("pastSeeAll")} <Icon name="right" size={16} /></button> : <span className={styles.lbl}>{t("byNewest")}</span>}</div>
          {listRows(data.past, true)}
        </section>
      ) : null}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} label={t("filtersLbl")}>
        <div className={d.pSheet}>
          <b>{t("periodLbl")}</b>
          <div className={`${styles.chips} ${d.optChips}`}>{PERIODS.map((p) => <FilterOption key={p} label={periodLabel(p, t)} selected={query.period === p} onToggle={() => onQuery({ period: p })} />)}</div>
          <b>{t("areaLbl")}</b>
          <div className={`${styles.chips} ${d.optChips}`}>{AREAS.map((a) => <FilterOption key={a} label={areaLabel(a, t)} selected={query.areas?.includes(a)} onToggle={() => onQuery({ areas: query.areas?.includes(a) ? query.areas.filter((x) => x !== a) : [...(query.areas ?? []), a] })} />)}</div>
          <b>{t("themeLbl")}</b>
          <div className={`${styles.chips} ${d.optChips}`}>{THEMES.map((x) => <FilterOption key={x} label={themeLabel(x, t)} selected={query.themes?.includes(x)} onToggle={() => onQuery({ themes: query.themes?.includes(x) ? query.themes.filter((v) => v !== x) : [...(query.themes ?? []), x] })} />)}</div>
          <b>{t("feeLbl")}</b>
          <div className={`${styles.chips} ${d.optChips}`}><FilterOption label={t("feeAny")} selected={!query.freeOnly} onToggle={() => onQuery({ freeOnly: false })} /><FilterOption label={t("freeOnly")} selected={Boolean(query.freeOnly)} onToggle={() => onQuery({ freeOnly: true })} /></div>
        </div>
      </BottomSheet>
    </div>
  );
}

export function DiscoverHelpRail({ language }: { language: OrbitLanguage }) {
  const t = journeyTranslator(language);
  return <DefaultRail intro={{ body: t("railHelpBody"), title: t("railHelpTitle") }} prompts={[t("railPromptVc"), t("railPromptEvening")]} />;
}

export { ringColor };
