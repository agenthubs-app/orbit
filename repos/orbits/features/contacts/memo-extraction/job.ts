/**
 * W0046：memo 提取作业（专长／需求／话题写回 + 互动类型），照抄 features/plans/match-worker.ts 的「先落库再调用」。
 *
 * 状态机（`memo_extractions` 记录，键 = `memo:<noteId>:<正文哈希>`，可重建的派生缓存，memo 原文是唯一事实来源）：
 *
 *   (无记录／disabled／deferred 已到期／claimed 租约过期) ──原子认领──▶ claimed（租约 5 分钟，未发 HTTP）
 *   claimed ──reserve 拒绝 disabled──▶ disabled              （0 次调用；闸门开后可重跑）
 *           ──reserve 拒绝 daily_limit──▶ deferred(retryOn)   （0 次调用；顺延到 retryOn）
 *           ──beginCall 失败──▶ deferred(retryOn=now)，finish(failed) 释放（无子账 → released，不计次）
 *           ──beginCall 成功──▶ started ──provider──▶ succeeded／failed
 *   started／succeeded／failed 是终态：「HTTP 可能已发出」，重试绝不再调用 provider。
 *
 * 并发：认领是原子的（insert-if-absent 或以上一版 updatedAt 为前提的 CAS），只有认领胜者才会
 * reserve／beginCall／调用 provider；之后每次状态推进都是 CAS，丢失认领即停手。
 * 一条 memo 提取只 reserve 1 次操作；每次 HTTP 各有 beginCall／endCall；只由认领者调用一次 finish。
 */
import { createHash, randomUUID } from "node:crypto";

import type { AiQuotaGate } from "../../ai-quota/gate";
import type { AppliedEnrichmentField, EnrichedValue } from "../enrichment/apply-enrichment";
import { MemoExtractionError, type MemoExtractionOutput, type MemoExtractionProvider } from "./provider";

export type MemoExtractionStatus = "claimed" | "disabled" | "deferred" | "started" | "succeeded" | "failed";

export interface MemoExtractionRecord {
  key: string;
  actorId: string;
  contactId: string;
  noteId: string;
  bodyHash: string;
  status: MemoExtractionStatus;
  attempts: number;
  createdAt: string;
  /** 也是 CAS 版本：每次推进严格递增。 */
  updatedAt: string;
  claimToken?: string;
  leaseUntil?: string;
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
  /** 原子插入；已存在返回 false。 */
  insert(record: MemoExtractionRecord): Promise<boolean>;
  /** 仅当存储里的 updatedAt 仍等于 expectedUpdatedAt 时替换；否则返回 false。 */
  replace(record: MemoExtractionRecord, expectedUpdatedAt: string): Promise<boolean>;
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

export const MEMO_EXTRACTION_CLAIM_LEASE_MS = 5 * 60_000;

export function memoBodyHash(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex").slice(0, 24);
}

export function memoExtractionKey(noteId: string, body: string): string {
  return `memo:${noteId}:${memoBodyHash(body)}`;
}

const TERMINAL: readonly MemoExtractionStatus[] = ["started", "succeeded", "failed"];

/** 严格递增的版本时间：不早于现在，且比上一版至少晚 1 ms。 */
function nextStamp(now: Date, previous?: string): string {
  const prev = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(now.getTime(), Number.isFinite(prev) ? prev + 1 : now.getTime())).toISOString();
}

function claimable(existing: MemoExtractionRecord | null, now: Date): boolean {
  if (!existing) return true;
  if (TERMINAL.includes(existing.status)) return false;
  if (existing.status === "claimed") return Boolean(existing.leaseUntil) && Date.parse(existing.leaseUntil as string) <= now.getTime();
  if (existing.status === "deferred" && existing.retryOn) return Date.parse(existing.retryOn) <= now.getTime();
  return true; // disabled，或 deferred 无 retryOn
}

export async function runMemoExtraction(input: MemoExtractionJobInput, deps: MemoExtractionJobDeps): Promise<MemoExtractionRecord> {
  const clock = deps.now ?? (() => new Date());
  const key = memoExtractionKey(input.noteId, input.body);
  const existing = await deps.store.get({ actorId: input.actorId, key });
  const now = clock();
  if (existing && !claimable(existing, now)) return existing;

  // 1. 原子认领：只有胜者继续。
  const claimToken = randomUUID();
  let current: MemoExtractionRecord = {
    key,
    actorId: input.actorId,
    contactId: input.contactId,
    noteId: input.noteId,
    bodyHash: memoBodyHash(input.body),
    status: "claimed",
    attempts: existing?.attempts ?? 0,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: nextStamp(now, existing?.updatedAt),
    claimToken,
    leaseUntil: new Date(now.getTime() + MEMO_EXTRACTION_CLAIM_LEASE_MS).toISOString(),
  };
  const won = existing ? await deps.store.replace(current, existing.updatedAt) : await deps.store.insert(current);
  if (!won) return (await deps.store.get({ actorId: input.actorId, key })) ?? existing ?? current;

  /** CAS 推进；丢失认领（被别人推进）返回 false。 */
  const advance = async (patch: Partial<MemoExtractionRecord>): Promise<boolean> => {
    const { claimToken: _token, leaseUntil: _lease, ...rest } = current;
    const next: MemoExtractionRecord = {
      ...rest,
      ...patch,
      ...(patch.status === "claimed" ? { claimToken, leaseUntil: current.leaseUntil } : {}),
      updatedAt: nextStamp(clock(), current.updatedAt),
    } as MemoExtractionRecord;
    const ok = await deps.store.replace(next, current.updatedAt);
    if (ok) current = next;
    return ok;
  };

  // 2. 认领胜者才 reserve（一条 memo 一次操作）。
  const reservation = await deps.gate.reserve({
    actorId: input.actorId,
    pool: "background",
    purpose: "memo_extraction",
    trigger: "auto",
    idempotencyKey: key,
    now: clock(),
  });
  if (reservation.ok !== true) {
    const refusal = reservation as Extract<typeof reservation, { ok: false }>;
    await advance(refusal.reason === "daily_limit"
      ? { status: "deferred", ...(refusal.retryOn ? { retryOn: refusal.retryOn } : {}) }
      : { status: "disabled" });
    return current;
  }
  const operationId = reservation.operationId;
  if (!deps.provider) {
    // 放行但没有 provider 配置：不发请求，按失败收尾（无子账 → released，不计次）；可在配置后重试。
    await advance({ status: "deferred", retryOn: clock().toISOString(), operationId, error: "PROVIDER_UNCONFIGURED" });
    await deps.gate.finish(operationId, "failed");
    return current;
  }

  // 3. 登记子账：失败时 HTTP 一定没发出 → 释放并转为可重试，不进终态。
  let callId: string;
  try {
    ({ callId } = await deps.gate.beginCall(operationId, { provider: deps.provider.providerName, model: deps.provider.model }));
  } catch (error) {
    await deps.gate.finish(operationId, "failed").catch(() => undefined);
    await advance({ status: "deferred", retryOn: clock().toISOString(), operationId, error: `BEGIN_CALL_FAILED: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}` });
    return current;
  }

  // 4. 先把 started 落库（CAS），再发请求：之后任何重试都不会再调用 provider。
  const startedOk = await advance({
    status: "started",
    attempts: current.attempts + 1,
    operationId,
    provider: deps.provider.providerName,
    model: deps.provider.model,
  });
  if (!startedOk) {
    // 认领被别人推进（不应发生）：HTTP 未发，结清子账并释放。
    await deps.gate.endCall(callId, null).catch(() => undefined);
    await deps.gate.finish(operationId, "failed").catch(() => undefined);
    return (await deps.store.get({ actorId: input.actorId, key })) ?? current;
  }

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
    await deps.gate.endCall(callId, errorUsage).catch(() => undefined);
    await advance({ status: "failed", usage: errorUsage, error: error instanceof MemoExtractionError ? error.code : "PROVIDER_ERROR" });
    await deps.gate.finish(operationId, "failed");
    return current;
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
  await advance({
    status: "succeeded",
    usage,
    output,
    writtenFields,
    ...(writeError ? { error: `WRITE_BACK_FAILED: ${writeError}` } : {}),
  });
  await deps.gate.finish(operationId, "succeeded");
  return current;
}
