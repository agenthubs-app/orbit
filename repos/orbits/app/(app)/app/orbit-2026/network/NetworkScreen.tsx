"use client";

// R11a 人脈（Web 一級ページ; web.html #4 空 / #5 少量 / #6 大量, b6 #36 1024 / #38 390 / #41 深, b12 #508–#511 深, b5 #61 絞り込み,
// b1 #59 加载中）。ShellPage：🔍（⌘K，390 不画 G12）· 人脈 / N人 · 今月 +M · 人脈を追加（W-R12-01 弹窗压在列表上，R11-04）；
// 右栏：今日の 1問（TodayQuestionCard，R11-11）。つながり / 情報の濃さ / 出どころ 三卡 + 页签（すべて / 目標に関係 / 要フォロー）+
// 搜索框（只找人脈）+ 絞り込み + 表格 + さらに表示。行 → ContactDrawer（?contact=<id> 可分享）。?industry= 预选业界（R11-15）。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ContactCardDTO, ContactCardSummaryDTO } from "../../../../../shared/contract/contact-card-page";
import type { ContactGoalRelatedLinkDTO } from "../../../../../shared/contract/contact-goal-related";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { TodayQuestionCard } from "../add/TodayQuestionCard";
import { ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage } from "../shell/slots";
import { FilterOption, Icon, Orbit2026Scope, Popover, SampleTag, Skeleton, ToastProvider, useToast } from "../ui";
import { ContactAvatar, ContactDrawer, useNetworkT, type NetworkT } from "./ContactDrawer";
import { networkApi } from "./network-api";
import {
  DENSITY_OPTIONS, EMPTY_FILTERS, MET_OPTIONS, NETWORK_ANALYSIS_UNLOCK_CONTACTS, PAGE_SIZE, STAGE_OPTIONS, TOP_INDUSTRIES, TOP_REGIONS, filterCount, filtersFromSearch, headerCounts,
  industryOptionLabel, lastTouch, networkQuery, networkRow, regionLabel, toggle, topFacetOptions, type NetworkCityKey, type NetworkFilters, type NetworkRow, type NetworkTab,
} from "./network-model";
import styles from "./network.module.css";

const CHIP_KEY = { meishi: "chipMeishi", phone: "chipPhone", manual: "chipManual", self: "chipSelf", event: "chipEvent" } as const;
/** Brand names are not translated (same in ja / zh / en). */
export const LINKEDIN = "LinkedIn";
export const chipLabel = (chip: keyof typeof CHIP_KEY | "linkedin", t: NetworkT) => (chip === "linkedin" ? LINKEDIN : t(CHIP_KEY[chip]));
const SOURCE_ORDER = ["meishi", "phone", "linkedin", "event", "manual", "self"] as const;
const MET_KEY = { event: "metEvent", referral: "metReferral", visit: "metVisit", other: "metOther" } as const;

export interface NetworkScreenProps { language: OrbitLanguage; nowIso: string; /** `/app/contacts/<id>`: open this contact in the drawer. */ initialContactId?: string | null }

export function NetworkScreen(props: NetworkScreenProps) {
  return (
    <Orbit2026Scope language={props.language} className={styles.page}>
      <ToastProvider>
        <NetworkInner {...props} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

function NetworkInner({ language, nowIso, initialContactId = null }: NetworkScreenProps) {
  const t = useNetworkT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const nowMs = useMemo(() => Date.parse(nowIso), [nowIso]);
  // G12：390 没有 🔍（手机 Web 搜人走本页搜索框）。
  const narrow = useNarrow();
  const [tab, setTab] = useState<NetworkTab>("all");
  const [filters, setFilters] = useState<NetworkFilters>(() => filtersFromSearch(params));
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<ContactCardSummaryDTO | null>(null);
  const [matched, setMatched] = useState<number | null>(null);
  const [items, setItems] = useState<ContactCardDTO[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [links, setLinks] = useState<ReadonlyMap<string, ContactGoalRelatedLinkDTO>>(new Map());
  const [filterOpen, setFilterOpen] = useState(false);
  const [densityWhy, setDensityWhy] = useState(false);
  const [openContact, setOpenContact] = useState<string | null>(initialContactId ?? params?.get("contact") ?? null);
  const filterAnchor = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);

  const loadSummary = useCallback(async () => {
    const result = await networkApi.summary();
    if (result.ok) setSummary(result.data); else setFailed(true);
  }, []);
  useEffect(() => {
    void loadSummary();
    void networkApi.goalRelated().then((result) => { if (result.ok) setLinks(new Map((result.data.links ?? []).map((link) => [link.contactId, link]))); });
  }, [loadSummary]);

  const pageQuery = useMemo(() => networkQuery({ query, tab, filters, facets: summary, limit: PAGE_SIZE }), [query, tab, filters, summary]);
  useEffect(() => {
    const current = ++generation.current;
    const handle = setTimeout(() => {
      void Promise.all([networkApi.page(pageQuery), networkApi.summary(networkQuery({ query, tab, filters, facets: summary }))]).then(([page, filtered]) => {
        if (current !== generation.current) return;
        if (!page.ok) { setFailed(true); return; }
        setFailed(false);
        setItems(page.data.items);
        setCursor(page.data.nextCursor);
        setMatched(filtered.ok ? filtered.data.total : null);
      });
    }, query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [pageQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!cursor) return;
    const result = await networkApi.page(networkQuery({ query, tab, filters, facets: summary, limit: PAGE_SIZE, cursor }));
    if (result.ok) { setItems((current) => [...(current ?? []), ...result.data.items]); setCursor(result.data.nextCursor); }
  };
  const refresh = () => { void loadSummary(); setFilters((current) => ({ ...current })); };
  const rows = useMemo(() => (items ?? []).map((card) => networkRow(card, links)), [items, links]);
  const header = headerCounts(summary);
  const empty = header !== null && header.total === 0;
  const subtitle = empty ? t("subtitleEmpty") : header ? t("subtitle", { total: header.total, added: header.added }) : undefined;
  const open = (id: string | null) => {
    setOpenContact(id);
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("contact", id); else url.searchParams.delete("contact");
      // /app/contacts/<id> closes back to the list address.
      window.history.replaceState(window.history.state, "", `${url.pathname.startsWith("/app/contacts/") ? "/app/contacts" : url.pathname}${url.search}`);
    } catch { /* the address is a convenience */ }
  };

  const rail = (
    <div className={styles.rail} data-network-rail="">
      {empty ? (
        <>
          <h4><span className={`${styles.emo} ${styles.emoSm} ${styles.t_pink}`}>🤝</span>{t("railFastest")}</h4>
          <div className={styles.card}><b>{t("railInviteTitle")}</b><div className={styles.lbl}>{t("railInviteBody")}</div>
            <a className={`btn ${styles.btn} ${styles.primary} ${styles.sm}`} style={{ marginTop: 10, alignSelf: "flex-start" }} href="/app/contacts/new?add=invite">{t("railInviteButton")}</a></div>
        </>
      ) : (
        <>
          <h4><span className={`${styles.emo} ${styles.emoSm} ${styles.t_lav}`}>💬</span>{t("railQuestion")}</h4>
          <TodayQuestionCard />
        </>
      )}
    </div>
  );

  return (
    <>
      <ShellPage title={t("title")} subtitle={subtitle} left={narrow ? undefined : <ShellSearchButton />}
        right={<a className={`btn ${styles.btn} ${styles.accent}`} href="/app/contacts/new" data-network-add="">{t("addPeople")}</a>}
        rightRail={rail} />
      {summary === null && !failed ? <div className={styles.card} data-network-loading=""><Skeleton lines={6} /></div>
        : failed && summary === null ? <div className={styles.card} role="alert"><p>{t("loadFailed")}</p><button type="button" className={`btn ${styles.btn}`} onClick={refresh}>{t("filterClear")}</button></div>
          : empty ? <NetworkEmpty t={t} nowMs={nowMs} />
            : (
              <div className={styles.wgrid} data-network-list="">
                <div className={`${styles.card} ${styles.span4}`}>
                  <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{t("connections")}</span><a className={styles.more} href="/app/contacts/dashboard">{t("analysis")}<Icon name="right" size={16} /></a></div>
                  <div className={styles.big}>{header?.total ?? 0}<small>{t("peopleUnit")}</small></div>
                  <div className={styles.lbl}>{t("goalCountLine", { goal: header?.goal ?? 0, added: header?.added ?? 0 })}</div>
                </div>
                <div className={`${styles.card} ${styles.span5}`} data-network-density="">
                  <div className={styles.cardH}><h3>{t("densityTitle")}</h3><button type="button" className={styles.why} onClick={() => setDensityWhy((value) => !value)} aria-expanded={densityWhy}>?</button></div>
                  {densityWhy ? <div className={styles.whyBody}>{t("densityWhy")}</div> : null}
                  <div className={styles.stack3}>{([1, 2, 3] as const).map((level) => (summary?.densityCounts?.[level] ?? 0) > 0 ? <i key={level} className={styles[`s${level}`]} style={{ flex: summary!.densityCounts![level] }} /> : null)}</div>
                  <div className={styles.grid3}>{([1, 2, 3] as const).map((level) => (
                    <div key={level}><div className={styles.row}><Dots level={level} /><span className={styles.muted}>{t(`density${level}`)}</span></div><b>{summary?.densityCounts?.[level] ?? 0}</b></div>
                  ))}</div>
                </div>
                <div className={`${styles.card} ${styles.span3}`} data-network-sources="">
                  <div className={styles.lbl}>{t("sources")}</div>
                  {SOURCE_ORDER.filter((key) => (summary?.sourceChips?.[key] ?? 0) > 0).map((key) => (
                    <div key={key} className={styles.srcRow}><span className={`${styles.chip} ${key === "self" ? styles.chipTeal : ""}`}>{chipLabel(key, t)}</span><b>{summary?.sourceChips?.[key]}</b></div>
                  ))}
                </div>
                <div className={`${styles.card} ${styles.span12}`}>
                  <div className={`${styles.row} ${styles.between}`} style={{ flexWrap: "wrap" }}>
                    <div className={styles.cats} role="tablist" aria-label={t("tabsLabel")} data-network-tabs="">
                      {([["all", "tabAll", header?.total ?? 0], ["goal", "tabGoal", header?.goal ?? 0], ["followUp", "tabFollowUp", header?.followUp ?? 0]] as const).map(([key, copy, count]) => (
                        <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn ${styles.cat} ${tab === key ? styles.catOn : ""}`} onClick={() => setTab(key)}>{t(copy)} <small>{count}</small></button>
                      ))}
                    </div>
                    <div className={styles.tools}>
                      <label className={styles.search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholderShort")} aria-label={t("searchPlaceholder")} /></label>
                      <button ref={filterAnchor} type="button" className={`btn ${styles.lbtn}`} onClick={() => setFilterOpen(true)} aria-label={t("filter")} data-network-filter="">
                        <Icon name="sliders" size={20} />{filterCount(filters) ? <span className={styles.badge}>{filterCount(filters)}</span> : null}
                      </button>
                    </div>
                  </div>
                  {items === null ? <Skeleton lines={6} /> : rows.length ? (
                    <NetworkTable rows={rows} t={t} nowMs={nowMs} onOpen={open} />
                  ) : <p className={styles.lbl} style={{ marginTop: 16 }}>{t("noMatchTitle")} · {t("noMatchBody")}</p>}
                  {cursor ? <div className={styles.moreRow}><button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => void loadMore()}>{t("loadMore", { n: Math.max(0, (matched ?? 0) - rows.length) })}</button></div> : null}
                </div>
                {narrow && (header?.total ?? 0) < NETWORK_ANALYSIS_UNLOCK_CONTACTS ? (
                  // 390（b6 / b8 人脈 少量）: the locked 人脈分析 entry under the list; 1440 keeps 「人脈分析 ›」 in つながり (web.html, the page itself is locked).
                  <a className={`${styles.card} ${styles.flat} ${styles.span12} ${styles.anal}`} href="/app/contacts/dashboard" data-network-analysis-locked="">
                    <span className={`${styles.emo} ${styles.emoSm} ${styles.t_lav}`} aria-hidden>📊</span>
                    <span className={styles.grow}><b className={styles.analTitle}>{t("analysis")}</b><span className={styles.lbl} style={{ display: "block" }}>{t("analysisLocked", { n: NETWORK_ANALYSIS_UNLOCK_CONTACTS - (header?.total ?? 0) })}</span></span>
                    <span className={styles.muted}><Icon name="right" size={16} /></span>
                  </a>
                ) : null}
              </div>
            )}
      <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchor={filterAnchor} label={t("filterTitle")} width={420}>
        <FilterPanel t={t} language={language} summary={summary} filters={filters} onChange={setFilters} matched={matched} total={header?.total ?? 0} onDone={() => setFilterOpen(false)} />
      </Popover>
      {openContact ? <ContactDrawer contactId={openContact} onClose={() => open(null)} goalLabel={links.get(openContact)?.label ?? null}
        inviteLinked={(() => { const card = items?.find((item) => item.id === openContact); return card ? card.sourceChip === "self" : undefined; })()}
        onChanged={(event) => {
          if (event.kind === "deleted") {
            toast.success(t("deleteDone"), { undo: () => { void networkApi.restore(event.contactId).then((result) => { if (result.ok) { toast.success(t("deleteRestored")); refresh(); } else toast.error(t("deleteFailed")); }); } });
          }
          refresh();
        }} /> : null}
    </>
  );
}

/** 「🎯 タイプ · 話した」: the emoji and the type label are data; only 話した is copy. */
export function goalText(goal: { label: string; talked: boolean }, t: NetworkT): string {
  return `🎯 ${goal.label}${goal.talked ? ` · ${t("goalTalked")}` : ""}`;
}

function Dots({ level }: { level: 1 | 2 | 3 }) {
  return <span className={styles.dn} aria-hidden>{[1, 2, 3].map((index) => <i key={index} className={index <= level ? styles.on : undefined} />)}</span>;
}

function NetworkTable({ rows, t, nowMs, onOpen }: { rows: NetworkRow[]; t: NetworkT; nowMs: number; onOpen?: (id: string) => void }) {
  const touchText = (row: NetworkRow) => {
    const touch = lastTouch(row, nowMs);
    if (!touch) return "";
    if (touch.kind === "today") return t("touchToday");
    if (touch.kind === "yesterday") return t("touchYesterday");
    if (touch.kind === "daysAgo") return t("touchDaysAgo", { n: touch.n });
    if (touch.kind === "connected") return t("touchConnected", { year: touch.year, month: touch.month });
    return t("touchAdded", { date: touch.date });
  };
  return (
    <table className={styles.table} data-network-table="">
      <thead><tr><th>{t("colName")}</th><th>{t("colCompany")}</th><th>{t("colDensity")}</th><th>{t("colSource")}</th><th>{t("colGoal")}</th><th>{t("colLastTouch")}</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} onClick={() => onOpen?.(row.id)} data-network-row={row.id}>
            <td><div className={styles.row}><ContactAvatar name={row.name} /><b>{row.name}</b></div></td>
            <td>{row.organization || row.role ? <><span className={styles.sub}>{row.organization}</span><div className={styles.lbl}>{row.role}</div></> : <span className={styles.lbl}>{t("unset")}</span>}</td>
            <td><Dots level={row.density} /></td>
            <td><span className={`${styles.chip} ${row.chip === "self" ? styles.chipTeal : ""}`}>{chipLabel(row.chip, t)}</span></td>
            <td>{row.goal ? goalText(row.goal, t) : <span className={styles.lbl}>—</span>}</td>
            <td className={styles.muted}>{touchText(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FilterPanel({ t, language, summary, filters, onChange, matched, total, onDone }: {
  t: NetworkT; language: OrbitLanguage; summary: ContactCardSummaryDTO | null; filters: NetworkFilters; onChange: (next: NetworkFilters) => void; matched: number | null; total: number; onDone: () => void;
}) {
  const other = t("facetOther");
  const group = (label: string, key: keyof NetworkFilters, options: { key: string; label: string; count: number }[]) => (
    <div className={styles.fgrp} key={key}>
      <span className={styles.lbl}>{label}</span>
      <div className={styles.fchips}>{options.map((option) => <FilterOption key={option.key} label={option.label} count={option.count} selected={filters[key].includes(option.key)} onToggle={() => onChange({ ...filters, [key]: toggle(filters[key], option.key) })} />)}</div>
    </div>
  );
  return (
    <div data-network-filter-panel="">
      <div className={`${styles.row} ${styles.between}`}><b>{t("filterTitle")}</b><button type="button" className={`btn ${styles.btn} ${styles.sm}`} onClick={() => onChange(EMPTY_FILTERS)} disabled={filterCount(filters) === 0}>{t("filterClear")}</button></div>
      <div className={styles.lbl}>{t("filterHint")}</div>
      {group(t("groupStage"), "statuses", STAGE_OPTIONS.map((key) => ({ key, label: t(key === "active" ? "stageActive" : "stageNurture"), count: summary?.statuses[key] ?? 0 })))}
      {group(t("groupIndustry"), "industries", topFacetOptions(summary?.industries, TOP_INDUSTRIES).map((option) => ({ ...option, label: industryOptionLabel(option.key, language, other) })))}
      {group(t("groupRegion"), "regions", topFacetOptions(summary?.regions, TOP_REGIONS).map((option) => ({ ...option, label: regionLabel(option.key, (city: NetworkCityKey) => t(`city${city}`), other) })))}
      {group(t("groupMet"), "mets", MET_OPTIONS.map((key) => ({ key, label: t(MET_KEY[key]), count: summary?.metKinds?.[key] ?? 0 })))}
      {group(t("groupDensity"), "densities", DENSITY_OPTIONS.map((key) => ({ key, label: key === "1" ? "●○○" : key === "2" ? "●●○" : "●●●", count: summary?.densityCounts?.[Number(key) as 1 | 2 | 3] ?? 0 })))}
      <div className={styles.popFoot}><span className={styles.lbl}>{t("matchedOf", { n: matched ?? 0, total })}</span><button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onDone}>{t("showFiltered")}</button></div>
    </div>
  );
}

function NetworkEmpty({ t, nowMs }: { t: NetworkT; nowMs: number }) {
  const sample: NetworkRow[] = [
    { id: "sample-1", name: t("sampleName1"), organization: t("sampleSub1").split(" · ")[0] ?? "", role: t("sampleSub1").split(" · ")[1] ?? "", goal: { label: t("sampleGoal1"), talked: true }, density: 3, chip: "meishi", addedAt: null, lastInteractionAt: new Date(nowMs - 2 * 86_400_000).toISOString() },
    { id: "sample-2", name: t("sampleName2"), organization: t("sampleSub2").split(" · ")[0] ?? "", role: t("sampleSub2").split(" · ")[1] ?? "", goal: { label: t("sampleGoal2"), talked: false }, density: 1, chip: "linkedin", addedAt: "2024-03-10T03:00:00.000Z", lastInteractionAt: null },
  ];
  const doors = [["🤝", "t_pink", 3, "doorInvite", "doorInviteSub", "/app/contacts/new?add=invite"], ["✍️", "t_lav", 1, "doorManual", "doorManualSub", "/app/contacts/new?add=manual"], ["📱", "t_blue", 1, "doorContacts", "doorContactsSub", "/app/contacts/new/import?method=contacts"], ["🔗", "t_teal", 1, null, "doorLinkedinSub", "/app/contacts/new/import?method=csv"]] as const;
  return (
    <div className={styles.wgrid} data-network-empty="">
      <div className={`${styles.card} ${styles.span12} ${styles.guide}`}>
        <div className={styles.row}><span className={styles.guideEmoji}>🪐</span><div className={styles.grow}><div className={styles.guideTitle}>{t("guideTitle")}</div><div className={styles.sub}>{t("emptyGuideBody")}</div></div>
          <a className={`btn ${styles.btn} ${styles.primary}`} href="/app/contacts/new">{t("addPeople")}</a></div>
      </div>
      {doors.map(([emoji, tone, level, title, sub, href]) => (
        <a key={sub} className={`${styles.card} ${styles.span3}`} href={href} style={{ textDecoration: "none", color: "inherit" }}>
          <div className={`${styles.row} ${styles.between}`}><span className={`${styles.emo} ${styles[tone]}`}>{emoji}</span><Dots level={level} /></div>
          <b style={{ marginTop: 10 }}>{title ? t(title) : LINKEDIN}</b><div className={styles.lbl}>{t(sub)}</div>
        </a>
      ))}
      <div className={`${styles.card} ${styles.span12}`}>
        <div className={styles.cardH}><h3>{t("sampleTitle")} <SampleTag /></h3></div>
        <div className={styles.faded}><NetworkTable rows={sample} t={t} nowMs={nowMs} /></div>
      </div>
    </div>
  );
}
