/**
 * 概览 / 匹配两屏共用的运营台片段（任务 3）：原样搬自旧 `[id]/operations/event-operations-admin-workspace.tsx`
 * 的文案表与派生函数（19–82 行）、「重新生成」确认框（357–372 行）与错误 / 提示 / 加载三条（313–315 行）。
 * 不含 fetch；全部动作来自 `useEventOperations` 会话。
 */
"use client";

import type { EventOperationsGeneration } from "../../../../../features/events/event-operations/contract";
import { dateFields, numberFields, type EventOperationsSession } from "./use-event-operations";

// Engine tuning knobs live behind an "advanced" fold; organizers normally only
// touch the schedule gates and the two matching-shape numbers.
export const advancedNumberFields = ["shardSize", "maxAttemptsPerTask"] as const;
export const basicNumberFields = ["recommendationCount", "tableSize"] as const;

export const fieldLabels: Record<(typeof dateFields)[number] | (typeof numberFields)[number], string> = {
  checkInOpensAt: "签到开放时间",
  eventEndsAt: "活动结束（锁定）",
  eventStartsAt: "活动开始（锁定）",
  maxAttemptsPerTask: "单任务重试上限",
  profileEditDeadlineAt: "画像编辑截止",
  recommendationCount: "每人推荐数",
  registrationCutoffAt: "报名截止",
  resultsAvailableAt: "结果开放时间",
  roundOneStartsAt: "第一轮开始",
  roundTwoStartsAt: "第二轮开始",
  shardSize: "AI 分片大小",
  tableSize: "每桌人数",
};

export const generationStatusLabels: Record<string, string> = {
  completed: "已完成",
  failed: "失败",
  published: "已发布",
  queued: "排队中",
  running: "运行中",
  superseded: "已被取代",
};

export function generationErrorLabel(code: string): string {
  if (code.includes("SCHEMA_INVALID")) return "AI 输出未通过严格校验";
  if (code.includes("SHARD_FAILED")) return "分片执行失败";
  if (code.includes("LEASE_LOST")) return "任务租约过期";
  if (code.includes("TIMEOUT")) return "AI 请求超时";
  return "生成失败";
}

export function shortGenerationId(generationId: string): string {
  const hash = generationId.split(":").pop() ?? generationId;
  return `生成 #${hash.slice(0, 8)}`;
}

/**
 * Rough remaining-time estimate for a running generation, extrapolated from
 * elapsed wall time and completed-task percentage. Returns a Chinese phrase;
 * before any task completes it falls back to the observed 8–12 minute range.
 */
export function generationEtaLabel(createdAt: string, percent: number): string {
  const startedMs = Date.parse(createdAt);
  if (!Number.isFinite(startedMs) || percent <= 0) return "预计 8–12 分钟";
  const elapsedMs = Date.now() - startedMs;
  if (elapsedMs <= 0) return "预计 8–12 分钟";
  const remainingMs = (elapsedMs / percent) * (100 - percent);
  const minutes = Math.max(1, Math.round(remainingMs / 60_000));
  return `预计还需约 ${minutes} 分钟`;
}

export function generationActionLabel(generation: EventOperationsGeneration): string {
  if (generation.status === "failed") return "重试失败分片";
  if (generation.status === "completed") return "原子发布";
  if (generation.status === "published") return "已发布";
  return "Worker 处理中…";
}

/** 设计「重新生成」= 旧「生成匹配」（尚无任何生成时仍叫「生成匹配」）；进行中 → 「生成进行中…」。 */
export function regenerateLabel(session: Pick<EventOperationsSession, "hasActiveGeneration" | "workspace">): string {
  if (session.hasActiveGeneration) return "生成进行中…";
  return (session.workspace?.generations.length ?? 0) === 0 ? "生成匹配" : "重新生成";
}

/** 旧 357–372 行的二次确认框，文案原样；`data-generation-start-confirm` 为既有测试标记。 */
export function RegenerateConfirm({
  onCancel,
  onConfirm,
  session,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  session: Pick<EventOperationsSession, "busy" | "workspace">;
}) {
  return (
    <div className="op-confirm" data-generation-start-confirm>
      <strong>将为 {session.workspace?.metrics.participantCount ?? 0} 位已报名参会者生成推荐与两轮分桌</strong>
      <p className="op-copy">预计 8–12 分钟；失败的片段会自动重试。生成完成后由你预览并确认发布，不会自动对参会者公开。</p>
      <div className="op-confirm-actions">
        <button className="btn op-btn-sm op-dark" disabled={session.busy === "start"} onClick={onConfirm} type="button">{session.busy === "start" ? "正在开始…" : "开始生成"}</button>
        <button className="btn op-btn-sm op-ghost" onClick={onCancel} type="button">取消</button>
      </div>
    </div>
  );
}

/**
 * 发布前二次确认（合并前终审修正 6）：概览「前往发布 →」与匹配屏「发布结果 →」首击只展开本框，不发 POST；
 * 「确认发布」才调 `generationAction(generation)`（POST …/publish）。结构 / 装饰沿用 `RegenerateConfirm`（`op-confirm`）。
 */
export function PublishConfirm({
  generation,
  onCancel,
  onConfirm,
  session,
}: {
  generation: EventOperationsGeneration;
  onCancel: () => void;
  onConfirm: () => void;
  session: Pick<EventOperationsSession, "busy">;
}) {
  const publishing = session.busy === `${generation.generationId}:publish`;
  return (
    <div className="op-confirm" data-generation-publish-confirm={generation.generationId}>
      <strong>将发布 {shortGenerationId(generation.generationId)}（{generation.snapshot.participants.length} 位参会者）</strong>
      <p className="op-copy">发布后不可更改，参会者将看到分组结果。</p>
      <div className="op-confirm-actions">
        <button className="btn op-btn-sm op-dark" disabled={session.busy !== null} onClick={onConfirm} type="button">{publishing ? "正在发布…" : "确认发布"}</button>
        <button className="btn op-btn-sm op-ghost" disabled={publishing} onClick={onCancel} type="button">取消</button>
      </div>
    </div>
  );
}

/** 错误 / 提示 / 加载三条（旧 313–315 行），文案原样。 */
export function SessionBanners({ session }: { session: Pick<EventOperationsSession, "error" | "loading" | "notice"> }) {
  return (
    <>
      {session.error ? <div className="op-alert" role="alert">{session.error}</div> : null}
      {session.notice ? <div className="op-notice" role="status">{session.notice}</div> : null}
      {session.loading ? <div className="op-extra">正在读取运营状态…</div> : null}
    </>
  );
}

/** 发布入口的可用条件（旧生成卡「原子发布」同条件）：最新生成 completed 且无进行中动作。 */
export function publishableGeneration(session: Pick<EventOperationsSession, "newestGeneration" | "busy">): EventOperationsGeneration | null {
  const newest = session.newestGeneration;
  if (!newest || newest.status !== "completed") return null;
  return newest;
}
