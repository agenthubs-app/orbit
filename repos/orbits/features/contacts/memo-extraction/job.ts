/**
 * W0046：memo 提取作业（专长／需求／话题写回 + 互动类型），照抄 features/plans/match-worker.ts 的「先落库再调用」。
 *
 * 状态机（`memo_extractions` 记录，键 = `memo:<noteId>:<正文哈希>`，可重建的派生缓存，memo 原文是唯一事实来源）：
 *
 *   (无记录) ──reserve 拒绝 disabled──▶ disabled            （0 次调用；闸门开后可重跑）
 *            ──reserve 拒绝 daily_limit──▶ deferred(retryOn) （0 次调用；顺延到 retryOn）
 *            ──reserve 放行──▶ started ──provider 成功──▶ succeeded（写回经 canWriteEnrichedValue）
 *                                      └─provider 失败──▶ failed
 *   disabled／deferred 可再次尝试；started／succeeded／failed 是终态：重试绝不再调用 provider
 *   （started 先提交再发请求，进程中途崩溃也不会重复计费）。
 *
 * 一条 memo 提取只 reserve 1 次操作；每次 HTTP 各有 beginCall／endCall；只由本作业调用一次 finish。
 */
import { createHash } from "node:crypto";

import type { AiQuotaGate } from "../../ai-quota/gate";
import type { AppliedEnrichmentField, EnrichedValue } from "../enrichment/apply-enrichment";
import { MemoExtractionError, type MemoExtractionOutput, type MemoExtractionProvider } from "./provider";

export type MemoExtractionStatus = "disabled" | "deferred" | "started" | "succeeded" | "failed";

export interface MemoExtractionRecord {
  key: string;
  actorId: string;
  contactId: string;
  noteId: string;
  bodyHash: string;
  status: MemoExtractionStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  operationId?: string;
  retryOn?: string;
  provider?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number } | null;
  output?: MemoExtractionOutput;
  writtenFields?: readonly AppliedEnrichmentField[];
  error?: string;
}

export interface MemoExtractionStore {
  get(input: { actorId: string; key: string }): Promise<MemoExtractionRecord | null>;
  put(record: MemoExtractionRecord): Promise<void>;
}

export interface MemoExtractionJobInput {
  actorId: string;
  contactId: string;
  noteId: string;
  body: string;
  contact: { organization?: string | null; role?: string | null };
}

export interface MemoExtractionJobDeps {
  gate: AiQuotaGate;
  provider: MemoExtractionProvider | null;
  store: MemoExtractionStore;
  /** 写回联系人行（provider.applyContactMemoExtraction）；返回实际写入的字段。 */
  applyValues: (input: { actorId: string; contactId: string; values: readonly EnrichedValue[]; at: string }) => Promise<readonly AppliedEnrichmentField[]>;
  now?: () => Date;
}

export function memoBodyHash(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex").slice(0, 24);
}

export function memoExtractionKey(noteId: string, body: string): string {
  return `memo:${noteId}:${memoBodyHash(body)}`;
}

const TERMINAL: readonly MemoExtractionStatus[] = ["started", "succeeded", "failed"];

export async function runMemoExtraction(input: MemoExtractionJobInput, deps: MemoExtractionJobDeps): Promise<MemoExtractionRecord> {
  const clock = deps.now ?? (() => new Date());
  const key = memoExtractionKey(input.noteId, input.body);
  const existing = await deps.store.get({ actorId: input.actorId, key });
  if (existing && TERMINAL.includes(existing.status)) return existing;
  const now = clock();
  if (existing?.status === "deferred" && existing.retryOn && Date.parse(existing.retryOn) > now.getTime()) return existing;

  const base: MemoExtractionRecord = {
    key,
    actorId: input.actorId,
    contactId: input.contactId,
    noteId: input.noteId,
    bodyHash: memoBodyHash(input.body),
    status: "disabled",
    attempts: existing?.attempts ?? 0,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const reservation = await deps.gate.reserve({
    actorId: input.actorId,
    pool: "background",
    purpose: "memo_extraction",
    trigger: "auto",
    idempotencyKey: key,
    now,
  });
  if (reservation.ok !== true) {
    const refusal = reservation as Extract<typeof reservation, { ok: false }>;
    const record: MemoExtractionRecord = refusal.reason === "daily_limit"
      ? { ...base, status: "deferred", ...(refusal.retryOn ? { retryOn: refusal.retryOn } : {}) }
      : { ...base, status: "disabled" };
    await deps.store.put(record);
    return record;
  }
  if (!deps.provider) {
    // 闸门放行但没有 provider 配置：不发请求，操作按失败收尾（账本里无子账 → released，不计次）。
    const record: MemoExtractionRecord = { ...base, status: "failed", attempts: base.attempts + 1, operationId: reservation.operationId, error: "PROVIDER_UNCONFIGURED" };
    await deps.store.put(record);
    await deps.gate.finish(reservation.operationId, "failed");
    return record;
  }

  // 先把 started 落库，再发请求：之后任何重试都不会再调用 provider。
  const started: MemoExtractionRecord = {
    ...base,
    status: "started",
    attempts: base.attempts + 1,
    operationId: reservation.operationId,
    provider: deps.provider.providerName,
    model: deps.provider.model,
  };
  await deps.store.put(started);

  const { callId } = await deps.gate.beginCall(reservation.operationId, { provider: deps.provider.providerName, model: deps.provider.model });
  let output: MemoExtractionOutput;
  let usage: { inputTokens: number; outputTokens: number } | null = null;
  try {
    const result = await deps.provider.extract({ memo: input.body, contact: input.contact });
    usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
    output = result.output;
    await deps.gate.endCall(callId, usage);
  } catch (error) {
    const errorUsage = error instanceof MemoExtractionError && error.usage
      ? { inputTokens: error.usage.inputTokens, outputTokens: error.usage.outputTokens }
      : null;
    await deps.gate.endCall(callId, errorUsage);
    const failed: MemoExtractionRecord = {
      ...started,
      status: "failed",
      usage: errorUsage,
      error: error instanceof MemoExtractionError ? error.code : "PROVIDER_ERROR",
      updatedAt: clock().toISOString(),
    };
    await deps.store.put(failed);
    await deps.gate.finish(reservation.operationId, "failed");
    return failed;
  }

  const at = clock().toISOString();
  const values: EnrichedValue[] = (["offering", "seeking", "topics"] as const)
    .filter((field) => output[field].length > 0)
    .map((field) => ({ field, value: output[field], origin: "ai" as const, via: "memo_extraction" as const }));
  let writtenFields: readonly AppliedEnrichmentField[] = [];
  let writeError: string | undefined;
  try {
    writtenFields = values.length ? await deps.applyValues({ actorId: input.actorId, contactId: input.contactId, values, at }) : [];
  } catch (error) {
    // 提取本身已成功（计费已发生）：结果留在缓存里，写回失败如实记下，不再调用 provider。
    writeError = error instanceof Error ? error.message.slice(0, 200) : "WRITE_BACK_FAILED";
  }
  const succeeded: MemoExtractionRecord = {
    ...started,
    status: "succeeded",
    usage,
    output,
    writtenFields,
    ...(writeError ? { error: `WRITE_BACK_FAILED: ${writeError}` } : {}),
    updatedAt: at,
  };
  await deps.store.put(succeeded);
  await deps.gate.finish(reservation.operationId, "succeeded");
  return succeeded;
}
