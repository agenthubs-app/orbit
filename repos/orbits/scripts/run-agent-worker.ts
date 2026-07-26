import { loadEnvConfig } from "@next/env";
import {
  runAgentAutomationsForSignals,
  runDueAgentAutomations,
} from "../features/agent/automations/runner";
import { createAgentAutomationService } from "../features/agent/automations/service-factory";
import { createAgentMemoryService } from "../features/agent/memory/service-factory";
import { createOrbitAgentRuntimeService } from "../features/agent/runtime/service-factory";
import { createAgentSignalService } from "../features/agent/signals/service-factory";

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
  const signals = createAgentSignalService({ actorId, mode: "live" });
  let nextSignalRefreshAt = 0;

  while (true) {
    const iterationStartedAt = Date.now();
    const memoryContext = await memory.context();
    const shouldRefreshSignals =
      iterationStartedAt >= nextSignalRefreshAt;
    if (shouldRefreshSignals) {
      nextSignalRefreshAt =
        iterationStartedAt + signalPollIntervalMs;
    }
    const [outbox, automationRuns, signalAutomationRuns] = await Promise.all([
      runtime.processOutbox({ limit: 20, workerId }),
      runDueAgentAutomations(
        automations,
        {
          limit: 10,
          now: new Date().toISOString(),
          workerId: `${workerId}:automations`,
        },
        { memory: memoryContext },
      ),
      shouldRefreshSignals
        ? signals.refresh().then((refresh) =>
            runAgentAutomationsForSignals(
              automations,
              refresh.signals.filter((signal) => signal.status === "new"),
              {
                memory: memoryContext,
                workerId: `${workerId}:signals`,
              },
            ),
          )
        : Promise.resolve([]),
    ]);
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
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
