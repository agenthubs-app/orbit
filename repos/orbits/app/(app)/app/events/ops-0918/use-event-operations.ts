"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventOperationsConfiguration,
  EventOperationsGeneration,
} from "../../../../../features/events/event-operations/contract";
import type { EventOperationsAdminWorkspace } from "../../../../../features/events/event-operations/service";
import { matchResultLabel } from "./ops-model";

// 原样抽自 [id]/operations/event-operations-admin-workspace.tsx（15–54、113–152、
// 161–169、336–580 行）：配置表单模型、requestJson、工作区加载/轮询/自动重试、
// 生成动作、配置保存、签到链接复制与派生数据。UI 本地状态
// `confirmingStart` 留在组件（组件在调用 startGeneration 前自行收起确认框）。
// 任务 7：旧目录区退役后无消费者的三项已删除（到场标记动作 → use-check-in-roster.markArrived；
// 逐参会者签到映射；旧步进条派生 → ops-model.pipelineSteps）——「原样抽取」例外的收口记录见台账。

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

export interface ConfigurationForm {
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

export const dateFields = [
  "eventStartsAt",
  "eventEndsAt",
  "profileEditDeadlineAt",
  "registrationCutoffAt",
  "checkInOpensAt",
  "resultsAvailableAt",
  "roundOneStartsAt",
  "roundTwoStartsAt",
] as const;

export const canonicalScheduleFields = ["eventStartsAt", "eventEndsAt"] as const;

export const numberFields = [
  "recommendationCount",
  "tableSize",
  "shardSize",
  "maxAttemptsPerTask",
] as const;

export const AUTO_RETRY_LIMIT = 2;

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

/** 带 HTTP 状态的请求错误：参会者屏据 403 判定「仅审核权限」（审阅修订 3）。 */
class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || !envelope.data) {
    throw new RequestError(envelope?.error?.message ?? `Request failed with status ${response.status}.`, response.status);
  }
  return envelope.data;
}


export function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp)
    : value;
}

export interface EventOperationsEvent {
  endsAt: string;
  id: string;
  startsAt: string;
  title: string;
}

export interface TimelineGate {
  at: string;
  label: string;
  state: string;
}

/**
 * 运营台（admin workspace）会话，JSX 所需的一切：
 * - 数据：`workspace`（GET `/operations/admin`）、`configuration`、`newestGeneration`、
 *   `hasActiveGeneration`、`participantNames`、`autoRetries`
 * - 派生：`operationsCheckInHref`、`baseUrl`（导出 CSV 链接）、`checkInOpen`、`timeline`、
 *   `publishedMatchStatus`（= ops-model.matchResultLabel）
 * - 状态：`form`/`setForm`、`loading`、`busy`、`error`、`notice`、`accessDenied`（GET 返回 403）
 * - 动作：`load`、`saveConfiguration`（PUT）、`startGeneration`（POST /generations）、
 *   `generationAction`（POST /retry | /publish）、`copyCheckInLink`
 */
export interface EventOperationsSession {
  /** GET `/operations/admin` 返回 403：当前身份没有 operations.read_sensitive（例如仅审核角色）。 */
  accessDenied: boolean;
  autoRetries: Record<string, number>;
  baseUrl: string;
  busy: string | null;
  checkInOpen: boolean;
  configuration: EventOperationsConfiguration | null;
  copyCheckInLink: () => Promise<void>;
  error: string | null;
  form: ConfigurationForm;
  generationAction: (generation: EventOperationsGeneration) => Promise<void>;
  hasActiveGeneration: boolean;
  load: (showLoading?: boolean) => Promise<void>;
  loading: boolean;
  newestGeneration: EventOperationsGeneration | null;
  notice: string | null;
  operationsCheckInHref: string;
  participantNames: Map<string, string>;
  publishedMatchStatus: string;
  saveConfiguration: () => Promise<void>;
  setForm: React.Dispatch<React.SetStateAction<ConfigurationForm>>;
  startGeneration: () => Promise<void>;
  timeline: readonly TimelineGate[];
  workspace: EventOperationsAdminWorkspace | null;
}

/**
 * 会话选项（合并前终审修正 1）：概览 / 匹配屏保持默认（自动重试 + 进行中 1.5s 轮询）；
 * 参会者屏只读工作区（`{ autoRetry: false, poll: false }`），不得对失败生成发 `POST …/retry`，也不重复 GET。
 */
export interface EventOperationsOptions {
  /** 最新生成 failed（可重试错误码）时自动 `POST …/retry`（上限 AUTO_RETRY_LIMIT）。默认 true。 */
  autoRetry?: boolean;
  /** 有 queued / running 生成时每 1.5s 重读工作区。默认 true。 */
  poll?: boolean;
}

export function useEventOperations(event: EventOperationsEvent, options: EventOperationsOptions = {}): EventOperationsSession {
  const { autoRetry = true, poll = true } = options;
  const baseUrl = `/api/events/${encodeURIComponent(event.id)}/operations/admin`;
  const [workspace, setWorkspace] = useState<EventOperationsAdminWorkspace | null>(null);
  const [form, setForm] = useState<ConfigurationForm>(() => formFor(null, event));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
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
      setAccessDenied(false);
    } catch (cause) {
      setWorkspace(null);
      setAccessDenied(cause instanceof RequestError && cause.status === 403);
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
    if (!poll || !hasActiveGeneration) return;
    const timer = window.setInterval(() => {
      void load(false);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [hasActiveGeneration, load, poll]);

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
    if (!autoRetry || !newestGeneration || newestGeneration.status !== "failed") return;
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
  }, [autoRetry, newestGeneration?.generationId, newestGeneration?.status]);

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

  async function copyCheckInLink() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(new URL(operationsCheckInHref, window.location.origin).toString());
      setNotice("Check-in link copied. It can be displayed on the venue screen or sent to registered attendees.");
      setError(null);
    } catch {
      setNotice("Select and copy the visible check-in link manually; no QR code was fabricated.");
    }
  }

  const participantNames = useMemo(
    () => new Map(workspace?.participants.map((participant) => [participant.participantId, participant.displayName]) ?? []),
    [workspace],
  );
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

  // 任务 7：与 ops-model `matchResultLabel` / `publishableGeneration` 同一谓词（看最新一次生成，而不是任意一条 completed）。
  const publishedMatchStatus = !workspace
    ? "—"
    : matchResultLabel({ newestGeneration, publishedAt: workspace.publishedResult?.publishedAt ?? null });

  return {
    accessDenied,
    autoRetries,
    baseUrl,
    busy,
    checkInOpen,
    configuration,
    copyCheckInLink,
    error,
    form,
    generationAction,
    hasActiveGeneration,
    load,
    loading,
    newestGeneration,
    notice,
    operationsCheckInHref,
    participantNames,
    publishedMatchStatus,
    saveConfiguration,
    setForm,
    startGeneration,
    timeline,
    workspace,
  };
}
