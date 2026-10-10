/**
 * W0048a：人脉分析快照的进程级装配。只在模块模式为 live 且配置了数据库时可用；否则返回 null
 * （路由按「服务不可用」返回 unavailable，维护任务 skipped）。表由 `scripts/migrate-web-runtime.ts` 创建，
 * 这里不在首次请求时自动建表（生产迁移另行授权，W48-9）。
 *
 * 生成器：`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek` 且有 `DEEPSEEK_API_KEY` 时用 DeepSeek，否则 mock（生产默认）。
 */
import { createProfileService } from "../profile/service-factory";
import { resolvePlanService } from "../plans/service-factory";
import { mergeActivePlanNeeds, readActiveV2Needs } from "../plans/v2/active-needs";
import { createPostgresAiUsageLedger, type AiUsageLedger } from "../ai-quota/ledger";
import { resolveModuleMode } from "../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createConfiguredDeepseekSnapshotGenerator } from "./deepseek-snapshot-generator";
import { createPostgresSnapshotInputSource } from "./input-source";
import { createPostgresNetworkAnalysisRepository, type NetworkAnalysisRepository } from "./repository";
import { createNetworkSnapshotService, type NetworkSnapshotService, type SnapshotProfile } from "./service";
import { createMockSnapshotGenerator, type NetworkSnapshotGenerator } from "./snapshot-generator";
import { createSnapshotSourceVersionReader } from "./source-version";

export interface NetworkAnalysisRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
  repository: NetworkAnalysisRepository;
  ledger: AiUsageLedger;
  service: NetworkSnapshotService;
  generator: NetworkSnapshotGenerator;
}

/** 本人资料：目标原文 + 交给版本算法的资料段（只读）。读不到时抛错（调用方 fail closed）。 */
export async function readSnapshotProfile(actorId: string): Promise<SnapshotProfile> {
  const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
  if (result.success === false) throw new Error(result.error.message);
  const profile = result.data.profile ?? null;
  return { goal: profile?.relationshipGoal ?? null, profileSection: { profile, state: profile ? "ready" : "empty" } };
}

/**
 * 只读：生效计划（R-6：只经 getCurrent，不经 getCurrentView）。
 * R22（计划 v2.2 DESIGN §3.6）：v1 生效计划 + v2 各目标的人物类型合并（`mergeActivePlanNeeds`），
 * 只有 v2 计划的人也有计划输入。
 */
export async function readCurrentPlanForSnapshot(actorId: string) {
  const resolution = resolvePlanService({ actorId, mode: "live" });
  if (resolution.success === false) return null;
  try {
    const v1 = await resolution.service.getCurrent();
    return mergeActivePlanNeeds(v1, await readActiveV2Needs(actorId, "live"));
  } catch (error) {
    // 计划表缺失（未迁移的库）按无计划处理。
    if ((error as { code?: unknown })?.code === "42P01") return null;
    throw error;
  }
}

export function createNetworkAnalysisRuntime(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  generator?: NetworkSnapshotGenerator;
  readProfile?: (actorId: string) => Promise<SnapshotProfile>;
  readCurrentPlan?: typeof readCurrentPlanForSnapshot;
  scheduleWorker?: (actorId: string) => void;
  now?: () => Date;
}): NetworkAnalysisRuntime {
  const { client, workspaceId } = input;
  const repository = createPostgresNetworkAnalysisRepository({ client, workspaceId });
  const ledger = createPostgresAiUsageLedger({ client, workspaceId });
  const generator = input.generator ?? createConfiguredDeepseekSnapshotGenerator() ?? createMockSnapshotGenerator();
  const service = createNetworkSnapshotService({
    generator,
    inputSource: createPostgresSnapshotInputSource({ client, readCurrentPlan: input.readCurrentPlan ?? readCurrentPlanForSnapshot, workspaceId }),
    ledger,
    now: input.now,
    readProfile: input.readProfile ?? readSnapshotProfile,
    repository,
    scheduleWorker: input.scheduleWorker,
    versionReader: createSnapshotSourceVersionReader({ client, workspaceId }),
  });
  return { client, generator, ledger, repository, service, workspaceId };
}

export function getConfiguredNetworkAnalysisRuntime(options: { scheduleWorker?: (actorId: string) => void } = {}): NetworkAnalysisRuntime | null {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  return createNetworkAnalysisRuntime({ client: runtime.client, scheduleWorker: options.scheduleWorker, workspaceId: runtime.workspaceId });
}
