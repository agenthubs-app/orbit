import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import {
  applyPhonewebRegistrationWindowRepair,
  buildPhonewebRegistrationWindowRepairPlan,
  readPhonewebRegistrationWindowRepairSource,
  REPAIR_DATABASE,
  rollbackPhonewebRegistrationWindowRepair,
  type RepairPlan, type RepairReceipt, type RepairSource,
} from "../features/events/registration/phoneweb-registration-window-repair";

export async function runPhonewebRegistrationWindowRepairCli(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    snapshot: { type: "string" }, plan: { type: "string" }, apply: { type: "boolean" },
    rollback: { type: "string" }, "confirm-plan-hash": { type: "string" }, output: { type: "string" },
  } });
  if ((values.apply && values.rollback) || (values.snapshot && (values.apply || values.rollback || values.plan)) ||
      (values.apply && (!values.plan || !values.output || !values["confirm-plan-hash"])) ||
      (values.rollback && (!values.output || !values["confirm-plan-hash"] || values.plan)) ||
      (!values.apply && !values.rollback && (values.plan || values["confirm-plan-hash"]))) {
    throw new Error("Repair invocation is incomplete or contains conflicting modes.");
  }
  const connectionString = process.env.ORBIT_REGISTRATION_REPAIR_URL;
  if (!values.snapshot && !connectionString) throw new Error("Repair requires an explicit connection URL or offline snapshot; no environment file is loaded.");
  let client: ReturnType<typeof createEventOperationsPostgresClient> | undefined;
  let output: number | undefined;
  try {
    if (values.output) {
      if (!path.isAbsolute(values.output)) throw new Error("Repair output must be an explicit absolute path.");
      output = openSync(values.output, "wx", 0o600);
    }
    if (!values.snapshot) {
      const target = new URL(connectionString!);
      const port = target.port || "5432";
      if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== "127.0.0.1" ||
          !["5432", "35434"].includes(port) || target.pathname !== `/${REPAIR_DATABASE}` || target.hash ||
          [...target.searchParams.keys()].some((key) => key !== "options") ||
          (port === "5432" && target.search) ||
          (port === "35434" && (target.username !== "orbit_registration_repair" ||
            (target.search && !/^-c search_path=sprint0064_[a-f0-9]{32},public$/u.test(target.searchParams.get("options") ?? ""))))) {
        throw new Error("Repair connection target is not the approved local database.");
      }
      client = createEventOperationsPostgresClient({ connectionString: connectionString!,
        pool: new Pool({ connectionString: connectionString!, max: 1, options: port === "5432" ? "-c search_path=public" : target.searchParams.get("options") ?? undefined }),
      });
      if (port === "35434") {
        const identity = await client.query<{ actor: string; directory: string; marker: string }>(
          "select current_user as actor,current_setting('data_directory') as directory,(select marker from public.root_sprint0064_test_marker) as marker");
        if (identity.rows.length !== 1 || identity.rows[0]!.actor !== "orbit_registration_repair" ||
            identity.rows[0]!.directory !== "/Volumes/ORICO/Dev/cache/orbit-sprint0064-pg.lQhm4Z/data" ||
            identity.rows[0]!.marker !== "ROOT-owned-0064-lQhm4Z") throw new Error("Repair isolated database identity is not ROOT-attested.");
      }
    }
    let result: unknown;
    if (values.apply) {
      const reviewed = JSON.parse(readFileSync(values.plan!, "utf8"));
      const plan: RepairPlan = reviewed.plan ?? reviewed;
      if (plan.planHash !== values["confirm-plan-hash"]) throw new Error("Repair confirmed plan hash does not match the reviewed preview.");
      result = { mode: "apply", receipt: await applyPhonewebRegistrationWindowRepair(client!, plan) };
    } else if (values.rollback) {
      const reviewed = JSON.parse(readFileSync(values.rollback, "utf8"));
      const receipt: RepairReceipt = reviewed.receipt ?? reviewed;
      if (receipt.plan.planHash !== values["confirm-plan-hash"]) throw new Error("Repair rollback confirmed plan hash does not match.");
      await rollbackPhonewebRegistrationWindowRepair(client!, receipt);
      result = { mode: "rollback", planHash: receipt.plan.planHash, restoredHeads: receipt.plan.changes.map((change) => ({ eventId: change.eventId, head: change.beforeHead })), historyRetained: true };
    } else {
      const source: RepairSource = values.snapshot ? JSON.parse(readFileSync(values.snapshot, "utf8")) : await readPhonewebRegistrationWindowRepairSource(client!);
      const plan = buildPhonewebRegistrationWindowRepairPlan(source);
      result = { mode: "dry-run", lockPolicy: { eventRows: 13, tableLocks: ["event_ops_configuration_heads", "event_ops_configurations", "event_ops_admission_policy_heads"], mode: "SHARE ROW EXCLUSIVE", lockTimeoutMs: 5000, statementTimeoutMs: 30000, failure: "whole transaction rolls back; no hidden retry" }, plan };
    }
    const bytes = JSON.stringify(result, null, 2) + "\n";
    if (output !== undefined) writeSync(output, bytes);
    process.stdout.write(bytes);
  } finally {
    if (output !== undefined) closeSync(output);
    await client?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runPhonewebRegistrationWindowRepairCli().catch((error: unknown) => {
    const message = error instanceof Error && error.message.startsWith("Repair ") ? error.message : "Repair failed; no success is confirmed. Inspect the reviewed target and receipt; do not assume rollback after an output failure.";
    process.stderr.write(message + "\n");
    process.exitCode = 1;
  });
}
