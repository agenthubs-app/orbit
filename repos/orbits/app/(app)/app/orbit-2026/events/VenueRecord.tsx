"use client";

// 2026-11-20 会場の記録（event-web-revisit-cover-width-proposal「会場の記録 · グループ / おすすめ / 没进分组」）：
// 会場モード同一页面（/app/events/[id]/live）的只读状态——venue.state === "ended" && readOnly。
// 页签 グループ / おすすめ / 参加者 / アジェンダ（去掉「現場」「マップ」）；所有写操作隐藏，只有参加者の詳細里的メモ可写。
// 任何人名点开 → 右栏（≥1280）/ 抽屉的同一个「参加者の詳細」。
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { EventVenuePerson, EventVenueResponse } from "../../../../../shared/contract/event-venue";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellPage } from "../shell/slots";
import { Icon, Segmented, useToast } from "../ui";
import type { JourneyT } from "./DiscoverTab";
import { WEEK, parts, useWide } from "./EventDetail";
import { personRailOrDrawer, usePersonDetail, type AttendeeSeed } from "./AttendeeProfile";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import r from "./record.module.css";

export type RecordTab = "groups" | "recs" | "people" | "agenda";
const TABS: readonly { key: RecordTab; label: "segGroups" | "segRecs" | "tabPeople" | "tabAgenda" }[] = [
  { key: "groups", label: "segGroups" }, { key: "recs", label: "segRecs" }, { key: "people", label: "tabPeople" }, { key: "agenda", label: "tabAgenda" },
];
const TONES = ["c1", "c2", "c3", "c4", "c5"] as const;
/** 同一个人在各处同一个头像色（按 id 取）。 */
export function personTone(attendeeId: string): string {
  let hash = 0;
  for (const char of attendeeId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return x[TONES[hash % TONES.length]!]!;
}

/** 回看页要显示什么：没进分组也没有推荐 → 空态（照 board-6）。 */
export function recordSummary(data: Pick<EventVenueResponse, "rounds" | "recommendations" | "stats">) {
  const rounds = data.rounds ?? [];
  const tablemates = new Set(rounds.flatMap((round) => round.tablemates.map((mate) => mate.attendeeId))).size;
  return { empty: rounds.length === 0 && data.recommendations.length === 0, exchanged: data.stats.exchanged, tablemates, wantedMet: data.stats.wantedMet, wantedTotal: data.stats.wantedTotal };
}

/** 第一个默认选中的人：第一轮第一个同桌，其次第一条推荐。 */
export function firstRecordPerson(data: Pick<EventVenueResponse, "rounds" | "recommendations">): AttendeeSeed | null {
  const mate = data.rounds?.[0]?.tablemates[0];
  if (mate) return { attendeeId: mate.attendeeId, initial: mate.initial, name: mate.name, org: mate.org ?? null, role: mate.role ?? null };
  const rec = data.recommendations[0];
  return rec ? { attendeeId: rec.attendeeId, initial: rec.initial, name: rec.name, org: rec.org ?? null, role: rec.role ?? null } : null;
}

const seedOf = (person: { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null }): AttendeeSeed => ({ attendeeId: person.attendeeId, initial: person.initial, name: person.name, org: person.org ?? null, role: person.role ?? null });

// 2026-11-21 用户定：只标事实（交換済み / 申請あり / 申請中），没交换就不标——不再用「有没有写メモ」推断「話していない」。
function statusChip(person: EventVenuePerson, t: JourneyT) {
  if (person.exchange === "exchanged") return <span className={`${styles.chip} ${styles.c_teal}`}>{t("exExchanged")}</span>;
  if (person.exchange === "incoming") return <span className={`${styles.chip} ${styles.c_lav}`}>{t("exIncoming")}</span>;
  if (person.exchange === "requested") return <span className={styles.chip}>{t("exRequested")}</span>;
  return null;
}

export function VenueRecordView({ data, eventId, language, t }: { data: EventVenueResponse; eventId: string; language: OrbitLanguage; t: JourneyT }) {
  const toast = useToast();
  const wide = useWide();
  const detail = usePersonDetail();
  const summary = useMemo(() => recordSummary(data), [data]);
  const [tab, setTab] = useState<RecordTab>("groups");
  const [why, setWhy] = useState<Record<number, boolean>>({});
  // 「ほかのテーブル」：按轮切换（默认我所在的第一轮），点一桌展开那桌的人。
  const otherRounds = data.roundTables ?? [];
  const [otherRoundNo, setOtherRoundNo] = useState<number | null>(null);
  const otherRound = otherRounds.find((item) => item.round === otherRoundNo) ?? otherRounds[0];
  const [openTable, setOpenTable] = useState<string | null>(null);
  // 宽屏一打开就和画板一样右栏有人（第一轮第一个同桌）；窄屏不自动弹抽屉。
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    // useWide() 首帧是 true（还没量屏幕）：直接量一次，手机上不会先按宽屏自动选人、再变成全屏抽屉弹出（2026-11-23 用户反馈）。
    if (autoPicked || !wide || !window.matchMedia("(min-width: 1280px)").matches) return;
    setAutoPicked(true);
    const first = firstRecordPerson(data);
    if (first) detail.open(first);
  }, [autoPicked, wide, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const detailHref = `/app/events/${encodeURIComponent(eventId)}`;
  const p = parts(data.startsAt);
  const date = p ? t("dateWeek", { d: p.day, m: p.month, wd: WEEK[language][p.wd] }) : "";
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(t("shareCopied")); } catch { /* clipboard blocked: nothing to do */ }
  };
  const open = (seed: AttendeeSeed) => detail.open(seed);
  const selectedId = detail.selectedId;
  const { rail, drawer } = personRailOrDrawer({ close: detail.close, eventId, fallbackRail: false, language, person: detail.person, t, tone: detail.person ? personTone(detail.person.attendeeId) : undefined, wide });

  const mateRow = (mate: { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null }) => (
    <button key={mate.attendeeId} type="button" className={`btn ${r.mate} ${selectedId === mate.attendeeId ? r.mateOn : ""}`} aria-pressed={selectedId === mate.attendeeId} data-record-person={mate.attendeeId} onClick={() => open(seedOf(mate))}>
      <div className={`${x.av} ${x.avSm} ${personTone(mate.attendeeId)}`}>{mate.initial}</div>
      <div className={r.mateMeta}><b>{mate.name}</b><span>{[mate.org, mate.role].filter(Boolean).join(" · ")}</span></div>
      <span className={r.chev}><Icon name="right" size={16} /></span>
    </button>
  );
  const personCard = (person: EventVenuePerson, withWhy: boolean) => (
    <div key={person.attendeeId} role="button" tabIndex={0} className={`${styles.evc} ${styles.span4} ${r.recCard} ${selectedId === person.attendeeId ? r.selRec : ""}`} data-record-card={person.attendeeId}
      onClick={() => open(seedOf(person))} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(seedOf(person)); } }}>
      <div className={styles.row} style={{ gap: 12 }}>
        <div className={`${x.av} ${personTone(person.attendeeId)}`}>{person.initial}</div>
        <div className={r.grow}><b>{person.name}</b><div className={`${styles.lbl} ${d.ell}`}>{[person.org, person.role].filter(Boolean).join(" · ")}</div></div>
      </div>
      {withWhy && person.why ? <div className={styles.sub}>{person.why}</div> : null}
      <div className={r.recFoot}>
        {person.table ? <span className={`${styles.chip} ${styles.c_lav} ${r.chipIcon}`}><Icon name="pin" size={16} />{t("tableChip", { t: person.table })}</span> : <span />}
        {statusChip(person, t)}
      </div>
    </div>
  );

  const tabsRow = (
    <div className={`${styles.span12} ${r.tabsRow}`}>
      <Segmented<RecordTab> variant="seg" label={t("recordTabs")} value={tab} onChange={setTab} segments={TABS.map((item) => ({ key: item.key, label: t(item.label) }))} data-record-tabs="" />
      <span className={`${styles.lbl} ${r.readOnly}`}><Icon name="clock" size={16} />{t("recordReadOnly")}</span>
    </div>
  );
  const agenda = (
    <div className={`${styles.card} ${styles.span12}`} data-record-agenda="">
      <div className={styles.cardH}><h3>{t("tabAgenda")}</h3></div>
      {data.agenda.length ? data.agenda.map((item) => (
        <div key={`${item.at}-${item.title}`} className={x.tline}><time>{item.at}</time><span className={x.dot} /><div><b>{item.title}</b><span className={styles.lbl}>{item.detail ?? ""}</span></div></div>
      )) : <div className={styles.lbl}>{t("agendaEmpty")}</div>}
    </div>
  );

  let body;
  if (summary.empty && tab === "groups") {
    body = (
      <div className={`${styles.card} ${styles.span12} ${styles.guide} ${r.empty}`} data-record-empty="">
        <div className={styles.lbl}>{t("recordEmptyLbl")}</div>
        <div className={r.emptyTitle}>{t("recordEmptyTitle")}</div>
        <div className={styles.sub}>{t("recordEmptySub")}</div>
        <div className={r.emptyActs}>
          {/* 2026-11-21：记录为空时「参加者一覧」= 全名单页（与详情页「全員を見る」同一页）。 */}
          <Link className={`btn ${styles.btn} ${styles.primary}`} href={`/app/events/${encodeURIComponent(eventId)}/people`} data-record-people=""><Icon name="users" size={16} />{t("attendeeList")}</Link>
          <button type="button" className={`btn ${styles.btn}`} onClick={() => setTab("agenda")}>{t("tabAgenda")}</button>
        </div>
      </div>
    );
  } else if (tab === "groups") {
    const rounds = data.rounds ?? [];
    body = (
      <>
        {tabsRow}
        <div className={`${styles.card} ${styles.span12}`} data-record-stats="">
          <div className={r.stats}>
            <div className={r.stat}><span className={styles.lbl}>{t("statExchanged")}</span><b>{summary.exchanged}</b></div>
            <div className={r.stat}><span className={styles.lbl}>{t("itemTarget")}</span><b>{summary.wantedMet}<small>/{summary.wantedTotal}</small></b></div>
            <div className={r.stat}><span className={styles.lbl}>{t("sameTable")}</span><b>{summary.tablemates}<small>{t("peopleUnit")}</small></b></div>
            {data.checkedIn ? <a className={`btn ${styles.btn} ${styles.sm} ${r.statLink}`} href={`${detailHref}/after`} data-record-after="">{t("toAfter")}<span aria-hidden> ›</span></a> : null}
          </div>
        </div>
        {rounds.map((round) => (
          <div key={round.round} className={`${styles.card} ${styles.span4} ${r.rnd}`} data-record-round={round.round}>
            <div className={r.rndHead}><span className={styles.lbl}>{round.title ? `${t("roundN", { n: round.round })} · ${round.title.replace(/^R(?:ound)?\s*\d+\s*·\s*/u, "")}` : t("roundN", { n: round.round })}</span>{round.theme ? <span className={styles.chip}>{round.theme}</span> : null}</div>
            <div className={r.tb}>{round.table}</div>
            {round.why ? (
              <>
                <div className={r.whyLine}><span className={r.grow}>{round.why}</span>{round.whyDetail ? <button type="button" className={`btn ${d.why}`} aria-expanded={Boolean(why[round.round])} aria-label={t("whyLabel")} onClick={() => setWhy((all) => ({ ...all, [round.round]: !all[round.round] }))}>?</button> : null}</div>
                {why[round.round] && round.whyDetail ? <div className={d.whyBody}>{round.whyDetail}</div> : null}
              </>
            ) : null}
            <div className={r.mates}>{round.tablemates.map(mateRow)}</div>
          </div>
        ))}
        {otherRounds.length ? (
          <div className={`${styles.card} ${styles.span12}`} data-record-other="">
            <div className={styles.cardH}>
              <h3>{t("otherTablesRound", { n: otherRound?.round ?? 1 })}</h3>
              {otherRounds.length > 1 ? (
                <div className={styles.seg} role="tablist">
                  {otherRounds.map((item) => (
                    <button key={item.round} type="button" role="tab" aria-selected={item.round === otherRound?.round} className={`btn ${styles.segBtn} ${item.round === otherRound?.round ? styles.segOn : ""}`} onClick={() => { setOtherRoundNo(item.round); setOpenTable(null); }} data-record-other-round={item.round}>{t("roundN", { n: item.round })}</button>
                  ))}
                </div>
              ) : null}
            </div>
            {otherRound?.tables.map((group) => {
              const open = openTable === group.table;
              return (
                <div key={group.table} className={r.otherBlock}>
                  <button type="button" className={`btn ${r.othert}`} aria-expanded={open} onClick={() => setOpenTable(open ? null : group.table)} data-record-other-table={group.table}>
                    <b>{group.table}</b><span>{group.theme ?? ""}</span><span className={styles.lbl}>{t("peopleN", { n: group.members.length })}<span aria-hidden> {open ? "⌃" : "›"}</span></span>
                  </button>
                  {open ? <div className={r.otherMates}>{group.members.map(mateRow)}</div> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </>
    );
  } else if (tab === "recs") {
    body = (
      <>
        {tabsRow}
        <div className={`${styles.span12} ${styles.cardH} ${r.recsHead}`}><h3>{t("recsTitleN", { n: data.recommendations.length })}</h3><span className={styles.lbl}>{t("recordRecsHint")}</span></div>
        {data.recommendations.map((person) => personCard(person, true))}
        {data.nextOrder.length ? (
          <div className={`${styles.card} ${styles.span12}`} data-record-next="">
            <div className={styles.cardH}><h3>{t("nextOrderTitle")}</h3><span className={styles.lbl}>{t("nextOrderHint")}</span></div>
            <div>{data.nextOrder.map(mateRow)}</div>
          </div>
        ) : null}
      </>
    );
  } else if (tab === "people") {
    body = <>{tabsRow}{data.attendees.map((person) => personCard(person, false))}</>;
  } else {
    body = <>{tabsRow}{agenda}</>;
  }

  return (
    <>
      <ShellPage title={t("venueRecord")} subtitle={t("recordSub", { date, title: data.title })}
        left={<a className={`btn ${x.rbtn}`} href={detailHref} aria-label={t("back")}><Icon name="left" size={16} /></a>}
        right={<button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void share()} data-record-share=""><Icon name="share" size={16} /></button>}
        rightRail={rail} />
      <div className={styles.wgrid} data-venue={eventId} data-venue-record="">{body}</div>
      {drawer}
    </>
  );
}
