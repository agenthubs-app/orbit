/**
 * 报名设置屏（Orbit_0918 运营台 form 屏，设计 300–367 行；`/operations/experience`）：消费 `useExperienceEditor(event.id)`。
 * 顶栏：状态 chip（`formStatusChip`）+「◷ 上次保存 …」（`lastSavedChip`，无草稿 → 尚未保存）/「保存草稿」= `saveDraft` /
 * 「发布报名设置」= `publishDraft`（无草稿禁用）；`frozen`（画像截止已到）时仍可保存 / 发布展示字段（README：题集须与已发布基线
 * 语义一致），故只禁用题集变更控件（题干 / 选项 / 必填 / ⌫ / ＋ 添加问题 / 轨道）并显示旧编辑器的说明；空白选项（「＋ 添加选项」
 * 刚推入）失焦时清理，仍有空白时保存 / 预览 / 发布禁用 + 说明；`error` / `notice` 只在有内容时渲染。
 * 左列：说明 textarea（上限 `FORM_INTRO_LIMIT` 1000，计数器）；题目行 = `configuration.questionSet.questions`
 * （设计七列去掉类型 chip → 六列；⠿ 仅装饰，无排序 API；✎ = 行内展开 题干 / 选项逐行 / 必填（V2）；⌫ = `removeQuestion`（V2）；
 * 「＋ 添加问题」= `addQuestion`，V1 或已 4 题 → disabled + 说明）；「高级」折叠区（设计外）= 轨道 select + 强调色。
 * 右列：报名弹窗预览 = 当前草稿客户端渲染（封面渐变 + 真实标题 / 日期时间；地点无来源 → 省略；positioning 单选圆 其余多选方框；
 * 全部未选；「补充介绍」「0 / 500」无来源 → 省略；「提交报名」静态）；「预览（零写入）」= `previewDraft`，hash 显示在卡下方。
 */
"use client";

import { useState } from "react";

import type { EventExperienceQuestionTrack } from "../../../../../features/events/experience/contract";
import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import {
  addQuestionHint,
  canAddQuestion,
  cleanOptions,
  FORM_INTRO_LIMIT,
  formQuestionRows,
  formStatusChip,
  hasBlankOptions,
  hubDateTime,
  lastSavedChip,
  previewChoice,
} from "./ops-model";
import { useExperienceEditor } from "./use-experience-editor";

const OPTION_LIMIT = 5;
const OPTION_MIN = 2;

export function OpsForm({ event }: { event: EventOperationsPageEvent }) {
  const [editing, setEditing] = useState<number | null>(null);
  const {
    addQuestion,
    busy,
    configuration,
    error,
    frozen,
    loading,
    notice,
    preview,
    previewDraft,
    publishDraft,
    removeQuestion,
    saveDraft,
    setConfiguration,
    snapshot,
    updateQuestion,
    updateTrack,
  } = useExperienceEditor(event.id);
  const now = Date.now();
  const status = formStatusChip(snapshot?.head, now);
  const questions = configuration.questionSet.questions;
  const track = configuration.questionSet.track;
  const rows = formQuestionRows(questions);
  const intro = configuration.introduction ?? "";
  const addHint = addQuestionHint(track, questions.length);
  const when = hubDateTime(event);
  const blank = hasBlankOptions(questions);
  const canMutateQuestions = !frozen;

  function setOptions(index: number, options: readonly string[]) {
    updateQuestion(index, { options });
  }

  return (
    <div className="op-screen" data-ops-screen="form">
      <div className="op-fbar">
        <span className="op-fchips">
          <span className="op-fchip" data-ops-form-status style={{ background: status.bg, color: status.color }}>{status.label}</span>
          <span className="op-fchip-saved">{lastSavedChip(snapshot?.draft?.createdAt, now)}</span>
        </span>
        <span className="op-factions">
          <button className="btn op-fsave" disabled={busy !== null || blank} onClick={() => void saveDraft()} type="button">
            {busy === "save" ? "保存中…" : "保存草稿"}
          </button>
          <button className="btn op-fpublish" disabled={busy !== null || blank || !snapshot?.draft} onClick={() => void publishDraft()} type="button">
            {busy === "publish" ? "发布中…" : "发布报名设置"}
          </button>
        </span>
      </div>

      {error ? <div className="op-alert" role="alert">{error}</div> : null}
      {notice ? <div aria-live="polite" className="op-notice" role="status">{notice}</div> : null}
      {frozen ? <div className="op-frozen" data-ops-frozen role="status">已到画像编辑截止时间；仍可调整展示字段并保存/发布，但题集轨道、题目和选项必须与当前已发布版本一致。</div> : null}
      {blank ? <div className="op-frozen" data-ops-blank-options role="status">有选项为空：请填写或删除空白选项后再保存、预览或发布。</div> : null}
      {loading && !snapshot ? <div aria-label="正在读取活动体验" className="op-empty">正在读取活动体验…</div> : null}

      <div className="op-fgrid">
        <div className="op-fcol">
          <section className="op-fsec">
            <span className="op-fsec-head"><strong className="op-sec-title-20">报名弹窗说明</strong><span className="op-fsec-sub">这段说明将显示在用户点击「报名」后，位于问题列表的上方。</span></span>
            <textarea
              aria-label="报名弹窗说明"
              className="op-ftextarea"
              maxLength={FORM_INTRO_LIMIT}
              onChange={(input) => setConfiguration((current) => ({ ...current, introduction: input.target.value || null }))}
              placeholder="告诉参与者这场活动适合谁，以及会发生什么。"
              rows={3}
              value={intro}
            />
            <span className="op-fcount">{`${intro.length} / ${FORM_INTRO_LIMIT}`}</span>
          </section>

          <section className="op-fsec">
            <span className="op-fsec-head"><strong className="op-sec-title-20">报名问题</strong><span className="op-fsec-sub">设置用户报名时需要回答的问题。你可以调整问题顺序、编辑或删除问题。</span></span>
            {rows.map((row, index) => {
              const question = questions[index];
              const open = editing === index;
              return (
                <div className="op-fq" data-ops-question={question.intent} key={question.intent}>
                  <span aria-hidden="true" className="op-fq-drag">⠿</span>
                  <span className="op-fq-no">{row.no}</span>
                  <strong className="op-fq-title">{row.title}</strong>
                  <span className="op-fq-req" data-ops-req={question.intent} style={{ background: row.reqBg, color: row.reqColor }}>{row.req}</span>
                  <button
                    aria-expanded={open}
                    aria-label={`编辑第 ${row.no} 题`}
                    className="btn op-fq-edit"
                    data-ops-edit={question.intent}
                    onClick={() => setEditing(open ? null : index)}
                    type="button"
                  >
                    ✎
                  </button>
                  <button
                    aria-label={`删除第 ${row.no} 题`}
                    className="btn op-fq-del"
                    data-ops-remove={question.intent}
                    disabled={track !== "v2" || !canMutateQuestions}
                    onClick={() => {
                      removeQuestion(index);
                      setEditing(null);
                    }}
                    type="button"
                  >
                    ⌫
                  </button>
                  {open ? (
                    <div className="op-fq-editor" data-ops-editor={question.intent}>
                      <label className="op-field-label">
                        题干
                        <input
                          className="op-field"
                          data-ops-prompt
                          disabled={!canMutateQuestions}
                          onChange={(input) => updateQuestion(index, { prompt: input.target.value })}
                          value={question.prompt}
                        />
                      </label>
                      <span className="op-field-label">
                        {`选项（${OPTION_MIN}–${OPTION_LIMIT} 项）`}
                        {question.options.map((option, optionIndex) => (
                          <span className="op-fq-option" key={optionIndex}>
                            <input
                              aria-label={`选项 ${optionIndex + 1}`}
                              className="op-field"
                              data-ops-option={optionIndex}
                              disabled={!canMutateQuestions}
                              onBlur={() => setOptions(index, cleanOptions(question.options))}
                              onChange={(input) => setOptions(index, question.options.map((item, itemIndex) => (itemIndex === optionIndex ? input.target.value : item)))}
                              value={option}
                            />
                            {question.options.length > OPTION_MIN ? (
                              <button
                                aria-label={`删除选项 ${optionIndex + 1}`}
                                className="btn op-link-btn"
                                disabled={!canMutateQuestions}
                                onClick={() => setOptions(index, question.options.filter((_, itemIndex) => itemIndex !== optionIndex))}
                                type="button"
                              >
                                删除
                              </button>
                            ) : null}
                          </span>
                        ))}
                        {question.options.length < OPTION_LIMIT ? (
                          <button className="btn op-link-btn op-fq-option-add" disabled={!canMutateQuestions} onClick={() => setOptions(index, [...question.options, ""])} type="button">＋ 添加选项</button>
                        ) : null}
                      </span>
                      {track === "v2" ? (
                        <label className="op-fq-required">
                          <input
                            checked={question.required}
                            data-ops-required={question.intent}
                            disabled={!canMutateQuestions}
                            onChange={(input) => updateQuestion(index, { required: input.target.checked })}
                            type="checkbox"
                          />
                          必填
                        </label>
                      ) : (
                        <span className="op-copy">V1 轨道两题固定必答。</span>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button className="btn op-fadd" disabled={!canMutateQuestions || !canAddQuestion(track, questions.length)} onClick={addQuestion} type="button">＋ 添加问题</button>
            {addHint ? <span className="op-empty">{addHint}</span> : null}
          </section>

          <details className="op-fold op-fsec" data-ops-advanced>
            <summary>
              <span className="op-fsec-head"><strong className="op-sec-title-20">高级</strong><span className="op-fsec-sub">题集轨道与强调色。</span></span>
              <span className="op-fold-caret">⌄</span>
            </summary>
            <div className="op-fold-body">
              <div className="op-form-grid">
                <label className="op-field-label">
                  题集轨道
                  <select
                    className="op-field"
                    data-ops-track
                    disabled={!canMutateQuestions}
                    onChange={(input) => {
                      updateTrack(input.target.value as EventExperienceQuestionTrack);
                      setEditing(null);
                    }}
                    value={track}
                  >
                    <option value="v1">V1 · 两题必答兼容</option>
                    <option value="v2">V2 · 0–4 题可选</option>
                  </select>
                </label>
                <label className="op-field-label">
                  强调色（#RRGGBB）
                  <input
                    className="op-field"
                    data-ops-accent
                    maxLength={7}
                    onChange={(input) => setConfiguration((current) => ({ ...current, accentColor: input.target.value || null }))}
                    placeholder="#6E56CF"
                    value={configuration.accentColor ?? ""}
                  />
                </label>
              </div>
              <p className="op-copy">活动封面继续由活动本身的可信内容提供；本配置暂不接受 cover assetId 或外部 URL。</p>
            </div>
          </details>
        </div>

        <section className="op-fsec op-fsec-preview">
          <div className="op-fsec-head-row">
            <span className="op-fsec-head"><strong className="op-sec-title-20">报名弹窗预览</strong><span className="op-fsec-sub">这是用户实际看到的报名界面效果。</span></span>
            <button className="btn op-btn-edit" disabled={busy !== null || blank} onClick={() => void previewDraft()} type="button">
              {busy === "preview" ? "预览中…" : "预览（零写入）"}
            </button>
          </div>
          <div className="op-fp" data-ops-preview>
            <div className="op-fp-head">
              <span aria-hidden="true" className="op-fp-cover" />
              <span className="op-fp-meta">
                <strong className="op-fp-title">{event.title}</strong>
                {when ? <span className="op-fp-line">{`▦ ${when.date}${when.time}`}</span> : null}
              </span>
              <span aria-hidden="true" className="op-fp-close">✕</span>
            </div>
            <span className="op-fp-intro">{intro || "尚未填写报名说明。"}</span>
            {questions.map((question, index) => (
              <span className="op-fp-q" key={question.intent}>
                <strong className="op-fp-q-title">
                  {`${index + 1}. ${question.prompt}`}
                  {question.required ? <> <span className="op-fp-req">*</span></> : null}
                </strong>
                <span className="op-fp-opts">
                  {question.options.map((option, optionIndex) => (
                    <span className="op-fp-opt" key={`${optionIndex}:${option}`}>
                      <span aria-hidden="true" className={previewChoice(question.intent) === "single" ? "op-fp-radio" : "op-fp-check"} />
                      {option}
                    </span>
                  ))}
                </span>
              </span>
            ))}
            <span aria-disabled="true" className="op-fp-submit">提交报名</span>
          </div>
          {preview ? <span className="op-fp-hash" data-ops-preview-hash={preview.hash}>{`预览 hash ${preview.hash} · 仅内存校验，不写入数据库`}</span> : null}
          <span className="op-fp-note">ⓘ 预览仅用于编辑参考，发布后用户将看到此弹窗。</span>
        </section>
      </div>
    </div>
  );
}
