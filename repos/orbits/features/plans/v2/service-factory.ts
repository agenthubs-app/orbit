/**
 * R22：计划 v2 的模块边界（mock / live）。与 v1 共用 `resolvePlanBackend`：live = 同一个 Postgres 连接池与 workspace，
 * 数据库未配置时 fail closed（NOT_IMPLEMENTED）；mock = 进程内内存仓储，每个人第一次访问时装入演示世界的示例计划。
 * 路由只通过 `resolvePlanV2Service` 取服务。
 */
import type { ModuleMode, ServiceResolution } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createPostgresAiUsageLedger } from "../../ai-quota/ledger";
import { resolvePlanBackend } from "../service-factory";
import { demoPlanV2State } from "./mock-seed";
import { demoPlanEventFacts, livePlanEventFacts } from "./event-facts";
import { createLivePlanFlowContext } from "./flow-context";
import { createMemoryPlanV2Repository, createPostgresPlanV2Repository, type MemoryPlanV2Repository, type MemoryPlanV2State } from "./repository";
import { createPlanV2Service, ledgerReviewBudget, type PlanReviewBudgetReader, type PlanV2Service } from "./service";
import type { PlanEventFact } from "./overview";
import type { PlanV2Repository } from "./types";

interface PlansV2Global {
  __orbitPlansV2MockRepository?: MemoryPlanV2Repository;
  __orbitPlansV2MockSeeded?: Set<string>;
  /**
   * 像素门禁的「设计稿示例 fixture」（只在本机 mock 模式，由开发接口 `app/api/dev/plan-design-fixture/route.dev.ts` 写入；
   * 生产构建不收录那个接口，fixture 数据模块也只被它引用）。有值时 mock 仓储用它代替演示世界灌数。
   */
  __orbitPlansV2MockSeedOverride?: Partial<MemoryPlanV2State> | null;
  /** 同上：会える活動的活动事实（mock 写死在 `mock-event-facts.ts`，fixture 可以按画板换）。 */
  __orbitPlansV2MockEventsOverride?: PlanEventFact[] | null;
  /** 设计稿示例 fixture（只在 mock）：概要上要出「完了しましたか？」的 Step（示例数据不必真的达标）。 */
  __orbitPlansV2MockStepSuggestionsOverride?: readonly string[] | null;
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

/**
 * R25 复核 M1：live 下见直的 AI 成本读数（`ai_usage_ledger` 本月 `plan_review` 非 released 行）。
 * 没配置事务连接时为 undefined（只按用户次数显示）。
 */
export function configuredPlanReviewBudget(): PlanReviewBudgetReader | undefined {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return undefined;
  return ledgerReviewBudget(createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }));
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
      repository.seed(scope, plansV2Global.__orbitPlansV2MockSeedOverride ?? demoPlanV2State());
      plansV2Global.__orbitPlansV2MockSeeded.add(input.actorId);
    }
    // 演示世界的「新しく登録」：在内存里加一张联系人卡（mock 不写库；复核 M2 之后建不了联系人会报错，不再静默匿名）。
    const createContact = async ({ name }: { name: string }) => {
      const state = repository.dump(scope);
      const id = `demo-plan-contact-${state.contacts.length + 1}-${Date.now().toString(36)}`;
      repository.seed(scope, { ...state, contacts: [...state.contacts, { id, isOrbitUser: false, lastInteractionAt: null, name, organization: null, role: null }] });
      return id;
    };
    const mockService = createPlanV2Service({ createContact, events: async () => plansV2Global.__orbitPlansV2MockEventsOverride ?? demoPlanEventFacts(), now: input.now, references: referencesFor(input.actorId), repository, sample: true, scope });
    const forced = plansV2Global.__orbitPlansV2MockStepSuggestionsOverride;
    return { mode: backend.mode, service: forced?.length ? withMockStepSuggestions(mockService, forced) : mockService, success: true };
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
      reviewBudget: configuredPlanReviewBudget(),
      scope,
    }),
    success: true,
  };
}

export function resetPlansV2MockRepositoryForTests(): void {
  delete plansV2Global.__orbitPlansV2MockRepository;
  delete plansV2Global.__orbitPlansV2MockSeeded;
}

/**
 * 像素门禁用：换掉 mock 仓储里的演示计划（`null` = 回到演示世界）。清空内存仓储后，下一次读取按新数据灌。
 * 只由开发接口 `app/api/dev/plan-design-fixture/route.dev.ts` 调用（生产构建不收录）；live（有库）时不生效。
 */
export function overridePlansV2MockSeed(state: Partial<MemoryPlanV2State> | null, events: PlanEventFact[] | null = null, stepSuggestions: readonly string[] | null = null): void {
  plansV2Global.__orbitPlansV2MockSeedOverride = state;
  plansV2Global.__orbitPlansV2MockEventsOverride = events;
  plansV2Global.__orbitPlansV2MockStepSuggestionsOverride = stepSuggestions;
  delete plansV2Global.__orbitPlansV2MockRepository;
  delete plansV2Global.__orbitPlansV2MockSeeded;
}

/**
 * mock only (design fixtures): the overview also offers 「完了しましたか？」 for these steps, as the design's
 * example does (web.html #17: Step 3 while the sample score stays 46). Same shape as the rule's suggestion;
 * a step already completed or already suggested is left alone. The live service is never wrapped.
 */
export function withMockStepSuggestions(service: PlanV2Service, stepKeys: readonly string[]): PlanV2Service {
  return {
    ...service,
    async detail(planId) {
      const detail = await service.detail(planId);
      if (!detail) return detail;
      const have = new Set((detail.stepSuggestions ?? []).map((item) => item.stepKey));
      const extra = detail.content.steps
        .filter((step) => stepKeys.includes(step.key) && !step.completedAt && !have.has(step.key))
        .map((step) => ({ evidenceIds: [], question: step.title, stepKey: step.key }));
      return extra.length ? { ...detail, stepSuggestions: [...(detail.stepSuggestions ?? []), ...extra] } : detail;
    },
  };
}
