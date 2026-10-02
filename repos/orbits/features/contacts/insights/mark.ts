/**
 * W0051：写入点的「标待更新」便捷入口（补全、memo 写入路由用）。只写 `contact_insights` 一条 upsert，不调用模型；
 * 失败只记结构化日志，不影响写入本身的成功语义。未配置数据库（mock／本地）时什么也不做。
 */
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { markContactInsightsDirty, markContactInsightsGoalDirty, type ContactInsightDirtyReason } from "./repository";

export interface MarkContactInsightsInput {
  actorId: string;
  contactIds: readonly string[];
  reasons: readonly ContactInsightDirtyReason[];
}

export async function markContactInsightsDirtyBestEffort(input: MarkContactInsightsInput): Promise<void> {
  if (!input.contactIds.length || !input.reasons.length || resolveModuleMode() !== "live") return;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return;
  for (const reason of new Set(input.reasons)) {
    try {
      await markContactInsightsDirty(runtime.client, { actorId: input.actorId, contactIds: input.contactIds, reason, workspaceId: runtime.workspaceId });
    } catch (error) {
      console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_mark_failed", reason }));
    }
  }
}

/** W51-1：重新分析成功后统一标目标哈希不同的行（只写本表）。 */
export async function markContactInsightsGoalDirtyBestEffort(input: { actorId: string; goal: string | null }): Promise<void> {
  if (resolveModuleMode() !== "live") return;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return;
  try {
    await markContactInsightsGoalDirty(runtime.client, { actorId: input.actorId, goal: input.goal, workspaceId: runtime.workspaceId });
  } catch (error) {
    console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_goal_mark_failed" }));
  }
}
