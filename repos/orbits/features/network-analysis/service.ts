/**
 * W0048a：人脉分析快照服务（页面视图、同步生成入口、自动路径 worker、手动重新分析）。
 *
 * 结算规则（「谁持有谁结算」，W48-6／R-2／R-3）：
 * - `generateSnapshotNow`：调用方已预留并持有 operationId；本入口**不预留、不 finish**，只在每次 HTTP 前后登记子账；
 * - 自动路径：请求路径只 upsert job（不预留）；取得租约的 worker 重新判定后才向后台池预留一次，并在同一事务把
 *   operation_id 写回 job；所有结束路径都由该 worker 明确结算；
 * - 手动重新分析：路由（`recomputeManually`）预留用户主动池一次并结算一次。
 * 快照重算永不改写计划：只读 `PlanService.getCurrent()`，不调 getCurrentView／enterCurrentPhase 或任何写方法。
 */
import { randomUUID } from "node:crypto";

import { BACKGROUND_POOL_DAILY_LIMIT, MANUAL_REANALYSIS_DAILY_LIMIT, nextTokyoMidnight, USER_POOL_DAILY_LIMIT } from "../ai-quota/constants";
import type { AiQuotaLimit } from "../ai-quota/gate";
import { AiQuotaCallRejectedError, type AiUsageLedger } from "../ai-quota/ledger";
import {
  SNAPSHOT_MIN_CONTACTS,
  type NetworkAnalysisSnapshot,
  type NetworkSnapshotView,
  type SnapshotLanguage,
  type SnapshotOrigin,
  type SnapshotTrigger,
} from "./contract";
import { decideSnapshotRefresh, type SnapshotRefreshDecision } from "./refresh-policy";
import type { NetworkAnalysisRepository, SnapshotJob, SnapshotRefreshState } from "./repository";
import { SnapshotGeneratorError, type NetworkSnapshotGenerator } from "./snapshot-generator";
import type { SnapshotInputSource } from "./input-source";
import { SnapshotValidationError, validateSnapshotOutput } from "./snapshot-validator";
import type { SnapshotSourceVersionReader } from "./source-version";

/** worker 租约：大于单次 HTTP 超时（60 s）加写库余量。 */
export const SNAPSHOT_JOB_LEASE_MS = 180_000;
/** 0 次响应（未发出／无响应）时回 pending 重试的上限。 */
export const SNAPSHOT_JOB_MAX_ATTEMPTS = 3;

export interface SnapshotProfile {
  goal: string | null;
  /** 交给 contactsAnalysisGraphSourceDataVersion 的资料段（{ state, profile }）。 */
  profileSection: unknown;
}

export interface NetworkSnapshotServiceDeps {
  repository: NetworkAnalysisRepository;
  ledger: AiUsageLedger;
  versionReader: SnapshotSourceVersionReader;
  inputSource: SnapshotInputSource;
  generator: NetworkSnapshotGenerator;
  readProfile: (actorId: string) => Promise<SnapshotProfile>;
  now?: () => Date;
  /** 请求路径排队后尝试在响应之外领取（next/server after）；不传则只等维护任务。 */
  scheduleWorker?: (actorId: string) => void;
  log?: (line: Record<string, unknown>) => void;
}

export interface GenerateSnapshotNowInput {
  actorId: string;
  trigger: SnapshotTrigger;
  origin: SnapshotOrigin;
  planId?: string | null;
  /** 调用方已在账本预留并持有的操作（本入口不预留、不结算）。 */
  operationId: string;
  now: Date;
  /** worker 写入时的租约守卫。 */
  leaseOwner?: string;
}

export interface GenerateSnapshotNowResult {
  snapshot: NetworkAnalysisSnapshot | null;
  /** 本次登记的子账里拿到响应的条数（持有者据此结算）。 */
  callsResponded: number;
  error?: "insufficient" | "call_rejected" | "provider_failed" | "invalid_output" | "lease_lost";
}

export type SnapshotWorkerOutcome =
  | { status: "not_claimed" }
  | { status: "skipped"; reason: "fresh" | "insufficient" | "stale" }
  | { status: "deferred"; retryOn: string }
  | { status: "succeeded"; snapshotId: string; version: number }
  | { status: "failed" }
  | { status: "retry"; dropped: boolean }
  | { status: "lease_lost" }
  | { status: "postponed" }
  | { status: "error"; dropped: boolean }
  | { status: "unavailable" };

export type ManualRecomputeOutcome =
  | { status: "succeeded"; snapshot: NetworkAnalysisSnapshot }
  | { status: "failed" }
  | { status: "insufficient" }
  | { status: "limited"; limit: AiQuotaLimit; retryOn?: string }
  /** W0048b review P1：同一幂等键的另一次请求还在生成（本请求不执行、不结算，稍后用同一键重试）。 */
  | { status: "in_progress" }
  | { status: "unavailable" };

export interface NetworkSnapshotService {
  readView(actorId: string, language: SnapshotLanguage): Promise<NetworkSnapshotView>;
  generateSnapshotNow(input: GenerateSnapshotNowInput): Promise<GenerateSnapshotNowResult>;
  runWorker(actorId: string, options?: { owner?: string }): Promise<SnapshotWorkerOutcome>;
  processClaimedJob(job: SnapshotJob, owner: string): Promise<SnapshotWorkerOutcome>;
  recomputeManually(actorId: string, options?: { idempotencyKey?: string }): Promise<ManualRecomputeOutcome>;
  /** 数据变化后（导入、回填）：判定并在自动时只 upsert job（不预留）。 */
  refreshAfterChange(actorId: string): Promise<{ decision: SnapshotRefreshDecision["kind"] }>;
  /** 当前判定（测试与诊断）。 */
  evaluate(actorId: string): Promise<{ decision: SnapshotRefreshDecision; state: SnapshotRefreshState; sourceDataVersion: string; goalDigest: string }>;
}

export function emptyQuotaView(): NetworkSnapshotView["quota"] {
  return {
    background: { limit: BACKGROUND_POOL_DAILY_LIMIT, usedToday: 0 },
    manual: { limit: MANUAL_REANALYSIS_DAILY_LIMIT, usedToday: 0 },
    user: { limit: USER_POOL_DAILY_LIMIT, usedToday: 0 },
  };
}

export function unavailableSnapshotView(): NetworkSnapshotView {
  return {
    blocks: [],
    contactCount: 0,
    freshness: { job: "none", newContactCount: 0, stale: false },
    generatedAt: null,
    quota: emptyQuotaView(),
    state: "unavailable",
  };
}

export function createNetworkSnapshotService(deps: NetworkSnapshotServiceDeps): NetworkSnapshotService {
  const clock = deps.now ?? (() => new Date());
  const log = deps.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));

  async function evaluate(actorId: string) {
    const profile = await deps.readProfile(actorId);
    const [version, state] = await Promise.all([
      deps.versionReader.read({ actorId, goal: profile.goal, profileSection: profile.profileSection, promptVersion: deps.generator.promptVersion }),
      deps.repository.readRefreshState(actorId),
    ]);
    const decision = decideSnapshotRefresh({
      confirmedCount: state.confirmedCount,
      current: { goalDigest: version.goalDigest, sourceDataVersion: version.sourceDataVersion },
      snapshot: state.snapshot,
    });
    return { decision, goal: profile.goal, goalDigest: version.goalDigest, sourceDataVersion: version.sourceDataVersion, state };
  }

  async function generateSnapshotNow(input: GenerateSnapshotNowInput): Promise<GenerateSnapshotNowResult> {
    if (input.origin === "plan" && !input.planId) throw new Error("A plan snapshot needs its planId.");
    const evaluation = await evaluate(input.actorId);
    if (evaluation.state.confirmedCount < SNAPSHOT_MIN_CONTACTS) return { callsResponded: 0, error: "insufficient", snapshot: null };
    const bundle = await deps.inputSource.read({ actorId: input.actorId, goal: evaluation.goal, now: input.now });
    const generator = deps.generator;
    let callId: string | null = null;
    if (generator.billable) {
      try {
        callId = (await deps.ledger.beginCall(input.operationId, { model: generator.model, provider: generator.provider })).callId;
      } catch (error) {
        if (error instanceof AiQuotaCallRejectedError) return { callsResponded: 0, error: "call_rejected", snapshot: null };
        throw error;
      }
    }
    let content: string;
    let responded = 0;
    try {
      const result = await generator.generate(bundle.input);
      content = result.content;
      if (callId) {
        await deps.ledger.endCall(callId, result.usage ?? { inputTokens: 0, outputTokens: 0 });
        responded = 1;
      }
    } catch (error) {
      const usage = error instanceof SnapshotGeneratorError ? error.usage : null;
      if (callId) {
        await deps.ledger.endCall(callId, usage).catch(() => undefined);
        if (usage) responded = 1;
      }
      log({ actorId: input.actorId, code: error instanceof SnapshotGeneratorError ? error.code : "unknown", event: "network_snapshot_generation_failed" });
      const invalid = error instanceof SnapshotGeneratorError && error.code === "INVALID_OUTPUT";
      return { callsResponded: responded, error: invalid ? "invalid_output" : "provider_failed", snapshot: null };
    }
    let blocks;
    try {
      blocks = validateSnapshotOutput(content, bundle.allowed).blocks;
    } catch (error) {
      if (!(error instanceof SnapshotValidationError)) throw error;
      log({ actorId: input.actorId, code: error.code, event: "network_snapshot_invalid_output" });
      return { callsResponded: responded, error: "invalid_output", snapshot: null };
    }
    const snapshot = await deps.repository.writeSnapshot(
      {
        actorId: input.actorId,
        blocks,
        generatedAt: input.now,
        generator: { model: generator.model, promptVersion: generator.promptVersion, provider: generator.provider },
        goalDigest: evaluation.goalDigest,
        includedContactIds: bundle.includedContactIds,
        operationId: input.operationId,
        origin: input.origin,
        planId: input.origin === "plan" ? input.planId ?? null : null,
        sourceDataVersion: evaluation.sourceDataVersion,
        trigger: input.trigger,
      },
      input.leaseOwner ? { leaseOwner: input.leaseOwner } : undefined,
    );
    if (!snapshot) return { callsResponded: responded, error: "lease_lost", snapshot: null };
    return { callsResponded: responded, snapshot };
  }

  /**
   * 取得本 job 要用的操作（R-2，review P1-1）：幂等键固定为 `snapshot:auto:<actorId>:<createdKey>`，一个 job 至多一个操作。
   * - job 上已有操作：仍 reserved 且当前 epoch 没有子账 → 复用；仍有进行中的请求 → 不新预留，job 延后；
   *   已发过 HTTP 且没有进行中的请求（上一个持有者崩溃）→ 代它结算一次（有响应即计次），0 响应则 released；
   * - released 的操作同键重放会重新开启（新 epoch），所以 0 响应的重试仍是同一个操作；已计次（succeeded／failed）
   *   的操作不再发请求，job 结束。
   * 预留与把 operation_id 写回 job 在同一事务。
   */
  async function acquireOperation(job: SnapshotJob, owner: string, now: Date): Promise<
    | { kind: "ready"; operationId: string }
    | { kind: "postponed" }
    | { kind: "deferred"; retryOn: string }
    | { kind: "spent" }
    | { kind: "unavailable" }
    | { kind: "lease_lost" }
  > {
    if (job.operationId) {
      const previous = await deps.ledger.readOperation(job.operationId, { inflightWindowMs: SNAPSHOT_JOB_LEASE_MS });
      if (previous?.status === "reserved") {
        if (previous.inflight > 0) return { kind: "postponed" };
        if (previous.calls === 0) return { kind: "ready", operationId: previous.id };
        await deps.ledger.finish(previous.id, "failed");
      }
    }
    const reservation = await deps.repository.transaction(async (tx) => {
      const result = await deps.ledger.reserveWith(tx, {
        actorId: job.actorId,
        idempotencyKey: `snapshot:auto:${job.actorId}:${job.createdKey}`,
        now,
        pool: "background",
        purpose: "snapshot",
        trigger: "auto",
        // W0048b review P1：job 租约持有者就是这笔操作的所有者（下方仍按子账判定是否已花掉）。
        takeover: true,
      });
      if (result.ok === true && !(await deps.repository.setJobOperation(tx, job.actorId, "snapshot", owner, result.operationId))) {
        throw new LeaseLostError();
      }
      return result;
    }).catch((error) => {
      if (error instanceof LeaseLostError) return null;
      if ((error as { code?: unknown })?.code === "42P01") return { ok: false as const, reason: "disabled" as const };
      throw error;
    });
    if (!reservation) return { kind: "lease_lost" };
    if (reservation.ok !== true) {
      const denial = reservation as { ok: false; reason: "disabled" | "daily_limit"; retryOn?: string };
      return denial.reason === "daily_limit" ? { kind: "deferred", retryOn: denial.retryOn ?? nextTokyoMidnight(now) } : { kind: "unavailable" };
    }
    const operationId = (reservation as { ok: true; operationId: string }).operationId;
    const state = await deps.ledger.readOperation(operationId, { inflightWindowMs: SNAPSHOT_JOB_LEASE_MS });
    // 同键重放拿到的是已计次的操作：这个 job 的一次尝试已经花掉，不再发请求。
    if (!state || state.status !== "reserved" || state.calls > 0) return { kind: "spent" };
    return { kind: "ready", operationId };
  }

  async function processClaimedJob(job: SnapshotJob, owner: string): Promise<SnapshotWorkerOutcome> {
    const now = clock();
    let operationId: string | null = null;
    try {
      const evaluation = await evaluate(job.actorId);
      if (evaluation.decision.kind !== "auto") {
        // 二次判定已不需要生成（fresh／insufficient／stale）：0 次新预留；遗留的操作由本 worker 结算（0 响应 → released）。
        if (job.operationId) {
          const previous = await deps.ledger.readOperation(job.operationId, { inflightWindowMs: SNAPSHOT_JOB_LEASE_MS });
          if (previous?.status === "reserved" && previous.inflight > 0) {
            await deps.repository.postponeJob(job.actorId, "snapshot", owner, new Date(now.getTime() + SNAPSHOT_JOB_LEASE_MS).toISOString());
            return { status: "postponed" };
          }
          await deps.ledger.finish(job.operationId, "failed");
        }
        await deps.repository.deleteJob(job.actorId, "snapshot", owner);
        return { reason: evaluation.decision.kind, status: "skipped" };
      }
      const acquired = await acquireOperation(job, owner, now);
      switch (acquired.kind) {
        case "postponed":
          await deps.repository.postponeJob(job.actorId, "snapshot", owner, new Date(now.getTime() + SNAPSHOT_JOB_LEASE_MS).toISOString());
          return { status: "postponed" };
        case "deferred":
          await deps.repository.deferJob(job.actorId, "snapshot", owner, acquired.retryOn);
          return { retryOn: acquired.retryOn, status: "deferred" };
        case "spent":
          await deps.repository.deleteJob(job.actorId, "snapshot", owner);
          return { status: "failed" };
        case "unavailable":
          await deps.repository.deleteJob(job.actorId, "snapshot", owner);
          return { status: "unavailable" };
        case "lease_lost":
          return { status: "lease_lost" };
        case "ready":
          operationId = acquired.operationId;
      }
      const result = await generateSnapshotNow({ actorId: job.actorId, leaseOwner: owner, now, operationId, origin: "standalone", trigger: evaluation.decision.trigger });
      if (result.error === "lease_lost") {
        // 丢了租约：本 worker 仍是这个操作的持有者，结算一次后停手，不写快照。
        await deps.ledger.finish(operationId, "failed");
        return { status: "lease_lost" };
      }
      if (result.snapshot) {
        await deps.ledger.finish(operationId, "succeeded");
        await deps.repository.deleteJob(job.actorId, "snapshot", owner);
        return { snapshotId: result.snapshot.id, status: "succeeded", version: result.snapshot.version };
      }
      await deps.ledger.finish(operationId, "failed"); // 0 条 responded → released（同键重试会重新开启）。
      if (result.callsResponded > 0) {
        await deps.repository.deleteJob(job.actorId, "snapshot", owner);
        return { status: "failed" };
      }
      const dropped = await deps.repository.releaseJob(job.actorId, "snapshot", owner, SNAPSHOT_JOB_MAX_ATTEMPTS);
      return { dropped, status: "retry" };
    } catch (error) {
      // review P1-2：任何未预期异常（含写库失败）都结算当前操作，并原子地把 attempt_count + 1，到上限删除 job。
      log({ actorId: job.actorId, error: error instanceof Error ? error.name : "unknown", event: "network_snapshot_worker_error" });
      if (operationId) await deps.ledger.finish(operationId, "failed").catch(() => undefined);
      const dropped = await deps.repository.releaseJob(job.actorId, "snapshot", owner, SNAPSHOT_JOB_MAX_ATTEMPTS).catch(() => false);
      return { dropped, status: "error" };
    }
  }

  return {
    evaluate: async (actorId) => {
      const { decision, goalDigest, sourceDataVersion, state } = await evaluate(actorId);
      return { decision, goalDigest, sourceDataVersion, state };
    },
    generateSnapshotNow,
    processClaimedJob,
    async readView(actorId, language) {
      const now = clock();
      const evaluation = await evaluate(actorId);
      const { decision, state } = evaluation;
      let job: NetworkSnapshotView["freshness"]["job"] = "none";
      let retryOn: string | undefined;
      if (state.job) {
        job = state.job.status === "running" ? "running" : state.job.status === "deferred" ? "deferred" : "queued";
        if (state.job.status === "deferred") retryOn = state.job.notBefore;
      }
      if (decision.kind === "auto") {
        if (!state.job) {
          await deps.repository.enqueueSnapshotJob(actorId, decision.trigger, now);
          job = "queued";
        }
        if (job === "queued") deps.scheduleWorker?.(actorId);
      }
      const [view, usage] = await Promise.all([
        state.confirmedCount >= SNAPSHOT_MIN_CONTACTS && state.snapshot ? deps.repository.readView(actorId, language) : Promise.resolve(null),
        deps.ledger.readUsageToday(actorId, now),
      ]);
      const quota = emptyQuotaView();
      quota.manual.usedToday = usage.manual;
      quota.user.usedToday = usage.user;
      quota.background.usedToday = usage.background;
      if (usage.background >= BACKGROUND_POOL_DAILY_LIMIT) quota.background.retryOn = nextTokyoMidnight(now);
      const stale = Boolean(state.snapshot) && (decision.kind === "stale" || decision.kind === "auto");
      return {
        blocks: view?.blocks ?? [],
        contactCount: view?.contactCount ?? 0,
        freshness: { job, newContactCount: state.snapshot?.newContactCount ?? 0, stale, ...(retryOn ? { retryOn } : {}) },
        generatedAt: view?.generatedAt ?? null,
        quota,
        state: state.confirmedCount < SNAPSHOT_MIN_CONTACTS ? "insufficient" : view ? "ready" : "none",
      };
    },
    async refreshAfterChange(actorId) {
      const { decision, state } = await evaluate(actorId);
      if (decision.kind === "auto") {
        if (!state.job) await deps.repository.enqueueSnapshotJob(actorId, decision.trigger, clock());
        deps.scheduleWorker?.(actorId);
      }
      return { decision: decision.kind };
    },
    async runWorker(actorId, options = {}) {
      const owner = options.owner ?? `snapshot-worker:${randomUUID()}`;
      const job = await deps.repository.claimJob(actorId, "snapshot", owner, clock(), SNAPSHOT_JOB_LEASE_MS);
      if (!job) return { status: "not_claimed" };
      return processClaimedJob(job, owner);
    },
    async recomputeManually(actorId, options = {}) {
      const now = clock();
      const state = await deps.repository.readRefreshState(actorId);
      if (state.confirmedCount < SNAPSHOT_MIN_CONTACTS) return { status: "insufficient" };
      const reservation = await deps.ledger.reserve({
        actorId,
        idempotencyKey: options.idempotencyKey ?? `snapshot:manual:${actorId}:${randomUUID()}`,
        now,
        pool: "user",
        purpose: "snapshot",
        trigger: "manual",
      });
      if (reservation.ok !== true) {
        const denial = reservation as Extract<typeof reservation, { ok: false }>;
        if (denial.reason === "disabled") return { status: "unavailable" };
        return { limit: denial.limit ?? "user", retryOn: denial.retryOn, status: "limited" };
      }
      // W0048b review P1：同键重放不转让所有权——进行中的返回 in_progress，已结束的返回原结果，都不再执行或结算。
      if (!reservation.owner) {
        if (reservation.status === "reserved") return { status: "in_progress" };
        if (reservation.status === "failed") return { status: "failed" };
        const current = await deps.repository.getCurrent(actorId);
        return current ? { snapshot: current, status: "succeeded" } : { status: "failed" };
      }
      try {
        const result = await generateSnapshotNow({ actorId, now, operationId: reservation.operationId, origin: "standalone", trigger: "manual" });
        await deps.ledger.finish(reservation.operationId, result.snapshot ? "succeeded" : "failed");
        return result.snapshot ? { snapshot: result.snapshot, status: "succeeded" } : { status: "failed" };
      } catch (error) {
        await deps.ledger.finish(reservation.operationId, "failed").catch(() => undefined);
        throw error;
      }
    },
  };
}

class LeaseLostError extends Error {
  constructor() {
    super("The snapshot job lease was lost before the operation could be recorded.");
    this.name = "LeaseLostError";
  }
}
