/**
 * W0048b：计划 AI 生成测试共用的桩——内存账本（与 `ai-quota/ledger.ts` 同语义）、假的 DeepSeek fetch、
 * 计数快照桩。全程不发真实请求。
 */
import { AI_QUOTA_MAX_CALLS, BACKGROUND_POOL_DAILY_LIMIT, nextTokyoMidnight, tokyoUsageDay, USER_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import type { AiQuotaGate, AiQuotaReserveInput } from "../../features/ai-quota/gate";
import { AiQuotaCallRejectedError } from "../../features/ai-quota/ledger";
import { bindDeepseekPlanChat, createAiPlanGenerator, type PlanSnapshotPort } from "../../features/plans/ai-generator";
import type { NetworkAnalysisSnapshot, NetworkSnapshotViewBlock } from "../../features/network-analysis/contract";
import type { SnapshotRefreshDecision } from "../../features/network-analysis/refresh-policy";

export interface MemoryCall {
  seq: number;
  status: "started" | "responded" | "no_response";
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface MemoryOperation {
  id: string;
  actorId: string;
  key: string;
  pool: AiQuotaReserveInput["pool"];
  purpose: AiQuotaReserveInput["purpose"];
  trigger: AiQuotaReserveInput["trigger"];
  usageDay: string;
  status: "reserved" | "succeeded" | "failed" | "released";
  maxCalls: number;
  calls: MemoryCall[];
}

/** 内存账本：同键重放返回原操作（released 重开）、用户池 10／后台池 60、max_calls、谁持有谁结算。 */
export class MemoryAiLedger implements AiQuotaGate {
  readonly operations: MemoryOperation[] = [];
  readonly finishes: Array<{ operationId: string; outcome: "succeeded" | "failed" }> = [];
  /** 预置的当日已用次数（模拟池已用满）。 */
  preset = { background: 0, user: 0 };

  private used(actorId: string, pool: "user" | "background", day: string): number {
    return this.preset[pool] + this.operations.filter((op) => op.actorId === actorId && op.pool === pool && op.usageDay === day && op.status !== "released").length;
  }

  async reserve(input: AiQuotaReserveInput) {
    const existing = this.operations.find((op) => op.actorId === input.actorId && op.key === input.idempotencyKey);
    // 与 ledger.ts 同语义：重放不转让所有权，只有 takeover 能接管仍在 reserved 的操作。
    if (existing && existing.status !== "released") {
      const status = existing.status as "reserved" | "succeeded" | "failed";
      return { ok: true as const, operationId: existing.id, owner: status === "reserved" && input.takeover === true, status };
    }
    const day = tokyoUsageDay(input.now);
    if (input.pool === "background" && this.used(input.actorId, "background", day) >= BACKGROUND_POOL_DAILY_LIMIT) {
      return { limit: "background" as const, ok: false as const, reason: "daily_limit" as const, retryOn: nextTokyoMidnight(input.now) };
    }
    if (input.pool === "user" && this.used(input.actorId, "user", day) >= USER_POOL_DAILY_LIMIT) {
      return { limit: "user" as const, ok: false as const, reason: "daily_limit" as const, retryOn: nextTokyoMidnight(input.now) };
    }
    if (existing) {
      existing.status = "reserved";
      existing.usageDay = day;
      return { ok: true as const, operationId: existing.id, owner: true, status: "reserved" as const };
    }
    const op: MemoryOperation = {
      actorId: input.actorId,
      calls: [],
      id: `aiop_${this.operations.length + 1}`,
      key: input.idempotencyKey,
      maxCalls: AI_QUOTA_MAX_CALLS[input.purpose],
      pool: input.pool,
      purpose: input.purpose,
      status: "reserved",
      trigger: input.trigger,
      usageDay: day,
    };
    this.operations.push(op);
    return { ok: true as const, operationId: op.id, owner: true, status: "reserved" as const };
  }

  private op(operationId: string): MemoryOperation {
    const op = this.operations.find((entry) => entry.id === operationId);
    if (!op) throw new Error(`unknown operation ${operationId}`);
    return op;
  }

  async beginCall(operationId: string) {
    const op = this.op(operationId);
    if (op.status !== "reserved") throw new AiQuotaCallRejectedError("OPERATION_NOT_OPEN", "This AI operation is not open.");
    if (op.calls.length >= op.maxCalls) throw new AiQuotaCallRejectedError("MAX_CALLS", "This AI operation has no calls left.");
    const seq = op.calls.length + 1;
    op.calls.push({ inputTokens: null, outputTokens: null, seq, status: "started" });
    return { callId: `${operationId}#${seq}` };
  }

  async endCall(callId: string, usage: { inputTokens: number; outputTokens: number } | null) {
    const at = callId.lastIndexOf("#");
    const call = this.op(callId.slice(0, at)).calls.find((entry) => entry.seq === Number(callId.slice(at + 1)));
    if (!call || call.status !== "started") return;
    call.status = usage ? "responded" : "no_response";
    call.inputTokens = usage?.inputTokens ?? null;
    call.outputTokens = usage?.outputTokens ?? null;
  }

  async finish(operationId: string, outcome: "succeeded" | "failed") {
    this.finishes.push({ operationId, outcome });
    const op = this.op(operationId);
    if (op.status !== "reserved") return;
    for (const call of op.calls) if (call.status === "started") call.status = "no_response";
    op.status = op.calls.some((call) => call.status === "responded") ? outcome : "released";
  }

  /** 全部子账条数。 */
  callCount(): number {
    return this.operations.reduce((sum, op) => sum + op.calls.length, 0);
  }
}

/* ------------------------------------------------------------------ */
/* 假的 DeepSeek                                                        */
/* ------------------------------------------------------------------ */

export type FakeReply = Record<string, unknown> | { status: number; body?: unknown } | Error;

export interface FakeRequest {
  kind: "skeleton" | "phase";
  system: string;
  payload: Record<string, unknown>;
  body: Record<string, unknown>;
}

/** 按请求类型（骨架／阶段）返回预设回复；`Error` = 无响应（连接失败），`{ status }` = 非 2xx 有响应。 */
export function fakeDeepseek(script: {
  skeleton?: (request: FakeRequest) => FakeReply;
  phase?: (request: FakeRequest) => FakeReply;
  onRequest?: (request: FakeRequest) => void;
}) {
  const requests: FakeRequest[] = [];
  const fetchImplementation = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> } & Record<string, unknown>;
    const system = body.messages[0]!.content;
    const kind: FakeRequest["kind"] = system.startsWith("You detail one phase") ? "phase" : "skeleton";
    const request: FakeRequest = { body, kind, payload: JSON.parse(body.messages[1]!.content) as Record<string, unknown>, system };
    requests.push(request);
    script.onRequest?.(request);
    const reply = (kind === "skeleton" ? script.skeleton ?? (() => skeletonReply()) : script.phase ?? ((r: FakeRequest) => phaseReply(r)))(request);
    if (reply instanceof Error) throw reply;
    if (typeof (reply as { status?: unknown }).status === "number" && Object.keys(reply).every((key) => key === "status" || key === "body")) {
      const failure = reply as { status: number; body?: unknown };
      return new Response(JSON.stringify(failure.body ?? { error: "boom" }), { status: failure.status });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }], usage: { completion_tokens: 50, prompt_tokens: 100 } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fetchImplementation, requests };
}

/** 骨架回复：`phases` 个阶段（季度 3 段：1–3、4–8、9–12 周）。 */
export function skeletonReply(options: { phases?: number; extra?: Record<string, unknown> } = {}): Record<string, unknown> {
  const count = options.phases ?? 3;
  const weeks = count === 3 ? [[1, 3], [4, 8], [9, 12]] : Array.from({ length: count }, (_, index) => [index + 1, index + 1]);
  return {
    allies: [{ contactId: "C1", help: "可以介绍采购负责人", name: "模型编的名字" }],
    answer: [{ text: "先从" }, { emphasis: true, text: "王砚" }, { text: "切入。" }],
    figures: [{ label: "模型编的", unit: "位", value: "999" }],
    gaps: ["制造业 IT 负责人"],
    phases: weeks.map(([start, end], index) => ({ endWeek: end, startWeek: start, summary: `摘要 ${index + 1}`, title: `阶段 ${index + 1}` })),
    pitch: { setting: "交流会 · 30 秒", text: "我在做制造业数字化。" },
    risk: "前三周约不到人。",
    thisWeek: [{ contactIds: ["C1"], eventIds: ["E1"], title: "约王砚聊 20 分钟", why: "最近有互动" }],
    ...options.extra,
  };
}

export function phaseReply(request: FakeRequest, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const phase = request.payload.phase as { startWeek: number; title: string };
  return {
    actions: [{ contactIds: ["C2"], detail: "说明", title: `${phase.title} 的行动`, week: phase.startWeek }],
    events: [{ eventId: "E1", week: phase.startWeek }],
    followups: ["当天发感谢"],
    infos: [{ title: "对方怎么决策？" }],
    needs: [{ description: "做采购的人", primaryIndustryId: "manufacturing_supply_chain", targetCount: 2, title: `${phase.title} 要认识的人`, titleKeywords: ["采购"] }],
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* 快照桩                                                               */
/* ------------------------------------------------------------------ */

export function snapshotStub(options: {
  ledger: AiQuotaGate;
  decision?: SnapshotRefreshDecision["kind"];
  existingId?: string | null;
  /** 快照 HTTP 的结果：responded（默认）、invalid（有响应但无效）、no_response。 */
  outcome?: "responded" | "invalid" | "no_response";
  /** 与假的 DeepSeek 共用的 HTTP 计数（证明「fetch 次数 = 子账条数」）。 */
  onHttp?: () => void;
}) {
  const calls: Array<Record<string, unknown>> = [];
  const port: PlanSnapshotPort = {
    async evaluate() {
      return { kind: options.decision ?? "auto", snapshotId: options.existingId ?? null };
    },
    async generateSnapshotNow(input) {
      calls.push({ ...input });
      // 与 W0048a 入口同语义：只登记子账、不预留、不结算。
      let callId: string;
      try {
        callId = (await options.ledger.beginCall(input.operationId, { model: "m", provider: "deepseek" })).callId;
      } catch {
        return { callsResponded: 0, error: "call_rejected", snapshot: null };
      }
      options.onHttp?.();
      const outcome = options.outcome ?? "responded";
      await options.ledger.endCall(callId, outcome === "no_response" ? null : { inputTokens: 300, outputTokens: 80 });
      if (outcome !== "responded") return { callsResponded: outcome === "invalid" ? 1 : 0, error: outcome === "invalid" ? "invalid_output" : "provider_failed", snapshot: null };
      return { callsResponded: 1, snapshot: { id: `snap:${calls.length}`, planId: input.planId ?? null } as unknown as NetworkAnalysisSnapshot };
    },
    async readBlocks(): Promise<NetworkSnapshotViewBlock[]> {
      return [{ evidence: { contactIds: ["contact:wang", "contact:unknown"], recordIds: [] }, key: "d", kind: "diagnosis", text: "制造业人脉集中。" }];
    },
  };
  return { calls, port };
}

/** 计次的 AI 生成器（假的 fetch + 内存账本 + 快照桩）。 */
export function aiGenerator(options: { ledger: MemoryAiLedger; fetchImplementation: typeof fetch; snapshots?: PlanSnapshotPort | null; log?: (line: Record<string, unknown>) => void }) {
  return createAiPlanGenerator({
    chat: bindDeepseekPlanChat({ apiKey: "test-key", fetchImplementation: options.fetchImplementation, model: "deepseek-test", timeoutMs: 5_000 }),
    ledger: options.ledger,
    log: options.log ?? (() => undefined),
    model: "deepseek-test",
    snapshots: options.snapshots ?? null,
  });
}
