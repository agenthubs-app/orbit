/**
 * W0049：「结构」标签的服务端附加读取（分析子页 `/app/contacts/dashboard?tab=structure|opportunities`）。
 *
 * 并行三件事，任一失败只影响自己那块：
 * 1. 快照视图（W0048a `NetworkSnapshotService.readView`，按界面语言请求，ja 请求 en）：只用 state／blocks／
 *    generatedAt／contactCount／freshness.stale；页面请求内不生成、不预留配额（判定为自动重算时只排队，
 *    由维护任务在后台池执行），本加载器不安排 after() 领取；
 * 2. 计划：只经 `PlanService.getCurrent()`（只读事务）+ 纯投影 `planNeedHighlights`；
 *    不调用会写「进入新阶段」的读取入口（R-6）；
 * 3. 依据姓名：诊断与洞察依据里的联系人 id 去重 ≤30，一次按 id 读取，只解析本人范围内的联系人。
 * 30 天变化读 W0047 state 行，由页面在刷新强度读模型时一并拿到（`strengthState`），这里不再读。
 */
import { readEvidenceContactNames } from "../../../../../features/network-analysis/evidence-contacts";
import type { NetworkSnapshotView, SnapshotLanguage } from "../../../../../features/network-analysis/contract";
import { getConfiguredNetworkAnalysisRuntime, readCurrentPlanForSnapshot } from "../../../../../features/network-analysis/runtime";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { RelationshipStrengthState } from "../../../../../shared/contract/relationship-strength";
import {
  evidenceContactIds,
  planNeedHighlights,
  structureSnapshotView,
  type StructureTabExtras,
} from "./structure-tab-model";

export interface StructureTabLoaderDeps {
  /** null = 快照服务不可用（非 live、未配置数据库）。抛错 = 读取失败。 */
  readSnapshot: ((actorId: string, language: SnapshotLanguage) => Promise<NetworkSnapshotView>) | null;
  readPlan: (actorId: string) => Promise<Parameters<typeof planNeedHighlights>[0]>;
  readContactNames: (actorId: string, contactIds: readonly string[]) => Promise<Map<string, string>>;
}

export function defaultStructureTabLoaderDeps(): StructureTabLoaderDeps {
  const runtime = getConfiguredNetworkAnalysisRuntime();
  return {
    readSnapshot: runtime ? (actorId, language) => runtime.service.readView(actorId, language) : null,
    readPlan: (actorId) => readCurrentPlanForSnapshot(actorId),
    readContactNames: runtime
      ? (actorId, ids) => readEvidenceContactNames({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId, ids)
      : async () => new Map(),
  };
}

function log(event: string, actorId: string, error: unknown) {
  console.error(JSON.stringify({ actorId, error: error instanceof Error ? error.name : "unknown", event }));
}

export async function loadStructureTabExtras(
  input: { actorId: string; language: OrbitLanguage; strengthState: RelationshipStrengthState | null },
  deps: StructureTabLoaderDeps = defaultStructureTabLoaderDeps(),
): Promise<StructureTabExtras> {
  const language: SnapshotLanguage = input.language === "zh" ? "zh" : "en";
  const [snapshot, highlights] = await Promise.all([
    deps.readSnapshot
      ? deps.readSnapshot(input.actorId, language).catch((error: unknown) => { log("structure_tab_snapshot_failed", input.actorId, error); return null; })
      : Promise.resolve(null),
    deps.readPlan(input.actorId)
      .then((plan) => planNeedHighlights(plan))
      .catch((error: unknown) => { log("structure_tab_plan_failed", input.actorId, error); return null; }),
  ]);
  const ids = evidenceContactIds(snapshot);
  const names = ids.length > 0
    ? await deps.readContactNames(input.actorId, ids).catch((error: unknown) => { log("structure_tab_evidence_failed", input.actorId, error); return new Map<string, string>(); })
    : new Map<string, string>();
  const history = input.strengthState?.tierCountsAt30d
    ? { tierCountsAt30d: input.strengthState.tierCountsAt30d, earliestCaptureAt: input.strengthState.earliestCaptureAt ?? null }
    : null;
  return { highlights, snapshot: structureSnapshotView(snapshot, names), tierHistory: history };
}
