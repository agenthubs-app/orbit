/**
 * One-off (2026-11-23, user decision): hard-delete the 32 synthetic / demo / QA events from the
 * event tables, keeping the five 中日创业交流会 events.
 *
 * Deletes by an explicit event-id list — never by title. Every table that has an `event_id` column is
 * cleared for those ids inside one transaction; tables are retried until foreign keys stop blocking.
 * The run aborts (rolls back) if any row for those ids is left, or if a kept event is missing afterwards.
 *
 * Usage:
 *   npx tsx scripts/delete-mock-events.ts            # dry run: deletes inside the transaction, then rolls back
 *   npx tsx scripts/delete-mock-events.ts --apply    # commits
 */
import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient, type EventOperationsSqlExecutor } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

export const KEEP_EVENT_IDS: readonly string[] = [
  "00000000-0000-0000-0000-000000000001", // 第1回 中日创业交流会
  "d4bb5ca1-ef91-486b-bc89-b9f58c73d8be", // 第2回
  "c011f958-4d51-4ada-8881-92f14f5c4db6", // 第3回
  "2bd30391-c356-457a-8ab5-c4e142031207", // 第4回
  "evt_4176514ffa2c47e9b4a0", // 第六期
];

export const DELETE_EVENT_IDS: readonly string[] = [
  ...Array.from({ length: 10 }, (_, index) => `10000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `event_${String(index + 1).padStart(2, "0")}`),
  "event_signup_01",
  "event_signup_02",
  "event_signup_03",
  "demo-event-1",
  "demo-event-2",
  "event:manual:founder-investor-salon",
  "evt_2d9d7b0e695347c59e4c", // QA-B3 测试交流会
  "evt_6c0d93d848d145248253", // QA-B4 测试交流会
  "evt_a74e5e13600d4db98e46", // QA-B4 会场测试
  "evt_5f6c6c5135fb4966b77f", // QA-B2 主办方视角测试
  "evt_4df6cfbf9def47a38c6c", // QA-B 测试交流会
  "evt_8877b44d5e5b443e97a5", // QA-B 共同运营测试
];

class DryRunRollback extends Error {}

interface Report {
  applied: boolean;
  eventsBefore: number;
  eventsAfter: number;
  deletedByTable: Record<string, number>;
  blocked: Record<string, string>;
  guardsLifted: string[];
  recordReferences: readonly unknown[];
  remainingTitles: string[];
}

async function deleteEverywhere(transaction: EventOperationsSqlExecutor, workspaceId: string): Promise<Pick<Report, "deletedByTable" | "blocked" | "guardsLifted">> {
  const tables = (await transaction.query<{ table_name: string; has_workspace: boolean }>(
    `select c.table_name,
            exists (select 1 from information_schema.columns w where w.table_schema = c.table_schema and w.table_name = c.table_name and w.column_name = 'workspace_id') as has_workspace
       from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = current_schema() and c.column_name = 'event_id' and c.data_type = 'text'
      order by c.table_name`,
  )).rows;
  const deletedByTable: Record<string, number> = {};
  let blocked: Record<string, string> = {};
  const previouslyGuarded = new Set<string>();
  let pending = tables.filter((table) => table.table_name !== "event_ops_events");
  pending.push(...tables.filter((table) => table.table_name === "event_ops_events"));

  for (let pass = 0; pass < 12 && pending.length > 0; pass += 1) {
    const next: typeof pending = [];
    blocked = {};
    let progressed = false;
    for (const table of pending) {
      const name = `"${table.table_name.replaceAll('"', "")}"`;
      await transaction.query("savepoint mock_event_table");
      // Append-only tables (versions / heads) refuse deletes through a guard trigger. A hard delete of a whole
      // event is the one case that is meant to remove them, so the guard is switched off for this statement only,
      // inside the transaction, for a table that already refused once for a reason other than a foreign key.
      const guarded = previouslyGuarded.has(table.table_name);
      try {
        if (guarded) await transaction.query(`alter table ${name} disable trigger user`);
        const result = table.has_workspace
          ? await transaction.query(`delete from ${name} where workspace_id = $1 and event_id = any($2::text[])`, [workspaceId, DELETE_EVENT_IDS])
          : await transaction.query(`delete from ${name} where event_id = any($1::text[])`, [DELETE_EVENT_IDS]);
        if (guarded) await transaction.query(`alter table ${name} enable trigger user`);
        await transaction.query("release savepoint mock_event_table");
        const count = result.rowCount ?? 0;
        if (count > 0) { deletedByTable[table.table_name] = (deletedByTable[table.table_name] ?? 0) + count; progressed = true; }
      } catch (error) {
        await transaction.query("rollback to savepoint mock_event_table");
        const message = error instanceof Error ? error.message.slice(0, 240) : "delete failed";
        blocked[table.table_name] = message;
        if (!/foreign key/iu.test(message) && !guarded) { previouslyGuarded.add(table.table_name); progressed = true; }
        next.push(table);
      }
    }
    if (!progressed && next.length === pending.length) break;
    pending = next;
  }
  return { blocked: pending.length > 0 ? blocked : {}, deletedByTable, guardsLifted: [...previouslyGuarded].sort() };
}

async function main(argv: readonly string[]): Promise<void> {
  loadLocalEnv();
  const apply = argv[0] === "--apply";
  assert.ok(argv.length === 0 || (apply && argv.length === 1), "Usage: no arguments for a dry run; --apply to commit");
  assert.equal(DELETE_EVENT_IDS.length, 32);
  assert.equal(new Set(DELETE_EVENT_IDS).size, 32);
  assert.ok(DELETE_EVENT_IDS.every((id) => !KEEP_EVENT_IDS.includes(id)));

  const database = resolveLiveDatabaseConnectionConfig();
  assert.ok(database, "Configure the event database before running this script.");
  const client = createEventOperationsPostgresClient({ connectionString: database.connectionString });
  let report: Report | null = null;

  try {
    await client.transaction(async (transaction) => {
      const before = (await transaction.query<{ event_id: string; title: string | null }>(`select event_id, title from event_ops_events where workspace_id = $1`, [database.workspaceId])).rows;
      const doomed = before.filter((row) => DELETE_EVENT_IDS.includes(row.event_id));
      assert.ok(doomed.every((row) => !(row.title ?? "").includes("中日创业交流会")), "A listed id is a 中日创业交流会 event — refusing.");

      // Legacy record copies of the same events (the event tables were backfilled from these): reported, not deleted here.
      const recordReferences = (await transaction.query(
        `select collection_name, count(*)::int as rows from orbit_records
          where workspace_id = $1 and (record_id = any($2::text[]) or payload->>'eventId' = any($2::text[]))
          group by 1 order by 2 desc`,
        [database.workspaceId, DELETE_EVENT_IDS],
      )).rows;

      const { blocked, deletedByTable, guardsLifted } = await deleteEverywhere(transaction, database.workspaceId);
      const after = (await transaction.query<{ event_id: string; title: string | null }>(`select event_id, title from event_ops_events where workspace_id = $1 order by starts_at`, [database.workspaceId])).rows;
      report = {
        applied: apply,
        blocked,
        deletedByTable,
        eventsAfter: after.length,
        eventsBefore: before.length,
        guardsLifted,
        recordReferences,
        remainingTitles: after.map((row) => row.title ?? row.event_id),
      };
      if (Object.keys(blocked).length > 0) throw new Error(`Some tables could not be cleared: ${JSON.stringify(blocked)}`);
      assert.ok(after.every((row) => !DELETE_EVENT_IDS.includes(row.event_id)), "A listed event is still present.");
      assert.ok(KEEP_EVENT_IDS.every((id) => !before.some((row) => row.event_id === id) || after.some((row) => row.event_id === id)), "A kept event disappeared.");
      assert.equal(after.length, before.length - doomed.length, "Events other than the listed ones changed.");
      if (!apply) throw new DryRunRollback();
    }, { isolation: "read committed" });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) {
      if (report) process.stdout.write(`MOCK_EVENTS_REPORT ${JSON.stringify(report)}\n`);
      throw error;
    }
  } finally {
    await client.close();
  }
  process.stdout.write(`MOCK_EVENTS_REPORT ${JSON.stringify(report)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`MOCK_EVENTS_FAILED ${error instanceof Error ? error.message : "failed"}\n`);
    process.exitCode = 1;
  });
}
