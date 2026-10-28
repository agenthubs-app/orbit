"use client";

// R17 イベント運営 · マッチング（b6 #3 空 · 朝会 #3 / #4 少 · ラウンドテーブル / #5 大 · CFO18 / #6 公開確認）。
// 数据：GET /api/host/events/[id]/matching?round=；生成 POST /matching/generate（≤3 回，条件随生成提交）；
// 调整只写 PUT /matching/overrides（带 overridesVersion，409 → 「他の運営者が先に更新しました」并重读）；公開 POST /matching/publish。
// 拖动：⋮⋮ 可拖（HTML5 DnD），也可点 ⋮⋮ 拿起再点目标桌 / 「未配置」（键盘：拿起后 Tab 到目标卡上的「ここに移動」，Esc 放下）。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import type { HostMatchingConditions, HostMatchingMember, HostMatchingMove, HostMatchingResponse, HostMatchingTable } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { Avatar, ConfirmDialog, ContextMenu, Icon, Modal, Segmented, useToast } from "../ui";
import { failureOf, hostApi } from "./host-api";
import { consoleHref, hostTime, hostTranslator, type HostT } from "./host-model";
import { matchingSampleTables } from "./matching-sample";
import s from "./host.module.css";
import m from "./tabs.module.css";

type StandingTone = "teal" | "lav" | "blue" | "pink" | "apricot" | "";
// 立場 chip 的颜色按本页首次出现的顺序取（画板：事業会社 teal / 投資家 lav / CFO blue / 士業 pink / 経営者 apricot / 金融 无色）。
const STANDING_TONES: readonly StandingTone[] = ["teal", "lav", "blue", "pink", "apricot", ""];
const DEFAULT_VISIBLE = 6;

/** 立場 → chip 色（同一页里同一立場同一色）。 */
export function standingToneMap(tables: readonly HostMatchingTable[]): Map<string, StandingTone> {
  const map = new Map<string, StandingTone>();
  for (const table of tables) for (const member of table.members) {
    if (member.standing && !map.has(member.standing)) map.set(member.standing, STANDING_TONES[map.size % STANDING_TONES.length]!);
  }
  return map;
}

/** 「1卓 5名」/「1卓 4〜5名」。 */
export function tableSizeText(min: number, max: number): string {
  return min === max ? String(max) : `${min}〜${max}`;
}

/** 「空き席に入れる」：未配置的人按顺序放进人数最少、且没满 tableSize 的桌。 */
export function fillSeatsMoves(data: HostMatchingResponse): HostMatchingMove[] {
  const capacity = Math.max(data.conditions.tableSize, data.tableSizeMax);
  const sizes = data.tables.filter((table) => table.round === data.round).map((table) => ({ size: table.members.length, table: table.table }));
  const moves: HostMatchingMove[] = [];
  for (const person of data.unplaced) {
    const open = sizes.filter((item) => item.size < capacity).sort((a, b) => a.size - b.size)[0];
    if (!open) break;
    open.size += 1;
    moves.push({ participantId: person.participantId, round: data.round, toTable: open.table });
  }
  return moves;
}

type Picked = { member: HostMatchingMember; from: string | null };

function StandingChip({ standing, tones }: { standing: string | null; tones: Map<string, StandingTone> }) {
  if (!standing) return null;
  const tone = tones.get(standing) ?? "";
  return <span className={`${s.chip} ${tone ? s[`c_${tone}`] : ""}`}>{standing}</span>;
}

type TableCardProps = {
  table: HostMatchingTable;
  t: HostT;
  tones: Map<string, StandingTone>;
  span: "span4" | "span6";
  open: boolean;
  onToggleWhy: () => void;
  picked: Picked | null;
  canMove: boolean;
  onPick?: (member: HostMatchingMember, from: string) => void;
  onDrop?: (toTable: string) => void;
};

export function TableCard({ table, t, tones, span, open, onToggleWhy, picked, canMove, onPick, onDrop }: TableCardProps) {
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const target = Boolean(picked && picked.from !== table.table);
  const hostPlaced = table.members.filter((member) => member.placedByHost);
  const allow = (event: DragEvent) => { if (canMove) event.preventDefault(); };
  return (
    <div className={`${s.card} ${span === "span4" ? s.span4 : m.span6} ${m.tcard} ${target ? m.dropOk : ""}`} data-host-table={table.table}
      onDragOver={allow} onDrop={(event) => { event.preventDefault(); onDrop?.(table.table); }}
      onClick={target ? () => onDrop?.(table.table) : undefined}>
      <div className={`${s.row} ${s.between}`}>
        <div className={`${s.row} ${m.tHead}`}>
          <span className={m.tno}>{table.table}</span>
          <div className={s.minw0}>
            <b className={`${s.clamp1} ${m.tTitle}`}>{table.theme ?? t("mTableN", { n: table.members.length, t: table.table })}</b>
            <div className={s.lbl}>{t("mTableN", { n: table.members.length, t: table.table })}</div>
          </div>
        </div>
        <div className={`${s.row} ${m.tActs}`}>
          {target ? <button type="button" className={`btn ${m.srOnly}`} onClick={(event) => { event.stopPropagation(); onDrop?.(table.table); }}>{t("mMoveHere")}</button> : null}
          {table.absent > 0 ? <span className={`${s.chip} ${s.c_coral}`}>{t("mAbsent", { n: table.absent })}</span> : null}
          <button ref={menuRef} type="button" className={`btn ${m.lbtn}`} aria-label={t("mTableMenu")} aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); setMenu(true); }}><Icon name="more" size={16} /></button>
          {menu ? <ContextMenu open onClose={() => setMenu(false)} anchor={menuRef} label={t("mTableMenu")} items={[{ key: "why", label: t("mWhy"), icon: "info", onSelect: onToggleWhy }]} /> : null}
        </div>
      </div>
      <div className={m.members}>
        {table.members.map((member) => {
          const dragging = picked?.member.participantId === member.participantId && picked.from === table.table;
          return (
            <div key={member.participantId} className={`${m.mrow} ${dragging ? m.drag : ""}`} data-member={member.participantId}
              draggable={canMove} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", member.participantId); onPick?.(member, table.table); }}>
              <button type="button" className={`btn ${m.handle}`} disabled={!canMove} aria-pressed={dragging} aria-label={t("mMoveHandle", { name: member.name })}
                onClick={(event) => { event.stopPropagation(); onPick?.(member, table.table); }}>⋮⋮</button>
              <Avatar name={member.name} size="sm" />
              <div className={m.meta}><b>{member.name}</b><span>{[member.org, member.role].filter(Boolean).join(" · ")}</span></div>
              <StandingChip standing={member.standing} tones={tones} />
            </div>
          );
        })}
      </div>
      <div className={`${s.row} ${m.whyRow}`}>
        <span className={s.lbl}>{t("mWhy")}</span>
        <button type="button" className={`btn ${s.why}`} aria-expanded={open} aria-label={t("mWhy")} onClick={(event) => { event.stopPropagation(); onToggleWhy(); }}>?</button>
        <span className={`${s.lbl} ${m.whyIcon}`} aria-hidden><Icon name="refresh" size={16} /></span>
      </div>
      {open ? (
        <div className={s.whyBody} data-host-why={table.table}>
          {table.why}
          {hostPlaced.map((member) => <span key={member.participantId} className={m.hostPlaced}><b>{member.name}</b> · {t("mWhyHost")}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function ConditionRows({ conditions, t, onChange, onOpenSizes }: { conditions: HostMatchingConditions; t: HostT; onChange?: (next: HostMatchingConditions) => void; onOpenSizes?: () => void }) {
  const toggle = (key: "separateCompanies" | "avoidPreviousTablemates" | "investorPerTable", label: string) => (
    <div className={m.setrow}>
      <span className={m.setLabel}>{label}</span>
      <button type="button" role="switch" aria-checked={conditions[key]} aria-label={label} disabled={!onChange} className={`btn ${m.tgl} ${conditions[key] ? m.tglOn : ""}`}
        onClick={() => onChange?.({ ...conditions, [key]: !conditions[key] })} />
    </div>
  );
  return (
    <>
      <div className={m.setrow}><span className={m.setLabel}>{t("cTableSize")}</span><button type="button" className={`btn ${s.chip} ${m.chipBtn}`} onClick={onOpenSizes} disabled={!onOpenSizes}>{t("nPeople", { n: conditions.tableSize })}</button></div>
      <div className={m.setrow}><span className={m.setLabel}>{t("cRounds")}</span><button type="button" className={`btn ${s.chip} ${m.chipBtn}`} onClick={onOpenSizes} disabled={!onOpenSizes}>{conditions.roundCount}</button></div>
      {toggle("separateCompanies", t("cSeparate"))}
      {toggle("avoidPreviousTablemates", t("cAvoid"))}
      {toggle("investorPerTable", t("cInvestor"))}
    </>
  );
}

function Options({ values, value, label, render, onChange }: { values: readonly number[]; value: number; label: string; render: (n: number) => string; onChange: (n: number) => void }) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label}>
      {values.map((n) => <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={render(n)} className={`btn ${s.segBtn} ${n === value ? s.segOn : ""}`} onClick={() => onChange(n)}>{render(n)}</button>)}
    </div>
  );
}

/** 条件的弹层：空态 = 只改本地条件；已生成 = 按新条件再生成（会丢手动调整，先确认）。 */
export function ConditionsModal({ initial, t, remaining, regenerate, busy, onClose, onApply }: { initial: HostMatchingConditions; t: HostT; remaining: number; regenerate: boolean; busy: boolean; onClose: () => void; onApply: (next: HostMatchingConditions) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <Modal open onClose={onClose} title={t("mCondTitle")} size={480}
      hint={regenerate ? t("mRulesNote", { n: remaining }) : undefined}
      actions={<><button type="button" className={`btn ${s.btn}`} onClick={onClose}>{t("cancel")}</button><button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy || (regenerate && remaining <= 0)} onClick={() => onApply(draft)}>{regenerate ? t("mApply") : t("mSaveRules")}</button></>}>
      <div className={m.condBody}>
        <div className={m.setrow}><span className={m.setLabel}>{t("cTableSize")}</span><Options values={[3, 4, 5, 6, 7, 8]} value={draft.tableSize} label={t("cTableSize")} render={(n) => t("nPeople", { n })} onChange={(n) => setDraft({ ...draft, tableSize: n })} /></div>
        <div className={m.setrow}><span className={m.setLabel}>{t("cRounds")}</span><Options values={[1, 2, 3]} value={draft.roundCount} label={t("cRounds")} render={String} onChange={(n) => setDraft({ ...draft, roundCount: n })} /></div>
        <ConditionRowsToggles conditions={draft} t={t} onChange={setDraft} />
      </div>
    </Modal>
  );
}

function ConditionRowsToggles({ conditions, t, onChange }: { conditions: HostMatchingConditions; t: HostT; onChange: (next: HostMatchingConditions) => void }) {
  const items = [["separateCompanies", t("cSeparate")], ["avoidPreviousTablemates", t("cAvoid")], ["investorPerTable", t("cInvestor")]] as const;
  return (
    <>
      {items.map(([key, label]) => (
        <div key={key} className={m.setrow}>
          <span className={m.setLabel}>{label}</span>
          <button type="button" role="switch" aria-checked={conditions[key]} aria-label={label} className={`btn ${m.tgl} ${conditions[key] ? m.tglOn : ""}`} onClick={() => onChange({ ...conditions, [key]: !conditions[key] })} />
        </div>
      ))}
    </>
  );
}

/** 公開確認（b6 #6）。 */
export function PublishConfirm({ data, t, busy, onCancel, onPublish }: { data: HostMatchingResponse; t: HostT; busy: boolean; onCancel: () => void; onPublish: (notifyCohosts: boolean) => void }) {
  // 「共同運営者にも公開を知らせる」→ HostMatchingPublishInput.notifyCohosts（bb24efda）；没有共同运营者时不显示、不通知。
  const [notifyCohosts, setNotifyCohosts] = useState(true);
  const placed = Math.max(0, data.participantCount - data.unplaced.length);
  const rounds = data.rounds.length ? data.rounds.map((round) => round.index) : [1];
  const title = t("pubTitle");
  return (
    <Modal open onClose={onCancel} title={title} size={480} header={<span className={`${s.emo} ${s.e_lav}`}>📣</span>}>
      <div className={m.pubTitle}>{title}</div>
      <div className={`${s.sub} ${m.pubSub}`}>{t("pubSub", { n: data.participantCount })}</div>
      <div className={m.pubList}>
        {rounds.map((index) => (
          <div key={index} className={m.setrow}><span className={`${s.chip} ${s.c_teal}`}><Icon name="check" size={16} /></span><b>{t("mRoundShort", { n: index })}</b><span className={`${s.lbl} ${m.pubStat}`}>{t("pubRoundStat", { p: placed, t: data.tableCount })}</span></div>
        ))}
        {data.unplaced.length ? <div className={m.setrow}><span className={`${s.chip} ${s.c_coral}`}>!</span><b>{t("pubUnplaced")}</b><span className={`${s.lbl} ${m.pubStat}`}>{t("pubUnplacedStat", { n: data.unplaced.length })}</span></div> : null}
      </div>
      <div className={`${m.mac} ${m.macApricot} ${m.pubNote}`}>{t("pubNote")}</div>
      {data.event.cohostCount > 0 ? (
        <div className={`${s.row} ${m.pubCheck}`}>
          <button type="button" role="checkbox" aria-checked={notifyCohosts} aria-label={t("pubCohosts", { n: data.event.cohostCount })} className={`btn ${m.cbx} ${notifyCohosts ? m.cbxOn : ""}`} onClick={() => setNotifyCohosts(!notifyCohosts)}>{notifyCohosts ? <Icon name="check" size={16} /> : null}</button>
          <span aria-hidden>{t("pubCohosts", { n: data.event.cohostCount })}</span>
        </div>
      ) : null}
      <div className={`${s.row} ${m.pubActs}`}>
        <button type="button" className={`btn ${s.btn}`} onClick={onCancel}>{t("cancel")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy} onClick={() => onPublish(data.event.cohostCount > 0 && notifyCohosts)}>{t("aPublish")}</button>
      </div>
    </Modal>
  );
}

export type HostMatchingViewProps = {
  data: HostMatchingResponse;
  t: HostT;
  language: OrbitLanguage;
  busy?: boolean;
  conditions?: HostMatchingConditions;
  picked?: Picked | null;
  openWhy?: ReadonlySet<string>;
  showAll?: boolean;
  onRound?: (round: number) => void;
  onToggleWhy?: (table: string) => void;
  onPick?: (member: HostMatchingMember, from: string | null) => void;
  onDrop?: (toTable: string | null) => void;
  onConditions?: (next: HostMatchingConditions) => void;
  onOpenConditions?: () => void;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  onPublish?: () => void;
  onFillSeats?: () => void;
  onShowAll?: () => void;
};

/** 纯描画：マッチング页签的网格子项（放在 HostConsoleView 的 .wgrid 里）。 */
export function HostMatchingView(props: HostMatchingViewProps) {
  const { data, t, language, busy = false, picked = null, openWhy = new Set<string>(), showAll = false } = props;
  const conditions = props.conditions ?? data.conditions;
  const eventId = data.event.eventId;
  if (data.state === "none") {
    const enough = data.applied >= data.minimumApplied;
    const missing = Math.max(0, data.applied - data.profileComplete);
    const sample = matchingSampleTables(language);
    const tones = standingToneMap(sample);
    return (
      <>
        <div className={`${s.card} ${s.span8} ${s.guide}`} data-host-matching="none">
          <div className={`${s.row} ${m.guideHead}`}>
            <span className={`${s.emo} ${s.e_lav} ${m.emoLg}`}>🪑</span>
            <div><div className={m.guideH}>{t("mEmptyTitle")}</div><div className={s.sub}>{t("mEmptySub")}</div></div>
          </div>
          <div className={m.checks}>
            <div className={s.chk}><span className={`${s.box} ${enough ? m.boxOk : m.boxNo}`}>{enough ? <Icon name="check" size={16} /> : null}</span><div className={s.grow}><b>{t("mApplied", { n: data.applied })}</b><span>{enough ? t("mAppliedOk", { m: data.minimumApplied }) : t("mAppliedShort", { k: data.minimumApplied - data.applied, m: data.minimumApplied })}</span></div></div>
            <div className={s.chk}>
              <span className={`${s.box} ${missing === 0 ? m.boxOk : m.boxNo}`}>{missing === 0 ? <Icon name="check" size={16} /> : null}</span>
              <div className={s.grow}><b>{t("mProfile", { a: data.profileComplete, n: data.applied })}</b><span>{missing ? t("mProfileSub", { k: missing }) : t("mProfileAll")}</span></div>
              {missing ? <a className={`btn ${s.btn} ${s.sm}`} href={`${consoleHref(eventId, "overview")}&notice=profile_incomplete`}>{t("mRemind")}</a> : null}
            </div>
            <div className={s.chk}><span className={`${s.box} ${m.boxOk}`}><Icon name="check" size={16} /></span><div className={s.grow}><b>{t("mCondCheck")}</b><span>{t("mCondCheckSub")}</span></div></div>
          </div>
          <div className={`${s.row} ${m.genRow}`}>
            <button type="button" className={`btn ${s.btn} ${s.primary} ${s.h46}`} disabled={busy || !enough || data.generationsUsed >= data.generationsLimit} onClick={props.onGenerate}><Icon name="sparkle" size={16} />{t("mGenerate")}</button>
            <span className={s.lbl}>{t("mGenerateNote", { n: data.generationsLimit })}</span>
          </div>
        </div>
        <div className={`${s.card} ${s.span4}`} data-host-conditions="">
          <div className={s.cardH}><h3>{t("mCondTitle")}</h3></div>
          <ConditionRows conditions={conditions} t={t} onChange={props.onConditions} onOpenSizes={props.onOpenConditions} />
        </div>
        <div className={`${s.span12} ${s.cardH} ${m.sampleHead}`}><h3>{t("mSampleTitle")} <span className={s.sampleTag}>{t("sampleTag")}</span></h3></div>
        <div className={`${s.subgrid} ${m.sampleGrid} ${s.faded}`} aria-hidden>
          {sample.map((table) => <TableCard key={table.table} table={table} t={t} tones={tones} span="span4" open={false} onToggleWhy={() => undefined} picked={null} canMove={false} />)}
        </div>
      </>
    );
  }
  if (data.state === "generating") {
    return (
      <div className={`${s.card} ${s.span12} ${s.guide}`} data-host-matching="generating" aria-live="polite">
        <div className={`${s.row} ${m.guideHead}`}>
          <span className={`${s.emo} ${s.e_lav} ${m.emoLg}`}>🪑</span>
          <div><div className={m.guideH}>{t("mGenerating")}</div><div className={s.sub}>{t("mGeneratingSub")}</div></div>
        </div>
      </div>
    );
  }
  const published = data.state === "published";
  const canMove = !published && Boolean(data.generationId) && !busy;
  const tables = data.tables.filter((table) => table.round === data.round || data.tables.every((item) => item.round !== data.round));
  const many = tables.length > 4;
  const visible = showAll ? tables : tables.slice(0, DEFAULT_VISIBLE);
  const rest = Math.max(0, data.tableCount - visible.length);
  const tones = standingToneMap(tables);
  const remaining = Math.max(0, data.generationsLimit - data.generationsUsed);
  const rounds = data.rounds.length ? data.rounds : [{ endsAt: "", index: 1, startsAt: "" }];
  const unplacedTarget = Boolean(picked && picked.from !== null);
  const chips: ReactNode[] = [];
  if (data.conditions.separateCompanies) chips.push(<span key="sep" className={s.chip}>{t("cSeparate")}</span>);
  if (data.conditions.avoidPreviousTablemates) chips.push(<span key="avoid" className={s.chip}>{t("chipAvoid")}</span>);
  if (data.conditions.investorPerTable) chips.push(<span key="inv" className={s.chip}>{t("chipInvestor")}</span>);
  if (data.unsatisfiedTables > 0) chips.push(<span key="uns" className={`${s.chip} ${s.c_coral}`}>{t("chipUnsatisfied", { n: data.unsatisfiedTables })}</span>);
  if (data.unplaced.length > 0) chips.push(<span key="unp" className={`${s.chip} ${s.c_coral}`}>{t("chipUnplaced", { n: data.unplaced.length })}</span>);
  return (
    <>
      <div className={`${s.card} ${s.span12} ${m.barCard}`} data-host-matching={data.state}>
        <div className={`${s.row} ${m.barRow}`}>
          <Segmented variant="seg" label={t("mRoundsLabel")} value={String(data.round)} onChange={(key) => props.onRound?.(Number(key))}
            segments={rounds.map((round) => ({ key: String(round.index), label: round.startsAt ? t("mRound", { from: hostTime(round.startsAt), n: round.index, to: hostTime(round.endsAt) }) : t("mRoundShort", { n: round.index }) }))} />
          <span className={`${s.chip} ${published ? s.c_teal : s.c_apricot}`}>{published ? t("mPublishedChip") : t("mDraftChip")}</span>
          <span className={s.lbl}>{t("mStats", { p: data.participantCount, size: tableSizeText(data.tableSizeMin, data.tableSizeMax), t: data.tableCount })}</span>
          <div className={`${s.row} ${m.barActs}`}>
            <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={props.onOpenConditions}><Icon name="sliders" size={16} />{t("mCond")}</button>
            <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy || remaining <= 0 || published} onClick={props.onRegenerate}><Icon name="refresh" size={16} />{t("mRegen")}<span className={`${s.lbl} ${m.remain}`}>{t("mRemaining", { n: remaining })}</span></button>
            {!published ? <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} disabled={busy || !data.generationId} onClick={props.onPublish} data-host-publish=""><Icon name="share" size={16} />{t("aPublish")}</button> : null}
          </div>
        </div>
        {chips.length ? <div className={m.chips}>{chips}</div> : null}
        {picked ? <div className={m.srOnly} aria-live="polite">{t("mPicked", { name: picked.member.name })}</div> : null}
      </div>
      {visible.map((table) => (
        <TableCard key={`${table.round}-${table.table}`} table={table} t={t} tones={tones} span={many ? "span4" : "span6"} open={openWhy.has(table.table)} onToggleWhy={() => props.onToggleWhy?.(table.table)}
          picked={picked} canMove={canMove} onPick={(member, from) => props.onPick?.(member, from)} onDrop={(to) => props.onDrop?.(to)} />
      ))}
      {data.unplaced.length || rest > 0 || unplacedTarget ? (
        <div className={`${s.card} ${s.span12} ${s.flat} ${m.unplacedCard} ${unplacedTarget ? m.dropOk : ""}`} data-host-unplaced={data.unplaced.length}
          onDragOver={(event) => { if (canMove) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); props.onDrop?.(null); }}
          onClick={unplacedTarget ? () => props.onDrop?.(null) : undefined}>
          <span className={`${s.emo} ${s.e_apricot}`}>🧩</span>
          <div className={s.grow}><b>{t("mUnplacedTitle", { n: data.unplaced.length })}</b><div className={s.lbl}>{t("mUnplacedSub")}</div></div>
          {unplacedTarget ? <button type="button" className={`btn ${m.srOnly}`} onClick={(event) => { event.stopPropagation(); props.onDrop?.(null); }}>{t("mToUnplaced")}</button> : null}
          {data.unplaced.length ? <button type="button" className={`btn ${s.btn}`} disabled={!canMove} onClick={(event) => { event.stopPropagation(); props.onFillSeats?.(); }}>{t("mFillSeats")}</button> : null}
          {rest > 0 && !showAll ? <button type="button" className={`btn ${s.btn} ${s.ghost}`} onClick={(event) => { event.stopPropagation(); props.onShowAll?.(); }}>{t("mShowRest", { n: rest })}</button> : null}
        </div>
      ) : null}
    </>
  );
}

/** 容器：读写与状态。`onChanged` 让壳刷新概要（页签角标等）。 */
export function HostMatchingTab({ eventId, language, onChanged }: { eventId: string; language: OrbitLanguage; onChanged?: () => void }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const round = Math.max(1, Number(params.get("round") ?? "1") || 1);
  const [data, setData] = useState<HostMatchingResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conditions, setConditions] = useState<HostMatchingConditions | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [openWhy, setOpenWhy] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [modal, setModal] = useState<"conditions" | "regen" | "publish" | null>(null);
  const [pendingConditions, setPendingConditions] = useState<HostMatchingConditions | null>(null);

  const load = useCallback(async () => {
    const res = await hostApi.matching(eventId, round);
    if (res.ok) { setData(res.data); setFailed(false); } else setFailed(true);
  }, [eventId, round]);
  useEffect(() => { void load(); }, [load]);
  // 生成中：每 4 秒重读，直到出结果；标签页在后台时跳过。
  useEffect(() => {
    if (data?.state !== "generating") return;
    const timer = setInterval(() => { if (typeof document !== "undefined" && document.visibilityState === "hidden") return; void load(); }, 4000);
    return () => clearInterval(timer);
  }, [data?.state, load]);
  useEffect(() => {
    if (!picked) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPicked(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picked]);

  const setRound = (next: number) => {
    const search = new URLSearchParams(params.toString());
    search.set("tab", "matching");
    if (next === 1) search.delete("round"); else search.set("round", String(next));
    setPicked(null);
    router.replace(`?${search.toString()}`, { scroll: false });
  };

  const conflict = async () => { toast.error(t("conflictFirst")); setPicked(null); await load(); };

  const move = async (moves: HostMatchingMove[], done: string) => {
    if (!data?.generationId || !moves.length) return;
    setBusy(true);
    const res = await hostApi.overrides(eventId, data.generationId, data.overridesVersion, moves);
    setBusy(false);
    setPicked(null);
    if (!res.ok) { if (failureOf(res) === "conflict") await conflict(); else toast.error(t("saveError")); return; }
    toast.success(done);
    if (round === 1) setData(res.data); else await load();
  };

  const drop = (toTable: string | null) => {
    if (!picked || !data) return;
    if (picked.from === toTable) { setPicked(null); return; }
    const name = picked.member.name;
    void move([{ participantId: picked.member.participantId, round: data.round, toTable }], toTable ? t("mMoved", { name, t: toTable }) : t("mMovedOut", { name }));
  };

  const generate = async (next: HostMatchingConditions) => {
    setBusy(true);
    const res = await hostApi.generate(eventId, next);
    setBusy(false);
    setModal(null);
    if (!res.ok) {
      const reason = failureOf(res);
      if (reason === "conflict" || reason === "rate_limited") toast.error(t("mLimit", { n: data?.generationsLimit ?? 3 }));
      else toast.error(t("saveError"));
      return;
    }
    setConditions(null);
    setData(res.data);
    if (res.data.state !== "generating") toast.success(t("mGenerated"));
    onChanged?.();
  };

  const publish = async (notifyCohosts: boolean) => {
    if (!data?.generationId) return;
    setBusy(true);
    const res = await hostApi.publishMatching(eventId, data.generationId, data.overridesVersion, notifyCohosts);
    setBusy(false);
    setModal(null);
    if (!res.ok) { if (failureOf(res) === "conflict") await conflict(); else toast.error(t("saveError")); return; }
    setData(res.data);
    toast.success(t("pubDone"));
    onChanged?.();
  };

  if (!data) {
    return failed
      ? <div className={`${s.card} ${s.span12} ${s.empty}`} data-host-failure="matching">{t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></div>
      : null;
  }
  const current = conditions ?? data.conditions;
  const remaining = Math.max(0, data.generationsLimit - data.generationsUsed);
  return (
    <>
      <HostMatchingView data={data} t={t} language={language} busy={busy} conditions={current} picked={picked} openWhy={openWhy} showAll={showAll}
        onRound={setRound}
        onToggleWhy={(table) => setOpenWhy((prev) => { const next = new Set(prev); if (next.has(table)) next.delete(table); else next.add(table); return next; })}
        onPick={(member, from) => setPicked((prev) => (prev?.member.participantId === member.participantId && prev.from === from ? null : { from, member }))}
        onDrop={drop}
        onConditions={setConditions}
        onOpenConditions={() => setModal("conditions")}
        onGenerate={() => void generate(current)}
        onRegenerate={() => { setPendingConditions(current); setModal("regen"); }}
        onPublish={() => setModal("publish")}
        onFillSeats={() => { const moves = fillSeatsMoves(data); if (!moves.length) toast.info(t("mNoSeats")); else void move(moves, t("mFilled", { n: moves.length })); }}
        onShowAll={() => setShowAll(true)} />
      {modal === "conditions" ? (
        <ConditionsModal initial={current} t={t} remaining={remaining} regenerate={data.state !== "none"} busy={busy} onClose={() => setModal(null)}
          onApply={(next) => { if (data.state === "none") { setConditions(next); setModal(null); } else { setPendingConditions(next); setModal("regen"); } }} />
      ) : null}
      <ConfirmDialog open={modal === "regen"} title={t("mRegenTitle")} message={t("mRegenBody", { n: remaining })} confirmLabel={t("mRegenConfirm")} cancelLabel={t("cancel")} icon="refresh"
        onCancel={() => setModal(null)} onConfirm={() => void generate(pendingConditions ?? current)} />
      {modal === "publish" ? <PublishConfirm data={data} t={t} busy={busy} onCancel={() => setModal(null)} onPublish={(notify) => void publish(notify)} /> : null}
    </>
  );
}
