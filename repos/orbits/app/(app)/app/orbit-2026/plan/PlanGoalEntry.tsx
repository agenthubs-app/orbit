"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { PlanGoalKind, PlanGoalKindResult, PlanIntakeListResponse, PlanIntakeView } from "../../../../../shared/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, PLAN_SHORT_NAME_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES, guessGoalKindByKeywords } from "../../../../../shared/compute/plan-templates";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy } from "../copy/plan";
import { Button, Card, Chip, FilterOption, Orbit2026Scope, SampleTag } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { goalGuessReady, planErrorView, type PlanErrorView } from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import styles from "./plan.module.css";

const GUESS_DELAY_MS = 800;

/** ① 目標入力: the Task › プラン empty state (UI-SPEC ①, web.html 「Task · プラン（目標入力）」). */
export function PlanGoalEntry() {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  return (
    <Orbit2026Scope language={language} className={styles.slot}>
      <GoalInput t={t} />
    </Orbit2026Scope>
  );
}

function GoalInput({ t }: { t: Translate }) {
  const { language } = useOrbitLanguage();
  const router = useRouter();
  const inputId = useId();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PlanGoalKind | null>(null);
  const [list, setList] = useState<PlanIntakeListResponse | null>(null);
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

  const blocked: PlanErrorView | null = list && list.newGoalsLeftThisMonth <= 0 ? { notice: "goalsMonth", tone: "notice" }
    : list && list.activeGoals >= list.activeGoalLimit ? { notice: "activeGoals", tone: "notice" } : null;
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

  return (
    <div className={styles.grid}>
      <Card className={styles.span7}>
        {inProgress ? (
          <div className={styles.resume} data-plan-resume="">
            <span>{t(planFlowCopy.resumeLabel, { goal: inProgress.goal })}</span>
            <Button size="sm" label={t(planFlowCopy.resume)} onClick={() => router.push(inProgress.href)} />
          </div>
        ) : null}
        <h2 className={styles.goalTitle}>{t(planFlowCopy.goalTitle)}</h2>
        <p className={styles.goalLead}>{t(planFlowCopy.goalLead)}</p>
        <label className={styles.label} htmlFor={inputId}>{t(planFlowCopy.goalInputLabel)}</label>
        <input id={inputId} className={styles.goalInput} value={text} placeholder={t(planFlowCopy.goalPlaceholder)} maxLength={2000}
          onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void start(); }} />
        <div className={`${styles.kinds} ${styles.options}`} role="group" aria-label={t(planFlowCopy.kindLabel)}>
          {PLAN_GOAL_KINDS.map((key) => (
            <FilterOption key={key} selected={kind === key} label={`${PLAN_GOAL_TEMPLATES[key].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[key], language)}`}
              onToggle={() => { chosenByHand.current = true; setKind(key); }} />
          ))}
        </div>
        <div className={`${styles.row} ${styles.startRow}`}>
          <Button variant="primary" icon="sparkle" label={t(planFlowCopy.start)} loading={busy} disabled={!text.trim() || Boolean(blocked)} onClick={() => void start()} />
          <span className={styles.label}>{t(planFlowCopy.kindHint)}</span>
        </div>
        <p className={styles.preview}>{t(planFlowCopy.flowLine1)}<br />{t(planFlowCopy.flowLine2)}</p>
        {blocked ? <PlanErrorNotice view={blocked} t={t} /> : error ? <PlanErrorNotice view={error} t={t} onRetry={() => void start()} /> : null}
      </Card>
      <Card className={styles.span5} title={t(planFlowCopy.flowTitle)} trailing={<Chip label={t(planFlowCopy.flowLimits)} />}>
        <ol className={styles.flowList}>
          {([
            [planFlowCopy.flowStep1, planFlowCopy.flowStep1Body],
            [planFlowCopy.flowStep2, planFlowCopy.flowStep2Body],
            [planFlowCopy.flowStep3, planFlowCopy.flowStep3Body],
            [planFlowCopy.flowStep4, planFlowCopy.flowStep4Body],
            [planFlowCopy.flowStep5, planFlowCopy.flowStep5Body],
          ] as const).map(([title, body], index) => (
            <li key={title.en}><span className={styles.num}>{index + 1}</span><div><b>{t(title)}</b><span className={styles.label}>{t(body)}</span></div></li>
          ))}
        </ol>
      </Card>
      <SampleTypes t={t} />
    </div>
  );
}

/** Static sample person-type cards: never a request, never a write (UI-SPEC ①). */
function SampleTypes({ t }: { t: Translate }) {
  const { language } = useOrbitLanguage();
  const slots = PLAN_GOAL_TEMPLATES.fundraising.slots;
  const samples = [
    { slot: "vc_partner", text: planFlowCopy.sampleVc, numbers: [3, 2, 1] },
    { slot: "angel", text: planFlowCopy.sampleAngel, numbers: [2, 1, 1] },
    { slot: "cvc", text: planFlowCopy.sampleCvc, numbers: [1, 2, 0] },
  ];
  return (
    <Card className={styles.span12} data-plan-sample="" title={t(planFlowCopy.sampleTitle)} trailing={<SampleTag />}>
      <p className={styles.label}>{t(planFlowCopy.sampleNote)}</p>
      <div className={styles.sampleGrid} aria-hidden>
        {samples.map((sample, index) => (
          <div key={sample.slot} className={styles.typeCard}>
            <div className={styles.row}>
              <span className={styles.emoji}>{slots.find((slot) => slot.slot === sample.slot)?.emoji}</span>
              <span className={styles.typeKey}>{String.fromCharCode(65 + index)} {PLAN_SHORT_NAME_COPY[sample.slot] ? planCopy(PLAN_SHORT_NAME_COPY[sample.slot]!, language) : ""}</span>
            </div>
            <b className={styles.typeName}>{t(sample.text)}</b>
            <div className={styles.mini3}>
              {[planFlowCopy.sampleCandidates, planFlowCopy.sampleEvents, planFlowCopy.sampleRoutes].map((label, cell) => (
                <div key={label.en}><b>{sample.numbers[cell]}</b><span className={styles.label}>{t(label)}</span></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
