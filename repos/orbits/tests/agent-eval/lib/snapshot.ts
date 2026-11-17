/**
 * Snapshots (pg_dump custom format) and the before/after database state used for db-diff.json.
 * db-diff is computed from two reads of the database itself, independently of the server's
 * `db.write` events (PLANNER 易错边界 2), so a write that bypasses the server still shows up here.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

import { sha256 } from "./yaml";

const BIN = "/opt/homebrew/bin";

function bin(name: string): string {
  const candidate = `${BIN}/${name}`;
  return fs.existsSync(candidate) ? candidate : name;
}

export function databaseArgs(url: string): { args: string[]; name: string } {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//u, "");
  const args = ["-h", parsed.hostname, "-p", parsed.port || "5432"];
  if (parsed.username) args.push("-U", decodeURIComponent(parsed.username));
  return { args, name };
}

function run(command: string, args: string[]): void {
  const result = spawnSync(bin(command), args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).slice(0, 2000)}`);
}

export function recreateDatabase(url: string): void {
  const { args, name } = databaseArgs(url);
  run("dropdb", [...args, "--if-exists", "--force", name]);
  run("createdb", [...args, name]);
}

export function dumpSnapshot(url: string, file: string): string {
  const { args, name } = databaseArgs(url);
  run("pg_dump", [...args, "-Fc", "--no-owner", "-f", file, name]);
  return sha256(fs.readFileSync(file));
}

/**
 * harness/eval-parallel-workers: with --workers N the parent sets this to a lock file. One restore drops and
 * recreates every table in a single transaction, and four at once ran the local Postgres out of lock slots
 * ("out of shared memory", max_locks_per_transaction 64), so the workers' restores take turns. Unset (a
 * sequential run) nothing changes.
 */
export const RESTORE_LOCK_ENV = "ORBIT_AGENT_EVAL_RESTORE_LOCK";

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Run `fn` holding the restore lock named by $ORBIT_AGENT_EVAL_RESTORE_LOCK (a holder that died is taken over). */
export function withRestoreLock<T>(fn: () => T, lockFile = process.env[RESTORE_LOCK_ENV]): T {
  if (!lockFile) return fn();
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let holder = 0;
      try {
        holder = Number(fs.readFileSync(lockFile, "utf8").trim() || 0);
      } catch {
        continue; // released in between
      }
      if (holder && !alive(holder)) fs.rmSync(lockFile, { force: true });
      else if (Date.now() > deadline) throw new Error(`waited 180 s for the snapshot restore lock ${lockFile} (held by pid ${holder})`);
      else sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      if (fs.readFileSync(lockFile, "utf8").trim() === String(process.pid)) fs.rmSync(lockFile, { force: true });
    } catch {
      // already gone
    }
  }
}

/** Restore in place, so a running server keeps its pool; every table is dropped and recreated in one transaction. */
export function restoreSnapshot(url: string, file: string): void {
  if (!fs.existsSync(file)) throw new Error(`Snapshot ${file} is missing; run npm run agent-eval:seed first.`);
  const { args, name } = databaseArgs(url);
  withRestoreLock(() => run("pg_restore", [...args, "--clean", "--if-exists", "--no-owner", "--single-transaction", "-d", name, file]));
}

export interface RecordRow {
  workspace: string;
  collection: string;
  id: string;
  owner: string | null;
  hash: string;
}

export interface DatabaseState {
  records: Map<string, RecordRow>;
  /** table → multiset of row hashes (tables other than orbit_records). */
  tables: Map<string, Map<string, number>>;
  digest: string;
}

export function recordKey(row: Pick<RecordRow, "workspace" | "collection" | "id">): string {
  return `${row.workspace}\u0000${row.collection}\u0000${row.id}`;
}

/** Tables that are bookkeeping, not data: migrations bookkeeping and read-cost counters. */
const IGNORED_TABLE = /(_schema_migrations|^orbit_read_receipts$|^orbit_read_cost_|^orbit_maintenance_heartbeat$)/u;

export async function readDatabaseState(client: pg.Client): Promise<DatabaseState> {
  const records = new Map<string, RecordRow>();
  const result = await client.query<{ workspace_id: string; collection_name: string; record_id: string; user_id: string | null; h: string }>(
    "select workspace_id, collection_name, record_id, user_id, md5(row_to_json(r)::text) as h from orbit_records r",
  );
  for (const row of result.rows) {
    const value = { collection: row.collection_name, hash: row.h, id: row.record_id, owner: row.user_id, workspace: row.workspace_id };
    records.set(recordKey(value), value);
  }
  const tables = new Map<string, Map<string, number>>();
  const names = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'orbit_records' order by table_name");
  for (const { table_name: table } of names.rows) {
    if (IGNORED_TABLE.test(table)) continue;
    const rows = await client.query<{ h: string }>(`select md5(row_to_json(t)::text) as h from "${table}" t`);
    if (!rows.rows.length) continue;
    const counts = new Map<string, number>();
    for (const row of rows.rows) counts.set(row.h, (counts.get(row.h) ?? 0) + 1);
    tables.set(table, counts);
  }
  const digest = sha256(
    [...[...records.values()].map((row) => `${recordKey(row)}=${row.hash}`).sort(), ...[...tables.entries()].sort().map(([table, counts]) => `${table}:${[...counts.entries()].sort().map(([h, n]) => `${h}*${n}`).join(",")}`)].join("\n"),
  );
  return { digest, records, tables };
}

export interface RecordChange {
  kind: "created" | "updated" | "deleted";
  workspace: string;
  collection: string;
  id: string;
  owner: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Top-level payload fields that differ. */
  fields: { field: string; from: unknown; to: unknown }[];
}

export interface TableChange {
  table: string;
  added: number;
  removed: number;
  addedRows: Record<string, unknown>[];
}

export interface DatabaseDiff {
  records: RecordChange[];
  tables: TableChange[];
}

/** Row payloads for the changed keys, read after the case. `before` comes from the snapshot copy passed in. */
export async function readPayloads(client: pg.Client, keys: readonly { workspace: string; collection: string; id: string }[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < keys.length; index += 200) {
    const slice = keys.slice(index, index + 200);
    const result = await client.query<{ workspace_id: string; collection_name: string; record_id: string; payload: Record<string, unknown>; lifecycle_state: string; updated_at: Date }>(
      "select workspace_id, collection_name, record_id, payload, lifecycle_state, updated_at from orbit_records where (workspace_id, collection_name, record_id) in (select * from unnest($1::text[], $2::text[], $3::text[]))",
      [slice.map((key) => key.workspace), slice.map((key) => key.collection), slice.map((key) => key.id)],
    );
    for (const row of result.rows) {
      out.set(recordKey({ collection: row.collection_name, id: row.record_id, workspace: row.workspace_id }), { ...row.payload, __lifecycleState: row.lifecycle_state });
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Changed payload fields as dotted paths into nested objects (arrays compare as a whole). */
export function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null, prefix = "", depth = 0): RecordChange["fields"] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: RecordChange["fields"] = [];
  for (const key of [...keys].sort()) {
    const from = before?.[key];
    const to = after?.[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    if (depth < 3 && isPlainObject(from) && isPlainObject(to)) out.push(...changedFields(from, to, `${prefix}${key}.`, depth + 1));
    else out.push({ field: `${prefix}${key}`, from: from ?? null, to: to ?? null });
  }
  return out;
}

export async function diffStates(
  client: pg.Client,
  before: DatabaseState,
  beforePayloads: Map<string, Record<string, unknown>>,
  after: DatabaseState,
): Promise<DatabaseDiff> {
  const changed: { key: string; kind: RecordChange["kind"]; row: RecordRow }[] = [];
  for (const [key, row] of after.records) {
    const previous = before.records.get(key);
    if (!previous) changed.push({ key, kind: "created", row });
    else if (previous.hash !== row.hash) changed.push({ key, kind: "updated", row });
  }
  for (const [key, row] of before.records) if (!after.records.has(key)) changed.push({ key, kind: "deleted", row });
  const afterPayloads = await readPayloads(client, changed.filter((item) => item.kind !== "deleted").map((item) => item.row));
  const records: RecordChange[] = changed.map(({ key, kind, row }) => {
    const beforePayload = kind === "created" ? null : beforePayloads.get(key) ?? null;
    const afterPayload = kind === "deleted" ? null : afterPayloads.get(key) ?? null;
    return { after: afterPayload, before: beforePayload, collection: row.collection, fields: changedFields(beforePayload, afterPayload), id: row.id, kind, owner: row.owner, workspace: row.workspace };
  });
  const tables: TableChange[] = [];
  for (const table of new Set([...before.tables.keys(), ...after.tables.keys()])) {
    const a = before.tables.get(table) ?? new Map();
    const b = after.tables.get(table) ?? new Map();
    let added = 0;
    let removed = 0;
    const addedHashes: string[] = [];
    for (const [hash, n] of b) {
      const diff = n - (a.get(hash) ?? 0);
      if (diff > 0) {
        added += diff;
        addedHashes.push(hash);
      }
    }
    for (const [hash, n] of a) removed += Math.max(0, n - (b.get(hash) ?? 0));
    if (!added && !removed) continue;
    let addedRows: Record<string, unknown>[] = [];
    if (addedHashes.length) {
      const result = await client.query<{ j: Record<string, unknown> }>(`select row_to_json(t) as j from "${table}" t where md5(row_to_json(t)::text) = any($1::text[]) limit 50`, [addedHashes]);
      addedRows = result.rows.map((row) => row.j);
    }
    tables.push({ added, addedRows, removed, table });
  }
  return { records, tables };
}

/** Full payloads of every record before the case (only for the small world; large worlds keep hashes). */
export async function readAllPayloads(client: pg.Client): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const result = await client.query<{ workspace_id: string; collection_name: string; record_id: string; payload: Record<string, unknown>; lifecycle_state: string }>(
    "select workspace_id, collection_name, record_id, payload, lifecycle_state from orbit_records",
  );
  for (const row of result.rows) out.set(recordKey({ collection: row.collection_name, id: row.record_id, workspace: row.workspace_id }), { ...row.payload, __lifecycleState: row.lifecycle_state });
  return out;
}
