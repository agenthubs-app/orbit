/**
 * 引导第 3 步「计划」（W0006，RW-05 第 3 步部分）。
 *
 * - 显示当前目标，「修改」就地打开 W0002 的同一个编辑器，编辑的是草稿：取消不覆盖，
 *   保存才写资料里的 relationshipGoal；
 * - R25（v1 计划的创建入口关闭）：「开始分析」不再调 `POST /api/agent/plans/bootstrap`
 *   （它现在一律 409 PLAN_V1_RETIRED），直接带用户去 v2 的目標入力
 *   （Task › プラン `?new=1`，`planNewGoalHref`），在那里走计划 v2 的生成流程。
 *   原来的「补充一句」和 v1 回答结构说明一并去掉（v2 流程自己会问）。
 */
"use client";

import { useState } from "react";

import type { StartContactSample } from "../../../../features/guide/start-steps";
import { GoalEditor } from "../profile/goal-editor/goal-editor";
import {
  composeRelationshipGoal,
  horizonOption,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../profile/goal-editor/goal-editor-model";
import { planNewGoalHref } from "../../../../shared/compute/plan-href";
import { useOrbitLanguage } from "../orbit-language-context";
import { saveGuideGoal } from "./start-goal-save";

export const START_PLAN_QUESTION = {
  en: "Based on my goal and my network, how should I achieve my goal?",
  zh: "根据我的目标和人脉信息，我该如何实现目标？",
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
  const { language, preserveHref, t } = useOrbitLanguage();
  const lang = language === "en" ? "en" : "zh";
  const parsed = parseRelationshipGoal(goal);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftHorizon, setDraftHorizon] = useState<GoalHorizon | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    const current = parseRelationshipGoal(goal);
    setDraftText(current.text);
    setDraftHorizon(current.text ? current.horizon : "quarter");
    setError("");
    setEditing(true);
  }

  async function saveEdit() {
    if (saving || !draftText.trim()) return;
    const value = composeRelationshipGoal({ horizon: draftHorizon, text: draftText }, lang);
    if (value === goal.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveGuideGoal(value, profileUpdatedAt);
      onGoalSaved(saved.relationshipGoal, saved.updatedAt);
      setEditing(false);
    } catch {
      setError(t({ en: "Couldn't save your goal. Please try again.", zh: "目标没有保存成功，请再试一次。" }));
    } finally {
      setSaving(false);
    }
  }

  function startAnalysis() {
    if (editing || !parsed.text) return;
    window.location.assign(preserveHref(planNewGoalHref("web")));
  }

  const names = samples.map((sample) => sample.displayName).join(lang === "en" ? ", " : "、");

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

      <div className="sg-reads">
        <span>{t({ en: "iOrbit will read:", zh: "iOrbit 会读到：" })}</span>
        <span>
          <b>{t({ en: "your goal", zh: "你的目标" })}</b>
        </span>
        <span>
          <b>{t({ en: `${confirmedContacts} contacts`, zh: `${confirmedContacts} 位联系人` })}</b>
          {names ? (lang === "en" ? ` (${names})` : `（${names}）`) : null}
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
          disabled={editing || !parsed.text}
          onClick={startAnalysis}
          type="button"
        >
          {t({ en: "Start analysis", zh: "开始分析" })}
        </button>
      </div>
    </article>
  );
}
