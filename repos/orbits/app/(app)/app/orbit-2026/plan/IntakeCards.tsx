"use client";

import { useId, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanIntakeView, PlanPremiseRow } from "../../../../../shared/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, PLAN_QUESTION_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_GOAL_TEMPLATES, type PlanQuestionTemplate } from "../../../../../shared/compute/plan-templates";
import { planFlowCopy } from "../copy/plan";
import { pickCopy } from "../copy/types";
import { Icon, useStandardCopy } from "../ui";
import { isGoalKind, type AnswerDraft } from "./plan-model";

export { answersBody, initialAnswers, type AnswerDraft } from "./plan-model";
import type { Translate } from "./PlanParts";
import k from "./FlowKit.module.css";

export function questionTemplate(intake: Pick<PlanIntakeView, "goalKind">, id: string): PlanQuestionTemplate | null {
  if (!isGoalKind(intake.goalKind)) return null;
  return PLAN_GOAL_TEMPLATES[intake.goalKind].questions.find((question) => question.id === id) ?? null;
}

/** Labels of answers given so far (for 「わかったこと」 while answering; no request). */
export function answeredRows(intake: PlanIntakeView, answers: Record<string, AnswerDraft>, language: OrbitLanguage): { label: string; value: string }[] {
  return (intake.questions ?? []).flatMap((question) => {
    const answer = answers[question.id];
    const copy = PLAN_QUESTION_COPY[question.id];
    // Untouched guesses count too: they go into the plan unless changed (b10 knownRail('q')).
    if (!answer || !copy || (!answer.touched && !answer.text.trim() && !answer.values.length)) return [];
    // An untouched guess reads as the guess sentence (what the premise will say), else the chosen options + text.
    const guessText = !answer.touched && !answer.text.trim() ? question.guess?.text ?? null : null;
    const value = guessText ?? [answer.values.map((value) => (copy.options[value] ? planCopy(copy.options[value]!, language) : value)).join(pickCopy(planFlowCopy.listSeparator, language)), answer.text.trim()].filter(Boolean).join(" · ");
    return value ? [{ label: planCopy(copy.topic, language), value }] : [];
  });
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

/** The person's answers as one bubble (b10 ANS): ① … ② … from the premise rows the questions made. */
export function answersBubbleText(intake: Pick<PlanIntakeView, "premise">): string {
  const rows = (intake.premise ?? []).filter((row) => row.source !== "background" && row.source !== "record");
  return rows.map((row, index) => `${CIRCLED[index] ?? `${index + 1}.`} ${row.value}`).join(" ");
}

/** ≤5 問 · Web (b10 「③ 5 問 · Web」): three-column grid, guesses preselected, one submit for all. */
export function QuestionsCard({ intake, answers, onAnswers, busy, submitAnswers, t, language }: {
  intake: PlanIntakeView;
  answers: Record<string, AnswerDraft>;
  onAnswers: (next: Record<string, AnswerDraft>) => void;
  busy: string | null;
  submitAnswers: () => void;
  t: Translate;
  language: OrbitLanguage;
}) {
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const questions = intake.questions ?? [];
  const kind = isGoalKind(intake.goalKind) ? planCopy(PLAN_GOAL_KIND_COPY[intake.goalKind], language) : "";
  const set = (id: string, next: Partial<AnswerDraft>) => onAnswers({ ...answers, [id]: { ...(answers[id] ?? { text: "", touched: false, values: [] }), ...next, touched: true } });
  return (
    <div className={`${k.card} ${k.qCard}`} data-plan-questions="">
      <div className={`${k.row} ${k.qHead}`}>
        <b>{t(planFlowCopy.questionsTitle, { count: questions.length })}</b>
        <span className={k.chip}>{t(planFlowCopy.questionBank, { kind })}</span>
        <button type="button" className={`btn ${k.why}`} aria-expanded={why} aria-controls={whyId} aria-label={t(planFlowCopy.questionsWhy)} onClick={() => setWhy(!why)}>?</button>
      </div>
      {why ? (
        <div id={whyId} className={k.whyBody}>
          {questions.map((question) => <div key={question.id}><b>{question.id}</b> {question.why}</div>)}
        </div>
      ) : null}
      <div className={k.wq5}>
        {questions.map((question, index) => {
          const template = questionTemplate(intake, question.id);
          const copy = PLAN_QUESTION_COPY[question.id];
          const answer = answers[question.id] ?? { text: "", touched: false, values: [] };
          const guessed = !answer.touched && Boolean(question.guess?.text);
          const prompt = copy ? planCopy(copy.prompt, language) : question.id;
          return (
            <fieldset key={question.id} className={k.qb} data-question={question.id}>
              <legend className={`${k.row} ${k.qbHead}`}>
                <span className={k.qno}>{index + 1}</span>
                <b>{prompt}</b>
                <span className={k.qid}>{question.id} {copy ? planCopy(copy.topic, language) : ""}</span>
              </legend>
              <div className={k.qOpts} role="group" aria-label={prompt}>
                {(template?.options ?? []).map((option) => {
                  const on = answer.values.includes(option);
                  return (
                    <button key={option} type="button" aria-pressed={on} className={`btn ${k.fopt} ${on ? k.on : ""}`}
                      onClick={() => set(question.id, { values: template?.type === "multi" ? (on ? answer.values.filter((value) => value !== option) : [...answer.values, option]) : on ? [] : [option] })}>
                      {copy?.options[option] ? planCopy(copy.options[option]!, language) : option}
                    </button>
                  );
                })}
              </div>
              <label className={`${k.qin} ${guessed ? k.qinGuess : ""}`}>
                <Icon name="pen" size={16} />
                <input aria-label={t(planFlowCopy.freeText)} placeholder={question.guess?.text ?? t(planFlowCopy.freeText)} value={answer.text} maxLength={300}
                  onChange={(event) => set(question.id, { text: event.target.value })} />
              </label>
            </fieldset>
          );
        })}
        <div className={k.qSend}>
          <button type="button" className={`btn ${k.btn} ${k.primary}`} disabled={Boolean(busy)} aria-busy={busy === "answers" || undefined} aria-label={t(planFlowCopy.answerAll, { count: questions.length })} onClick={submitAnswers}>{t(planFlowCopy.answerAllWeb)}</button>
          <div className={k.lbl}>{t(planFlowCopy.answerNoteWeb)}</div>
        </div>
      </div>
    </div>
  );
}

function sourceTag(row: PlanPremiseRow, t: Translate): string {
  return row.source === "background" || row.source === "record" ? t(planFlowCopy.premiseSourceBackground) : row.source.toUpperCase();
}

const shortValue = (value: string) => value.split("（")[0]!.split(" · ")[0]!;

/** 「確定した前提」 (b10 premCard): rows with their source, click a row to change it in place; `mini` = chips. */
export function PremiseCard({ intake, busy, onEdit, onMakeDraft, collapsed, hasDraft, t, language, makeOff }: {
  intake: PlanIntakeView;
  busy: string | null;
  onEdit: (key: string, value: string) => Promise<boolean>;
  onMakeDraft?: () => void;
  collapsed: boolean;
  hasDraft: boolean;
  t: Translate;
  language: OrbitLanguage;
  /** The draft cannot be made now (monthly limit / AI down): the button stays, dimmed. */
  makeOff?: boolean;
}) {
  const copy = useStandardCopy();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [option, setOption] = useState("");
  const [text, setText] = useState("");
  const saving = useRef(false);
  const rows = intake.premise ?? [];
  const head = (
    <div className={`${k.row} ${k.premHead}`}>
      <span className={`${k.emo} ${k.emoTeal}`} aria-hidden>📌</span>
      <b>{t(planFlowCopy.premiseTitle)}</b>
      {collapsed && !expanded ? null : <span className={k.lbl}>{t(planFlowCopy.premiseHint)}</span>}
    </div>
  );
  if (collapsed && !expanded) {
    return (
      <div className={`${k.card} ${k.premCard}`} data-plan-premise="collapsed">
        {head}
        <div className={k.premc}>
          {rows.slice(0, 6).map((row) => <span key={row.key} className={k.chip}>{row.label}：{shortValue(row.value)}</span>)}
          <button type="button" className={`btn ${k.v2go}`} onClick={() => setExpanded(true)}>{t(planFlowCopy.showAll)}<Icon name="down" size={16} /></button>
        </div>
      </div>
    );
  }
  const open = (row: PlanPremiseRow) => {
    const template = questionTemplate(intake, row.key);
    const answer = intake.answers?.find((item) => item.questionId === row.key);
    setEditing(row.key);
    setOption(template && answer?.values.length === 1 ? answer.values[0]! : "");
    setText(template ? answer?.text ?? "" : row.value);
  };
  const save = async (row: PlanPremiseRow) => {
    if (saving.current) return;
    const template = questionTemplate(intake, row.key);
    const question = PLAN_QUESTION_COPY[row.key];
    const optionLabel = template && option && question?.options[option] ? planCopy(question.options[option]!, language) : "";
    const value = [optionLabel, text.trim()].filter(Boolean).join(" · ");
    if (!value) return;
    saving.current = true;
    const ok = await onEdit(row.key, value);
    saving.current = false;
    if (ok) setEditing(null);
  };
  return (
    <div className={`${k.card} ${k.premCard}`} data-plan-premise="open">
      {head}
      {rows.map((row) => {
        const template = questionTemplate(intake, row.key);
        const question = PLAN_QUESTION_COPY[row.key];
        if (editing === row.key) {
          return (
            <div key={row.key} className={`${k.prem} ${k.premEdit}`} data-premise-edit={row.key}>
              <span className={k.lbl}>{row.label}</span>
              <div>
                {template && question ? (
                  <div className={k.chips} role="group" aria-label={t(planFlowCopy.premiseChoice)}>
                    {template.options.map((value) => (
                      <button key={value} type="button" aria-pressed={option === value} className={`btn ${k.fopt} ${option === value ? k.on : ""}`} onClick={() => setOption(option === value ? "" : value)}>
                        {question.options[value] ? planCopy(question.options[value]!, language) : value}
                      </button>
                    ))}
                  </div>
                ) : null}
                {template && question ? null : <label className={`${k.qin}`}><Icon name="pen" size={16} /><input aria-label={t(planFlowCopy.premiseValue)} value={text} maxLength={300} onChange={(event) => setText(event.target.value)} /></label>}
                <div className={`${k.row} ${k.premEditActs}`}>
                  <button type="button" className={`btn ${k.btn} ${k.sm} ${k.ghost}`} onClick={() => setEditing(null)}>{copy.action.cancel}</button>
                  <button type="button" className={`btn ${k.btn} ${k.sm} ${k.primary}`} disabled={Boolean(busy) || !(text.trim() || option)} onClick={() => void save(row)}>{t(planFlowCopy.premiseApply)}</button>
                </div>
              </div>
            </div>
          );
        }
        return (
          <button key={row.key} type="button" className={`btn ${k.prem} ${k.premBtn}`} data-premise={row.key} onClick={() => open(row)} disabled={Boolean(busy)}>
            <span className={k.lbl}>{row.label}</span>
            <span>{row.value}</span>
            <span className={k.src}>{row.guessed ? `${sourceTag(row, t)} · ${t(planFlowCopy.guessTag)}` : sourceTag(row, t)}</span>
          </button>
        );
      })}
      {onMakeDraft ? (
        <>
          <button type="button" className={`btn ${k.btn} ${k.primary} ${k.block} ${k.premGo}`} disabled={Boolean(busy) || makeOff} aria-busy={busy === "draft" || undefined} onClick={onMakeDraft}>
            <Icon name="sparkle" size={16} />{t(busy === "draft" ? planFlowCopy.makingDraft : planFlowCopy.makeDraft)}
          </button>
          <div className={`${k.lbl} ${k.premNote}`}>{t(planFlowCopy.makeDraftNote)}</div>
        </>
      ) : null}
    </div>
  );
}
