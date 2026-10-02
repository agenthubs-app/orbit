/**
 * W0055 SC-01：老联系人「人脉真分析」回填编排（补全 → 强度 → 洞察 → 快照）。只调用各阶段已交接的入口，不重写阶段逻辑：
 *
 *   - 补全：W0045 `buildContactEnrichmentBackfillPlan` + `applyContactEnrichmentBackfillPlan`（只补空，`origin=user` 与任何已有值永不覆盖；
 *     apply 同一事务里把被补的人标洞察待更新，W0051）；
 *   - 强度：W0047 `ensureRelationshipStrengths`（读时重算，0 次 AI）；
 *   - 洞察：W0051 把「还没有洞察行」的已确认联系人标待更新（W0051 交接：回填时全部标待更新即可），再把本人的待更新行按 ≤20 人一批
 *     `prepareInsightGeneration` → 预留 1 次操作 → `executeInsightGeneration`；
 *   - 快照：W0048a `evaluate` 判定（fresh／insufficient 跳过），需要时预留 1 次操作 → `generateSnapshotNow`。
 *
 * 记账（W55-5）：所有 AI 操作经 `createSystemBudgetGate`，强制记 `pool='system'`、`trigger='auto'`，不占用户主动池与后台自动池；
 * 每次供应商 HTTP 一条成本子账（beginCall／endCall），`--max-ai-calls` 按子账次数计，到上限即停在检查点（检查点在仓库外）。
 * 第二次执行 0 写 0 调用：补全按「每人 AI 输入指纹」记在检查点里已尝试过的人不再送模型；强度按来源戳；洞察只处理待更新与缺行；
 * 快照按 sourceDataVersion（fresh 即跳过）。各 AI 操作的幂等键也按内容指纹生成，同内容的操作只会执行一次。
 *
 * 用法（只在本机验收库执行；生产执行另行授权，本脚本不实现连生产的路径）：
 *   node --import tsx scripts/backfill-network-analysis.ts --email=verify-network@orbit.test --max-ai-calls=10            # 预演：0 写 0 调用
 *   ... --apply                                    # 执行
 *   ... --batch-size=20 --sleep-ms=1000            # 每批人数（≤20）与两次 HTTP 的间隔（≥1000）
 *   ... --checkpoint=<仓库外路径>                   # 默认 ~/orbit-backfill-checkpoints/network-analysis-<库>.json
 *   ... --mock-ai                                  # 强制 mock 生成器、跳过按文字补全（本机演练）
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AiQuotaGate, AiQuotaReservation, AiQuotaReserveInput } from "../features/ai-quota/gate";
import type { AiUsageLedger } from "../features/ai-quota/ledger";
import {
  buildContactEnrichmentBackfillPlan,
  type EnrichmentBackfillApplyResult,
  type EnrichmentBackfillPlan,
  type EnrichmentBackfillRecord,
} from "../features/contacts/enrichment/backfill";
import { TEXT_ENRICHMENT_MAX_CONTACTS, type TextEnricher, type TextEnrichmentContactInput } from "../features/contacts/enrichment/text-enrichment";
import type { SnapshotTrigger } from "../features/network-analysis/contract";

/* ── 选项与结果 ─────────────────────────────────────────────────────── */

export const BACKFILL_STAGES = ["enrichment", "strength", "insights", "snapshot"] as const;
export type BackfillStage = (typeof BACKFILL_STAGES)[number];

export const BACKFILL_MAX_BATCH_SIZE = TEXT_ENRICHMENT_MAX_CONTACTS;
export const BACKFILL_MIN_SLEEP_MS = 1_000;

export interface NetworkAnalysisBackfillOptions {
  actorIds: readonly string[];
  apply: boolean;
  /** 本次运行允许的供应商 HTTP 次数（成本子账条数）。必填。 */
  maxAiCalls: number;
  batchSize: number;
  sleepMs: number;
}

export interface StageReport {
  stage: BackfillStage;
  /** 本阶段要处理（预演）或已处理（执行）的联系人数。 */
  contacts: number;
  /** 预计（预演）或实际（执行）的 AI 操作数与 HTTP 数。 */
  aiOperations: number;
  aiHttpCalls: number;
  /** 执行时的写入条数（预演恒为 0）。 */
  writes: number;
  detail: Record<string, unknown>;
}

export interface ActorReport {
  actorId: string;
  stages: StageReport[];
}

export interface NetworkAnalysisBackfillResult {
  mode: "dry-run" | "apply";
  status: "completed" | "stopped_at_limit";
  stoppedAt: { actorId: string; stage: BackfillStage } | null;
  actors: ActorReport[];
  totals: { aiOperations: number; aiHttpCalls: number; writes: number };
}

/* ── 检查点（仓库外） ───────────────────────────────────────────────── */

export interface BackfillCheckpoint {
  version: 1;
  /** actorId → contactId → AI 输入指纹：已经送过模型（拿到响应）的人，同指纹不再送。 */
  enrichmentAttempted: Record<string, Record<string, string>>;
  /** 累计 HTTP 次数（跨运行）。 */
  httpCallsTotal: number;
  stoppedAt: { actorId: string; stage: BackfillStage; at: string } | null;
  runs: { startedAt: string; mode: "dry-run" | "apply"; httpCalls: number; status: string }[];
}

export function emptyCheckpoint(): BackfillCheckpoint {
  return { enrichmentAttempted: {}, httpCallsTotal: 0, runs: [], stoppedAt: null, version: 1 };
}

export interface CheckpointStore {
  load(): BackfillCheckpoint;
  save(checkpoint: BackfillCheckpoint): void;
}

export function createFileCheckpointStore(file: string): CheckpointStore {
  return {
    load() {
      if (!existsSync(file)) return emptyCheckpoint();
      const parsed = JSON.parse(readFileSync(file, "utf8")) as BackfillCheckpoint;
      if (parsed.version !== 1) throw new Error("BACKFILL_REFUSED: unknown checkpoint version.");
      return parsed;
    },
    save(checkpoint) {
      mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, file);
    },
  };
}

/* ── system 池预算闸门 ──────────────────────────────────────────────── */

export class BackfillBudgetExhaustedError extends Error {
  constructor() {
    super("BACKFILL_BUDGET_EXHAUSTED: --max-ai-calls reached.");
    this.name = "BackfillBudgetExhaustedError";
  }
}

export interface SystemBudgetGate extends AiQuotaGate {
  remaining(): number;
  httpCalls(): number;
  operations(): number;
}

/**
 * 包一层账本：预留一律改记 `pool='system'`、`trigger='auto'`（回填不占任何用户池）；每次 beginCall（= 一次 HTTP）计入预算，
 * 预算用完时 beginCall 直接拒绝、不发请求。其余方法原样委托（快照服务需要完整的 AiUsageLedger 形状）。
 */
export function createSystemBudgetGate<T extends AiQuotaGate>(inner: T, maxCalls: number): T & SystemBudgetGate {
  let calls = 0;
  let operations = 0;
  const gate = Object.assign(Object.create(null) as object, inner) as T & SystemBudgetGate;
  gate.reserve = async (input: AiQuotaReserveInput): Promise<AiQuotaReservation> => {
    const reservation = await inner.reserve({ ...input, pool: "system", trigger: "auto" });
    if (reservation.ok === true && reservation.owner) operations += 1;
    return reservation;
  };
  gate.beginCall = async (operationId, call) => {
    if (calls >= maxCalls) throw new BackfillBudgetExhaustedError();
    calls += 1;
    return inner.beginCall(operationId, call);
  };
  gate.endCall = (callId, usage) => inner.endCall(callId, usage);
  gate.finish = (operationId, outcome) => inner.finish(operationId, outcome);
  gate.remaining = () => Math.max(0, maxCalls - calls);
  gate.httpCalls = () => calls;
  gate.operations = () => operations;
  return gate;
}

/* ── 阶段依赖（真实实现在 main；测试用内存实现） ─────────────────────── */

export interface InsightPending {
  /** 已确认、还没有洞察行的联系人。 */
  missing: string[];
  /** 已有行、待更新（dirty）的联系人。 */
  dirty: string[];
}

export interface InsightBatchOutcome {
  status: "succeeded" | "failed" | "nothing" | "no_goal" | "not_claimed" | "not_owner" | "unavailable";
  contacts: number;
  writes: number;
}

export interface SnapshotEvaluation {
  kind: "insufficient" | "fresh" | "auto" | "stale";
  trigger: SnapshotTrigger | null;
  sourceDataVersion: string;
}

export interface NetworkAnalysisBackfillDeps {
  enrichment: {
    /** 本人有效联系人（只读）。 */
    listRecords(actorId: string): Promise<EnrichmentBackfillRecord[]>;
    /** 按计划写入（W0045 apply：只补空，同一事务标洞察待更新）。 */
    apply(plan: EnrichmentBackfillPlan): Promise<EnrichmentBackfillApplyResult>;
    /** null = 跳过按文字补全（无 key 或 --mock-ai）。 */
    enricher: TextEnricher | null;
    workspaceId: string;
  };
  strength: {
    isFresh(actorId: string, now: Date): Promise<boolean>;
    ensure(actorId: string, now: Date): Promise<"fresh" | "recomputed" | "skipped" | "unconfigured">;
  };
  insights: {
    /** 生成器是否每次发一次付费 HTTP（mock 为 false）。 */
    billable: boolean;
    hasGoal(actorId: string): Promise<boolean>;
    listPending(actorId: string): Promise<InsightPending>;
    /** 把还没有行的人标待更新（reason manual），返回写入行数。 */
    markMissing(actorId: string, contactIds: readonly string[], now: Date): Promise<number>;
    /** 领取这些待更新行 → 判定 → 需要时经 gate 预留 1 次操作并生成。 */
    processBatch(actorId: string, contactIds: readonly string[], gate: AiQuotaGate, now: Date): Promise<InsightBatchOutcome>;
  };
  snapshot: {
    billable: boolean;
    evaluate(actorId: string): Promise<SnapshotEvaluation>;
    /** 调用方已预留并持有 operationId；本函数只登记子账，不 finish。 */
    generate(actorId: string, input: { operationId: string; trigger: SnapshotTrigger; now: Date }, gate: AiQuotaGate): Promise<{ written: boolean; callsResponded: number }>;
  };
  checkpoint: CheckpointStore;
  now(): Date;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

/* ── 工具 ───────────────────────────────────────────────────────────── */

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 送模型的输入指纹（与 W0045 aiInputFor 同字段）：这些字段变了才会再送一次。 */
export function enrichmentInputFingerprint(input: TextEnrichmentContactInput): string {
  return sha(JSON.stringify([input.contactId, input.organization ?? "", input.role ?? "", input.location ?? "", input.cardNotes ?? ""])).slice(0, 32);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

class StopAtLimit extends Error {
  constructor(readonly stage: BackfillStage) {
    super(`stopped at ${stage}`);
  }
}

/* ── 编排 ───────────────────────────────────────────────────────────── */

export function validateBackfillOptions(options: NetworkAnalysisBackfillOptions): void {
  if (!options.actorIds.length) throw new Error("BACKFILL_REFUSED: no target account (pass --email= or --actor=).");
  if (!Number.isInteger(options.maxAiCalls) || options.maxAiCalls < 0) throw new Error("BACKFILL_REFUSED: --max-ai-calls must be a non-negative integer.");
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > BACKFILL_MAX_BATCH_SIZE) {
    throw new Error(`BACKFILL_REFUSED: --batch-size must be 1..${BACKFILL_MAX_BATCH_SIZE}.`);
  }
  if (!Number.isInteger(options.sleepMs) || options.sleepMs < BACKFILL_MIN_SLEEP_MS) throw new Error(`BACKFILL_REFUSED: --sleep-ms must be ≥ ${BACKFILL_MIN_SLEEP_MS}.`);
}

/**
 * 包一层补全器：剔除检查点里同指纹已送过的人；预演时只计批数、不发请求；执行时每批预留 1 次 system 操作并登记 1 条子账。
 * 预算用完时不再发请求（这一批记为未尝试），并让编排停在补全阶段。
 */
function createBackfillEnricher(input: {
  actorId: string;
  inner: TextEnricher | null;
  apply: boolean;
  gate: SystemBudgetGate;
  attempted: Record<string, string>;
  sleepMs: number;
  sleep: (ms: number) => Promise<void>;
  stats: { operations: number; httpCalls: number; candidates: number; batchesIfEnabled: number; skippedAttempted: number; stopped: boolean; tokensIn: number; tokensOut: number };
}): TextEnricher {
  const model = input.inner?.model ?? "dry-run";
  let sentBefore = false;
  return {
    model,
    providerName: input.inner?.providerName ?? "dry-run",
    async enrich({ contacts }) {
      const empty = { model, proposals: [], usage: { inputTokens: 0, latencyMs: 0, outputTokens: 0 } };
      const fresh = contacts.filter((contact) => input.attempted[contact.contactId] !== enrichmentInputFingerprint(contact));
      input.stats.skippedAttempted += contacts.length - fresh.length;
      input.stats.candidates += fresh.length;
      if (fresh.length) input.stats.batchesIfEnabled += 1;
      if (!fresh.length || !input.inner) return empty;
      if (!input.apply) {
        input.stats.operations += 1;
        input.stats.httpCalls += 1;
        return empty;
      }
      if (input.stats.stopped || input.gate.remaining() < 1) {
        input.stats.stopped = true;
        return empty;
      }
      const fingerprints = fresh.map(enrichmentInputFingerprint).sort();
      const reservation = await input.gate.reserve({
        actorId: input.actorId,
        idempotencyKey: `backfill:enrichment:${input.actorId}:${sha(fingerprints.join("\n")).slice(0, 32)}`,
        now: new Date(),
        pool: "system",
        purpose: "enrichment",
        trigger: "auto",
      });
      if (reservation.ok !== true) throw new Error("BACKFILL_LEDGER_UNAVAILABLE: the AI usage ledger refused the system reservation.");
      if (!reservation.owner) {
        // 同内容的操作已经执行过：视为已尝试，不再发请求。
        for (const contact of fresh) input.attempted[contact.contactId] = enrichmentInputFingerprint(contact);
        return empty;
      }
      if (sentBefore) await input.sleep(input.sleepMs);
      sentBefore = true;
      let outcome: "succeeded" | "failed" = "failed";
      try {
        const { callId } = await input.gate.beginCall(reservation.operationId, { model, provider: input.inner.providerName });
        input.stats.operations += 1;
        input.stats.httpCalls += 1;
        try {
          const result = await input.inner.enrich({ contacts: fresh });
          await input.gate.endCall(callId, { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
          input.stats.tokensIn += result.usage.inputTokens;
          input.stats.tokensOut += result.usage.outputTokens;
          for (const contact of fresh) input.attempted[contact.contactId] = enrichmentInputFingerprint(contact);
          outcome = "succeeded";
          return result;
        } catch (error) {
          await input.gate.endCall(callId, null).catch(() => undefined);
          throw error;
        }
      } finally {
        await input.gate.finish(reservation.operationId, outcome);
      }
    },
  };
}

async function runEnrichmentStage(
  actorId: string,
  options: NetworkAnalysisBackfillOptions,
  deps: NetworkAnalysisBackfillDeps,
  gate: SystemBudgetGate,
  checkpoint: BackfillCheckpoint,
): Promise<{ report: StageReport; touched: string[] }> {
  const records = await deps.enrichment.listRecords(actorId);
  const attempted = (checkpoint.enrichmentAttempted[actorId] ??= {});
  const stats = { batchesIfEnabled: 0, candidates: 0, httpCalls: 0, operations: 0, skippedAttempted: 0, stopped: false, tokensIn: 0, tokensOut: 0 };
  const enricher = createBackfillEnricher({ actorId, apply: options.apply, attempted, gate, inner: deps.enrichment.enricher, sleep: deps.sleep, sleepMs: options.sleepMs, stats });
  const plan = await buildContactEnrichmentBackfillPlan({
    appliedAt: deps.now().toISOString(),
    // 预算由包装层控制；这里的上限只防失控。
    enricher,
    maxCalls: 10_000,
    minIntervalMs: 0,
    records,
    // 两批之间的间隔由包装层按 --sleep-ms 控制（只在真的发请求时等待）。
    sleep: async () => undefined,
    workspaceId: deps.enrichment.workspaceId,
  });
  let writes = 0;
  let applyResult: EnrichmentBackfillApplyResult | null = null;
  if (options.apply && plan.entries.length) {
    applyResult = await deps.enrichment.apply(plan);
    writes = applyResult.applied;
  }
  const report: StageReport = {
    aiHttpCalls: stats.httpCalls,
    aiOperations: stats.operations,
    contacts: plan.entries.length,
    detail: {
      aiCandidates: stats.candidates,
      // 生产预估用：按文字补全开启时会发的 HTTP 次数（本次没开时 aiHttpCalls 为 0）。
      aiHttpCallsIfEnabled: stats.batchesIfEnabled,
      aiSkippedAlreadyAttempted: stats.skippedAttempted,
      aiValues: plan.counts.aiValues,
      apply: applyResult,
      cardValues: plan.counts.cardValues,
      enricher: deps.enrichment.enricher ? deps.enrichment.enricher.providerName : "skipped",
      provenanceMarks: plan.counts.provenanceMarks,
      records: records.length,
      tokens: { input: stats.tokensIn, output: stats.tokensOut },
    },
    stage: "enrichment",
    writes,
  };
  if (stats.stopped) throw Object.assign(new StopAtLimit("enrichment"), { report });
  return { report, touched: plan.entries.map((entry) => entry.recordId) };
}

async function runStrengthStage(actorId: string, options: NetworkAnalysisBackfillOptions, deps: NetworkAnalysisBackfillDeps, enrichmentWillWrite: boolean): Promise<StageReport> {
  const now = deps.now();
  if (!options.apply) {
    const fresh = await deps.strength.isFresh(actorId, now);
    return { aiHttpCalls: 0, aiOperations: 0, contacts: 0, detail: { wouldRecompute: !fresh || enrichmentWillWrite }, stage: "strength", writes: 0 };
  }
  const status = await deps.strength.ensure(actorId, now);
  return { aiHttpCalls: 0, aiOperations: 0, contacts: 0, detail: { status }, stage: "strength", writes: status === "recomputed" ? 1 : 0 };
}

async function runInsightStage(
  actorId: string,
  options: NetworkAnalysisBackfillOptions,
  deps: NetworkAnalysisBackfillDeps,
  gate: SystemBudgetGate,
  enrichmentTouched: readonly string[],
): Promise<StageReport> {
  const pending = await deps.insights.listPending(actorId);
  const hasGoal = await deps.insights.hasGoal(actorId);
  if (!options.apply) {
    const queue = new Set([...pending.missing, ...pending.dirty, ...enrichmentTouched]);
    const batches = Math.ceil(queue.size / options.batchSize);
    const billable = hasGoal && deps.insights.billable ? batches : 0;
    return {
      aiHttpCalls: billable,
      aiOperations: billable,
      contacts: queue.size,
      detail: { aiHttpCallsIfBillable: hasGoal ? batches : 0, dirty: pending.dirty.length, enrichmentTouched: enrichmentTouched.length, hasGoal, missing: pending.missing.length, note: "upper bound: unchanged rows cost 0 calls" },
      stage: "insights",
      writes: 0,
    };
  }
  let writes = 0;
  if (pending.missing.length) writes += await deps.insights.markMissing(actorId, pending.missing, deps.now());
  const queue = pending.missing.length ? (await deps.insights.listPending(actorId)).dirty : pending.dirty;
  const outcomes: Record<string, number> = {};
  const before = { calls: gate.httpCalls(), operations: gate.operations() };
  let processed = 0;
  for (const batch of chunk(queue, options.batchSize)) {
    if (hasGoal && deps.insights.billable && gate.remaining() < 1) {
      throw Object.assign(new StopAtLimit("insights"), {
        report: insightReport(actorId, queue.length, processed, gate, before, writes, outcomes),
      });
    }
    if (hasGoal && deps.insights.billable && processed > 0) await deps.sleep(options.sleepMs);
    const outcome = await deps.insights.processBatch(actorId, batch, gate, deps.now());
    outcomes[outcome.status] = (outcomes[outcome.status] ?? 0) + 1;
    writes += outcome.writes;
    processed += batch.length;
  }
  return insightReport(actorId, queue.length, processed, gate, before, writes, outcomes);
}

function insightReport(
  _actorId: string,
  queued: number,
  processed: number,
  gate: SystemBudgetGate,
  before: { calls: number; operations: number },
  writes: number,
  outcomes: Record<string, number>,
): StageReport {
  return {
    aiHttpCalls: gate.httpCalls() - before.calls,
    aiOperations: gate.operations() - before.operations,
    contacts: processed,
    detail: { outcomes, queued },
    stage: "insights",
    writes,
  };
}

async function runSnapshotStage(
  actorId: string,
  options: NetworkAnalysisBackfillOptions,
  deps: NetworkAnalysisBackfillDeps,
  gate: SystemBudgetGate,
  earlierStagesWillChangeData: boolean,
): Promise<StageReport> {
  const evaluation = await deps.snapshot.evaluate(actorId);
  const needs = evaluation.kind === "auto" || evaluation.kind === "stale";
  if (!options.apply) {
    const ifBillable = evaluation.kind !== "insufficient" && (needs || earlierStagesWillChangeData) ? 1 : 0;
    const predicted = deps.snapshot.billable ? ifBillable : 0;
    return { aiHttpCalls: predicted, aiOperations: predicted, contacts: 0, detail: { aiHttpCallsIfBillable: ifBillable, decision: evaluation.kind, earlierStagesWillChangeData }, stage: "snapshot", writes: 0 };
  }
  if (!needs) return { aiHttpCalls: 0, aiOperations: 0, contacts: 0, detail: { decision: evaluation.kind }, stage: "snapshot", writes: 0 };
  if (deps.snapshot.billable && gate.remaining() < 1) {
    throw Object.assign(new StopAtLimit("snapshot"), {
      report: { aiHttpCalls: 0, aiOperations: 0, contacts: 0, detail: { decision: evaluation.kind, stoppedAtLimit: true }, stage: "snapshot", writes: 0 } satisfies StageReport,
    });
  }
  const before = { calls: gate.httpCalls(), operations: gate.operations() };
  const reservation = await gate.reserve({
    actorId,
    idempotencyKey: `backfill:snapshot:${actorId}:${evaluation.sourceDataVersion.slice(0, 64)}`,
    now: deps.now(),
    pool: "system",
    purpose: "snapshot",
    trigger: "auto",
  });
  if (reservation.ok !== true) throw new Error("BACKFILL_LEDGER_UNAVAILABLE: the AI usage ledger refused the system reservation.");
  if (!reservation.owner) {
    return { aiHttpCalls: 0, aiOperations: 0, contacts: 0, detail: { decision: evaluation.kind, replayed: reservation.status }, stage: "snapshot", writes: 0 };
  }
  let written = false;
  try {
    const result = await deps.snapshot.generate(actorId, { now: deps.now(), operationId: reservation.operationId, trigger: evaluation.trigger ?? "threshold" }, gate);
    written = result.written;
  } finally {
    await gate.finish(reservation.operationId, written ? "succeeded" : "failed");
  }
  return {
    aiHttpCalls: gate.httpCalls() - before.calls,
    aiOperations: gate.operations() - before.operations,
    contacts: 0,
    detail: { decision: evaluation.kind, trigger: evaluation.trigger, written },
    stage: "snapshot",
    writes: written ? 1 : 0,
  };
}

/**
 * 按 actor 串行、按阶段顺序执行。预演：只读，输出每阶段将处理的人数与预计 AI 操作数／HTTP 数。
 * 执行：到 `--max-ai-calls` 即停，把停点写进检查点；续跑时重新从第一位 actor 判定（已完成的阶段 0 写 0 调用）。
 */
export async function runNetworkAnalysisBackfill(
  options: NetworkAnalysisBackfillOptions,
  deps: NetworkAnalysisBackfillDeps,
  ledger: AiQuotaGate,
): Promise<NetworkAnalysisBackfillResult> {
  validateBackfillOptions(options);
  const checkpoint = deps.checkpoint.load();
  const gate = createSystemBudgetGate(ledger, options.apply ? options.maxAiCalls : 0);
  const startedAt = deps.now().toISOString();
  const actors: ActorReport[] = [];
  let stoppedAt: NetworkAnalysisBackfillResult["stoppedAt"] = null;
  try {
    for (const actorId of options.actorIds) {
      const report: ActorReport = { actorId, stages: [] };
      actors.push(report);
      try {
        const enrichment = await runEnrichmentStage(actorId, options, deps, gate, checkpoint);
        report.stages.push(enrichment.report);
        const enrichmentWillWrite = enrichment.report.contacts > 0;
        report.stages.push(await runStrengthStage(actorId, options, deps, enrichmentWillWrite));
        const insights = await runInsightStage(actorId, options, deps, gate, options.apply ? [] : enrichment.touched);
        report.stages.push(insights);
        const strengthWouldChange = report.stages[1]!.detail.wouldRecompute === true;
        report.stages.push(await runSnapshotStage(actorId, options, deps, gate, enrichmentWillWrite || strengthWouldChange));
      } catch (error) {
        if (!(error instanceof StopAtLimit)) throw error;
        const partial = (error as StopAtLimit & { report?: StageReport }).report;
        if (partial) report.stages.push(partial);
        stoppedAt = { actorId, stage: error.stage };
        deps.log(`stopped at --max-ai-calls (${options.maxAiCalls}) in ${error.stage} for ${actorId}; rerun to resume from the checkpoint.`);
        break;
      }
    }
  } finally {
    if (options.apply) {
      checkpoint.httpCallsTotal += gate.httpCalls();
      checkpoint.stoppedAt = stoppedAt ? { ...stoppedAt, at: deps.now().toISOString() } : null;
    }
    checkpoint.runs.push({ httpCalls: gate.httpCalls(), mode: options.apply ? "apply" : "dry-run", startedAt, status: stoppedAt ? "stopped_at_limit" : "completed" });
    // 预演也只写仓库外的检查点文件（记录运行），不写库。
    deps.checkpoint.save(checkpoint);
  }
  const totals = actors.flatMap((actor) => actor.stages).reduce(
    (sum, stage) => ({ aiHttpCalls: sum.aiHttpCalls + stage.aiHttpCalls, aiOperations: sum.aiOperations + stage.aiOperations, writes: sum.writes + stage.writes }),
    { aiHttpCalls: 0, aiOperations: 0, writes: 0 },
  );
  return { actors, mode: options.apply ? "apply" : "dry-run", status: stoppedAt ? "stopped_at_limit" : "completed", stoppedAt, totals };
}

/* ── CLI（真实依赖装配） ─────────────────────────────────────────────── */

function flag(args: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (!hit) return null;
  return hit.startsWith(prefix) ? hit.slice(prefix.length) : "";
}

export interface ParsedBackfillArgs {
  emails: string[];
  actorIds: string[];
  apply: boolean;
  maxAiCalls: number;
  batchSize: number;
  sleepMs: number;
  checkpoint: string | null;
  mockAi: boolean;
}

export function parseBackfillArgs(args: readonly string[]): ParsedBackfillArgs {
  const known = new Set(["email", "actor", "apply", "max-ai-calls", "batch-size", "sleep-ms", "checkpoint", "mock-ai"]);
  const unknown = args.filter((arg) => !known.has(arg.replace(/^--/, "").split("=")[0]!));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  const max = flag(args, "max-ai-calls");
  if (max === null || max === "") throw new Error("BACKFILL_REFUSED: --max-ai-calls=<n> is required.");
  const list = (value: string | null) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    actorIds: list(flag(args, "actor")),
    apply: flag(args, "apply") !== null,
    batchSize: Number(flag(args, "batch-size") ?? BACKFILL_MAX_BATCH_SIZE),
    checkpoint: flag(args, "checkpoint"),
    emails: list(flag(args, "email")),
    maxAiCalls: Number(max),
    mockAi: flag(args, "mock-ai") !== null,
    sleepMs: Number(flag(args, "sleep-ms") ?? BACKFILL_MIN_SLEEP_MS),
  };
}

/** 检查点必须在仓库外（RULES §6：证据与运行状态不进仓库）。 */
export function assertCheckpointOutsideRepository(file: string, repositoryRoot: string): string {
  const resolved = path.resolve(file);
  const root = path.resolve(repositoryRoot);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) throw new Error("BACKFILL_REFUSED: the checkpoint must live outside the repository.");
  return resolved;
}

async function main(): Promise<void> {
  const args = parseBackfillArgs(process.argv.slice(2));
  const { loadLocalEnv } = await import("./load-local-env");
  loadLocalEnv();
  // 目标库三重断言（本机 host、验收库名、验收 workspace）：不是本机验收库直接拒绝，不连库。
  const { assertVerifyDatabaseTarget, VERIFY_EXPECTED_DATABASE_NAME } = await import("./lib/verify-database-target");
  const target = assertVerifyDatabaseTarget();
  if (args.mockAi) {
    process.env.ORBIT_CONTACT_INSIGHT_GENERATOR = "mock";
    process.env.ORBIT_NETWORK_ANALYSIS_GENERATOR = "mock";
  }

  const [
    { createTransactionalPostgresClient },
    { createPostgresAiUsageLedger },
    { applyContactEnrichmentBackfillPlan },
    { createConfiguredTextEnricher },
    { createPostgresRelationshipStrengthStore, ensureRelationshipStrengths, relationshipStrengthTokyoDate },
    { RELATIONSHIP_STRENGTH_RULES },
    { createContactInsightsRuntime },
    { markContactInsightsDirty },
    { CONTACT_INSIGHT_LEASE_MS, prepareInsightGeneration, executeInsightGeneration },
    { createNetworkAnalysisRuntime, readSnapshotProfile },
    { createNetworkSnapshotService },
    { createPostgresSnapshotInputSource },
    { createSnapshotSourceVersionReader },
    { readCurrentPlanForSnapshot },
    { confirmedContactPredicate },
    { createStorageAuthUserProvider },
    { createPgLiveRecordSqlClient, createPostgresLiveRecordStore },
    { createConfiguredStorageAccountSessionProvider },
    { resolveCanonicalAccountOwnerId },
  ] = await Promise.all([
    import("../shared/storage/transactional-postgres"),
    import("../features/ai-quota/ledger"),
    import("../features/contacts/enrichment/backfill"),
    import("../features/contacts/enrichment/text-enrichment"),
    import("../features/relationship-strength/read-model"),
    import("../features/relationship-strength/rules"),
    import("../features/contacts/insights/runtime"),
    import("../features/contacts/insights/repository"),
    import("../features/contacts/insights/worker"),
    import("../features/network-analysis/runtime"),
    import("../features/network-analysis/service"),
    import("../features/network-analysis/input-source"),
    import("../features/network-analysis/source-version"),
    import("../features/network-analysis/runtime"),
    import("../features/contacts/confirmed-contact-predicate"),
    import("../features/auth/storage/auth-user-live-record-provider"),
    import("../shared/storage/postgres-live-record-store"),
    import("../features/account/storage/account-live-record-provider"),
    import("../features/account/canonical-account-owner"),
  ]);

  const workspaceId = target.workspaceId;
  const client = createTransactionalPostgresClient({ connectionString: target.connectionString, max: 3 });
  const storeClient = createPgLiveRecordSqlClient({ connectionString: target.connectionString, max: 2 });
  try {
    const actorIds = [...args.actorIds];
    if (args.emails.length) {
      const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: storeClient });
      const users = createStorageAuthUserProvider({ store, workspaceId });
      const accounts = createConfiguredStorageAccountSessionProvider();
      for (const email of args.emails) {
        const user = await users.getUserByEmail(email);
        if (!user) throw new Error(`BACKFILL_REFUSED: no account for ${email}.`);
        actorIds.push(accounts ? resolveCanonicalAccountOwnerId({ authUserId: user.id, graph: await accounts.readAccountSessionGraph({ userId: user.id }) }) : user.id);
      }
    }

    const ledger = createPostgresAiUsageLedger({ client, workspaceId });
    const strengthStore = createPostgresRelationshipStrengthStore({ client, workspaceId });
    const insights = createContactInsightsRuntime({ client, workspaceId });
    const network = createNetworkAnalysisRuntime({ client, workspaceId });
    const enricher = args.mockAi ? null : createConfiguredTextEnricher();
    const checkpointFile = assertCheckpointOutsideRepository(
      args.checkpoint || path.join(os.homedir(), "orbit-backfill-checkpoints", `network-analysis-${VERIFY_EXPECTED_DATABASE_NAME}.json`),
      path.resolve(process.cwd(), "..", ".."),
    );

    const deps: NetworkAnalysisBackfillDeps = {
      checkpoint: createFileCheckpointStore(checkpointFile),
      enrichment: {
        apply: (plan) => applyContactEnrichmentBackfillPlan(client, plan, plan.hash),
        enricher,
        async listRecords(actorId) {
          const rows = await client.query<{ record_id: string; user_id: string | null; updated_at: string | Date; payload: Record<string, unknown> }>(
            `/* network-backfill:enrichment-records */
            select record_id, user_id, updated_at, payload from orbit_records
            where workspace_id = $1 and collection_name = 'contacts' and user_id = $2 and lifecycle_state = 'active' and deleted_at is null
            order by record_id`,
            [workspaceId, actorId],
          );
          return rows.rows.map((row) => ({
            payload: row.payload,
            recordId: row.record_id,
            updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
            userId: row.user_id,
          }));
        },
        workspaceId,
      },
      insights: {
        billable: insights.generator.billable,
        async hasGoal(actorId) {
          return Boolean((await insights.readGoal(actorId))?.trim());
        },
        async listPending(actorId) {
          const rows = await client.query<{ contact_id: string; missing: boolean; dirty: boolean }>(
            `/* network-backfill:insight-pending */
            select c.record_id as contact_id, i.contact_id is null as missing, coalesce(i.dirty_at is not null, false) as dirty
            from orbit_records c
            left join contact_insights i on i.workspace_id = c.workspace_id and i.actor_id = $2 and i.contact_id = c.record_id
            where ${confirmedContactPredicate("c")}
            order by c.record_id`,
            [workspaceId, actorId],
          );
          return {
            dirty: rows.rows.filter((row) => row.dirty).map((row) => row.contact_id),
            missing: rows.rows.filter((row) => row.missing).map((row) => row.contact_id),
          };
        },
        async markMissing(actorId, contactIds, now) {
          let written = 0;
          for (const batch of chunk(contactIds, 500)) {
            written += (await markContactInsightsDirty(client, { actorId, contactIds: batch, now, reason: "manual", workspaceId })).length;
          }
          return written;
        },
        async processBatch(actorId, contactIds, gate, now) {
          const owner = `network-backfill:${randomUUID()}`;
          const rows = [];
          for (const contactId of contactIds) {
            const row = await insights.repository.claimSingle({ actorId, contactId, leaseMs: CONTACT_INSIGHT_LEASE_MS, now, owner });
            if (row) rows.push(row);
          }
          if (!rows.length) return { contacts: 0, status: "not_claimed", writes: 0 };
          const batch = { actorId, claimedAt: now.toISOString(), owner, rows };
          const workerDeps = { ...insights, gate, now: () => now };
          const prepared = await prepareInsightGeneration(workerDeps, batch);
          if (prepared.kind === "no_goal") return { contacts: rows.length, status: "no_goal", writes: rows.length };
          if (prepared.kind === "nothing") return { contacts: rows.length, status: "nothing", writes: prepared.unchanged + prepared.missing };
          const ids = [...prepared.completions.keys()];
          const reservation = await gate.reserve({
            actorId,
            idempotencyKey: `backfill:insight:${actorId}:${prepared.fingerprint}`.slice(0, 300),
            now,
            pool: "system",
            purpose: "insight",
            trigger: "auto",
          });
          if (reservation.ok !== true) {
            await insights.repository.defer({ actorId, contactIds: ids, notBefore: null, now, owner });
            return { contacts: ids.length, status: "unavailable", writes: 0 };
          }
          if (!reservation.owner) {
            await insights.repository.fail({ actorId, claimedAt: batch.claimedAt, code: "DUPLICATE_OPERATION", contactIds: ids, now, owner });
            return { contacts: ids.length, status: "not_owner", writes: ids.length };
          }
          const result = await executeInsightGeneration(workerDeps, batch, prepared, reservation.operationId);
          return { contacts: ids.length, status: result.status, writes: result.written + result.failed };
        },
      },
      log: (line) => console.error(line),
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      snapshot: {
        billable: network.generator.billable,
        async evaluate(actorId) {
          const evaluation = await network.service.evaluate(actorId);
          const decision = evaluation.decision;
          return { kind: decision.kind, sourceDataVersion: evaluation.sourceDataVersion, trigger: decision.kind === "auto" ? decision.trigger : decision.kind === "stale" ? "threshold" : null };
        },
        async generate(actorId, input, gate) {
          // 同一套生成入口，只把账本换成 system 预算闸门（子账计入 --max-ai-calls）。
          const service = createNetworkSnapshotService({
            generator: network.generator,
            inputSource: createPostgresSnapshotInputSource({ client, readCurrentPlan: readCurrentPlanForSnapshot, workspaceId }),
            ledger: gate as unknown as AiUsageLedger,
            readProfile: readSnapshotProfile,
            repository: network.repository,
            versionReader: createSnapshotSourceVersionReader({ client, workspaceId }),
          });
          const result = await service.generateSnapshotNow({ actorId, now: input.now, operationId: input.operationId, origin: "standalone", trigger: input.trigger });
          return { callsResponded: result.callsResponded, written: Boolean(result.snapshot) };
        },
      },
      strength: {
        ensure: async (actorId, now) => (await ensureRelationshipStrengths(actorId, now, { store: strengthStore })).status,
        async isFresh(actorId, now) {
          const { sourceStamp, state } = await strengthStore.readStampAndState(actorId);
          return Boolean(state && state.sourceStamp === sourceStamp && state.tokyoDate === relationshipStrengthTokyoDate(now) && state.rulesVersion === RELATIONSHIP_STRENGTH_RULES.version);
        },
      },
    };

    const result = await runNetworkAnalysisBackfill(
      { actorIds, apply: args.apply, batchSize: args.batchSize, maxAiCalls: args.maxAiCalls, sleepMs: args.sleepMs },
      deps,
      // 预算闸门在 runNetworkAnalysisBackfill 内包这一层（复制账本的全部方法，快照服务拿到的仍是完整的账本形状）。
      ledger,
    );
    console.log(JSON.stringify({
      checkpoint: checkpointFile,
      generators: { enrichment: enricher?.providerName ?? "skipped", insights: insights.generator.provider, snapshot: network.generator.provider },
      target: `localhost/${VERIFY_EXPECTED_DATABASE_NAME} ${workspaceId}`,
      ...result,
    }, null, 2));
  } finally {
    await client.close();
    await storeClient.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : "NETWORK_BACKFILL_FAILED");
    process.exitCode = 1;
  });
}
