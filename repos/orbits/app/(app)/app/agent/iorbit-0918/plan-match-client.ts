/**
 * 人脉需求匹配的前端读写（W0010）。三处入口（名片审阅页最后一屏、iOrbit 今日要事、计划页
 * 「待确认 N」角标）与联系人详情的手动关联共用；本文件不 import React。
 *
 * - `POST /api/agent/plans/candidates/run`              审阅页：这一批确认完成后触发并取候选
 * - `GET  /api/agent/plans/candidates`                  本人所有待确认的候选
 * - `POST /api/agent/plans/candidates`                  是 / 不是；手动关联（action: "link"）
 * - `POST /api/agent/plans/items/:itemId/interaction`   「约 TA」行动上的「记一次互动」
 * - `POST /api/agent/plans/items/:itemId/draft`         「起草邮件」：点击才请求，返回可编辑草稿（不发送）
 */
import { sharedRead } from "../../orbit-shared-read";
import { invalidatePlanReads, newPlanIdempotencyKey, PLAN_CANDIDATES_URL, PlanClientError } from "./iorbit-plan-client";

/** 与 `features/plans/matching-service.ts` 的 `PlanMatchCandidateView` 同形（页面自有的视图类型）。 */
export interface PlanMatchCandidate {
  id: string;
  contactId: string;
  contactName: string;
  contactSubtitle: string | null;
  needId: string;
  needTitle: string;
  strength: "strong" | "candidate";
  tier: "rule" | "ai";
  industry: { zh: string; en: string } | null;
  aiReason: string | null;
}

export interface PlanMatchList {
  candidates: PlanMatchCandidate[];
  pendingByNeed: Record<string, number>;
  contactCount: number;
}

/** 确认后生成的「约 TA」行动（只取界面需要的字段）。 */
export interface PlanMatchAction {
  id: string;
  title: string;
  contactId: string;
  needId: string;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: unknown };
    success?: boolean;
  } | null;
  if (!response.ok || !body?.success) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`;
    throw new PlanClientError(message);
  }
  return body.data as T;
}

function isList(value: unknown): value is PlanMatchList {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as PlanMatchList).candidates) &&
    typeof (value as PlanMatchList).pendingByNeed === "object"
  );
}

function asList(value: unknown): PlanMatchList {
  if (!isList(value)) throw new PlanClientError("Unexpected match payload.");
  return value;
}

/** W0021：同账号并发读取共享一个请求（`sharedRead`）。 */
export async function fetchPlanMatches(signal?: AbortSignal): Promise<PlanMatchList> {
  return sharedRead(PLAN_CANDIDATES_URL, async (shared) => {
    const response = await fetch(PLAN_CANDIDATES_URL, { cache: "no-store", signal: shared });
    return asList(await readEnvelope<unknown>(response));
  }, signal);
}

export async function runPlanMatchForBatch(batchId: string, signal?: AbortSignal): Promise<PlanMatchList> {
  const response = await fetch("/api/agent/plans/candidates/run", {
    body: JSON.stringify({ batchId }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
  return asList(await readEnvelope<unknown>(response));
}

function actionFrom(value: unknown): PlanMatchAction {
  const link = value as { action?: { id?: unknown; title?: unknown; meta?: Record<string, unknown> }; need?: { id?: unknown } } | null;
  const action = link?.action;
  if (!action || typeof action.id !== "string" || typeof action.title !== "string") {
    throw new PlanClientError("Unexpected link payload.");
  }
  return {
    contactId: typeof action.meta?.contactId === "string" ? action.meta.contactId : "",
    id: action.id,
    needId: typeof link?.need?.id === "string" ? link.need.id : "",
    title: action.title,
  };
}

/** 是：关联并生成本周「约 TA」行动（服务端按候选固定幂等键）；不是：不再提示。 */
export async function decidePlanMatch(candidateId: string, decision: "accept" | "dismiss"): Promise<PlanMatchAction | null> {
  const response = await fetch("/api/agent/plans/candidates", {
    body: JSON.stringify({ candidateId, decision }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const data = await readEnvelope<{ link: unknown | null; status?: unknown }>(response);
  // 接受会改计划（关联 + 「约 TA」行动）；两种决定都改候选列表。
  invalidatePlanReads({ candidates: true });
  // 服务端对候选做严格 CAS：返回的状态必须就是这次的决定，否则当作失败（不显示成功）。
  const expected = decision === "accept" ? "accepted" : "dismissed";
  if (data.status !== expected) throw new PlanClientError(`This suggestion was already ${String(data.status ?? "handled")}.`);
  return decision === "accept" ? actionFrom(data.link) : null;
}

/** 联系人详情：手动关联到本人计划的某条人脉需求（一次提交持有同一个幂等键）。 */
export async function linkContactToNeed(needItemId: string, contactId: string, idempotencyKey: string): Promise<PlanMatchAction> {
  const response = await fetch("/api/agent/plans/candidates", {
    body: JSON.stringify({ action: "link", contactId, idempotencyKey, needItemId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const action = actionFrom(await readEnvelope<unknown>(response));
  invalidatePlanReads({ candidates: true });
  return action;
}

export async function recordMatchInteraction(actionItemId: string, idempotencyKey = newPlanIdempotencyKey("plan-interaction")): Promise<void> {
  const response = await fetch(`/api/agent/plans/items/${encodeURIComponent(actionItemId)}/interaction`, {
    body: JSON.stringify({ idempotencyKey }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await readEnvelope<unknown>(response);
  invalidatePlanReads();
}

export interface PlanMatchEmailDraft {
  subject: string;
  body: string;
}

export async function requestMatchEmailDraft(actionItemId: string, language: "zh" | "en"): Promise<PlanMatchEmailDraft> {
  const response = await fetch(`/api/agent/plans/items/${encodeURIComponent(actionItemId)}/draft`, {
    body: JSON.stringify({ language }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const data = await readEnvelope<{ draft?: { subject?: unknown; body?: unknown } }>(response);
  if (typeof data.draft?.subject !== "string" || typeof data.draft?.body !== "string") {
    throw new PlanClientError("Unexpected draft payload.");
  }
  return { body: data.draft.body, subject: data.draft.subject };
}

/** 本地移除一条（是 / 不是之后），同时更新角标计数与人数。 */
export function withoutCandidate(list: PlanMatchList, candidateId: string): PlanMatchList {
  const candidates = list.candidates.filter((candidate) => candidate.id !== candidateId);
  const pendingByNeed: Record<string, number> = {};
  for (const candidate of candidates) pendingByNeed[candidate.needId] = (pendingByNeed[candidate.needId] ?? 0) + 1;
  return { candidates, contactCount: new Set(candidates.map((candidate) => candidate.contactId)).size, pendingByNeed };
}
