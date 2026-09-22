/**
 * 匹配与分组屏（Orbit_0918 运营台 match 屏，设计 166–209 行；`?tab=match`）：消费 `useEventOperations` 会话。
 * 四计数（参会者 / 参与匹配 / 分组桌数 / 轮次）→ 第 1 / 2 轮切换 → 桌卡（审阅修订 1：只读
 * `publishedResult.grouping.{roundOne,roundTwo}`；生成 completed 未发布 → 空态「已生成 N 人，待发布」+「发布结果 →」；
 * 桌卡含 theme / rationale / icebreakers / seat）→ 「N 位参会者资料不足」（`profileCompleteness === "minimal"`，0 → 省略）
 * → 「重新生成」(= 旧「生成匹配」含二次确认) + 「发布结果 →」(= 旧「原子发布」同条件)。
 * 审阅修订 5：旧生成列表（状态 pill / 进度 / ETA / 自动重试 / 重试失败分片 / 原子发布 + `data-generation-*`）放桌卡下方。
 */
"use client";

import { useState } from "react";

import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import { insufficientProfileCount, matchedParticipantIds, opsHref, ROUND_TOGGLE_TONE, roundTables, type MatchRound } from "./ops-model";
import {
  generationActionLabel,
  generationErrorLabel,
  generationEtaLabel,
  generationStatusLabels,
  publishableGeneration,
  PublishConfirm,
  RegenerateConfirm,
  regenerateLabel,
  SessionBanners,
  shortGenerationId,
} from "./ops-operations-shared";
import { AUTO_RETRY_LIMIT, type EventOperationsSession } from "./use-event-operations";

const ROUNDS: readonly MatchRound[] = [1, 2];

export function OpsMatch({ event, session }: { event: EventOperationsPageEvent; session: EventOperationsSession }) {
  const [round, setRound] = useState<MatchRound>(1);
  const [confirmingStart, setConfirmingStart] = useState(false);
  // 合并前终审修正 6：「发布结果 →」先确认再 POST …/publish（生成列表内的「原子发布」按钮不变）
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const {
    autoRetries,
    busy,
    generationAction,
    hasActiveGeneration,
    newestGeneration,
    participantNames,
    startGeneration,
    workspace,
  } = session;
  const published = workspace?.publishedResult ?? null;
  const tables = roundTables(published, round);
  // 任务 4：已进入已发布目录 / 最新 completed 快照的 minimal 参会者不再算「暂未进入分组」
  const insufficient = workspace ? insufficientProfileCount(workspace.participants, matchedParticipantIds(workspace)) : 0;
  const publishable = publishableGeneration(session);
  const matchedCount = published
    ? published.directory.length
    : newestGeneration?.status === "completed"
      ? newestGeneration.snapshot.participants.length
      : null;

  return (
    <div className="op-screen" data-ops-screen="match">
      <SessionBanners session={session} />

      {workspace ? (
        <>
          <div className="op-mstats">
            <div className="op-mstat"><span className="op-mstat-icon">⚇</span><span className="op-stat-copy"><span className="op-stat-label">参会者</span><strong className="op-mstat-n" data-ops-stat="participants">{workspace.metrics.participantCount}</strong></span></div>
            <div className="op-mstat"><span className="op-mstat-icon">⇄</span><span className="op-stat-copy"><span className="op-stat-label">参与匹配</span><strong className="op-mstat-n" data-ops-stat="matched">{matchedCount ?? "—"} <span className="op-mstat-unit">人</span></strong></span></div>
            <div className="op-mstat"><span className="op-mstat-icon">▤</span><span className="op-stat-copy"><span className="op-stat-label">分组桌数</span><strong className="op-mstat-n" data-ops-stat="tables">{published ? published.grouping.roundOne.length : "—"} <span className="op-mstat-unit">桌</span></strong></span></div>
            <div className="op-mstat"><span className="op-mstat-icon">↻</span><span className="op-stat-copy"><span className="op-stat-label">轮次</span><strong className="op-mstat-n" data-ops-stat="rounds">2 <span className="op-mstat-unit">轮</span></strong></span></div>
          </div>

          <div className="op-rounds" role="tablist">
            {ROUNDS.map((item) => {
              const tone = item === round ? ROUND_TOGGLE_TONE.on : ROUND_TOGGLE_TONE.off;
              return (
                <button
                  aria-selected={item === round}
                  className="btn op-round"
                  key={item}
                  onClick={() => setRound(item)}
                  role="tab"
                  style={{ background: tone.bg, color: tone.color, fontWeight: tone.weight }}
                  type="button"
                >
                  第 {item} 轮
                </button>
              );
            })}
          </div>

          {published ? (
            <div className="op-tables" data-ops-round={round}>
              {tables.length === 0 ? <div className="op-empty op-empty-dashed">本轮尚无已发布的分桌。</div> : null}
              {tables.map((table) => (
                <section className="op-table" data-ops-table={table.tableNumber} key={table.tableNumber}>
                  <span className="op-table-head">
                    <span className="op-table-name"><span className="op-table-ico">⚇</span><strong className="op-table-title">第 {round} 轮 · 桌 {table.tableNumber}</strong></span>
                    <span className="op-table-count">{table.members.length} 人</span>
                  </span>
                  <span className="op-table-theme">{table.theme}</span>
                  <span className="op-table-rationale">{table.rationale}</span>
                  <div className="op-seats">
                    {table.members.map((member) => {
                      const name = participantNames.get(member.participantId) ?? member.participantId;
                      // 设计 p.role「创始人 · AI Lab」= 真实 role · company（缺 → 省略），座位号（审阅修订 5）随后
                      const person = published.directory.find((entry) => entry.participantId === member.participantId);
                      const roleLine = [person?.role, person?.company].filter(Boolean).join(" · ");
                      return (
                        <span className="op-seat" key={member.participantId}>
                          <span className="op-seat-ava">{name.slice(0, 1)}</span>
                          <span className="op-seat-copy"><strong className="op-seat-name">{name}</strong><span className="op-seat-role">{roleLine ? `${roleLine} · ${member.seat}` : member.seat}</span></span>
                        </span>
                      );
                    })}
                  </div>
                  <details className="op-ice">
                    <summary>桌级破冰问题（{table.icebreakers.length}）</summary>
                    <ol>
                      {table.icebreakers.map((icebreaker) => <li key={icebreaker}>{icebreaker}</li>)}
                    </ol>
                  </details>
                </section>
              ))}
            </div>
          ) : (
            <div className="op-empty op-empty-dashed" data-ops-tables-empty>
              {publishable
                ? `已生成 ${publishable.snapshot.participants.length} 人，待发布。桌卡只读取已原子发布的结果，发布后在此显示两轮分桌。`
                : hasActiveGeneration
                  ? "匹配正在生成中，完成后由你确认发布。"
                  : "尚未生成匹配结果；生成完成并发布后在此显示两轮分桌。"}
            </div>
          )}

          {insufficient > 0 ? (
            <div className="op-warn" data-ops-insufficient={insufficient}>
              <span className="op-warn-ico">!</span>
              <span className="op-warn-copy"><strong className="op-warn-title">{insufficient} 位参会者资料不足，暂未进入分组</strong><span className="op-warn-sub">建议补充行业、职位或个人简历，以获得更准确的匹配结果。</span></span>
              <a className="btn op-warn-link" href={opsHref(event.id, "people")}>查看参会者 →</a>
            </div>
          ) : null}

          <div className="op-foot">
            <span className="op-foot-hint">ⓘ 生成完成不代表参与者可见，发布后才会显示给参与者。</span>
            {confirmingStart ? null : (
              <button className="btn op-btn-ghost" disabled={busy === "start" || hasActiveGeneration} onClick={() => setConfirmingStart(true)} type="button">{regenerateLabel(session)}</button>
            )}
            <button className="btn op-btn-publish" disabled={!publishable || busy !== null || confirmingPublish} onClick={() => setConfirmingPublish(true)} type="button">发布结果 →</button>
          </div>
          {confirmingStart ? (
            <RegenerateConfirm onCancel={() => setConfirmingStart(false)} onConfirm={() => { setConfirmingStart(false); void startGeneration(); }} session={session} />
          ) : null}
          {publishable && confirmingPublish ? (
            <PublishConfirm generation={publishable} onCancel={() => setConfirmingPublish(false)} onConfirm={() => { setConfirmingPublish(false); void generationAction(publishable); }} session={session} />
          ) : null}

          <section className="op-extra" id="ops-generation">
            <div className="op-extra-head">
              <div>
                <span className="op-eyebrow">STRICT AI PIPELINE</span>
                <strong className="op-sec-title-20">AI 生成与发布</strong>
              </div>
            </div>
            <p className="op-copy">所有任务完成并由你发布后，参会者才能看到生成结果；无效、缺失或超时的 AI 输出会保持失败状态，不会被替代内容掩盖。</p>
            {workspace.generations.length === 0 ? <div className="op-empty">尚未创建任何生成。</div> : null}
            {workspace.generations.map(({ generation, progress }) => (
              <article className="op-gen" key={generation.generationId}>
                <div className="op-gen-head">
                  <div>
                    <strong title={generation.generationId}>{shortGenerationId(generation.generationId)}</strong>
                    <div className="op-gen-snapshot">快照 {generation.snapshot.hash.slice(0, 12)}… · {generation.snapshot.participants.length} 位参会者</div>
                  </div>
                  <span className={generation.status === "failed" ? "op-pill op-pill-red" : generation.status === "published" ? "op-pill op-pill-green" : "op-pill op-pill-purple"}>{generationStatusLabels[generation.status] ?? generation.status}</span>
                </div>
                <div className="op-copy">{progress.completedTasks}/{progress.totalTasks} 已完成 · {progress.failedTasks} 失败 · {progress.percent}%</div>
                {generation.status === "queued" || generation.status === "running" ? (
                  <div className="op-gen-progress" data-generation-progress>
                    <div aria-hidden className="op-progress-track">
                      <div className="op-progress-bar" style={{ width: `${Math.max(3, progress.percent)}%` }} />
                    </div>
                    <div className="op-gen-eta">
                      {generationEtaLabel(generation.createdAt, progress.percent)}
                      {(autoRetries[generation.generationId] ?? 0) > 0 ? ` · 自动重试中（第 ${autoRetries[generation.generationId]}/${AUTO_RETRY_LIMIT} 次）` : ""}
                      {" · 可离开此页，完成后回来确认发布"}
                    </div>
                  </div>
                ) : null}
                {generation.status === "failed" && (autoRetries[generation.generationId] ?? 0) >= AUTO_RETRY_LIMIT ? (
                  <div className="op-gen-attention" data-generation-needs-attention>自动重试 {AUTO_RETRY_LIMIT} 次后仍有片段未通过，需要你手动处理。</div>
                ) : null}
                {generation.errorMessage ? (
                  <div className="op-gen-error">
                    {generationErrorLabel(generation.errorCode ?? "")}
                    <span className="op-gen-snapshot" style={{ marginLeft: 6 }}>{generation.errorCode}</span>
                    <div className="op-gen-error-detail">{generation.errorMessage}</div>
                  </div>
                ) : null}
                <div>
                  <button className={generation.status === "completed" ? "btn op-btn-sm op-dark" : "btn op-btn-sm op-ghost"} disabled={generation.status === "published" || generation.status === "queued" || generation.status === "running" || busy?.startsWith(generation.generationId)} onClick={() => void generationAction(generation)} type="button">{generationActionLabel(generation)}</button>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
