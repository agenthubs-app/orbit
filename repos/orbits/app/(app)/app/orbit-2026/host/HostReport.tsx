"use client";

// R17 イベント運営 · レポート（b6 #16 開催前 · 朝会 #3 / #17 少 · Founders Lunch #11 / #18 全体 · vol.17 / #19 自分の視点 · vol.17 `&view=mine`）。
// 数据：GET /api/host/events/[id]/report?view=all|mine。参加者私人记录来的数字 <5 抑制 → null → 「—」（§2.9）。
// 自分の視点只读主办者本人的人脉与计划（不经主办权限），「下書きを作成」只开草稿、不发送。
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import type { HostReportAll, HostReportMine, HostReportResponse } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Avatar, Icon } from "../ui";
import { hostApi } from "./host-api";
import { ScoreRing } from "./HostPeople";
import { hostTranslator, type HostT } from "./host-model";
import s from "./host.module.css";
import r from "./report.module.css";

const DASH = "—";
type Tone = "teal" | "lav" | "blue" | "pink" | "apricot" | "";
const STANDING_TONES: readonly Tone[] = ["lav", "blue", "teal", "apricot", "pink", ""];
/** 開催後のサンプル（b6 #16 の淡色 4 枚；「サンプル」と明記）。 */
const SAMPLE = { checkIn: 84, exchangeRate: 91, exchanges: 312, followups: 52 } as const;

/** null → 「—」。 */
export const orDash = (value: number | null | undefined, suffix = "") => (value == null ? DASH : `${value}${suffix}`);

/** 柱の高さ：1 単位 最大 28px、いちばん高い柱は 96px まで（開催前は 9px / 72px）。 */
export function barHeights(values: readonly number[], before = false): number[] {
  const max = Math.max(1, ...values);
  const unit = before ? Math.min(9, 72 / max) : Math.min(28, 96 / max);
  return values.map((value) => Math.round(value * unit));
}

/** 開催前の推移：公開からの日数ぶん + 開催までの残りを薄い柱で（合計 21 本）。 */
export const futureBars = (trend: readonly number[]) => Math.max(0, 21 - trend.length);

/** ファネルの割合（名刺交換した人 = 100%）。 */
export const funnelPercent = (value: number | null, base: number | null) => (value == null || !base ? 0 : Math.round((value / base) * 100));

/** テーブル別のバー幅：20 組 = 100%（それ以上は 10 刻みで目盛りを伸ばす）。 */
export function tableScale(values: readonly (number | null)[]): number {
  const max = Math.max(0, ...values.map((value) => value ?? 0));
  return Math.max(20, Math.ceil(max / 10) * 10);
}

function Bar({ pct, tone = "" }: { pct: number; tone?: "" | "rose" | "warn" | "thin" }) {
  return <div className={`${r.bar} ${tone ? r[tone] : ""}`} role="presentation"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

function Why({ label, body, open, onToggle }: { label: string; body: string; open: boolean; onToggle: () => void }) {
  return (
    <>
      <div className={`${s.row} ${s.between}`}>
        <span className={s.lbl}>{label}</span>
        <button type="button" className={`btn ${s.why}`} aria-expanded={open} aria-label={label} onClick={onToggle}>?</button>
      </div>
      {open ? null : null}
      <div className={s.whyBody} hidden={!open}>{body}</div>
    </>
  );
}

function Before({ all, t }: { all: HostReportAll; t: HostT }) {
  const heights = barHeights(all.trend, true);
  const pct = all.capacity ? Math.round((all.applied / all.capacity) * 100) : 0;
  return (
    <>
      <div className={`${s.card} ${s.span8} ${s.guide} ${r.beforeCard}`} data-host-report="before">
        <div className={`${s.row} ${r.beforeRow}`}>
          <span className={`${s.emo} ${s.e_lav} ${r.emoXl}`}>📊</span>
          <div><div className={r.beforeTitle}>{t("rpBeforeTitle")}</div><div className={s.sub}>{t("rpBeforeSub")}</div></div>
        </div>
      </div>
      <div className={`${s.card} ${s.span4}`}>
        <div className={s.lbl}>{t("kApplied")}</div>
        <div className={`${s.big} ${r.mt0}`}>{all.applied}{all.capacity ? <small>{t("rpOfCap", { n: all.capacity })}</small> : null}</div>
        {all.capacity ? <Bar pct={pct} /> : null}
        {all.daysToStart != null ? <div className={s.lbl}>{t("rpDaysTo", { n: all.daysToStart })}</div> : null}
      </div>
      <div className={`${s.card} ${s.span12}`}>
        <div className={s.cardH}><h3>{t("trendTitle")}</h3>{all.daysSincePublish != null ? <span className={s.lbl}>{t("rpSincePub", { n: all.daysSincePublish })}</span> : null}</div>
        <div className={`${r.bars} ${r.bars90}`} role="img" aria-label={t("trendTitle")}>
          {heights.map((height, index) => <i key={index} style={{ height: `${height}px` }} />)}
          {Array.from({ length: futureBars(all.trend) }, (_, index) => <i key={`f${index}`} className={r.future} />)}
        </div>
      </div>
      <div className={`${s.cardH} ${r.sampleHead}`}><h3>{t("rpSampleHead")} <span className={s.sampleTag}>{t("sampleTag")}</span></h3></div>
      <div className={`${r.sampleGrid} ${s.faded}`} aria-hidden>
        {[[t("rpCheckInRate"), `${SAMPLE.checkIn}%`], [t("rpExchanges"), `${SAMPLE.exchanges}${t("rpPairs")}`], [t("rpExchangeRate"), `${SAMPLE.exchangeRate}%`], [t("rpFollow"), `${SAMPLE.followups}${t("unitPeople")}`]].map(([label, value]) => (
          <div key={label} className={`${s.card} ${s.span3}`}><div className={s.lbl}>{label}</div><div className={`${s.big} ${r.mt0}`}>{value}</div></div>
        ))}
      </div>
    </>
  );
}

function After({ all, t, why, onWhy }: { all: HostReportAll; t: HostT; why: boolean; onWhy: () => void }) {
  const heights = barHeights(all.trend);
  const marks = new Map((all.trendMarks ?? []).map((mark) => [mark.index, mark.label]));
  const base = all.funnel.exchanged;
  const funnel = [
    ["rpFunExchanged", all.funnel.exchanged, base == null ? 0 : 100, ""],
    ["rpFunDrafted", all.funnel.drafted, funnelPercent(all.funnel.drafted, base), ""],
    ["rpFunFollowed", all.funnel.followed, funnelPercent(all.funnel.followed, base), "rose"],
    ["rpFunMeetings", all.funnel.meetings, funnelPercent(all.funnel.meetings, base), "rose"],
  ] as const;
  const scale = tableScale(all.tables.map((cell) => cell.exchanges));
  const round = all.tables[0]?.round ?? 1;
  return (
    <>
      <div className={`${s.card} ${s.span3}`} data-host-report="after">
        <div className={`${s.row} ${r.rate}`}>
          <ScoreRing value={(all.checkInRate ?? 0) / 100} size={88} stroke={10} color="var(--plum-700)" label={`${t("rpCheckInRate")} ${orDash(all.checkInRate, "%")}`}>
            <b className={r.rateC}>{all.checkInRate ?? DASH}{all.checkInRate != null ? <small>%</small> : null}</b>
          </ScoreRing>
          <div><div className={s.lbl}>{t("rpCheckInRate")}</div><div className={r.mid}>{orDash(all.checkedIn)}<small className={s.lbl}> {t("rpOf", { n: all.applied })}</small></div></div>
        </div>
      </div>
      <div className={`${s.card} ${s.span3}`}>
        <div className={s.lbl}>{t("rpExchanges")}</div>
        <div className={`${s.big} ${r.mt6}`}>{orDash(all.exchanges)}{all.exchanges != null ? <small>{t("rpPairs")}</small> : null}</div>
        <div className={s.lbl}>{t("rpPerPerson", { n: orDash(all.exchangesPerPerson) })}</div>
      </div>
      <div className={`${s.card} ${s.span3}`}>
        <Why label={t("rpExchangeRate")} body={t("rpExchangeWhy", { n: orDash(all.checkedIn) })} open={why} onToggle={onWhy} />
        <div className={`${s.big} ${r.mt6}`}>{orDash(all.exchangeRate)}{all.exchangeRate != null ? <small>%</small> : null}</div>
        <div className={s.lbl}>{t("rpExchangeRateSub")}</div>
      </div>
      <div className={`${s.card} ${s.span3}`}>
        <div className={s.lbl}>{t("rpFollow")}</div>
        <div className={`${s.big} ${r.mt6}`}>{orDash(all.followups)}{all.followups != null ? <small>{t("unitPeople")}</small> : null}</div>
        <span className={s.delta}>{t("rpFollowDelta", { d: all.followupWindowDays, r: orDash(all.followupRate, "%") })}</span>
      </div>
      <div className={`${s.card} ${s.span8}`}>
        <div className={s.cardH}><h3>{t("trendTitle")}</h3>{all.daysPublishToEvent != null ? <span className={s.lbl}>{t("rpPubToEvent", { n: all.daysPublishToEvent })}</span> : null}</div>
        <div className={r.bars} role="img" aria-label={t("trendTitle")}>
          {heights.map((height, index) => <i key={index} className={marks.has(index) ? r.hi : undefined} data-mk={marks.get(index)} style={{ height: `${height}px` }} />)}
        </div>
        {all.trendLabels.length ? <div className={r.axis}>{all.trendLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div> : null}
      </div>
      <div className={`${s.card} ${s.span4}`}>
        <div className={s.cardH}><h3>{t("rpAfterTitle")}</h3><span className={s.lbl}>{t("rpByAttendees")}</span></div>
        <div className={r.fun}>
          {funnel.map(([label, value, pct, tone]) => <div key={label} className={r.f}><span>{t(label)}</span><b className={r.score}>{orDash(value)}</b><Bar pct={value == null ? 0 : pct} tone={tone} /></div>)}
        </div>
      </div>
      <div className={`${s.card} ${r.span6}`}>
        <div className={s.cardH}><h3>{t("rpTables")}</h3><span className={s.lbl}>{t("mRoundShort", { n: round })}</span></div>
        {all.tables.map((cell) => (
          <div key={`${cell.round}-${cell.table}`} className={r.hbar}>
            <span className={r.tno}>{cell.table}</span>
            <Bar pct={cell.exchanges == null ? 0 : (cell.exchanges / scale) * 100} tone={cell.exchanges != null && cell.exchanges < 10 ? "warn" : "thin"} />
            <b className={`${r.score} ${r.scoreR}`}>{orDash(cell.exchanges)}</b>
          </div>
        ))}
        {all.tableNote ? <div className={r.note}>{all.tableNote}</div> : null}
      </div>
      <div className={`${s.card} ${r.span6}`}>
        <div className={s.cardH}><h3>{t("rpStanding")}</h3>{all.standingQuestion ? <span className={s.lbl}>{all.standingQuestion}</span> : null}</div>
        {all.standing.map((item, index) => (
          <Fragment key={item.label}>
            <div className={`${s.row} ${s.between} ${r.standRow} ${index ? r.standGap : ""}`}><span>{item.label}</span><span className={s.muted}>{orDash(item.percent, "%")}</span></div>
            <Bar pct={item.percent ?? 0} tone={index % 2 ? "rose" : ""} />
          </Fragment>
        ))}
        {all.standing.length === 0 ? <div className={s.lbl}>{t("rpSuppressed", { n: all.suppressedBelow })}</div> : null}
      </div>
    </>
  );
}

function Mine({ mine, t, why, onWhy, onLog, logOpen }: { mine: HostReportMine; t: HostT; why: boolean; onWhy: () => void; onLog: (open: boolean) => void; logOpen: boolean }) {
  const tones = new Map<string, Tone>();
  for (const person of mine.unfollowed) if (person.standing && !tones.has(person.standing)) tones.set(person.standing, STANDING_TONES[tones.size % STANDING_TONES.length]!);
  const contribPct = mine.contributionHave != null && mine.contributionTarget ? Math.round((mine.contributionHave / mine.contributionTarget) * 100) : 0;
  return (
    <>
      {[["rpMet", mine.met, t("unitPeople")], ["rpExchanges", mine.exchanged, t("unitPeople")], ["rpFollowed", mine.followed, t("rpOf", { n: mine.followTotal })]].map(([label, value, unit]) => (
        <div key={label as string} className={`${s.card} ${s.span3}`} data-host-report-mine={label as string}>
          <div className={s.lbl}>{t(label as "rpMet")}</div>
          <div className={`${s.big} ${r.mt6}`}>{value as number}<small>{unit as string}</small></div>
        </div>
      ))}
      <div className={`${s.card} ${s.span3} ${r.contrib}`}>
        {mine.contributionLabel ? (
          <>
            <Why label={t("rpContribution")} body={mine.contributionDetail ?? ""} open={why} onToggle={onWhy} />
            <b className={r.contribLine}>{t("rpContribLine", { label: mine.contributionLabel, n: mine.contributionDelta ?? 0 })}</b>
            <Bar pct={contribPct} tone="rose" />
            <div className={s.lbl}>{t("rpContribScore", { goal: mine.contributionGoal ?? "", h: mine.contributionHave ?? 0, s: mine.contributionScore ?? 0, t: mine.contributionTarget ?? 0 })}</div>
          </>
        ) : <><div className={s.lbl}>{t("rpContribution")}</div><b className={r.contribLine}>{t("rpNoPlan")}</b></>}
      </div>
      <div className={`${s.card} ${s.span8} ${r.blk}`}>
        <div className={s.cardH}><h3>{t("rpUnfollowed")}</h3><span className={s.lbl}>{t("rpUnfollowedSub", { d: mine.daysSinceExchange ?? 0, n: mine.unfollowed.length })}</span></div>
        {mine.unfollowed.length === 0 ? <div className={s.sub}>{t("rpAllFollowed")}</div> : mine.unfollowed.map((person, index) => {
          const tone = person.standing ? tones.get(person.standing) ?? "" : "";
          const href = person.contactId ? `/app/contacts/${encodeURIComponent(person.contactId)}` : `/app/contacts?q=${encodeURIComponent(person.name)}`;
          return (
            <div key={`${person.name}-${index}`} className={r.mrow}>
              <Avatar name={person.name} size="sm" />
              <div className={r.meta}><b>{person.name}</b><span>{t("rpPersonMeta", { org: person.org ?? "", role: person.role ?? "", t: person.table ?? DASH })}</span></div>
              {person.standing ? <span className={`${s.chip} ${tone ? s[`c_${tone}`] : ""}`}>{person.standing}</span> : null}
              <a className={`btn ${s.btn} ${s.sm} ${index === 0 ? s.primary : ""}`} href={href}><Icon name="mail" size={16} />{t("rpDraft")}</a>
            </div>
          );
        })}
        <div className={`${s.lbl} ${r.noSend}`}><Icon name="mail" size={16} />{t("rpNoSend")}</div>
      </div>
      <div className={r.side}>
        {mine.logSuggestion && logOpen ? (
          <div className={`${s.card} ${r.suggest}`} data-host-report-log="">
            <div className={s.row}><span className={`${s.emo} ${s.emoSm} ${s.e_lav}`}>📝</span><b className={r.suggestB}>{t("rpLogTitle")}</b></div>
            <div className={`${s.sub} ${r.suggestBody}`}>{t("rpLogBody", { text: mine.logSuggestion })}</div>
            <div className={`${s.row} ${r.suggestActs}`}>
              <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => onLog(false)}>{t("suDismiss")}</button>
              <a className={`btn ${s.btn} ${s.sm} ${s.primary}`} href="/app/plan">{t("suAdd")}</a>
            </div>
          </div>
        ) : null}
        <div className={`${s.card} ${s.flat} ${r.hostCard}`}>
          <div className={s.lbl}>{t("rpAsHost")}</div>
          <div className={`${s.sub} ${r.hostBody}`}>{t("rpAsHostBody")}</div>
        </div>
      </div>
    </>
  );
}

export type HostReportViewProps = { data: HostReportResponse; t: HostT; why?: boolean; onWhy?: () => void; logOpen?: boolean; onLog?: (open: boolean) => void };

/** 純粋な描画（b6 #16–#19）。 */
export function HostReportView({ data, t, why = false, onWhy, logOpen = true, onLog }: HostReportViewProps) {
  if (data.view === "mine") return data.mine ? <Mine mine={data.mine} t={t} why={why} onWhy={() => onWhy?.()} logOpen={logOpen} onLog={(open) => onLog?.(open)} /> : null;
  if (!data.all) return null;
  return data.all.state === "before" ? <Before all={data.all} t={t} /> : <After all={data.all} t={t} why={why} onWhy={() => onWhy?.()} />;
}

export function HostReportTab({ eventId, language, view }: { eventId: string; language: OrbitLanguage; view: "all" | "mine" }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const [data, setData] = useState<HostReportResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [why, setWhy] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const load = useCallback(async () => {
    const res = await hostApi.report(eventId, view);
    if (res.ok) { setData(res.data); setFailed(false); } else setFailed(true);
  }, [eventId, view]);
  useEffect(() => { setWhy(false); void load(); }, [load]);
  if (failed && !data) return <div className={`${s.card} ${s.span12} ${s.empty}`} data-host-failure="report">{t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></div>;
  if (!data || data.view !== view) return null;
  return <HostReportView data={data} t={t} why={why} onWhy={() => setWhy(!why)} logOpen={logOpen} onLog={setLogOpen} />;
}
