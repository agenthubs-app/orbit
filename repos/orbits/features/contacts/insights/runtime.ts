/**
 * W0051：每人洞察的进程级装配。只在模块模式为 live 且配置了数据库时可用；否则返回 null
 * （读取路径显示「暂无洞察」，维护任务 skipped，重新生成 503）。表由 `scripts/migrate-web-runtime.ts` 创建。
 *
 * 生成器：`ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek` 且有 `DEEPSEEK_API_KEY` 时用 DeepSeek，否则 mock（生产默认）。
 * 读取路径（列表、详情、洞察标签、待唤醒）只用 `repository`／`readContactInsightRows`，不 import 生成器与配额。
 */
import { createPostgresAiUsageLedger, type AiUsageLedger } from "../../ai-quota/ledger";
import { readSnapshotProfile } from "../../network-analysis/runtime";
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import { createConfiguredContactInsightGenerator, type ContactInsightGenerator } from "./generator";
import { createPostgresContactInsightInputSource } from "./input-source";
import { createPostgresContactInsightRepository, type ContactInsightRepository } from "./repository";
import type { ContactInsightWorkerDeps } from "./worker";
import { createStorageContactGraphProvider } from "../storage/contact-live-record-provider";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";

export interface ContactInsightsRuntime extends ContactInsightWorkerDeps {
  client: TransactionalPostgresClient;
  workspaceId: string;
  repository: ContactInsightRepository;
  ledger: AiUsageLedger;
}

export async function readContactInsightGoal(actorId: string): Promise<string | null> {
  return (await readSnapshotProfile(actorId)).goal;
}

export function createContactInsightsRuntime(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  generator?: ContactInsightGenerator;
  readGoal?: (actorId: string) => Promise<string | null>;
  now?: () => Date;
}): ContactInsightsRuntime {
  const { client, workspaceId } = input;
  const ledger = createPostgresAiUsageLedger({ client, workspaceId });
  // W0058：推测写回联系人走联系人 provider 的条件更新（与 memo 提取同一写入规则）。
  const contacts = createStorageContactGraphProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId });
  return {
    applyProfileInference: async ({ actorId, contactId, values, at }) => (await contacts.applyContactCardInference?.(contactId, actorId, values, at)) ?? [],
    client,
    gate: ledger,
    generator: input.generator ?? createConfiguredContactInsightGenerator(),
    inputs: createPostgresContactInsightInputSource({ client, workspaceId }),
    ledger,
    now: input.now,
    readGoal: input.readGoal ?? readContactInsightGoal,
    repository: createPostgresContactInsightRepository({ client, workspaceId }),
    workspaceId,
  };
}

export function getConfiguredContactInsightsRuntime(options: { generatorTimeoutMs?: number } = {}): ContactInsightsRuntime | null {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const generator = options.generatorTimeoutMs ? createConfiguredContactInsightGenerator(process.env, { timeoutMs: options.generatorTimeoutMs }) : undefined;
  return createContactInsightsRuntime({ client: runtime.client, generator, workspaceId: runtime.workspaceId });
}
