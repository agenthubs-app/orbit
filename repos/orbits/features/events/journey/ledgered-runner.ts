/**
 * R27（DESIGN §3.4 / §10 A5）：把两个现有活动 AI 调用（报名访谈 / 自己紹介 E4、会後まとめ E3）接进 AI 账本——只记账，不设上限。
 * Owner: 甲 (R27).
 * - 第一次调用前 `reserve`（system 池、auto），每次 HTTP 前后 `beginCall` / `endCall`（带 token），结束时 `finish`。
 * - 账本不可用（生产还没执行迁移 v4 时 CHECK 会拒绝新用途、或无库）→ 照常调用、不记账，并留一条日志：
 *   记账是观测手段，不能挡住已上线的功能。
 */
import type { AiQuotaGate } from "../../ai-quota/gate";
import type { runOrbitAgentModelText } from "../../orbit-ai/gemini-provider";

type Runner = typeof runOrbitAgentModelText;

export interface LedgeredRunner {
  run: Runner;
  finish(outcome: "succeeded" | "failed"): Promise<void>;
  /** Calls made through `run` (for verification logs). */
  calls(): number;
}

export function createLedgeredRunner(input: {
  gate: AiQuotaGate | null;
  actorId: string;
  purpose: "event_registration_interview" | "event_post_summary";
  idempotencyKey: string;
  now?: () => Date;
  runner: Runner;
}): LedgeredRunner {
  let operation: string | null | undefined;
  let count = 0;
  const now = input.now ?? (() => new Date());
  async function ensure(): Promise<string | null> {
    if (operation !== undefined) return operation;
    if (!input.gate) return (operation = null);
    try {
      const reservation = await input.gate.reserve({ actorId: input.actorId, idempotencyKey: input.idempotencyKey, now: now(), pool: "system", purpose: input.purpose, takeover: true, trigger: "auto" });
      operation = reservation.ok && reservation.owner ? reservation.operationId : null;
      if (!operation) console.warn(JSON.stringify({ event: "event_ai_ledger_unavailable", purpose: input.purpose, reason: reservation.ok ? "not_owner" : "refused" }));
    } catch (error) {
      console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_ai_ledger_unavailable", purpose: input.purpose }));
      operation = null;
    }
    return operation;
  }
  return {
    calls: () => count,
    async finish(outcome) {
      if (!operation || !input.gate) return;
      await input.gate.finish(operation, outcome).catch((error: unknown) => console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_ai_ledger_finish_failed" })));
    },
    run: (async (args) => {
      const op = await ensure();
      let callId: string | null = null;
      if (op && input.gate) {
        try {
          callId = (await input.gate.beginCall(op, { model: args.config?.model ?? "configured", provider: String(args.config?.provider ?? "configured") })).callId;
        } catch (error) {
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
