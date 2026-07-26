import { loadEnvConfig } from "@next/env";
import { runDueAgentAutomations } from "../features/agent/automations/runner";
import { createAgentAutomationService } from "../features/agent/automations/service-factory";
import { createAgentMemoryService } from "../features/agent/memory/service-factory";
import { createOrbitAgentRuntimeService } from "../features/agent/runtime/service-factory";

loadEnvConfig(process.cwd());

const pollIntervalMs = Math.max(
  500,
  Number.parseInt(process.env.ORBIT_AGENT_WORKER_POLL_MS ?? "2000", 10) ||
    2_000,
);
const workerId =
  process.env.ORBIT_AGENT_WORKER_ID?.trim() ?? `agent-worker:${process.pid}`;

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

  while (true) {
    const [outbox, automationRuns] = await Promise.all([
      runtime.processOutbox({ limit: 20, workerId }),
      runDueAgentAutomations(
        automations,
        {
          limit: 10,
          now: new Date().toISOString(),
          workerId: `${workerId}:automations`,
        },
        { memory: await memory.context() },
      ),
    ]);
    if (outbox.processed > 0 || automationRuns.length > 0) {
      process.stdout.write(
        `${JSON.stringify({
          workerId,
          outbox,
          automationRuns: automationRuns.map((automation) => ({
            automationId: automation.automationId,
            status: automation.lastRun?.status ?? automation.status,
          })),
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
