"use client";

import { useId, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanIntakeView, PlanPremiseRow } from "../../../../../shared/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, PLAN_QUESTION_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_GOAL_TEMPLATES, type PlanQuestionTemplate } from "../../../../../shared/compute/plan-templates";
import { planFlowCopy } from "../copy/plan";
import { pickCopy } from "../copy/types";
import { Button, Card, Chip, ConfirmCard, FilterOption, useStandardCopy } from "../ui";
import { isGoalKind, type AnswerDraft } from "./plan-model";

export { answersBody, initialAnswers, type AnswerDraft } from "./plan-model";
import type { Translate } from "./PlanParts";
import styles from "./plan.module.css";

export function questionTemplate(intake: Pick<PlanIntakeView, "goalKind">, id: string): PlanQuestionTemplate | null {
  if (!isGoalKind(intake.goalKind)) return null;
  return PLAN_GOAL_TEMPLATES[intake.goalKind].questions.find((question) => question.id === id) ?? null;
}

/** Labels of answers given so far (for 「わかったこと」 while answering; no request). */
export function answeredRows(intake: PlanIntakeView, answers: Record<string, AnswerDraft>, language: OrbitLanguage): { label: string; value: string }[] {
  return (intake.questions ?? []).flatMap((question) => {
    const answer = answers[question.id];
    const copy = PLAN_QUESTION_COPY[question.id];
    if (!answer || !copy || (!answer.touched && !answer.text.trim())) return [];
    const value = [answer.values.map((value) => (copy.options[value] ? planCopy(copy.options[value]!, language) : value)).join(pickCopy(planFlowCopy.listSeparator, language)), answer.text.trim()].filter(Boolean).join(" · ");
    return value ? [{ label: planCopy(copy.topic, language), value }] : [];
  });
}

/** ≤5 問: one card, Web three-column grid, one submit for all (UI-SPEC ②). */
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
    <Card data-plan-questions="">
      <div className={`${styles.row} ${styles.between}`}>
        <b className={styles.h3}>{t(planFlowCopy.questionsTitle, { count: questions.length })}</b>
        <span className={styles.row}>
          <span className={styles.label}>{t(planFlowCopy.questionBank, { kind })}</span>
          <button type="button" className={`btn ${styles.iconButton}`} aria-expanded={why} aria-controls={whyId} aria-label={t(planFlowCopy.questionsWhy)} onClick={() => setWhy(!why)}>?</button>
        </span>
      </div>
      {why ? (
        <ul id={whyId} className={styles.whyList}>
          {questions.map((question) => <li key={question.id}><b>{question.id}</b> {question.why}</li>)}
        </ul>
      ) : null}
      <div className={`${styles.questionGrid} ${styles.field}`}>
        {questions.map((question, index) => {
          const template = questionTemplate(intake, question.id);
          const copy = PLAN_QUESTION_COPY[question.id];
          const answer = answers[question.id] ?? { text: "", touched: false, values: [] };
          const guessed = !answer.touched && Boolean(question.guess?.values.length);
          return (
            <fieldset key={question.id} className={styles.question} data-question={question.id}>
              <legend className={styles.questionPrompt}>
                <span className={`${styles.row} ${styles.between}`}>
                  <span className={styles.num}>{index + 1}</span>
                  <span className={styles.questionId}>{question.id} {copy ? planCopy(copy.topic, language) : ""}</span>
                </span>
                {copy ? planCopy(copy.prompt, language) : question.id}
              </legend>
              <div className={`${styles.options} ${guessed ? styles.guessed : ""}`} role="group" aria-label={copy ? planCopy(copy.prompt, language) : question.id}>
                {(template?.options ?? []).map((option) => {
                  const on = answer.values.includes(option);
                  return (
                    <FilterOption key={option} selected={on} label={copy?.options[option] ? planCopy(copy.options[option]!, language) : option}
                      onToggle={() => set(question.id, { values: template?.type === "multi" ? (on ? answer.values.filter((value) => value !== option) : [...answer.values, option]) : on ? [] : [option] })} />
                  );
                })}
              </div>
              {guessed ? <span><Chip label={t(planFlowCopy.guessTag)} /></span> : null}
              <input className={styles.textInput} aria-label={t(planFlowCopy.freeText)} placeholder={question.guess?.text ?? t(planFlowCopy.freeText)} value={answer.text} maxLength={300}
                onChange={(event) => set(question.id, { text: event.target.value })} />
            </fieldset>
          );
        })}
        <div className={styles.submitCell}>
          <Button variant="primary" label={t(planFlowCopy.answerAll, { count: questions.length })} loading={busy === "answers"} disabled={Boolean(busy)} onClick={submitAnswers} />
          <span className={styles.label}>{t(planFlowCopy.answerNote)}</span>
        </div>
      </div>
    </Card>
  );
}

function sourceTag(row: PlanPremiseRow, t: Translate): string {
  return row.source === "background" || row.source === "record" ? t(planFlowCopy.premiseSourceBackground) : row.source.toUpperCase();
}

/** 「確定した前提」: each row with its source; click a row to change it in place (UI-SPEC ②). */
export function PremiseCard({ intake, busy, onEdit, onMakeDraft, collapsed, hasDraft, t, language }: {
  intake: PlanIntakeView;
  busy: string | null;
  onEdit: (key: string, value: string) => Promise<boolean>;
  onMakeDraft?: () => void;
  collapsed: boolean;
  hasDraft: boolean;
  t: Translate;
  language: OrbitLanguage;
}) {
  const copy = useStandardCopy();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [option, setOption] = useState("");
  const [text, setText] = useState("");
  const saving = useRef(false);
  const rows = intake.premise ?? [];
  if (collapsed && !expanded) {
    return (
      <Card data-plan-premise="collapsed">
        <div className={`${styles.row} ${styles.between}`}>
          <b className={styles.h3}><span aria-hidden>📌</span> {t(planFlowCopy.premiseTitle)}</b>
          <Button size="sm" variant="ghost" label={t(planFlowCopy.showAll)} onClick={() => setExpanded(true)} />
        </div>
        <div className={styles.premiseChips}>{rows.slice(0, 6).map((row) => <Chip key={row.key} label={`${row.label}：${row.value}`} />)}</div>
      </Card>
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
    <Card data-plan-premise="open">
      <div className={`${styles.row} ${styles.between}`}>
        <b className={styles.h3}><span aria-hidden>📌</span> {t(planFlowCopy.premiseTitle)}</b>
        <span className={styles.label}>{t(planFlowCopy.premiseHint)}</span>
      </div>
      <ul className={styles.premiseRows}>
        {rows.map((row) => {
          const template = questionTemplate(intake, row.key);
          const question = PLAN_QUESTION_COPY[row.key];
          if (editing === row.key) {
            return (
              <li key={row.key} className={styles.premiseEdit} data-premise-edit={row.key}>
                <span className={styles.premiseLabel}>{row.label}</span>
                {template && question ? (
                  <select className={styles.select} aria-label={t(planFlowCopy.premiseChoice)} value={option} onChange={(event) => setOption(event.target.value)}>
                    <option value="">—</option>
                    {template.options.map((value) => <option key={value} value={value}>{question.options[value] ? planCopy(question.options[value]!, language) : value}</option>)}
                  </select>
                ) : null}
                <input className={styles.textInput} aria-label={t(planFlowCopy.premiseValue)} value={text} maxLength={300} onChange={(event) => setText(event.target.value)} />
                {hasDraft ? <p className={styles.label}>{t(planFlowCopy.premiseRedo)}</p> : null}
                <div className={styles.row}>
                  <Button size="sm" variant="primary" label={copy.action.save} loading={busy === "premise"} disabled={Boolean(busy) || !(text.trim() || option)} onClick={() => void save(row)} />
                  <Button size="sm" variant="ghost" label={copy.action.cancel} onClick={() => setEditing(null)} />
                </div>
              </li>
            );
          }
          return (
            <li key={row.key}>
              <button type="button" className={`btn ${styles.premiseRow}`} data-premise={row.key} onClick={() => open(row)} disabled={Boolean(busy)}>
                <span className={styles.premiseLabel}>{row.label}</span>
                <span className={styles.premiseValue}>{row.value}</span>
                <span className={styles.row}>{row.guessed ? <Chip label={t(planFlowCopy.guessTag)} /> : null}<Chip label={sourceTag(row, t)} tone="lav" /></span>
              </button>
            </li>
          );
        })}
      </ul>
      {onMakeDraft ? (
        busy === "draft" ? <div className={styles.field}><ConfirmCard state="pending" title={t(planFlowCopy.makingDraft)} /></div> : (
          <div className={`${styles.blockActions} ${styles.between}`}>
            <span className={styles.label}>{t(planFlowCopy.makeDraftNote)}</span>
            <Button variant="primary" icon="sparkle" label={t(planFlowCopy.makeDraft)} disabled={Boolean(busy)} onClick={onMakeDraft} />
          </div>
        )
      ) : null}
    </Card>
  );
}
