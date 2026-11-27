/**
 * R27（DESIGN §3.4 / §10 A5）：把活动 AI 调用（报名访谈出题、自己紹介 E4、会後まとめ E3）接进 AI 账本。
 * Owner: 甲 (R27).
 * - 第一次调用前 `reserve`（system 池、auto），每次 HTTP 前后 `beginCall` / `endCall`（带 token），结束时 `finish`。
 * - LF4：账本明确说额度用完（daily_limit / monthly_limit）→ 不发请求，返回不可重试的失败（`refusal()` = "quota"）。
 * - 账本不可用（表未迁移 / CHECK 拒绝新用途 / 出错 / 不是所有者）：会後まとめ（E3）照 A5 照常调用、不记账并留日志；
 *   LF13（用户 2026-10-22 批准）报名的 AI（`refuseWithoutLedger`）改为不发请求（`refusal()` = "unavailable"），
 *   与其他 AI 用途的「始终拒绝」一致——生产上线前须先执行账本迁移。没有注入账本（`gate: null`，只有测试与无库的本地模式）时照常调用。
 * - 2026-11-27：草稿类（`draft_assist`：个人简介草稿、「我在寻找」建议、跟进邮件草稿）也用这个 runner：从 user 池 / manual 预留
 *   （`pool` / `trigger` 可选，默认仍是 system / auto），带 `failOpen`：账本不可用或登记子账出错都照常调用，只有明确超限
 *   （额度用完、超过 max_calls）才不发请求。
 */
import type { AiQuotaGate, AiQuotaPool, AiQuotaTrigger } from "../../ai-quota/gate";
import { AiQuotaCallRejectedError } from "../../ai-quota/ledger";
import type { runOrbitAgentModelText } from "../../orbit-ai/gemini-provider";

type Runner = typeof runOrbitAgentModelText;

export interface LedgeredRunner {
  run: Runner;
  finish(outcome: "succeeded" | "failed"): Promise<void>;
  /** Calls made through `run` (for verification logs). */
  calls(): number;
  /** LF13: why `run` sent nothing — the quota is used up, or the ledger could not be used; null when it ran. */
  refusal(): "quota" | "unavailable" | null;
  /** 2026-11-27: when the quota refused — the limit's value and when it comes back (for a public, numbered notice). */
  quotaDetail(): { cap: number | null; retryOn: string | null } | null;
}

export function createLedgeredRunner(input: {
  gate: AiQuotaGate | null;
  actorId: string;
  purpose: "event_registration_interview" | "event_registration_question" | "event_post_summary" | "draft_assist";
  idempotencyKey: string;
  /** Default `system` / `auto` (the event AI); `draft_assist` reserves from `user` / `manual`. */
  pool?: AiQuotaPool;
  trigger?: AiQuotaTrigger;
  /** 2026-11-27: a ledger error while recording a call (not a refusal) lets the call go out unrecorded. */
  failOpen?: boolean;
  now?: () => Date;
  runner: Runner;
  /** LF13: refuse (send nothing) when the ledger cannot be used, instead of running unledgered (A5). */
  refuseWithoutLedger?: boolean;
}): LedgeredRunner {
  let operation: string | null | undefined;
  let refused: "quota" | "unavailable" | null = null;
  let quotaDetail: { cap: number | null; retryOn: string | null } | null = null;
  let count = 0;
  const now = input.now ?? (() => new Date());
  async function ensure(): Promise<string | null> {
    if (operation !== undefined) return operation;
    if (!input.gate) return (operation = null);
    try {
      const reservation = await input.gate.reserve({ actorId: input.actorId, idempotencyKey: input.idempotencyKey, now: now(), pool: input.pool ?? "system", purpose: input.purpose, takeover: true, trigger: input.trigger ?? "auto" });
      operation = reservation.ok && reservation.owner ? reservation.operationId : null;
      if (!operation) {
        const quota = "reason" in reservation && (reservation.reason === "daily_limit" || reservation.reason === "monthly_limit");
        refused = quota ? "quota" : input.refuseWithoutLedger ? "unavailable" : null;
        if (quota && !reservation.ok) quotaDetail = { cap: reservation.cap ?? null, retryOn: reservation.retryOn ?? null };
        console.warn(JSON.stringify({ event: "event_ai_ledger_unavailable", purpose: input.purpose, reason: "reason" in reservation ? reservation.reason : "not_owner" }));
      }
    } catch (error) {
      console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_ai_ledger_unavailable", purpose: input.purpose }));
      operation = null;
      refused = input.refuseWithoutLedger ? "unavailable" : null;
    }
    return operation;
  }
  return {
    calls: () => count,
    refusal: () => refused,
    quotaDetail: () => quotaDetail,
    async finish(outcome) {
      if (!operation || !input.gate) return;
      await input.gate.finish(operation, outcome).catch((error: unknown) => console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_ai_ledger_finish_failed" })));
    },
    run: (async (args) => {
      const op = await ensure();
      if (refused) {
        console.warn(JSON.stringify({ event: refused === "quota" ? "event_ai_quota_exhausted" : "event_ai_ledger_refused", purpose: input.purpose }));
        return { error: { code: "MODEL_REQUEST_FAILED", message: refused === "quota" ? "AI quota for this purpose is used up." : "The AI usage ledger is unavailable.", provider: "deepseek", source: "env" }, retryable: false, success: false } as unknown as Awaited<ReturnType<Runner>>;
      }
      let callId: string | null = null;
      if (op && input.gate) {
        try {
          callId = (await input.gate.beginCall(op, { model: args.config?.model ?? "configured", provider: String(args.config?.provider ?? "configured") })).callId;
        } catch (error) {
          if (input.failOpen && !(error instanceof AiQuotaCallRejectedError)) {
            console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "ai_ledger_call_unmetered", purpose: input.purpose }));
            return input.runner(args);
          }
          // 超过 max_calls：账本拒绝即不发请求（与其他用途同一语义）。
          console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_ai_ledger_call_refused", purpose: input.purpose }));
          return { error: { code: "MODEL_REQUEST_FAILED", message: "AI call limit for this operation reached.", provider: "deepseek", source: "env" }, retryable: false, success: false } as unknown as Awaited<ReturnType<Runner>>;
        }
      }
      count += 1;
      const result = await input.runner(args);
      if (callId && input.gate) {
        const usage = result.responseMetadata?.usage;
        await input.gate.endCall(callId, usage && usage.promptTokens !== null ? { inputTokens: usage.promptTokens ?? 0, outputTokens: usage.completionTokens ?? 0 } : null).catch(() => undefined);
      }
      return result;
    }) as Runner,
  };
}
