import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { Pool } from "pg";

import { withCanonicalMembershipMigrationSnapshot } from "../canonical-migration/snapshot-runner";
import { applyProfileContractRepair } from "./apply-repository";
import type { ApplyProfileContractRepairResult } from "./apply-contract";
import { type ProfileContractRepairPlan } from "./contract";
import { parseProfileContractRepairOperatorCommand } from "./operator-command";
import { parseProfileContractRepairOperatorManifest, type ProfileContractRepairOperatorManifest } from "./operator-manifest";
import { buildProfileContractRepairPlan } from "./planner";
import { readProfileContractRepairSource } from "./source-reader";

export const PROFILE_CONTRACT_REPAIR_OPERATOR_FAILED =
  "PROFILE_CONTRACT_REPAIR_OPERATOR_FAILED" as const;

export class ProfileContractRepairOperatorError extends Error {
  constructor(readonly code = PROFILE_CONTRACT_REPAIR_OPERATOR_FAILED) {
    super("Profile contract repair operator operation failed.");
    this.name = "ProfileContractRepairOperatorError";
  }
}

export interface ProfileContractRepairOperatorConfig {
  readonly connectionString: string;
  readonly workspaceId: string;
}

export type ProfileContractRepairOperatorResult = Readonly<{
  applyEligible: boolean;
  blockerCodes: readonly string[];
  diagnosticHash: string;
  eventCount: number;
  events: readonly Readonly<{ eventId: string; inventoryHash: string; targetCount: number; targetsHash: string }>[];
  manifestHash: string;
  mode: "dry-run";
  planHash: string | null;
  targetCount: number;
}> | Readonly<ApplyProfileContractRepairResult & { manifestHash: string; mode: "apply" }>;

type Snapshot = Parameters<typeof readProfileContractRepairSource>[0]["snapshot"];

export interface ProfileContractRepairOperatorDependencies {
  readonly apply?: (input: unknown) => Promise<ApplyProfileContractRepairResult>;
  readonly buildPlan?: (source: unknown) => ProfileContractRepairPlan;
  readonly readManifest?: (path: string) => Promise<ProfileContractRepairOperatorManifest>;
  readonly readSource?: (input: { snapshot: Snapshot; workspaceId: string }) => Promise<unknown>;
  readonly readiness?: (connectionString: string) => Promise<void>;
  readonly withSnapshot?: <T>(input: { connectionString: string; isolation?: "repeatable read" | "serializable"; operation: (snapshot: Snapshot) => Promise<T> }) => Promise<T>;
}

function fail(): never { throw new ProfileContractRepairOperatorError(); }

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
  return Object.freeze(value);
}

interface OperatorManifestFileSnapshot {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
}

export function profileContractRepairOperatorFileSnapshotMatches(
  left: OperatorManifestFileSnapshot,
  right: OperatorManifestFileSnapshot,
): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function readExact(
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < bytes.length) {
    const read = await handle.read(bytes, offset, bytes.length - offset, offset);
    if (read.bytesRead === 0) fail();
    offset += read.bytesRead;
  }
  return bytes;
}

/** Reads a reviewed scope manifest without following a path swap or symlink. */
export async function readProfileContractRepairOperatorManifestFile(path: string): Promise<ProfileContractRepairOperatorManifest> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const before = await lstat(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1n || before.size > 65_536n) fail();
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !profileContractRepairOperatorFileSnapshotMatches(before, opened)) fail();
    const bytes = await readExact(handle, Number(before.size));
    const middle = await handle.stat({ bigint: true });
    if (!profileContractRepairOperatorFileSnapshotMatches(opened, middle)) fail();
    const verification = await readExact(handle, Number(before.size));
    const after = await handle.stat({ bigint: true });
    if (
      !profileContractRepairOperatorFileSnapshotMatches(middle, after) ||
      Buffer.compare(bytes, verification) !== 0
    ) fail();
    const parsed = parseProfileContractRepairOperatorManifest(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!("manifestHash" in parsed)) fail();
    return parsed;
  } catch (error) {
    if (error instanceof ProfileContractRepairOperatorError) throw error;
    fail();
  } finally {
    try { await handle?.close(); } catch { /* close is best effort after a read failure */ }
  }
}

async function defaultReadiness(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const result = await pool.query<{ version: unknown; runs: unknown; items: unknown }>(
      `select coalesce(max(version), 0) as version,
        to_regclass('event_ops_data_repair_runs') is not null as runs,
        to_regclass('event_ops_data_repair_items') is not null as items
       from event_ops_schema_migrations`,
    );
    const row = result.rows[0];
    if (!row || Number(row.version) < 11 || row.runs !== true || row.items !== true) fail();
  } catch (error) {
    if (error instanceof ProfileContractRepairOperatorError) throw error;
    fail();
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function scopeMatches(manifest: ProfileContractRepairOperatorManifest, plan: ProfileContractRepairPlan): boolean {
  const events = plan.events.map((event) => event.eventId);
  return events.length === manifest.events.length && events.every((eventId, index) => eventId === manifest.events[index]);
}

function redactedDryRun(plan: ProfileContractRepairPlan, manifestHash: string): ProfileContractRepairOperatorResult {
  return freeze({
    applyEligible: plan.applyEligible,
    blockerCodes: [...new Set(plan.blockers.map((blocker) => blocker.code))].sort(),
    diagnosticHash: plan.diagnosticHash,
    eventCount: plan.eventCount,
    events: plan.events.map((event) => ({ eventId: event.eventId, inventoryHash: event.inventoryHash, targetCount: event.targetCount, targetsHash: event.targetsHash })),
    manifestHash,
    mode: "dry-run" as const,
    planHash: plan.applyPlanHash,
    targetCount: plan.targetCount,
  });
}

export async function runProfileContractRepairOperator(
  argv: unknown,
  config: ProfileContractRepairOperatorConfig,
  dependencies: ProfileContractRepairOperatorDependencies = {},
): Promise<ProfileContractRepairOperatorResult> {
  try {
    if (!Array.isArray(argv) || !config || typeof config.connectionString !== "string" || typeof config.workspaceId !== "string") fail();
    const command = parseProfileContractRepairOperatorCommand(argv as readonly string[]);
    if (command.workspaceId !== config.workspaceId) fail();
    const readManifest = dependencies.readManifest ?? readProfileContractRepairOperatorManifestFile;
    const manifest = await readManifest(command.scopeManifest);
    const withSnapshot = dependencies.withSnapshot ?? withCanonicalMembershipMigrationSnapshot;
    const readSource = dependencies.readSource ?? readProfileContractRepairSource;
    const buildPlan = dependencies.buildPlan ?? buildProfileContractRepairPlan;
    const plan = await withSnapshot({
      connectionString: config.connectionString,
      isolation: "repeatable read",
      operation: async (snapshot) => buildPlan(await readSource({ snapshot, workspaceId: config.workspaceId })),
    });
    if (!scopeMatches(manifest, plan)) fail();
    if (command.mode === "dry-run") return redactedDryRun(plan, manifest.manifestHash);
    await (dependencies.readiness ?? defaultReadiness)(config.connectionString);
    const result = await (dependencies.apply ?? applyProfileContractRepair)({
      connectionString: config.connectionString,
      expectedCount: command.expectedCount,
      expectedPlanHash: command.expectedPlanHash,
      repairId: command.repairId,
      workspaceId: config.workspaceId,
    });
    return freeze({ ...result, manifestHash: manifest.manifestHash, mode: "apply" as const });
  } catch (error) {
    if (error instanceof ProfileContractRepairOperatorError) throw error;
    fail();
  }
}
