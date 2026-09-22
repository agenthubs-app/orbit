"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  EventOperationsLimitedCheckInRoster,
  EventOperationsLimitedCheckInRosterItem,
} from "../../../../../features/events/event-operations/check-in-roster";

// 原样抽自 [id]/operations/check-in/limited-check-in-roster.tsx（13–46、87–198 行）：
// 信封解析 + 状态码错误模型、名单加载、401 跳登录、逐行标记到场。
// UI 本地状态 `query` / `segment`（搜索与筛选）留在组件。

interface ApiEnvelope<TValue> {
  data?: TValue;
  error?: { message?: string };
  success: boolean;
}

class CheckInRosterRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CheckInRosterRequestError";
  }
}

async function responseData<TValue>(response: Response): Promise<TValue> {
  let body: ApiEnvelope<TValue>;
  try {
    body = (await response.json()) as ApiEnvelope<TValue>;
  } catch {
    throw new CheckInRosterRequestError(
      "签到服务返回了无法识别的响应，请重试。",
      response.status,
    );
  }
  if (!response.ok || !body.success || !body.data) {
    throw new CheckInRosterRequestError(
      body.error?.message ?? "签到服务暂时不可用，请重试。",
      response.status,
    );
  }
  return body.data;
}

/**
 * 受限签到名单会话（`GET|POST /operations/admin/check-ins`）：
 * - `roster`：名单（401/403/404/503 或读取失败时清空为 null）
 * - `loading`、`error`、`notice`
 * - `pendingParticipantIds`：正在记录到场的参会者集合（逐行 busy）
 * - `loadRoster()`：刷新 / 重试
 * - `markArrived(participant)`：POST `{ participantId }` 后刷新名单；409 → 时间窗口文案
 */
export interface CheckInRosterSession {
  error: string | null;
  loadRoster: () => Promise<void>;
  loading: boolean;
  markArrived: (participant: EventOperationsLimitedCheckInRosterItem) => Promise<void>;
  notice: string | null;
  pendingParticipantIds: ReadonlySet<string>;
  roster: EventOperationsLimitedCheckInRoster | null;
}

export function useCheckInRoster(eventId: string): CheckInRosterSession {
  const [roster, setRoster] =
    useState<EventOperationsLimitedCheckInRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginRedirectPending, setLoginRedirectPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingParticipantIds, setPendingParticipantIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const endpoint = `/api/events/${encodeURIComponent(eventId)}/operations/admin/check-ins`;
  const loginHref = `/app/account/login?next=${encodeURIComponent(
    `/app/events/${encodeURIComponent(eventId)}/operations/check-in`,
  )}`;

  const handleRequestError = useCallback(
    (
      cause: unknown,
      options: { clearRosterOnReadFailure?: boolean } = {},
    ) => {
      const status =
        cause instanceof CheckInRosterRequestError ? cause.status : null;
      if (
        options.clearRosterOnReadFailure ||
        status === 401 ||
        status === 403 ||
        status === 404 ||
        status === 503
      ) {
        setRoster(null);
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 401) {
        setError("登录状态已失效，正在返回登录页。");
        setLoginRedirectPending(true);
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 403) {
        setRoster(null);
        setError("你没有该活动的签到权限。名单已从当前页面清除。");
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 404) {
        setError("没有找到这个活动。");
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 409) {
        setError("该活动当前不允许签到，请确认签到时间窗口。");
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 503) {
        setError("活动权限或签到存储暂时不可用，请稍后重试。");
        return;
      }
      setError(
        cause instanceof Error ? cause.message : "签到服务暂时不可用，请重试。",
      );
    },
    [],
  );

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      setRoster(
        await responseData<EventOperationsLimitedCheckInRoster>(response),
      );
    } catch (cause) {
      handleRequestError(cause, { clearRosterOnReadFailure: true });
    } finally {
      setLoading(false);
    }
  }, [endpoint, handleRequestError]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (loginRedirectPending) window.location.assign(loginHref);
  }, [loginHref, loginRedirectPending]);

  async function markArrived(
    participant: EventOperationsLimitedCheckInRosterItem,
  ) {
    setPendingParticipantIds((current) =>
      new Set([...current, participant.participantId]),
    );
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ participantId: participant.participantId }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await responseData<unknown>(response);
      setNotice(`${participant.displayName} 已标记为到场。`);
      await loadRoster();
    } catch (cause) {
      handleRequestError(cause);
    } finally {
      setPendingParticipantIds((current) => {
        const next = new Set(current);
        next.delete(participant.participantId);
        return next;
      });
    }
  }

  return {
    error,
    loadRoster,
    loading,
    markArrived,
    notice,
    pendingParticipantIds,
    roster,
  };
}
