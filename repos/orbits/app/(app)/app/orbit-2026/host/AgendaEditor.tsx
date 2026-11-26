"use client";

// 议程卡（2026-11-15，docs/designs/redesign-2026-10/event-detail-agenda-proposal.html ③ ④ ⑤）：新建活动 / 基本情報を編集 / 申込設定共用。
// 每行：拖动手柄 + 时间（HH:MM，必填）+ 标题（必填，≤60 字）+ ×；「＋ 添加说明」后出现说明（≤120 字）。最多 40 行，至少留 1 行。
// 顺序按主办方排的（不自动按时间排）。时间早于开始 / 晚于结束只出红字提示，不挡保存；缺时间 / 标题只在要公开或保存时（`showMissing`）出红字。
// 活动结束后只读：没有手柄、×、添加按钮，上面一行灰字。
import { useState, type DragEvent, type KeyboardEvent } from "react";

import { AGENDA_DETAIL_MAX, AGENDA_MAX_ROWS, AGENDA_TITLE_MAX, agendaRowChecks, blankAgendaRow, type AgendaDraftRow } from "../../../../../shared/compute/host-agenda";
import { Icon } from "../ui";
import type { HostT } from "./host-model";
import { ReorderList } from "./ReorderList";
import s from "./host.module.css";
import a from "./agenda.module.css";

const isBlank = (row: AgendaDraftRow) => !row.at.trim() && !row.title.trim() && !row.detail.trim();

/** 要公开 / 保存时每行要出的红字（缺时间 / 缺标题）。全空的行不算（保存时丢掉），但一行完整的都没有时第一行要填。 */
export function agendaMissing(rows: readonly AgendaDraftRow[]): Array<"time" | "title" | null> {
  const checks = agendaRowChecks(rows, null, null);
  const result = rows.map((row, index): "time" | "title" | null => {
    if (isBlank(row)) return null;
    const problem = checks[index]!.problem;
    return problem === "time" ? "time" : problem === "title" ? "title" : null;
  });
  const complete = rows.filter((row, index) => !isBlank(row) && checks[index]!.problem === null).length;
  if (complete === 0 && rows.length && result.every((item) => item === null)) result[0] = "time";
  return result;
}

/** 第一处要填的地方（[行, 字段]）；没有 → null。 */
export function firstAgendaMissing(rows: readonly AgendaDraftRow[]): [number, "time" | "title"] | null {
  const missing = agendaMissing(rows);
  const index = missing.findIndex(Boolean);
  return index >= 0 ? [index, missing[index]!] : null;
}

/** 聚焦到第一处要填的地方并滚过去（「前往公开」/「保存议程」被挡时）。 */
export function focusAgendaMissing(root: ParentNode | null, rows: readonly AgendaDraftRow[]): void {
  const first = firstAgendaMissing(rows);
  if (!first || !root) return;
  const input = root.querySelector<HTMLInputElement>(`[data-agenda-row="${first[0]}"] [data-agenda-field="${first[1]}"]`);
  input?.scrollIntoView({ behavior: "smooth", block: "center" });
  input?.focus({ preventScroll: true });
}

export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return [...rows];
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export type AgendaEditorProps = {
  rows: readonly AgendaDraftRow[];
  t: HostT;
  /** 活动的东京时间 HH:MM（超出时提示用）；没有就不提示。 */
  start: string | null;
  end: string | null;
  /** 新建活动：标题带 *。 */
  required?: boolean;
  /** 已按过「前往公开 / 保存议程」：缺时间 / 标题的行出红字。 */
  showMissing?: boolean;
  /** 活动已结束：只读。 */
  readOnly?: boolean;
  /** 申込設定：还没有议程时顶部一行红字。 */
  noneSaved?: boolean;
  disabled?: boolean;
  /** < 768（b13 HM-S7）：一行 = 时刻 + 标题 + ×，没有说明栏与拖拽手柄；「行を追加 / 並べ替え / N / 40行」放在卡片下面。 */
  phone?: { reordering: boolean; onReorder: () => void };
  onChange?: (rows: AgendaDraftRow[]) => void;
};

export function AgendaEditor({ rows, t, start, end, required = false, showMissing = false, readOnly = false, noneSaved = false, disabled = false, phone, onChange }: AgendaEditorProps) {
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  const list = rows.length ? rows : [blankAgendaRow()];
  const checks = agendaRowChecks(list, start, end);
  const missing = showMissing ? agendaMissing(list) : list.map(() => null);
  const title = t(required ? "evAgendaReq" : "evAgenda");
  if (readOnly) {
    const saved = rows.filter((row) => !isBlank(row));
    return (
      <div className={`${s.card} ${a.card}`} data-host-agenda="readonly">
        <div className={s.cardH}><h3>{t("evAgenda")}</h3><span className={s.lbl}>{t("evAgendaRows", { n: saved.length })}</span></div>
        <div className={a.lock} data-host-agenda-locked="">{t("evAgendaLocked")}</div>
        {saved.map((row, index) => (
          <div key={index} className={`${a.row} ${a.ro}`}><span className={a.roTime}>{row.at}</span><span className={a.roTitle}>{row.title}{row.detail ? <small>{row.detail}</small> : null}</span></div>
        ))}
      </div>
    );
  }
  const update = (index: number, patch: Partial<AgendaDraftRow>) => onChange?.(list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index: number) => {
    if (list.length <= 1) return;
    onChange?.(list.filter((_, i) => i !== index));
    setOpened((current) => new Set([...current].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return;
    onChange?.(moveRow(list, from, to));
    setOpened((current) => new Set([...current].map((i) => (i === from ? to : from < to && i > from && i <= to ? i - 1 : from > to && i >= to && i < from ? i + 1 : i))));
  };
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowUp") { event.preventDefault(); move(index, index - 1); }
    if (event.key === "ArrowDown") { event.preventDefault(); move(index, index + 1); }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (dragFrom !== null) move(dragFrom, index);
    setDragFrom(null);
  };
  if (phone?.reordering && list.length > 1) {
    return (
      <>
        <div className={`${s.card} ${a.pCard} ${a.pReo}`} data-host-agenda={list.length} data-host-agenda-reorder="">
          <ReorderList items={list} t={t} keyOf={(_, index) => `${index}`} labelOf={(row, index) => row.title || row.at || String(index + 1)} onMove={move}
            render={(row) => <><span className={a.pReoTime}>{row.at || "--:--"}</span><span className={a.pReoName}>{row.title || t("evAgendaTitlePh")}</span></>} />
        </div>
        <div className={`${s.lbl} ${a.pReoNote}`}>{t("roNoteAgenda")}</div>
      </>
    );
  }
  if (reordering && list.length > 1) {
    // 触屏没法拖：並べ替え モード（b13 HM-S7b），每行 ↑ ↓；时间不随顺序自动改。
    return (
      <div className={`${s.card} ${a.card}`} data-host-agenda={list.length} data-host-agenda-reorder="">
        <div className={s.cardH}><h3>{t("roTitleAgenda")}</h3><button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} onClick={() => setReordering(false)} data-host-reorder-done="">{t("roDone")}</button></div>
        <ReorderList items={list} t={t} keyOf={(_, index) => `${index}`} labelOf={(row, index) => row.title || row.at || String(index + 1)} onMove={move} note={t("roNoteAgenda")}
          render={(row) => <><span className={a.roChip}>{row.at || "--:--"}</span><b className={a.roName}>{row.title || t("evAgendaTitlePh")}</b></>} />
      </div>
    );
  }
  if (phone) {
    return (
      <div data-host-agenda={list.length} data-host-agenda-phone="">
        {noneSaved ? <div className={a.none} role="note" data-host-agenda-none="">{t("evAgendaNone")}</div> : null}
        <fieldset className={`${s.card} ${a.pCard}`} disabled={disabled}>
          {list.map((row, index) => {
            const need = missing[index];
            const range = checks[index]!.range;
            return (
              <div key={index} className={a.pRow} data-agenda-row={index}>
                <div className={a.pLine}>
                  <input className={`${a.pTime} ${need === "time" ? a.bad : ""}`} type="time" value={row.at} aria-label={t("evAgendaTime")} aria-invalid={need === "time" || undefined} data-agenda-field="time" onChange={(event) => update(index, { at: event.target.value })} />
                  <input className={`${a.pTitle} ${need === "title" ? a.bad : ""}`} value={row.title} maxLength={AGENDA_TITLE_MAX} placeholder={t("evAgendaTitlePh")} aria-label={t("evAgendaTitlePh")} aria-invalid={need === "title" || undefined} data-agenda-field="title" onChange={(event) => update(index, { title: event.target.value })} />
                  <button type="button" className={`btn ${a.x} ${a.pX}`} aria-label={t("evAgendaRemove")} disabled={list.length <= 1} onClick={() => remove(index)}><Icon name="x" size={16} /></button>
                </div>
                {need ? <span className={a.err} role="alert" data-agenda-missing={need}>{t(need === "time" ? "evAgendaNeedTime" : "evAgendaNeedTitle")}</span>
                  : range ? <span className={a.err} data-agenda-range={range}>{range === "afterEnd" ? t("evAgendaAfterEnd", { t: end ?? "" }) : t("evAgendaBeforeStart", { t: start ?? "" })}</span> : null}
              </div>
            );
          })}
        </fieldset>
        <div className={a.pAdds}>
          <button type="button" className={`btn ${a.add}`} disabled={disabled || list.length >= AGENDA_MAX_ROWS} onClick={() => onChange?.([...list, blankAgendaRow()])} data-agenda-add-row="">{t("evAgendaAddRow")}</button>
          {list.length > 1 ? <button type="button" className={`btn ${a.add} ${a.ghost}`} disabled={disabled} onClick={phone.onReorder} data-host-reorder="">{t("roReorder")}</button> : null}
          <span className={`${s.lbl} ${a.pCount}`}>{t("evAgendaRowsOf", { n: list.length, max: AGENDA_MAX_ROWS })}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`${s.card} ${a.card}`} data-host-agenda={list.length}>
      <div className={s.cardH}><h3>{title}</h3><span className={s.lbl}>{t("evAgendaCount", { n: list.length })}</span></div>
      {noneSaved ? <div className={a.none} role="note" data-host-agenda-none="">{t("evAgendaNone")}</div> : null}
      <fieldset className={a.fs} disabled={disabled}>
        {list.map((row, index) => {
          const need = missing[index];
          const range = checks[index]!.range;
          const showDetail = opened.has(index) || Boolean(row.detail);
          return (
            <div key={index} className={`${a.row} ${dragFrom === index ? a.dragging : ""}`} data-agenda-row={index}
              onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, index)}>
              <button type="button" className={`btn ${a.handle}`} draggable aria-label={t("evAgendaDrag")} title={t("evAgendaDrag")}
                onDragStart={(event) => { setDragFrom(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
                onDragEnd={() => setDragFrom(null)} onKeyDown={(event) => onHandleKey(event, index)}>⋮⋮</button>
              <input className={`${a.time} ${need === "time" ? a.bad : ""}`} type="time" value={row.at} aria-label={t("evAgendaTime")} aria-invalid={need === "time" || undefined} data-agenda-field="time" onChange={(event) => update(index, { at: event.target.value })} />
              <input className={`${a.title} ${need === "title" ? a.bad : ""}`} value={row.title} maxLength={AGENDA_TITLE_MAX} placeholder={t("evAgendaTitlePh")} aria-label={t("evAgendaTitlePh")} aria-invalid={need === "title" || undefined} data-agenda-field="title" onChange={(event) => update(index, { title: event.target.value })} />
              <button type="button" className={`btn ${a.x}`} aria-label={t("evAgendaRemove")} disabled={list.length <= 1} onClick={() => remove(index)}>×</button>
              {showDetail ? <input className={a.detail} value={row.detail} maxLength={AGENDA_DETAIL_MAX} placeholder={t("evAgendaDetailPh")} aria-label={t("evAgendaDetailPh")} data-agenda-field="detail" onChange={(event) => update(index, { detail: event.target.value })} />
                : <button type="button" className={`btn ${a.addDetail}`} onClick={() => setOpened((current) => new Set([...current, index]))} data-agenda-add-detail="">{t("evAgendaAddDetail")}</button>}
              {need ? <span className={a.err} role="alert" data-agenda-missing={need}>{t(need === "time" ? "evAgendaNeedTime" : "evAgendaNeedTitle")}</span>
                : range ? <span className={a.err} data-agenda-range={range}>{range === "afterEnd" ? t("evAgendaAfterEnd", { t: end ?? "" }) : t("evAgendaBeforeStart", { t: start ?? "" })}</span> : null}
            </div>
          );
        })}
        <div className={a.adds}>
          <button type="button" className={`btn ${a.add}`} disabled={list.length >= AGENDA_MAX_ROWS} onClick={() => onChange?.([...list, blankAgendaRow()])} data-agenda-add-row="">{t("evAgendaAddRow")}</button>
          {list.length > 1 ? <button type="button" className={`btn ${a.add}`} onClick={() => setReordering(true)} data-host-reorder="">{t("roReorder")}</button> : null}
        </div>
      </fieldset>
    </div>
  );
}

/** 预览（报名页的样子）：议程前 3 行 +「还有 N 项」。 */
export function AgendaPreview({ rows, t }: { rows: readonly AgendaDraftRow[]; t: HostT }) {
  const filled = rows.filter((row) => row.at.trim() && row.title.trim());
  if (!filled.length) return null;
  return (
    <div className={a.pv} data-host-agenda-preview={filled.length}>
      <b className={a.pvH}>{t("evAgenda")}</b>
      <div className={a.pvGrid}>
        {filled.slice(0, 3).map((row, index) => <div key={index} className={a.pvRow}><span className={a.pvTime}>{row.at}</span><span className={a.pvTitle}>{row.title}</span></div>)}
        {filled.length > 3 ? <div className={a.pvRow}><span className={a.pvMore}>…</span><span className={a.pvMore}>{t("evAgendaMore", { n: filled.length - 3 })}</span></div> : null}
      </div>
    </div>
  );
}
