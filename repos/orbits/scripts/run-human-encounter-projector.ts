import { hostname } from "node:os";

import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresHumanEncounterProjectionRepository } from "../features/encounters/projection-repository";
import { projectPendingHumanEncounters } from "../features/encounters/projector";
import { loadLocalEnv } from "./load-local-env";
import { abortableWait } from "./abortable-wait";

async function main() {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) throw new Error("Human encounter projector requires the live database.");
  const repository = createPostgresHumanEncounterProjectionRepository(runtime);
  const pollMs = Math.max(100, Number(process.env.ORBIT_ENCOUNTER_PROJECTOR_POLL_MS ?? 1_000));
  const workerId = `human-encounter:${hostname()}:${process.pid}`;
  let stopping = false;
  const stopController = new AbortController();
  const stop = () => { stopping = true; stopController.abort(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let failures = 0;
  process.stdout.write(`${JSON.stringify({ event: "human_encounter_projector_started", workerId })}\n`);
  try {
    while (!stopping) {
      try {
        const result = await projectPendingHumanEncounters({ repository, workerId });
        failures = 0;
        const work = result.completed + result.failed + result.retried + result.leaseLost;
        if (work) process.stdout.write(`${JSON.stringify({ event: "human_encounter_projector_drain", workerId, ...result })}\n`);
        await abortableWait(work ? Math.min(25, pollMs) : pollMs, stopController.signal);
      } catch (error) {
        failures += 1;
        const backoffMs = Math.min(30_000, pollMs * 2 ** Math.min(5, failures - 1));
        process.stderr.write(`${JSON.stringify({ backoffMs, error: error instanceof Error ? error.message : "Human encounter projector drain failed.", event: "human_encounter_projector_drain_failed", workerId })}\n`);
        await abortableWait(backoffMs, stopController.signal);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    process.stdout.write(`${JSON.stringify({ event: "human_encounter_projector_stopped", workerId })}\n`);
    await runtime.client.close();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
