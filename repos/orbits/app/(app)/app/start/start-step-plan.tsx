/**
 * 引导第 3 步「计划」（W0006，RW-05 第 3 步部分）。
 *
 * - 显示当前目标，「修改」就地打开 W0002 的同一个编辑器，编辑的是草稿：取消不覆盖，
 *   保存才写资料里的 relationshipGoal；
 * - 固定问题「根据我的目标和人脉信息，我该如何实现目标？」+ 可选的一句补充 + 回答会包含的 6 点；
 * - 「开始分析」：计划生成（W0008）上线前**不伪造计划**、不写任何计划数据——只提示
 *   「计划生成即将上线」，然后带用户去 iOrbit 对话页（/app/agent）。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import type { StartContactSample } from "../../../../features/guide/start-steps";
import { GoalEditor } from "../profile/goal-editor/goal-editor";
import {
  composeRelationshipGoal,
  horizonOption,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../profile/goal-editor/goal-editor-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { saveGuideGoal } from "./start-goal-save";

export const START_PLAN_QUESTION = {
  en: "Based on my goal and my network, how should I achieve my goal?",
  zh: "根据我的目标和人脉信息，我该如何实现目标？",
};

const OUTLINE = [
  { en: "Goal analysis: measurable result, time frame, key judgements", zh: "目标分析：可衡量的结果、期限、关键判断" },
  { en: "Phased steps, down to each week", zh: "分阶段步骤，细到每周" },
  { en: "Who to meet and what to find out at each step", zh: "每一步要认识什么人、要搞清楚什么信息" },
  { en: "How your existing network can help", zh: "你现有的人脉能帮上什么" },
  { en: "Which people are missing, and which events to meet them at", zh: "还缺哪类人，可以去哪些活动认识" },
  { en: "How to introduce yourself there, and how to follow up", zh: "在那种场合怎么介绍自己、之后怎么跟进" },
];

/** 提示出现后多久带用户去对话页（留出读完提示的时间；也可以直接点链接）。 */
export const START_PLAN_REDIRECT_DELAY_MS = 2400;

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
  const [supplement, setSupplement] = useState("");
  const [comingSoon, setComingSoon] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

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
    setComingSoon(true);
    const href = preserveHref("/app/agent");
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    redirectTimer.current = setTimeout(() => window.location.assign(href), START_PLAN_REDIRECT_DELAY_MS);
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
      <label className="sg-outline">
        <span className="sg-hint">{t({ en: "Add one line (optional)", zh: "补充一句（选填）" })}</span>
        <input
          className="sg-input"
          data-start-supplement
          maxLength={60}
          onChange={(event) => setSupplement(event.target.value)}
          placeholder={t({
            en: "e.g. I'd rather start with manufacturing customers",
            zh: "例如：我更想先从制造业客户开始",
          })}
          type="text"
          value={supplement}
        />
      </label>
      <div className="sg-outline">
        <span className="sg-hint">
          {t({ en: "The answer will follow this structure:", zh: "回答会按这个结构给出：" })}
        </span>
        <ol className="sg-outline-list" data-start-outline>
          {OUTLINE.map((item) => (
            <li key={item.zh}>{t(item)}</li>
          ))}
        </ol>
      </div>
      <div className="sg-acts">
        <button
          className="btn sg-primary"
          data-start-analyze
          disabled={editing || !parsed.text || comingSoon}
          onClick={startAnalysis}
          type="button"
        >
          {t({ en: "Start analysis", zh: "开始分析" })}
        </button>
      </div>
      <p aria-live="polite" className="sg-status" data-start-plan-soon role="status">
        {comingSoon ? (
          <>
            {t({
              en: "Plan generation is coming soon — nothing has been generated yet. Taking you to iOrbit… ",
              zh: "计划生成即将上线，现在还不会生成计划。正在带你去 iOrbit… ",
            })}
            <a className="sg-lk" data-start-plan-soon-link href={preserveHref("/app/agent")}>
              {t({ en: "Go now →", zh: "现在就去 →" })}
            </a>
          </>
        ) : null}
      </p>
    </article>
  );
}
