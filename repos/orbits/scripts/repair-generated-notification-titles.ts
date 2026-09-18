import { pathToFileURL } from "node:url";

import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import {
  applyGeneratedNotificationTitleRepair,
  planGeneratedNotificationTitleRepair,
} from "../shared/storage/generated-notification-title-repair";
import { loadLocalEnv } from "./load-local-env";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const actorId = argumentValue("--actor-id");
  if (!actorId) {
    throw new Error(
      "Usage: npm run db:repair:generated-notification-titles -- --actor-id <account-id> [--apply --expected-count <count> --expected-hash <sha256>]",
    );
  }
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) throw new Error("The configured live store is unavailable.");

  try {
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify(await planGeneratedNotificationTitleRepair({
        actorId,
        store: configured.store,
        workspaceId: configured.workspaceId,
      }), null, 2));
      return;
    }

    const expectedCount = Number(argumentValue("--expected-count"));
    const expectedHash = argumentValue("--expected-hash") ?? "";
    if (!Number.isInteger(expectedCount) || expectedCount < 0 || !/^[a-f0-9]{64}$/u.test(expectedHash)) {
      throw new Error("Apply requires a non-negative --expected-count and a SHA-256 --expected-hash.");
    }
    console.log(JSON.stringify(await applyGeneratedNotificationTitleRepair({
      actorId,
      expectedCount,
      expectedHash,
      store: configured.store,
      workspaceId: configured.workspaceId,
    }), null, 2));
  } finally {
    await configured.client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
