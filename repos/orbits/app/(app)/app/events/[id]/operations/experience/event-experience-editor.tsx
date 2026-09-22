"use client";

import type { EventExperienceQuestionTrack } from "../../../../../../../features/events/experience/contract";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../../../../orbit-0918-tokens";
import { PublicTopNav } from "../../../../orbit-public-shell";
import { useExperienceEditor } from "../../../ops-0918/use-experience-editor";

interface ExperienceEditorProps {
  eventId: string;
}

function formatDate(value: string | null): string {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : value;
}

export function EventExperienceEditor({ eventId }: ExperienceEditorProps) {
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
    published,
    questionCountLabel,
    removeQuestion,
    revision,
    saveDraft,
    setConfiguration,
    snapshot,
    updateQuestion,
    updateTrack,
  } = useExperienceEditor(eventId);

  return (
    <div data-orbit-real-page="event-experience-editor" style={{ background: C.pageBg, color: C.ink, fontFamily: ORBIT_0918_FONTS.sans, minHeight: "100dvh" }}>
      <style>{EX_0918_CSS}</style>
      <PublicTopNav active="events" />
      <main className="ex-main">
        <nav className="ex-crumb">
          <a href={`/app/events/${encodeURIComponent(eventId)}/operations`}>运营台</a>
          {" / "}
          <span>报名设置</span>
        </nav>
        <div className="ex-head">
          <div className="ex-head-title">
            <h1>报名设置</h1>
            <p>编辑用户点击报名后看到的问题与说明；发布后题集不可原地修改。</p>
          </div>
          <div className="ex-status">
            <span className="ex-pill">草稿 revision <span className="ex-mono">{revision}</span></span>
            <span className={published ? "ex-pill ex-pill-green" : "ex-pill"}>{published ? `已发布 v${published.version}` : "未发布"}</span>
            <span className="ex-pill">◷ 画像编辑截止 {formatDate(snapshot?.head.frozenAt ?? null)}</span>
          </div>
        </div>
        {error ? <div className="ex-alert" role="alert">{error}</div> : null}
        {notice ? <div className="ex-notice" role="status">{notice}</div> : null}
        {loading ? <div className="ex-card ex-loading">正在读取活动体验…</div> : null}

        <div className="ex-grid">
          <div className="ex-col">
            <section className="ex-card">
              <div className="ex-card-title">
                <strong>报名弹窗说明</strong>
                <span>这段说明将显示在用户点击「报名」后，位于问题列表的上方。</span>
              </div>
              <textarea
                className="ex-textarea"
                maxLength={1000}
                onChange={(event) => setConfiguration((current) => ({ ...current, introduction: event.target.value || null }))}
                placeholder="告诉参与者这场活动适合谁，以及会发生什么。"
                rows={4}
                value={configuration.introduction ?? ""}
              />
              <span className="ex-counter">{(configuration.introduction ?? "").length} / 1000</span>
              <div className="ex-fields">
                <label className="ex-field">
                  <span>强调色（#RRGGBB）</span>
                  <input
                    className="ex-input"
                    maxLength={7}
                    onChange={(event) => setConfiguration((current) => ({ ...current, accentColor: event.target.value || null }))}
                    placeholder="#6E56CF"
                    value={configuration.accentColor ?? ""}
                  />
                </label>
                <label className="ex-field">
                  <span>题集轨道</span>
                  <select
                    className="ex-input"
                    onChange={(event) => updateTrack(event.target.value as EventExperienceQuestionTrack)}
                    value={configuration.questionSet.track}
                  >
                    <option value="v1">V1 · 两题必答兼容</option>
                    <option value="v2">V2 · 0–4 题可选</option>
                  </select>
                </label>
              </div>
              <p className="ex-note">活动封面继续由活动本身的可信内容提供；本配置暂不接受 cover assetId 或外部 URL。</p>
            </section>

            <section className="ex-card">
              <div className="ex-card-head">
                <div className="ex-card-title">
                  <span className="ex-eyebrow">FIXED PROFILE MAPPING</span>
                  <strong>报名问题 · {questionCountLabel}</strong>
                </div>
                {configuration.questionSet.track === "v2" ? (
                  <button
                    className="ex-btn ex-btn-ghost ex-btn-sm"
                    disabled={configuration.questionSet.questions.length >= 4}
                    onClick={addQuestion}
                    type="button"
                  >
                    + 添加固定维度
                  </button>
                ) : null}
              </div>
              <p className="ex-note">每道题只能写入 Orbit 已有的 participant profile 字段；V1 始终保留「想认识谁 / 能提供什么」两题。</p>
              {configuration.questionSet.questions.map((question, index) => (
                <article className="ex-question" key={question.intent}>
                  <div className="ex-question-head">
                    <strong className="ex-mono">{question.intent}</strong>
                    <div className="ex-question-actions">
                      <span className={question.required ? "ex-pill ex-pill-red" : "ex-pill"}>{question.required ? "必答" : "可选"}</span>
                      {configuration.questionSet.track === "v2" ? (
                        <button className="ex-btn ex-btn-ghost ex-btn-sm" onClick={() => removeQuestion(index)} type="button">移除</button>
                      ) : null}
                    </div>
                  </div>
                  <label className="ex-field">
                    <span>题目</span>
                    <input
                      className="ex-input"
                      onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                      value={question.prompt}
                    />
                  </label>
                  <label className="ex-field">
                    <span>选项（用逗号分隔，2–5 项）</span>
                    <input
                      className="ex-input"
                      onChange={(event) => updateQuestion(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
                      value={question.options.join(", ")}
                    />
                  </label>
                </article>
              ))}
            </section>
          </div>

          <div className="ex-col">
            <section className="ex-card">
              <div className="ex-card-title">
                <strong>保存与发布</strong>
                <span>保存草稿不影响报名者；发布后报名表固定使用该题集版本。</span>
              </div>
              <div className="ex-actions">
                <button className="ex-btn ex-btn-ghost" disabled={busy !== null} onClick={saveDraft} type="button">
                  {busy === "save" ? "保存中…" : "保存草稿"}
                </button>
                <button className="ex-btn ex-btn-ghost" disabled={busy !== null} onClick={previewDraft} type="button">
                  {busy === "preview" ? "预览中…" : "预览（零写入）"}
                </button>
                <button className="ex-btn ex-btn-dark" disabled={busy !== null || !snapshot?.draft} onClick={publishDraft} type="button">
                  {busy === "publish" ? "发布中…" : "发布题集"}
                </button>
              </div>
              {frozen ? (
                <div className="ex-frozen">已到画像编辑截止时间；仍可调整展示字段并保存/发布，但题集轨道、题目和选项必须与当前已发布版本一致。</div>
              ) : null}
            </section>

            <section className="ex-card">
              <div className="ex-card-title">
                <strong>报名弹窗预览</strong>
                <span>预览仅在内存中校验，不会写入报名或参会者数据。</span>
              </div>
              {preview ? (
                <div className="ex-preview" style={{ borderLeft: `4px solid ${preview.configuration.accentColor ?? "#DDDEFA"}` }}>
                  <span className="ex-eyebrow">EPHEMERAL PREVIEW</span>
                  <div className="ex-preview-hash">hash <span className="ex-mono">{preview.hash}</span> · 不会写入数据库</div>
                  <div className="ex-preview-intro">{preview.configuration.introduction ?? "暂无活动简介"}</div>
                  <div className="ex-preview-accent ex-mono">accent {preview.configuration.accentColor ?? "未设置"}</div>
                </div>
              ) : (
                <div className="ex-empty">尚未生成预览；点击「预览（零写入）」生成内存中的校验版本。</div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Orbit_0918 报名设置作用域样式（属性选择器不写引号，避免静态渲染转义失效）。 */
const EX_0918_CSS = `
[data-orbit-real-page=event-experience-editor] .ex-main { margin: 0 auto; max-width: 1240px; padding: 14px clamp(16px,4vw,40px) 72px; display: flex; flex-direction: column; gap: 22px; }
[data-orbit-real-page=event-experience-editor] .ex-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page=event-experience-editor] .ex-crumb a { color: #6B6F99; text-decoration: none; }
[data-orbit-real-page=event-experience-editor] .ex-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px; }
[data-orbit-real-page=event-experience-editor] .ex-head-title h1 { margin: 0; font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: clamp(28px,3.4vw,40px); letter-spacing: -0.03em; }
[data-orbit-real-page=event-experience-editor] .ex-head-title p { margin: 10px 0 0; font-size: 15px; color: #3B3F7A; max-width: 560px; }
[data-orbit-real-page=event-experience-editor] .ex-status { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page=event-experience-editor] .ex-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px; background: #F7F7FD; color: #6B6F99; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page=event-experience-editor] .ex-pill-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page=event-experience-editor] .ex-pill-red { background: #FBECEA; color: #B5473A; }
[data-orbit-real-page=event-experience-editor] .ex-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-experience-editor] .ex-eyebrow { font-size: 10px; letter-spacing: .14em; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-experience-editor] .ex-alert { border: 1px solid #FBECEA; background: #FBECEA; color: #B5473A; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
[data-orbit-real-page=event-experience-editor] .ex-notice { border: 1px solid #DDDEFA; background: #ECEEFB; color: #2E3270; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
[data-orbit-real-page=event-experience-editor] .ex-loading { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page=event-experience-editor] .ex-grid { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(300px,1fr); gap: 20px; align-items: start; }
@media (max-width: 900px) { [data-orbit-real-page=event-experience-editor] .ex-grid { grid-template-columns: 1fr; } }
[data-orbit-real-page=event-experience-editor] .ex-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
[data-orbit-real-page=event-experience-editor] .ex-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page=event-experience-editor] .ex-card-title { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page=event-experience-editor] .ex-card-title strong { font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page=event-experience-editor] .ex-card-title span { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-experience-editor] .ex-card-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=event-experience-editor] .ex-note { margin: 0; font-size: 12px; color: #6B6F99; line-height: 1.6; }
[data-orbit-real-page=event-experience-editor] .ex-fields { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); }
[data-orbit-real-page=event-experience-editor] .ex-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page=event-experience-editor] .ex-input, [data-orbit-real-page=event-experience-editor] .ex-textarea { padding: 12px 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; font-size: 14px; font-family: inherit; color: #0E1225; outline: none; }
[data-orbit-real-page=event-experience-editor] .ex-input:focus, [data-orbit-real-page=event-experience-editor] .ex-textarea:focus { border-color: #4B4FC7; }
[data-orbit-real-page=event-experience-editor] .ex-textarea { width: 100%; line-height: 1.7; resize: vertical; }
[data-orbit-real-page=event-experience-editor] .ex-counter { align-self: flex-end; font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page=event-experience-editor] .ex-question { border: 1px solid #E8E9F6; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page=event-experience-editor] .ex-question-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
[data-orbit-real-page=event-experience-editor] .ex-question-head > strong { font-size: 13px; }
[data-orbit-real-page=event-experience-editor] .ex-question-actions { display: flex; align-items: center; gap: 8px; }
[data-orbit-real-page=event-experience-editor] .ex-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-family: inherit; cursor: pointer; border: 1px solid transparent; background: transparent; color: #3B3F7A; }
[data-orbit-real-page=event-experience-editor] .ex-btn:disabled { opacity: .55; cursor: default; }
[data-orbit-real-page=event-experience-editor] .ex-btn-dark { background: #0E1225; border-color: #0E1225; color: #FFFFFF; font-weight: 500; }
[data-orbit-real-page=event-experience-editor] .ex-btn-dark:hover:not(:disabled) { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page=event-experience-editor] .ex-btn-ghost { background: #FFFFFF; border-color: #DDDEFA; color: #3B3F7A; }
[data-orbit-real-page=event-experience-editor] .ex-btn-ghost:hover:not(:disabled) { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page=event-experience-editor] .ex-btn-sm { padding: 9px 14px; font-size: 13px; border-radius: 9px; }
[data-orbit-real-page=event-experience-editor] .ex-actions { display: flex; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page=event-experience-editor] .ex-frozen { border: 1px solid #F0E2C6; background: #FDF8EF; color: #9A6B22; border-radius: 12px; padding: 12px 14px; font-size: 12px; line-height: 1.6; }
[data-orbit-real-page=event-experience-editor] .ex-preview { border: 1px solid #E8E9F6; border-radius: 14px; background: #F7F7FD; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page=event-experience-editor] .ex-preview-hash { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=event-experience-editor] .ex-preview-intro { font-size: 14px; color: #0E1225; line-height: 1.7; white-space: pre-wrap; }
[data-orbit-real-page=event-experience-editor] .ex-preview-accent { font-size: 11px; color: #9FA3C4; }
[data-orbit-real-page=event-experience-editor] .ex-empty { border: 1px dashed #DDDEFA; border-radius: 12px; padding: 16px; font-size: 13px; color: #9FA3C4; }
`;
