import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { runAgentRunRetention } from "./run-retention";

// Sprint 0111 (AI A4): the one-year run-set retention runs inside the existing
// daily maintenance pass (and its heartbeat). Each pass examines a bounded
// number of expired candidates and stops at the pass deadline; what is left is
// picked up by the next pass. Sets blocked by child rows without the 0103 run
// target are reported as failures so the pass surfaces them.

export interface AgentRunRetentionTaskRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
}

export function createAgentRunRetentionMaintenanceTask(input: {
  resolve?: () => AgentRunRetentionTaskRuntime | null;
  env?: Record<string, string | undefined>;
  maxRunSets?: number;
  batchSize?: number;
} = {}): MaintenanceTask {
  const env = input.env ?? process.env;
  const resolve = input.resolve ?? (() => {
    const runtime = createConfiguredTransactionalPostgresRuntime({ env, max: 2 });
    return runtime ? { client: runtime.client, workspaceId: runtime.workspaceId } : null;
  });
  return {
    name: "agent_run_retention",
    async run({ deadline, now }) {
      const runtime = resolve();
      if (!runtime) return { skipped: "database_unconfigured" };
      const result = await runAgentRunRetention({
        client: runtime.client,
        workspaceId: runtime.workspaceId,
        now: now(),
        clock: now,
        deadline,
        ...(input.maxRunSets ? { maxRunSets: input.maxRunSets } : {}),
        ...(input.batchSize ? { batchSize: input.batchSize } : {}),
      });
      return { ...result, failed: result.failed + result.blockedUnlinked };
    },
  };
}
