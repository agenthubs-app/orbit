"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanGoalEditResult, PlanGoalKindRead, PlanGoalListItem, PlanLegacyListResponse, PlanOpenResult, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { planDoneHref, planLegacyHref, planNewGoalHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import { planReviewCopy as r } from "../copy/plan";
import { Icon, useStandardCopy, useToast } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { isGoalKind, planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, type Translate } from "./PlanParts";
import { reviewPageHref } from "./PlanReviewEntry";
import { ReviewDialog } from "./ReviewDialog";
import { achievedGoalsOf, activeGoalsOf, goalTone, joinGoalAmount, splitGoalAmount } from "./review-model";
import k from "./ReviewKit.module.css";
import g from "./GoalDialogs.module.css";

const goalEmoji = (kind: PlanGoalKindRead) => (isGoalKind(kind) ? PLAN_GOAL_TEMPLATES[kind].emoji : "🎯");
const toneClass = (kind: PlanGoalKindRead) => k[goalTone(kind)];

/**
 * 目標の切替（b4 A6 · b12 W-R25-09, Web: the goal row's dropdown）. 進めている目標 with score
 * and people talked to (current one ticked; picking another calls `open`), 完了した目標
 * (→ 完了), 以前のプラン (only when there is one, 閲覧のみ), 目標を追加 (off at 2 with the
 * reason, no paywall) and 目標を編集.
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
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [legacy, setLegacy] = useState<PlanLegacyListResponse["plans"] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const active = activeGoalsOf(goals);
  const achieved = achievedGoalsOf(goals);
  const full = active.length >= activeGoalLimit;

  useEffect(() => {
    if (!open || legacy) return;
    let alive = true;
    void planApi<PlanLegacyListResponse>("/legacy", { language }).then((result) => { if (alive) setLegacy(result.ok ? result.data.plans : []); });
    return () => { alive = false; };
  }, [open, legacy, language]);

  // b12 W-R25-09: the panel's left edge 2 right of the button's, its top 5 under it.
  useLayoutEffect(() => {
    if (!open) return;
    const at = () => { const box = anchor.current?.getBoundingClientRect(); if (box) setPlace({ left: Math.min(box.left + 2, window.innerWidth - 356), top: box.bottom + 5 }); };
    at();
    window.addEventListener("resize", at);
    window.addEventListener("scroll", at, true);
    return () => { window.removeEventListener("resize", at); window.removeEventListener("scroll", at, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); anchor.current?.focus(); } };
    const onDown = (event: MouseEvent) => { const target = event.target as Node; if (!panel.current?.contains(target) && !anchor.current?.contains(target)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

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
      <button ref={anchor} type="button" className={`btn ${k.btn} ${g.switcher}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} data-plan-goal-switcher="">
        <span className={g.switcherText} data-plan-goal="">{goalEmoji(currentKind)} {currentGoal ?? t(r.switchLabel)}</span>
        <Icon name="down" size={16} />
      </button>
      {open ? (
        <div ref={panel} role="dialog" aria-label={t(r.switchLabel)} tabIndex={-1} className={g.gmenu} style={place ?? { left: -9999, top: -9999 }} data-plan-goal-menu="">
          <div className={`${k.lbl} ${g.ghead}`}>{t(r.activeGoals)}</div>
          {active.map((goal) => (
            <button key={goal.planId} type="button" className={`btn ${g.gi} ${goal.planId === currentPlanId ? g.on : ""}`} aria-current={goal.planId === currentPlanId ? "true" : undefined} disabled={switching !== null}
              onClick={() => void pick(goal.planId)} data-plan-goal-option={goal.planId}>
              <span className={`${k.emo} ${k.emoSm} ${toneClass(goal.goalKind)}`} aria-hidden>{goalEmoji(goal.goalKind)}</span>
              <span className={k.grow}><b>{goal.goal}</b><span className={k.lbl}>{t(r.goalStats, { n: goal.talkedPeople, score: goal.total })}</span></span>
              {goal.planId === currentPlanId ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
          {achieved.length ? (
            <>
              <div className={g.gsep} />
              <div className={`${k.lbl} ${g.ghead}`}>{t(r.doneGoals)}</div>
              {achieved.map((goal) => (
                <Link key={goal.planId} href={planDoneHref("web", goal.planId)} className={`btn ${g.gi}`} data-plan-goal-done={goal.planId}>
                  <span className={`${k.emo} ${k.emoSm} ${g.emoMuted}`} aria-hidden>🏁</span>
                  <span className={k.grow}><b>{goal.goal}</b><span className={k.lbl}>{t(r.doneGoalStats, { score: goal.total })}</span></span>
                  <Icon name="right" size={16} />
                </Link>
              ))}
            </>
          ) : null}
          {legacy && legacy.length ? (
            <>
              <div className={g.gsep} />
              {legacy.map((plan) => (
                <Link key={plan.planId} href={planLegacyHref("web", plan.planId)} className={`btn ${g.gi}`} data-plan-goal-legacy={plan.planId}>
                  <span className={`${k.emo} ${k.emoSm} ${g.emoMuted}`} aria-hidden>🗂️</span>
                  <span className={k.grow}><b className={g.legacyName}>{t(r.legacyPlans)}</b><span className={k.lbl}>{t(r.legacyMenuSub, { goal: plan.goal })}</span></span>
                  <Icon name="right" size={16} />
                </Link>
              ))}
            </>
          ) : null}
          <div className={g.gsep} />
          <button type="button" className={`btn ${g.gi}`} disabled={full} onClick={() => router.push(planNewGoalHref("web"))} data-plan-add-goal="">
            <span className={`${k.lbtn} ${g.lbtn32}`} aria-hidden><Icon name="plus" size={16} /></span>
            <span className={k.grow}><b>{t(r.addGoal)}</b>{full ? <span className={k.lbl} data-plan-goal-limit="">{t(r.goalLimit)}</span> : null}</span>
          </button>
          {onEdit ? (
            <button type="button" className={`btn ${g.gi}`} onClick={() => { setOpen(false); onEdit(); }} data-plan-edit-goal="">
              <span className={`${k.lbtn} ${g.lbtn32}`} aria-hidden><Icon name="edit" size={16} /></span>
              <span className={k.grow}><b>{t(r.editGoal)}</b></span>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * 目標を編集（b4「Web 目標の切替 + 編集」, 600 wide）. 目標 / 金額 come from the goal text
 * (「…（3億円）」); 背景（任意）/ ひとこと（重点）are `goalBackground` / `goalNote` (read from the
 * plan when the modal opens). Changing only those two saves directly (D59). A change to the goal
 * or amount offers three exits: 保存して作り直す (→ 見直し; a send still uses one), 目標だけ保存
 * (points unchanged) and キャンセル.
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
  const ids = useId();
  const initial = splitGoalAmount(goal);
  const [base, setBase] = useState(initial.base);
  const [amount, setAmount] = useState(initial.amount ?? "");
  const [notes, setNotes] = useState<{ background: string; note: string } | null>(null);
  const [background, setBackground] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save_only" | "save_and_rebuild" | null>(null);
  const [error, setError] = useState<PlanErrorView | null>(null);

  useEffect(() => {
    if (!open) return;
    const parts = splitGoalAmount(goal);
    setBase(parts.base);
    setAmount(parts.amount ?? "");
    setError(null);
    setNotes(null);
    let alive = true;
    void planApi<PlanV2Detail>(`/v2/${encodeURIComponent(planId)}`, { language }).then((result) => {
      if (!alive) return;
      const read = { background: result.ok ? result.data.goalBackground ?? "" : "", note: result.ok ? result.data.goalNote ?? "" : "" };
      setNotes(read);
      setBackground(read.background);
      setNote(read.note);
    });
    return () => { alive = false; };
  }, [open, goal, planId, language]);

  const next = joinGoalAmount(base, amount);
  const baseChanged = base.trim() !== "" && base.trim() !== initial.base;
  const amountChanged = amount.trim() !== (initial.amount ?? "");
  const changed = base.trim() !== "" && next !== goal.trim();
  const notesChanged = notes !== null && (background.trim() !== notes.background.trim() || note.trim() !== notes.note.trim());

  const save = async (mode: "save_only" | "save_and_rebuild") => {
    if ((!changed && !notesChanged) || busy) return;
    setBusy(mode);
    setError(null);
    const result = await planApi<PlanGoalEditResult>(`/v2/${encodeURIComponent(planId)}/goal`, {
      body: {
        expectedRevision: revision, idempotencyKey: newActionKey(), mode,
        ...(changed ? { goalText: next } : {}),
        ...(notesChanged && notes && background.trim() !== notes.background.trim() ? { goalBackground: background.trim() || null } : {}),
        ...(notesChanged && notes && note.trim() !== notes.note.trim() ? { goalNote: note.trim() || null } : {}),
      },
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

  return (
    <ReviewDialog open={open} onClose={onClose} width={600} labelledBy={`${ids}-t`} data={{ "data-plan-goal-edit": "" }}>
      <div className={`${k.row} ${k.between} ${g.head}`}>
        <b id={`${ids}-t`} className={g.title}>{t(r.editTitle)}</b>
        <button type="button" className={`btn ${k.lbtn}`} aria-label={copy.action.close} onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div className={`${g.gfld} ${baseChanged ? g.chg : ""}`}>
        <label className={k.lbl} htmlFor={`${ids}-g`}>{t(r.editGoalLabel)}</label>
        <div className={g.v}>
          <span className={`${k.emo} ${k.emoSm} ${toneClass(goalKind)}`} aria-hidden>{goalEmoji(goalKind)}</span>
          <input id={`${ids}-g`} value={base} maxLength={2000} onChange={(event) => setBase(event.target.value)} data-plan-goal-input="" />
        </div>
      </div>
      <div className={`${k.grid2} ${g.pair}`}>
        <div className={`${g.gfld} ${amountChanged ? g.chg : ""}`} data-plan-goal-diff={amountChanged ? "amount" : undefined}>
          <label className={k.lbl} htmlFor={`${ids}-a`}>{t(r.editAmountLabel)}</label>
          <div className={g.v}>
            {amountChanged && initial.amount ? <span className={g.old}>{initial.amount}</span> : null}
            {amountChanged && initial.amount ? <span className={g.arrow} aria-hidden>{"→ "}</span> : null}
            <input id={`${ids}-a`} value={amount} maxLength={40} placeholder="—" onChange={(event) => setAmount(event.target.value)} data-plan-goal-amount="" />
          </div>
        </div>
        <div className={g.gfld}>
          <label className={k.lbl} htmlFor={`${ids}-b`}>{t(r.editBackgroundLabel)}</label>
          <div className={`${g.v} ${g.vSmall}`}><input id={`${ids}-b`} value={background} maxLength={1000} placeholder="—" disabled={notes === null} onChange={(event) => setBackground(event.target.value)} data-plan-goal-background="" /></div>
        </div>
      </div>
      <div className={g.gfld}>
        <label className={k.lbl} htmlFor={`${ids}-n`}>{t(r.editFocusLabel)}</label>
        <div className={`${g.v} ${g.vSmall}`}><input id={`${ids}-n`} value={note} maxLength={200} placeholder="—" disabled={notes === null} onChange={(event) => setNote(event.target.value)} data-plan-goal-focus="" /></div>
      </div>
      {changed ? (
        <section className={`${k.card} ${k.flat} ${g.rebuild}`} data-plan-goal-rebuild-note="">
          <div className={k.row} style={{ gap: 10 }}>
            <span className={`${k.emo} ${k.emoSm} ${k.lav}`} aria-hidden>🔄</span>
            <b className={k.grow}>{t(amountChanged && !baseChanged ? r.rebuildTitleAmount : r.rebuildTitle)}</b>
            <span className={`${k.qchip} ${reviewLeft <= 0 ? k.qchipOut : ""}`}><i />{t(r.quotaLeft, { n: reviewLeft })}</span>
          </div>
          <div className={g.effList}>
            <div className={g.eff}><Icon name="check" size={16} />{t(r.rebuildKeep)}</div>
            <div className={g.eff}><Icon name="check" size={16} />{t(r.rebuildHow)}</div>
            <div className={g.eff}><Icon name="refresh" size={16} />{t(r.rebuildCost, { n: reviewLeft, to: Math.max(0, reviewLeft - 1) })}</div>
          </div>
        </section>
      ) : null}
      {error ? <PlanErrorNotice view={error} t={t} onReload={() => { onClose(); onSaved(); }} /> : null}
      <div className={g.buttons}>
        <button type="button" className={`btn ${k.btn} ${k.ghost}`} onClick={onClose} data-plan-goal-cancel="">{copy.action.cancel}</button>
        {changed ? (
          <>
            <button type="button" className={`btn ${k.btn}`} disabled={busy !== null} aria-busy={busy === "save_only" || undefined} onClick={() => void save("save_only")} data-plan-goal-save-only="">{t(r.saveOnly)}</button>
            <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={busy !== null} aria-busy={busy === "save_and_rebuild" || undefined} onClick={() => void save("save_and_rebuild")} data-plan-goal-rebuild="">{t(r.saveAndRebuild)}</button>
          </>
        ) : notesChanged ? (
          // D59: only the background / focus changed → save directly, no rebuild.
          <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={busy !== null} aria-busy={busy === "save_only" || undefined} onClick={() => void save("save_only")} data-plan-goal-save="">{copy.action.save}</button>
        ) : <button type="button" className={`btn ${k.btn} ${k.primary}`} onClick={onClose} data-plan-goal-save="">{copy.action.save}</button>}
      </div>
    </ReviewDialog>
  );
}

/** 達成確認（b12 W-R25-07, 480 wide）: score and people talked to; the score stops growing once achieved. */
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
  const ids = useId();
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
    <ReviewDialog open={open} onClose={onClose} width={480} labelledBy={`${ids}-t`} data={{ "data-plan-achieve": "" }}>
      <div className={`${k.row} ${g.achRow}`}>
        <div className={g.achIcon} aria-hidden>🏁</div>
        <div style={{ minWidth: 0 }}>
          <b id={`${ids}-t`} className={g.achTitle}>{t(r.achieveTitle)}</b>
          <div className={`${k.sub} ${g.achBody}`}>{t(r.achieveBody, { score })}</div>
          <div className={`${k.row} ${g.achStats}`}>
            <span className={`${k.chip} ${g.chipLav}`} data-plan-achieve-stats="">{talkedPeople === null ? t(r.achieveScoreOnly, { score }) : t(r.achieveStats, { n: talkedPeople, score })}</span>
          </div>
        </div>
      </div>
      {error ? <PlanErrorNotice view={error} t={t} onReload={() => { onClose(); onStale(); }} /> : null}
      <div className={k.macts}>
        <span className={`${k.lbl} ${k.hint}`}><kbd className={g.kbd}>Esc</kbd>{copy.action.cancel}</span>
        <button type="button" className={`btn ${k.btn}`} onClick={onClose} data-plan-achieve-cancel="">{copy.action.cancel}</button>
        <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={busy} aria-busy={busy || undefined} onClick={() => void achieve()} data-plan-achieve-confirm="">{t(r.achieveConfirm)}</button>
      </div>
    </ReviewDialog>
  );
}
