/**
 * R22：计划 v2 的模块边界（mock / live）。与 v1 共用 `resolvePlanBackend`：live = 同一个 Postgres 连接池与 workspace，
 * 数据库未配置时 fail closed（NOT_IMPLEMENTED）；mock = 进程内内存仓储，每个人第一次访问时装入演示世界的示例计划。
 * 路由只通过 `resolvePlanV2Service` 取服务。
 */
import type { ModuleMode, ServiceResolution } from "../../../shared/services/module-mode";
import { resolvePlanBackend } from "../service-factory";
import { demoPlanV2State } from "./mock-seed";
import { demoPlanEventFacts, livePlanEventFacts } from "./event-facts";
import { createLivePlanFlowContext } from "./flow-context";
import { createMemoryPlanV2Repository, createPostgresPlanV2Repository, type MemoryPlanV2Repository } from "./repository";
import { createPlanV2Service, type PlanV2Service } from "./service";
import type { PlanV2Repository } from "./types";

interface PlansV2Global {
  __orbitPlansV2MockRepository?: MemoryPlanV2Repository;
  __orbitPlansV2MockSeeded?: Set<string>;
  __orbitPlansV2LiveRepository?: { pool: unknown; repository: PlanV2Repository };
}

const plansV2Global = globalThis as typeof globalThis & PlansV2Global;

export interface PlanV2Parts {
  repository: PlanV2Repository;
  scope: { actorId: string; workspaceId: string };
  service: PlanV2Service;
  /** live 时的连接池（R23 生成流程读联系人用）；mock 为 null。 */
  pool: unknown;
}

/** R23：生成流程与 v2 服务必须共用同一个仓储（确定时在同一份数据里建计划）。 */
export function resolvePlanV2Parts(input: { actorId: string; mode?: ModuleMode | string; now?: () => Date }): ServiceResolution<PlanV2Parts> {
  const resolution = resolvePlanV2Service(input);
  if (resolution.success === false) return resolution;
  const backend = resolvePlanBackend(input.mode);
  if (backend.success === false) return backend;
  const { pool, workspaceId } = backend.service;
  const repository = pool ? plansV2Global.__orbitPlansV2LiveRepository!.repository : plansV2Global.__orbitPlansV2MockRepository!;
  return { mode: resolution.mode, service: { pool: pool ?? null, repository, scope: { actorId: input.actorId, workspaceId }, service: resolution.service }, success: true };
}

export function resolvePlanV2Service(input: { actorId: string; mode?: ModuleMode | string; now?: () => Date }): ServiceResolution<PlanV2Service> {
  const backend = resolvePlanBackend(input.mode);
  if (backend.success === false) return backend;
  const { pool, referencesFor, workspaceId } = backend.service;
  const scope = { actorId: input.actorId, workspaceId };
  if (!pool) {
    plansV2Global.__orbitPlansV2MockRepository ??= createMemoryPlanV2Repository();
    plansV2Global.__orbitPlansV2MockSeeded ??= new Set();
    const repository = plansV2Global.__orbitPlansV2MockRepository;
    if (!plansV2Global.__orbitPlansV2MockSeeded.has(input.actorId)) {
      repository.seed(scope, demoPlanV2State());
      plansV2Global.__orbitPlansV2MockSeeded.add(input.actorId);
    }
    return { mode: backend.mode, service: createPlanV2Service({ events: demoPlanEventFacts, now: input.now, references: referencesFor(input.actorId), repository, sample: true, scope }), success: true };
  }
  if (plansV2Global.__orbitPlansV2LiveRepository?.pool !== pool) {
    plansV2Global.__orbitPlansV2LiveRepository = { pool, repository: createPostgresPlanV2Repository({ pool }) };
  }
  return {
    mode: backend.mode,
    service: createPlanV2Service({
      createContact: async ({ name }) => createLivePlanFlowContext({ mode: "live", pool: pool as never, workspaceId }).addContact(input.actorId, { name, relationLabel: "" }),
      events: livePlanEventFacts(),
      now: input.now,
      references: referencesFor(input.actorId),
      repository: plansV2Global.__orbitPlansV2LiveRepository.repository,
      scope,
    }),
    success: true,
  };
}

export function resetPlansV2MockRepositoryForTests(): void {
  delete plansV2Global.__orbitPlansV2MockRepository;
  delete plansV2Global.__orbitPlansV2MockSeeded;
}
