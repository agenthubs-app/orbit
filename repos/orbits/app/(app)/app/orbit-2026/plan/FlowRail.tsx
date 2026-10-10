"use client";

import type { PlanDraftView } from "../../../../../shared/contract/plan-v2";
import { planFlowCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { Chip } from "../ui";
import { changedStepIndexes, type FlowSummaryRow } from "./plan-model";
import type { Translate } from "./PlanParts";
import styles from "./plan.module.css";

const ROW_LABEL: Record<FlowSummaryRow["key"], OrbitCopyEntry> = {
  gaps: planFlowCopy.railGaps,
  me: planFlowCopy.railMe,
  premise: planFlowCopy.railPremise,
  purpose: planFlowCopy.railPurpose,
  setup: planFlowCopy.railSetup,
  wants: planFlowCopy.railWants,
};

const NEXT: readonly (readonly [OrbitCopyEntry, OrbitCopyEntry])[] = [
  [planFlowCopy.railNext1, planFlowCopy.railNext1Body],
  [planFlowCopy.railNext2, planFlowCopy.railNext2Body],
  [planFlowCopy.railNext3, planFlowCopy.railNext3Body],
  [planFlowCopy.railNext4, planFlowCopy.railNext4Body],
];

/** Right rail before the draft: 「わかったこと」, summed up locally (no request) + 「このあと」. */
export function KnownRail({ rows, t }: { rows: readonly FlowSummaryRow[]; t: Translate }) {
  return (
    <div className={styles.rail} data-plan-rail="known">
      <b className={styles.railHead}>{t(planFlowCopy.railKnown)}</b>
      <dl className={styles.railRows}>
        {rows.map((row) => (
          <div key={row.key} data-rail-row={row.key}>
            <dt>{t(ROW_LABEL[row.key])}</dt>
            {row.key === "premise" ? (
              row.items?.length ? row.items.map((item) => <dd key={item.label}>{item.label}：{item.value}</dd>) : <dd className={styles.label}>{t(planFlowCopy.railPremisePending)}</dd>
            ) : <dd>{row.value ?? "—"}</dd>}
          </div>
        ))}
      </dl>
      <b className={styles.railHead}>{t(planFlowCopy.railNext)}</b>
      <ol className={styles.railNext}>
        {NEXT.map(([title, body]) => <li key={title.en}><b>{t(title)}</b><span className={styles.label}>{t(body)}</span></li>)}
      </ol>
    </div>
  );
}

/** Right rail after the draft: 「方案の下書き」 — step targets, this round's changes marked. */
export function DraftRail({ draft, t }: { draft: PlanDraftView; t: Translate }) {
  const changed = changedStepIndexes(draft);
  return (
    <div className={styles.rail} data-plan-rail="draft">
      <b className={styles.railHead}>{t(planFlowCopy.railDraft)}</b>
      <ol className={styles.railNext}>
        {draft.content.steps.map((step, index) => (
          <li key={step.key} className={changed.has(index) ? styles.changed : undefined}>
            <b>{index + 1}. {step.title}</b>
            {step.doneCriteria ? <span className={styles.label}>{t(planFlowCopy.doneCriteria, { text: step.doneCriteria })}</span> : null}
            {changed.has(index) ? <span><Chip label={t(planFlowCopy.railChanged)} tone="lav" /></span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
