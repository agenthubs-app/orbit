"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PlanGoalKind, PlanGoalKindResult, PlanIntakeListResponse, PlanIntakeView, PlanV2SummaryResponse } from "../../../../../shared/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_GOAL_TEMPLATES, guessGoalKindByKeywords } from "../../../../../shared/compute/plan-templates";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planReviewCopy } from "../copy/plan";
import { shellCopy } from "../copy/shell";
import { ShellPage } from "../shell/slots";
import Link from "next/link";
import { pickCopy } from "../copy/types";
import { Icon, Orbit2026Scope, useStandardCopy } from "../ui";
import { FmBar, LimitCard, RailHead } from "./FlowParts";
import { newActionKey, planApi } from "./plan-api";
import { flowStage, goalGuessReady, isGoalKind, planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import k from "./FlowKit.module.css";

const GUESS_DELAY_MS = 800;

// b12 W-R23-02a/b/c and W-R23-01-390 (newer than web.html, Q2): the template order, 上市・収益化 first.
const KIND_ORDER: readonly PlanGoalKind[] = ["launch", "fundraising", "sales", "hiring", "partnership", "career"];

/**
 * ① 目標入力: the Task › プラン empty state (web.html 「Task · プラン（目標入力）」, b12
 * W-R23-02a/b/c for 作りかけ / 今月の上限 / 目標 2つ). R25 「＋ 目標を追加」 (`?new=1`)
 * opens the same screen; the プラン tab leads back to the open goal (`backHref` is kept
 * for callers, the design has no back link here).
 */
export function PlanGoalEntry(_props: { backHref?: string } = {}) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  return (
    <Orbit2026Scope language={language} className={k.page}>
      <GoalInput t={t} />
    </Orbit2026Scope>
  );
}

function formatDay(iso: string | Date, language: OrbitLanguage): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { day: "numeric", month: language === "en" ? "short" : "long" }).format(date);
}

function GoalInput({ t }: { t: Translate }) {
  const { language } = useOrbitLanguage();
  const router = useRouter();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<PlanGoalKind | null>(null);
  const [list, setList] = useState<PlanIntakeListResponse | null>(null);
  const [goals, setGoals] = useState<PlanV2SummaryResponse["goals"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlanErrorView | null>(null);
  // Once the person picks a chip, the guess never overwrites it (UI-SPEC ①).
  const chosenByHand = useRef(false);
  // Same text is never sent twice: answers are kept per text.
  const guesses = useRef(new Map<string, PlanGoalKind>());
  const pending = useRef(new Set<string>());
  const latestText = useRef(text);
  latestText.current = text;

  useEffect(() => {
    let alive = true;
    void planApi<PlanIntakeListResponse>("/intakes", { language }).then((result) => { if (alive && result.ok) setList(result.data); });
    return () => { alive = false; };
  }, [language]);

  const atGoalLimit = Boolean(list && list.newGoalsLeftThisMonth > 0 && list.activeGoals >= list.activeGoalLimit);
  useEffect(() => {
    if (!atGoalLimit) return;
    let alive = true;
    void planApi<PlanV2SummaryResponse>("/v2/summary", { language }).then((result) => { if (alive && result.ok) setGoals(result.data.goals.filter((goal) => goal.status === "active")); });
    return () => { alive = false; };
  }, [atGoalLimit, language]);

  useEffect(() => {
    const trimmed = text.trim();
    if (chosenByHand.current || !goalGuessReady(trimmed)) return;
    const known = guesses.current.get(trimmed);
    if (known) { setKind(known); return; }
    const timer = window.setTimeout(() => {
      if (chosenByHand.current || pending.current.has(trimmed)) return;
      pending.current.add(trimmed);
      void planApi<PlanGoalKindResult>("/goal-kind", { body: { text: trimmed }, language }).then((result) => {
        pending.current.delete(trimmed);
        if (!result.ok) return;
        guesses.current.set(trimmed, result.data.goalKind);
        if (!chosenByHand.current && latestText.current.trim() === trimmed) setKind(result.data.goalKind);
      });
    }, GUESS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, language]);

  const monthBlocked = Boolean(list && list.newGoalsLeftThisMonth <= 0);
  const blocked = monthBlocked || atGoalLimit;
  const inProgress = list?.intakes[0] ?? null;

  const start = async () => {
    const goalText = text.trim();
    if (!goalText || busy || blocked) return;
    setBusy(true);
    setError(null);
    const goalKind = kind ?? guessGoalKindByKeywords(goalText);
    const result = await planApi<PlanIntakeView>("/intakes", { body: { goalKind, goalText, idempotencyKey: newActionKey(), source: "task" }, language });
    if (result.ok === false) {
      setBusy(false);
      setError(planErrorView(result.error, "other"));
      return;
    }
    router.push(result.data.href);
  };

  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysLeft = Math.ceil((nextMonth.getTime() - now.getTime()) / 86_400_000);

  return (
    <div className={k.wgrid}>
      {/* b12 W-R23-01-1440 / 02a–c: the goal input's rail is the plan's iOrbit rail (ask about this plan, recent chats). */}
      <ShellPage rightRail={<GoalRail t={t} recent={list?.intakes ?? []} />} />
      {inProgress ? (
        <div className={k.span12} data-plan-resume="">
          <div className={`${k.card} ${k.resumeCard}`}>
            <div className={k.row}>
              <span className={`${k.emo} ${k.emoLav}`} aria-hidden>🧭</span>
              <div className={k.grow}>
                <div className={k.lbl}>{t(planFlowCopy.resumeKicker)}</div>
                <b className={k.resumeGoal} aria-label={t(planFlowCopy.resumeLabel, { goal: inProgress.goal })}>{inProgress.goal}</b>
              </div>
              <button type="button" className={`btn ${k.btn} ${k.sm} ${k.primary}`} onClick={() => router.push(inProgress.href)}>{t(planFlowCopy.resume)}<Icon name="right" size={16} /></button>
            </div>
            <div className={`${k.row} ${k.resumeFoot}`}>
              <div className={k.grow}><FmBar at={flowAt(inProgress.status)} t={t} /></div>
              <span className={`${k.lbl} ${k.nowrap}`}>{t(planFlowCopy.resumeStage, { date: formatDay(inProgress.updatedAt, language), stage: t(FM_LABEL[flowAt(inProgress.status)]!) })}</span>
            </div>
          </div>
        </div>
      ) : null}
      <div className={`${k.card} ${k.span7} ${k.guide} ${k.goalCard}`}>
        <h2 className={k.goalTitle}>{t(planFlowCopy.goalTitle)}</h2>
        <div className={`${k.sub} ${k.goalSub}`}>{t(planFlowCopy.goalLead)}</div>
        <input ref={inputRef} aria-label={t(planFlowCopy.goalInputLabel)} className={k.goalIn} value={text} placeholder={t(planFlowCopy.goalPlaceholder)} maxLength={2000}
          onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void start(); }} />
        <div className={k.kinds} role="group" aria-label={t(planFlowCopy.kindLabel)}>
          {KIND_ORDER.map((key) => (
            <button key={key} type="button" aria-pressed={kind === key} className={`btn ${k.fopt} ${kind === key ? k.on : ""}`}
              onClick={() => { chosenByHand.current = true; setKind(key); }}>
              {`${PLAN_GOAL_TEMPLATES[key].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[key], language)}`}
            </button>
          ))}
        </div>
        {monthBlocked ? (
          <div className={k.goalNote}>
            <LimitCard title={t(planFlowCopy.limitGoalsMonth)} sub={t(planFlowCopy.limitGoalsMonthSub, { date: formatDay(nextMonth, language), days: daysLeft })} data={{ "data-plan-notice": "goalsMonth" }} />
          </div>
        ) : atGoalLimit ? (
          <div className={k.goalNote}>
            <LimitCard title={t(planFlowCopy.limitActiveGoals)} sub={t(planFlowCopy.limitActiveGoalsSub)} data={{ "data-plan-notice": "activeGoals" }} />
            {goals?.length ? (
              <div className={`${k.card} ${k.flat} ${k.activeList}`} data-plan-active-goals="">
                {goals.map((goal) => (
                  <div key={goal.planId} className={k.sumrow}>
                    <span className={`${k.emo} ${k.emoSm28} ${goal.goalKind === "launch" ? k.emoLav : k.emoPink}`} aria-hidden>{isGoalKind(goal.goalKind) ? PLAN_GOAL_TEMPLATES[goal.goalKind].emoji : "🎯"}</span>
                    <div className={k.smm}><b>{goal.goal}</b><span className={k.lbl}>{t(planFlowCopy.activeGoalLine, { score: goal.total })} · {t(planFlowCopy.activeGoalPeople, { count: goal.talkedPeople })}</span></div>
                    <Icon name="right" size={16} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`${k.row} ${k.goalGo}`}>
          <button type="button" className={`btn ${k.btn} ${k.primary} ${k.tall} ${k.goalBtn}`} disabled={blocked || busy} aria-busy={busy || undefined} onClick={() => { if (!text.trim()) { inputRef.current?.focus(); return; } void start(); }}>
            <Icon name="sparkle" size={16} />{t(planFlowCopy.start)}
          </button>
          <span className={`${k.lbl} ${k.deskOnly}`}>{t(planFlowCopy.kindHint)}</span>
        </div>
        {/* b12 W-R23-01-390 (b10 ①): under the button, the flow in one line instead of the side card. */}
        <div className={`${k.lbl} ${k.mobileOnly} ${k.goalSteps}`}>{t(planFlowCopy.flowLine1)}<br />{t(planFlowCopy.flowLine2)}</div>
        {error ? <div className={k.goalNote}><PlanErrorNotice view={error} t={t} onRetry={() => void start()} /></div> : null}
      </div>
      <div className={`${k.card} ${k.span5} ${k.deskOnly}`}>
        <div className={k.cardH}><h3>{t(planFlowCopy.flowTitle)}</h3><span className={k.lbl}>{t(planFlowCopy.flowLimits)}</span></div>
        <ol className={k.v22flow}>
          {([
            [planFlowCopy.flowStep1, planFlowCopy.flowStep1Body],
            [planFlowCopy.flowStep2, planFlowCopy.flowStep2Body],
            [planFlowCopy.flowStep3, planFlowCopy.flowStep3Body],
            [planFlowCopy.flowStep4, planFlowCopy.flowStep4Body],
            [planFlowCopy.flowStep5, planFlowCopy.flowStep5Body],
          ] as const).map(([title, body], index) => (
            <li key={title.en}><span className={k.n}>{index + 1}</span><div><b>{t(title)}</b><span className={k.lbl}>{t(body)}</span></div></li>
          ))}
        </ol>
      </div>
      <SampleTypes t={t} />
    </div>
  );
}

/** b12 goalRail: ✨ iOrbit · 「このプランについて質問」 · 最近の会話 · iOrbit に聞く… ⌘K. */
function GoalRail({ t, recent }: { t: Translate; recent: PlanIntakeListResponse["intakes"] }) {
  const { language } = useOrbitLanguage();
  return (
    <div className={k.rail} data-plan-rail="goal">
      <h4 className={k.railH}><span className={`${k.emo} ${k.emoLav}`} aria-hidden>✨</span>{t(planFlowCopy.iorbitTitle)}</h4>
      <Link href="/app/agent" className={k.assistBox}><Icon name="sparkle" size={16} />{t(planReviewCopy.askAboutPlan)}</Link>
      <div className={`${k.lbl} ${k.recentHead}`}>{t(planFlowCopy.recentChats)}</div>
      {recent.slice(0, 2).map((item) => (
        <Link key={item.intakeId} href={item.href} className={k.recentRow}><Icon name="clock" size={16} /><span className={k.ell}>{t(planFlowCopy.flowSubtitle, { flow: t(planFlowCopy.flowPageTitle), stage: item.goal })}</span></Link>
      ))}
      <span className={k.grow} />
      <Link href="/app/agent" className={k.assistBox}><Icon name="sparkle" size={16} />{pickCopy(shellCopy.railAskPlaceholder, language)}<span className={k.assistKey}>⌘K</span></Link>
    </div>
  );
}

const FM_LABEL = [planFlowCopy.progressShortBackground, planFlowCopy.stageQuestions, planFlowCopy.stageDraft, planFlowCopy.stageFix, planFlowCopy.stageManual];

/** FmBar index for an unfinished intake (background → 0, questions / premise → 1, drafted → 2). */
function flowAt(status: PlanIntakeListResponse["intakes"][number]["status"]): number {
  const stage = flowStage({ status }, null);
  return stage === "background" ? 0 : stage === "questions" ? 1 : 2;
}

/** Static sample person-type cards (web.html V2.tcard, state s0): never a request, never a write. */
function SampleTypes({ t }: { t: Translate }) {
  const { language } = useOrbitLanguage();
  const standard = useStandardCopy();
  // b12 goalWeb / b10 ① (newer than web.html, Q2): b10's types A · B · C (上市・収益化) at 0 points.
  const samples = [
    { cand: 2, emoji: "🎪", events: 2, letter: "A", routes: 1, short: planFlowCopy.sampleShortA, slot: "first_payer", steps: "1・2・4", target: 5, text: planFlowCopy.sampleTypeA, tone: k.emoLav, units: planFlowCopy.sampleUnitsA, weight: 20 },
    { cand: 0, emoji: "🎨", events: 3, letter: "B", routes: 1, short: planFlowCopy.sampleShortB, slot: "brand_pr", steps: "1・3・4", target: 2, text: planFlowCopy.sampleTypeB, tone: k.emoPink, units: planFlowCopy.sampleUnitsB, weight: 20 },
    { cand: 0, emoji: "📇", events: 2, letter: "C", routes: 2, short: planFlowCopy.sampleShortC, slot: "prior_product", steps: "2・5", target: 2, text: planFlowCopy.sampleTypeC, tone: k.emoTeal, units: planFlowCopy.sampleUnitsC, weight: 15 },
  ];

  return (
    <div className={`${k.card} ${k.span12} ${k.sampleCard}`} data-plan-sample="">
      <div className={k.cardH}>
        <h3>{t(planFlowCopy.sampleTitle)} <span className={k.sampleTag}>{standard.sample.tag}</span></h3>
        <span className={`${k.lbl} ${k.deskOnly}`}>{t(planFlowCopy.sampleNote)}</span>
      </div>
      <div className={`${k.faded} ${k.tgrid}`} aria-hidden>
        {samples.map((sample) => {
          const short = t(sample.short);
          return (
            <div key={sample.slot} className={k.tc}>
              <div className={k.row} style={{ alignItems: "flex-start" }}>
                <span className={`${k.emo} ${sample.tone}`}>{sample.emoji}</span>
                <div className={k.grow}>
                  <div className={k.tk}>{t(planFlowCopy.sampleKickerType, { letter: sample.letter, short, steps: sample.steps })}</div>
                  <b className={k.tn}>{t(sample.text)}</b>
                </div>
                <div className={k.pp}>0<small> / {sample.weight}</small></div>
              </div>
              <div className={k.m3}>
                <div className={sample.cand ? undefined : k.z}><b>{sample.cand}<small>{t(planFlowCopy.samplePeople)}</small></b><span>{t(sample.cand ? planFlowCopy.sampleCandidates : planFlowCopy.sampleNotInNetwork)}</span></div>
                <div className={sample.events ? undefined : k.z}><b>{sample.events}</b><span>{t(planFlowCopy.sampleEvents)}</span></div>
                <div className={sample.routes ? undefined : k.z}><b>{sample.routes}</b><span>{t(planFlowCopy.sampleRoutes)}</span></div>
              </div>
              <div className={k.tf}><span className={k.lbl}>{t(planFlowCopy.sampleProgressType, { target: sample.target, units: t(sample.units) })}</span><div className={k.mb} /></div>
            </div>
          );
        })}
      </div>
      <div className={`${k.lbl} ${k.mobileOnly} ${k.sampleFoot}`}>{t(planFlowCopy.sampleNoteShort)}</div>
    </div>
  );
}
