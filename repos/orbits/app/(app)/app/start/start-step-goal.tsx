/**
 * 引导第 2 步「目标」（W0006）：W0002 的共享目标编辑器 + 「请认真写」提醒。
 * 资料里已经有目标（onboarding 写过）时这一步自动完成，这里提示可以改得更具体。
 */
"use client";

import { useState } from "react";

import { GoalEditor, GoalReminder } from "../profile/goal-editor/goal-editor";
import {
  composeRelationshipGoal,
  horizonOption,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../profile/goal-editor/goal-editor-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { saveGuideGoal } from "./start-goal-save";

export function StepGoal({
  done,
  goal,
  onNext,
  onSaved,
  profileUpdatedAt,
}: {
  done: boolean;
  goal: string;
  onNext: () => void;
  onSaved: (relationshipGoal: string, updatedAt: string | null) => void;
  profileUpdatedAt: string | null;
}) {
  const { language, t } = useOrbitLanguage();
  const lang = language === "en" ? "en" : "zh";
  const [initial] = useState(() => parseRelationshipGoal(goal));
  const [text, setText] = useState(initial.text);
  // 新写目标默认 3 个月内（与 onboarding 一致）；已存的目标没写期限时不替用户预选。
  const [horizon, setHorizon] = useState<GoalHorizon | "">(initial.text ? initial.horizon : "quarter");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hadGoal = Boolean(goal.trim());

  async function save() {
    if (saving || !text.trim()) return;
    const value = composeRelationshipGoal({ horizon, text }, lang);
    if (value === goal.trim()) {
      onNext();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveGuideGoal(value, profileUpdatedAt);
      onSaved(saved.relationshipGoal, saved.updatedAt);
    } catch {
      setError(t({ en: "Couldn't save your goal. Please try again.", zh: "目标没有保存成功，请再试一次。" }));
    } finally {
      setSaving(false);
    }
  }

  const horizonLabel = horizon ? t(horizonOption(horizon).label) : "";

  return (
    <article className="sg-lead" data-start-module="2">
      <div className="sg-meta">
        <span className="sg-pill">{t({ en: "Step 2 · Goal", zh: "第 2 步 · 目标" })}</span>
        {done ? <span className="sg-pill sg-pill-good">{t({ en: "✓ Done", zh: "✓ 已完成" })}</span> : null}
      </div>
      <h2>{t({ en: "What do you most want to achieve next?", zh: "你接下来最想达成什么？" })}</h2>
      <GoalReminder />
      {hadGoal ? (
        <div className="sg-from-ob" data-start-goal-carried>
          {t({
            en: "You wrote a goal when you signed up — it's already here. Making it more specific makes the plan more accurate.",
            zh: "注册时你写过目标，已经带进来了。改得更具体一些，计划会更准。",
          })}
        </div>
      ) : null}
      <GoalEditor disabled={saving} horizon={horizon} onHorizonChange={setHorizon} onTextChange={setText} text={text} />
      <div className="sg-foot">
        <span className="sg-hint">
          {text.trim()
            ? horizonLabel
              ? t({ en: `iOrbit will plan for "${horizonLabel}"`, zh: `iOrbit 会按「${horizonLabel}」排你的计划` })
              : t({ en: "Pick a time frame, or keep it open", zh: "可以选一个期限，也可以先不选" })
            : t({ en: "Write one sentence to continue", zh: "写一句目标就可以继续" })}
        </span>
        <button
          aria-busy={saving ? "true" : undefined}
          className="btn sg-primary"
          data-start-goal-save
          disabled={saving || !text.trim()}
          onClick={() => void save()}
          type="button"
        >
          {saving
            ? t({ en: "Saving…", zh: "正在保存…" })
            : t({ en: "Save goal, next step →", zh: "保存目标，下一步 →" })}
        </button>
      </div>
      <p className="sg-error" role="alert">
        {error}
      </p>
    </article>
  );
}
