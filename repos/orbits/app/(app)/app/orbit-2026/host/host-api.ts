"use client";

// R17 主催：運営センター / イベント運営 の呼び出し。読み取りは契約 schema で寛容に解析し、失敗は理由で返す（throw しない）。
// 失敗分類は R26 events-api と同じ形に、主催側で要る forbidden（権限なし）と conflict（版の衝突・状態）を足す。
import type { ZodType } from "zod";

import { hostOverviewResponseSchema } from "../../../../../shared/api-schema/host-console";
import { hostCenterResponseSchema, hostEventWriteResultSchema } from "../../../../../shared/api-schema/host-events";
import { hostNoticePreviewSchema, hostNoticeSendResultSchema } from "../../../../../shared/api-schema/host-notices";
import type { HostOverviewResponse } from "../../../../../shared/contract/host-console";
import type { HostCenterFilter, HostCenterResponse, HostEventWriteResult } from "../../../../../shared/contract/host-events";
import type { HostNoticePreview, HostNoticeSendResult, HostSendableNoticeKind } from "../../../../../shared/contract/host-notices";
import { newIdempotencyKey } from "../events/events-api";

export type HostApiFailure = "forbidden" | "not_found" | "conflict" | "rate_limited" | "sample" | "invalid" | "unavailable" | "network";
export type HostApiResult<T> = { ok: true; data: T } | { ok: false; reason: HostApiFailure };

/** 失败原因（tsconfig 不开 strictNullChecks，判别联合不收窄，这里统一取）。 */
export const failureOf = (result: HostApiResult<unknown>): HostApiFailure => (result as { reason?: HostApiFailure }).reason ?? "unavailable";

async function call<T>(url: string, init: RequestInit | undefined, schema: ZodType<T>): Promise<HostApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: { context?: { reason?: string } } } | null;
    if (!response.ok) {
      const reason = body?.error?.context?.reason;
      if (response.status === 429 || reason === "RATE_LIMITED") return { ok: false, reason: "rate_limited" };
      if (reason === "SAMPLE_READ_ONLY") return { ok: false, reason: "sample" };
      if (response.status === 401 || response.status === 403) return { ok: false, reason: "forbidden" };
      if (response.status === 404) return { ok: false, reason: "not_found" };
      if (response.status === 409) return { ok: false, reason: "conflict" };
      if (response.status === 400) return { ok: false, reason: "invalid" };
      return { ok: false, reason: "unavailable" };
    }
    const parsed = schema.safeParse(body?.data);
    return parsed.success ? { data: parsed.data, ok: true } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

const id = (value: string) => encodeURIComponent(value);
const post = (body: unknown): RequestInit => ({ body: JSON.stringify(body), method: "POST" });

export function centerQueryString(filter: HostCenterFilter, q: string): string {
  const search = new URLSearchParams();
  if (filter !== "all") search.set("filter", filter);
  if (q.trim()) search.set("q", q.trim());
  return search.toString();
}

export const hostApi = {
  center: (filter: HostCenterFilter, q: string) => call(`/api/host/center?${centerQueryString(filter, q)}`, undefined, hostCenterResponseSchema as ZodType<HostCenterResponse>),
  overview: (eventId: string) => call(`/api/host/events/${id(eventId)}/overview`, undefined, hostOverviewResponseSchema as ZodType<HostOverviewResponse>),
  publish: (eventId: string, expectedVersion: number) => call(`/api/host/events/${id(eventId)}/publish`, post({ expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  archive: (eventId: string, expectedVersion: number, archived: boolean) => call(`/api/host/events/${id(eventId)}/archive`, post({ archived, expectedVersion }), hostEventWriteResultSchema as ZodType<HostEventWriteResult>),
  noticePreview: (eventId: string, kind: HostSendableNoticeKind) => call(`/api/host/events/${id(eventId)}/notices/preview`, post({ kind }), hostNoticePreviewSchema as ZodType<HostNoticePreview>),
  noticeSend: (eventId: string, kind: HostSendableNoticeKind) => call(`/api/host/events/${id(eventId)}/notices/send`, post({ idempotencyKey: newIdempotencyKey(), kind }), hostNoticeSendResultSchema as ZodType<HostNoticeSendResult>),
};
