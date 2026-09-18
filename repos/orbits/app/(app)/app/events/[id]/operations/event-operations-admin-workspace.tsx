"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventOperationsCheckIn,
  EventOperationsConfiguration,
  EventOperationsGeneration,
  EventOperationsTable,
} from "../../../../../../features/events/event-operations/contract";
import type { EventOperationsAdminWorkspace } from "../../../../../../features/events/event-operations/service";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../../../orbit-0918-tokens";
import { PublicTopNav } from "../../../orbit-public-shell";

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

interface ConfigurationForm {
  checkInOpensAt: string;
  eventEndsAt: string;
  eventStartsAt: string;
  maxAttemptsPerTask: string;
  profileEditDeadlineAt: string;
  recommendationCount: string;
  registrationCutoffAt: string;
  resultsAvailableAt: string;
  roundOneStartsAt: string;
  roundTwoStartsAt: string;
  shardSize: string;
  tableSize: string;
}

const dateFields = [
  "eventStartsAt",
  "eventEndsAt",
  "profileEditDeadlineAt",
  "registrationCutoffAt",
  "checkInOpensAt",
  "resultsAvailableAt",
  "roundOneStartsAt",
  "roundTwoStartsAt",
] as const;

const canonicalScheduleFields = ["eventStartsAt", "eventEndsAt"] as const;

const numberFields = [
  "recommendationCount",
  "tableSize",
  "shardSize",
  "maxAttemptsPerTask",
] as const;

// Engine tuning knobs live behind an "advanced" fold; organizers normally only
// touch the schedule gates and the two matching-shape numbers.
const advancedNumberFields = ["shardSize", "maxAttemptsPerTask"] as const;
const basicNumberFields = ["recommendationCount", "tableSize"] as const;

const fieldLabels: Record<(typeof dateFields)[number] | (typeof numberFields)[number], string> = {
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

const generationStatusLabels: Record<string, string> = {
  completed: "已完成",
  failed: "失败",
  published: "已发布",
  queued: "排队中",
  running: "运行中",
  superseded: "已被取代",
};

function generationErrorLabel(code: string): string {
  if (code.includes("SCHEMA_INVALID")) return "AI 输出未通过严格校验";
  if (code.includes("SHARD_FAILED")) return "分片执行失败";
  if (code.includes("LEASE_LOST")) return "任务租约过期";
  if (code.includes("TIMEOUT")) return "AI 请求超时";
  return "生成失败";
}

function shortGenerationId(generationId: string): string {
  const hash = generationId.split(":").pop() ?? generationId;
  return `生成 #${hash.slice(0, 8)}`;
}

/**
 * Rough remaining-time estimate for a running generation, extrapolated from
 * elapsed wall time and completed-task percentage. Returns a Chinese phrase;
 * before any task completes it falls back to the observed 8–12 minute range.
 */
function generationEtaLabel(createdAt: string, percent: number): string {
  const startedMs = Date.parse(createdAt);
  if (!Number.isFinite(startedMs) || percent <= 0) return "预计 8–12 分钟";
  const elapsedMs = Date.now() - startedMs;
  if (elapsedMs <= 0) return "预计 8–12 分钟";
  const remainingMs = (elapsedMs / percent) * (100 - percent);
  const minutes = Math.max(1, Math.round(remainingMs / 60_000));
  return `预计还需约 ${minutes} 分钟`;
}

const AUTO_RETRY_LIMIT = 2;

function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formFor(
  configuration: EventOperationsConfiguration | null,
  event: { endsAt: string; startsAt: string },
): ConfigurationForm {
  return {
    checkInOpensAt: configuration ? localDateTime(configuration.checkInOpensAt) : "",
    eventEndsAt: localDateTime(configuration?.eventEndsAt ?? event.endsAt),
    eventStartsAt: localDateTime(configuration?.eventStartsAt ?? event.startsAt),
    maxAttemptsPerTask: configuration ? String(configuration.maxAttemptsPerTask) : "",
    profileEditDeadlineAt: configuration ? localDateTime(configuration.profileEditDeadlineAt) : "",
    recommendationCount: configuration ? String(configuration.recommendationCount) : "",
    registrationCutoffAt: configuration ? localDateTime(configuration.registrationCutoffAt) : "",
    resultsAvailableAt: configuration ? localDateTime(configuration.resultsAvailableAt) : "",
    roundOneStartsAt: configuration ? localDateTime(configuration.roundOneStartsAt) : "",
    roundTwoStartsAt: configuration ? localDateTime(configuration.roundTwoStartsAt) : "",
    shardSize: configuration ? String(configuration.shardSize) : "",
    tableSize: configuration ? String(configuration.tableSize) : "",
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || !envelope.data) {
    throw new Error(envelope?.error?.message ?? `Request failed with status ${response.status}.`);
  }
  return envelope.data;
}

function generationActionLabel(generation: EventOperationsGeneration): string {
  if (generation.status === "failed") return "重试失败分片";
  if (generation.status === "completed") return "原子发布";
  if (generation.status === "published") return "已发布";
  return "Worker 处理中…";
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp)
    : value;
}

function PublishedRoundPreview({
  participantNames,
  tables,
  title,
}: {
  participantNames: ReadonlyMap<string, string>;
  tables: readonly EventOperationsTable[];
  title: string;
}) {
  return (
    <div className="ops-round">
      <h3 className="ops-round-title">{title}</h3>
      {tables.length === 0 ? <div className="ops-empty">尚无已发布的分桌。</div> : null}
      {tables.map((table) => (
        <article className="ops-table" key={table.tableNumber}>
          <div className="ops-table-head">
            <span className="ops-table-name">
              <span className="ops-table-icon">⚇</span>
              <strong>桌 {table.tableNumber} · {table.theme}</strong>
            </span>
            <span className="ops-table-count">{table.members.length} 人</span>
          </div>
          <div className="ops-table-rationale">{table.rationale}</div>
          <div className="ops-members">
            {table.members.map((member) => {
              const name = participantNames.get(member.participantId) ?? member.participantId;
              return (
                <span className="ops-member" key={member.participantId}>
                  <span className="ops-member-ava">{name.slice(0, 1)}</span>
                  <span className="ops-member-meta">
                    <strong>{name}</strong>
                    <span className="ops-member-seat">{member.seat}</span>
                  </span>
                </span>
              );
            })}
          </div>
          <details className="ops-ice">
            <summary>桌级破冰问题（{table.icebreakers.length}）</summary>
            <ol>
              {table.icebreakers.map((icebreaker) => <li key={icebreaker}>{icebreaker}</li>)}
            </ol>
          </details>
        </article>
      ))}
    </div>
  );
}

/**
 * Orbit_0918 运营台作用域样式。属性选择器一律不写引号（React 静态渲染会把
 * 双引号转义成 &quot; 导致选择器失效）。
 */
const OPS_0918_CSS = `
[data-orbit-real-page=event-operations-admin] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page=event-operations-admin] .ops-main { margin: 0 auto; max-width: 1240px; padding: 14px clamp(16px,4vw,40px) 72px; display: flex; flex-direction: column; gap: 24px; }
[data-orbit-real-page=event-operations-admin] .ops-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page=event-operations-admin] .ops-crumb a { color: #6B6F99; }
[data-orbit-real-page=event-operations-admin] .ops-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 20px; }
[data-orbit-real-page=event-operations-admin] .ops-head h1 { margin: 0; font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: clamp(28px,3.4vw,40px); letter-spacing: -0.03em; }
[data-orbit-real-page=event-operations-admin] .ops-head p { margin: 10px 0 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page=event-operations-admin] .ops-head-actions { display: flex; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-family: inherit; cursor: pointer; border: 1px solid transparent; background: transparent; color: #3B3F7A; }
[data-orbit-real-page=event-operations-admin] .ops-btn:disabled { opacity: .55; cursor: default; }
[data-orbit-real-page=event-operations-admin] .ops-btn-dark { background: #0E1225; border-color: #0E1225; color: #FFFFFF; font-weight: 500; }
[data-orbit-real-page=event-operations-admin] .ops-btn-dark:hover:not(:disabled) { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page=event-operations-admin] .ops-btn-ghost { background: #FFFFFF; border-color: #DDDEFA; color: #3B3F7A; }
[data-orbit-real-page=event-operations-admin] .ops-btn-ghost:hover:not(:disabled) { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page=event-operations-admin] .ops-btn-sm { padding: 10px 14px; font-size: 13px; border-radius: 9px; }
[data-orbit-real-page=event-operations-admin] .ops-alert { border: 1px solid #FBECEA; background: #FBECEA; color: #B5473A; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
[data-orbit-real-page=event-operations-admin] .ops-notice { border: 1px solid #DDDEFA; background: #ECEEFB; color: #2E3270; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
[data-orbit-real-page=event-operations-admin] .ops-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; }
[data-orbit-real-page=event-operations-admin] .ops-section { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page=event-operations-admin] .ops-section-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-section-head > div { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-eyebrow { font-size: 10px; letter-spacing: .14em; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-operations-admin] .ops-section-title { font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page=event-operations-admin] .ops-section-sub { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-operations-admin] .ops-note { margin: 0; font-size: 13px; color: #6B6F99; line-height: 1.6; }
[data-orbit-real-page=event-operations-admin] .ops-empty { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page=event-operations-admin] .ops-empty-dashed { border: 1px dashed #DDDEFA; border-radius: 12px; padding: 16px; }
[data-orbit-real-page=event-operations-admin] .ops-link { font-size: 13px; color: #4B4FC7; }
[data-orbit-real-page=event-operations-admin] .ops-metrics { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 16px; }
[data-orbit-real-page=event-operations-admin] .ops-metric { display: flex; align-items: center; gap: 16px; padding: 22px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page=event-operations-admin] .ops-metric-soft { background: #F7F7FD; }
[data-orbit-real-page=event-operations-admin] .ops-metric-icon { width: 46px; height: 46px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 18px; }
[data-orbit-real-page=event-operations-admin] .ops-metric-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page=event-operations-admin] .ops-metric-meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-metric-meta > span { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-operations-admin] .ops-metric-meta > strong { font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: 30px; letter-spacing: -0.02em; }
[data-orbit-real-page=event-operations-admin] .ops-metric-meta > strong.ops-metric-status { font-size: 22px; }
[data-orbit-real-page=event-operations-admin] .ops-steps { display: grid; grid-template-columns: repeat(5,1fr); align-items: start; }
@media (max-width: 720px) { [data-orbit-real-page=event-operations-admin] .ops-steps { grid-template-columns: repeat(2,1fr); row-gap: 18px; } }
[data-orbit-real-page=event-operations-admin] .ops-step { display: flex; flex-direction: column; align-items: center; gap: 12px; position: relative; }
[data-orbit-real-page=event-operations-admin] .ops-step-rail { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; height: 26px; }
[data-orbit-real-page=event-operations-admin] .ops-step-line { position: absolute; top: 12px; height: 2px; }
[data-orbit-real-page=event-operations-admin] .ops-step-dot { position: relative; width: 26px; height: 26px; border-radius: 50%; border: 2px solid; display: flex; align-items: center; justify-content: center; font-size: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-step-label { font-size: 14px; text-align: center; }
[data-orbit-real-page=event-operations-admin] .ops-step-meta { font-size: 12px; text-align: center; }
[data-orbit-real-page=event-operations-admin] .ops-confirm { border: 1px solid #DDDEFA; border-radius: 14px; background: #F7F7FD; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-gen { border: 1px solid #E8E9F6; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-gen-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-gen-snapshot { font-size: 11px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-top: 5px; }
[data-orbit-real-page=event-operations-admin] .ops-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: #F1F1FA; color: #6B6F99; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page=event-operations-admin] .ops-pill-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page=event-operations-admin] .ops-pill-red { background: #FBECEA; color: #B5473A; }
[data-orbit-real-page=event-operations-admin] .ops-pill-purple { background: #ECEEFB; color: #4B4FC7; }
[data-orbit-real-page=event-operations-admin] .ops-progress-track { background: #ECEEFB; border-radius: 999px; height: 6px; overflow: hidden; }
[data-orbit-real-page=event-operations-admin] .ops-progress-bar { background: linear-gradient(90deg,#4B4FC7,#8A8EE0); border-radius: 999px; height: 100%; transition: width .6s ease; }
[data-orbit-real-page=event-operations-admin] .ops-rounds { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit,minmax(min(100%,340px),1fr)); }
[data-orbit-real-page=event-operations-admin] .ops-round { display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-round-title { margin: 0; font-size: 15px; font-weight: 700; }
[data-orbit-real-page=event-operations-admin] .ops-table { border: 1px solid #E8E9F6; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-table-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-table-name { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 15px; }
[data-orbit-real-page=event-operations-admin] .ops-table-icon { color: #4B4FC7; }
[data-orbit-real-page=event-operations-admin] .ops-table-count { font-size: 13px; color: #6B6F99; white-space: nowrap; }
[data-orbit-real-page=event-operations-admin] .ops-table-rationale { font-size: 12px; color: #6B6F99; line-height: 1.55; }
[data-orbit-real-page=event-operations-admin] .ops-members { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,170px),1fr)); gap: 8px; }
[data-orbit-real-page=event-operations-admin] .ops-member { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px; background: #F7F7FD; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-member-ava { width: 28px; height: 28px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
[data-orbit-real-page=event-operations-admin] .ops-member-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-member-meta strong { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page=event-operations-admin] .ops-member-seat { font-size: 11px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-operations-admin] .ops-ice summary { cursor: pointer; font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=event-operations-admin] .ops-ice ol { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: #3B3F7A; line-height: 1.6; }
[data-orbit-real-page=event-operations-admin] .ops-form-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(min(100%,210px),1fr)); }
[data-orbit-real-page=event-operations-admin] .ops-field-label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #3B3F7A; }
[data-orbit-real-page=event-operations-admin] .ops-field-label .ops-field-key { margin-left: 6px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-field { padding: 12px 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; font-size: 14px; font-family: inherit; color: #0E1225; outline: none; }
[data-orbit-real-page=event-operations-admin] .ops-field:focus { border-color: #4B4FC7; }
[data-orbit-real-page=event-operations-admin] .ops-field[readonly] { background: #F7F7FD; color: #6B6F99; }
[data-orbit-real-page=event-operations-admin] .ops-advanced summary { cursor: pointer; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-operations-admin] .ops-advanced > div { margin-top: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-timeline { border-top: 1px solid #E8E9F6; padding-top: 18px; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-timeline-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); }
[data-orbit-real-page=event-operations-admin] .ops-gate { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid #E8E9F6; border-radius: 10px; padding: 11px; }
[data-orbit-real-page=event-operations-admin] .ops-gate-name { font-size: 12px; font-weight: 700; }
[data-orbit-real-page=event-operations-admin] .ops-gate-at { font-size: 11px; color: #9FA3C4; margin-top: 3px; }
[data-orbit-real-page=event-operations-admin] .ops-checkin-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page=event-operations-admin] .ops-code { background: #F7F7FD; border-radius: 8px; flex: 1 1 320px; overflow-wrap: anywhere; padding: 10px 12px; font-size: 12px; }
[data-orbit-real-page=event-operations-admin] .ops-dir { display: flex; flex-direction: column; }
[data-orbit-real-page=event-operations-admin] .ops-dir-head, [data-orbit-real-page=event-operations-admin] .ops-dir-row { display: grid; grid-template-columns: minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,.8fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,1fr); gap: 14px; align-items: center; }
[data-orbit-real-page=event-operations-admin] .ops-dir-head { padding: 0 4px 12px; border-bottom: 1px solid #E8E9F6; font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page=event-operations-admin] .ops-dir-row { padding: 14px 4px; border-bottom: 1px solid #F1F1FA; }
[data-orbit-real-page=event-operations-admin] .ops-dir-person { display: flex; align-items: center; gap: 12px; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-ava { width: 36px; height: 36px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page=event-operations-admin] .ops-dir-name { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-dir-name strong { font-size: 14px; font-weight: 500; }
[data-orbit-real-page=event-operations-admin] .ops-dir-id { font-size: 10px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page=event-operations-admin] .ops-dir-cell { font-size: 13px; color: #3B3F7A; min-width: 0; }
[data-orbit-real-page=event-operations-admin] .ops-audit-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid #F1F1FA; padding: 12px 0; font-size: 13px; }
@media (max-width: 860px) {
  [data-orbit-real-page=event-operations-admin] .ops-dir-head { display: none; }
  [data-orbit-real-page=event-operations-admin] .ops-dir-row { grid-template-columns: 1fr 1fr; row-gap: 10px; }
}
`;

export function EventOperationsAdminWorkspace({
  canManageRoles = false,
  event,
}: {
  canManageRoles?: boolean;
  event: { endsAt: string; id: string; startsAt: string; title: string };
}) {
  const baseUrl = `/api/events/${encodeURIComponent(event.id)}/operations/admin`;
  const [workspace, setWorkspace] = useState<EventOperationsAdminWorkspace | null>(null);
  const [form, setForm] = useState<ConfigurationForm>(() => formFor(null, event));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [confirmingStart, setConfirmingStart] = useState(false);
  // Client-side orchestration: how many automatic retries this session has
  // spent per generation. Only the newest generation is ever auto-retried.
  const [autoRetries, setAutoRetries] = useState<Record<string, number>>({});

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const next = await requestJson<EventOperationsAdminWorkspace>(baseUrl);
      setWorkspace(next);
      if (showLoading) setForm(formFor(next.configuration, event));
      setError(null);
    } catch (cause) {
      setWorkspace(null);
      setError(cause instanceof Error ? cause.message : "Could not load event operations.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [baseUrl, event]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const hasActiveGeneration = workspace?.generations.some(
    ({ generation }) =>
      generation.status === "queued" || generation.status === "running",
  ) ?? false;

  useEffect(() => {
    if (!hasActiveGeneration) return;
    const timer = window.setInterval(() => {
      void load(false);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [hasActiveGeneration, load]);

  async function saveConfiguration() {
    setBusy("configuration");
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, string | number> = {};
      for (const field of dateFields) {
        if (!form[field]) throw new Error(`${field} is required.`);
        payload[field] = field === "eventStartsAt"
          ? event.startsAt
          : field === "eventEndsAt"
            ? event.endsAt
            : new Date(form[field]).toISOString();
      }
      for (const field of numberFields) {
        const value = Number(form[field]);
        if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer.`);
        payload[field] = value;
      }
      await requestJson<EventOperationsConfiguration>(baseUrl, {
        body: JSON.stringify(payload),
        method: "PUT",
      });
      setNotice("配置已按主办方的显式输入保存。");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save configuration.");
    } finally {
      setBusy(null);
    }
  }

  async function startGeneration() {
    setBusy("start");
    setError(null);
    setNotice(null);
    setConfirmingStart(false);
    try {
      const generation = await requestJson<EventOperationsGeneration>(`${baseUrl}/generations`, {
        body: JSON.stringify({}),
        method: "POST",
      });
      setNotice(`已开始生成匹配（报名快照 ${generation.snapshot.hash.slice(0, 12)}…）。预计 8–12 分钟，失败的片段会自动重试；可以离开此页，完成后回来确认发布。`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start generation.");
    } finally {
      setBusy(null);
    }
  }

  // Auto-retry the newest generation when it fails on a retryable engine
  // error, up to AUTO_RETRY_LIMIT rounds. Configuration-level failures are
  // never auto-retried — they need an organizer decision.
  const newestGeneration = workspace?.generations[0]?.generation ?? null;
  useEffect(() => {
    if (!newestGeneration || newestGeneration.status !== "failed") return;
    const code = newestGeneration.errorCode ?? "";
    if (code.includes("CONFIGURATION") || code.includes("NOT_CONFIGURED")) return;
    const spent = autoRetries[newestGeneration.generationId] ?? 0;
    if (spent >= AUTO_RETRY_LIMIT || busy !== null) return;
    const generationId = newestGeneration.generationId;
    setAutoRetries((current) => ({ ...current, [generationId]: spent + 1 }));
    setNotice(`部分片段未通过校验，已自动重试（第 ${spent + 1}/${AUTO_RETRY_LIMIT} 次）…`);
    void requestJson(
      `${baseUrl}/generations/${encodeURIComponent(generationId)}/retry`,
      { method: "POST" },
    ).then(() => load(false)).catch(() => {
      // The next poll surfaces persisted state; manual retry stays available.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestGeneration?.generationId, newestGeneration?.status]);

  async function generationAction(generation: EventOperationsGeneration) {
    if (generation.status === "published") return;
    const action = generation.status === "failed"
      ? "retry"
      : generation.status === "completed"
        ? "publish"
        : null;
    if (!action) return;
    setBusy(`${generation.generationId}:${action}`);
    setError(null);
    setNotice(null);
    try {
      await requestJson(
        `${baseUrl}/generations/${encodeURIComponent(generation.generationId)}/${action}`,
        {
          method: "POST",
        },
      );
      setNotice(
        action === "publish"
          ? "整份生成结果已通过一次原子指针更新发布。"
          : action === "retry"
            ? "仅重置了失败分片；已完成分片的输出全部保留。"
            : "持久 worker 只会回收可重试的失败分片。",
      );
      await load();
    } catch (cause) {
      const actionError = cause instanceof Error
        ? cause.message
        : `Could not ${action} generation.`;
      await load();
      setError(actionError);
    } finally {
      setBusy(null);
    }
  }

  async function markParticipantArrived(participantId: string) {
    setBusy(`checkin:${participantId}`);
    setError(null);
    setNotice(null);
    try {
      const checkIn = await requestJson<EventOperationsCheckIn>(`${baseUrl}/check-ins`, {
        body: JSON.stringify({ participantId }),
        method: "POST",
      });
      setNotice(`已记录到场时间 ${formatTimestamp(checkIn.checkedInAt)}；重复操作会保留最初的签到时间。`);
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark this participant as arrived.");
    } finally {
      setBusy(null);
    }
  }

  async function copyCheckInLink() {
    const path = `/app/party/checkin?eventId=${encodeURIComponent(event.id)}`;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setNotice("Check-in link copied. It can be displayed on the venue screen or sent to registered attendees.");
      setError(null);
    } catch {
      setNotice("Select and copy the visible check-in link manually; no QR code was fabricated.");
    }
  }

  const checkInsByParticipant = useMemo(
    () => new Map(workspace?.checkIns.map((record) => [record.participantId, record]) ?? []),
    [workspace],
  );
  const participantNames = useMemo(
    () => new Map(workspace?.participants.map((participant) => [participant.participantId, participant.displayName]) ?? []),
    [workspace],
  );
  const checkInHref = `/app/party/checkin?eventId=${encodeURIComponent(event.id)}`;
  const operationsCheckInHref = `/app/events/${encodeURIComponent(event.id)}/operations/check-in`;
  const configuration = workspace?.configuration ?? null;
  const checkInOpen = configuration
    ? currentTimeMs >= Date.parse(configuration.checkInOpensAt) &&
      currentTimeMs <= Date.parse(configuration.eventEndsAt)
    : false;
  const timeline = configuration
    ? [
        { at: configuration.profileEditDeadlineAt, label: "Profile edit deadline", state: currentTimeMs < Date.parse(configuration.profileEditDeadlineAt) ? "open" : "closed" },
        { at: configuration.registrationCutoffAt, label: "Registration cutoff", state: currentTimeMs < Date.parse(configuration.registrationCutoffAt) ? "open" : "closed" },
        { at: configuration.checkInOpensAt, label: "Check-in opens", state: checkInOpen ? "open now" : currentTimeMs < Date.parse(configuration.checkInOpensAt) ? "upcoming" : "closed" },
        { at: configuration.resultsAvailableAt, label: "Results available", state: currentTimeMs >= Date.parse(configuration.resultsAvailableAt) ? "available" : "locked" },
        { at: configuration.eventStartsAt, label: "Event starts", state: currentTimeMs < Date.parse(configuration.eventStartsAt) ? "upcoming" : currentTimeMs <= Date.parse(configuration.eventEndsAt) ? "live" : "ended" },
        { at: configuration.roundOneStartsAt, label: "Round one starts", state: currentTimeMs < Date.parse(configuration.roundOneStartsAt) ? "upcoming" : "started" },
        { at: configuration.roundTwoStartsAt, label: "Round two starts", state: currentTimeMs < Date.parse(configuration.roundTwoStartsAt) ? "upcoming" : "started" },
        { at: configuration.eventEndsAt, label: "Event ends", state: currentTimeMs <= Date.parse(configuration.eventEndsAt) ? "upcoming" : "ended" },
      ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    : [];

  const publishedMatchStatus = !workspace
    ? "—"
    : workspace.publishedResult
      ? "已发布"
      : workspace.generations.some(({ generation }) => generation.status === "completed")
        ? "待发布"
        : "未发布";

  // 运营进度步进条：全部从真实配置时间门禁、生成状态与发布结果推导，无伪造阶段。
  const progressSteps = workspace && configuration
    ? (() => {
        const ws = workspace;
        const cfg = configuration;
        const generated = ws.generations.some(
          ({ generation }) => generation.status === "completed" || generation.status === "published",
        );
        const defs = [
          { done: currentTimeMs >= Date.parse(cfg.registrationCutoffAt), label: "报名截止", meta: formatTimestamp(cfg.registrationCutoffAt) },
          { done: generated, label: "生成匹配", meta: "" },
          { done: Boolean(ws.publishedResult), label: "发布结果", meta: "" },
          { done: currentTimeMs >= Date.parse(cfg.checkInOpensAt), label: "签到开放", meta: formatTimestamp(cfg.checkInOpensAt) },
          { done: currentTimeMs >= Date.parse(cfg.eventStartsAt), label: "活动现场", meta: formatTimestamp(cfg.eventStartsAt) },
        ];
        const currentIndex = defs.findIndex((def) => !def.done);
        return defs.map((def, index) => ({ ...def, current: index === currentIndex }));
      })()
    : [];

  return (
    <div data-orbit-real-page="event-operations-admin" style={{ background: C.pageBg, color: C.ink, fontFamily: ORBIT_0918_FONTS.sans, minHeight: "100dvh" }}>
      <style>{OPS_0918_CSS}</style>
      <PublicTopNav active="events" />
      <main className="ops-main">
        <nav className="ops-crumb">
          <a href="/app/events/center">活动中心</a>
          {" / "}
          <a href={`/app/events/${encodeURIComponent(event.id)}`}>{event.title}</a>
          {" / "}
          <span>运营台</span>
        </nav>

        <div className="ops-head">
          <div>
            <h1>{event.title} · 运营台</h1>
            <p>管理活动准备、匹配分组、现场签到与数据查看。</p>
          </div>
          {workspace ? (
            <div className="ops-head-actions">
              <a className="ops-btn ops-btn-dark" href={`/app/events/${encodeURIComponent(event.id)}`}>查看活动页面 →</a>
              <a className="ops-btn ops-btn-ghost" href="/app/events/center">运营活动中心</a>
              <a className="ops-btn ops-btn-ghost" href={operationsCheckInHref}>打开签到台</a>
              <a className="ops-btn ops-btn-ghost" href={`/app/events/${encodeURIComponent(event.id)}/operations/experience`}>报名体验</a>
              <a className="ops-btn ops-btn-ghost" href={`/app/events/${encodeURIComponent(event.id)}/analytics`}>活动分析</a>
              {canManageRoles ? (
                <a className="ops-btn ops-btn-ghost" data-event-roles-entry href={`/app/events/${encodeURIComponent(event.id)}/operations/roles`}>管理角色</a>
              ) : null}
              <a className="ops-btn ops-btn-ghost" href={`${baseUrl}/export`}>导出 CSV</a>
            </div>
          ) : null}
        </div>

        {error ? <div className="ops-alert" role="alert">{error}</div> : null}
        {notice ? <div className="ops-notice" role="status">{notice}</div> : null}
        {loading ? <div className="ops-card ops-section">正在读取运营状态…</div> : null}

        {workspace ? (
          <>
            <section className="ops-metrics">
              <div className="ops-metric">
                <span className="ops-metric-icon">⚇</span>
                <span className="ops-metric-meta"><span>已报名</span><strong>{workspace.metrics.participantCount}</strong></span>
              </div>
              <div className="ops-metric">
                <span className="ops-metric-icon ops-metric-green">✓</span>
                <span className="ops-metric-meta"><span>已签到</span><strong>{workspace.metrics.checkedIn}</strong></span>
              </div>
              <div className="ops-metric">
                <span className="ops-metric-icon">⇄</span>
                <span className="ops-metric-meta"><span>名片申请 · 已同意 {workspace.metrics.acceptedContactRequests}</span><strong>{workspace.metrics.contactRequests}</strong></span>
              </div>
              <div className="ops-metric ops-metric-soft">
                <span className="ops-metric-icon">▤</span>
                <span className="ops-metric-meta"><span>匹配结果</span><strong className="ops-metric-status">{publishedMatchStatus}</strong></span>
              </div>
            </section>

            {progressSteps.length > 0 ? (
              <section className="ops-card ops-section">
                <div className="ops-section-head">
                  <div>
                    <strong className="ops-section-title">运营进度</strong>
                    <span className="ops-section-sub">完成各阶段的准备工作，确保活动顺利进行。</span>
                  </div>
                  {newestGeneration?.status === "completed" ? <a className="ops-link" href="#ops-generation">前往发布 →</a> : null}
                </div>
                <div className="ops-steps">
                  {progressSteps.map((step, index) => (
                    <span className="ops-step" key={step.label}>
                      <span className="ops-step-rail">
                        <span className="ops-step-line" style={{ background: index === 0 ? "transparent" : progressSteps[index - 1]?.done ? "#4B4FC7" : "#E8E9F6", left: 0, right: "50%" }} />
                        <span className="ops-step-line" style={{ background: index === progressSteps.length - 1 ? "transparent" : step.done ? "#4B4FC7" : "#E8E9F6", left: "50%", right: 0 }} />
                        <span className="ops-step-dot" style={{ background: step.done ? "#4B4FC7" : "#FFFFFF", borderColor: step.done || step.current ? "#4B4FC7" : "#DDDEFA", color: step.done ? "#FFFFFF" : "#4B4FC7" }}>{step.done ? "✓" : step.current ? "●" : ""}</span>
                      </span>
                      <span className="ops-step-label" style={{ color: step.done || step.current ? "#0E1225" : "#9FA3C4", fontWeight: step.current ? 700 : 400 }}>{step.label}</span>
                      <span className="ops-step-meta" style={{ color: step.current ? "#4B4FC7" : "#9FA3C4" }}>{step.current ? "当前阶段" : step.meta || (step.done ? "已完成" : "")}</span>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="ops-card ops-section" id="ops-generation">
              <div className="ops-section-head">
                <div>
                  <span className="ops-eyebrow">STRICT AI PIPELINE</span>
                  <strong className="ops-section-title">AI 生成与发布</strong>
                </div>
                {confirmingStart ? null : (
                  <button className="ops-btn ops-btn-dark" disabled={busy === "start" || hasActiveGeneration} onClick={() => setConfirmingStart(true)} type="button">{hasActiveGeneration ? "生成进行中…" : "生成匹配"}</button>
                )}
              </div>
              {confirmingStart ? (
                <div className="ops-confirm" data-generation-start-confirm>
                  <strong>将为 {workspace.metrics.participantCount} 位已报名参会者生成推荐与两轮分桌</strong>
                  <p className="ops-note">预计 8–12 分钟；失败的片段会自动重试。生成完成后由你预览并确认发布，不会自动对参会者公开。</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ops-btn ops-btn-dark ops-btn-sm" disabled={busy === "start"} onClick={startGeneration} type="button">{busy === "start" ? "正在开始…" : "开始生成"}</button>
                    <button className="ops-btn ops-btn-ghost ops-btn-sm" onClick={() => setConfirmingStart(false)} type="button">取消</button>
                  </div>
                </div>
              ) : null}
              <p className="ops-note">所有任务完成并由你发布后，参会者才能看到生成结果；无效、缺失或超时的 AI 输出会保持失败状态，不会被替代内容掩盖。</p>
              {workspace.generations.length === 0 ? <div className="ops-empty">尚未创建任何生成。</div> : null}
              {workspace.generations.map(({ generation, progress }) => (
                <article className="ops-gen" key={generation.generationId}>
                  <div className="ops-gen-head">
                    <div>
                      <strong title={generation.generationId}>{shortGenerationId(generation.generationId)}</strong>
                      <div className="ops-gen-snapshot">快照 {generation.snapshot.hash.slice(0, 12)}… · {generation.snapshot.participants.length} 位参会者</div>
                    </div>
                    <span className={generation.status === "failed" ? "ops-pill ops-pill-red" : generation.status === "published" ? "ops-pill ops-pill-green" : "ops-pill ops-pill-purple"}>{generationStatusLabels[generation.status] ?? generation.status}</span>
                  </div>
                  <div className="ops-note">{progress.completedTasks}/{progress.totalTasks} 已完成 · {progress.failedTasks} 失败 · {progress.percent}%</div>
                  {generation.status === "queued" || generation.status === "running" ? (
                    <div data-generation-progress style={{ display: "grid", gap: 7 }}>
                      <div aria-hidden className="ops-progress-track">
                        <div className="ops-progress-bar" style={{ width: `${Math.max(3, progress.percent)}%` }} />
                      </div>
                      <div className="ops-step-meta" style={{ textAlign: "left" }}>
                        {generationEtaLabel(generation.createdAt, progress.percent)}
                        {(autoRetries[generation.generationId] ?? 0) > 0 ? ` · 自动重试中（第 ${autoRetries[generation.generationId]}/${AUTO_RETRY_LIMIT} 次）` : ""}
                        {" · 可离开此页，完成后回来确认发布"}
                      </div>
                    </div>
                  ) : null}
                  {generation.status === "failed" && (autoRetries[generation.generationId] ?? 0) >= AUTO_RETRY_LIMIT ? (
                    <div data-generation-needs-attention style={{ color: "#9A6B22", fontSize: 12 }}>自动重试 {AUTO_RETRY_LIMIT} 次后仍有片段未通过，需要你手动处理。</div>
                  ) : null}
                  {generation.errorMessage ? (
                    <div style={{ color: "#B5473A", fontSize: 12 }}>
                      {generationErrorLabel(generation.errorCode ?? "")}
                      <span className="ops-gen-snapshot" style={{ marginLeft: 6 }}>{generation.errorCode}</span>
                      <div style={{ color: "#6B6F99", marginTop: 3 }}>{generation.errorMessage}</div>
                    </div>
                  ) : null}
                  <div>
                    <button className={generation.status === "completed" ? "ops-btn ops-btn-dark ops-btn-sm" : "ops-btn ops-btn-ghost ops-btn-sm"} disabled={generation.status === "published" || generation.status === "queued" || generation.status === "running" || busy?.startsWith(generation.generationId)} onClick={() => generationAction(generation)} type="button">{generationActionLabel(generation)}</button>
                  </div>
                </article>
              ))}
            </section>

            <section className="ops-card ops-section">
              <div>
                <span className="ops-eyebrow">PUBLISHED SEATING PREVIEW</span>
                <div style={{ marginTop: 8 }}><strong className="ops-section-title">两轮分桌预览</strong></div>
              </div>
              <p className="ops-note">此预览只读取已原子发布的结果：真实桌号、座位、话题、桌级归因与桌级破冰问题。</p>
              {workspace.publishedResult ? (
                <div className="ops-rounds">
                  <PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundOne} title="第一轮 · 互补分桌" />
                  <PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundTwo} title="第二轮 · 话题桌" />
                </div>
              ) : (
                <div className="ops-empty ops-empty-dashed">尚无已发布的分桌结果；已完成的生成在主办方原子发布前不会出现在这里。</div>
              )}
            </section>
          </>
        ) : null}

        <section className="ops-card ops-section">
          <div>
            <span className="ops-eyebrow">TIME GATES & SHARD POLICY</span>
            <div style={{ marginTop: 8 }}><strong className="ops-section-title">运营配置</strong></div>
          </div>
          <p className="ops-note">活动开始与结束时间锁定为主活动档期；其余规则均需主办方显式设定。</p>
          <div className="ops-form-grid">
            {dateFields.map((field) => (
              <label className="ops-field-label" key={field}>
                <span>{fieldLabels[field]}<span className="ops-field-key">{field}</span></span>
                <input
                  className="ops-field"
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
              <label className="ops-field-label" key={field}>
                <span>{fieldLabels[field]}<span className="ops-field-key">{field}</span></span>
                <input className="ops-field" min={1} onInput={(input) => {
                  const nextValue = input.currentTarget.value;
                  setForm((value) => ({ ...value, [field]: nextValue }));
                }} type="number" value={form[field]} />
              </label>
            ))}
          </div>
          <details className="ops-advanced">
            <summary>高级引擎参数（一般无需调整）</summary>
            <div className="ops-form-grid">
              {advancedNumberFields.map((field) => (
                <label className="ops-field-label" key={field}>
                  <span>{fieldLabels[field]}<span className="ops-field-key">{field}</span></span>
                  <input className="ops-field" min={1} onInput={(input) => {
                    const nextValue = input.currentTarget.value;
                    setForm((value) => ({ ...value, [field]: nextValue }));
                  }} type="number" value={form[field]} />
                </label>
              ))}
            </div>
          </details>
          <div>
            <button className="ops-btn ops-btn-dark" disabled={busy === "configuration"} onClick={saveConfiguration} type="button">{busy === "configuration" ? "保存中…" : "保存配置"}</button>
          </div>
          {timeline.length > 0 ? (
            <div className="ops-timeline">
              <span className="ops-eyebrow">CONFIGURED TIMELINE · LIVE STATUS</span>
              <div className="ops-timeline-grid">
                {timeline.map((gate) => (
                  <div className="ops-gate" key={gate.label}>
                    <div>
                      <div className="ops-gate-name">{gate.label}</div>
                      <div className="ops-gate-at">{formatTimestamp(gate.at)}</div>
                    </div>
                    <span className={gate.state === "open" || gate.state === "open now" || gate.state === "available" || gate.state === "live" ? "ops-pill ops-pill-green" : "ops-pill"}>{gate.state}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {workspace ? (
          <>
            <section className="ops-card ops-section">
              <div>
                <span className="ops-eyebrow">VENUE CHECK-IN ENTRY</span>
                <div style={{ marginTop: 8 }}><strong className="ops-section-title">展示或分享参会者签到链接</strong></div>
              </div>
              <p className="ops-note">这是真实的已报名参会者签到路由。没有经过验证的本地二维码编码器时不会生成二维码图片；请直接复制或投屏此链接。</p>
              <div className="ops-checkin-row">
                <a className="ops-btn ops-btn-ghost" href={checkInHref} rel="noreferrer" target="_blank">打开签到页</a>
                <button className="ops-btn ops-btn-dark" onClick={copyCheckInLink} type="button">复制链接</button>
                <code className="ops-code">{checkInHref}</code>
              </div>
              <div className="ops-note" style={{ color: checkInOpen ? "#2F6B4F" : "#9FA3C4" }}>签到窗口：{checkInOpen ? "当前开放" : "已关闭或尚未开放"}</div>
            </section>

            <section className="ops-card ops-section">
              <div className="ops-section-head">
                <div>
                  <span className="ops-eyebrow">REAL REGISTRATION DIRECTORY</span>
                  <strong className="ops-section-title">参会者与到场状态</strong>
                  <span className="ops-section-sub">{workspace.participants.length - workspace.checkIns.length} 人未到场 · 通过主办方专用接口逐一标记到场。</span>
                </div>
              </div>
              {workspace.participants.length === 0 ? <div className="ops-empty">尚无报名。</div> : null}
              <div className="ops-dir">
                {workspace.participants.length > 0 ? (
                  <div className="ops-dir-head">
                    <span>参会者</span><span>公司 / 角色</span><span>行业</span><span>画像</span><span>迟到报名</span><span>签到</span>
                  </div>
                ) : null}
                {workspace.participants.map((participant) => {
                  const checkIn = checkInsByParticipant.get(participant.participantId);
                  return (
                    <div className="ops-dir-row" key={participant.participantId}>
                      <span className="ops-dir-person">
                        <span className="ops-ava">{participant.displayName.slice(0, 1)}</span>
                        <span className="ops-dir-name">
                          <strong>{participant.displayName}</strong>
                          <span className="ops-dir-id">{participant.participantId}</span>
                        </span>
                      </span>
                      <span className="ops-dir-cell">{[participant.role, participant.company].filter(Boolean).join(" · ") || "—"}</span>
                      <span className="ops-dir-cell">{participant.industry ?? "—"}</span>
                      <span className="ops-dir-cell">{participant.profileCompleteness}</span>
                      <span className="ops-dir-cell">{participant.lateRegistration ? "是" : "否"}</span>
                      <span className="ops-dir-cell">
                        {checkIn ? (
                          <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
                            <span className="ops-pill ops-pill-green">● 已签到</span>
                            <span className="ops-gate-at">{formatTimestamp(checkIn.checkedInAt)}</span>
                          </span>
                        ) : (
                          <button className="ops-btn ops-btn-ghost ops-btn-sm" disabled={!checkInOpen || busy !== null} onClick={() => markParticipantArrived(participant.participantId)} type="button">
                            {busy === `checkin:${participant.participantId}` ? "记录中…" : checkInOpen ? "标记到场" : "签到未开放"}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="ops-card ops-section">
              <div>
                <span className="ops-eyebrow">CONSENT AUDIT</span>
                <div style={{ marginTop: 8 }}><strong className="ops-section-title">名片交换审计</strong></div>
              </div>
              {workspace.contactRequests.length === 0 ? <div className="ops-empty">尚无名片交换申请。</div> : workspace.contactRequests.map((request) => (
                <div className="ops-audit-row" key={request.requestId}>
                  <strong>{request.requesterParticipantId} → {request.targetParticipantId}</strong>
                  <span className="ops-pill">{request.status}</span>
                </div>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
