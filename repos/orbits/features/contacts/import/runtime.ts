/**
 * W0053：导入服务的进程级装配。只在模块模式为 live 且配置了数据库时可用；否则返回 null（路由 503）。
 * 表由 `scripts/migrate-web-runtime.ts` 创建，这里不在请求里建表。
 *
 * 三层更新入口用 W0048a 的 `runConfiguredNewContactLayers`（补全的模型调用、配额与成本子账都在入口里；
 * 本模块不直接调用模型）。网络分析装配不可用时抛错 → 批次标 retry，由维护任务重试。
 */
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import type { RunNewContactLayersInput } from "../../network-analysis/new-contact-layers";
import { createContactImportService, type ContactImportService } from "./service";

export async function runConfiguredImportLayers(input: RunNewContactLayersInput) {
  const [{ getConfiguredNetworkAnalysisRuntime }, { runConfiguredNewContactLayers }] = await Promise.all([
    import("../../network-analysis/runtime"),
    import("../../network-analysis/layers-runtime"),
  ]);
  const runtime = getConfiguredNetworkAnalysisRuntime();
  const records = createConfiguredPostgresLiveRecordStore();
  if (!runtime || !records) throw new Error("NETWORK_LAYERS_UNAVAILABLE");
  return runConfiguredNewContactLayers(runtime, records.store, input);
}

export function getConfiguredContactImportService(options: { schedule?: (task: () => Promise<void>) => void } = {}): ContactImportService | null {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  return createContactImportService({
    client: runtime.client,
    runLayers: runConfiguredImportLayers,
    schedule: options.schedule,
    workspaceId: runtime.workspaceId,
  });
}

/** 维护任务用：服务 + 连接（后台没有 after()，入口直接 await）。 */
export function getConfiguredContactImportMaintenance() {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const service = createContactImportService({ client: runtime.client, runLayers: runConfiguredImportLayers, workspaceId: runtime.workspaceId });
  return { client: runtime.client, service };
}
