"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanGoalEditResult, PlanGoalKind, PlanGoalKindRead, PlanGoalListItem, PlanLegacyListResponse, PlanOpenResult } from "../../../../../shared/contract/plan-v2";
import { planDoneHref, planLegacyHref, planNewGoalHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { PLAN_GOAL_KIND_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import { planReviewCopy as r } from "../copy/plan";
import { Button, Chip, FilterOption, Icon, MacTile, Modal, Popover, useStandardCopy, useToast } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { isGoalKind, planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, type Translate } from "./PlanParts";
import { reviewPageHref } from "./PlanReviewEntry";
import { achievedGoalsOf, activeGoalsOf } from "./review-model";
import styles from "./review.module.css";

const goalEmoji = (kind: PlanGoalKindRead) => (isGoalKind(kind) ? PLAN_GOAL_TEMPLATES[kind].emoji : "🎯");

/**
 * 目標の切替（b4 A6 ①, Web: the goal row's dropdown). Active goals with score and
 * people talked to (current one ticked; picking another calls `open`), finished goals
 * (→ 完了), 以前のプラン (only when there is one), 「＋ 目標を追加」 (off at 2 with the
 * reason, no paywall) and 「目標を編集」.
 */
export function GoalSwitcher({ currentPlanId, currentGoal, currentKind, goals, activeGoalLimit, t, language, onEdit }: {
  currentPlanId: string | null;
  currentGoal: string | null;
  currentKind: PlanGoalKindRead;
  goals: readonly PlanGoalListItem[];
  activeGoalLimit: number;
  t: Translate;
  language: OrbitLanguage;
  onEdit: (() => void) | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [legacy, setLegacy] = useState<PlanLegacyListResponse["plans"] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const active = activeGoalsOf(goals);
  const achieved = achievedGoalsOf(goals);
  const position = currentPlanId ? active.findIndex((goal) => goal.planId === currentPlanId) + 1 : 0;
  const full = active.length >= activeGoalLimit;

  useEffect(() => {
    if (!open || legacy) return;
    let alive = true;
    void planApi<PlanLegacyListResponse>("/legacy", { language }).then((result) => { if (alive) setLegacy(result.ok ? result.data.plans : []); });
    return () => { alive = false; };
  }, [open, legacy, language]);

  const pick = async (planId: string) => {
    if (planId === currentPlanId) { setOpen(false); return; }
    if (switching) return;
    setSwitching(planId);
    const result = await planApi<PlanOpenResult>(`/v2/${encodeURIComponent(planId)}/open`, { body: { idempotencyKey: newActionKey() }, language });
    setSwitching(null);
    if (!result.ok) { toast.error(t(r.switchFailed)); return; }
    setOpen(false);
    router.push(planTaskSegmentHref("web", planId));
  };

  return (
    <>
      <button ref={anchor} type="button" className={`btn ${styles.switcher}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} data-plan-goal-switcher="">
        <span aria-hidden>{goalEmoji(currentKind)}</span>
        <span className={styles.switcherText} data-plan-goal="">{currentGoal ?? t(r.switchLabel)}</span>
        <Icon name="down" size={16} />
      </button>
      {position > 0 ? <Chip label={t(r.goalPosition, { n: position, total: active.length })} /> : null}
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t(r.switchLabel)} width={400}>
        <div className={styles.menu} data-plan-goal-menu="">
          <span className={styles.menuHead}>{t(r.activeGoals)}</span>
          {active.map((goal) => (
            <button key={goal.planId} type="button" className={`btn ${styles.menuRow}`} aria-current={goal.planId === currentPlanId ? "true" : undefined} disabled={switching !== null}
              onClick={() => void pick(goal.planId)} data-plan-goal-option={goal.planId}>
              <MacTile emoji={goalEmoji(goal.goalKind)} size="sm" />
              <span className={styles.grow}>
                <b className={styles.menuTitle}>{goal.goal}</b>
                <span className={styles.label}>{t(r.goalStats, { n: goal.talkedPeople, score: goal.total })}</span>
              </span>
              {goal.planId === currentPlanId ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
          {achieved.length ? <span className={styles.menuHead}>{t(r.doneGoals)}</span> : null}
          {achieved.map((goal) => (
            <Link key={goal.planId} href={planDoneHref("web", goal.planId)} className={styles.menuRow} data-plan-goal-done={goal.planId}>
              <MacTile emoji="🏁" size="sm" />
              <span className={styles.grow}>
                <b className={styles.menuTitle}>{goal.goal}</b>
                <span className={styles.label}>{t(r.doneGoalStats, { score: goal.total })}</span>
              </span>
            </Link>
          ))}
          {legacy && legacy.length ? <span className={styles.menuHead}>{t(r.legacyPlans)}</span> : null}
          {(legacy ?? []).map((plan) => (
            <Link key={plan.planId} href={planLegacyHref("web", plan.planId)} className={styles.menuRow} data-plan-goal-legacy={plan.planId}>
              <MacTile emoji="🗂️" size="sm" tone="apricot" />
              <span className={styles.grow}><b className={styles.menuTitle}>{plan.goal}</b></span>
            </Link>
          ))}
          <div className={styles.menuFoot}>
            <Button size="sm" icon="plus" label={t(r.addGoal)} disabled={full} onClick={() => router.push(planNewGoalHref("web"))} data-plan-add-goal="" />
            {onEdit ? <Button size="sm" variant="ghost" icon="edit" label={t(r.editGoal)} onClick={() => { setOpen(false); onEdit(); }} data-plan-edit-goal="" /> : null}
          </div>
          {full ? <p className={styles.label} data-plan-goal-limit="">{t(r.goalLimit)}</p> : null}
        </div>
      </Popover>
    </>
  );
}

/**
 * 目標を編集（b4 A6 ② ③, Web modal). Only the goal text and type can change (契約
 * `PlanGoalEditRequest`); 保存 with nothing changed just closes. Any change offers three exits: 保存して作り直す (→ 見直し, a
 * send still uses one), 目標だけ保存 (points unchanged) and キャンセル.
 */
export function GoalEditModal({ open, onClose, planId, goal, goalKind, revision, reviewLeft, t, language, onSaved }: {
  open: boolean;
  onClose: () => void;
  planId: string;
  goal: string;
  goalKind: PlanGoalKindRead;
  revision: number;
  reviewLeft: number;
  t: Translate;
  language: OrbitLanguage;
  onSaved: () => void;
}) {
  const router = useRouter();
  const copy = useStandardCopy();
  const inputId = useId();
  const [text, setText] = useState(goal);
  const [kind, setKind] = useState<PlanGoalKind | null>(isGoalKind(goalKind) ? goalKind : null);
  const [busy, setBusy] = useState<"save_only" | "save_and_rebuild" | null>(null);
  const [error, setError] = useState<PlanErrorView | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(goal);
    setKind(isGoalKind(goalKind) ? goalKind : null);
    setError(null);
  }, [open, goal, goalKind]);

  const trimmed = text.trim();
  const textChanged = trimmed !== "" && trimmed !== goal;
  const kindChanged = kind !== null && kind !== goalKind;
  const changed = textChanged || kindChanged;
  const kindName = (value: PlanGoalKindRead) => (isGoalKind(value) ? planCopy(PLAN_GOAL_KIND_COPY[value], language) : "");

  const save = async (mode: "save_only" | "save_and_rebuild") => {
    if (!changed || busy) return;
    setBusy(mode);
    setError(null);
    const result = await planApi<PlanGoalEditResult>(`/v2/${encodeURIComponent(planId)}/goal`, {
      body: { expectedRevision: revision, idempotencyKey: newActionKey(), mode, ...(textChanged ? { goalText: trimmed } : {}), ...(kindChanged ? { goalKind: kind } : {}) },
      language,
      method: "PATCH",
    });
    setBusy(null);
    if (result.ok === false) { setError(planErrorView(result.error, "other")); return; }
    if (mode === "save_and_rebuild" && result.data.reviewDraftId) {
      router.push(reviewPageHref(planId, result.data.reviewDraftId));
      return;
    }
    onSaved();
  };

  const actions = changed
    ? <>
        <Button variant="ghost" label={copy.action.cancel} onClick={onClose} data-plan-goal-cancel="" />
        <Button label={t(r.saveOnly)} loading={busy === "save_only"} disabled={busy !== null} onClick={() => void save("save_only")} data-plan-goal-save-only="" />
        <Button variant="primary" icon="refresh" label={t(r.saveAndRebuild)} loading={busy === "save_and_rebuild"} disabled={busy !== null} onClick={() => void save("save_and_rebuild")} data-plan-goal-rebuild="" />
      </>
    : <><Button variant="ghost" label={copy.action.cancel} onClick={onClose} data-plan-goal-cancel="" /><Button variant="primary" label={copy.action.save} onClick={onClose} data-plan-goal-save="" /></>;

  return (
    <Modal open={open} onClose={onClose} title={t(r.editTitle)} size={560} actions={actions}>
      <div className={styles.form} data-plan-goal-edit="">
        <label className={styles.label} htmlFor={inputId}>{t(r.editGoalLabel)}</label>
        <input id={inputId} className={styles.input} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
        {textChanged ? (
          <p className={styles.fromTo} data-plan-goal-diff="text"><Chip label={t(r.editChanged)} tone="lav" /><span className={styles.before}>{goal}</span><span className={styles.after}>{trimmed}</span></p>
        ) : null}
        <span className={styles.label}>{t(r.editKindLabel)}</span>
        <div className={styles.kinds} role="group" aria-label={t(r.editKindLabel)}>
          {PLAN_GOAL_KINDS.map((key) => (
            <FilterOption key={key} selected={kind === key} label={`${PLAN_GOAL_TEMPLATES[key].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[key], language)}`} onToggle={() => setKind(key)} />
          ))}
        </div>
        {kindChanged ? <p className={styles.fromTo} data-plan-goal-diff="kind"><Chip label={t(r.editChanged)} tone="lav" />{t(r.editFromTo, { from: kindName(goalKind), to: kindName(kind!) })}</p> : null}
        <p className={styles.label}>{t(r.editNoDeadline)}</p>
        {changed ? (
          <section className={styles.rebuild} data-plan-goal-rebuild-note="">
            <div className={styles.row}><span aria-hidden>🔄</span><b>{t(r.rebuildTitle)}</b></div>
            <ul className={styles.dots}>
              <li>{t(r.rebuildKeep)}</li>
              <li>{t(r.rebuildHow)}</li>
              <li>{t(r.rebuildCost, { n: reviewLeft })}</li>
            </ul>
          </section>
        ) : null}
        {error ? <PlanErrorNotice view={error} t={t} onReload={() => { onClose(); onSaved(); }} /> : null}
      </div>
    </Modal>
  );
}

/** 達成 ①（b4 A5）: score and people talked to; the score stops growing once achieved. */
export function AchieveDialog({ open, onClose, planId, revision, score, talkedPeople, t, language, onStale }: {
  open: boolean;
  onClose: () => void;
  planId: string;
  revision: number;
  score: number;
  talkedPeople: number | null;
  t: Translate;
  language: OrbitLanguage;
  onStale: () => void;
}) {
  const router = useRouter();
  const copy = useStandardCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlanErrorView | null>(null);
  useEffect(() => { if (open) setError(null); }, [open]);
  const achieve = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await planApi<{ planId: string; achievedAt: string }>(`/v2/${encodeURIComponent(planId)}/achieve`, { body: { expectedRevision: revision, idempotencyKey: newActionKey() }, language });
    setBusy(false);
    if (result.ok === false) { setError(planErrorView(result.error, "other")); return; }
    router.push(planDoneHref("web", planId));
  };
  return (
    <Modal open={open} onClose={onClose} title={t(r.achieveTitle)} size={420}
      actions={<><Button label={copy.action.cancel} onClick={onClose} data-plan-achieve-cancel="" /><Button variant="primary" icon="flag" label={t(r.achieveConfirm)} loading={busy} onClick={() => void achieve()} data-plan-achieve-confirm="" /></>}>
      <div className={styles.achieve} data-plan-achieve="">
        <MacTile emoji="🏁" />
        <b className={styles.strong} data-plan-achieve-stats="">{talkedPeople === null ? `${score}` : t(r.achieveStats, { n: talkedPeople, score })}</b>
        <p className={styles.body}>{t(r.achieveBody, { score })}</p>
        {error ? <PlanErrorNotice view={error} t={t} onReload={() => { onClose(); onStale(); }} /> : null}
      </div>
    </Modal>
  );
}
