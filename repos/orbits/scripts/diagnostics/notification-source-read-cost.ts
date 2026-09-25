import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import type { PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
assert.ok(url, "Set ORBIT_LIFECYCLE_TEST_DATABASE_URL to the dedicated local test database.");
const parsed = new URL(url);
assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname), "This diagnostic is localhost-only.");
assert.equal(parsed.pathname, "/orbit_cutover_test_20260917", "Refusing to run outside the dedicated diagnostic database.");
assert.equal(parsed.search, "", "Connection-string options are not accepted.");

const schema = `notification_scan_cost_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({
  connectionString: url,
  max: 2,
  options: `-c search_path=${schema},public -c statement_timeout=20000 -c lock_timeout=1000`,
});
const metrics: PostgresReadMetric[] = [];
const client = createTransactionalPostgresClient({
  connectionString: url,
  pool,
  readMetrics: metric => { metrics.push(metric); },
});
const migrationClient = createEventOperationsPostgresClient({ connectionString: url, pool });

const workspaceId = "notification-cost-fixture";
const actorId = "notification-cost-actor";
const now = "2026-09-26T00:00:00.000Z";
const appointmentSince = "2026-08-27T00:00:00.000Z";
const rowsPerSource = 10_000;
const body = "x".repeat(2_048);

interface ScanDefinition {
  name: string;
  sql: string;
  values: readonly unknown[];
  idColumn: "record_id" | "appointment_id";
}

function planSummary(root: Record<string, unknown>) {
  const nodes: Record<string, unknown>[] = [];
  const visit = (node: Record<string, unknown>) => {
    nodes.push({
      type: node["Node Type"],
      relation: node["Relation Name"],
      index: node["Index Name"],
      actualRows: node["Actual Rows"],
      actualLoops: node["Actual Loops"],
      rowsRemovedByFilter: node["Rows Removed by Filter"],
      sharedReadBlocks: node["Shared Read Blocks"],
      sharedHitBlocks: node["Shared Hit Blocks"],
      sortMethod: node["Sort Method"],
    });
    if (Array.isArray(node.Plans)) {
      for (const child of node.Plans as Record<string, unknown>[]) visit(child);
    }
  };
  visit(root);
  return nodes;
}

async function measure(scan: ScanDefinition) {
  const metricsAtStart = metrics.length;
  let after = "";
  let queryCount = 0;
  let returnedRows = 0;
  let serializedArrayBytes = 0;

  for (;;) {
    const result = await client.query<Record<string, unknown>>(
      scan.sql,
      [...scan.values.slice(0, -1), after],
    );
    queryCount += 1;
    returnedRows += result.rows.length;
    serializedArrayBytes += Buffer.byteLength(JSON.stringify(result.rows));
    if (result.rows.length < 50) break;
    after = String(result.rows.at(-1)?.[scan.idColumn]);
  }

  const readMetrics = metrics.slice(metricsAtStart);
  const explain = await pool.query(`explain (analyze, buffers, format json) ${scan.sql}`, [...scan.values]);
  const plan = explain.rows[0]?.["QUERY PLAN"]?.[0]?.Plan as Record<string, unknown> | undefined;
  return {
    name: scan.name,
    queryCount,
    returnedRows,
    serializedArrayBytes,
    instrumentedRows: readMetrics.reduce((sum, metric) => sum + metric.returnedRows, 0),
    instrumentedRowBytes: readMetrics.reduce((sum, metric) => sum + metric.approximateSerializedRowBytes, 0),
    elapsedMs: Number(readMetrics.reduce((sum, metric) => sum + metric.elapsedMs, 0).toFixed(2)),
    firstPagePlan: plan ? planSummary(plan) : null,
  };
}

async function main() {
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runAppointmentMigrations(migrationClient);

    const payload = {
      id: "template",
      title: "Diagnostic notification",
      body,
      source: { type: "agent_action", id: "fixture", label: "Reminder" },
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    };
    const serializedPayload = JSON.stringify(payload);

    await pool.query(`insert into orbit_records(
      workspace_id,collection_name,record_id,user_id,source_type,source_id,
      lifecycle_state,payload,created_at,updated_at
    ) select $1,'reminderPlans','plan:'||lpad(n::text,6,'0'),$2,'manual','fixture','active',
      jsonb_build_object('entity',$3::jsonb||jsonb_build_object('id','plan:'||lpad(n::text,6,'0'))),$4,$4
      from generate_series(1,$5::integer) n`, [workspaceId, actorId, serializedPayload, now, rowsPerSource]);

    await pool.query(`insert into orbit_records(
      workspace_id,collection_name,record_id,user_id,source_type,source_id,
      lifecycle_state,payload,created_at,updated_at
    ) select $1,'businessCardBatches','batch:'||lpad(n::text,6,'0'),$2,'manual','fixture','active',
      jsonb_build_object('batch',jsonb_build_object(
        'id','batch:'||lpad(n::text,6,'0'),'actorId',$2::text,'updatedAt',$4::text,
        'status','completed','totalItems',1,'diagnosticBody',$3::jsonb->>'body'
      )),$4::timestamptz,$4::timestamptz
      from generate_series(1,$5::integer) n`, [workspaceId, actorId, serializedPayload, now, rowsPerSource]);

    await pool.query(`insert into appointment_aggregates(
      workspace_id,appointment_id,owner_actor_id,invitee_actor_id,contact_id,
      relationship_pair_id,authority_request_id,contact_ids_by_actor,status,
      version,payload,created_at,updated_at
    ) select $1,'appointment:'||lpad(n::text,6,'0'),$2,'other','contact',
      'pair:'||n,'request:'||n,jsonb_build_object($2::text,'contact'),'confirmed',1,$3::jsonb,$4,$4
      from generate_series(1,$5::integer) n`, [workspaceId, actorId, serializedPayload, now, rowsPerSource]);

    await pool.query("analyze orbit_records");
    await pool.query("analyze appointment_aggregates");

    const scans: ScanDefinition[] = [
      {
        name: "obsolete reminderPlans source scan",
        sql: `select record_id,collection_name,payload from orbit_records
          where workspace_id=$1 and user_id=$2 and lifecycle_state='active'
            and collection_name='reminderPlans' and record_id>$3
          order by record_id limit 50`,
        values: [workspaceId, actorId, ""],
        idColumn: "record_id",
      },
      {
        name: "businessCardBatches v1 source scan",
        sql: `select record_id,collection_name,payload from orbit_records
          where workspace_id=$1 and user_id=$2 and lifecycle_state='active'
            and collection_name='businessCardBatches' and record_id>$3
          order by record_id limit 50`,
        values: [workspaceId, actorId, ""],
        idColumn: "record_id",
      },
      {
        name: "appointment aggregate source scan",
        sql: `select appointment_id,payload from appointment_aggregates
          where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2)
            and updated_at >= $3::timestamptz and appointment_id>$4
          order by appointment_id limit 50`,
        values: [workspaceId, actorId, appointmentSince, ""],
        idColumn: "appointment_id",
      },
    ];
    const results = [];
    for (const scan of scans) results.push(await measure(scan));

    console.log(JSON.stringify({
      fixture: {
        database: parsed.pathname.slice(1),
        schema,
        rowsPerSource,
        bodyCharacters: body.length,
        serializedPayloadBytes: Buffer.byteLength(serializedPayload),
        appointmentSince,
        tablesCreatedFromProductionMigrations: true,
      },
      results,
      caveat: "Synthetic equal-sized actor-owned cohort; source-query-only egress/timing, not a production workload ranking. Excludes downstream N+1 reads and projection writes.",
    }, null, 2));
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await client.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
