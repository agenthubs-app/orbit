/**
 * 引导第 3 步「计划」（W0006，RW-05 第 3 步部分）。
 *
 * - 显示当前目标，「修改」就地打开 W0002 的同一个编辑器，编辑的是草稿：取消不覆盖，
 *   保存才写资料里的 relationshipGoal；
 * - 目标只显示一次；资料里存了两个目标时，在同一个框里选先做哪一个（2026-10-30）；
 * - 计划类型按目标自动选好（资料目标自带的类型 → `/goal-kind` 推测 → 关键词），可以改；
 *   之后续接或创建 source:onboarding 的 v2 intake，只使用服务端返回并核验过的 Web href 进入计划流程。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import type { StartContactSample } from "../../../../features/guide/start-steps";
import type { PlanGoalKind, PlanGoalKindResult } from "../../../../shared/contract/plan-v2";
import { parseProfileOnboardingGoal, profileGoalChoice } from "../../../../shared/compute/profile-onboarding-goal";
import { PLAN_GOAL_KINDS, guessGoalKindByKeywords } from "../../../../shared/compute/plan-templates";
import { planApi } from "../orbit-2026/plan/plan-api";
import { goalGuessReady } from "../orbit-2026/plan/plan-model";
import { PLAN_GOAL_KIND_COPY, planCopy } from "../../../../shared/compute/plan-template-copy";
import { GoalEditor } from "../profile/goal-editor/goal-editor";
import {
  composeRelationshipGoal,
  horizonOption,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../profile/goal-editor/goal-editor-model";
import { useStartCopy } from "./start-copy";
import { saveGuideGoal } from "./start-goal-save";
import { resumeOrCreateOnboardingIntake } from "./start-plan-intake";

export const START_PLAN_QUESTION = {
  en: "Based on my goal and my network, how should I achieve my goal?",
  zh: "根据我的目标和人脉信息，我该如何实现目标？",
  ja: "目標と人脈をもとに、どのように進めればよいですか？",
};

export function StepPlan({
  confirmedContacts,
  goal,
  onGoalSaved,
  planDone,
  profileUpdatedAt,
  samples,
}: {
  confirmedContacts: number;
  goal: string;
  onGoalSaved: (relationshipGoal: string, updatedAt: string | null) => void;
  planDone: boolean;
  profileUpdatedAt: string | null;
  samples: readonly StartContactSample[];
}) {
  const { language, preserveHref, t } = useStartCopy();
  const editorLang = language === "en" ? "en" : "zh";
  const parsed = parseRelationshipGoal(goal);
  const [priority, setPriority] = useState(0);
  const plan = planGoalFor(goal, priority);
  const planText = plan.text;

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftHorizon, setDraftHorizon] = useState<GoalHorizon | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [goalKind, setGoalKind] = useState<PlanGoalKind | null>(plan.kind);
  const chosenByHand = useRef(false);
  const actionRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // 计划类型自动选好：目标自带类型时直接用；否则先按关键词，再用 Task 计划页同一个 `/goal-kind` 推测（失败保持关键词结果）。
  useEffect(() => {
    if (chosenByHand.current) return;
    if (plan.kind) { setGoalKind(plan.kind); return; }
    const text = planText.trim();
    if (!text) { setGoalKind(null); return; }
    setGoalKind(guessGoalKindByKeywords(text));
    if (!goalGuessReady(text)) return;
    let alive = true;
    void planApi<PlanGoalKindResult>("/goal-kind", { body: { text }, language }).then((result) => {
      if (alive && result.ok && !chosenByHand.current) setGoalKind(result.data.goalKind);
    });
    return () => { alive = false; };
  }, [plan.kind, planText, language]);

  function pickKind(kind: PlanGoalKind) {
    chosenByHand.current = true;
    actionRef.current = null;
    setGoalKind(kind);
  }

  function pickPriority(index: number) {
    chosenByHand.current = false;
    actionRef.current = null;
    setPriority(index);
  }

  function startEdit() {
    const current = parseRelationshipGoal(goal);
    setDraftText(current.text);
    setDraftHorizon(current.horizon);
    setError("");
    setEditing(true);
  }

  async function saveEdit() {
    if (saving || !draftText.trim()) return;
    const value = composeRelationshipGoal({ horizon: draftHorizon, text: draftText }, editorLang);
    if (value === goal.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveGuideGoal(value, profileUpdatedAt);
      onGoalSaved(saved.relationshipGoal, saved.updatedAt);
      chosenByHand.current = false;
      setPriority(0);
      actionRef.current = null;
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error && "code" in caught && caught.code === "PROFILE_VERSION_CONFLICT"
        ? t({ en: "Your goal changed elsewhere. Refresh and review it before saving.", zh: "目标已在另一处更新。请刷新并核对后再保存。", ja: "別の画面で目標が更新されました。再読み込みして内容を確認してください。" })
        : t({ en: "Couldn't save your goal. Please try again.", zh: "目标没有保存成功，请再试一次。" }));
    } finally {
      setSaving(false);
    }
  }

  async function startAnalysis() {
    if (editing || !planText.trim() || !goalKind || saving) return;
    const fingerprint = JSON.stringify([planText.trim(), goalKind]);
    if (actionRef.current?.fingerprint !== fingerprint) actionRef.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const href = await resumeOrCreateOnboardingIntake({ goalText: planText, goalKind, idempotencyKey: actionRef.current.key, language });
      window.location.assign(preserveHref(href));
    } catch {
      setError(t({ en: "Couldn't open the plan. Please try again.", zh: "计划暂时无法打开，请重试。", ja: "プランを開けませんでした。もう一度お試しください。" }));
    } finally {
      setSaving(false);
    }
  }

  const names = samples.map((sample) => sample.displayName).join(language === "en" ? ", " : "、");

  return (
    <article className="sg-lead" data-start-module="3">
      <div className="sg-meta">
        <span className="sg-pill">{t({ en: "Step 3 · Plan", zh: "第 3 步 · 计划" })}</span>
        {planDone ? <span className="sg-pill sg-pill-good">{t({ en: "✓ Done", zh: "✓ 已完成" })}</span> : null}
      </div>

      <h2>{t({ en: "Let iOrbit make your first plan", zh: "让 iOrbit 做你的第一份计划" })}</h2>

      <div className="sg-goalbox" data-editing={editing ? "true" : "false"} data-start-goalbox>
        <div className="sg-goalbox-h">
          <span>{t({ en: "Your goal · you can change it before asking", zh: "你的目标 · 问之前可以再改一次" })}</span>
          {editing ? null : (
            <button className="btn sg-link" data-start-goal-edit onClick={startEdit} type="button">
              {parsed.text ? t({ en: "Edit", zh: "修改" }) : t({ en: "Write one", zh: "写目标" })}
            </button>
          )}
        </div>
        {editing ? (
          <>
            <GoalEditor
              disabled={saving}
              horizon={draftHorizon}
              onHorizonChange={setDraftHorizon}
              onTextChange={setDraftText}
              text={draftText}
            />
            <div className="sg-acts" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn sg-link sg-muted"
                data-start-goal-cancel
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                type="button"
              >
                {t({ en: "Cancel", zh: "取消" })}
              </button>
              <button
                aria-busy={saving ? "true" : undefined}
                className="btn sg-primary"
                data-start-goal-edit-save
                disabled={saving || !draftText.trim()}
                onClick={() => void saveEdit()}
                type="button"
              >
                {saving ? t({ en: "Saving…", zh: "正在保存…" }) : t({ en: "Save changes", zh: "保存修改" })}
              </button>
            </div>
            <p className="sg-error" role="alert">
              {error}
            </p>
          </>
        ) : parsed.text ? (
          <>
            <p data-start-goal-text>{parsed.text}</p>
            {parsed.horizon ? (
              <div className="sg-acts">
                <span className="sg-pill">{t(horizonOption(parsed.horizon).label)}</span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="sg-goal-empty">
            {t({ en: "No goal yet — write one before asking.", zh: "还没有目标，先写一句再问。" })}
          </p>
        )}
      </div>

      {!planDone ? (
        <div className="sg-field" data-start-plan-confirm>
          {plan.choices.length > 1 && !editing ? (
            <>
              <span className="sg-field-h">{t({ en: "Which goal first?", zh: "先做哪一个目标", ja: "どちらの目標から始めますか" })}</span>
              <div className="sg-acts" role="radiogroup" aria-label={t({ en: "Which goal first?", zh: "先做哪一个目标", ja: "どちらの目標から始めますか" })}>
                {plan.choices.map((choice, index) => (
                  <button aria-checked={priority === index} className="btn sg-choice" data-start-priority={index} key={choice} onClick={() => pickPriority(index)} role="radio" type="button">{choice}</button>
                ))}
              </div>
            </>
          ) : null}
          <span className="sg-field-h">{t({ en: "Plan type · picked from your goal, change it if it's off", zh: "计划类型 · 已按你的目标选好，可以改", ja: "プランの種類 · 目標に合わせて選びました。変更できます" })}</span>
          <div className="sg-acts" role="radiogroup" aria-label={t({ en: "Plan type", zh: "计划类型", ja: "プランの種類" })}>
            {PLAN_GOAL_KINDS.map((kind) => (
              <button aria-checked={goalKind === kind} className="btn sg-choice" data-start-kind={kind} key={kind} onClick={() => pickKind(kind)} role="radio" type="button">
                {planCopy(PLAN_GOAL_KIND_COPY[kind], language)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sg-reads">
        <span>{t({ en: "iOrbit will read:", zh: "iOrbit 会读到：" })}</span>
        <span>
          <b>{t({ en: "your goal", zh: "你的目标" })}</b>
        </span>
        <span>
          <b>{t({ en: `${confirmedContacts} contacts`, zh: `${confirmedContacts} 位联系人`, ja: `${confirmedContacts} 人の連絡先` })}</b>
          {names ? (language === "en" ? ` (${names})` : `（${names}）`) : null}
        </span>
      </div>

      <p className="sg-question" data-start-question>
        <span aria-hidden className="sg-ask-badge">
          {t({ en: "Q", zh: "问" })}
        </span>
        {t(START_PLAN_QUESTION)}
      </p>
      <div className="sg-acts">
        <button
          className="btn sg-primary"
          data-start-analyze
          disabled={editing || !planText.trim() || !goalKind || saving || planDone}
          onClick={() => void startAnalysis()}
          type="button"
        >
          {saving ? t({ en: "Opening…", zh: "正在打开…", ja: "開いています…" }) : t({ en: "Continue to plan", zh: "继续制定计划", ja: "プランをつくる" })}
        </button>
      </div>
      {error ? <p className="sg-error" role="alert">{error}</p> : null}
    </article>
  );
}

/**
 * The goal the plan starts from: with two saved profile goals (寻找投资、获取客户：…) the chosen one plus the shared
 * focus, and the plan kind that profile goal maps to; any other goal text is used as it is, its kind guessed.
 */
function planGoalFor(saved: string, priority: number): { choices: string[]; kind: PlanGoalKind | null; text: string } {
  const parsed = parseProfileOnboardingGoal(saved);
  if (!parsed.choices.length) return { choices: [], kind: null, text: parsed.raw };
  const choice = parsed.choices[Math.min(priority, parsed.choices.length - 1)]!;
  return { choices: parsed.choices, kind: profileGoalChoice(choice)?.planKind ?? null, text: parsed.focus ? `${choice}：${parsed.focus}` : choice };
}
