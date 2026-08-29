import { pathToFileURL } from "node:url";

import { createExpoPushProvider } from "../features/notifications/expo-push-provider";
import { createConfiguredReminderPlanService } from "../features/notifications/reminder-plan-service-factory";
import { loadLocalEnv } from "./load-local-env";

export interface ReminderWorkerCommand {
  intervalMs: number;
  watch: boolean;
}

function argumentValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() || null : null;
}

export function parseReminderWorkerCommand(args: readonly string[]): ReminderWorkerCommand {
  const watch = args.includes("--watch");
  const intervalMs = Number(argumentValue(args, "--interval-ms") ?? 30_000);
  if (!Number.isInteger(intervalMs) || intervalMs < 5_000) {
    throw new Error("--interval-ms must be an integer of at least 5000");
  }
  return { intervalMs, watch };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runReminderWorker(command: ReminderWorkerCommand): Promise<void> {
  loadLocalEnv();
  const service = createConfiguredReminderPlanService();
  const provider = createExpoPushProvider({
    accessToken: process.env.ORBIT_EXPO_PUSH_ACCESS_TOKEN,
  });
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    do {
      const startedAt = new Date().toISOString();
      const result = await service.dispatchDue({ now: startedAt, provider });
      console.log(JSON.stringify({ startedAt, ...result }));
      if (!command.watch || stopping) break;
      await wait(command.intervalMs);
    } while (!stopping);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReminderWorker(parseReminderWorkerCommand(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Reminder worker failed.");
    process.exitCode = 1;
  });
}
