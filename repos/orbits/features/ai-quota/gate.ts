/**
 * W0046：AI 配额闸门接口（D44 / W46-1；revision 3 配额口径）。W0048a 起由 `ai_usage_ledger` 账本实现。
 *
 * - 额度按「操作」计：一次 `reserve` = 1 次操作；
 * - 成本按「每次供应商 HTTP 一条子账」记（`beginCall`／`endCall`），以 operationId 聚合；
 * - 只由持有 operationId 的发起方调用一次 `finish`；没有任何子账拿到响应时账本记 released（不计次）。
 *
 * W0048a 只放宽 purpose／trigger 枚举，并给拒绝结果加可选的 `limit`（哪一道额度挡住了），其余形状不变。
 * 注入点 `createConfiguredAiQuotaGate`：配置了 live 数据库时用账本实现，否则仍是「始终拒绝」。
 */
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import type { AiQuotaPool, AiQuotaPurpose, AiQuotaTrigger } from "./constants";
import { createPostgresAiUsageLedger } from "./ledger";

export type { AiQuotaPool, AiQuotaPurpose, AiQuotaTrigger } from "./constants";

export interface AiQuotaReserveInput {
  actorId: string;
  pool: AiQuotaPool;
  purpose: AiQuotaPurpose;
  trigger: AiQuotaTrigger;
  idempotencyKey: string;
  now: Date;
  /**
   * W0048b（review P1）：同键已有一笔仍在 reserved 的操作时，调用方是否接管它。只给自带租约／认领的调用方
   * （memo 提取的认领胜者、快照 worker 的 job 租约持有者）——它们的租约就是所有权，接管的是崩溃的前任。
   * 请求路径（计划生成、手动重新分析）不传：同键并发方拿到 `owner: false`，不得 beginCall／finish。
   */
  takeover?: boolean;
}

/** 拒绝时是哪一道额度：手动重新分析 3 次、用户池总熔断 10 次、后台池 60 次。 */
export type AiQuotaLimit = "manual" | "user" | "background";

export type AiQuotaReservation =
  | {
      ok: true;
      operationId: string;
      /**
       * true = 本次调用拥有这笔操作（新建、重开 released 的，或带 `takeover` 接管 reserved 的），可以 beginCall／finish；
       * false = 同键操作已在别处进行（`status: "reserved"`）或已结束（succeeded／failed），调用方不得执行或结算它。
       */
      owner: boolean;
      status: "reserved" | "succeeded" | "failed";
    }
  | { ok: false; reason: "disabled" | "daily_limit"; retryOn?: string; limit?: AiQuotaLimit };

export interface AiQuotaGate {
  reserve(input: AiQuotaReserveInput): Promise<AiQuotaReservation>;
  /** 每次供应商 HTTP 发出前登记一条子账；超过本操作的 `max_calls` 或操作已结算时抛错（不发请求）。 */
  beginCall(operationId: string, call: { provider: string; model: string }): Promise<{ callId: string }>;
  /** 拿到响应（含输出无效）后补 token；无响应记 null（no_response）。 */
  endCall(callId: string, usage: { inputTokens: number; outputTokens: number } | null): Promise<void>;
  /** 只由持有 operationId 的发起方调用一次；重复调用为 no-op。 */
  finish(operationId: string, outcome: "succeeded" | "failed"): Promise<void>;
}

/** 「始终拒绝」实现：不计次、不记账、不放行任何调用（无库环境）。 */
export function createAlwaysDenyAiQuotaGate(): AiQuotaGate {
  const refuse = (): never => {
    throw new Error("The always-deny AI quota gate never grants an operation.");
  };
  return {
    async reserve() {
      return { ok: false, reason: "disabled" };
    },
    async beginCall() { return refuse(); },
    async endCall() { return refuse(); },
    async finish() { return refuse(); },
  };
}

/**
 * 注入点（W0048a）：配置了 live 数据库 → 账本实现（表未迁移时 reserve 返回 disabled，0 次调用）；
 * 否则「始终拒绝」。
 */
export function createConfiguredAiQuotaGate(): AiQuotaGate {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return createAlwaysDenyAiQuotaGate();
  return createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId });
}
