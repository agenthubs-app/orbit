/**
 * 共享目标编辑器（RW-05 / D7）：资料页「我的目标」与 onboarding 设目标步共用同一交互。
 *   - 输入框「你的目标」+ 提示「写清楚做什么、做到多少、在哪里」+ 字数；
 *   - 10 条示例句 badge：点一下整句替换输入框内容、聚焦并把光标放到句末；输入框内容与某条示例一致时该 badge aria-pressed=true；
 *     带「三个月内／一个月内／年内」的示例同时选上对应期限；
 *   - 期限三张卡片（一个月内／3 个月内／一年内），手动点选可改。
 * 受控组件：text / horizon 由调用方持有。资料页只有一段存储文字，用 useStoredGoal 桥接。
 * 样式随组件输出（GOAL_EDITOR_STYLES，限定在 [data-orbit-real-page] .ge 内），两个页面不必各写一份。
 */
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import {
  GOAL_EXAMPLES,
  GOAL_HORIZONS,
  GOAL_TEXT_LIMIT,
  composeRelationshipGoal,
  exampleHorizon,
  goalExampleMatches,
  parseRelationshipGoal,
  type Copy,
  type GoalDraft,
  type GoalHorizon,
} from "./goal-editor-model";

export const GOAL_REMINDER: Copy = {
  zh: "请认真写。iOrbit 会用 AI 根据这句话分析你的人脉、拆出步骤、推荐要认识的人。",
  en: "Take a moment over this. iOrbit's AI uses this sentence to analyse your network, break the goal into steps and recommend who to meet.",
};

/** 编辑器上方的提醒（资料页与 onboarding 设目标步同一句）；样式随 GoalEditor 输出。 */
export function GoalReminder() {
  const { t } = useOrbitLanguage();
  return <p className="ge-reminder"><span aria-hidden>✦</span><span>{t(GOAL_REMINDER)}</span></p>;
}

export interface GoalEditorProps {
  disabled?: boolean;
  horizon: GoalHorizon | "";
  onHorizonChange: (horizon: GoalHorizon) => void;
  onTextChange: (text: string) => void;
  text: string;
}

export function GoalEditor({ disabled = false, horizon, onHorizonChange, onTextChange, text }: GoalEditorProps) {
  const { t } = useOrbitLanguage();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 点示例后等新值渲染进输入框，再聚焦并把光标放到句末。
  const caretToEnd = useRef(false);

  useLayoutEffect(() => {
    if (!caretToEnd.current) return;
    caretToEnd.current = false;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [text]);

  function pickExample(example: Copy) {
    caretToEnd.current = true;
    onTextChange(t(example));
    const matched = exampleHorizon(example);
    if (matched) onHorizonChange(matched);
  }

  const label = t({ zh: "你的目标", en: "Your goal" });
  return (
    <div className="ge">
      <style>{GOAL_EDITOR_STYLES}</style>
      <label className="ge-box">
        <span className="ge-box-label"><span aria-hidden>✎</span>{label}</span>
        <textarea
          aria-label={label}
          className="ge-input"
          disabled={disabled}
          maxLength={GOAL_TEXT_LIMIT}
          onChange={event => onTextChange(event.target.value)}
          placeholder={t({ zh: "写下你的目标，或点击下方示例快速填入", en: "Write your goal, or tap an example below" })}
          ref={inputRef}
          rows={2}
          value={text}
        />
        <span className="ge-box-foot">
          <span>{t({ zh: "写清楚做什么、做到多少、在哪里", en: "Say what, how much, and where" })}</span>
          <em className="ge-count">{Array.from(text).length} / {GOAL_TEXT_LIMIT}</em>
        </span>
      </label>
      <span className="ge-ex-head">{t({ zh: "示例，点一下填入，再改成你自己的：", en: "Examples — tap one to fill it in, then make it your own:" })}</span>
      <span className="ge-examples" role="group" aria-label={t({ zh: "目标示例", en: "Goal examples" })}>
        {GOAL_EXAMPLES.map(example => (
          <button
            aria-pressed={goalExampleMatches(example, text)}
            className="btn ge-example"
            disabled={disabled}
            key={example.zh}
            onClick={() => pickExample(example)}
            type="button"
          >
            ＋ {t(example)}
          </button>
        ))}
      </span>
      <span className="ge-row">
        <span className="ge-row-label">{t({ zh: "期限", en: "Time frame" })}</span>
        <span className="ge-horizons" role="group" aria-label={t({ zh: "期限", en: "Time frame" })}>
          {GOAL_HORIZONS.map(option => (
            <button
              aria-label={t(option.label)}
              aria-pressed={horizon === option.key}
              className="btn ge-horizon"
              disabled={disabled}
              key={option.key}
              onClick={() => onHorizonChange(option.key)}
              type="button"
            >
              <b className="ge-horizon-num">{option.num}<small>{t(option.unit)}</small></b>
              <span className="ge-horizon-sub">{t(option.sub)}</span>
            </button>
          ))}
        </span>
      </span>
    </div>
  );
}

/**
 * 资料页桥接：存储只有一段 relationshipGoal 文字（intro）。本地保留未修剪的正文与期限（打字时的尾随空格不被
 * compose 的 trim 吃掉），每次改动把合成后的文字写回；外部换了存储值（重载、取消）才按新值重新解析。
 */
export function useStoredGoal(stored: string, onStore: (value: string) => void, language: "zh" | "en") {
  const [draft, setDraft] = useState<GoalDraft>(() => parseRelationshipGoal(stored));
  // 点示例会在同一次点击里先改正文再改期限：用 ref 读最新草稿，第二次写入不会拿旧正文覆盖。
  const current = useRef(draft);
  const lastWritten = useRef(stored);

  useEffect(() => {
    if (stored === lastWritten.current) return;
    lastWritten.current = stored;
    current.current = parseRelationshipGoal(stored);
    setDraft(current.current);
  }, [stored]);

  function write(patch: Partial<GoalDraft>) {
    const next = { ...current.current, ...patch };
    current.current = next;
    setDraft(next);
    const value = composeRelationshipGoal(next, language);
    lastWritten.current = value;
    onStore(value);
  }

  return {
    horizon: draft.horizon,
    onHorizonChange: (horizon: GoalHorizon) => write({ horizon }),
    onTextChange: (text: string) => write({ text }),
    text: draft.text,
  };
}

// 取值来自已确认的 HTML 原型（.g-focus / .ex / .hz）。选择器以 [data-orbit-real-page] .ge 起头并带 .btn，
// 特异度压过 orbit-reference-styles 的控件重置与 .btn[disabled] 灰底。注意：本模板字面量里不要写反引号。
const R = "[data-orbit-real-page] .ge";

export const GOAL_EDITOR_STYLES = `
[data-orbit-real-page] .ge-reminder { display: flex; gap: 8px; align-items: flex-start; margin: 0; max-width: 40em; font-size: 14px; line-height: 1.7; color: #6B6F99; }
[data-orbit-real-page] .ge-reminder > span:first-child { flex: none; color: #4B4FC7; }
${R} { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
${R} .ge-box { display: flex; flex-direction: column; border: 1px solid #DDDEFA; border-radius: 14px; background: #F4F5FC; padding: 12px 16px 10px; cursor: text; transition: border-color .15s, box-shadow .15s, background .15s; }
${R} .ge-box:focus-within { border-color: #4B4FC7; background: #FFFFFF; box-shadow: 0 0 0 4px rgba(75,79,199,.1); }
${R} .ge-box-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; letter-spacing: .04em; color: #6B6F99; }
${R} .ge-input { width: 100%; border: 0; background: transparent; resize: none; outline: none; padding: 6px 0 4px; font-family: var(--font); font-weight: 600; font-size: 20px; line-height: 1.55; color: #0E1225; min-height: 3.2em; }
${R} .ge-input::placeholder { color: #9FA3C4; font-weight: 600; }
${R} .ge-input:disabled { opacity: .6; }
${R} .ge-box-foot { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; border-top: 1px dashed #DDDEFA; font-size: 12.5px; color: #6B6F99; }
${R} .ge-count { font-style: normal; color: #9FA3C4; font-variant-numeric: tabular-nums; white-space: nowrap; }
${R} .ge-ex-head { font-size: 12.5px; color: #6B6F99; margin: 2px 0 -4px; }
${R} .ge-examples { display: flex; flex-wrap: wrap; gap: 8px; }
${R} .btn.ge-example { height: auto; display: inline-flex; align-items: center; gap: 0; padding: 7px 13px; border: 1px dashed #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13.5px; font-weight: 400; line-height: 1.4; letter-spacing: 0; text-align: left; white-space: normal; cursor: pointer; box-shadow: none; opacity: 1; transition: background .15s, border-color .15s, color .15s; }
${R} .btn.ge-example:active { transform: none; }
${R} .btn.ge-example[aria-pressed="false"]:hover:not(:disabled) { border-style: solid; border-color: #4B4FC7; color: #2E3270; }
${R} .btn.ge-example[aria-pressed="true"] { border: 1px solid #4B4FC7; background: #4B4FC7; color: #FFFFFF; }
${R} .btn.ge-example[aria-pressed="true"]:hover:not(:disabled) { border-color: #2E3270; background: #2E3270; color: #FFFFFF; }
${R} .btn.ge-example:disabled { cursor: default; opacity: .6; }
${R} .ge-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 14px 0; border-top: 1px solid #E8E9F6; border-bottom: 1px solid #E8E9F6; }
${R} .ge-row-label { font-size: 13px; font-weight: 500; color: #3B3F7A; }
${R} .ge-horizons { display: grid; grid-template-columns: repeat(3, minmax(0, 150px)); gap: 10px; }
${R} .btn.ge-horizon { height: auto; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 2px; padding: 10px 14px 11px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #0E1225; font-size: 12px; font-weight: 400; letter-spacing: 0; line-height: normal; text-align: left; white-space: normal; cursor: pointer; box-shadow: none; opacity: 1; transition: border-color .15s, background .15s; }
${R} .btn.ge-horizon:active { transform: none; }
${R} .btn.ge-horizon:hover:not(:disabled) { border-color: #B9BCEB; }
${R} .btn.ge-horizon[aria-pressed="true"] { border-color: #4B4FC7; background: #F4F5FC; box-shadow: inset 0 0 0 1px #4B4FC7; }
${R} .btn.ge-horizon:disabled { cursor: default; opacity: .6; }
${R} .ge-horizon-num { font-family: var(--font); font-weight: 900; font-size: 22px; line-height: 1.1; color: #0E1225; }
${R} .ge-horizon-num small { margin-left: 3px; font-family: var(--font); font-weight: 500; font-size: 13px; color: #3B3F7A; }
${R} .btn.ge-horizon[aria-pressed="true"] .ge-horizon-num, ${R} .btn.ge-horizon[aria-pressed="true"] .ge-horizon-num small { color: #2E3270; }
${R} .ge-horizon-sub { font-size: 12px; color: #6B6F99; }
@media (max-width: 560px) {
  ${R} .ge-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  ${R} .ge-horizons { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  ${R} .btn.ge-horizon { padding: 9px 10px 10px; }
  ${R} .ge-input { font-size: 18px; }
}
`;
