"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanAchievementView, PlanIntakeView, PlanNextGoalCandidate, PlanNextGoalsResponse, PlanQuotaResponse } from "../../../../../shared/contract/plan-v2";
import { planNewGoalHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { PLAN_GOAL_KIND_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planReviewCopy as r } from "../copy/plan";
import { ShellPage } from "../shell/slots";
import { Button, Card, Chip, CountUp, MacTile, Orbit2026Scope, RetryCard, SampleTag, Skeleton, ToastProvider, WhyDisclosure } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { isGoalKind, planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import { fullDate } from "./review-model";
import styles from "./review.module.css";

const OWN = "own";

/**
 * 達成 ② ③（b4 A5 + Web）: `/app/plans/[planId]/done`. A quiet look back (three big
 * numbers, no confetti), いちばん効いたこと with its basis, skipped areas, then up to two
 * next goals from the records (C10, once per plan) and 「自分で決める」. Nothing is made
 * until the person picks one: a candidate starts the same generation flow as the first
 * plan (`POST /intakes`, source next_goal).
 */
export function PlanDoneScreen({ planId }: { planId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const [done, setDone] = useState<PlanAchievementView | null>(null);
  const [failed, setFailed] = useState(false);
  const [next, setNext] = useState<PlanNextGoalsResponse | null>(null);
  const [asked, setAsked] = useState(false);
  const [quota, setQuota] = useState<PlanQuotaResponse | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const [result, limits] = await Promise.all([
      planApi<PlanAchievementView>(`/v2/${encodeURIComponent(planId)}/achievement`, { language }),
      planApi<PlanQuotaResponse>("/v2/quota", { language }),
    ]);
    if (!result.ok) { setFailed(true); return; }
    setDone(result.data);
    setQuota(limits.ok ? limits.data : null);
  }, [planId, language]);

  // R25 复核 m3 (DESIGN §2.9): the next-goal ideas (C10) are asked for only when the person
  // presses 「次の目標を決める」 — looking back at a finished goal costs nothing.
  const askNext = useCallback(async () => {
    setAsked(true);
    const goals = await planApi<PlanNextGoalsResponse>(`/v2/${encodeURIComponent(planId)}/next-goals`, { language });
    // C10 unavailable → only 「自分で決める」.
    setNext(goals.ok ? goals.data : { candidates: [], source: "none" });
  }, [planId, language]);

  useEffect(() => { void load(); }, [load]);

  const shell = <ShellPage title={t(r.doneTitle)} subtitle={done ? `${done.goal} · ${t(r.doneSub, { date: fullDate(done.achievedAt, language) })}` : undefined} />;
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        {shell}
        {failed ? <div data-plan-done-error=""><RetryCard title={t(r.doneLoadFailed)} onRetry={() => void load()} /></div>
          : !done ? <Skeleton lines={8} />
          : (
            <div className={styles.columns} data-plan-done={done.planId}>
              <Recap done={done} t={t} />
              {asked ? <NextGoals planId={planId} next={next} quota={quota} t={t} language={language} /> : <NextIntro onDecide={() => void askNext()} t={t} />}
            </div>
          )}
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function Recap({ done, t }: { done: PlanAchievementView; t: Translate }) {
  return (
    <div className={styles.column}>
      <Card data-plan-done-recap="">
        <div className={styles.recapHead}>
          <MacTile emoji="🏁" />
          <div className={styles.grow}>
            <b className={styles.recapTitle}>{t(r.doneHeadline, { goal: done.goal })}</b>
            {done.sample ? <SampleTag /> : null}
          </div>
        </div>
        <p className={styles.body}>{t(r.doneLead, { score: done.total })}</p>
        <div className={styles.big3}>
          <div data-plan-done-stat="total"><CountUp value={done.total} className={styles.bigNumber} /><span className={styles.label}>{t(r.doneScore)}</span></div>
          <div data-plan-done-stat="talked"><CountUp value={done.talkedPeople} className={styles.bigNumber} /><span className={styles.label}>{t(r.doneTalked)}</span></div>
          <div data-plan-done-stat="events"><CountUp value={done.events} className={styles.bigNumber} /><span className={styles.label}>{t(r.doneEvents)}</span></div>
        </div>
      </Card>
      {done.bestMove ? (
        <section className={styles.best} data-plan-done-best="">
          <div className={styles.row}><span aria-hidden>✨</span><b className={styles.grow}>{t(r.bestMove)}</b>{done.bestMove.basis.length ? <WhyDisclosure reason={done.bestMove.basis.map((item) => item.label).join(" · ")} /> : null}</div>
          <p className={styles.body}>{done.bestMove.text}</p>
        </section>
      ) : null}
      {done.skippedAreas.length ? <p className={styles.skipped} data-plan-done-skipped="">{t(r.skippedAreas, { list: done.skippedAreas.join(" · ") })}</p> : null}
    </div>
  );
}

/** Before asking: what comes next, 「次の目標を決める」 and a way back. */
function NextIntro({ onDecide, t }: { onDecide: () => void; t: Translate }) {
  const router = useRouter();
  return (
    <div className={styles.column}>
      <Card data-plan-next-intro="">
        <div className={styles.rowBetween}><b>{t(r.nextTitle)}</b><span className={styles.label}>{t(r.nextNote)}</span></div>
        <p className={styles.body}>{t(r.nextIntro)}</p>
        <div className={styles.actionsRow}>
          <Button variant="ghost" label={t(r.later)} onClick={() => router.push(planTaskSegmentHref("web"))} data-plan-next-later="" />
          <span className={styles.push} />
          <Button variant="primary" icon="sparkle" label={t(r.nextDecide)} onClick={onDecide} data-plan-next-decide="" />
        </div>
      </Card>
    </div>
  );
}

function NextGoals({ planId, next, quota, t, language }: { planId: string; next: PlanNextGoalsResponse | null; quota: PlanQuotaResponse | null; t: Translate; language: OrbitLanguage }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>(OWN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlanErrorView | null>(null);
  const candidates = (next?.candidates ?? []).slice(0, 2);
  useEffect(() => { if (candidates.length) setPicked("0"); }, [candidates.length]);
  const full = quota !== null && quota.activeGoals >= quota.activeGoalLimit;

  const start = async () => {
    if (busy || full) return;
    if (picked === OWN) { router.push(planNewGoalHref("web")); return; }
    const candidate: PlanNextGoalCandidate | undefined = candidates[Number(picked)];
    if (!candidate) return;
    setBusy(true);
    setError(null);
    const result = await planApi<PlanIntakeView>("/intakes", { body: { goalKind: candidate.goalKind, goalText: candidate.goalText, idempotencyKey: newActionKey(), source: "next_goal" }, language });
    setBusy(false);
    if (result.ok === false) { setError(planErrorView(result.error, "other")); return; }
    router.push(result.data.href);
  };

  return (
    <div className={styles.column}>
      <Card data-plan-next="">
        <div className={styles.rowBetween}>
          <b>{t(r.nextTitle)}</b>
          <span className={styles.label}>{t(r.nextNote)}</span>
        </div>
        {!next ? <Skeleton lines={3} /> : (
          <div className={styles.options} role="radiogroup" aria-label={t(r.nextTitle)}>
            {candidates.length ? <span className={styles.label}>{t(r.nextFromRecords, { n: candidates.length })}</span> : null}
            {candidates.map((candidate, index) => {
              const on = picked === String(index);
              return (
                <button key={index} type="button" role="radio" aria-checked={on} className={`btn ${styles.option} ${on ? styles.optionOn : ""}`} onClick={() => setPicked(String(index))} data-plan-next-candidate={index}>
                  <MacTile emoji={isGoalKind(candidate.goalKind) ? PLAN_GOAL_TEMPLATES[candidate.goalKind].emoji : "🎯"} size="sm" />
                  <span className={styles.grow}>
                    <b className={styles.menuTitle}>{candidate.goalText}</b>
                    {isGoalKind(candidate.goalKind) ? <Chip label={planCopy(PLAN_GOAL_KIND_COPY[candidate.goalKind], language)} tone="lav" /> : null}
                    {on && candidate.basis.length ? <span className={styles.label} data-plan-next-basis="">{candidate.basis.map((item) => item.label).join(" · ")}</span> : null}
                  </span>
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={picked === OWN} className={`btn ${styles.option} ${picked === OWN ? styles.optionOn : ""}`} onClick={() => setPicked(OWN)} data-plan-next-own="">
              <MacTile emoji="✏️" size="sm" tone="apricot" />
              <span className={styles.grow}><b className={styles.menuTitle}>{t(r.ownGoal)}</b><span className={styles.label}>{t(r.ownGoalSub)}</span></span>
            </button>
          </div>
        )}
        {full ? <p className={styles.notice} data-plan-next-limit="">{t(r.goalLimit)}</p> : null}
        {error ? <PlanErrorNotice view={error} t={t} onRetry={() => void start()} /> : null}
        <div className={styles.actionsRow}>
          <Button variant="ghost" label={t(r.later)} onClick={() => router.push(planTaskSegmentHref("web"))} data-plan-next-later="" />
          <span className={styles.push} />
          <Button variant="primary" icon="sparkle" label={t(r.nextStart)} loading={busy} disabled={full || !next || busy} onClick={() => void start()} data-plan-next-start="" />
        </div>
        <p className={styles.label}>{t(r.nextHint)}</p>
      </Card>
    </div>
  );
}
