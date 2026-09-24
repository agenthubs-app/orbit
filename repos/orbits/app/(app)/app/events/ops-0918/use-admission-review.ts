"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  EventAdmissionApplication,
  EventAdmissionReviewListItem,
} from "../../../../../features/events/admission/contract";

// 原样抽自 [id]/operations/admission/event-admission-review-workspace.tsx
// （15–35、45–61、224–316 行）：审核队列分页加载、申请详情读取、版本化决定。
// UI 本地状态 `view`（待审核/已处理页签）留在组件，作为参数传入。

export type ReviewView = "pending" | "processed";

interface ReviewListPayload {
  items: readonly EventAdmissionReviewListItem[];
  nextCursor: string | null;
  total: number;
  view: ReviewView;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

class ReviewRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ReviewRequestError";
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new ReviewRequestError(
      envelope?.error?.message ?? "报名审核请求失败。",
      response.status,
    );
  }
  return envelope.data;
}

/**
 * 报名审核会话（`GET /admission/reviews?view=&cursor=` / `GET …/{actorId}` /
 * `POST …/{actorId}/decision`）：
 * - 列表：`items`、`total`、`nextCursor`、`loading`、`loadingMore`、`loadList(append?, cursor?)`
 * - 详情：`selected`、`selectedId`、`openingActorId`、`openApplication(actorId)`
 * - 决定：`busy`、`decide("approve" | "reject")`（带 `expectedApplicationVersion`；409 → 刷新列表）
 * - 反馈：`error`、`notice`
 */
export interface AdmissionReviewSession {
  busy: boolean;
  decide: (decision: "approve" | "reject") => Promise<void>;
  error: string | null;
  items: readonly EventAdmissionReviewListItem[];
  loadList: (append?: boolean, cursor?: string | null) => Promise<void>;
  loading: boolean;
  loadingMore: boolean;
  nextCursor: string | null;
  notice: string | null;
  openApplication: (actorId: string) => Promise<void>;
  openingActorId: string | null;
  selected: EventAdmissionApplication | null;
  selectedId: string | null;
  total: number;
}

export function useAdmissionReview(eventId: string, view: ReviewView): AdmissionReviewSession {
  const baseUrl = `/api/events/${encodeURIComponent(eventId)}/admission/reviews`;
  const [items, setItems] = useState<readonly EventAdmissionReviewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventAdmissionApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingActorId, setOpeningActorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async (append = false, cursor?: string | null) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "30", view });
      if (cursor) query.set("cursor", cursor);
      const page = await requestJson<ReviewListPayload>(`${baseUrl}?${query}`);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setTotal(page.total);
      setError(null);
      if (!append) setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取报名审核队列。");
      if (!append) {
        setItems([]);
        setNextCursor(null);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [baseUrl, view]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectedId = selected?.actorId ?? null;

  async function openApplication(actorId: string) {
    setError(null);
    setSelected(null);
    setOpeningActorId(actorId);
    try {
      setSelected(await requestJson<EventAdmissionApplication>(
        `${baseUrl}/${encodeURIComponent(actorId)}`,
      ));
    } catch (cause) {
      setSelected(null);
      setError(cause instanceof Error ? cause.message : "无法读取报名申请详情。");
    } finally {
      setOpeningActorId(null);
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!selected || selected.status !== "pending_review") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await requestJson<EventAdmissionApplication>(
        `${baseUrl}/${encodeURIComponent(selected.actorId)}/decision`,
        {
          body: JSON.stringify({
            decision,
            expectedApplicationVersion: selected.applicationVersion,
          }),
          method: "POST",
        },
      );
      setSelected(next);
      setNotice(decision === "approve" ? "报名已批准。" : "报名已拒绝。");
      await loadList();
    } catch (cause) {
      if (cause instanceof ReviewRequestError && cause.status === 409) {
        setError("申请已被其他审核员处理，列表已刷新。请查看最新状态。");
        await loadList();
      } else {
        setError(cause instanceof Error ? cause.message : "报名决定未能保存。");
      }
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    decide,
    error,
    items,
    loadList,
    loading,
    loadingMore,
    nextCursor,
    notice,
    openApplication,
    openingActorId,
    selected,
    selectedId,
    total,
  };
}
