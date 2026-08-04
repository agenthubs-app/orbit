import { randomUUID } from "node:crypto";

import { processAttendeePostEventAiTask } from "../features/events/post-event-artifact/processor";
import { resolveAttendeePostEventAiProviderConfiguration } from "../features/events/post-event-artifact/provider-config";
import { createAttendeePostEventAiTaskRepository } from "../features/events/post-event-artifact/task-repository";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { loadLocalEnv } from "./load-local-env";
import { abortableWait } from "./abortable-wait";

async function main(): Promise<void> {
  loadLocalEnv();
  const provider = resolveAttendeePostEventAiProviderConfiguration();
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!provider || !configured) throw new Error("Attendee post-event AI worker is unconfigured: database and a real model provider key are required.");
  const repository = createAttendeePostEventAiTaskRepository({ client: configured.client, store: configured.store, workspaceId: configured.workspaceId });
  const workerId = `attendee-post-event-ai:${randomUUID()}`;
  const pollMs = Math.max(250, Number.parseInt(process.env.ORBIT_POST_EVENT_AI_POLL_MS ?? "2000", 10) || 2_000);
  let stopping = false;
  const stopController = new AbortController();
  const stop = () => { stopping = true; stopController.abort(); };
  // Keep these listeners registered until cleanup finishes. The tsx CLI has a
  // hidden signal forwarder that exits with 128+signal when no other listener
  // remains; `once` removes itself before invoking the callback and therefore
  // races that forwarder into exit(143) before our finally block can run.
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let consecutiveFailures = 0;
  process.stdout.write(`${JSON.stringify({ event: "attendee_post_event_ai_worker_started", workerId })}\n`);
  try {
    while (!stopping) {
      try {
        const outcome = await processAttendeePostEventAiTask({ config: provider.config, repository, workerId });
        consecutiveFailures = 0;
        if (outcome !== "empty") process.stdout.write(`${JSON.stringify({ event: "attendee_post_event_ai_worker_task", outcome, workerId })}\n`);
        await abortableWait(outcome === "empty" ? pollMs : Math.min(25, pollMs), stopController.signal);
      } catch (error) {
        consecutiveFailures += 1;
        const backoffMs = Math.min(30_000, pollMs * 2 ** Math.min(5, consecutiveFailures - 1));
        process.stderr.write(`${JSON.stringify({ backoffMs, error: error instanceof Error ? error.message : "Post-event AI worker iteration failed.", event: "attendee_post_event_ai_worker_failed", workerId })}\n`);
        await abortableWait(backoffMs, stopController.signal);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await configured.client.close();
    process.stdout.write(`${JSON.stringify({ event: "attendee_post_event_ai_worker_stopped", workerId })}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
