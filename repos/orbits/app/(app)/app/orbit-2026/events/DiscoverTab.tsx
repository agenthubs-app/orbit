"use client";

// R27 イベント › 探す（Web；b2 #11 空 / #12 少量 / #13 大量 + テーマ弹层，b12 #346 / #348 1024 / 390）。
// 数据来自 GET /api/events/discover（分数 = 计划页同一套 scoreEvent）；保存 = 库内活动的规则评估（不调 AI）→ 参加予定に追加。
// 興味なし（契约 9）在表格行的菜单里；「?」展开依据。检索走 /api/events/search（R30 同一服务）。
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { EventDiscoverArea, EventDiscoverFormat, EventDiscoverPeriod, EventDiscoverQuery, EventDiscoverResponse, EventDiscoverRow, EventDiscoverTheme } from "../../../../../shared/contract/event-discover";
import type { EventRecommendationDismissReason } from "../../../../../shared/contract/event-recommendation-feedback";
import type { EventSearchResponse } from "../../../../../shared/contract/event-search";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { eventsJourneyCopy as jc } from "../copy/eventsJourney";
import { DefaultRail } from "../shell/Orbit2026Shell";
import { pickCopy } from "../copy/types";
import { BottomSheet, ContextMenu, FilterOption, Icon, Kbd, SampleTag, Toggle, useToast, type MenuItem } from "../ui";
import { ScoreRing, translator as assessTranslator } from "./AssessmentDetail";
import { eventsApi, newIdempotencyKey } from "./events-api";
import { ringColor } from "./events-model";
import { journeyApi } from "./journey-api";
import styles from "./events.module.css";
import d from "./discover.module.css";

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
  return withTime && Number(p.hh) >= 17 ? `${date}${p.hh}:${p.mm}` : date;
}
export const monthDay = (iso: string) => { const p = tokyo(iso); return p ? `${p.month}/${p.day}` : ""; };
export const dayMonth = (iso: string, t: JourneyT) => { const p = tokyo(iso); return p ? { day: p.day, month: t("monthLabel", { m: p.month }) } : { day: 0, month: "" }; };
export const feeText = (yen: number | null | undefined, t: JourneyT) => (yen === 0 ? t("free") : typeof yen === "number" ? `¥${yen.toLocaleString("en-US")}` : null);

const PERIODS: readonly EventDiscoverPeriod[] = ["this_week", "this_month", "next_month"];
const AREAS: readonly EventDiscoverArea[] = ["online", "tokyo", "osaka", "nagoya"];
const THEMES: readonly EventDiscoverTheme[] = ["funding", "saas", "manufacturing_dx", "hiring", "management", "networking", "ipo", "global"];
const FORMATS: readonly EventDiscoverFormat[] = ["speakers", "networking", "small"];
export const periodLabel = (p: EventDiscoverPeriod, t: JourneyT) => t(p === "this_week" ? "pThisWeek" : p === "this_month" ? "pThisMonth" : p === "next_month" ? "pNextMonth" : "pCustom");
export const areaLabel = (a: EventDiscoverArea, t: JourneyT) => t(a === "online" ? "aOnline" : a === "tokyo" ? "aTokyo" : a === "osaka" ? "aOsaka" : "aNagoya");
export const themeLabel = (x: EventDiscoverTheme, t: JourneyT) => t(({ funding: "tFunding", global: "tGlobal", hiring: "tHiring", ipo: "tIpo", management: "tManagement", manufacturing_dx: "tMfgDx", networking: "tNetworking", saas: "tSaas" } as const)[x]);
export const formatLabel = (f: EventDiscoverFormat, t: JourneyT) => t(f === "speakers" ? "fSpeakers" : f === "networking" ? "fNetworking" : "fSmall");

/** 默认条件：今月 · 東京（画板 #11 / #13 的初始值）、テーマ 未选、おすすめ順。 */
export const DEFAULT_DISCOVER_QUERY: EventDiscoverQuery = { areas: ["tokyo"], period: "this_month", planFirst: true, sort: "recommended", themes: [] };

/** URL 上的条件（可分享；`?tab=discover&period=this_week&areas=tokyo&themes=manufacturing_dx`）。 */
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

export interface DiscoverRailState { row: EventDiscoverRow | null; signedOut: boolean }

function WhyBox({ reason, detail, t }: { reason: string; detail?: string | null; t: JourneyT }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-why-box="" className={d.whyBox}>
      <div className={styles.row} style={{ gap: 6 }}>
        <span className={`${styles.chip} ${styles.c_lav} ${d.reasonChip}`}>🎯 {reason}</span>
        {detail ? <button type="button" className={`btn ${d.why}`} aria-expanded={open} aria-label={t("why")} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>?</button> : null}
      </div>
      {detail && open ? <div className={d.whyBody}>{detail}</div> : null}
    </div>
  );
}

function Ring({ score, size }: { score: number; size: number }) {
  return <ScoreRing score={score} size={size} stroke={size >= 54 ? 6 : 4} label={String(score)}><span className={styles.score} style={{ fontSize: size >= 54 ? "var(--fs-body)" : "var(--fs-tiny)" }}>{score}</span></ScoreRing>;
}

export function EventCard({ row, index, language, t, selected, faded, metaOverride, onSelect, onOpen }: { row: EventDiscoverRow; index: number; language: OrbitLanguage; t: JourneyT; selected?: boolean; faded?: boolean; metaOverride?: string; onSelect?: () => void; onOpen: () => void }) {
  const at = assessTranslator(language);
  const tone = rowTone(row, index);
  const meta = metaOverride ?? [discoverWhen(row.startsAt, language), row.venue, feeText(row.priceYen, t)].filter(Boolean).join(" · ");
  const card = (
    <div role="button" tabIndex={0} className={`${styles.evc} ${d.evc} ${selected ? styles.sel : ""}`} onClick={onSelect ?? onOpen} onKeyDown={(event) => { if (event.key === "Enter") (onSelect ?? onOpen)(); }} data-discover-card={row.eventId} style={faded ? { flex: 1 } : undefined}>
      <div className={`${styles.row} ${styles.between}`}>
        <span className={`${styles.emo} ${styles[`t_${tone.emo}`]}`}>{row.emoji}</span>
        {typeof row.score === "number" ? <Ring score={row.score} size={54} /> : null}
      </div>
      <b className={d.evcTitle}>{row.title}</b>
      <div className={styles.lbl}>{meta}</div>
      {row.reason ? <WhyBox reason={row.reason} detail={row.reasonDetail ?? null} t={t} /> : null}
      <div className={`${styles.row} ${d.push}`} style={{ gap: 6 }}>
        {row.verdict ? <span className={`${styles.chip} ${tone.chip ? toneClass(tone.chip) : ""}`}>{row.verdict === "recommend" ? at("verdictRecommend") : row.verdict === "conditional" ? at("verdictConditional") : at("verdictSkip")}</span> : null}
        <button type="button" className={`btn ${styles.btn} ${styles.sm} ${d.detailBtn}`} onClick={(event) => { event.stopPropagation(); onOpen(); }}>{t("detail")}</button>
      </div>
    </div>
  );
  return faded ? <div className={`${styles.span4} ${d.faded}`} style={{ display: "flex" }}>{card}</div> : <div className={styles.span4} style={{ display: "flex" }}>{card}</div>;
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
            {typeof hit.score === "number" ? <Ring score={hit.score} size={32} /> : null}
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
      <a className={`${styles.mac} ${styles.macApricot} ${d.pasteRow}`} href="/app/events"><span>🔗</span><div className={d.grow}><b>{t("searchNotFound")}</b><div className={styles.lbl}>{t("searchPasteUrl")}</div></div><span className={`btn ${styles.btn} ${styles.sm}`}>{t("paste")}</span></a>
    </div>
  );
}

export function DiscoverTab({ language, tier, signedIn, onRail, onSubtitle }: { language: OrbitLanguage; tier: Tier; signedIn: boolean; onRail: (state: DiscoverRailState) => void; onSubtitle: (text: string) => void }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const params = useSearchParams();
  const [query, setQuery] = useState<EventDiscoverQuery>(() => queryFromParams(params));
  const [data, setData] = useState<EventDiscoverResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pop, setPop] = useState<"period" | "area" | "theme" | "sort" | null>(null);
  const [draftThemes, setDraftThemes] = useState<EventDiscoverTheme[]>([]);
  // R30：全局搜索「イベントで探す」带 ?q= 进来时直接开始搜（App 的 DiscoverPage 同一参数）。
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [results, setResults] = useState<EventSearchResponse | null>(null);

  const load = useCallback(async (next: EventDiscoverQuery) => {
    const result = await journeyApi.discover(next);
    setData(result.ok ? result.data : { all: [], community: [], planFit: [], planFitTotal: 0, popularityFallback: true, total: 0 });
  }, []);
  useEffect(() => { void load(query); }, [load, query]);

  useEffect(() => {
    const q = search.trim();
    if (!q || !signedIn) { setResults(null); return; }
    const timer = setTimeout(async () => { const result = await journeyApi.search(q); setResults(result.ok ? result.data : null); }, 250);
    return () => clearTimeout(timer);
  }, [search, signedIn]);

  const flat = data !== null && !data.popularityFallback && data.total <= 5 && data.all.length > 0;
  const firstRow = data ? (flat ? data.all[0] : data.planFit[0]) ?? null : null;
  const railRow = data ? ([...data.planFit, ...data.all, ...data.community].find((row) => row.eventId === selected) ?? firstRow) : null;
  useEffect(() => { onRail({ row: data && !data.popularityFallback ? railRow : null, signedOut: Boolean(data?.signedOut) }); }, [data, railRow, onRail]);
  useEffect(() => {
    if (!data) return;
    onSubtitle(data.popularityFallback ? t("dSubtitleEmpty") : flat ? t("dSubtitleFew", { n: data.total }) : t("dSubtitleMany", { n: data.planFitTotal, period: query.period ? periodLabel(query.period, t) : "", total: data.total }));
  }, [data, flat, onSubtitle, query.period, t]);

  const open = (href: string) => { window.location.assign(`/app${href}`); };
  const filterOn = data ? !data.popularityFallback : false;
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
      <label className={d.search}>
        <Icon name="search" size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
        {tier === "wide" ? <span className={styles.lbl} style={{ marginLeft: "auto" }}>{t("kbdSearch")}</span> : null}
      </label>
      <div className={d.popWrap}>
        <button type="button" className={`btn ${d.wfilter} ${filterOn ? d.on : ""}`} onClick={() => setPop(pop === "period" ? null : "period")}><Icon name="calendar" size={16} />{t("filterPeriod", { v: periodLabel(query.period ?? "this_month", t) })}<Icon name="down" size={16} /></button>
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
      <div className={d.popWrap}>
        <button type="button" className={`btn ${d.wfilter}`} onClick={() => setPop(pop === "sort" ? null : "sort")}><Icon name="sliders" size={16} />{query.sort === "date" ? t("sortDate") : t("sortRecommended")}</button>
        <FilterPopover open={pop === "sort"} onClose={() => setPop(null)} align="right"><div className={`${styles.chips} ${d.optChips}`}>{(["recommended", "date"] as const).map((s) => <FilterOption key={s} label={s === "date" ? t("byDate") : t("sortRecommended").split("：").pop()} selected={query.sort === s} onToggle={() => set({ sort: s })} />)}</div></FilterPopover>
      </div>
    </div>
  );

  if (results) {
    return <div className={styles.wgrid} data-events-discover-tab="">{filters}<div className={styles.span12}><SearchResults data={results} language={language} t={t} onOpen={open} onFollow={async (id, following) => { const r = await journeyApi.follow(id, following); if (r.ok) setResults((cur) => cur ? { ...cur, organizers: cur.organizers.map((o) => (o.organizerId === id ? { ...o, following } : o)) } : cur); }} /></div></div>;
  }
  if (!data) return <div className={styles.wgrid} data-events-discover-tab="">{filters}</div>;

  if (tier === "narrow" && !data.popularityFallback && !flat && !data.signedOut) {
    return <PhoneDiscover data={data} query={query} language={language} t={t} search={search} onSearch={setSearch} onQuery={(patch) => setQuery((current) => ({ ...current, ...patch }))} onClear={(key) => setQuery((current) => { const next = { ...current }; delete next[key]; return next; })} onOpen={open} />;
  }

  const card = (row: EventDiscoverRow, index: number) => <EventCard key={row.eventId} row={row} index={index} language={language} t={t} selected={tier !== "narrow" && railRow?.eventId === row.eventId} onSelect={() => setSelected(row.eventId)} onOpen={() => open(row.href)} />;

  return (
    <div className={styles.wgrid} data-events-discover-tab="">
      {filters}
      {data.signedOut ? <div className={`${styles.span12} ${styles.card} ${d.signedOut}`}>{t("signedOutBanner")}</div> : null}
      {data.popularityFallback && !data.signedOut ? (
        <>
          <div className={`${styles.card} ${styles.span12} ${styles.guide}`} data-discover-empty="">
            <div className={styles.row} style={{ alignItems: "center", gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div className={styles.lbl}>{t("noPlanLbl")}</div>
                <div className={d.guideTitle}>{t("noPlanTitle")}</div>
                <div className={styles.sub}>{t("noPlanSub")}</div>
              </div>
              <a className={`btn ${styles.btn} ${styles.primary} ${styles.tall}`} href="/app/plans"><Icon name="target" size={16} />{t("setGoal")}</a>
            </div>
            <div className={styles.grid3}>
              {([["🔗", "tileUrl", "tileUrlSub", "/app/events"], ["🎟️", "tileCode", "tileCodeSub", "/app/events?code=1"], ["👥", "tileCommunity", "tileCommunitySub", "/app/events?tab=discover"]] as const).map(([emoji, title, sub, href]) => (
                <a key={title} href={href} className={`${styles.mac} ${styles.macApricot} ${styles.row}`} style={{ gap: 10 }}><span className={styles.guideEmoji}>{emoji}</span><div><b className={styles.guideName}>{t(title)}</b><div className={styles.lbl}>{t(sub)}</div></div></a>
              ))}
            </div>
          </div>
          <div className={`${styles.span12} ${styles.cardH} ${d.sectionHead}`}><h3>{t("samplePreview")} <SampleTag /></h3></div>
          {([1, 2, 3] as const).map((n, index) => (
            <EventCard key={n} faded index={index} language={language} t={t} onOpen={() => undefined} metaOverride={t(`sample${n}Meta`)} row={{ emoji: ["🎤", "🤝", "📚"][index]!, eventId: `sample-${n}`, href: "#", reason: t(`sample${n}Reason`).replace(/^🎯\s*/, ""), reasonDetail: t("sampleReasonDetail"), score: [82, 77, 71][index]!, startsAt: "", title: t(`sample${n}Title`), verdict: "recommend" }} />
          ))}
          {data.all.length ? <AllTable rows={data.all} total={data.total} language={language} t={t} at={at} popular onOpen={open} onSave={save} onDismiss={dismiss} /> : null}
        </>
      ) : flat ? (
        <>
          <div className={`${styles.span12} ${styles.chips}`} data-discover-active="">
            {query.period ? <button type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => { setQuery(({ period: _period, ...rest }) => rest); setPop(null); }}>{periodLabel(query.period, t)} ✕</button> : null}
            {(query.areas ?? []).map((a) => <button key={a} type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => set({ areas: (query.areas ?? []).filter((x) => x !== a) })}>{areaLabel(a, t)} ✕</button>)}
            {(query.themes ?? []).map((x) => <button key={x} type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => set({ themes: (query.themes ?? []).filter((v) => v !== x) })}>{themeLabel(x, t)} ✕</button>)}
          </div>
          {data.all.map((row, index) => card(row, index))}
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
          {data.planFit.length ? <div className={`${styles.span12} ${styles.cardH} ${d.sectionHead}`}><h3>{t("planFitTitle")}</h3><span className={styles.more}>{t("countN", { n: data.planFitTotal })} <Icon name="right" size={16} /></span></div> : null}
          {data.planFit.map((row, index) => card(row, index))}
          {data.all.length ? <AllTable rows={data.all} total={data.total} language={language} t={t} at={at} onOpen={open} onSave={save} onDismiss={dismiss} /> : null}
        </>
      )}
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

function AllTable({ rows, total, language, t, at, popular, onOpen, onSave, onDismiss }: { rows: readonly EventDiscoverRow[]; total: number; language: OrbitLanguage; t: JourneyT; at: ReturnType<typeof assessTranslator>; popular?: boolean; onOpen: (href: string) => void; onSave: (row: EventDiscoverRow) => void; onDismiss: (row: EventDiscoverRow, reason: EventRecommendationDismissReason) => void }) {
  // 表格按分数（プランに合うものを優先）排，同分按日期；画板 #13 的行序（82 / 77 / 71 / 68 / 58 / 41）。
  const sorted = popular ? rows : [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const recommendIndex = new Map(sorted.filter((row) => row.verdict === "recommend").map((row, index) => [row.eventId, index]));
  return (
    <div className={`${styles.card} ${styles.span12}`} data-discover-all="">
      <div className={styles.cardH}><h3>{t("allTitle", { n: total })}</h3><span className={styles.more}>{popular ? t("byPopularity") : t("byDate")} <Icon name="down" size={16} /></span></div>
      <table className={d.table}>
        <thead><tr><th>{t("colDate")}</th><th>{t("colEvent")}</th><th>{t("colPlace")}</th><th>{t("colFee")}</th><th>{t("colScore")}</th><th>{t("colVerdict")}</th><th /></tr></thead>
        <tbody>
          {sorted.map((row) => {
            const tone = rowTone(row, recommendIndex.get(row.eventId) ?? 0);
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
                <td>{typeof row.score === "number" ? <Ring score={row.score} size={32} /> : "—"}</td>
                <td>{row.verdict ? <span className={`${styles.chip} ${tone.chip ? toneClass(tone.chip) : ""}`}>{row.verdict === "recommend" ? at("verdictRecommend") : row.verdict === "conditional" ? at("verdictConditional") : at("verdictSkip")}</span> : null}</td>
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

const MEET_TONES = ["lav", "blue", "teal", "apricot"] as const;

/** 1440 右栏「選択中のイベント」（b2 #12 / #13）：分数环 120、判定、会えそうな人、保存 / 詳細を見る。 */
export function DiscoverRail({ row, language }: { row: EventDiscoverRow; language: OrbitLanguage }) {
  const t = journeyTranslator(language);
  const at = assessTranslator(language);
  const toast = useToast();
  const tone = rowTone(row, 0);
  const save = async () => {
    const created = await eventsApi.create({ eventId: row.eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    const added = created.ok ? await eventsApi.addToPlan(created.data.id) : null;
    if (added?.ok) toast.success(t("saved")); else toast.error(at("genericError"));
  };
  return (
    <div className={`${styles.rail} ${d.rail}`} data-discover-rail="">
      <h4 className={`${styles.railH} ${d.railH}`}><Icon name="sparkle" size={16} />{t("railTitle")}</h4>
      <div className={`${styles.card} ${d.railHero}`}>
        <b className={d.railName}>{row.title}</b>
        <div className={styles.lbl}>{[discoverWhen(row.startsAt, language), feeText(row.priceYen, t)].filter(Boolean).join(" · ")}</div>
        {typeof row.score === "number" ? (
          <div className={d.railRing}>
            <ScoreRing score={row.score} size={120} stroke={12} label={String(row.score)}>
              <div className={`${styles.big} ${d.railBig}`}>{row.score}</div>
              <div className={styles.lbl}>{t("outOf")}</div>
            </ScoreRing>
          </div>
        ) : null}
        {row.verdict ? <span className={`${styles.chip} ${tone.chip ? toneClass(tone.chip) : ""} ${styles.verdictBig}`}>{row.verdict === "recommend" ? at("verdictRecommend") : row.verdict === "conditional" ? at("verdictConditional") : at("verdictSkip")}</span> : null}
      </div>
      {row.meetCandidates?.length ? (
        <div className={styles.card}>
          <div className={styles.lbl}>{t("meetTitle")}</div>
          {row.meetCandidates.map((meet, index) => (
            <div key={`${meet.label}-${index}`} className={styles.meetRow}><span className={`${styles.emo} ${styles.emoSm} ${styles[`t_${MEET_TONES[index % 4]}`]}`}>{meet.emoji}</span>{meet.label}</div>
          ))}
        </div>
      ) : null}
      <div className={styles.grid2}>
        <button type="button" className={`btn ${styles.btn}`} onClick={() => void save()}><Icon name="star" size={16} />{t("save")}</button>
        <a className={`btn ${styles.btn} ${styles.primary}`} href={`/app${row.href}`}>{t("seeDetail")}</a>
      </div>
    </div>
  );
}

/** 探す 没有选中活动时的右栏（b2 #11）：iOrbit 的探す专用开场与两条提问。 */
// ---------- 390（b12 #348）：App 式探す——搜索 + 筛选按钮（件数）、已选 chip、コミュニティ列表、プランに効く横滑卡、すべて列表 ----------
function PhoneDiscover({ data, query, language, t, search, onSearch, onQuery, onClear, onOpen }: { data: EventDiscoverResponse; query: EventDiscoverQuery; language: OrbitLanguage; t: JourneyT; search: string; onSearch: (value: string) => void; onQuery: (patch: Partial<EventDiscoverQuery>) => void; onClear: (key: keyof EventDiscoverQuery) => void; onOpen: (href: string) => void }) {
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(0);
  const count = (query.period ? 1 : 0) + (query.areas?.length ?? 0) + (query.themes?.length ?? 0) + (query.freeOnly ? 1 : 0);
  const rows = query.sort === "recommended" ? data.all : [...data.all].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const datebox = (iso: string) => { const dm = dayMonth(iso, t); return <div className={d.pDate}><b>{dm.day}</b><small>{dm.month}</small></div>; };
  return (
    <div data-events-discover-tab="" data-discover-phone="">
      <div className={`${styles.row} ${d.pSearchRow}`}>
        <label className={d.pSearch}><Icon name="search" size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} /></label>
        <button type="button" className={`btn ${d.pFilter}`} aria-label={t("filtersLbl")} onClick={() => setSheet(true)}><Icon name="sliders" size={20} />{count ? <span className={d.pBadge}>{count}</span> : null}</button>
      </div>
      <div className={`${styles.chips} ${d.pChips}`} data-discover-active="">
        {query.period ? <button type="button" className={`btn ${styles.chip} ${styles.c_lav} ${d.activeChip}`} onClick={() => onClear("period")}>{periodLabel(query.period, t)} ✕</button> : null}
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
              <div key={row.eventId} className={d.pCard} role="button" tabIndex={0} data-discover-card={row.eventId} onClick={() => onOpen(row.href)} onKeyDown={(event) => { if (event.key === "Enter") onOpen(row.href); }}>
                <div className={`${styles.row} ${styles.between}`}>
                  <span className={`${styles.emo} ${styles[`t_${rowTone(row, index).emo}`]}`}>{row.emoji}</span>
                  {typeof row.score === "number" ? <ScoreRing score={row.score} size={46} stroke={5} label={String(row.score)}><span className={styles.score} style={{ fontSize: "var(--fs-body-sm)" }}>{row.score}</span></ScoreRing> : null}
                </div>
                <b className={d.pCardTitle}>{row.title}</b>
                <div className={`${styles.lbl} ${d.pCardMeta}`}>{[discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ")}</div>
                {row.reason ? <div className={`${styles.row} ${d.pReason}`}><span className={`${styles.chip} ${styles.c_lav} ${d.ell} ${d.pReasonChip}`}>{`🎯 ${row.reason}`}</span></div> : null}
                <div className={`${styles.row} ${d.pCardFoot}`}>{feeText(row.priceYen, t) ? <span className={styles.chip}>{feeText(row.priceYen, t)}</span> : null}<button type="button" className={`btn ${styles.btn} ${styles.sm} ${d.pDetail}`} onClick={(event) => { event.stopPropagation(); onOpen(row.href); }}>{t("detailsBtn")}</button></div>
              </div>
            ))}
          </div>
          <div className={d.pDots}>{data.planFit.map((row, index) => <i key={row.eventId} className={index === Math.min(page, data.planFit.length - 1) ? d.pDotOn : undefined} />)}</div>
        </div>
      ) : null}
      {rows.length ? (
        <div className={`${styles.card} ${d.pAll}`} data-discover-all="">
          <div className={`${styles.cardH} ${d.pAllH}`}><h3>{t("allPlain")}</h3><button type="button" className={`btn ${d.pMore}`} onClick={() => onQuery({ sort: query.sort === "recommended" ? "date" : "recommended" })}>{query.sort === "recommended" ? t("sortRecommended").split("：").pop() : t("byDate")} <Icon name="down" size={16} /></button></div>
          <div className={d.pList}>
            {rows.map((row) => (
              <button key={row.eventId} type="button" className={`btn ${d.pLi}`} data-discover-row="" onClick={() => onOpen(row.href)}>
                {datebox(row.startsAt)}
                <div className={d.pMeta}><b>{row.title}</b><span>{[row.venue, feeText(row.priceYen, t)].filter(Boolean).join(" · ")}</span></div>
                {typeof row.score === "number" ? <ScoreRing score={row.score} size={36} stroke={4} label={String(row.score)}><span className={styles.score} style={{ fontSize: "var(--fs-caption)" }}>{row.score}</span></ScoreRing> : null}
              </button>
            ))}
          </div>
        </div>
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
