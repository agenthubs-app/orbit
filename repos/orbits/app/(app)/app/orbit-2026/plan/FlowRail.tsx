"use client";

import { useState } from "react";

import type { PlanDraftView } from "../../../../../shared/contract/plan-v2";
import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { Icon } from "../ui";
import { StepsMini, draftName } from "./DraftCard";
import { RailHead } from "./FlowParts";
import { changedStepIndexes, type FlowSummaryRow } from "./plan-model";
import type { Translate } from "./PlanParts";
import k from "./FlowKit.module.css";

const ROW_LABEL: Record<FlowSummaryRow["key"], OrbitCopyEntry> = {
  gaps: planFlowCopy.railGaps,
  me: planFlowCopy.railMe,
  premise: planFlowCopy.railPremise,
  purpose: planFlowCopy.railPurpose,
  setup: planFlowCopy.railSetup,
  wants: planFlowCopy.railWants,
};

// b12 knownPending: the shimmer bars' lengths per row.
const SHIM_WIDTHS = [70, 52, 64, 80, 58];

const NEXT: readonly (readonly [OrbitCopyEntry, OrbitCopyEntry])[] = [
  [planFlowCopy.railNext1, planFlowCopy.railNext1Body],
  [planFlowCopy.railNext2, planFlowCopy.railNext2Body],
  [planFlowCopy.railNext3, planFlowCopy.railNext3Body],
  [planFlowCopy.railNext4, planFlowCopy.railNext4Body],
];

function NextCard({ t }: { t: Translate }) {
  return (
    <>
      <RailHead>{t(planFlowCopy.railNext)}</RailHead>
      <div className={`${k.card} ${k.flat} ${k.nextCard}`}>
        <dl className={k.known}>{NEXT.map(([title, body]) => <div key={title.en}><dt className={k.lbl}>{t(title)}</dt><dd>{t(body)}</dd></div>)}</dl>
      </div>
    </>
  );
}

/**
 * Right rail before the draft (b10 knownRail): 「わかったこと」 as a two-column card (目的 and
 * answered premises in lavender) + 「このあと」. `pending` = shimmer rows while drafting (b12 W-R23-03).
 */
export function KnownRail({ rows, t, pending }: { rows: readonly FlowSummaryRow[]; t: Translate; pending?: boolean }) {
  return (
    <div className={k.rail} data-plan-rail="known">
      <RailHead icon="layers">{t(planFlowCopy.railKnown)}</RailHead>
      <div className={`${k.card} ${k.knownCard}`}>
        <dl className={k.known}>
          {rows.map((row, index) => {
            if (row.key === "premise") {
              return row.items?.length
                ? row.items.map((item) => <div key={`p:${item.label}`} data-rail-row="premise"><dt className={k.lbl}>{item.label}</dt><dd><b className={k.nw2}>{item.value}</b></dd></div>)
                : <div key="premise" data-rail-row="premise"><dt className={k.lbl}>{t(ROW_LABEL.premise)}</dt><dd className={k.pending}>{t(planFlowCopy.railPremisePending)}</dd></div>;
            }
            return (
              <div key={row.key} data-rail-row={row.key}>
                <dt className={k.lbl}>{t(ROW_LABEL[row.key])}</dt>
                <dd>{pending ? <span className={k.shimWrap}><i className={k.shim} style={{ width: `${SHIM_WIDTHS[index] ?? 60}%` }} /></span> : row.key === "purpose" && row.value ? <b className={k.nw2}>{row.value}</b> : row.value ?? "—"}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      <NextCard t={t} />
    </div>
  );
}

/**
 * Right rail with a draft (b10 reviseRail): 「AI 修正」 — the big number left, three bars, the
 * input with send; 「方案の下書き」 once a revision is used; 手動で編集 / この内容で確定.
 */
export function DraftRail({ draft, t, busy, onFix, onManual, onConfirm, offMessage, onPremise }: {
  draft: PlanDraftView;
  t: Translate;
  busy: string | null;
  onFix: (text: string) => Promise<boolean>;
  onManual: () => void;
  /** After a revision: the way back to the premises (b12 W-R23-15; changing one discards the revisions, asked first). */
  onPremise?: () => void;
  onConfirm: () => void;
  /** AI limit (b12 W-R23-16c): the input is off with this message, the count is not used. */
  offMessage?: string;
}) {
  const [text, setText] = useState("");
  const left = Math.max(0, draft.aiFixLimit - draft.aiFixUsed);
  const usedUp = left === 0;
  const off = usedUp || Boolean(offMessage);
  const changed = changedStepIndexes(draft);
  const send = async () => {
    const value = text.trim();
    if (!value || off || busy) return;
    if (await onFix(value)) setText("");
  };
  const changeCount = draft.turns.reduce((sum, turn) => sum + turn.changes.length, 0);
  return (
    <div className={k.rail} data-plan-rail="draft">
      <RailHead icon="refresh">{t(planFlowCopy.stageFix)}</RailHead>
      <div className={`${k.card} ${k.revCard}`} data-plan-fixbar="" data-left={left}>
        <div className={k.revbig}><span className={k.lbl}>{t(planFlowCopy.fixLeftWord)}</span><em className={usedUp ? k.zero : undefined} data-plan-fix-left="">{left}</em><span className={k.lbl}>{t(planFlowCopy.fixLeftAfter, { limit: draft.aiFixLimit })}</span></div>
        <div className={k.dots3} aria-hidden>{Array.from({ length: draft.aiFixLimit }, (_, index) => <i key={index} className={index >= left ? k.used : undefined} />)}</div>
        <div className={k.revTip} data-plan-fix-usedup={usedUp ? "" : undefined}>{t(usedUp ? planFlowCopy.fixUsedUp : planFlowCopy.fixTip)}</div>
        <div className={`${k.lbl} ${k.revEx}`}>{t(usedUp ? planFlowCopy.fixCountsNote : planFlowCopy.fixExample)}</div>
        <label className={`${k.assistIn} ${off ? k.assistOff : ""}`}>
          <Icon name="pen" size={16} />
          <textarea rows={1} aria-label={t(planFlowCopy.fixPlaceholder)} placeholder={usedUp ? t(planFlowCopy.fixUsedUpPlaceholder) : offMessage ?? t(planFlowCopy.fixPlaceholder)} value={text} maxLength={1000} disabled={off || Boolean(busy)}
            onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send(); }} />
          <button type="button" className={`btn ${k.lbtn} ${k.sendBtn}`} aria-label={t(planFlowCopy.fixSend)} disabled={off || !text.trim() || Boolean(busy)} aria-busy={busy === "fix" || undefined} onClick={() => void send()}><Icon name="send" size={16} /></button>
        </label>
      </div>
      {draft.turns.length ? (
        <>
          <RailHead icon="layers">{t(planFlowCopy.railDraft)}</RailHead>
          <div className={`${k.card} ${k.draftMini}`}>
            <div className={`${k.row} ${k.between}`}><b>{draftName(draft)}</b><span className={`${k.chip} ${left ? k.chipLav : ""}`}>{t(planFlowCopy.fixLeftChip, { n: left })}</span></div>
            <StepsMini content={draft.content} t={t} highlight={usedUp ? undefined : changed} />
            <div className={`${k.lbl} ${k.draftMiniNote}`}>{usedUp ? t(planFlowCopy.draftMiniUsed, { m: changeCount, n: draft.aiFixUsed }) : t(planFlowCopy.draftMiniNote)}</div>
          </div>
        </>
      ) : null}
      <div className={k.grid2}>
        <button type="button" className={`btn ${k.btn}`} disabled={!draft.manualEditAvailable || Boolean(busy)} onClick={onManual}><Icon name="edit" size={16} />{t(planFlowCopy.manualEdit)}</button>
        <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={Boolean(busy)} aria-busy={busy === "confirm" || undefined} onClick={onConfirm}>{t(planFlowCopy.confirmPlan)}</button>
      </div>
      <div className={`${k.card} ${k.flat} ${k.railNote}`}>
        {t(planFlowCopy.fixRailNote)}
        {onPremise ? <button type="button" className={`btn ${k.v2go} ${k.v2goGap}`} onClick={onPremise} data-plan-premise-open="">{t(planFlowCopy.editPremise)}<Icon name="right" size={16} /></button> : null}
      </div>
    </div>
  );
}
