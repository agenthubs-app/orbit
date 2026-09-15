import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { validateIndustrySelection } from "../shared/domain/industries";
import type { TransactionalPostgresClient } from "../shared/storage/transactional-postgres";

interface RecordIdentity {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  userId: string;
}

interface IndustrySelection {
  primaryIndustryId: string;
  secondaryIndustryId: string;
}

interface BackfillTarget extends RecordIdentity {
  personId: string;
  expectedUpdatedAt: string;
  basis: string;
  selection: IndustrySelection;
  paths: string[][];
}

interface SnapshotRecord extends RecordIdentity {
  updatedAt: string;
  lifecycleState: string;
  deletedAt?: string | null;
  payload: Record<string, unknown>;
}

export interface TestIndustryBackfillInput {
  environment: string;
  appliedAt: string;
  targets: BackfillTarget[];
  records: SnapshotRecord[];
}

type Snapshot = Pick<SnapshotRecord, "payload" | "updatedAt">;
type EntryStatus = "already_valid" | "repairable" | "conflict" | "missing_basis";
interface PlanEntry {
  target: BackfillTarget;
  status: EntryStatus;
  before: Snapshot | null;
  after: Snapshot | null;
}

export interface TestIndustryBackfillPlan {
  environment: string;
  appliedAt: string;
  entries: PlanEntry[];
  counts: { total: number; projections: number; alreadyValid: number; repairable: number; conflict: number; missingBasis: number };
  hash: string;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);
}

function recordIdentity(record: RecordIdentity): string {
  return canonicalJson([record.workspaceId, record.collectionName, record.recordId, record.userId]);
}

function industryProjection(payload: Record<string, unknown>, path: string[]): Record<string, unknown> | null {
  let value: unknown = payload;
  for (const key of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return null;
    value = value[key];
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function planHash(plan: Omit<TestIndustryBackfillPlan, "hash">): string {
  return createHash("sha256").update(canonicalJson({ environment: plan.environment, appliedAt: plan.appliedAt, entries: plan.entries, counts: plan.counts })).digest("hex");
}

function validateBackfillInput(input: TestIndustryBackfillInput): void {
  if (!input || typeof input.environment !== "string" || !input.environment.trim() || !Number.isFinite(Date.parse(input.appliedAt))) throw new Error("Explicit environment and appliedAt are required");
  if (!Array.isArray(input.targets) || input.targets.length === 0 || !Array.isArray(input.records)) throw new Error("Explicit targets and snapshot records are required");
  for (const records of [input.targets, input.records]) {
    const seen = new Set<string>();
    for (const record of records) {
      for (const key of ["workspaceId", "collectionName", "recordId", "userId"]) {
        if (typeof record?.[key] !== "string" || !record[key].trim()) throw new Error("Exact record scope is required");
      }
      const id = recordIdentity(record);
      if (seen.has(id)) throw new Error("Duplicate record scope");
      seen.add(id);
    }
  }
  const people = new Map<string, string>();
  for (const target of input.targets) {
    if (typeof target.personId !== "string" || !target.personId.trim() || !Number.isFinite(Date.parse(target.expectedUpdatedAt)) || Date.parse(input.appliedAt) <= Date.parse(target.expectedUpdatedAt)) throw new Error("Person and increasing expected version are required");
    if (!Array.isArray(target.paths) || !target.paths.length || new Set(target.paths.map(path => canonicalJson(path))).size !== target.paths.length) throw new Error("Explicit unique projection paths are required");
    for (const path of target.paths) {
      if (!Array.isArray(path) || path.some(key => typeof key !== "string" || !key || ["__proto__", "prototype", "constructor"].includes(key))) throw new Error("Invalid projection path");
    }
    if (target.basis?.trim() && target.selection?.primaryIndustryId && target.selection?.secondaryIndustryId) {
      const selection = canonicalJson(target.selection);
      if (people.has(target.personId) && people.get(target.personId) !== selection) throw new Error("inconsistent person mapping");
      people.set(target.personId, selection);
    }
  }
}

/** Builds an offline plan only. Snapshot input is not evidence of a live read. */
export function buildTestIndustryBackfillPlan(input: TestIndustryBackfillInput): TestIndustryBackfillPlan {
  validateBackfillInput(input);
  const records = new Map(input.records.map(record => [recordIdentity(record), record]));
  const entries: PlanEntry[] = input.targets.map(source => {
    const target = structuredClone(source);
    const record = records.get(recordIdentity(target));
    const before = record ? structuredClone({ payload: record.payload, updatedAt: record.updatedAt }) : null;
    const entry: PlanEntry = { target, before, after: null, status: "conflict" };
    if (!record || record.lifecycleState !== "active" || record.deletedAt || record.updatedAt !== target.expectedUpdatedAt || !record.payload || Array.isArray(record.payload)) return entry;
    if (typeof target.basis !== "string" || !target.basis.trim() || !target.selection?.primaryIndustryId || !target.selection?.secondaryIndustryId) return { ...entry, status: "missing_basis" };
    if (!validateIndustrySelection(target.selection).valid) return entry;
    const payload = structuredClone(record.payload);
    let changed = false;
    for (const path of target.paths) {
      const projection = industryProjection(payload, path);
      if (!projection) return entry;
      for (const key of ["primaryIndustryId", "secondaryIndustryId"] as const) {
        if (projection[key] != null && projection[key] !== target.selection[key]) return entry;
        if (projection[key] !== target.selection[key]) changed = true;
        projection[key] = target.selection[key];
      }
    }
    return { ...entry, status: changed ? "repairable" : "already_valid", after: { payload, updatedAt: changed ? input.appliedAt : record.updatedAt } };
  });
  const plan = {
    environment: input.environment, appliedAt: input.appliedAt, entries,
    counts: {
      total: entries.length, projections: entries.reduce((sum, entry) => sum + entry.target.paths.length, 0),
      alreadyValid: entries.filter(entry => entry.status === "already_valid").length,
      repairable: entries.filter(entry => entry.status === "repairable").length,
      conflict: entries.filter(entry => entry.status === "conflict").length,
      missingBasis: entries.filter(entry => entry.status === "missing_basis").length,
    },
  };
  return { ...plan, hash: planHash(plan) };
}

/** Caller owns the explicitly approved database connection; this module never resolves env or runs migrations. */
export async function applyTestIndustryBackfillPlan(client: Pick<TransactionalPostgresClient, "transaction">, plan: TestIndustryBackfillPlan, reviewedHash: string) {
  const reviewed = structuredClone(plan);
  if (reviewedHash !== reviewed.hash || planHash(reviewed) !== reviewedHash) throw new Error("Unchanged reviewed plan hash required");
  if (reviewed.entries.some(entry => !entry.before || !entry.after || entry.status === "conflict" || entry.status === "missing_basis")) throw new Error("Plan has unresolved targets");
  return client.transaction(async sql => {
    let applied = 0;
    let alreadyValid = 0;
    for (const entry of reviewed.entries) {
      const { workspaceId, collectionName, recordId, userId } = entry.target;
      const identity = [workspaceId, collectionName, recordId, userId];
      const scope = "workspace_id = $1 and collection_name = $2 and record_id = $3 and user_id = $4";
      const active = "lifecycle_state = 'active' and deleted_at is null";
      const current = await sql.query<{ payload: Record<string, unknown>; updated_at: string | Date }>(`select payload, updated_at from orbit_records where ${scope} and ${active} for update`, identity);
      const row = current.rows[0];
      const version = row?.updated_at instanceof Date ? row.updated_at.toISOString() : row?.updated_at;
      if (current.rows.length !== 1) throw new Error("Backfill record conflict");
      if (version === entry.after.updatedAt && isDeepStrictEqual(row.payload, entry.after.payload)) { alreadyValid++; continue; }
      if (version !== entry.before.updatedAt || !isDeepStrictEqual(row.payload, entry.before.payload)) throw new Error("Backfill record conflict");
      const updated = await sql.query<{ payload: Record<string, unknown>; updated_at: string | Date }>(
        `update orbit_records set payload = $5::jsonb, updated_at = $6::timestamptz where ${scope} and ${active} and updated_at = $7::timestamptz and payload = $8::jsonb returning payload, updated_at`,
        [...identity, canonicalJson(entry.after.payload), entry.after.updatedAt, entry.before.updatedAt, canonicalJson(entry.before.payload)],
      );
      const receipt = updated.rows[0];
      const receiptVersion = receipt?.updated_at instanceof Date ? receipt.updated_at.toISOString() : receipt?.updated_at;
      if (updated.rows.length !== 1 || receiptVersion !== entry.after.updatedAt || !isDeepStrictEqual(receipt.payload, entry.after.payload)) throw new Error("Backfill conditional update conflict");
      applied++;
    }
    return { applied, alreadyValid };
  });
}

/** CLI is deliberately offline/dry-run only; live apply requires the explicit client API above. */
export async function runTestIndustryBackfillDryRun(args: string[], readText: (path: string) => Promise<string> = path => readFile(path, "utf8")) {
  if (args.length !== 2 || args[0] !== "--input" || !args[1] || args[1].startsWith("--")) throw new Error("Use --input <reviewed-snapshot.json>; this command only runs offline dry-run");
  const plan = buildTestIndustryBackfillPlan(JSON.parse(await readText(args[1])));
  return {
    mode: "dry-run", hash: plan.hash, counts: plan.counts,
    entries: plan.entries.map(entry => ({ reference: createHash("sha256").update(recordIdentity(entry.target)).digest("hex"), status: entry.status })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTestIndustryBackfillDryRun(process.argv.slice(2)).then(output => console.log(JSON.stringify(output))).catch(() => {
    console.error("Industry dry-run failed; check the explicit input and target versions.");
    process.exitCode = 1;
  });
}
