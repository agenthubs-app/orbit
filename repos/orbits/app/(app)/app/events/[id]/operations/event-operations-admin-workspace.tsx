"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventOperationsCheckIn,
  EventOperationsConfiguration,
  EventOperationsGeneration,
  EventOperationsTable,
} from "../../../../../../features/events/event-operations/contract";
import type { EventOperationsAdminWorkspace } from "../../../../../../features/events/event-operations/service";
import { PublicTopNav } from "../../../orbit-public-shell";
import { Icon } from "../../../orbit-reference-primitives";

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
    <div style={{ display: "grid", gap: 10 }}>
      <h3 style={{ fontSize: 16, margin: 0 }}>{title}</h3>
      {tables.length === 0 ? <div style={{ color: "var(--text-3)" }}>尚无已发布的分桌。</div> : null}
      {tables.map((table) => (
        <article key={table.tableNumber} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ alignItems: "start", display: "flex", gap: 10, justifyContent: "space-between" }}>
            <div><strong>{table.tableNumber} 号桌 · {table.theme}</strong><div style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>{table.rationale}</div></div>
            <span className="badge">{table.members.length} 席</span>
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {table.members.map((member) => (
              <div key={member.participantId} style={{ display: "flex", fontSize: 13, gap: 8, justifyContent: "space-between" }}>
                <span>{participantNames.get(member.participantId) ?? member.participantId}</span>
                <span className="mono" style={{ color: "var(--text-3)" }}>{member.seat}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10 }}>
            <div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>TABLE ICEBREAKERS</div>
            <ol style={{ color: "var(--text-2)", fontSize: 12, lineHeight: 1.55, margin: "7px 0 0", paddingLeft: 18 }}>
              {table.icebreakers.map((icebreaker) => <li key={icebreaker}>{icebreaker}</li>)}
            </ol>
          </div>
        </article>
      ))}
    </div>
  );
}

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

  return (
    <div data-orbit-real-page="event-operations-admin" style={{ minHeight: "100dvh" }}>
      <PublicTopNav active="events" />
      <main style={{ margin: "0 auto", maxWidth: 1180, padding: "28px clamp(16px,4vw,42px) 80px" }}>
        <a href={`/app/events/${encodeURIComponent(event.id)}`} style={{ alignItems: "center", color: "var(--text-2)", display: "inline-flex", gap: 6, textDecoration: "none" }}>
          <Icon name="chevL" size={16} /> 返回活动
        </a>
        <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", marginTop: 18 }}>
          <div>
            <div className="eyebrow">ORGANIZER · EVENT OPERATIONS</div>
            <h1 className="h-display" style={{ margin: "8px 0 0" }}>{event.title}</h1>
            <p style={{ color: "var(--text-2)", margin: "8px 0 0" }}>配置时间门禁、查看真实报名、运行严格 AI 分片，并发布完整结果。</p>
          </div>
          {workspace ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <a className="btn btn-ghost" href="/app/events/center">
                <Icon name="grid" size={16} />运营活动中心
              </a>
              <a className="btn btn-ghost" href={operationsCheckInHref}>
                <Icon name="check" size={16} />打开签到台
              </a>
              <a className="btn btn-ghost" href={`/app/events/${encodeURIComponent(event.id)}/operations/experience`}>
                <Icon name="sparkle" size={16} />报名体验
              </a>
              <a className="btn btn-ghost" href={`/app/events/${encodeURIComponent(event.id)}/analytics`}>
                <Icon name="target" size={16} />查看活动分析
              </a>
              {canManageRoles ? (
                <a className="btn btn-ghost" data-event-roles-entry href={`/app/events/${encodeURIComponent(event.id)}/operations/roles`}>
                  <Icon name="users" size={16} />管理角色
                </a>
              ) : null}
              <a className="btn btn-ghost" href={`${baseUrl}/export`}>
                <Icon name="download" size={16} />导出 CSV
              </a>
            </div>
          ) : null}
        </div>

        {error ? <div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}>{error}</div> : null}
        {notice ? <div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}>{notice}</div> : null}
        {loading ? <div className="card" style={{ marginTop: 18, padding: 18 }}>正在读取运营状态…</div> : null}

        {workspace ? (
          <>
            <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 18 }}>
              {[
                ["已报名", workspace.metrics.participantCount],
                ["已签到", workspace.metrics.checkedIn],
                ["名片申请", workspace.metrics.contactRequests],
                ["已同意", workspace.metrics.acceptedContactRequests],
              ].map(([label, value]) => <div className="card" key={label} style={{ padding: 18 }}><div className="h-title">{value}</div><div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>{label}</div></div>)}
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                <div><div className="eyebrow">STRICT AI PIPELINE</div><h2 className="h-title" style={{ margin: "8px 0 0" }}>AI 生成与发布</h2></div>
                <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  {confirmingStart ? null : (
                    <button className="btn btn-primary" disabled={busy === "start" || hasActiveGeneration} onClick={() => setConfirmingStart(true)} type="button"><Icon color="var(--on-dark)" name="sparkle" size={16} />{hasActiveGeneration ? "生成进行中…" : "生成匹配"}</button>
                  )}
                </div>
              </div>
              {confirmingStart ? (
                <div className="card-flat" data-generation-start-confirm style={{ display: "grid", gap: 10, marginTop: 12, padding: 14 }}>
                  <strong>将为 {workspace.metrics.participantCount} 位已报名参会者生成推荐与两轮分桌</strong>
                  <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>预计 8–12 分钟；失败的片段会自动重试。生成完成后由你预览并确认发布，不会自动对参会者公开。</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary btn-sm" disabled={busy === "start"} onClick={startGeneration} type="button">{busy === "start" ? "正在开始…" : "开始生成"}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingStart(false)} type="button">取消</button>
                  </div>
                </div>
              ) : null}
              <p style={{ color: "var(--text-3)", fontSize: 13 }}>所有任务完成并由你发布后，参会者才能看到生成结果；无效、缺失或超时的 AI 输出会保持失败状态，不会被替代内容掩盖。</p>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                {workspace.generations.length === 0 ? <div>尚未创建任何生成。</div> : null}
                {workspace.generations.map(({ generation, progress }) => (
                  <article key={generation.generationId} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                    <div style={{ alignItems: "start", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                      <div><strong title={generation.generationId}>{shortGenerationId(generation.generationId)}</strong><div className="mono" style={{ color: "var(--text-3)", fontSize: 11, marginTop: 5 }}>快照 {generation.snapshot.hash.slice(0, 12)}… · {generation.snapshot.participants.length} 位参会者</div></div>
                      <span className={generation.status === "failed" ? "badge badge-ended" : generation.status === "published" ? "badge badge-live" : "badge"}>{generationStatusLabels[generation.status] ?? generation.status}</span>
                    </div>
                    <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 12 }}>{progress.completedTasks}/{progress.totalTasks} 已完成 · {progress.failedTasks} 失败 · {progress.percent}%</div>
                    {generation.status === "queued" || generation.status === "running" ? (
                      <div data-generation-progress style={{ display: "grid", gap: 7, marginTop: 10 }}>
                        <div aria-hidden style={{ background: "var(--surface-3)", borderRadius: 999, height: 6, overflow: "hidden" }}>
                          <div style={{ background: "var(--accent-grad-bar, var(--accent))", borderRadius: 999, height: "100%", transition: "width .6s ease", width: `${Math.max(3, progress.percent)}%` }} />
                        </div>
                        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                          {generationEtaLabel(generation.createdAt, progress.percent)}
                          {(autoRetries[generation.generationId] ?? 0) > 0 ? ` · 自动重试中（第 ${autoRetries[generation.generationId]}/${AUTO_RETRY_LIMIT} 次）` : ""}
                          {" · 可离开此页，完成后回来确认发布"}
                        </div>
                      </div>
                    ) : null}
                    {generation.status === "failed" && (autoRetries[generation.generationId] ?? 0) >= AUTO_RETRY_LIMIT ? (
                      <div data-generation-needs-attention style={{ color: "var(--amber)", fontSize: 12, marginTop: 8 }}>自动重试 {AUTO_RETRY_LIMIT} 次后仍有片段未通过，需要你手动处理。</div>
                    ) : null}
                    {generation.errorMessage ? <div style={{ color: "var(--rose)", fontSize: 12, marginTop: 8 }}>{generationErrorLabel(generation.errorCode ?? "")}<span className="mono" style={{ marginLeft: 6 }}>{generation.errorCode}</span><div style={{ color: "var(--text-3)", marginTop: 3 }}>{generation.errorMessage}</div></div> : null}
                    <button className={generation.status === "completed" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} disabled={generation.status === "published" || generation.status === "queued" || generation.status === "running" || busy?.startsWith(generation.generationId)} onClick={() => generationAction(generation)} style={{ marginTop: 12 }} type="button">{generationActionLabel(generation)}</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">PUBLISHED SEATING PREVIEW</div>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>两轮分桌预览</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>此预览只读取已原子发布的结果：真实桌号、座位、话题、桌级归因与桌级破冰问题。</p>
              {workspace.publishedResult ? (
                <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 16 }}>
                  <PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundOne} title="第一轮 · 互补分桌" />
                  <PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundTwo} title="第二轮 · 话题桌" />
                </div>
              ) : (
                <div style={{ border: "1px dashed var(--border)", borderRadius: 12, color: "var(--text-3)", marginTop: 14, padding: 16 }}>尚无已发布的分桌结果；已完成的生成在主办方原子发布前不会出现在这里。</div>
              )}
            </section>
          </>
        ) : null}

        <section className="card" style={{ marginTop: 18, padding: 20 }}>
          <div className="eyebrow">TIME GATES & SHARD POLICY</div>
          <h2 className="h-title" style={{ margin: "8px 0 0" }}>运营配置</h2>
          <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>活动开始与结束时间锁定为主活动档期；其余规则均需主办方显式设定。</p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", marginTop: 18 }}>
            {dateFields.map((field) => (
              <label key={field} style={{ display: "grid", gap: 6, fontSize: 12 }}>
                <span>{fieldLabels[field]}<span className="mono" style={{ color: "var(--text-3)", marginLeft: 6 }}>{field}</span></span>
                <input
                  className="field"
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
              <label key={field} style={{ display: "grid", gap: 6, fontSize: 12 }}>
                <span>{fieldLabels[field]}<span className="mono" style={{ color: "var(--text-3)", marginLeft: 6 }}>{field}</span></span>
                <input className="field" min={1} onInput={(input) => {
                  const nextValue = input.currentTarget.value;
                  setForm((value) => ({ ...value, [field]: nextValue }));
                }} type="number" value={form[field]} />
              </label>
            ))}
          </div>
          <details style={{ marginTop: 14 }}>
            <summary style={{ color: "var(--text-3)", cursor: "pointer", fontSize: 13 }}>高级引擎参数（一般无需调整）</summary>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", marginTop: 12 }}>
              {advancedNumberFields.map((field) => (
                <label key={field} style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <span>{fieldLabels[field]}<span className="mono" style={{ color: "var(--text-3)", marginLeft: 6 }}>{field}</span></span>
                  <input className="field" min={1} onInput={(input) => {
                    const nextValue = input.currentTarget.value;
                    setForm((value) => ({ ...value, [field]: nextValue }));
                  }} type="number" value={form[field]} />
                </label>
              ))}
            </div>
          </details>
          <button className="btn btn-primary" disabled={busy === "configuration"} onClick={saveConfiguration} style={{ marginTop: 18 }} type="button">
            <Icon color="var(--on-dark)" name="check" size={16} />{busy === "configuration" ? "保存中…" : "保存配置"}
          </button>
          {timeline.length > 0 ? (
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 18 }}>
              <div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>CONFIGURED TIMELINE · LIVE STATUS</div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginTop: 10 }}>
                {timeline.map((gate) => (
                  <div key={gate.label} style={{ alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, display: "flex", gap: 10, justifyContent: "space-between", padding: 11 }}>
                    <div><strong style={{ fontSize: 12 }}>{gate.label}</strong><div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>{formatTimestamp(gate.at)}</div></div>
                    <span className={gate.state === "open" || gate.state === "open now" || gate.state === "available" || gate.state === "live" ? "badge badge-live" : "badge"}>{gate.state}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {workspace ? (
          <>
            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">VENUE CHECK-IN ENTRY</div>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>展示或分享参会者签到链接</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>这是真实的已报名参会者签到路由。没有经过验证的本地二维码编码器时不会生成二维码图片；请直接复制或投屏此链接。</p>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <a className="btn btn-ghost" href={checkInHref} rel="noreferrer" target="_blank"><Icon name="arrowUR" size={16} />打开签到页</a>
                <button className="btn btn-primary" onClick={copyCheckInLink} type="button"><Icon color="var(--on-dark)" name="copy" size={16} />复制链接</button>
                <code style={{ background: "var(--surface-2)", borderRadius: 8, flex: "1 1 360px", overflowWrap: "anywhere", padding: "10px 12px" }}>{checkInHref}</code>
              </div>
              <div style={{ color: checkInOpen ? "var(--accent)" : "var(--text-3)", fontSize: 12, marginTop: 10 }}>签到窗口：{checkInOpen ? "当前开放" : "已关闭或尚未开放"}</div>
            </section>

            <section className="card" style={{ marginTop: 18, overflowX: "auto", padding: 20 }}>
              <div className="eyebrow">REAL REGISTRATION DIRECTORY</div>
              <h2 className="h-title" style={{ margin: "8px 0 4px" }}>参会者与到场状态</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 14px" }}>{workspace.participants.length - workspace.checkIns.length} 人未到场 · 通过主办方专用接口逐一标记到场。</p>
              <table style={{ borderCollapse: "collapse", minWidth: 820, width: "100%" }}>
                <thead><tr>{["参会者", "公司 / 角色", "行业", "画像", "迟到报名", "签到"].map((label) => <th key={label} style={{ borderBottom: "1px solid var(--border)", padding: 10, textAlign: "left" }}>{label}</th>)}</tr></thead>
                <tbody>{workspace.participants.map((participant) => {
                  const checkIn = checkInsByParticipant.get(participant.participantId);
                  return <tr key={participant.participantId}><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}><strong>{participant.displayName}</strong><div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>{participant.participantId}</div></td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{[participant.role, participant.company].filter(Boolean).join(" · ") || "—"}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{participant.industry ?? "—"}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{participant.profileCompleteness}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{participant.lateRegistration ? "是" : "否"}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{checkIn ? <div><span className="badge badge-live">已签到</span><div style={{ color: "var(--text-3)", fontSize: 10, marginTop: 4 }}>{formatTimestamp(checkIn.checkedInAt)}</div></div> : <button className="btn btn-ghost btn-sm" disabled={!checkInOpen || busy !== null} onClick={() => markParticipantArrived(participant.participantId)} type="button">{busy === `checkin:${participant.participantId}` ? "记录中…" : checkInOpen ? "标记到场" : "签到未开放"}</button>}</td></tr>;
                })}</tbody>
              </table>
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">CONSENT AUDIT</div><h2 className="h-title" style={{ margin: "8px 0 14px" }}>名片交换审计</h2>
              {workspace.contactRequests.length === 0 ? <div>尚无名片交换申请。</div> : workspace.contactRequests.map((request) => <div key={request.requestId} style={{ borderTop: "1px solid var(--border)", display: "grid", gap: 5, padding: "12px 0" }}><strong>{request.requesterParticipantId} → {request.targetParticipantId}</strong><span>{request.status}</span></div>)}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
