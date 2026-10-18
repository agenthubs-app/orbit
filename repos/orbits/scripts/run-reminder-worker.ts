import { pathToFileURL } from "node:url";

import { runNotificationDeliveryPass, type NotificationDeliveryPassResult } from "../features/notifications/delivery-pass";
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

export async function runReminderWorkerCycle<T>(input:{typedPass:()=>Promise<unknown>;legacyDispatch:()=>Promise<T>}):Promise<T>{
  // The legacy dispatcher checks notificationCutover before every actor. It
  // must never see an opted-in actor before the typed pass has set that gate.
  await input.typedPass();
  return input.legacyDispatch();
}

export async function runReminderWorker(command: ReminderWorkerCommand): Promise<void> {
  loadLocalEnv();
  const service = createConfiguredReminderPlanService();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    do {
      const startedAt = new Date().toISOString();
      let typed:NotificationDeliveryPassResult|undefined;
      const result = await runReminderWorkerCycle({
        typedPass:async()=>{typed=await runNotificationDeliveryPass({now:startedAt,workerId:`reminder:${startedAt}`});},
        // A missed cutover may delay a legacy reminder but cannot bypass the
        // shared cap or send an unaccounted push.
        legacyDispatch:()=>service.dispatchDue({now:startedAt,provider:{async send(){throw new Error('Legacy external reminder sends are disabled');}}}),
      });
      console.log(JSON.stringify({ startedAt, typed, ...result }));
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
