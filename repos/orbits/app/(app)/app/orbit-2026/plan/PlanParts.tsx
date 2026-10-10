"use client";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planFlowCopy } from "../copy/plan";
import { pickCopy, type OrbitCopyEntry } from "../copy/types";
import { Button, ConfirmCard, Icon, fillCopy, useStandardCopy } from "../ui";
import { PLAN_FLOW_STAGES, type PlanErrorView, type PlanFlowStage } from "./plan-model";
import styles from "./plan.module.css";

export type Translate = (entry: OrbitCopyEntry, values?: Readonly<Record<string, string | number>>) => string;

export function translator(language: OrbitLanguage): Translate {
  return (entry, values) => (values ? fillCopy(pickCopy(entry, language), values) : pickCopy(entry, language));
}

const STAGE_SHORT: Record<PlanFlowStage, OrbitCopyEntry> = {
  background: planFlowCopy.progressShortBackground,
  questions: planFlowCopy.stageQuestions,
  draft: planFlowCopy.stageDraft,
  fix: planFlowCopy.stageFix,
  manual: planFlowCopy.stageManual,
};

export const STAGE_TITLE: Record<PlanFlowStage, OrbitCopyEntry> = {
  background: planFlowCopy.stageBackground,
  questions: planFlowCopy.stageQuestions,
  draft: planFlowCopy.stageDraft,
  fix: planFlowCopy.stageFix,
  manual: planFlowCopy.stageManual,
};

/** Top 5-step bar: 背景 / 質問 / 初版 / AI 修正 / 手動編集 (current one dark). */
export function FlowProgress({ stage, t }: { stage: PlanFlowStage; t: Translate }) {
  const current = PLAN_FLOW_STAGES.indexOf(stage);
  return (
    <ol className={styles.progress} aria-label={t(planFlowCopy.progressLabel)}>
      {PLAN_FLOW_STAGES.map((key, index) => (
        <li key={key} className={index === current ? styles.stepNow : index < current ? styles.stepDone : undefined} aria-current={index === current ? "step" : undefined}>
          {t(STAGE_SHORT[key])}
        </li>
      ))}
    </ol>
  );
}

/**
 * An API error in place (UI-SPEC 「常见错误原因 → 界面」): a limit is a quiet note, never a
 * failure card; a failure says what did not happen and offers もう一度 (a new key).
 */
export function PlanErrorNotice({ view, t, onRetry, onReload }: { view: PlanErrorView; t: Translate; onRetry?: () => void; onReload?: () => void }) {
  const copy = useStandardCopy();
  if (view.tone === "limit") {
    return <p role="status" className={styles.notice} data-plan-limit={view.limit}><Icon name="clock" size={16} />{t(view.limit === "monthly" ? planFlowCopy.limitMonthly : planFlowCopy.limitDaily)}</p>;
  }
  if (view.tone === "notice") {
    const text = view.notice === "goalsMonth" ? planFlowCopy.limitGoalsMonth : view.notice === "activeGoals" ? planFlowCopy.limitActiveGoals : view.notice === "stale" ? planFlowCopy.stale : planFlowCopy.manualUsed;
    return (
      <div role="status" className={`${styles.notice} ${styles.noticeWarn}`} data-plan-notice={view.notice}>
        <Icon name="info" size={16} /><span>{t(text)}</span>
        {view.notice === "stale" && onReload ? <span className={styles.push}><Button size="sm" label={t(planFlowCopy.reload)} onClick={onReload} /></span> : null}
      </div>
    );
  }
  const title = view.op === "draft" ? planFlowCopy.draftFailed : view.op === "fix" ? planFlowCopy.fixFailed : planFlowCopy.stepFailed;
  const message = view.op === "draft" ? t(planFlowCopy.draftFailedBody) : view.op === "fix" ? t(planFlowCopy.fixFailedBody) : `${copy.error.checkConnection}${copy.error.inputKept}`;
  return (
    <div data-plan-failure={view.op} role="alert">
      <ConfirmCard state="failure" title={t(title)} detail={message} actions={onRetry ? [{ label: t(planFlowCopy.retryOnce), onSelect: onRetry, primary: true }] : []} />
    </div>
  );
}
