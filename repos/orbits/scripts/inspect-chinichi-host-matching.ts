/**
 * 2026-11-13 read-only diagnostic: the host マッチング tab of the imported 「中日创业交流会」 events
 * answers 500 in production. Runs the same host service read (matching, round 1 and 2) as the
 * organizer for each event and prints the result size or the error message and stack head.
 * Every database connection is opened with default_transaction_read_only=on. No names printed.
 *
 *   npx tsx scripts/inspect-chinichi-host-matching.ts
 */
import { pathToFileURL } from "node:url";

import { loadLocalEnv } from "./load-local-env";
import { TARGETS } from "./fix-chinichi-startup-event-details";

const ORGANIZER = "user_mvsxuw18_e5ofbg";

async function main() {
  loadLocalEnv();
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !/^postgres(ql)?:\/\//u.test(value)) continue;
    const url = new URL(value);
    url.searchParams.set("options", "-c default_transaction_read_only=on");
    process.env[key] = url.toString();
  }
  const { createConfiguredHostLiveService } = await import("../features/events/host/live");
  const service = await createConfiguredHostLiveService();
  if (!service) throw new Error("SERVICE_UNCONFIGURED");
  const out: Record<string, unknown> = {};
  for (const eventId of Object.keys(TARGETS)) {
    for (const round of [1, 2]) {
      try {
        const view = await service.matching(ORGANIZER, eventId, round);
        out[`${eventId.slice(0, 8)}:r${round}`] = { ok: true, state: view.state, tables: view.tables.length, participants: view.participantCount, unplaced: view.unplaced.length };
      } catch (error) {
        const e = error as Error & { code?: string; cause?: unknown };
        out[`${eventId.slice(0, 8)}:r${round}`] = { ok: false, code: e.code ?? null, message: String(e.message).slice(0, 300), stack: String(e.stack ?? "").split("\n").slice(1, 9).map((line) => line.trim()), cause: e.cause instanceof Error ? String(e.cause.message).slice(0, 300) : null };
      }
    }
  }
  console.info(`chinichi-host-matching READ_ONLY ${JSON.stringify(out)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(`chinichi-host-matching FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exit(1);
  });
}
