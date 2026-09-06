import { loadEnvConfig } from "@next/env";
import {
  runAgentAutomationsForSignals,
  runDueAgentAutomations,
} from "../features/agent/automations/runner";
import { createAgentAutomationService } from "../features/agent/automations/service-factory";
import { createAgentMemoryService } from "../features/agent/memory/service-factory";
import { createAgentOperationsService } from "../features/agent/operations/service-factory";
import { createOrbitAgentRuntimeService } from "../features/agent/runtime/service-factory";
import { createAgentSignalService } from "../features/agent/signals/service-factory";

import { runAgentWorkerLoop, settleAgentWorkerBatch } from "./agent-worker-loop";

loadEnvConfig(process.cwd());

const pollIntervalMs = Math.max(
  500,
  Number.parseInt(process.env.ORBIT_AGENT_WORKER_POLL_MS ?? "2000", 10) ||
    2_000,
);
const workerId =
  process.env.ORBIT_AGENT_WORKER_ID?.trim() ?? `agent-worker:${process.pid}`;
const signalPollIntervalMs = Math.max(
  10_000,
  Number.parseInt(
    process.env.ORBIT_AGENT_SIGNAL_POLL_MS ?? "60000",
    10,
  ) || 60_000,
);
const heartbeatIntervalMs = Math.max(
  10_000,
  Number.parseInt(
    process.env.ORBIT_AGENT_HEARTBEAT_MS ?? "30000",
    10,
  ) || 30_000,
);

async function main(): Promise<void> {
  const actorId = process.env.ORBIT_AGENT_WORKER_ACTOR_ID?.trim();
  if (!actorId) {
    throw new Error(
      "ORBIT_AGENT_WORKER_ACTOR_ID is required for an actor-scoped worker.",
    );
  }
  const runtime = createOrbitAgentRuntimeService("live", { actorId });
  const automations = createAgentAutomationService({
    actorId,
    mode: "live",
  });
  const memory = createAgentMemoryService({ actorId, mode: "live" });
  const operations = createAgentOperationsService({ actorId });
  const signals = createAgentSignalService({ actorId, mode: "live" });
  let nextSignalRefreshAt = 0;
  let nextHeartbeatAt = 0;

  const stopController = new AbortController();
  const stop = () => stopController.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    await runAgentWorkerLoop({
      signal: stopController.signal,
      pollIntervalMs,
      onFailure: (backoffMs) => {
        process.stderr.write(`${JSON.stringify({ code: "AGENT_WORKER_ITERATION_FAILED", workerId, backoffMs })}\n`);
      },
      runIteration: async () => {
        const iterationStartedAt = Date.now();
        const memoryContext = await memory.context();
        const shouldRefreshSignals =
          iterationStartedAt >= nextSignalRefreshAt;
        if (shouldRefreshSignals) {
          nextSignalRefreshAt =
            iterationStartedAt + signalPollIntervalMs;
        }
        const [outbox, automationRuns, signalAutomationRuns] = await settleAgentWorkerBatch([
          runtime.processOutbox({ limit: 20, workerId }),
          runDueAgentAutomations(
            automations,
            {
              limit: 10,
              now: new Date().toISOString(),
              workerId: `${workerId}:automations`,
            },
            { actorId, memory: memoryContext },
          ),
          shouldRefreshSignals
            ? signals.refresh().then((refresh) =>
                runAgentAutomationsForSignals(
                  automations,
                  refresh.signals.filter((signal) => signal.status === "new"),
                  {
                    actorId,
                    memory: memoryContext,
                    workerId: `${workerId}:signals`,
                  },
                ),
              )
            : Promise.resolve([]),
        ] as const);
        if (
          outbox.processed > 0 ||
          automationRuns.length > 0 ||
          signalAutomationRuns.length > 0
        ) {
          process.stdout.write(
            `${JSON.stringify({
              workerId,
              outbox,
              automationRuns: automationRuns.map((automation) => ({
                automationId: automation.automationId,
                status: automation.lastRun?.status ?? automation.status,
              })),
              signalAutomationRuns: signalAutomationRuns.map(
                (automation) => ({
                  automationId: automation.automationId,
                  status:
                    automation.lastRun?.status ?? automation.status,
                }),
              ),
            })}\n`,
          );
        }
        if (iterationStartedAt >= nextHeartbeatAt) {
          nextHeartbeatAt = iterationStartedAt + heartbeatIntervalMs;
          try {
            await operations.recordHeartbeat({
              automationRuns: automationRuns.length,
              outboxProcessed: outbox.processed,
              recordedAt: new Date().toISOString(),
              signalAutomationRuns: signalAutomationRuns.length,
              workerId,
            });
          } catch {
            process.stderr.write(
              `${JSON.stringify({
                code: "AGENT_HEARTBEAT_FAILED",
                message: "Agent worker heartbeat failed.",
                workerId,
              })}\n`,
            );
          }
        }
      },
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

main().then(() => process.exit(0)).catch(() => {
  // Database/provider errors can contain credentials or personal payloads.
  process.stderr.write("Agent worker could not start. Check required configuration.\n");
  process.exit(1);
});
