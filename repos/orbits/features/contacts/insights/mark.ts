/**
 * W0051：写入点的「标待更新」便捷入口（补全、memo 写入路由用）。只写 `contact_insights` 一条 upsert，不调用模型；
 * 失败只记结构化日志，不影响写入本身的成功语义。未配置数据库（mock／本地）时什么也不做。
 */
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import {
  insertMissingContactInsightRows,
  markContactInsightsDirty,
  markContactInsightsGoalDirty,
  unblockNoGoalContactInsights,
  type ContactInsightDirtyReason,
} from "./repository";

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
    // W0057（G-2）：失败先重试 1 次再记日志；两次都失败时由维护任务「缺行对账」补行。
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await markContactInsightsDirty(runtime.client, { actorId: input.actorId, contactIds: input.contactIds, reason, workspaceId: runtime.workspaceId });
        break;
      } catch (error) {
        if (attempt === 2) {
          console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_mark_failed", reason }));
        }
      }
    }
  }
}

/**
 * W0057（D59）：重新分析保存后（含 replayed）——①为已确认但没有洞察行的联系人补 pending 行（分页补完）；
 * ②沿用 W51-1 标目标哈希不同的行。两步都幂等，只写本表、不调用模型；失败只记日志。
 */
export async function prepareContactInsightsAfterReanalysisBestEffort(input: { actorId: string; goal: string | null }): Promise<void> {
  if (resolveModuleMode() !== "live") return;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return;
  try {
    await insertMissingContactInsightRows(runtime.client, { actorId: input.actorId, reason: "goal", workspaceId: runtime.workspaceId });
  } catch (error) {
    console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_backfill_failed" }));
  }
  await markContactInsightsGoalDirtyBestEffort(input);
}

/** W0057（W57-2）：目标从空变为非空后解封 blocked_no_goal 行（只写本表）；返回解封的联系人 id。 */
export async function unblockNoGoalContactInsightsBestEffort(input: { actorId: string }): Promise<string[]> {
  if (resolveModuleMode() !== "live") return [];
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return [];
  try {
    return await unblockNoGoalContactInsights(runtime.client, { actorId: input.actorId, workspaceId: runtime.workspaceId });
  } catch (error) {
    console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_unblock_failed" }));
    return [];
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

/**
 * 请求处理器用（W0057）：在响应之外排一次即时生成。`schedule`（`next/server` 的 `after`）不可用（测试、非请求作用域）时
 * **不在请求内同步调用模型**——行已标待更新，交给维护任务；返回 false。
 */
export function scheduleInstantInsightGeneration(
  schedule: (task: () => Promise<void>) => void,
  run: (input: { actorId: string; contactIds?: readonly string[] }) => Promise<unknown>,
  input: { actorId: string; contactIds?: readonly string[] },
): boolean {
  try {
    schedule(async () => {
      try {
        await run(input);
      } catch (error) {
        console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_instant_failed" }));
      }
    });
    return true;
  } catch {
    console.info(JSON.stringify({ actorId: input.actorId, event: "contact_insight_instant_unscheduled" }));
    return false;
  }
}
