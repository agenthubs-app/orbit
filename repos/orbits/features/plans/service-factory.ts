/**
 * 计划存储的模块边界（AGENTS.md「Mock-to-Live Component Replacement」）。
 *
 * - mock：进程内内存仓储（挂在 globalThis 上，dev 热重载后仍在），语义与 live 相同；
 * - hybrid：未注册，按约定回落到 mock；
 * - live：Postgres `plans` / `plan_items` / `plan_log`。数据库未配置时 fail closed，
 *   返回共享的 NOT_IMPLEMENTED 解析失败，不回落到内存。
 *
 * live 不在首次请求时自动建表：表由 `scripts/migrate-web-runtime.ts` 创建
 * （生产库执行需要用户单独授权）。
 *
 * API route 与后续的 route service 只通过 `resolvePlanService` 取服务。
 */
import { Pool } from "pg";
import { meterPostgresPool } from "../../shared/storage/metered-postgres-pool";

import {
  createModuleServiceFactory,
  createNotImplementedFailure,
  type ModuleMode,
  type ServiceResolution,
} from "../../shared/services/module-mode";
import {
  poolTimeoutOptions,
  resolveDatabaseRuntimeProfile,
} from "../../shared/storage/database-runtime-profile";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { createConfiguredEventCoreService } from "../events/core/runtime";
import type { EventCoreService } from "../events/core/service";
import type { PlanReferenceValidator, PlanService } from "./contract";
import {
  createAllowListPlanReferenceValidator,
  createPostgresPlanReferenceValidator,
  type PlanReferenceAllowList,
} from "./reference-validator";
import {
  createMemoryPlanRepository,
  createPostgresPlanRepository,
  type PlanRepository,
} from "./repository";
import { createPlanService } from "./service";

export const PLANS_CAPABILITY_ID = "plans";

interface PlanBackend {
  repository: PlanRepository;
  workspaceId: string;
  referencesFor(actorId: string): PlanReferenceValidator;
  /** R22：live 后端的连接池（v2 计划与 v1 共用，同一把按人的锁）；mock 为 null。 */
  pool: Pool | null;
}

interface PlansGlobal {
  __orbitPlansMockRepository?: PlanRepository;
  __orbitPlansMockAllowList?: PlanReferenceAllowList;
  __orbitPlansLiveBackend?: { key: string; backend: PlanBackend };
}

const plansGlobal = globalThis as typeof globalThis & PlansGlobal;

/** mock 模式没有可核对的联系人／活动数据源，默认接受任意格式合法的 id；测试可换成白名单。 */
const MOCK_ALLOW_ANY: PlanReferenceAllowList = { contactsByActor: "any", eventIds: "any" };

function mockBackend(): PlanBackend {
  plansGlobal.__orbitPlansMockRepository ??= createMemoryPlanRepository();
  return {
    referencesFor: (actorId) =>
      createAllowListPlanReferenceValidator({
        actorId,
        allowList: plansGlobal.__orbitPlansMockAllowList ?? MOCK_ALLOW_ANY,
      }),
    pool: null,
    repository: plansGlobal.__orbitPlansMockRepository,
    workspaceId: "orbit-plans-mock",
  };
}

function liveBackend(): PlanBackend | null {
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) return null;
  const key = JSON.stringify([config.connectionString, config.workspaceId]);
  const cached = plansGlobal.__orbitPlansLiveBackend;
  if (cached?.key === key) return cached.backend;
  const profile = resolveDatabaseRuntimeProfile();
  const pool = meterPostgresPool(new Pool({
    connectionString: config.connectionString,
    max: profile.transactionalPoolMax,
    ...poolTimeoutOptions(profile),
  }));
  let eventCore: EventCoreService | null | undefined;
  const backend: PlanBackend = {
    referencesFor: (actorId) => {
      eventCore ??= createConfiguredEventCoreService();
      return createPostgresPlanReferenceValidator({
        actorId,
        client: pool,
        eventCore,
        workspaceId: config.workspaceId,
      });
    },
    pool,
    repository: createPostgresPlanRepository({ pool }),
    workspaceId: config.workspaceId,
  };
  plansGlobal.__orbitPlansLiveBackend = { backend, key };
  return backend;
}

export const planServiceFactory = createModuleServiceFactory<PlanBackend | null>({
  capabilityId: PLANS_CAPABILITY_ID,
  implementations: {
    live: liveBackend,
    mock: mockBackend,
  },
});

export function resolvePlanService(input: {
  actorId: string;
  mode?: ModuleMode | string;
}): ServiceResolution<PlanService> {
  const resolution = planServiceFactory.create(input.mode);
  if (resolution.success === false) return resolution;
  if (!resolution.service) {
    // live 已注册但数据库未配置：同样按 NOT_IMPLEMENTED fail closed。
    return createNotImplementedFailure(
      PLANS_CAPABILITY_ID,
      resolution.mode,
      planServiceFactory.availableModes,
    );
  }
  return {
    mode: resolution.mode,
    service: createPlanService({
      references: resolution.service.referencesFor(input.actorId),
      repository: resolution.service.repository,
      scope: { actorId: input.actorId, workspaceId: resolution.service.workspaceId },
    }),
    success: true,
  };
}

/**
 * 与 `resolvePlanService` 同一后端、同一 actor 的引用校验器（W0008 生成结果保存前的
 * `validate.ts` 用：`analysis` 里的联系人／活动引用不经过条目校验，需要单独核对）。
 */
export function resolvePlanReferenceValidator(input: {
  actorId: string;
  mode?: ModuleMode | string;
}): ServiceResolution<PlanReferenceValidator> {
  const resolution = planServiceFactory.create(input.mode);
  if (resolution.success === false) return resolution;
  if (!resolution.service) {
    return createNotImplementedFailure(PLANS_CAPABILITY_ID, resolution.mode, planServiceFactory.availableModes);
  }
  return { mode: resolution.mode, service: resolution.service.referencesFor(input.actorId), success: true };
}

/**
 * R22：计划 v2 用的后端（与 v1 同一个 live 连接池、同一个 workspace；mock 时 pool 为 null）。
 * 不改 `resolvePlanService` 的行为，只把同一个后端交给 `features/plans/v2/service-factory.ts`。
 */
export function resolvePlanBackend(mode?: ModuleMode | string): ServiceResolution<{ pool: Pool | null; workspaceId: string; referencesFor(actorId: string): PlanReferenceValidator }> {
  const resolution = planServiceFactory.create(mode);
  if (resolution.success === false) return resolution;
  if (!resolution.service) return createNotImplementedFailure(PLANS_CAPABILITY_ID, resolution.mode, planServiceFactory.availableModes);
  const backend = resolution.service;
  return { mode: resolution.mode, service: { pool: backend.pool, referencesFor: backend.referencesFor, workspaceId: backend.workspaceId }, success: true };
}

export function resetPlansMockRepositoryForTests(): void {
  delete plansGlobal.__orbitPlansMockRepository;
  delete plansGlobal.__orbitPlansMockAllowList;
}

export function setPlansMockReferenceAllowListForTests(allowList: PlanReferenceAllowList): void {
  plansGlobal.__orbitPlansMockAllowList = allowList;
}
