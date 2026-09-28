/**
 * 人脉需求匹配的进程级装配（RW-11，Sprint W0010）。与计划服务同一个 live 数据库；
 * 只在模块模式为 live 时可用（mock／hybrid 的计划存在内存里，匹配表对不上），
 * 数据库未配置或非 live 时返回 null，调用方按「服务不可用」处理（API 503、维护任务 skipped）。
 *
 * 表由 `scripts/migrate-web-runtime.ts` 创建，这里不在首次请求时自动建表。
 */
import { Pool } from "pg";

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
import type { PlanMatchWorkerDeps } from "./match-worker";
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
  const pool = new Pool({
    connectionString: config.connectionString,
    max: Math.min(3, profile.transactionalPoolMax),
    ...poolTimeoutOptions(profile),
  });
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
