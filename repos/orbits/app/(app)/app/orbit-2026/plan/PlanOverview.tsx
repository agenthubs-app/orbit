"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { PlanCommandResult, PlanDraftView, PlanGoalListItem, PlanGoalListResponse, PlanPendingDecisionResult, PlanPendingItem, PlanV2Detail, PlanV2Step } from "../../../../../shared/contract/plan-v2";
import { planDraftEditHref, planTypeHref } from "../../../../../shared/compute/plan-href";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planOverviewCopy as c, planReviewCopy as r } from "../copy/plan";
import { Button, Card, Checkbox, Chip, ConfirmCard, CountUp, IconButton, MacTile, Modal, Orbit2026Scope, ProgressBar, RetryCard, SampleTag, Skeleton, ToastProvider, WhyDisclosure, useStandardCopy, useToast } from "../ui";
import { PLAN_EVENT_SEGMENT_KEY, eventView, overflowParts, segmentParts, stepGroups, typeCards, unitsOf, type TypeCardView } from "./overview-model";
import { planApi } from "./plan-api";
import { goalKindLabel } from "./plan-model";
import { takePlanFlash } from "./plan-flash";
import { AchieveDialog, GoalEditModal, GoalSwitcher } from "./PlanGoalDialogs";
import { ReviewEntryModal } from "./PlanReviewEntry";
import { sinceFromDetail } from "./review-model";
import { useLayoutTier, usePlanWrites, v2Path, enc, type LayoutTier } from "./plan-v2-actions";
import { translator, type Translate } from "./PlanParts";
import styles from "./overview.module.css";

/**
 * R24 プラン概要: Task › プラン for an active v2 plan (b10 ⑦, web.html, b8 1024 / 390).
 * Reads `GET /v2/[planId]`; every number comes from the response (`score` is the
 * server's `summarizePlanScore`), so the overview, the home widget and the App agree.
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

function OverviewBody({ planId, language }: { planId: string; language: OrbitLanguage }) {
  const t = translator(language);
  const toast = useToast();
  const tier = useLayoutTier();
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

  if (failed && !detail) return <div data-plan-overview-error=""><RetryCard title={t(planFlowCopy.slotLoadFailed)} onRetry={() => void load()} /></div>;
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

  const actions = { acceptMemo, busy, dismissPending, setStep };
  const buttons = <PlanButtons detail={detail} t={t} busy={busy} onPremise={() => setPremiseOpen(true)} onReview={() => setDialog("review")} onManual={() => void openManualEdit()} onAchieve={() => setDialog("achieve")} />;
  const current = goals.find((goal) => goal.planId === detail.planId) ?? null;
  const plan = <PlanCard detail={detail} t={t} buttons={tier === "narrow" ? buttons : null} />;
  const pending = <PendingBlock detail={detail} t={t} actions={actions} withSteps={tier !== "wide"} />;
  const chance = <ChanceCard detail={detail} t={t} />;
  const footnote = <p className={styles.footnote} data-plan-footnote="">{t(c.footnote)}</p>;

  return (
    <div data-plan-overview={detail.planId} data-tier={tier}>
      <div className={styles.head}>
        <div className={styles.goal}>
          <GoalSwitcher currentPlanId={detail.planId} currentGoal={detail.goal} currentKind={detail.goalKind} goals={goals.length ? goals : [{ goal: detail.goal, goalKind: detail.goalKind, planId: detail.planId, status: "active", talkedPeople: 0, total: detail.score.total }]}
            activeGoalLimit={detail.quota.activeGoalLimit} t={t} language={language} onEdit={() => setDialog("edit")} />
          {goalKindLabel(detail.goalKind, language) ? <Chip label={goalKindLabel(detail.goalKind, language)!} tone="lav" /> : null}
          {detail.sample ? <SampleTag /> : null}
        </div>
        {tier === "narrow"
          ? <span className={styles.push}><IconButton icon="refresh" label={t(c.reviewButton)} soft onClick={() => setDialog("review")} /></span>
          : <div className={styles.actions}>{buttons}</div>}
      </div>
      <ScoreCard detail={detail} t={t} />
      {tier === "wide" ? (
        <div className={styles.wide}>
          <section className={styles.panel} aria-label={t(c.stepsTitle)}>
            <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.stepsTitle)}</h3><span className={styles.label}>{t(c.stepsNote)}</span></div>
            <StepList detail={detail} t={t} actions={actions} />
          </section>
          <section className={styles.panel} aria-label={t(c.typesTitle)}>
            <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.typesTitle)}</h3><span className={styles.label}>{t(c.typesNote)}</span></div>
            <div className={styles.typeGrid}>
              {typeCards(detail).map((card) => <TypeCard key={card.type.key} planId={detail.planId} card={card} t={t} />)}
              <EventCard detail={detail} t={t} />
            </div>
          </section>
          <aside className={styles.stack}>{chance}{pending}{plan}{footnote}</aside>
        </div>
      ) : tier === "medium" ? (
        <div className={styles.medium}>
          <section className={styles.panel} aria-label={t(c.stepsAndTypes)}>
            <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.stepsAndTypes)}</h3><span className={styles.label}>{t(c.stepsNote)}</span></div>
            <GroupedTypeRows detail={detail} t={t} actions={actions} />
          </section>
          <aside className={styles.stack}>{chance}{pending}<RecentAwards detail={detail} t={t} language={language} /><EventCard detail={detail} t={t} />{plan}{footnote}</aside>
        </div>
      ) : (
        <div className={styles.narrow}>
          <StepCarousel detail={detail} t={t} actions={actions} />
          {chance}
          {pending}
          <section className={styles.panel} aria-label={t(c.typesTitle)}>
            <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.typesTitle)}</h3></div>
            {typeCards(detail).map((card) => <TypeRow key={card.type.key} planId={detail.planId} card={card} t={t} />)}
          </section>
          <EventCard detail={detail} t={t} />
          {plan}
          {footnote}
        </div>
      )}
      <PremiseModal open={premiseOpen} detail={detail} t={t} onClose={() => setPremiseOpen(false)} onChange={() => { setPremiseOpen(false); setDialog("review"); }} />
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

/* ---------- スコア + 構成バー ---------- */

function ScoreCard({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const { score } = detail;
  return (
    <section className={styles.scoreCard} data-plan-score={score.total} aria-label={t(planFlowCopy.confirmedScore)}>
      <div>
        <div className={styles.label}>{t(planFlowCopy.confirmedScore)}</div>
        <div className={styles.bigScore}>
          <CountUp value={score.total} className={styles.bigNumber} />
          <span className={styles.outOf}>/ 100</span>
          {score.todayDelta > 0 ? <Chip label={t(c.scoreToday, { n: score.todayDelta })} tone="ok" /> : null}
        </div>
        <div className={styles.label}>{t(planFlowCopy.confirmedScoreNote)}</div>
      </div>
      <div>
        <SegmentBar detail={detail} t={t} />
        <div className={styles.legend} aria-hidden>
          <span><i className={`${styles.swatch} ${styles.part_earned}`} />{t(c.legendTalked)}</span>
          <span><i className={`${styles.swatch} ${styles.part_skipped}`} />{t(c.legendSkipped)}</span>
          {score.overflow > 0 ? <span><i className={`${styles.swatch} ${styles.part_overflow}`} />{t(c.legendOverflow)}</span> : null}
          <span><i className={`${styles.swatch} ${styles.part_rest}`} />{t(c.legendRest)}</span>
        </div>
      </div>
      <div className={styles.scoreSide}>
        <Chip label={score.remainingToFull > 0 ? t(c.scoreRemaining, { n: score.remainingToFull }) : t(c.scoreFull)} tone="lav" />
        <span className={styles.label}>{t(c.scoreSplit, { skipped: score.skipped, talked: score.talked })}</span>
      </div>
    </section>
  );
}

function SegmentBar({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const itemOf = new Map(detail.content.personTypes.map((type) => [type.key, type.itemId]));
  const overflow = overflowParts(detail.score.segments);
  return (
    <div className={styles.bar} role="group" aria-label={t(c.barLabel)} data-plan-bar="">
      {detail.score.segments.map((segment) => {
        const label = t(c.segmentLabel, { allocation: segment.allocation, earned: segment.earned, label: segment.shortLabel });
        const track = (
          <>
            <span className={styles.segTrack} aria-hidden>
              {segmentParts(segment).map((part, index) => (
                <i key={index} className={`${styles.part} ${styles[`part_${part.kind}`]}`} style={{ width: `${(part.value / segment.allocation) * 100}%` }} data-seg-kind={part.kind} />
              ))}
            </span>
            <span className={styles.segLabel} aria-hidden>{segment.shortLabel}</span>
          </>
        );
        const itemId = itemOf.get(segment.key);
        const style = { flex: `${segment.allocation} 1 0` };
        // Every segment opens its type; the event block has no type page.
        return segment.key !== PLAN_EVENT_SEGMENT_KEY && itemId
          ? <Link key={segment.key} href={planTypeHref("web", detail.planId, itemId)} className={`${styles.seg} ${styles.segLink}`} style={style} aria-label={label} data-seg={segment.key}>{track}</Link>
          : <span key={segment.key} className={styles.seg} style={style} role="img" aria-label={label} data-seg={segment.key}>{track}</span>;
      })}
      {overflow.length ? <i className={styles.scaleEnd} aria-hidden /> : null}
      {overflow.map((part) => (
        <span key={`over-${part.key}`} className={`${styles.seg} ${styles.overflowSeg}`} style={{ flex: `${part.value} 1 0` }} role="img" aria-label={`${part.label} +${part.value}`} data-seg={`overflow-${part.key}`}>
          <span className={styles.segTrack} aria-hidden><i className={`${styles.part} ${styles.part_overflow}`} style={{ width: "100%" }} data-seg-kind="overflow" /></span>
          <span className={styles.segLabel} aria-hidden>+{part.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------- 確定した方案 + ボタン ---------- */

function PlanButtons({ detail, t, busy, onPremise, onReview, onManual, onAchieve }: { detail: PlanV2Detail; t: Translate; busy: string | null; onPremise: () => void; onReview: () => void; onManual: () => void; onAchieve: () => void }) {
  const manual = detail.quota.manualEditAvailable;
  const std = useStandardCopy();
  return (
    <>
      <Button size="sm" icon="layers" label={t(c.premiseButton)} onClick={onPremise} />
      <span className={styles.actionWithChip}>
        <Button size="sm" icon="refresh" label={t(c.reviewButton)} onClick={onReview} data-plan-action="review" />
        <Chip label={detail.quota.reviewLeftThisMonth > 0 ? t(c.reviewQuota, { n: detail.quota.reviewMonthlyLimit }) : std.quota.reached} tone={detail.quota.reviewLeftThisMonth > 0 ? "lav" : "coral"} />
      </span>
      <span className={styles.actionWithChip}>
        <Button size="sm" icon="edit" label={t(c.editButton)} disabled={!manual || busy !== null} loading={busy === "manual"} onClick={onManual} data-plan-action="edit" aria-describedby={manual ? undefined : "plan-manual-note"} />
        {manual ? null : <span id="plan-manual-note" className={styles.label} data-plan-manual-note="">{t(r.manualAvailableNote)}</span>}
      </span>
      <Button size="sm" icon="flag" label={t(c.achieveButton)} onClick={onAchieve} data-plan-action="achieve" />
    </>
  );
}

function PlanCard({ detail, t, buttons }: { detail: PlanV2Detail; t: Translate; buttons: ReactNode }) {
  const [full, setFull] = useState(false);
  const basis = [...detail.content.basis.map((item) => item.label), ...detail.content.allocationReasons].join(" · ");
  return (
    <Card data-plan-card="">
      <div className={styles.planCard}>
        <div className={styles.row}>
          <MacTile emoji="🧭" size="sm" />
          <span className={`${styles.grow} ${styles.strong}`}>{t(c.planCardTitle)}</span>
          {basis ? <WhyDisclosure reason={basis} /> : null}
        </div>
        <div>
          <div className={styles.label}>{t(c.diagnosisLabel)}</div>
          <p className={`${styles.muted} ${full ? "" : styles.clamp}`} data-plan-diagnosis="">{detail.content.diagnosis}</p>
          <button type="button" className={`btn ${styles.disclose}`} aria-expanded={full} onClick={() => setFull(!full)}>{t(full ? c.showLess : c.showFull)}</button>
        </div>
        <div>
          <div className={styles.label}>{t(c.conclusionLabel)}</div>
          <p className={styles.conclusion}>{detail.content.conclusion}</p>
        </div>
        {buttons ? <div className={styles.row}>{buttons}</div> : null}
      </div>
    </Card>
  );
}

function PremiseModal({ open, detail, t, onClose, onChange }: { open: boolean; detail: PlanV2Detail; t: Translate; onClose: () => void; onChange: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={t(c.premiseTitle)} description={t(c.premiseNote)} size={480}
      actions={<Button label={t(c.premiseChange)} variant="primary" onClick={onChange} />}>
      <ul className={styles.premiseList} data-plan-premise="">
        {detail.premise.map((row) => (
          <li key={row.key}>
            <span className={styles.label}>{row.label}</span>
            <span>{row.value} {row.guessed ? <Chip label={t(c.premiseGuessed)} tone="apricot" /> : null}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ---------- 今日のチャンス / 確認待ち / 最近の加点 ---------- */

function ChanceCard({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const copy = useStandardCopy();
  const chance = detail.todayChance;
  if (!chance) return null;
  return (
    <section className={styles.chance} data-plan-chance="">
      <div className={styles.row}><span aria-hidden>✨</span><span className={`${styles.grow} ${styles.strong}`}>{t(c.chanceTitle)}</span>{chance.points > 0 ? <Chip label={`+${chance.points}`} tone="lav" /> : null}</div>
      <p className={styles.chanceText}>{chance.label}</p>
      <Link href={chance.href} className={styles.mailLink}>{copy.action.open}</Link>
    </section>
  );
}

function PendingBlock({ detail, t, actions, withSteps }: { detail: PlanV2Detail; t: Translate; actions: Actions; withSteps: boolean }) {
  const pending = detail.pending ?? [];
  const memos = pending.filter((item) => item.kind === "memo_coverage");
  const candidates = pending.filter((item) => item.kind === "candidate").slice(0, 3);
  const steps = withSteps ? detail.stepSuggestions ?? [] : [];
  if (!memos.length && !candidates.length && !steps.length) return null;
  return (
    <section className={styles.tight} aria-label={t(c.pendingTitle)} data-plan-pending="">
      <div className={styles.label}>{t(c.pendingTitle)}</div>
      {memos.map((item) => <MemoCard key={item.id} item={item} detail={detail} t={t} actions={actions} />)}
      {steps.map((suggestion) => {
        const step = detail.content.steps.find((item) => item.key === suggestion.stepKey);
        return step ? <StepSuggestionCard key={suggestion.stepKey} planId={detail.planId} step={step} t={t} actions={actions} /> : null;
      })}
      {candidates.map((item) => (
        <Link key={item.id} href={planTypeHref("web", detail.planId, item.itemId ?? "")} className={styles.pendingCard} data-plan-pending-candidate={item.contactId ?? ""}>
          <span className={styles.muted}>{t(c.candidateFound, { name: item.detail ?? "", type: item.title })}</span>
        </Link>
      ))}
    </section>
  );
}

function MemoCard({ item, detail, t, actions }: { item: PlanPendingItem; detail: PlanV2Detail; t: Translate; actions: Actions }) {
  const [ticked, setTicked] = useState<number[]>([]);
  const type = detail.content.personTypes.find((candidate) => candidate.itemId === item.itemId);
  // R24 复核 m9: the points are the server's (`nextAward`); without them no number is shown,
  // and with no contact the sentence leaves out the name.
  const points = item.points !== undefined && item.points > 0 ? item.points : null;
  const name = item.contactId && item.detail ? item.detail : null;
  const manualText = name ? (points !== null ? t(c.memoManual, { name, points }) : t(c.memoManualNoPoints, { name })) : (points !== null ? t(c.memoManualNoName, { points }) : t(c.memoManualBare));
  const answeredN = item.answered?.length ?? 0;
  const proposalText = name ? (points !== null ? t(c.memoProposal, { n: answeredN, name, points }) : t(c.memoProposalNoPoints, { n: answeredN, name })) : (points !== null ? t(c.memoProposalNoName, { n: answeredN, points }) : t(c.memoProposalBare, { n: answeredN }));
  const busy = actions.busy !== null;
  return (
    <div className={styles.pendingCard} data-plan-memo={item.id} data-manual={item.manual ? "" : undefined}>
      {item.manual ? (
        <>
          <span className={styles.muted}>{manualText}</span>
          <div className={styles.questions}>
            {(type?.questions ?? []).map((question, index) => (
              <label key={index}>
                <Checkbox checked={ticked.includes(index)} label={t(c.questionN, { n: index + 1 })} onChange={(on) => setTicked(on ? [...ticked, index] : ticked.filter((value) => value !== index))} />
                <span>{question}</span>
              </label>
            ))}
          </div>
          {ticked.length < 2 ? <span className={styles.label}>{t(c.memoManualHint)}</span> : null}
        </>
      ) : <span className={styles.muted}>{proposalText}</span>}
      <div className={styles.row}>
        <Button size="sm" label={t(c.memoDismiss)} variant="ghost" disabled={busy} onClick={() => void actions.dismissPending(item.id)} />
        <Button size="sm" label={t(c.memoAccept)} variant="primary" disabled={busy || (item.manual === true && ticked.length < 2)} loading={actions.busy === `accept:${item.id}`}
          onClick={() => void actions.acceptMemo(item, item.manual ? [...ticked].sort() : undefined)} />
      </div>
    </div>
  );
}

function StepSuggestionCard({ planId, step, t, actions }: { planId: string; step: PlanV2Step; t: Translate; actions: Actions }) {
  const copy = useStandardCopy();
  return (
    <div data-plan-step-suggestion={step.key}>
      <ConfirmCard state="pending" title={t(c.stepSuggestion, { title: step.title })} detail={t(c.stepSuggestionNote)}
        actions={[
          { label: t(c.stepNotYet), onSelect: () => void actions.dismissPending(`step:${planId}:${step.key}`) },
          { label: copy.action.complete, onSelect: () => void actions.setStep(step, true), primary: true },
        ]} />
    </div>
  );
}

function RecentAwards({ detail, t, language }: { detail: PlanV2Detail; t: Translate; language: OrbitLanguage }) {
  const awards = detail.recentAwards ?? [];
  const day = new Intl.DateTimeFormat(language, { day: "numeric", month: "numeric" });
  return (
    <Card data-plan-recent="">
      <div className={styles.sectionHead}><h3 className={styles.h3}>{t(c.recentTitle)}</h3></div>
      {awards.length === 0 ? <p className={styles.label}>{t(c.recentEmpty)}</p> : (
        <ul className={styles.plain}>
          {awards.map((award) => (
            <li key={award.awardLogId} className={styles.recent}>
              <span className={styles.strong}>{award.shortLabel}</span>
              <span className={`${styles.label} ${styles.grow}`}>{[award.contactName, day.format(new Date(award.at))].filter(Boolean).join(" · ")}</span>
              {award.basis === "skip" ? <Chip label={t(c.recentSkip)} /> : <span className={`${styles.plus} ${award.part === "overflow" ? styles.plusHalf : ""}`}>+{award.points}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- ステップ ---------- */

function StepList({ detail, t, actions }: { detail: PlanV2Detail; t: Translate; actions: Actions }) {
  const progress = new Map((detail.stepProgress ?? []).map((item) => [item.stepKey, item]));
  const suggestions = new Set((detail.stepSuggestions ?? []).map((item) => item.stepKey));
  const types = new Map(typeCards(detail).map((card) => [card.type.key, card]));
  return (
    <ol className={styles.steps}>
      {detail.content.steps.map((step, index) => (
        <StepItem key={step.key} n={index + 1} step={step} planId={detail.planId} label={progress.get(step.key)?.label ?? null} suggest={suggestions.has(step.key)} types={step.personTypeKeys.map((key) => types.get(key)).filter((card): card is TypeCardView => Boolean(card))} t={t} actions={actions} />
      ))}
    </ol>
  );
}

/**
 * A step's number, or ✓ when done. R24 复核 m8: in all three layouts the ✓ first opens
 * 「完了を取り消す」 and only that button reopens the step.
 */
function StepMark({ n, step, t, actions, render }: { n: number; step: PlanV2Step; t: Translate; actions: Actions; render: (mark: ReactNode, reopen: ReactNode) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const done = Boolean(step.completedAt);
  const mark = done
    ? <button type="button" className={`btn ${styles.stepNo} ${styles.stepNoDone}`} aria-expanded={open} aria-label={`${t(c.stepDone)} ${n}`} onClick={() => setOpen(!open)} data-step-done-mark={step.key}>✓</button>
    : <span className={styles.stepNo} aria-hidden>{n}</span>;
  const reopen = open && done
    ? <div className={styles.reopen}><Button size="sm" variant="ghost" label={t(c.stepReopen)} loading={actions.busy === `step:${step.key}`} disabled={actions.busy !== null} onClick={() => { setOpen(false); void actions.setStep(step, false); }} data-step-reopen={step.key} /></div>
    : null;
  return <>{render(mark, reopen)}</>;
}

function StepItem({ n, step, planId, label, suggest, types, t, actions }: { n: number; step: PlanV2Step; planId: string; label: string | null; suggest: boolean; types: TypeCardView[]; t: Translate; actions: Actions }) {
  const [open, setOpen] = useState(false);
  const done = Boolean(step.completedAt);
  return (
    <li data-plan-step={step.key} data-done={done ? "" : undefined}>
      <div className={styles.stepHead}>
        {done
          ? <button type="button" className={`btn ${styles.stepNo} ${styles.stepNoDone}`} aria-expanded={open} aria-label={`${t(c.stepDone)} ${n}`} onClick={() => setOpen(!open)} data-step-done-mark={step.key}>✓</button>
          : <span className={styles.stepNo} aria-hidden>{n}</span>}
        <span className={styles.stepTitle}>{step.title}</span>
        {done ? <Chip label={t(c.stepDone)} tone="ok" /> : null}
      </div>
      {open && done ? <div className={styles.reopen}><Button size="sm" variant="ghost" label={t(c.stepReopen)} loading={actions.busy === `step:${step.key}`} disabled={actions.busy !== null} onClick={() => { setOpen(false); void actions.setStep(step, false); }} data-step-reopen={step.key} /></div> : null}
      <div className={styles.criteria}>
        <div className={styles.criteriaHead}><span className={`${styles.label} ${styles.grow}`}>{t(c.doneCriteria)}</span>{label ? <Chip label={label} tone="lav" /> : null}</div>
        {step.doneCriteria}
      </div>
      {suggest && !done ? <div className={styles.confirmCard}><StepSuggestionCard planId={planId} step={step} t={t} actions={actions} /></div> : null}
      {types.length ? (
        <div className={styles.typeChips}>
          {types.map((card) => <Link key={card.type.key} href={planTypeHref("web", planId, card.type.itemId)} className={styles.typeChip}>{card.type.emoji} {card.letter} {card.type.shortLabel}</Link>)}
        </div>
      ) : null}
    </li>
  );
}

function StepCarousel({ detail, t, actions }: { detail: PlanV2Detail; t: Translate; actions: Actions }) {
  const cards = new Map(typeCards(detail).map((card) => [card.type.key, card]));
  const chanceItem = detail.todayChance?.href.split("/types/")[1] ?? null;
  return (
    <div className={styles.carousel} role="list" aria-label={t(c.stepsTitle)} data-plan-carousel="">
      {detail.content.steps.map((step, index) => {
        const types = step.personTypeKeys.map((key) => cards.get(key)).filter((card): card is TypeCardView => Boolean(card));
        const earned = types.reduce((sum, card) => sum + Math.min(card.earned, card.type.allocation), 0);
        const allocation = types.reduce((sum, card) => sum + card.type.allocation, 0);
        const on = Boolean(chanceItem && types.some((card) => card.type.itemId === chanceItem));
        return (
          <div key={step.key} role="listitem" className={`${styles.carouselCard} ${on ? styles.carouselOn : ""}`} data-plan-step={step.key} data-done={step.completedAt ? "" : undefined}>
            <StepMark n={index + 1} step={step} t={t} actions={actions} render={(mark, reopen) => <><div className={styles.stepHead}>{mark}<span className={styles.stepTitle}>{step.title}</span></div>{reopen}</>} />
            <div className={styles.row}>
              <span className={styles.emojis} aria-hidden>{types.map((card) => <span key={card.type.key}>{card.type.emoji}</span>)}</span>
              <span className={`${styles.push} ${styles.typePoints}`}>{earned} <small>/ {allocation}</small></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 人物タイプ ---------- */

function typeKicker(card: TypeCardView, t: Translate): string {
  return card.steps.length
    ? t(c.typeKickerSteps, { label: card.type.shortLabel, letter: card.letter, steps: card.steps.join(t(planFlowCopy.listSeparator)) })
    : t(c.typeKicker, { label: card.type.shortLabel, letter: card.letter });
}

function unitsText(allocation: number, targetCount: number, t: Translate): string {
  const units = unitsOf(allocation, targetCount);
  return units.last === null ? t(planFlowCopy.unitsEven, { points: units.points }) : t(c.unitsLast, { last: units.last, points: units.points });
}

function TypeCard({ planId, card, t }: { planId: string; card: TypeCardView; t: Translate }) {
  const { type } = card;
  return (
    <Link href={planTypeHref("web", planId, type.itemId)} className={styles.typeCard} data-type-card={type.key} data-skipped={type.skipped ? "" : undefined}>
      <div className={styles.typeCardHead}>
        <MacTile emoji={type.emoji} size="sm" />
        <div className={styles.grow}>
          <div className={styles.kicker}>{typeKicker(card, t)}</div>
          <div className={styles.typeName}>{type.roleSituation}</div>
        </div>
        <span className={styles.typePoints}>{card.earned} <small>/ {type.allocation}</small></span>
      </div>
      <div className={styles.mini3}>
        <div data-cell="candidates" className={card.candidates === 0 ? styles.cellOff : undefined}><b>{card.candidates}</b><span className={styles.label}>{t(card.candidates === 0 ? c.typeNone : planFlowCopy.sampleCandidates)}</span></div>
        <div data-cell="events"><b>{card.events}</b><span className={styles.label}>{t(planFlowCopy.sampleEvents)}</span></div>
        <div data-cell="routes"><b>{card.introRoutes}</b><span className={styles.label}>{t(planFlowCopy.sampleRoutes)}</span></div>
      </div>
      <TypeProgress card={card} t={t} />
    </Link>
  );
}

function TypeProgress({ card, t }: { card: TypeCardView; t: Translate }) {
  const { type } = card;
  if (type.skipped) return <div className={styles.typeFoot}><span className={styles.label}>{t(c.typeSkipped)}</span><span className={styles.stripeBar} aria-hidden /></div>;
  return (
    <div className={styles.typeFoot}>
      <span className={styles.label}>{t(c.typeProgress, { met: card.met, target: type.targetCount, units: unitsText(type.allocation, type.targetCount, t) })}</span>
      <ProgressBar thin value={type.allocation ? Math.min(1, card.earned / type.allocation) : 0} label={t(c.typeScore, { allocation: type.allocation, earned: card.earned })} />
    </div>
  );
}

function TypeRow({ planId, card, t }: { planId: string; card: TypeCardView; t: Translate }) {
  const { type } = card;
  return (
    <Link href={planTypeHref("web", planId, type.itemId)} className={styles.typeRow} data-type-row={type.key} data-skipped={type.skipped ? "" : undefined}>
      <MacTile emoji={type.emoji} size="sm" />
      <div className={styles.grow}>
        <div className={styles.typeName}>{type.shortLabel}</div>
        <div className={styles.row}>
          {type.skipped ? <Chip label={t(c.recentSkip)} /> : <Chip label={`${card.met} / ${type.targetCount}`} />}
          {!type.skipped ? <Chip label={card.candidates > 0 ? `${t(planFlowCopy.sampleCandidates)} ${card.candidates}` : t(c.typeNone)} tone={card.candidates > 0 ? "lav" : "neutral"} /> : null}
        </div>
      </div>
      <div className={styles.rowScore}>
        <span className={styles.typePoints}>{card.earned} <small>/ {type.allocation}</small></span>
        {type.skipped ? <span className={styles.stripeBar} style={{ width: "100%" }} aria-hidden /> : <ProgressBar thin value={type.allocation ? Math.min(1, card.earned / type.allocation) : 0} label={t(c.typeScore, { allocation: type.allocation, earned: card.earned })} />}
      </div>
    </Link>
  );
}

function GroupedTypeRows({ detail, t, actions }: { detail: PlanV2Detail; t: Translate; actions: Actions }) {
  const progress = new Map((detail.stepProgress ?? []).map((item) => [item.stepKey, item]));
  return (
    <div>
      {stepGroups(detail).map((group) => {
        const step = detail.content.steps.find((item) => item.key === group.stepKey);
        return (
          <div key={group.stepKey ?? "rest"} data-plan-step={group.stepKey ?? undefined} data-done={step?.completedAt ? "" : undefined}>
            {group.stepKey && step ? (
              <StepMark n={group.n} step={step} t={t} actions={actions} render={(mark, reopen) => (
                <>
                  <div className={styles.groupHead}>
                    {mark}
                    <span className={styles.grow}>{group.title}</span>
                    {progress.get(step.key) ? <Chip label={progress.get(step.key)!.label} /> : null}
                  </div>
                  {reopen}
                </>
              )} />
            ) : null}
            {group.types.map((card) => <TypeRow key={card.type.key} planId={detail.planId} card={card} t={t} />)}
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ detail, t }: { detail: PlanV2Detail; t: Translate }) {
  const event = eventView(detail);
  if (event.allocation <= 0) return null;
  return (
    <section className={styles.eventCard} data-plan-event="" aria-label={t(c.eventTitle)}>
      <MacTile emoji="🎟️" size="sm" tone="apricot" />
      <div className={styles.grow}>
        <div className={styles.strong}>{t(c.eventTitle)}</div>
        <div className={styles.label}>{t(c.eventProgress, { count: event.count, points: event.unit, target: event.targetCount })}</div>
        <div className={styles.label}>{t(c.eventNote)}</div>
      </div>
      <span className={styles.typePoints}>{event.earned + event.overflow} <small>/ {event.allocation}</small></span>
    </section>
  );
}
