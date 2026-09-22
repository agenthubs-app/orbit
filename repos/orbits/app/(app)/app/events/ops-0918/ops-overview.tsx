/**
 * 运营台概览屏（Orbit_0918 运营台 ops 屏，设计 115–164 行）：消费 `useEventOperations` 会话。
 * 四张大数卡（已报名 / 可参与匹配 / 已签到 / 匹配结果）→ 运营进度五阶段（`pipelineSteps`，真实生命周期推导）
 * + 「查看分组结果 →」(`?tab=match`) + 「重新生成」(= 旧「生成匹配」含二次确认) → 当前设置四行 + 「编辑配置」
 * （审阅修订 6：打开本屏下方的运营配置折叠区，非设计 goForm）→ 「需要处理」（资料不足 = `profileCompleteness === "minimal"`；
 * 「前往发布 →」= 旧「原子发布」同条件）。设计之外的既有能力按审阅修订 5 保留：运营配置折叠区（时间闸门 + 高级引擎参数
 * + CONFIGURED TIMELINE）、签到链接卡、名片交换审计（参会者到场目录已于任务 4 迁入签到屏）。
 */
"use client";

import { useState } from "react";

import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import {
  insufficientProfileCount,
  matchedParticipantIds,
  matchEligibleCount,
  opsHref,
  pipelineSteps,
  pipelineStepStyle,
} from "./ops-model";
import {
  advancedNumberFields,
  basicNumberFields,
  fieldLabels,
  publishableGeneration,
  RegenerateConfirm,
  regenerateLabel,
  SessionBanners,
} from "./ops-operations-shared";
import {
  canonicalScheduleFields,
  dateFields,
  formatTimestamp,
  type EventOperationsSession,
} from "./use-event-operations";

const CONFIG_ANCHOR = "ops-configuration";

function ConfigurationFold({ open, onToggle, session }: { open: boolean; onToggle: (next: boolean) => void; session: EventOperationsSession }) {
  const { busy, form, saveConfiguration, setForm, timeline } = session;
  return (
    <details className="op-extra op-fold" id={CONFIG_ANCHOR} onToggle={(event) => onToggle(event.currentTarget.open)} open={open}>
      <summary>
        <span className="op-extra-head" style={{ flex: 1 }}>
          <div>
            <span className="op-eyebrow">TIME GATES & SHARD POLICY</span>
            <strong className="op-sec-title-20">运营配置</strong>
          </div>
        </span>
        <span className="op-empty">{open ? "收起 ⌃" : "展开 ⌄"}</span>
      </summary>
      <div className="op-fold-body">
        <p className="op-copy">活动开始与结束时间锁定为主活动档期；其余规则均需主办方显式设定。</p>
        <div className="op-form-grid">
          {dateFields.map((field) => (
            <label className="op-field-label" key={field}>
              <span>{fieldLabels[field]}<span className="op-field-key">{field}</span></span>
              <input
                className="op-field"
                onInput={(input) => {
                  const nextValue = input.currentTarget.value;
                  setForm((value) => ({ ...value, [field]: nextValue }));
                }}
                readOnly={canonicalScheduleFields.includes(field as (typeof canonicalScheduleFields)[number])}
                type="datetime-local"
                value={form[field]}
              />
            </label>
          ))}
          {basicNumberFields.map((field) => (
            <label className="op-field-label" key={field}>
              <span>{fieldLabels[field]}<span className="op-field-key">{field}</span></span>
              <input className="op-field" min={1} onInput={(input) => {
                const nextValue = input.currentTarget.value;
                setForm((value) => ({ ...value, [field]: nextValue }));
              }} type="number" value={form[field]} />
            </label>
          ))}
        </div>
        <details className="op-advanced">
          <summary>高级引擎参数（一般无需调整）</summary>
          <div className="op-form-grid">
            {advancedNumberFields.map((field) => (
              <label className="op-field-label" key={field}>
                <span>{fieldLabels[field]}<span className="op-field-key">{field}</span></span>
                <input className="op-field" min={1} onInput={(input) => {
                  const nextValue = input.currentTarget.value;
                  setForm((value) => ({ ...value, [field]: nextValue }));
                }} type="number" value={form[field]} />
              </label>
            ))}
          </div>
        </details>
        <div>
          <button className="btn op-btn-dark" disabled={busy === "configuration"} onClick={() => void saveConfiguration()} type="button">{busy === "configuration" ? "保存中…" : "保存配置"}</button>
        </div>
        {timeline.length > 0 ? (
          <div className="op-timeline">
            <span className="op-eyebrow">CONFIGURED TIMELINE · LIVE STATUS</span>
            <div className="op-timeline-grid">
              {timeline.map((gate) => (
                <div className="op-gate" key={gate.label}>
                  <div>
                    <div className="op-gate-name">{gate.label}</div>
                    <div className="op-gate-at">{formatTimestamp(gate.at)}</div>
                  </div>
                  <span className={gate.state === "open" || gate.state === "open now" || gate.state === "available" || gate.state === "live" ? "op-pill op-pill-green" : "op-pill"}>{gate.state}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function OpsOverview({ event, session }: { event: EventOperationsPageEvent; session: EventOperationsSession }) {
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const {
    busy,
    checkInOpen,
    configuration,
    copyCheckInLink,
    generationAction,
    hasActiveGeneration,
    newestGeneration,
    operationsCheckInHref,
    publishedMatchStatus,
    startGeneration,
    workspace,
  } = session;
  const now = Date.now();
  const steps = pipelineSteps({
    eventEndsAt: configuration?.eventEndsAt ?? null,
    eventStartsAt: configuration?.eventStartsAt ?? null,
    newestGeneration,
    now,
    publishedAt: workspace?.publishedResult?.publishedAt ?? null,
    registrationCutoffAt: configuration?.registrationCutoffAt ?? null,
  });
  // 任务 4：已进入已发布目录 / 最新 completed 快照的 minimal 参会者不再算「资料不完整」（可参与匹配沿用 matchEligibleCount）
  const insufficient = workspace ? insufficientProfileCount(workspace.participants, matchedParticipantIds(workspace)) : 0;
  const publishable = publishableGeneration(session);
  const admissionHref = opsHref(event.id, "people");

  return (
    <div className="op-screen" data-ops-screen="overview">
      <SessionBanners session={session} />

      {workspace ? (
        <>
          <div className="op-stats">
            <div className="op-stat"><span className="op-stat-icon">⚇</span><span className="op-stat-copy"><span className="op-stat-label">已报名</span><strong className="op-stat-n" data-ops-stat="signup">{workspace.metrics.participantCount}</strong></span></div>
            <div className="op-stat"><span className="op-stat-icon">⇄</span><span className="op-stat-copy"><span className="op-stat-label">可参与匹配</span><strong className="op-stat-n" data-ops-stat="eligible">{matchEligibleCount(workspace.participants)}</strong></span></div>
            <div className="op-stat"><span className="op-stat-icon">✓</span><span className="op-stat-copy"><span className="op-stat-label">已签到</span><strong className="op-stat-n" data-ops-stat="checked">{workspace.metrics.checkedIn}</strong></span></div>
            <div className="op-stat op-stat-soft"><span className="op-stat-icon">▤</span><span className="op-stat-copy"><span className="op-stat-label">匹配结果</span><strong className="op-stat-n op-stat-n-status" data-ops-stat="result">{publishedMatchStatus}</strong></span></div>
          </div>

          <div className="op-ops-grid">
            <section className="op-progress">
              <span className="op-sec-head"><strong className="op-sec-title-22">运营进度</strong><span className="op-sec-sub">完成各阶段的准备工作，确保活动顺利进行。</span></span>
              <div className="op-steps" data-ops-steps>
                {steps.map((step, index) => {
                  const style = pipelineStepStyle(steps, index);
                  return (
                    <span className="op-step" data-ops-step={step.state} key={step.label}>
                      <span className="op-step-rail">
                        <span className="op-step-line-l" style={{ background: style.leftLine }} />
                        <span className="op-step-line-r" style={{ background: style.rightLine }} />
                        <span className="op-step-dot" style={{ background: style.dotBg, borderColor: style.ringColor }}>{style.mark}</span>
                      </span>
                      <span className="op-step-label" style={{ color: style.color, fontWeight: style.weight }}>{step.label}</span>
                      <span className="op-step-meta" style={{ color: style.metaColor }}>{step.meta}</span>
                    </span>
                  );
                })}
              </div>
              <div className="op-actions">
                <a className="btn op-btn-primary-lg" href={opsHref(event.id, "match")}>查看分组结果 →</a>
                {confirmingStart ? null : (
                  <button className="btn op-btn-ghost-lg" disabled={busy === "start" || hasActiveGeneration} onClick={() => setConfirmingStart(true)} type="button">{regenerateLabel(session)}</button>
                )}
              </div>
              {confirmingStart ? (
                <RegenerateConfirm onCancel={() => setConfirmingStart(false)} onConfirm={() => { setConfirmingStart(false); void startGeneration(); }} session={session} />
              ) : null}
              <span className="op-hint">ⓘ 发布后参与者才能查看结果</span>
            </section>

            <div className="op-side">
              <section className="op-config">
                <span className="op-config-head">
                  <strong className="op-sec-title-20">当前设置</strong>
                  <a className="btn op-btn-edit" href={`#${CONFIG_ANCHOR}`} onClick={() => setConfigOpen(true)}>编辑配置</a>
                </span>
                <span className="op-config-row"><span className="op-config-key"><span className="op-config-ico">⚇</span>每桌人数</span><strong className="op-config-val">{configuration ? configuration.tableSize : "—"}</strong></span>
                <span className="op-config-row"><span className="op-config-key"><span className="op-config-ico">⇄</span>交流轮数</span><strong className="op-config-val">2</strong></span>
                <span className="op-config-row"><span className="op-config-key"><span className="op-config-ico">◷</span>每人推荐数</span><strong className="op-config-val">{configuration ? configuration.recommendationCount : "—"}</strong></span>
                <span className="op-config-row"><span className="op-config-key"><span className="op-config-ico">⚇</span>已报名</span><strong className="op-config-val">{workspace.metrics.participantCount}</strong></span>
              </section>

              <section className="op-todo" data-ops-todo>
                <strong className="op-sec-title-20">需要处理</strong>
                {insufficient > 0 ? (
                  <span className="op-todo-row"><span className="op-todo-ico op-todo-warn">!</span><span className="op-todo-text">{insufficient} 位参会者资料不完整</span><a className="btn op-link-btn" href={admissionHref}>查看详情 →</a></span>
                ) : null}
                {hasActiveGeneration ? (
                  <span className="op-todo-row"><span className="op-todo-ico op-todo-info">ⓘ</span><span className="op-todo-text">匹配正在生成中</span></span>
                ) : publishable ? (
                  <span className="op-todo-row"><span className="op-todo-ico op-todo-info">ⓘ</span><span className="op-todo-text">匹配结果尚未发布</span><button className="btn op-link-btn" disabled={busy !== null} onClick={() => void generationAction(publishable)} type="button">前往发布 →</button></span>
                ) : !workspace.publishedResult && !confirmingStart ? (
                  <span className="op-todo-row"><span className="op-todo-ico op-todo-info">ⓘ</span><span className="op-todo-text">尚未生成匹配</span><button className="btn op-link-btn" onClick={() => setConfirmingStart(true)} type="button">去生成 →</button></span>
                ) : null}
                {insufficient === 0 && !hasActiveGeneration && !publishable && workspace.publishedResult ? (
                  <span className="op-empty">暂无需要处理的事项。</span>
                ) : null}
              </section>
            </div>
          </div>
        </>
      ) : null}

      <ConfigurationFold onToggle={setConfigOpen} open={configOpen} session={session} />

      {workspace ? (
        <>
          <section className="op-extra">
            <div>
              <span className="op-eyebrow">VENUE CHECK-IN ENTRY</span>
              <div style={{ marginTop: 8 }}><strong className="op-sec-title-20">展示或分享参会者签到链接</strong></div>
            </div>
            <p className="op-copy">这是真实的已报名参会者签到路由。没有经过验证的本地二维码编码器时不会生成二维码图片；请直接复制或投屏此链接。</p>
            <div className="op-checkin-row">
              <a className="btn op-btn-ghost" href={operationsCheckInHref} rel="noreferrer" target="_blank">打开签到页</a>
              <button className="btn op-btn-dark" onClick={() => void copyCheckInLink()} type="button">复制链接</button>
              <code className="op-code">{operationsCheckInHref}</code>
            </div>
            <div className="op-copy" style={{ color: checkInOpen ? "#2F6B4F" : "#9FA3C4" }}>签到窗口：{checkInOpen ? "当前开放" : "已关闭或尚未开放"}</div>
          </section>

          <section className="op-extra">
            <div>
              <span className="op-eyebrow">CONSENT AUDIT</span>
              <div style={{ marginTop: 8 }}><strong className="op-sec-title-20">名片交换审计</strong></div>
            </div>
            {workspace.contactRequests.length === 0 ? <div className="op-empty">尚无名片交换申请。</div> : workspace.contactRequests.map((request) => (
              <div className="op-audit-row" key={request.requestId}>
                <strong>{request.requesterParticipantId} → {request.targetParticipantId}</strong>
                <span className="op-pill">{request.status}</span>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
