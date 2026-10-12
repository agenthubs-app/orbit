"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanAchievementView, PlanIntakeView, PlanNextGoalCandidate, PlanNextGoalsResponse, PlanQuotaResponse, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { planNewGoalHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planReviewCopy as r } from "../copy/plan";
import { standardCopyFor } from "../copy/standard";
import { ShellPage } from "../shell/slots";
import { CountUp, Icon, Orbit2026Scope, RetryCard, Skeleton, ToastProvider } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { isGoalKind, planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import { monthDay } from "./review-model";
import k from "./ReviewKit.module.css";
import d from "./DoneScreen.module.css";

const OWN = "own";
const TONES = [k.teal, k.blue] as const;

/**
 * 達成 → 次の目標（b4「Web 達成 → 次の目標」, b12 W-R25-08b）: `/app/plans/[planId]/done`.
 * Left: one quiet card (🏁, the goal, three big numbers, いちばん効いたこと, skipped areas);
 * right: the next goal — up to two ideas from the records (C10) and 「自分で決める」.
 * Nothing is made until the person picks one; a candidate starts the same generation
 * flow as the first plan (`POST /intakes`, source next_goal). The ideas are read when the
 * page opens (2026-10-12 用户定稿：照设计稿；C10 每计划只调一次，服务端缓存，刷新 / 重开只读缓存).
 */
export function PlanDoneScreen({ planId }: { planId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  const [done, setDone] = useState<PlanAchievementView | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [next, setNext] = useState<PlanNextGoalsResponse | null>(null);
  const [quota, setQuota] = useState<PlanQuotaResponse | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const [result, limits, detail] = await Promise.all([
      planApi<PlanAchievementView>(`/v2/${encodeURIComponent(planId)}/achievement`, { language }),
      planApi<PlanQuotaResponse>("/v2/quota", { language }),
      planApi<PlanV2Detail>(`/v2/${encodeURIComponent(planId)}`, { language }),
    ]);
    if (!result.ok) { setFailed(true); return; }
    setDone(result.data);
    setQuota(limits.ok ? limits.data : null);
    setStartsOn(result.data.startsOn ?? (detail.ok ? detail.data.startsOn : null));
    const goals = await planApi<PlanNextGoalsResponse>(`/v2/${encodeURIComponent(planId)}/next-goals`, { language });
    // C10 unavailable → only 「自分で決める」.
    setNext(goals.ok ? goals.data : { candidates: [], source: "none" });
  }, [planId, language]);

  useEffect(() => { void load(); }, [load]);

  const subtitle = done
    ? startsOn
      ? t(r.doneSubFull, { date: monthDay(done.achievedAt, language), goal: done.goal, start: monthDay(startsOn, language) })
      : t(r.doneSubShort, { date: monthDay(done.achievedAt, language), goal: done.goal })
    : undefined;
  const back = planTaskSegmentHref("web");
  const shell = <ShellPage title={t(r.doneTitle)} subtitle={subtitle} rightRail={false}
    left={<Link href={back} className={`btn ${k.rbtn}`} aria-label={standardCopyFor(language).nav.back} data-plan-done-back=""><Icon name="left" size={20} /></Link>} />;
  return (
    <Orbit2026Scope language={language} className={k.page}>
      <ToastProvider>
        {shell}
        {failed ? <div data-plan-done-error=""><RetryCard title={t(r.doneLoadFailed)} onRetry={() => void load()} /></div>
          : !done ? <Skeleton lines={8} />
          : (
            <div className={d.wgrid} data-plan-done={done.planId}>
              <Recap done={done} t={t} />
              <NextGoals next={next} quota={quota} t={t} language={language} />
            </div>
          )}
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function Recap({ done, t }: { done: PlanAchievementView; t: Translate }) {
  const [why, setWhy] = useState(false);
  return (
    <section className={`${k.card} ${d.span7} ${d.cele}`} data-plan-done-recap="">
      <span className={`${k.emo} ${k.teal} ${d.flag}`} aria-hidden>🏁</span>
      <div className={d.headline}>{t(r.doneHeadline, { goal: done.goal })}</div>
      <div className={k.sub}>{t(r.doneLead, { score: done.total })}</div>
      <div className={d.stat3}>
        <div data-plan-done-stat="total"><span className={k.lbl}>{t(r.doneScore)}</span><div className={d.big}><CountUp value={done.total} /></div></div>
        <div data-plan-done-stat="talked"><span className={k.lbl}>{t(r.doneTalked)}</span><div className={d.big}><CountUp value={done.talkedPeople} /><small>{t(r.unitPeople)}</small></div></div>
        <div data-plan-done-stat="events"><span className={k.lbl}>{t(r.doneEvents)}</span><div className={d.big}><CountUp value={done.events} /><small>{t(r.unitTimes)}</small></div></div>
      </div>
      {done.bestMove ? (
        <div className={d.best} data-plan-done-best="" aria-label={t(r.bestMove)}>
          <div className={k.row} style={{ gap: 8 }}>
            <span className={`${k.emo} ${k.emoSm} ${k.lav}`} aria-hidden>✨</span>
            <b className={d.bestText}>{done.bestMove.text}</b>
            {done.bestMove.basis.length ? <button type="button" className={`btn ${k.why}`} aria-expanded={why} onClick={() => setWhy((open) => !open)}>?</button> : null}
          </div>
          {why ? <div className={k.whyBody}>{t(r.evidence, { text: done.bestMove.basis.map((item) => item.label).join(" · ") })}</div> : null}
        </div>
      ) : null}
      {done.skippedAreas.length ? (
        <div className={`${k.row} ${d.skipped}`} data-plan-done-skipped="">
          <span className={d.hatch} aria-hidden />
          <span className={k.lbl}>{t(r.skippedAreas, { list: done.skippedAreas.join(" · ") })}</span>
        </div>
      ) : null}
    </section>
  );
}

function NextHead({ t }: { t: Translate }) {
  return (
    <div className={`${k.row} ${k.between}`}>
      <b className={d.nextHead}>{t(r.nextTitle)}</b>
      <span className={k.lbl}>{t(r.nextNote)}</span>
    </div>
  );
}

function NextGoals({ next, quota, t, language }: { next: PlanNextGoalsResponse | null; quota: PlanQuotaResponse | null; t: Translate; language: OrbitLanguage }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>(OWN);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
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
    <div className={d.span5} data-plan-next="">
      <NextHead t={t} />
      {!next ? <Skeleton lines={3} /> : (
        <>
          {candidates.map((candidate, index) => {
            const id = String(index);
            const on = picked === id;
            const basis = candidate.basis.map((item) => item.label).join(" · ");
            // b4: the picked card shows its basis; the others open it with 「?」.
            const showWhy = basis && (on || whyOpen === id);
            return (
              <div key={id} role="radio" aria-checked={on} tabIndex={0} className={`${d.opt} ${on ? d.on : ""}`}
                onClick={() => setPicked(id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(id); } }} data-plan-next-candidate={index}>
                <span className={d.radio} aria-hidden />
                <div className={k.grow}>
                  <div className={k.row} style={{ gap: 8 }}>
                    <span className={`${k.emo} ${k.emoSm} ${TONES[index % TONES.length]}`} aria-hidden>{isGoalKind(candidate.goalKind) ? PLAN_GOAL_TEMPLATES[candidate.goalKind].emoji : "🎯"}</span>
                    <b className={d.optTitle}>{candidate.goalText}</b>
                    {basis ? <button type="button" className={`btn ${k.why}`} aria-expanded={Boolean(showWhy)} onClick={(event) => { event.stopPropagation(); setWhyOpen((open) => (open === id ? null : id)); }}>?</button> : null}
                  </div>
                  {candidate.subtitle ? <div className={`${k.sub} ${d.optSub}`} data-plan-next-subtitle="">{candidate.subtitle}</div> : null}
                  {showWhy ? <div className={k.whyBody} data-plan-next-basis="">{t(r.evidence, { text: basis })}</div> : null}
                </div>
              </div>
            );
          })}
          <div role="radio" aria-checked={picked === OWN} tabIndex={0} className={`${d.opt} ${picked === OWN ? d.on : ""}`}
            onClick={() => setPicked(OWN)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(OWN); } }} data-plan-next-own="">
            <span className={d.radio} aria-hidden />
            <div className={k.row} style={{ gap: 8 }}>
              <span className={`${k.emo} ${k.emoSm} ${k.apricot}`} aria-hidden>✏️</span>
              <b>{t(r.ownGoal)}</b>
            </div>
          </div>
        </>
      )}
      {error ? <PlanErrorNotice view={error} t={t} onRetry={() => void start()} /> : null}
      <div className={`${k.row} ${d.foot}`}>
        {full
          ? <span className={k.lbl} data-plan-next-limit=""><b style={{ color: "var(--ink)" }}>{t(r.goalLimit)}</b>{t(r.goalLimitHow)}</span>
          : <span className={k.lbl}>{t(r.nextHint)}</span>}
        <button type="button" className={`btn ${k.btn} ${k.primary} ${full ? k.dim : ""}`} style={{ flex: "none" }} disabled={full || !next || busy} aria-busy={busy || undefined} onClick={() => void start()} data-plan-next-start=""><Icon name="sparkle" size={16} />{t(r.nextStart)}</button>
      </div>
    </div>
  );
}
