"use client";

// R17 運営センター（Web 1440：b6-host-polish #0 空 / #1 少 / #2 大（深 #44）；b12 #438 下書き · 中止 · アーカイブ）。
// 数据：GET /api/host/center?filter=&q=。KPI / 対応が必要なこと / 次にやること 都是规则（host-todo），没有 AI。
// 「イベントを作成」→ /app/events/center/new；「共同運営に参加」→ /app/host/join；「過去の参加者を取り込む」先开说明（A2：CSV 只生成招待リンク与照合表）。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { HostCenterEventRow, HostCenterFilter, HostCenterResponse, HostNextStep, HostTodoItem } from "../../../../../shared/contract/host-events";
import { ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage } from "../shell/slots";
import { Icon, Modal, Orbit2026Scope, Segmented, ToastProvider } from "../ui";
import { hostApi } from "./host-api";
import { CREATE_HREF, JOIN_HREF, checkInHref, consoleHref, eventTone, fillPercent, hostDateDay, hostDateLong, hostTranslator, rowNote, statusChip, type HostT, type HostTone } from "./host-model";
import s from "./host.module.css";

const FILTERS: readonly HostCenterFilter[] = ["all", "upcoming", "live", "ended", "inactive"];
const FILTER_LABEL = { all: "fAll", ended: "fEnded", inactive: "fInactive", live: "fLive", upcoming: "fUpcoming" } as const;
const emoClass = (tone: HostTone) => s[`e_${tone}`];
const chipClass = (tone: string | null) => (tone ? s[`c_${tone}`] : "");

export function parseCenterFilter(value: string | null | undefined): HostCenterFilter {
  return FILTERS.includes(value as HostCenterFilter) ? (value as HostCenterFilter) : "all";
}

function Big({ value, unit, tone }: { value: number | string; unit?: string; tone?: "coral" }) {
  return <div className={`${s.big} ${tone ? s.coral : ""}`}>{value}{unit ? <small>{unit}</small> : null}</div>;
}

function KpiCard({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return <div className={`${s.card} ${s.span3}`}><div className={`${s.row} ${s.between}`}><span className={s.lbl}>{label}</span>{extra}</div>{children}</div>;
}

/** 一場の行（kit .hc）。カード全体で運営画面へ、主ボタンは状態で 受付を開く / 運営画面へ。 */
export function HostEventCard({ row, t, language, sample = false, onOpen }: { row: HostCenterEventRow; t: HostT; language: OrbitLanguage; sample?: boolean; onOpen?: (href: string) => void }) {
  const chip = statusChip(row.status);
  const when = [hostDateLong(row.startsAt, language, t), row.venue].filter(Boolean).join(" · ");
  const href = consoleHref(row.eventId);
  const action = row.action === "open_check_in"
    ? <a className={`btn ${s.btn} ${s.sm} ${s.primary}`} href={checkInHref(row.eventId)} onClick={(ev) => ev.stopPropagation()}><Icon name="check" size={16} />{t("openCheckIn")}</a>
    : <a className={`btn ${s.btn} ${s.sm}`} href={href} onClick={(ev) => ev.stopPropagation()}>{t("openConsole")}</a>;
  return (
    <div className={`${s.hc} ${s.span4}`} data-host-row={row.eventId} data-host-status={row.status} role={sample ? undefined : "link"} tabIndex={sample ? -1 : 0}
      onClick={() => onOpen?.(href)} onKeyDown={(ev) => { if (ev.key === "Enter") onOpen?.(href); }}>
      <div className={`${s.row} ${s.between}`}>
        <span className={`${s.emo} ${emoClass(eventTone(row.emoji, row.eventId))}`}>{row.emoji ?? "📅"}</span>
        <span className={`${s.chip} ${chipClass(chip.tone)}`}>{chip.live ? <i className={s.liveDot} /> : null}{t(chip.label)}</span>
      </div>
      <b className={s.hcT}>{row.title}</b>
      <div className={`${s.lbl} ${s.clamp1}`}>{when}</div>
      <div className={s.cnt3}>
        <div><span className={s.lbl}>{t("kApplied")}</span><b>{row.applied}{row.capacity ? <small>/{row.capacity}</small> : null}</b></div>
        <div><span className={s.lbl}>{t("cMatched")}</span><b>{row.matched ?? "—"}</b></div>
        <div><span className={s.lbl}>{t("cCheckedIn")}</span><b>{row.checkedIn ?? "—"}</b></div>
      </div>
      <div className={s.bar}><i style={{ width: `${fillPercent(row.applied, row.capacity)}%` }} /></div>
      <div className={`${s.row} ${s.between} ${s.hcFoot}`}><span className={s.lbl}>{rowNote(row, t)}</span>{action}</div>
    </div>
  );
}


const SAMPLE_ROWS = (t: HostT): HostCenterEventRow[] => [
  { action: "open_check_in", applied: 128, capacity: 150, checkedIn: 86, emoji: "🥂", endsAt: null, eventId: "sample-1", matched: 112, note: { count: 42, kind: "check_in_open" }, role: "owner", startsAt: null, status: "live", title: t("sample1Title"), venue: null },
  { action: "open_console", applied: 42, capacity: 60, checkedIn: null, emoji: "🏭", endsAt: null, eventId: "sample-2", matched: null, note: { kind: "matching_missing" }, role: "owner", startsAt: null, status: "upcoming", title: t("sample2Title"), venue: null },
  { action: "open_console", applied: 140, capacity: 150, checkedIn: 118, emoji: "🥂", endsAt: null, eventId: "sample-3", matched: 131, note: { kind: "followup", rate: 61 }, role: "owner", startsAt: null, status: "ended", title: t("sample3Title"), venue: null },
];
const SAMPLE_META = ["sample1Meta", "sample2Meta", "sample3Meta"] as const;

function EmptyCenter({ t, language, onImport }: { t: HostT; language: OrbitLanguage; onImport: () => void }) {
  const steps = [["step1", "step1Sub", "📝"], ["step2", "step2Sub", "✅"], ["step3", "step3Sub", "🪑"]] as const;
  return (
    <>
      <div className={`${s.card} ${s.span8} ${s.guide}`} data-host-empty="">
        <div className={s.lbl}>{t("forHosts")}</div>
        <div className={s.guideTitle}>{t("emptyTitle")}</div>
        <div className={s.sub}>{t("emptySub")}</div>
        <div className={s.grid3}>
          {steps.map(([title, sub, emoji], index) => (
            <div key={title} className={`${s.step} ${index === 0 ? s.stepNow : ""}`}>
              <div className={`${s.row} ${s.stepHead}`}><span className={s.stepN}>{index + 1}</span><span className={s.stepEmoji}>{emoji}</span></div>
              <b>{t(title)}</b><span className={s.lbl}>{t(sub)}</span>
            </div>
          ))}
        </div>
        <div className={`${s.row} ${s.guideActs}`}>
          <a className={`btn ${s.btn} ${s.primary} ${s.h46}`} href={CREATE_HREF}><Icon name="plus" size={16} />{t("createEvent")}</a>
          <a className={`btn ${s.btn} ${s.ghost}`} href={`${CREATE_HREF}?from=template`}>{t("seeTemplates")}</a>
        </div>
      </div>
      <div className={`${s.span4} ${s.tiles}`}>
        <a className={`${s.card} ${s.tile}`} href={`${CREATE_HREF}?from=template`}><span className={`${s.emo} ${s.e_apricot}`}>📋</span><div className={s.minw0}><b>{t("tileTemplate")}</b><div className={s.lbl}>{t("tileTemplateSub")}</div></div><span className={s.chev}><Icon name="right" size={16} /></span></a>
        <button type="button" className={`${s.card} ${s.tile}`} onClick={onImport} data-host-import=""><span className={`${s.emo} ${s.e_pink}`}>🗂️</span><div className={s.minw0}><b>{t("tileImport")}</b><div className={s.lbl}>{t("tileImportSub")}</div></div><span className={s.chev}><Icon name="right" size={16} /></span></button>
        <a className={`${s.card} ${s.tile}`} href={JOIN_HREF}><span className={`${s.emo} ${s.e_teal}`}>🎟️</span><div className={s.minw0}><b>{t("tileJoin")}</b><div className={s.lbl}>{t("tileJoinSub")}</div></div><span className={s.chev}><Icon name="right" size={16} /></span></a>
      </div>
      <div className={`${s.span12} ${s.cardH}`}><h3>{t("previewTitle")} <span className={s.sampleTag}>{t("sampleTag")}</span></h3></div>
      <div className={`${s.span12} ${s.subgrid} ${s.faded}`} aria-hidden="true">
        {SAMPLE_ROWS(t).map((row, index) => // 空态的示例行：日時の行は示例文案（startsAt 为空，行里只显示 venue = 文案）。
          <HostEventCard key={row.eventId} row={{ ...row, venue: t(SAMPLE_META[index]!) }} t={t} language={language} sample />)}
      </div>
    </>
  );
}


function TodoStrip({ items, t }: { items: readonly HostTodoItem[]; t: HostT }) {
  if (!items.length) return null;
  const view = (item: HostTodoItem) => {
    switch (item.kind) {
      case "review_pending": return { emoji: "🧾", href: consoleHref(item.eventId, "people"), sub: item.eventTitle, title: t("todoReview", { n: item.count ?? 0 }), tone: "apricot" as const };
      case "matching_missing": return { emoji: "🪑", href: consoleHref(item.eventId, "matching"), sub: item.daysLeft != null ? t("todoMatchingSub", { d: item.daysLeft, event: item.eventTitle }) : item.eventTitle, title: t("todoMatching"), tone: "blue" as const };
      case "profile_incomplete": return { emoji: "🙋", href: `${consoleHref(item.eventId)}?notice=profile_incomplete`, sub: t("todoProfileSub"), title: t("todoProfile", { n: item.count ?? 0 }), tone: "pink" as const };
      case "generate_matching": return { emoji: "🪑", href: consoleHref(item.eventId, "matching"), sub: item.eventTitle, title: t("stepGenerateNow"), tone: "blue" as const };
      case "publish_matching": return { emoji: "🪑", href: consoleHref(item.eventId, "matching"), sub: item.eventTitle, title: t("stepPublishMatching"), tone: "blue" as const };
      case "publish_form": return { emoji: "📝", href: consoleHref(item.eventId, "setup"), sub: item.eventTitle, title: t("stepPublishForm"), tone: "apricot" as const };
      case "open_check_in": return { emoji: "✅", href: checkInHref(item.eventId), sub: item.eventTitle, title: t("stepOpenCheckIn"), tone: "teal" as const };
    }
  };
  return (
    <div className={`${s.card} ${s.span12} ${s.flat}`} data-host-todo="">
      <div className={`${s.row} ${s.todoWrap}`}>
        <b>{t("todoTitle")}</b>
        {items.map((item) => {
          const v = view(item);
          return (
            <a key={`${item.kind}-${item.eventId}`} className={s.todo} href={v.href}>
              <span className={`${s.emo} ${s.emoSm} ${emoClass(v.tone)}`}>{v.emoji}</span>
              <div className={s.minw0}><b>{v.title}</b><div className={`${s.lbl} ${s.clamp1}`}>{v.sub}</div></div>
              <span className={s.chev}><Icon name="right" size={16} /></span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function NextSteps({ next, t, language }: { next: NonNullable<HostCenterResponse["next"]>; t: HostT; language: OrbitLanguage }) {
  const text = (step: HostNextStep): [string, string] => {
    switch (step.kind) {
      case "publish_form": return [t("stepPublishForm"), step.done && step.doneAt ? t("stepDoneAt", { d: hostDateDay(step.doneAt, t, language) }) : ""];
      case "review_pending": return [t("stepReview", { n: step.count ?? 0 }), t("stepReviewSub")];
      case "generate_matching": return [step.threshold ? t("stepGenerate", { t: step.threshold }) : t("stepGenerateNow"), step.count != null ? t("stepCurrent", { n: step.count }) : ""];
      case "publish_matching": return [t("stepPublishMatching"), ""];
      case "open_check_in": return [t("stepOpenCheckIn"), ""];
      case "send_followup": return [t("stepFollowup"), ""];
    }
  };
  return (
    <div className={`${s.card} ${s.span8} ${s.flat}`} data-host-next="">
      <div className={s.cardH}><h3>{t("nextTitle")}</h3><span className={s.lbl}>{next.eventTitle}</span></div>
      {next.steps.map((step) => {
        const [title, sub] = text(step);
        return (
          <div key={step.kind} className={`${s.chk} ${step.done ? s.chkDone : ""}`}>
            <span className={s.box}>{step.done ? <Icon name="check" size={16} /> : null}</span>
            <div className={s.grow}><b>{title}</b>{sub ? <span>{sub}</span> : null}</div>
          </div>
        );
      })}
    </div>
  );
}

export type HostCenterViewProps = {
  data: HostCenterResponse;
  filter: HostCenterFilter;
  query: string;
  language: OrbitLanguage;
  newestFirst?: boolean;
  onFilter?: (filter: HostCenterFilter) => void;
  onQuery?: (q: string) => void;
  onToggleSort?: () => void;
  onOpen?: (href: string) => void;
};

/** 純粋な描画（データは props）。空 = 主催イベント 0 件且未在搜索。 */
export function HostCenterView({ data, filter, query, language, newestFirst = false, onFilter, onQuery, onToggleSort, onOpen }: HostCenterViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const [why, setWhy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const empty = data.summary.eventCount === 0 && data.filterCounts.all === 0 && !query;
  const subtitle = empty ? t("centerSubEmpty")
    : data.kpi ? t("centerSubApplied", { m: data.summary.appliedThisMonth, n: data.summary.eventCount })
    : t("centerSubCount", { n: data.summary.eventCount });
  const right = (
    <>
      <a className={`btn ${s.btn}`} href={JOIN_HREF}><Icon name="ticket" size={16} />{t("joinCohost")}</a>
      <a className={`btn ${s.btn} ${s.accent}`} href={CREATE_HREF}><Icon name="plus" size={16} />{t("createEvent")}</a>
    </>
  );
  const rows = newestFirst ? [...data.events].sort((a, b) => Date.parse(b.startsAt ?? "") - Date.parse(a.startsAt ?? "")) : data.events;
  const showInactive = data.filterCounts.inactive > 0 || filter === "inactive";
  const tabs = FILTERS.filter((key) => key !== "inactive" || showInactive);
  const inactiveView = filter === "inactive";
  const kpi = data.kpi;
  const spot = data.spotlight;
  const unit = t("unitPeople");

  return (
    <>
      <ShellPage title={t("centerTitle")} subtitle={subtitle} left={<ShellSearchButton />} right={right} rightRail={false} />
      <div className={s.wgrid} data-host-center={empty ? "empty" : "list"}>
        {empty ? <EmptyCenter t={t} language={language} onImport={() => setImportOpen(true)} /> : (
          <>
            {kpi && !inactiveView ? (
              <>
                <KpiCard label={t("kUpcoming")}><Big value={kpi.upcoming} /><div className={s.lbl}>{t("kThisMonth", { n: kpi.upcomingThisMonth })}</div></KpiCard>
                <KpiCard label={t("kAppliedMonth")}><Big value={kpi.appliedThisMonth} />{kpi.appliedDeltaVsLastMonth != null ? <span className={s.delta}>{t("kDelta", { n: `${kpi.appliedDeltaVsLastMonth >= 0 ? "+" : ""}${kpi.appliedDeltaVsLastMonth}` })}</span> : null}</KpiCard>
                <KpiCard label={t("kAvgCheckIn")}><Big value={kpi.averageCheckInRate ?? "—"} unit={kpi.averageCheckInRate != null ? "%" : undefined} /></KpiCard>
                <KpiCard label={t("kFollowup")} extra={<button type="button" className={s.why} aria-label={t("whyLabel")} aria-expanded={why} onClick={() => setWhy((value) => !value)}>?</button>}>
                  <Big value={kpi.followupRate ?? "—"} unit={kpi.followupRate != null ? "%" : undefined} />
                  {why ? <div className={s.whyBody}>{t("kFollowupWhy", { n: kpi.followupEndedCount })}</div> : null}
                </KpiCard>
              </>
            ) : spot && !inactiveView ? (
              <>
                <KpiCard label={t("kUpcoming")}><Big value={data.filterCounts.upcoming + data.filterCounts.live} /><div className={s.lbl}>{hostDateDay(spot.startsAt, t, language)}</div></KpiCard>
                <KpiCard label={t("kApplied")}><Big value={spot.applied} />{spot.capacity ? <div className={s.lbl}>{t("kCapacity", { n: spot.capacity })}</div> : null}</KpiCard>
                <KpiCard label={t("kPending")}><Big value={spot.pendingReview} unit={unit} tone={spot.pendingReview > 0 ? "coral" : undefined} /></KpiCard>
                <KpiCard label={t("kCohosts")}><Big value={spot.cohosts} unit={unit} /></KpiCard>
              </>
            ) : null}
            {!inactiveView ? <TodoStrip items={data.todo} t={t} /> : null}
            <div className={`${s.span12} ${s.row} ${inactiveView ? s.toolbarInactive : `${s.between} ${s.toolbar}`}`}>
              <Segmented variant="seg" label={t("fLabel")} data-host-filters="" value={filter} onChange={(key) => onFilter?.(key)}
                segments={tabs.map((key) => ({ key, label: inactiveView ? t(FILTER_LABEL[key]) : `${t(FILTER_LABEL[key])} ${data.filterCounts[key]}` }))} />
              {!inactiveView ? (
                <div className={s.row} style={{ gap: 8 }}>
                  <label className={s.search}><Icon name="search" size={16} /><input type="search" value={query} placeholder={t("searchPh")} aria-label={t("searchLabel")} onChange={(ev) => onQuery?.(ev.target.value)} /></label>
                  <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={onToggleSort} aria-pressed={newestFirst}>{newestFirst ? t("sortNewest") : t("sortDate")} <Icon name="down" size={16} /></button>
                </div>
              ) : null}
            </div>
            {rows.map((row) => <HostEventCard key={row.eventId} row={row} t={t} language={language} onOpen={onOpen} />)}
            {!rows.length ? <div className={`${s.card} ${s.span12} ${s.empty}`}>{t("noResults")}</div> : null}
            {data.next && !inactiveView ? <NextSteps next={data.next} t={t} language={language} /> : null}
          </>
        )}
      </div>
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t("importTitle")} actions={<a className={`btn ${s.btn} ${s.primary}`} href={CREATE_HREF}><Icon name="plus" size={16} />{t("createEvent")}</a>}>
        <p className={s.modalText}>{t("importBody")}</p>
        <p className={`${s.lbl} ${s.modalText}`}>{t("importHint")}</p>
      </Modal>
    </>
  );
}

function CenterInner({ language }: { language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState<HostCenterFilter>(() => parseCenterFilter(params.get("filter")));
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [newestFirst, setNewestFirst] = useState(false);
  const [data, setData] = useState<HostCenterResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (nextFilter: HostCenterFilter, q: string) => {
    const res = await hostApi.center(nextFilter, q);
    if (res.ok) { setData(res.data); setFailed(false); } else setFailed(true);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(filter, query); }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [filter, query, load]);
  const changeFilter = (next: HostCenterFilter) => {
    setFilter(next);
    const search = new URLSearchParams(params.toString());
    if (next === "all") search.delete("filter"); else search.set("filter", next);
    router.replace(`?${search.toString()}`, { scroll: false });
  };

  if (failed && !data) {
    return (
      <>
        <ShellPage title={t("centerTitle")} rightRail={false} />
        <div className={`${s.card} ${s.empty}`}>{t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load(filter, query)}>{t("retry")}</button></div>
      </>
    );
  }
  if (!data) return <ShellPage title={t("centerTitle")} rightRail={false} />;
  return <HostCenterView data={data} filter={filter} query={query} language={language} newestFirst={newestFirst} onFilter={changeFilter} onQuery={setQuery} onToggleSort={() => setNewestFirst((value) => !value)} onOpen={(href) => router.push(href)} />;
}

export function HostCenter({ language }: { language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={s.page}>
      <ToastProvider>
        <CenterInner language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
