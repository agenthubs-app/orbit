import { createOrbitAgentRuntimeService } from "../features/agent/runtime/service-factory";

const pollIntervalMs = Math.max(
  500,
  Number.parseInt(process.env.ORBIT_AGENT_WORKER_POLL_MS ?? "2000", 10) ||
    2_000,
);
const workerId =
  process.env.ORBIT_AGENT_WORKER_ID?.trim() ??
  `agent-worker:${process.pid}`;

async function main(): Promise<void> {
  const runtime = createOrbitAgentRuntimeService("live");

  while (true) {
    const result = await runtime.processOutbox({ limit: 20, workerId });
    if (result.processed > 0) {
      process.stdout.write(`${JSON.stringify({ workerId, ...result })}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
