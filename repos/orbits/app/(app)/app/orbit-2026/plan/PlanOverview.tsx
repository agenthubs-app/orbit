"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { PlanCommandResult, PlanDraftView, PlanGoalListItem, PlanGoalListResponse, PlanPendingDecisionResult, PlanPendingItem, PlanStepProgress, PlanV2Detail, PlanV2Step } from "../../../../../shared/contract/plan-v2";
import { planDraftEditHref, planTypeHref } from "../../../../../shared/compute/plan-href";
import { closingStepNumbers, eventGatherTypeKeys, jaLatinGlue, stepChipsVisible } from "../../../../../shared/compute/plan-overview-labels";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planOverviewCopy as c, planReviewCopy as r } from "../copy/plan";
import { goalKindLabel } from "./plan-model";
import { Avatar, CountUp, Icon, Kbd, MacTile, Modal, Orbit2026Scope, RetryCard, RingChart, Skeleton, ToastProvider, fillCopy, useStandardCopy, useToast } from "../ui";
import { eventDate } from "../events/events-model";
import { ShellPage, useInShell } from "../shell/slots";
import { PLAN_EVENT_SEGMENT_KEY, eventView, overflowParts, stepGroups, stepOrderedCards, typeCards, typeTone, unitsOf, type TypeCardView } from "./overview-model";
import { planApi } from "./plan-api";
import { takePlanFlash } from "./plan-flash";
import { AchieveDialog, GoalEditModal, GoalSwitcher } from "./PlanGoalDialogs";
import { ReviewEntryModal } from "./PlanReviewEntry";
import { sinceFromDetail } from "./review-model";
import { useLayoutTier, usePlanWrites, v2Path, enc, type LayoutTier } from "./plan-v2-actions";
import { translator, type Translate } from "./PlanParts";
import styles from "./overview.module.css";

/**
 * R24 プラン概要: Task › プラン for an active v2 plan. 2026-10-12 pixel rework: 1440 = web.html
 * plan() + planRail() (main two columns + the iOrbit rail, イベント as a full-width card), 1024 =
 * b8 plan1024(), 390 = b8 plan390(); 確認待ち = b12 W-R24-04; 前提を見る = b12 W-R24-03.
 * Every number comes from `GET /v2/[planId]` (`score` is the server's `summarizePlanScore`).
 */
export function PlanOverview({ planId }: { planId: string }) {
  const { language } = useOrbitLanguage();
  return (
    <Orbit2026Scope language={language} className={styles.slot}>
      <ToastProvider>
        <OverviewBody planId={planId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

function OverviewBody({ planId, language }: { planId: string; language: OrbitLanguage }) {
  const t = translator(language);
  const toast = useToast();
  const tier = useLayoutTier();
  const inShell = useInShell();
  const [detail, setDetail] = useState<PlanV2Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [premiseOpen, setPremiseOpen] = useState(false);
  // R25: 見直し入口 / 目標を編集 / 達成 dialogs and the goal list behind the switcher.
  const [dialog, setDialog] = useState<"review" | "edit" | "achieve" | null>(null);
  const [goals, setGoals] = useState<readonly PlanGoalListItem[]>([]);
  const { busy, run } = usePlanWrites(language);
  const router = useRouter();

  const load = useCallback(async () => {
    const [result, list] = await Promise.all([planApi<PlanV2Detail>(v2Path(planId), { language }), planApi<PlanGoalListResponse>("/v2", { language })]);
    if (result.ok) { setDetail(result.data); setFailed(false); } else setFailed(true);
    if (list.ok) setGoals(list.data.goals);
  }, [planId, language]);
  useEffect(() => { void load(); }, [load]);
  // A note carried from 確定 / 目標だけ保存 on another page (「方案を更新しました」).
  useEffect(() => {
    const flash = takePlanFlash();
    if (flash) toast.success(t(flash === "updated" ? r.updatedToast : r.savedToast));
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rail = useMemo(() => (detail ? <OverviewRail detail={detail} t={t} language={language} /> : null), [detail, language]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed && !detail) return <div data-plan-overview-error=""><RetryCard title={t(planFlowCopy.slotLoadFailed)} message={t(c.slotErrorBody)} onRetry={() => void load()} /></div>;
  if (!detail) return <Skeleton lines={6} />;

  const openManualEdit = async () => {
    if (!detail.quota.manualEditAvailable) return;
    const draft = await run<PlanDraftView>("manual", { path: v2Path(planId, "/manual-edit") });
    if (draft) router.push(planDraftEditHref("web", draft.draftId));
  };
  const undoAward = async (awardLogId: string) => {
    const done = await run<PlanCommandResult>("undo", { path: v2Path(planId, `/awards/${enc(awardLogId)}/undo`) });
    if (done) { toast.success(t(c.undoneToast)); await load(); }
  };
  const setStep = async (step: Pick<PlanV2Step, "key">, completed: boolean) => {
    const done = await run<PlanCommandResult>(`step:${step.key}`, { method: completed ? "POST" : "DELETE", path: v2Path(planId, `/steps/${enc(step.key)}/complete`) });
    if (!done) return;
    await load();
    if (completed) toast.success(t(c.stepDoneToast), { undo: () => void setStep(step, false) });
    else toast.success(t(c.stepReopenedToast));
  };
  // R24 复核: a card decided elsewhere (409 PENDING_DECIDED) is not a failure — read again.
  const decidedElsewhere = (error: { reason: string | null }) => {
    if (error.reason !== "PENDING_DECIDED") return false;
    void load();
    return true;
  };
  const dismissPending = async (id: string) => {
    const done = await run<PlanPendingDecisionResult>(`dismiss:${id}`, { path: `/v2/pending/${enc(id)}/dismiss` }, decidedElsewhere);
    if (done) await load();
  };
  const acceptMemo = async (item: PlanPendingItem, answered?: number[]) => {
    const done = await run<PlanPendingDecisionResult>(`accept:${item.id}`, { body: answered ? { answered } : {}, path: `/v2/pending/${enc(item.id)}/accept` }, decidedElsewhere);
    if (!done) return;
    await load();
    const award = done.award;
    if (award && award.part !== "none" && award.awardLogId) {
      const id = award.awardLogId;
      toast.success(t(award.part === "overflow" ? c.awardHalfToast : c.awardToast, { points: award.points }), { undo: () => void undoAward(id) });
    }
  };

  const actions: Actions = { acceptMemo, busy, dismissPending, setStep };
  const current = goals.find((goal) => goal.planId === detail.planId) ?? null;
  const switcher = (
    <GoalSwitcher currentPlanId={detail.planId} currentGoal={detail.goal} currentKind={detail.goalKind} goals={goals.length ? goals : [{ goal: detail.goal, goalKind: detail.goalKind, planId: detail.planId, status: "active", talkedPeople: 0, total: detail.score.total }]}
      activeGoalLimit={detail.quota.activeGoalLimit} t={t} language={language} onEdit={() => setDialog("edit")} />
  );
  const handlers = { onAchieve: () => setDialog("achieve"), onManual: () => void openManualEdit(), onPremise: () => setPremiseOpen(true), onReview: () => setDialog("review") };
  const pending = <PendingCard detail={detail} t={t} actions={actions} language={language} tier={tier} />;

  return (
    <div data-plan-overview={detail.planId} data-tier={tier}>
      {/* 1440: the iOrbit rail (web.html planRail); 768–1279 the shell's 次の一手 drawer shows the same rail. */}
      {tier !== "narrow" && rail ? <ShellPage rightRail={rail} /> : null}
      <div className={styles.goalRow}>
        <div>{switcher}</div>
        {tier === "wide" ? <div className={styles.acts}><PlanButtons detail={detail} t={t} busy={busy} {...handlers} /></div> : null}
        {tier === "medium" ? (
          <div className={styles.acts}>
            {/* b8 plan1024: only 方案を見直す / 目標を達成した (user decision 2026-10-12). */}
            <button type="button" className={`btn ${styles.btn}`} onClick={handlers.onReview} data-plan-action="review"><Icon name="refresh" size={16} />{t(c.reviewButton)}</button>
            <button type="button" className={`btn ${styles.btn}`} onClick={handlers.onAchieve} data-plan-action="achieve"><Icon name="flag" size={16} />{t(c.achieveButton)}</button>
          </div>
        ) : null}
        {tier === "narrow" ? (
          <div className={styles.acts}>
            <button type="button" className={`btn ${styles.rbtn}`} aria-label={t(c.reviewButton)} onClick={handlers.onReview} data-plan-action="review"><Icon name="refresh" size={20} /></button>
            <button type="button" className={`btn ${styles.rbtn}`} aria-label={t(c.achieveButton)} onClick={handlers.onAchieve} data-plan-action="achieve"><Icon name="flag" size={20} /></button>
          </div>
        ) : null}
      </div>
      {tier === "wide" ? (
        <div className={styles.wgrid}>
          <ScoreCard detail={detail} t={t} tier={tier} />
          {pending}
          <section className={`${styles.card} ${styles.span4}`} aria-label={t(c.stepsTitle)} data-plan-steps="">
            <div className={styles.cardH}><h3>{t(c.stepsTitle)}</h3><span className={styles.lbl}>{t(c.stepsNoteShort)}</span></div>
            <StepList detail={detail} t={t} actions={actions} inline />
          </section>
          <TypesCard detail={detail} t={t} language={language} />
          <EventCard detail={detail} t={t} />
        </div>
      ) : tier === "medium" ? (
        <div className={`${styles.wgrid} ${styles.medium}`}>
          <ScoreCard detail={detail} t={t} tier={tier} />
          {pending}
          <section className={`${styles.card} ${styles.span7}`} aria-label={t(c.stepsAndTypes)} data-plan-steps="">
            <div className={styles.cardH}><h3>{t(c.stepsAndTypes)}</h3><span className={styles.lbl}>{t(c.stepsNote)}</span></div>
            <GroupedTypeRows detail={detail} t={t} actions={actions} />
          </section>
          <div className={styles.col5}>
            <TodayCard detail={detail} t={t} />
            <RecentAwards detail={detail} t={t} language={language} />
            <EventBlock detail={detail} t={t} />
          </div>
        </div>
      ) : (
        <div className={`${styles.narrow}`}>
          <ScoreCard detail={detail} t={t} tier={tier} />
          {pending}
          <StepCarousel detail={detail} t={t} actions={actions} />
          <TodayCard detail={detail} t={t} />
          <section className={styles.card} aria-label={t(c.peopleTitle)}>
            <div className={styles.cardH} style={{ marginBottom: 4 }}><h3>{t(c.peopleTitle)}</h3><span className={styles.more}>{t(c.peopleOrder)}<Icon name="right" size={16} /></span></div>
            {stepOrderedCards(detail).map((card) => <PersonRow key={card.type.key} planId={detail.planId} card={card} t={t} />)}
            <EventRow detail={detail} t={t} />
          </section>
        </div>
      )}
      {/* Outside the shell (a page on its own, tests) the rail content stays on the page; under 768 it is not drawn (b8 390). */}
      {!inShell && tier !== "narrow" && rail ? <div className={styles.inlineRail}>{rail}</div> : null}
      <PremiseModal open={premiseOpen} detail={detail} t={t} language={language} onClose={() => setPremiseOpen(false)} onChange={() => { setPremiseOpen(false); setDialog("review"); }} />
      <ReviewEntryModal open={dialog === "review"} onClose={() => setDialog(null)} planId={detail.planId}
        serverSince={detail.sinceConfirmed ? { events: detail.sinceConfirmed.events, stepsCompleted: detail.sinceConfirmed.stepsDone, talked: detail.sinceConfirmed.talkedPeople } : null} fallbackSince={sinceFromDetail(detail)} t={t} language={language} />
      <GoalEditModal open={dialog === "edit"} onClose={() => setDialog(null)} planId={detail.planId} goal={detail.goal} goalKind={detail.goalKind} revision={detail.revision}
        reviewLeft={detail.quota.reviewLeftThisMonth} t={t} language={language} onSaved={() => { setDialog(null); toast.success(t(r.savedToast)); void load(); }} />
      <AchieveDialog open={dialog === "achieve"} onClose={() => setDialog(null)} planId={detail.planId} revision={detail.revision} score={detail.score.total}
        talkedPeople={current?.talkedPeople ?? null} t={t} language={language} onStale={() => void load()} />
    </div>
  );
}

type Actions = {
  busy: string | null;
  setStep: (step: Pick<PlanV2Step, "key">, completed: boolean) => Promise<void>;
  dismissPending: (id: string) => Promise<void>;
  acceptMemo: (item: PlanPendingItem, answered?: number[]) => Promise<void>;
};

/** kit .why: an 18 px 「?」 that opens the reason below its box. */
function useWhy() {
  const std = useStandardCopy();
  const [open, setOpen] = useState(false);
  const button = <button type="button" className={`btn ${styles.why}`} aria-expanded={open} aria-label={std.aiCard.showWhy} onClick={() => setOpen(!open)}>?</button>;
  const text = (reason: string) => fillCopy(std.aiCard.why, { reason });
  return { button, open, text };
}

function isToday(day: string): boolean {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return day.slice(0, 10) === local;
}

/* ---------- スコア + 構成バー (web.html .k-whero / b8 .r8hero) ---------- */

function ScoreCard({ detail, t, tier }: { detail: PlanV2Detail; t: Translate; tier: LayoutTier }) {
  const { score } = detail;
  const fresh = score.total === 0 && isToday(detail.startsOn);
  const side = fresh
    ? <><span className={`${styles.chip} ${styles.chip_lav}`}>{t(c.createdToday)}</span>{tier === "narrow" ? null : <span className={styles.lbl}>{t(c.createdTodayNote)}</span>}</>
    : <><span className={`${styles.chip} ${styles.chip_lav}`}>{score.remainingToFull > 0 ? t(c.scoreRemaining, { n: score.remainingToFull }) : t(c.scoreFull)}</span><span className={styles.lbl}>{t(c.scoreSplit, { skipped: score.skipped, talked: score.talked })}</span></>;
  const number = (
    <div className={styles.bigRow}>
      <CountUp value={score.total} className={styles.big} />
      {score.todayDelta !== 0 ? <span className={cx(styles.chip, score.todayDelta > 0 && styles.chip_lav)} data-plan-today-delta={score.todayDelta}>{score.todayDelta > 0 ? t(c.scoreToday, { n: score.todayDelta }) : t(c.scoreTodayMinus, { n: Math.abs(score.todayDelta) })}</span> : null}
    </div>
  );
  if (tier === "narrow") {
    return (
      <section className={`${styles.card} ${styles.rise}`} data-plan-score={score.total} aria-label={t(planFlowCopy.confirmedScore)}>
        <div className={styles.phoneHero}>
          <div><div className={styles.lbl}>{t(planFlowCopy.confirmedScore)}</div>{number}<div className={styles.lbl}>{t(planFlowCopy.confirmedScoreNote)}</div></div>
          <div>{side}</div>
        </div>
        <SegmentBar detail={detail} t={t} labels={false} />
        <Legend t={t} />
      </section>
    );
  }
  return (
    <section className={`${styles.card} ${styles.span12} ${styles.rise}`} data-plan-score={score.total} aria-label={t(planFlowCopy.confirmedScore)}>
      <div className={styles.heroRow}>
        <div style={{ flex: "none" }}><div className={styles.lbl}>{t(planFlowCopy.confirmedScore)}</div>{number}<div className={styles.lbl}>{t(planFlowCopy.confirmedScoreNote)}</div></div>
        <div className={styles.heroMid}><SegmentBar detail={detail} t={t} labels /><Legend t={t} /></div>
        <div className={styles.heroSide}>{side}</div>
      </div>
    </section>
  );
}

function Legend({ t }: { t: Translate }) {
  return (
    <div className={styles.v2lg} aria-hidden>
      <span><i className={`${styles.v2sw} ${styles.swSolid}`} />{t(c.legendTalked)}</span>
      <span><i className={`${styles.v2sw} ${styles.swHatch}`} />{t(c.legendSkipped)}</span>
      <span><i className={styles.v2sw} />{t(c.legendRest)}</span>
    </div>
  );
}

/** kit V2.sbar: segment width = allocation, solid = earned, hatch = skipped, rose = the half points past the targets after the 満点 100 mark. */
function SegmentBar({ detail, t, labels }: { detail: PlanV2Detail; t: Translate; labels: boolean }) {
  const itemOf = new Map(detail.content.personTypes.map((type) => [type.key, type.itemId]));
  const bonus = overflowParts(detail.score.segments).reduce((sum, part) => sum + part.value, 0);
  const scale = Math.max(100, 100 + bonus);
  return (
    <>
      <div className={styles.v2bar} role="group" aria-label={t(c.barLabel)} data-plan-bar="">
        {detail.score.segments.map((segment) => {
          const label = t(c.segmentLabel, { allocation: segment.allocation, earned: segment.earned, label: segment.shortLabel });
          const fill = segment.skipped ? null : <b style={{ width: `${(Math.min(segment.allocation, segment.earned) / Math.max(1, segment.allocation)) * 100}%` }} data-seg-kind="earned" />;
          const itemId = itemOf.get(segment.key);
          const style = { flex: `${segment.allocation} 1 0` };
          const cls = cx(styles.sg, segment.skipped && styles.sk);
          // Every segment opens its type; the event block has no type page.
          return segment.key !== PLAN_EVENT_SEGMENT_KEY && itemId
            ? <Link key={segment.key} href={planTypeHref("web", detail.planId, itemId)} className={cx(cls, styles.sgLink)} style={style} aria-label={label} data-seg={segment.key} data-seg-kind={segment.skipped ? "skipped" : undefined}>{fill}</Link>
            : <span key={segment.key} className={cls} style={style} role="img" aria-label={label} data-seg={segment.key} data-seg-kind={segment.skipped ? "skipped" : undefined}>{fill}</span>;
        })}
        {bonus > 0 ? <span className={cx(styles.sg, styles.bonus)} style={{ flex: `${bonus} 1 0` }} role="img" aria-label={`+${bonus}`} data-seg="overflow" data-seg-kind="overflow" /> : null}
        {bonus > 0 ? <span className={styles.m100} style={{ left: `${(100 / scale) * 100}%` }} aria-hidden><em>{t(c.fullMark)}</em></span> : null}
      </div>
      {labels ? (
        <div className={styles.v2slbl} aria-hidden>
          {detail.score.segments.map((segment) => <span key={segment.key} style={{ flex: `${segment.allocation} 1 0` }}>{segment.shortLabel}</span>)}
          {bonus > 0 ? <span className={styles.bonusLbl} style={{ flex: `${bonus} 1 0` }}>+{bonus}</span> : null}
        </div>
      ) : null}
    </>
  );
}

/** kit V2.mbar: a type's thin bar — solid base, rose half points after a 2 px gap, hatch when skipped. */
function MiniBar({ allocation, earned, overflow, skipped }: { allocation: number; earned: number; overflow: number; skipped: boolean }) {
  if (skipped) return <div className={`${styles.v2mb} ${styles.mbSk}`} aria-hidden />;
  const total = Math.max(1, allocation + overflow);
  return (
    <div className={styles.v2mb} aria-hidden>
      <b style={{ width: `${(Math.min(allocation, earned) / total) * 100}%` }} />
      {overflow > 0 ? <b className={styles.bo} style={{ width: `${(overflow / total) * 100}%` }} /> : null}
    </div>
  );
}

/* ---------- 確定した方案のボタン (web.html V2.acts) ---------- */

function PlanButtons({ detail, t, busy, onPremise, onReview, onManual, onAchieve }: { detail: PlanV2Detail; t: Translate; busy: string | null; onPremise: () => void; onReview: () => void; onManual: () => void; onAchieve: () => void }) {
  const manual = detail.quota.manualEditAvailable;
  const left = detail.quota.reviewLeftThisMonth;
  return (
    <>
      <button type="button" className={`btn ${styles.btn}`} onClick={onPremise} data-plan-action="premise"><Icon name="layers" size={16} />{t(c.premiseButton)}</button>
      <button type="button" className={`btn ${styles.btn}`} onClick={onReview} data-plan-action="review">
        <Icon name="refresh" size={16} />{t(c.reviewButton)}<span className={styles.v22q}>{left > 0 ? t(c.reviewQuota, { n: detail.quota.reviewMonthlyLimit }) : t(c.reviewUsedUp)}</span>
      </button>
      <button type="button" className={`btn ${styles.btn}`} disabled={!manual || busy !== null} aria-busy={busy === "manual" || undefined} aria-describedby={manual ? undefined : "plan-manual-note"} title={manual ? undefined : t(r.manualAvailableNote)} onClick={onManual} data-plan-action="edit"><Icon name="edit" size={16} />{t(c.editButton)}</button>
      {/* web.html draws no note under the button; the reason stays for screen readers (and the title). */}
      {manual ? null : <span id="plan-manual-note" className={styles.srOnly} data-plan-manual-note="">{t(r.manualAvailableNote)}</span>}
      <button type="button" className={`btn ${styles.btn}`} onClick={onAchieve} data-plan-action="achieve"><Icon name="flag" size={16} />{t(c.achieveButton)}</button>
    </>
  );
}

/* ---------- 右栏 (web.html planRail) ---------- */

function OverviewRail({ detail, t, language }: { detail: PlanV2Detail; t: Translate; language: OrbitLanguage }) {
  return (
    <div className={styles.rail} data-plan-rail="">
      <h2 className={styles.railH}><Icon name="sparkle" size={16} />iOrbit</h2>
      <button type="button" className={`btn ${styles.assistIn}`} onClick={() => window.dispatchEvent(new CustomEvent("orbit:open-palette"))} data-plan-ask=""><Icon name="sparkle" size={16} />{t(c.railAsk)}</button>
      {detail.todayChance ? <h2 className={styles.railH}>{t(c.railNext)}</h2> : null}
      <TodayCard detail={detail} t={t} />
      <DiagCard detail={detail} t={t} language={language} />
      <div className={`${styles.card} ${styles.flat} ${styles.railNote}`} data-plan-footnote="">{t(c.footnote)}</div>
    </div>
  );
}

/** 今日 +N のチャンス (web.html .k-wtoday / b8 todayCard). R26: the server gives the basis (「?」), the button wording and the progress chip. */
function TodayCard({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const chance = detail.todayChance;
  const why = useWhy();
  if (!chance) return null;
  const itemId = chance.href.split("/types/")[1]?.split(/[?#]/)[0] ?? null;
  const card = itemId ? typeCards(detail).find((item) => item.type.itemId === decodeURIComponent(itemId)) ?? null : null;
  const progress = chance.progressLabel ?? (card ? t(c.chanceTag, { label: card.type.shortLabel, met: card.met, target: card.type.targetCount }) : null);
  return (
    <section className={`${styles.card} ${styles.todayCard}`} data-plan-chance="">
      <div className={styles.row}><MacTile emoji="✨" size="sm" /><b>{chance.points > 0 ? t(c.chanceTitlePoints, { n: chance.points }) : t(c.chanceTitle)}</b>{chance.basis ? <span style={{ marginLeft: "auto" }}>{why.button}</span> : null}</div>
      <div className={styles.todayText}>{chance.label}</div>
      {why.open && chance.basis ? <div className={styles.whyBody}>{why.text(chance.basis)}</div> : null}
      <div className={`${styles.row} ${styles.todayActs}`}>
        <Link href={chance.href} className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`}>{chance.actionLabel ?? t(c.chanceGo)}</Link>
        {progress ? <span className={styles.chip}>{progress}</span> : null}
      </div>
    </section>
  );
}

/** 確定した方案 (web.html V2.diag22): the conclusion in one sentence; 「?」 = the basis. */
function DiagCard({ detail, t, language }: { detail: PlanV2Detail; t: Translate; language: OrbitLanguage }) {
  const why = useWhy();
  const basis = [...detail.content.basis.map((item) => item.label), ...detail.content.allocationReasons].join(" · ");
  const status = !detail.quota.manualEditAvailable ? t(c.planStatusManual)
    : isToday(detail.startsOn) ? t(c.planStatusToday)
      : t(c.planStatusDate, { date: new Intl.DateTimeFormat(language, { day: "numeric", month: "long" }).format(new Date(`${detail.startsOn.slice(0, 10)}T00:00:00`)) });
  return (
    <section className={styles.card} data-plan-card="">
      <div className={styles.row}>
        <MacTile emoji="🧭" size="sm" tone="teal" />
        <b className={styles.grow} style={{ fontSize: "var(--fs-body-sm)" }}>{t(c.planCardTitle)}</b>
        <span className={styles.chip}>{status}</span>
        {basis ? why.button : null}
      </div>
      <div className={styles.diagText} data-plan-conclusion="">{detail.content.conclusion}</div>
      {why.open ? <div className={styles.whyBody}>{why.text(basis)}</div> : null}
      <Link href="/app/agent" className={styles.v2go}>{t(c.seeConversation)}<Icon name="right" size={16} /></Link>
    </section>
  );
}

/* ---------- 確認待ち (b12 W-R24-04) ---------- */

/**
 * 1440 shows a step suggestion inside its step (web.html #17, 96d711679 — newer than b12 W-R24-04c);
 * 1024 / 390 have no step list with room for it, so there it joins 確認待ち (b12 W-R24-04c).
 */
function hasPending(detail: PlanV2Detail, withSteps: boolean): boolean {
  const pending = detail.pending ?? [];
  return pending.some((item) => item.kind === "memo_coverage" || item.kind === "candidate") || (withSteps && (detail.stepSuggestions ?? []).length > 0);
}

function PendingCard({ detail, t, actions, language, tier }: { detail: PlanV2Detail; t: Translate; actions: Actions; language: OrbitLanguage; tier: LayoutTier }) {
  const withSteps = tier !== "wide";
  if (!hasPending(detail, withSteps)) return null;
  const pending = detail.pending ?? [];
  const memos = pending.filter((item) => item.kind === "memo_coverage");
  const candidates = pending.filter((item) => item.kind === "candidate").slice(0, 3);
  const steps = (withSteps ? detail.stepSuggestions ?? [] : []).map((suggestion) => {
    const index = detail.content.steps.findIndex((item) => item.key === suggestion.stepKey);
    return index >= 0 ? { n: index + 1, step: detail.content.steps[index]! } : null;
  }).filter((item): item is { n: number; step: PlanV2Step } => item !== null && !item.step.completedAt);
  const count = memos.length + steps.length + candidates.length;
  return (
    <section className={`${styles.card} ${styles.span12} ${styles.pendSection}`} aria-label={t(c.pendingTitle)} data-plan-pending="">
      <div className={styles.cardH}><h3>{t(c.pendingTitle)} <span className={`${styles.chip} ${styles.chip_coral}`}>{count}</span></h3>{tier === "narrow" ? null : <span className={styles.lbl}>{t(c.pendingNote)}</span>}</div>
      <div className={styles.pendGrid}>
        {memos.map((item) => <MemoCard key={item.id} item={item} detail={detail} t={t} actions={actions} language={language} />)}
        {steps.map(({ n, step }) => <StepSuggestionCard key={step.key} n={n} planId={detail.planId} step={step} t={t} actions={actions} />)}
        {candidates.map((item) => {
          const name = item.detail ?? "";
          return (
            <Link key={item.id} href={planTypeHref("web", detail.planId, item.itemId ?? "")} className={styles.candCard} data-plan-pending-candidate={item.contactId ?? ""}>
              <Avatar name={name || item.title} size="sm" />
              <div className={styles.grow}><b>{t(c.candidateFound, { name, type: item.title })}</b>{item.organization || item.role ? <span className={styles.lbl}>{[item.organization, item.role].filter(Boolean).join(" · ")}</span> : null}</div>
              <Icon name="right" size={16} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function MemoCard({ item, detail, t, actions, language }: { item: PlanPendingItem; detail: PlanV2Detail; t: Translate; actions: Actions; language: OrbitLanguage }) {
  const [ticked, setTicked] = useState<number[]>([]);
  const type = detail.content.personTypes.find((candidate) => candidate.itemId === item.itemId);
  const index = type ? detail.content.personTypes.indexOf(type) : 0;
  // R24 复核 m9: the points are the server's (`nextAward`); without them no number is shown,
  // and with no contact the sentence leaves out the name.
  const points = item.points !== undefined && item.points > 0 ? item.points : null;
  const name = item.contactId && item.detail ? item.detail : null;
  const manualText = name ? (points !== null ? t(c.memoManual, { name, points }) : t(c.memoManualNoPoints, { name })) : (points !== null ? t(c.memoManualNoName, { points }) : t(c.memoManualBare));
  const answered = item.answered ?? [];
  const proposalText = name ? (points !== null ? t(c.memoProposal, { n: answered.length, name, points }) : t(c.memoProposalNoPoints, { n: answered.length, name })) : (points !== null ? t(c.memoProposalNoName, { n: answered.length, points }) : t(c.memoProposalBare, { n: answered.length }));
  const busy = actions.busy !== null;
  const date = new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric" }).format(new Date(item.createdAt));
  const meta = item.manual ? t(c.pendingManualMeta) : t(c.pendingMemoMeta, { date, questions: answered.map((n) => n + 1).join(t(planFlowCopy.listSeparator)), type: type?.shortLabel ?? item.title });
  // b12 W-R24-04a: the proposal's 「?」 = which memo and which questions it answered (the manual card lists the questions itself).
  const basis = item.manual || !answered.length ? null : t(c.pendingMemoBasis, { date, questions: answered.map((n) => t(c.pendingMemoBasisQuestion, { n: n + 1, question: type?.questions?.[n] ?? "" })).join("") });
  const why = useWhy();
  return (
    <div className={`${styles.confirmCard} ${styles.pendCard}`} data-plan-memo={item.id} data-manual={item.manual ? "" : undefined}>
      <div className={styles.row}>
        <MacTile emoji={type?.emoji ?? "💼"} size="sm" tone={typeTone(index)} />
        <div className={styles.grow}><div className={styles.pendText}>{item.manual ? manualText : proposalText}</div><span className={styles.lbl}>{meta}</span></div>
        {basis ? why.button : null}
      </div>
      {why.open && basis ? <div className={styles.whyBody}>{why.text(basis)}</div> : null}
      {item.manual ? (
        <div className={styles.pq}>
          {(type?.questions ?? []).map((question, q) => {
            const on = ticked.includes(q);
            return (
              <div key={q} className={styles.pqRow}>
                <button type="button" role="checkbox" aria-checked={on} aria-label={t(c.questionN, { n: q + 1 })} className={`btn ${styles.cbx} ${on ? styles.cbxOn : ""}`} onClick={() => setTicked(on ? ticked.filter((value) => value !== q) : [...ticked, q])}><Icon name="check" size={16} /></button>
                <span><b>{t(c.questionN, { n: q + 1 })}</b>　{question}</span>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className={styles.pendActs}>
        {item.manual ? <span className={styles.lbl}>{ticked.length < 2 ? t(c.memoManualHint) : ""}</span> : null}
        <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.ghost}`} disabled={busy} onClick={() => void actions.dismissPending(item.id)}>{item.manual ? null : <Icon name="x" size={16} />}{t(c.memoDismiss)}</button>
        <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} disabled={busy || (item.manual === true && ticked.length < 2)} aria-busy={actions.busy === `accept:${item.id}` || undefined}
          onClick={() => void actions.acceptMemo(item, item.manual ? [...ticked].sort() : undefined)}>{item.manual ? null : <Icon name="check" size={16} />}{t(c.memoAccept)}</button>
      </div>
    </div>
  );
}

function StepSuggestionCard({ n, planId, step, t, actions }: { n: number; planId: string; step: PlanV2Step; t: Translate; actions: Actions }) {
  return (
    <div className={`${styles.confirmCard} ${styles.pendCard}`} data-plan-step-suggestion={step.key}>
      <div className={styles.row}>
        <span className={styles.v2snum}>{n}</span>
        <div className={styles.grow}><div className={styles.pendText}>{t(c.stepSuggestion, { title: step.title })}</div><span className={styles.lbl}>{t(c.pendingStepMeta, { criteria: step.doneCriteria })}</span></div>
      </div>
      <div className={styles.pendActs}>
        <span className={styles.lbl}>{t(c.stepSuggestionNote)}</span>
        <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.ghost}`} disabled={actions.busy !== null} onClick={() => void actions.dismissPending(`step:${planId}:${step.key}`)}>{t(c.stepNotYet)}</button>
        <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} disabled={actions.busy !== null} onClick={() => void actions.setStep(step, true)}>{t(c.stepMarkDone)}</button>
      </div>
    </div>
  );
}

/* ---------- 最近の加点 (b8 1024) ---------- */

function RecentAwards({ detail, t, language }: { detail: PlanV2Detail; t: Translate; language: OrbitLanguage }) {
  const awards = detail.recentAwards ?? [];
  const day = new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric" });
  return (
    <section className={styles.card} data-plan-recent="">
      <div className={styles.cardH}><h3>{t(c.recentTitle)}</h3></div>
      {awards.length === 0 ? <p className={styles.lbl}>{t(c.recentEmpty)}</p> : awards.map((award) => (
        <div key={award.awardLogId} className={styles.recentRow} data-plan-recent-row="">
          <span className={styles.clamp1}><b>{award.shortLabel}</b> <span className={styles.lbl}>{[award.basis === "skip" ? t(c.recentKnown) : award.contactName ? t(c.contactSan, { name: award.contactName }) : award.eventTitle ?? null, day.format(new Date(award.at))].filter(Boolean).join(" · ")}</span></span>
          <b style={award.part === "overflow" ? { color: "var(--rose-700)" } : undefined}>{award.basis === "skip" ? t(c.recentSkip) : `+${award.points}`}</b>
        </div>
      ))}
    </section>
  );
}

/* ---------- ステップ (web.html V2.step22) ---------- */

function stepTone(done: number, total: number): string {
  if (total > 0 && done >= total) return styles.chip_teal!;
  return done > 0 ? styles.chip_lav! : "";
}

function StepList({ detail, t, actions, inline }: { detail: PlanV2Detail; t: Translate; actions: Actions; inline: boolean }) {
  const progress = new Map((detail.stepProgress ?? []).map((item) => [item.stepKey, item]));
  const suggestions = new Set((detail.stepSuggestions ?? []).map((item) => item.stepKey));
  const cards = new Map(typeCards(detail).map((card, index) => [card.type.key, { card, index }]));
  const chips = stepChipsVisible(detail.score.total, detail.content.steps);
  return (
    <div>
      {detail.content.steps.map((step, index) => (
        <StepItem key={step.key} n={index + 1} step={step} planId={detail.planId} progress={progress.get(step.key) ?? null} suggest={inline && suggestions.has(step.key)} closing={closingStepNumbers(detail.content.steps, index, PLAN_EVENT_SEGMENT_KEY)} chips={chips}
          types={step.personTypeKeys.map((key) => cards.get(key)).filter((item): item is { card: TypeCardView; index: number } => Boolean(item))} t={t} actions={actions} />
      ))}
    </div>
  );
}

function StepItem({ n, step, planId, progress, suggest, closing, chips, types, t, actions }: { n: number; step: PlanV2Step; planId: string; progress: PlanStepProgress | null; suggest: boolean; closing: number[]; chips: boolean; types: { card: TypeCardView; index: number }[]; t: Translate; actions: Actions }) {
  const [open, setOpen] = useState(false);
  const why = useWhy();
  const done = Boolean(step.completedAt);
  // A step that lists the event block (personTypeKeys has "event") also shows the イベント chip (web.html chipsOf).
  const hasEvent = step.personTypeKeys.includes(PLAN_EVENT_SEGMENT_KEY);
  return (
    <div className={styles.v2step} data-plan-step={step.key} data-done={done ? "" : undefined}>
      {done
        ? <button type="button" className={`btn ${styles.sn} ${styles.snDone}`} aria-expanded={open} aria-label={`${t(c.stepDone)} ${n}`} onClick={() => setOpen(!open)} data-step-done-mark={step.key}>✓</button>
        : <span className={styles.sn} aria-hidden>{n}</span>}
      <div>
        <div className={styles.st}><span>{step.title}</span>{step.why ? why.button : null}</div>
        {why.open && step.why ? <div className={styles.whyBody}>{why.text(step.why)}</div> : null}
      </div>
      {open && done ? <div className={styles.reopen}><button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.ghost}`} disabled={actions.busy !== null} onClick={() => { setOpen(false); void actions.setStep(step, false); }} data-step-reopen={step.key}>{t(c.stepReopen)}</button></div> : null}
      <div className={styles.mey}>
        <Icon name="flag" size={16} />
        <div className={styles.mt}><small>{t(c.doneCriteria)}</small>{step.doneCriteria}</div>
        {chips ? <StepProgressChip progress={progress} done={done} t={t} /> : null}
      </div>
      {suggest && !done ? (
        <div className={`${styles.confirmCard} ${styles.inRow}`} data-plan-step-suggestion={step.key}>
          <div>{t(c.stepSuggestion, { title: step.title })}</div>
          <div className={styles.row}>
            <span className={`${styles.lbl} ${styles.grow}`}>{t(c.stepSuggestionNote)}</span>
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.ghost}`} disabled={actions.busy !== null} onClick={() => void actions.dismissPending(`step:${planId}:${step.key}`)}>{t(c.stepNotYet)}</button>
            <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary}`} disabled={actions.busy !== null} onClick={() => void actions.setStep(step, true)}>{t(c.stepMarkDone)}</button>
          </div>
        </div>
      ) : null}
      {types.length ? (
        <div className={`${styles.chips} ${styles.stepChips}`}>
          {types.map(({ card, index }) => <Link key={card.type.key} href={planTypeHref("web", planId, card.type.itemId)} className={cx(styles.chip, styles[`chip_${typeTone(index)}`])}>{card.type.emoji} {card.type.shortLabel}</Link>)}
          {hasEvent ? <Link href="/app/events" className={styles.chip} data-plan-step-events="">🎟️ {t(c.eventTitle)}</Link> : null}
        </div>
      ) : hasEvent ? <div className={`${styles.chips} ${styles.stepChips}`}><Link href="/app/events" className={styles.chip} data-plan-step-events="">🎟️ {t(c.eventTitle)}</Link></div> : <span className={`${styles.lbl} ${styles.stepLbl}`}>{closing.length ? t(c.noNewPeopleClosing, { steps: closing.join("・") }) : t(c.noNewPeople)}</span>}
    </div>
  );
}

/**
 * web.html STAT: one chip per step — every part skipped → 習熟済み; else the first open part
 * 「VC 2 / 3人」 (events 「イベント 1 / 2回」); a step with nothing to count → まだ.
 */
function StepProgressChip({ progress, done, t }: { progress: PlanStepProgress | null; done: boolean; t: Translate }) {
  if (!progress) return null;
  const parts = progress.parts ?? [];
  if (parts.length && parts.every((part) => part.skipped)) return <span className={styles.chip}>{t(c.typeKnown)}</span>;
  const part = parts.find((item) => !item.skipped && item.done < item.total) ?? parts.find((item) => !item.skipped);
  if (part) {
    const text = t(part.unit === "events" ? c.stepPartEvents : c.stepPartPeople, { done: part.done, label: part.shortLabel, total: part.total });
    return <span className={cx(styles.chip, stepTone(part.done, part.total))}>{text}</span>;
  }
  if (progress.total > 0) return <span className={cx(styles.chip, stepTone(progress.done, progress.total))}>{progress.label}</span>;
  return done ? null : <span className={styles.chip}>{t(c.stepNotStarted)}</span>;
}

/* ---------- 人物タイプ (web.html V2.tcard) ---------- */

function TypesCard({ detail, t, language }: { detail: PlanV2Detail; t: Translate; language: OrbitLanguage }) {
  const why = useWhy();
  // 「資金調達」 without the goal emoji (web.html .k-wtypes).
  const kind = goalKindLabel(detail.goalKind, language)?.replace(/^\S+\s+/u, "") ?? null;
  const reasons = detail.content.allocationReasons.join(" · ");
  return (
    <section className={`${styles.card} ${styles.span8}`} aria-label={t(c.typesTitle)} data-plan-types="">
      <div className={styles.cardH} style={{ marginBottom: 4 }}>
        <h3>{t(c.typesTitle)}</h3>
        <div className={styles.row}>{kind ? <span className={styles.lbl}>{t(c.typesTemplate, { kind })}</span> : null}{reasons ? why.button : null}</div>
      </div>
      {why.open && reasons ? <div className={styles.whyBody} style={{ margin: "0 0 10px" }}>{why.text(reasons)}</div> : null}
      <div className={`${styles.lbl} ${styles.typesSub}`}>{t(c.typesNote)}</div>
      <div className={styles.v22tgrid}>
        {typeCards(detail).map((card, index) => <TypeCard key={card.type.key} planId={detail.planId} card={card} index={index} t={t} />)}
      </div>
    </section>
  );
}

function unitsText(allocation: number, targetCount: number, t: Translate): string {
  const units = unitsOf(allocation, targetCount);
  return units.last === null ? t(planFlowCopy.unitsEven, { points: units.points }) : t(c.unitsLast, { last: units.last, points: units.points });
}

function TypeCard({ planId, card, index, t }: { planId: string; card: TypeCardView; index: number; t: Translate }) {
  const { type } = card;
  const steps = card.steps.join(t(planFlowCopy.listSeparator));
  return (
    <Link href={planTypeHref("web", planId, type.itemId)} className={styles.v22tc} data-type-card={type.key} data-skipped={type.skipped ? "" : undefined}>
      <div className={styles.tcHead}>
        <MacTile emoji={type.emoji} size="sm" tone={typeTone(index)} />
        <div className={styles.grow}>
          <div className={styles.v22tk}>{steps ? `${type.shortLabel} · Step ${steps}` : type.shortLabel}</div>
          <b className={styles.v22tn}>{type.roleSituation}</b>
        </div>
        <div className={styles.v2pp}>{card.earned + card.overflow}<small> / {type.allocation}</small></div>
      </div>
      <div className={styles.v22m3}>
        <div data-cell="candidates" className={card.candidates === 0 ? styles.z : undefined}><b>{card.candidates}<small>{t(c.typeCellPeople)}</small></b><span>{t(card.candidates === 0 ? c.typeNone : planFlowCopy.sampleCandidates)}</span></div>
        <div data-cell="events" className={card.events === 0 ? styles.z : undefined}><b>{card.events}</b><span>{t(planFlowCopy.sampleEvents)}</span></div>
        <div data-cell="routes" className={card.introRoutes === 0 ? styles.z : undefined}><b>{card.introRoutes}</b><span>{t(planFlowCopy.sampleRoutes)}</span></div>
      </div>
      <div className={styles.v22tf}>
        <span className={styles.lbl}>{type.skipped ? t(c.typeSkipped) : t(c.typeProgress, { met: card.met, target: type.targetCount, units: unitsText(type.allocation, type.targetCount, t) })}</span>
        <MiniBar allocation={type.allocation} earned={card.earned} overflow={card.overflow} skipped={type.skipped} />
      </div>
    </Link>
  );
}

/* ---------- イベント (web.html V2.evCard22 · b8 V2.evBlock) ---------- */

function EventCard({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const event = eventView(detail);
  const { language } = useOrbitLanguage();
  if (event.allocation <= 0) return null;
  const labels = new Map(detail.content.personTypes.map((type) => [type.key, type.shortLabel]));
  const names = eventGatherTypeKeys(detail.content.personTypes).map((key) => labels.get(key) ?? key);
  const joined = language === "ja" ? jaLatinGlue(names.flatMap((name, k) => (k ? [t(c.eventGatherJoin), name] : [name]))) : names.join(t(c.eventGatherJoin));
  const gather = names.length ? (language === "ja" ? jaLatinGlue([joined, t(c.eventGather, { types: "" })]) : t(c.eventGather, { types: joined })) : "";
  return (
    <section className={`${styles.card} ${styles.span12}`} data-plan-event="" aria-label={t(c.eventTitle)}>
      <div className={styles.cardH} style={{ marginBottom: 2 }}>
        <h3><span className={styles.evEmo}><MacTile emoji="🎟️" size="sm" tone="apricot" /></span>{t(c.eventTitle)}</h3>
        <div className={styles.v2pp}>{event.earned + event.overflow}<small> / {event.allocation}</small></div>
      </div>
      <div className={styles.lbl}>{[gather, t(c.eventRule, { count: event.count, target: event.targetCount, unit: event.unit })].filter(Boolean).join(" · ")}</div>
      <MiniBar allocation={event.allocation} earned={event.earned} overflow={event.overflow} skipped={false} />
      <RecommendedEvents detail={detail} t={t} />
    </section>
  );
}

/** R26（D53）: the recommended events under the 🎟 イベント card (web.html V2.evCard22 .v22evg: three, by score). */
function RecommendedEvents({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const { language } = useOrbitLanguage();
  const events = detail.recommendedEvents ?? [];
  if (events.length === 0) return null;
  const when = (iso: string) => {
    const time = Date.parse(iso);
    const today = new Date();
    const start = new Date(time);
    const sameDay = start.toDateString() === today.toDateString();
    const clock = `${start.getHours()}:${String(start.getMinutes()).padStart(2, "0")}`;
    return sameDay && start.getHours() >= 17 ? t(c.eventTonight, { time: clock }) : eventDate(iso, language);
  };
  return (
    <div className={styles.v22evg} data-plan-recommended-events="">
      {events.slice(0, 3).map((event) => (
        <Link key={event.eventId} href={event.assessmentHref ?? `/app/events/${encodeURIComponent(event.eventId)}`} className={styles.v22ev}>
          <span className={styles.evRing}>
            <RingChart size={42} stroke={5} segments={[{ color: event.score.total >= 70 ? "var(--plum-700)" : event.score.total >= 50 ? "var(--plum-500)" : "var(--rose-500)", value: event.score.total / 100 }]} label={`${event.score.total}`} />
            <span className={styles.evRingNum}>{event.score.total}</span>
          </span>
          <span className={styles.evMeta}>
            <b>{event.title}</b>
            <span className={styles.lbl}>{[when(event.startsAt), event.venue].filter(Boolean).join("· ")}</span>
            {event.fitLabel ? <span className={`${styles.chip} ${styles.chip_lav}`} style={{ marginTop: 4 }}>{event.fitLabel}</span> : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

function EventBlock({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const event = eventView(detail);
  if (event.allocation <= 0) return null;
  return (
    <section className={`${styles.card} ${styles.evBlock}`} data-plan-event="" aria-label={t(c.eventTitle)}>
      <div className={styles.row}>
        <MacTile emoji="🎟️" size="sm" tone="apricot" />
        <div className={styles.grow}><b>{t(c.eventTitle)}</b><div className={styles.lbl}>{t(c.eventShortRule, { target: event.targetCount, unit: event.unit })}</div></div>
        <div className={styles.v2pp}>{event.earned + event.overflow}<small> / {event.allocation}</small></div>
      </div>
    </section>
  );
}

/* ---------- 1024: ステップと話すべき人 (b8 plan1024 · V2.prow) ---------- */

function personChips(card: TypeCardView, t: Translate): ReactNode {
  const { type } = card;
  if (type.skipped) return <span className={styles.chip}>{t(c.typeSkippedChip)}</span>;
  const met = card.met >= type.targetCount;
  return (
    <>
      <span className={cx(styles.chip, met && styles.chip_teal)}>{t(met ? c.personMetDone : c.personMet, { met: card.met, target: type.targetCount })}</span>
      {met ? null : card.candidates > 0 ? <span className={`${styles.chip} ${styles.chip_lav}`}>{t(c.personCandidates, { n: card.candidates })}</span> : <span className={styles.chip}>{t(c.personNone)}</span>}
    </>
  );
}

function PersonRow({ planId, card, t }: { planId: string; card: TypeCardView; t: Translate }) {
  const { type } = card;
  const index = Math.max(0, card.letter.charCodeAt(0) - 65);
  return (
    <Link href={planTypeHref("web", planId, type.itemId)} className={styles.v2prow} data-type-row={type.key} data-skipped={type.skipped ? "" : undefined}>
      <MacTile emoji={type.emoji} size="sm" tone={typeTone(index)} />
      <div className={styles.pm}><b>{type.shortLabel}</b><div className={styles.chips}>{personChips(card, t)}</div></div>
      <div className={styles.pe}><div className={styles.v2pp}>{card.earned + card.overflow}<small> / {type.allocation}</small></div><MiniBar allocation={type.allocation} earned={card.earned} overflow={card.overflow} skipped={type.skipped} /></div>
    </Link>
  );
}

function EventRow({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const event = eventView(detail);
  if (event.allocation <= 0) return null;
  const met = event.count >= event.targetCount;
  return (
    <div className={styles.v2prow} data-type-row="event">
      <MacTile emoji="🎟️" size="sm" tone="apricot" />
      <div className={styles.pm}><b>{t(c.eventTitle)}</b><div className={styles.chips}><span className={cx(styles.chip, met && styles.chip_teal)}>{t(met ? c.eventMetDone : c.eventMet, { met: event.count, target: event.targetCount })}</span></div></div>
      <div className={styles.pe}><div className={styles.v2pp}>{event.earned + event.overflow}<small> / {event.allocation}</small></div><MiniBar allocation={event.allocation} earned={event.earned} overflow={event.overflow} skipped={false} /></div>
    </div>
  );
}

/** b8 1024 step line: number (✓ when done — opens 完了を取り消す first, R24 复核 m8) + title. */
function GroupHead({ n, title, step, t, actions }: { n: number; title: string; step: PlanV2Step | null; t: Translate; actions: Actions }) {
  const [open, setOpen] = useState(false);
  const done = Boolean(step?.completedAt);
  return (
    <>
      <div className={styles.groupHead}>
        {done && step
          ? <button type="button" className={`btn ${styles.sn} ${styles.snDone} ${styles.snSmall}`} aria-expanded={open} aria-label={`${t(c.stepDone)} ${n}`} onClick={() => setOpen(!open)} data-step-done-mark={step.key}>✓</button>
          : <span className={styles.v2snum}>{n}</span>}
        <b className={styles.clamp1}>{title}</b>
      </div>
      {open && done && step ? <div className={styles.reopen}><button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.ghost}`} disabled={actions.busy !== null} onClick={() => { setOpen(false); void actions.setStep(step, false); }} data-step-reopen={step.key}>{t(c.stepReopen)}</button></div> : null}
    </>
  );
}

function GroupedTypeRows({ detail, t, actions }: { detail: PlanV2Detail; t: Translate; actions: Actions }) {
  return (
    <div>
      {stepGroups(detail).filter((group) => group.types.length > 0).map((group) => (
        <div key={group.stepKey ?? "rest"} data-plan-step={group.stepKey ?? undefined}>
          {group.stepKey ? <GroupHead n={group.n} title={group.title} step={detail.content.steps.find((step) => step.key === group.stepKey) ?? null} t={t} actions={actions} /> : null}
          {group.types.map((card) => <PersonRow key={card.type.key} planId={detail.planId} card={card} t={t} />)}
        </div>
      ))}
    </div>
  );
}

/* ---------- 390: ステップの横スクロール (b8 .r8stp) ---------- */

/** A carousel card's number; ✓ when done opens 完了を取り消す first (R24 复核 m8). */
function CarouselMark({ n, step, t, actions }: { n: number; step: PlanV2Step; t: Translate; actions: Actions }) {
  const [open, setOpen] = useState(false);
  if (!step.completedAt) return <span className={styles.v2snum}>{n}</span>;
  return (
    <span className={styles.row}>
      <button type="button" className={`btn ${styles.sn} ${styles.snDone} ${styles.snSmall}`} aria-expanded={open} aria-label={`${t(c.stepDone)} ${n}`} onClick={() => setOpen(!open)} data-step-done-mark={step.key}>✓</button>
      {open ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.ghost}`} disabled={actions.busy !== null} onClick={() => { setOpen(false); void actions.setStep(step, false); }} data-step-reopen={step.key}>{t(c.stepReopen)}</button> : null}
    </span>
  );
}

function StepCarousel({ detail, t, actions }: { detail: PlanV2Detail; t: Translate; actions: Actions }) {
  const cards = new Map(typeCards(detail).map((card, index) => [card.type.key, { card, index }]));
  const chanceItem = detail.todayChance?.href.split("/types/")[1]?.split(/[?#]/)[0] ?? null;
  const steps = detail.content.steps.map((step, index) => {
    const types = step.personTypeKeys.map((key) => cards.get(key)).filter((item): item is { card: TypeCardView; index: number } => Boolean(item));
    const earned = types.reduce((sum, { card }) => sum + card.earned + card.overflow, 0);
    const allocation = types.reduce((sum, { card }) => sum + card.type.allocation, 0);
    const on = Boolean(chanceItem && types.some(({ card }) => card.type.itemId === decodeURIComponent(chanceItem)));
    return { allocation, earned, index, on, step, types };
  });
  const current = Math.max(0, steps.findIndex((item) => item.on));
  return (
    <>
      <div className={styles.carousel} role="list" aria-label={t(c.stepsTitle)} data-plan-carousel="">
        {steps.map(({ step, index, types, earned, allocation, on }) => (
          <div key={step.key} role="listitem" className={cx(styles.stpCard, on && styles.stpOn)} data-plan-step={step.key} data-done={step.completedAt ? "" : undefined}>
            <div className={`${styles.row} ${styles.between}`}>
              <CarouselMark n={index + 1} step={step} t={t} actions={actions} />
              {on && detail.todayChance && detail.todayChance.points > 0 ? <span className={`${styles.chip} ${styles.chip_lav}`}>{t(c.scoreToday, { n: detail.todayChance.points })}</span> : null}
            </div>
            <b>{step.title}</b>
            <div className={styles.stpEmos}>
              {types.length ? types.map(({ card, index: k }) => <span key={card.type.key} className={cx(styles.emo, styles.emoSm, styles[`tone_${typeTone(k)}`])} aria-hidden>{card.type.emoji}</span>) : <span className={styles.lbl}>{t(c.noNewPeopleShort)}</span>}
              {allocation ? <span className={styles.v2pp}>{earned}<small> / {allocation}</small></span> : null}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.dots} aria-hidden>{steps.map(({ step }, index) => <i key={step.key} className={index === current ? styles.dotOn : undefined} />)}</div>
    </>
  );
}

/* ---------- 前提を見る (b12 W-R24-03, D49 read-only) ---------- */

function PremiseModal({ open, detail, t, language, onClose, onChange }: { open: boolean; detail: PlanV2Detail; t: Translate; language: OrbitLanguage; onClose: () => void; onChange: () => void }) {
  const date = new Intl.DateTimeFormat(language, { day: "numeric", month: "long" }).format(new Date(`${detail.startsOn.slice(0, 10)}T00:00:00`));
  const left = detail.quota.reviewLeftThisMonth;
  const std = useStandardCopy();
  return (
    <Modal open={open} onClose={onClose} title={t(c.premiseTitle)} description={t(c.premiseMeta, { date, n: detail.premise.length })} size={560}
      hint={<><Kbd>Esc</Kbd> {std.action.close}</>}
      actions={<><button type="button" className={`btn ${styles.btn}`} onClick={onClose}>{std.action.close}</button><button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onChange} data-plan-premise-change=""><Icon name="refresh" size={16} />{t(c.premiseChange)}<span className={styles.v22q} style={{ background: "color-mix(in srgb, var(--bg) 18%, transparent)", color: "var(--bg)" }}>{left > 0 ? t(c.reviewLeft, { n: left }) : t(c.reviewUsedUp)}</span></button></>}>
      <div className={styles.premRows} data-plan-premise="">
        {detail.premise.map((row) => (
          <div key={row.key} className={styles.prem}>
            <span className={styles.lbl}>{row.label}</span>
            <span>{row.value} {row.guessed ? <span className={`${styles.chip} ${styles.chip_apricot} ${styles.guess}`}>{t(c.premiseGuessed)}</span> : null}</span>
            <span className={styles.psrc}>{sourceLabel(row.source, t)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** 背景 / Q1–Q5 / 記録 (b4 .prem .src). */
function sourceLabel(source: string, t: Translate): string {
  if (source === "background") return t(c.premiseSourceBackground);
  if (source === "record") return t(c.premiseSourceRecord);
  return source.toUpperCase();
}
