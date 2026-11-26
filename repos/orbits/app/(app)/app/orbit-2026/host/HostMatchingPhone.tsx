"use client";

// < 768 マッチング（b13 HM-M1–M10，2026-11-26 用户定：手机上也能看、调整、发布）。
// 状态卡（ラウンド・下書き / 公開済み・条件 chip・条件 / 再生成・横滑桌号）→ 未配置卡在最上 → 桌卡默认收成一行，点开看成员；
// 换桌 = 成员行「移動」→ 底部抽屉选目标桌或「未配置へ」（代替拖拽）；底部唯一主按钮「マッチングを生成」/「公開する」。公开后只读。
import { useMemo, useState } from "react";

import type { HostMatchingConditions, HostMatchingMember, HostMatchingTable } from "../../../../../shared/contract/host-console";
import { Avatar, BottomSheet, Icon, Modal } from "../ui";
import { ConditionRowsToggles, Options, StandingChip, standingToneMap, tableSizeText, type HostMatchingViewProps, type StandingTone } from "./HostMatching";
import { consoleHref, hostTime, type HostT } from "./host-model";
import s from "./host.module.css";
import m from "./tabs.module.css";
import mp from "./matching-phone.module.css";

type Moving = { member: HostMatchingMember; from: string | null };

function TableRow({ table, t, tones, open, why, canMove, onToggle, onWhy, onMove }: { table: HostMatchingTable; t: HostT; tones: Map<string, StandingTone>; open: boolean; why: boolean; canMove: boolean; onToggle: () => void; onWhy: () => void; onMove: (member: HostMatchingMember) => void }) {
  const hostPlaced = table.members.filter((member) => member.placedByHost);
  return (
    <div className={`${s.card} ${mp.tc} ${open ? "" : mp.one}`} id={`host-table-${table.table}`} data-host-table={table.table}>
      <button type="button" className={`btn ${mp.tcH}`} aria-expanded={open} onClick={onToggle}>
        <span className={`${mp.tno} ${open ? "" : mp.tnoSm}`}>{table.table}</span>
        <span className={mp.meta}><b>{table.theme ?? t("mTableN", { n: table.members.length, t: table.table })}</b>{open ? <span className={s.lbl}>{t("mTableN", { n: table.members.length, t: table.table })}</span> : null}</span>
        {table.absent > 0 ? <span className={`${s.chip} ${s.c_coral}`}>{t("mAbsent", { n: table.absent })}</span> : null}
        {open ? null : <span className={s.lbl}>{t("nPeople", { n: table.members.length })}</span>}
        <Icon name={open ? "down" : "right"} size={16} />
      </button>
      {open ? (
        <>
          {table.members.map((member) => (
            <div key={member.participantId} className={mp.mr} data-member={member.participantId}>
              <Avatar name={member.name} size="sm" />
              <span className={mp.meta}><b>{member.name}</b><span>{[member.org, member.role].filter(Boolean).join(" · ")}</span></span>
              <StandingChip standing={member.standing} tones={tones} />
              {canMove ? <button type="button" className={`btn ${mp.mvBtn}`} onClick={() => onMove(member)} data-host-move="">{t("mMove")}</button> : null}
            </div>
          ))}
          <div className={mp.whyRow}>
            <span className={s.lbl}>{t("mWhy")}</span>
            <button type="button" className={`btn ${s.why}`} aria-expanded={why} aria-label={t("mWhy")} onClick={onWhy}>?</button>
          </div>
          {why ? (
            <div className={`${s.whyBody} ${mp.whyBody}`} data-host-why={table.table}>
              {table.why}
              {hostPlaced.map((member) => <span key={member.participantId} className={m.hostPlaced}><b>{member.name}</b> · {t("mWhyHost")}</span>)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** 选目标桌（手机 = 底部抽屉；`wide` = 同内容的居中弹层，768 以上用）。 */
export function MovePicker({ moving, tables, round, t, onPick, onClose, wide = false }: { moving: Moving; tables: readonly HostMatchingTable[]; round: number; t: HostT; onPick: (to: string | null) => void; onClose: () => void; wide?: boolean }) {
  if (wide) return <Modal open onClose={onClose} title={t("mMoveTitle", { name: moving.member.name })} size={480}><div className={mp.wide}><MoveSheetBody moving={moving} tables={tables} round={round} t={t} onPick={onPick} onClose={onClose} /></div></Modal>;
  return <MoveSheet moving={moving} tables={tables} round={round} t={t} onPick={onPick} onClose={onClose} />;
}

function MoveSheet({ moving, tables, round, t, onPick, onClose }: { moving: Moving; tables: readonly HostMatchingTable[]; round: number; t: HostT; onPick: (to: string | null) => void; onClose: () => void }) {
  return (
    <BottomSheet open onClose={onClose} label={t("mMoveTitle", { name: moving.member.name })} className={mp.sheet}>
      <MoveSheetBody moving={moving} tables={tables} round={round} t={t} onPick={onPick} onClose={onClose} />
    </BottomSheet>
  );
}

function MoveSheetBody({ moving, tables, round, t, onPick, onClose }: { moving: Moving; tables: readonly HostMatchingTable[]; round: number; t: HostT; onPick: (to: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = tables.filter((table) => !needle || table.table.toLowerCase() === needle || (table.theme ?? "").toLowerCase().includes(needle) || table.members.some((member) => member.name.toLowerCase().includes(needle)));
  return (
    <>
      <div className={mp.sh}>
        <Avatar name={moving.member.name} />
        <div className={mp.meta}><b className={mp.shT}>{t("mMoveTitle", { name: moving.member.name })}</b><span className={s.lbl}>{moving.from ? t("mMoveFrom", { n: round, t: moving.from }) : t("mMoveFromNone", { n: round })}</span></div>
        <button type="button" className={`btn ${mp.x}`} aria-label={t("close")} onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <label className={mp.search}><Icon name="search" size={16} /><input value={q} placeholder={t("mSearchTable")} aria-label={t("mSearchTable")} onChange={(event) => setQ(event.target.value)} /></label>
      <div className={mp.sb} data-host-move-list="">
        {list.map((table) => {
          const current = table.table === moving.from;
          const n = table.members.length;
          const standings = [...new Set(table.members.map((member) => member.standing).filter(Boolean))].slice(0, 3).join(t("listSep"));
          return (
            <button key={table.table} type="button" className={`btn ${mp.tpick} ${current ? mp.cur : ""}`} disabled={current} onClick={() => onPick(table.table)} data-host-move-to={table.table}>
              <span className={`${mp.tno} ${mp.tnoSm}`}>{table.table}</span>
              <span className={mp.meta}><b>{table.theme ?? t("mTableN", { n, t: table.table })}</b><span className={s.lbl}>{current ? t("mCurTable") : table.absent ? t("mAbsent", { n: table.absent }) : standings}</span></span>
              <span className={mp.tcnt}>{current ? t("nPeople", { n }) : t("mCountTo", { a: n, b: n + 1 })}</span>
            </button>
          );
        })}
      </div>
      {moving.from ? <div className={mp.sf}><button type="button" className={`btn ${s.btn}`} onClick={() => onPick(null)} data-host-move-to="unplaced"><Icon name="layers" size={16} />{t("mToUnplaced")}</button></div> : null}
    </>
  );
}

function ConditionsSheet({ initial, t, remaining, regenerate, busy, onClose, onApply }: { initial: HostMatchingConditions; t: HostT; remaining: number; regenerate: boolean; busy: boolean; onClose: () => void; onApply: (next: HostMatchingConditions) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <BottomSheet open onClose={onClose} label={t("mCondTitle")}>
      <b className={mp.shT}>{t("mCondTitle")}</b>
      <div className={`${mp.crow} ${mp.crowCol}`}><span>{t("cTableSize")}</span><Options values={[3, 4, 5, 6, 7, 8]} value={draft.tableSize} label={t("cTableSize")} render={(n) => t("nPeople", { n })} onChange={(n) => setDraft({ ...draft, tableSize: n })} /></div>
      <div className={`${mp.crow} ${mp.crowCol}`}><span>{t("cRounds")}</span><Options values={[1, 2, 3]} value={draft.roundCount} label={t("cRounds")} render={String} onChange={(n) => setDraft({ ...draft, roundCount: n })} /></div>
      <div className={mp.toggles}><ConditionRowsToggles conditions={draft} t={t} onChange={setDraft} /></div>
      {regenerate ? <div className={`${s.lbl} ${mp.hint}`}>{t("mRulesNote", { n: remaining })}</div> : null}
      <div className={mp.grid2}>
        <button type="button" className={`btn ${s.btn}`} onClick={onClose}>{t("cancel")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy || (regenerate && remaining <= 0)} onClick={() => onApply(draft)}>{regenerate ? t("mApply") : t("mSaveRules")}</button>
      </div>
    </BottomSheet>
  );
}

export type HostMatchingPhoneProps = HostMatchingViewProps & {
  onMoveTo?: (member: HostMatchingMember, from: string | null, to: string | null) => void;
  onApplyConditions?: (next: HostMatchingConditions) => void;
  conditionsOpen?: boolean;
  onConditionsOpen?: (open: boolean) => void;
};

export function HostMatchingPhone(props: HostMatchingPhoneProps) {
  const { data, t, busy = false } = props;
  const conditions = props.conditions ?? data.conditions;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(data.tables[0] ? [data.tables[0].table] : []));
  const [why, setWhy] = useState<ReadonlySet<string>>(new Set());
  const [moving, setMoving] = useState<Moving | null>(null);
  const remaining = Math.max(0, data.generationsLimit - data.generationsUsed);
  const tables = useMemo(() => data.tables.filter((table) => table.round === data.round || data.tables.every((item) => item.round !== data.round)), [data.tables, data.round]);
  const tones = useMemo(() => standingToneMap(tables), [tables]);
  const toggle = (set: ReadonlySet<string>, key: string) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; };
  const condSheet = props.conditionsOpen ? (
    <ConditionsSheet initial={conditions} t={t} remaining={remaining} regenerate={data.state !== "none"} busy={busy} onClose={() => props.onConditionsOpen?.(false)} onApply={(next) => props.onApplyConditions?.(next)} />
  ) : null;

  if (data.state === "none") {
    const enough = data.applied >= data.minimumApplied;
    const missing = Math.max(0, data.applied - data.profileComplete);
    const disabled = busy || !enough || data.generationsUsed >= data.generationsLimit;
    return (
      <div className={mp.col} data-host-matching="none" data-host-matching-phone="">
        <div className={`${s.guide} ${mp.guide}`}>
          <div className={mp.gHead}>
            <span className={`${s.emo} ${s.e_lav}`}>🪑</span>
            <div><div className={mp.gT}>{t("mEmptyTitle")}</div><div className={`${s.sub} ${mp.gS}`}>{t("mEmptySub")}</div></div>
          </div>
          <div className={mp.checks}>
            <div className={s.chk}><span className={`${s.box} ${enough ? m.boxOk : m.boxNo}`}>{enough ? <Icon name="check" size={16} /> : null}</span><div className={s.grow}><b>{t("mApplied", { n: data.applied })}</b><span>{enough ? t("mAppliedOk", { m: data.minimumApplied }) : t("mAppliedShort", { k: data.minimumApplied - data.applied, m: data.minimumApplied })}</span></div></div>
            <div className={s.chk}>
              <span className={`${s.box} ${missing === 0 ? m.boxOk : m.boxNo}`}>{missing === 0 ? <Icon name="check" size={16} /> : null}</span>
              <div className={s.grow}><b>{t("mProfile", { a: data.profileComplete, n: data.applied })}</b><span>{missing ? t("mProfileSub", { k: missing }) : t("mProfileAll")}</span></div>
              {missing ? <a className={`btn ${s.btn} ${s.sm}`} href={`${consoleHref(data.event.eventId, "overview")}&notice=profile_incomplete`}>{t("mRemind")}</a> : null}
            </div>
            <div className={s.chk}><span className={`${s.box} ${m.boxOk}`}><Icon name="check" size={16} /></span><div className={s.grow}><b>{t("mCondCheck")}</b><span>{t("mCondCheckSub")}</span></div></div>
          </div>
        </div>
        <div className={`${s.card} ${mp.card}`} data-host-conditions="">
          <h3 className={mp.cardH}>{t("mCondTitle")}</h3>
          <button type="button" className={`btn ${mp.crow} ${mp.crowBtn}`} onClick={() => props.onConditionsOpen?.(true)}><span>{t("cTableSize")}</span><span className={s.chip}>{t("nPeople", { n: conditions.tableSize })}</span></button>
          <button type="button" className={`btn ${mp.crow} ${mp.crowBtn}`} onClick={() => props.onConditionsOpen?.(true)}><span>{t("cRounds")}</span><span className={s.chip}>{conditions.roundCount}</span></button>
          <div className={mp.toggles}><ConditionRowsToggles conditions={conditions} t={t} onChange={(next) => props.onConditions?.(next)} /></div>
        </div>
        <div className={mp.foot}>
          <div className={`${s.lbl} ${mp.footNote}`}>{t("mGenerateNote", { n: data.generationsLimit })}</div>
          <button type="button" className={`btn ${s.btn} ${s.primary} ${mp.xl}`} disabled={disabled} onClick={props.onGenerate} data-host-generate=""><Icon name="sparkle" size={16} />{t("mGenerate")}</button>
        </div>
        {condSheet}
      </div>
    );
  }
  if (data.state === "generating") {
    return (
      <div className={mp.col} data-host-matching="generating" data-host-matching-phone="" aria-live="polite">
        <div className={`${s.guide} ${mp.guide}`}>
          <div className={mp.gHead}>
            <span className={`${s.emo} ${s.e_lav}`}>🪑</span>
            <div><div className={mp.gT}>{t("mGenerating")}</div><div className={`${s.sub} ${mp.gS}`}>{t("mGeneratingSub")}</div></div>
          </div>
        </div>
        {[0, 1, 2].map((key) => <div key={key} className={mp.shim} aria-hidden />)}
      </div>
    );
  }

  const published = data.state === "published";
  const canMove = !published && Boolean(data.generationId) && !busy;
  const rounds = data.rounds.length ? data.rounds : [{ endsAt: "", index: 1, startsAt: "" }];
  const jump = (table: string) => {
    setOpen((prev) => new Set([...prev, table]));
    requestAnimationFrame(() => document.getElementById(`host-table-${table}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <div className={mp.col} data-host-matching={data.state} data-host-matching-phone="">
      <div className={`${s.card} ${mp.mstat}`}>
        <div className={mp.hscroll}>
          <div className={s.seg} role="tablist" aria-label={t("mRoundsLabel")}>
            {rounds.map((round) => <button key={round.index} type="button" role="tab" aria-selected={round.index === data.round} className={`btn ${s.segBtn} ${round.index === data.round ? s.segOn : ""}`} onClick={() => props.onRound?.(round.index)}>{round.startsAt ? t("mRound", { from: hostTime(round.startsAt), n: round.index, to: hostTime(round.endsAt) }) : t("mRoundShort", { n: round.index })}</button>)}
          </div>
        </div>
        <div className={mp.statRow}>
          <span className={`${s.chip} ${published ? s.c_teal : s.c_apricot}`}>{published ? t("mPublishedChip") : t("mDraftChip")}</span>
          <span className={s.lbl}>{t("mStats", { p: data.participantCount, size: tableSizeText(data.tableSizeMin, data.tableSizeMax), t: data.tableCount })}</span>
        </div>
        <div className={mp.chips}>
          {data.conditions.separateCompanies ? <span className={s.chip}>{t("cSeparate")}</span> : null}
          {data.conditions.avoidPreviousTablemates ? <span className={s.chip}>{t("chipAvoid")}</span> : null}
          {data.conditions.investorPerTable ? <span className={s.chip}>{t("chipInvestor")}</span> : null}
          {data.unsatisfiedTables > 0 ? <span className={`${s.chip} ${s.c_coral}`}>{t("chipUnsatisfied", { n: data.unsatisfiedTables })}</span> : null}
          {data.unplaced.length > 0 && !published ? <span className={`${s.chip} ${s.c_coral}`}>{t("chipUnplaced", { n: data.unplaced.length })}</span> : null}
        </div>
        <div className={mp.acts}>
          <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => props.onConditionsOpen?.(true)} data-host-cond-open=""><Icon name="sliders" size={16} />{t("mCond")}</button>
          <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={busy || remaining <= 0 || published} onClick={props.onRegenerate} data-host-regen=""><Icon name="refresh" size={16} />{t("mRegen")}<span className={`${s.lbl} ${m.remain}`}>{t("mRemaining", { n: remaining })}</span></button>
        </div>
        <div className={`${mp.hscroll} ${mp.tjump}`} data-host-table-jump="">
          {tables.map((table) => <button key={table.table} type="button" className={`btn ${mp.tno} ${mp.tjBtn} ${table.absent ? mp.tnoWarn : ""}`} aria-label={t("mJump", { t: table.table })} onClick={() => jump(table.table)}>{table.table}</button>)}
        </div>
      </div>
      {data.unplaced.length && !published ? (
        <div className={`${s.card} ${s.flat} ${mp.unpl}`} data-host-unplaced={data.unplaced.length}>
          <div className={mp.unplHead}><span className={`${s.emo} ${s.e_apricot}`}>🧩</span><div className={s.grow}><b>{t("mUnplacedTitle", { n: data.unplaced.length })}</b><div className={`${s.lbl} ${mp.unplSub}`}>{t("mUnplacedSub")}</div></div></div>
          <div className={mp.unplRow}>
            <span className={mp.avs}>{data.unplaced.slice(0, 4).map((member) => <button key={member.participantId} type="button" className={`btn ${mp.avBtn}`} disabled={!canMove} aria-label={t("mMoveTitle", { name: member.name })} onClick={() => setMoving({ from: null, member })}><Avatar name={member.name} size="sm" /></button>)}</span>
            <span className={`${s.lbl} ${mp.names}`}>{data.unplaced.map((member) => member.name.split(/\s+/u)[0]).join(t("listSep"))}</span>
            <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} disabled={!canMove} onClick={props.onFillSeats}>{t("mFillSeats")}</button>
          </div>
        </div>
      ) : null}
      {tables.map((table) => (
        <TableRow key={`${table.round}-${table.table}`} table={table} t={t} tones={tones} open={open.has(table.table)} why={why.has(table.table)} canMove={canMove}
          onToggle={() => setOpen((prev) => toggle(prev, table.table))} onWhy={() => setWhy((prev) => toggle(prev, table.table))}
          onMove={(member) => setMoving({ from: table.table, member })} />
      ))}
      {published ? null : (
        <div className={mp.foot}>
          <button type="button" className={`btn ${s.btn} ${s.primary} ${mp.xl}`} disabled={busy || !data.generationId} onClick={props.onPublish} data-host-publish=""><Icon name="share" size={16} />{t("aPublish")}</button>
        </div>
      )}
      {moving ? <MoveSheet moving={moving} tables={tables} round={data.round} t={t} onClose={() => setMoving(null)} onPick={(to) => { const target = moving; setMoving(null); props.onMoveTo?.(target.member, target.from, to); }} /> : null}
      {condSheet}
    </div>
  );
}
