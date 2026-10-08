/**
 * 人脉需求匹配的进程级装配（RW-11，Sprint W0010）。与计划服务同一个 live 数据库；
 * 只在模块模式为 live 时可用（mock／hybrid 的计划存在内存里，匹配表对不上），
 * 数据库未配置或非 live 时返回 null，调用方按「服务不可用」处理（API 503、维护任务 skipped）。
 *
 * 表由 `scripts/migrate-web-runtime.ts` 创建，这里不在首次请求时自动建表。
 */
import { Pool } from "pg";
import { meterPostgresPool } from "../../shared/storage/metered-postgres-pool";

import { resolveModuleMode } from "../../shared/services/module-mode";
import {
  poolTimeoutOptions,
  resolveDatabaseRuntimeProfile,
} from "../../shared/storage/database-runtime-profile";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { createConfiguredPlanAiMatcher } from "./ai-matcher";
import { createPlanMatchingService, type PlanMatchingService } from "./matching-service";
import { createPostgresPlanMatchRepository, type PlanMatchRepository } from "./matching-repository";
import { createPostgresPlanDailyRunStore, type PlanDailyRunStore } from "./maintenance-daily-gate";
import { runPlanSourceMatchJob, type PlanMatchWorkerDeps } from "./match-worker";
import { resolvePlanService } from "./service-factory";

export interface PlanMatchingRuntime {
  repository: PlanMatchRepository;
  /** W0017：计划维护日任务的逐任务、按东京日的持久领取记录（同一个连接池）。 */
  dailyRuns: PlanDailyRunStore;
  worker: PlanMatchWorkerDeps;
  service: PlanMatchingService;
}

interface MatchingGlobal {
  __orbitPlanMatchingRuntime?: { key: string; runtime: PlanMatchingRuntime };
}

const matchingGlobal = globalThis as typeof globalThis & MatchingGlobal;

export function getConfiguredPlanMatchingRuntime(): PlanMatchingRuntime | null {
  if (resolveModuleMode() !== "live") return null;
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) return null;
  const key = JSON.stringify([config.connectionString, config.workspaceId]);
  const cached = matchingGlobal.__orbitPlanMatchingRuntime;
  if (cached?.key === key) return cached.runtime;
  const profile = resolveDatabaseRuntimeProfile();
  const pool = meterPostgresPool(new Pool({
    connectionString: config.connectionString,
    max: Math.min(3, profile.transactionalPoolMax),
    ...poolTimeoutOptions(profile),
  }));
  const repository = createPostgresPlanMatchRepository({ pool, workspaceId: config.workspaceId });
  const worker: PlanMatchWorkerDeps = {
    aiMatcher: createConfiguredPlanAiMatcher(),
    log: (line) => console.info(line),
    repository,
  };
  const service = createPlanMatchingService({
    planServiceFor: (actorId) => {
      const resolution = resolvePlanService({ actorId, mode: "live" });
      if (resolution.success === false) throw new Error(resolution.error.message);
      return resolution.service;
    },
    repository,
    worker,
  });
  const dailyRuns = createPostgresPlanDailyRunStore({ pool, workspaceId: config.workspaceId });
  const runtime: PlanMatchingRuntime = { dailyRuns, repository, service, worker };
  matchingGlobal.__orbitPlanMatchingRuntime = { key, runtime };
  return runtime;
}

/**
 * W0050（W50-2）：计划版本保存成功后（bootstrap／reanalyze 路由，已提交），为这份计划入队 'plan' 匹配任务
 * （幂等、只跑规则层、0 次 AI），并在响应之外尝试领取执行（`after`，不在请求作用域时交给 `plan-match` 维护任务）。
 * 任何失败只记日志，不影响保存结果。
 */
export async function enqueuePlanSourceMatchAfterSave(
  input: { actorId: string; planId: string },
  options: { runtime?: PlanMatchingRuntime | null; after?: (task: () => Promise<void>) => void } = {},
): Promise<void> {
  const runtime = options.runtime === undefined ? getConfiguredPlanMatchingRuntime() : options.runtime;
  if (!runtime?.repository.enqueuePlanJob) return;
  try {
    const result = await runtime.repository.enqueuePlanJob(input);
    if (result.state !== "enqueued" || !options.after) return;
    try {
      options.after(async () => {
        try {
          await runPlanSourceMatchJob(runtime.worker, input);
        } catch (error) {
          console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "plan_match_plan_job_after_failed" }));
        }
      });
    } catch {
      // 不在请求作用域：交给 plan-match 维护任务。
    }
  } catch (error) {
    console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "plan_match_plan_job_enqueue_failed" }));
  }
}
