import { readFileSync } from "node:fs";
import { Client, type QueryResult } from "pg";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";
import { runEventExperienceMigrations } from "../features/events/experience/storage/migrations";
import { runEventAnalyticsMigrations } from "../features/events/event-analytics/migrations";
import { runAppointmentMigrations } from "../features/appointments/storage/migrations";
import { runBusinessCardIngestV2Migrations } from "../features/acquisition/business-card-ingest-v2/migrations";
import type { EventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { applyEventCoreBackfillPlan } from "../features/events/core/backfill";
import { createPostgresEventAccessRepository } from "../features/events/event-access/storage/postgres-repository";
import { createEventAccessService } from "../features/events/event-access/service";
import { requireEventCapability } from "../features/events/event-access/guard";
import { createPostgresEventAdmissionRepository } from "../features/events/admission/storage/postgres-repository";
import { createEventAdmissionService } from "../features/events/admission/service";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { activateCanonicalRegistrationsWithExecutor } from "../features/events/event-operations/storage/canonical-registration-repository";
import { buildMinimalStagingSeed, validateStagingTarget, STAGING_LIMITS, STAGING_WORKSPACE } from "./lib/minimal-staging";

async function main() {
  const args = process.argv.slice(2);
  const cloud = args.includes("--cloud");
  const configPath = args.find(a => a.startsWith("--config="))?.slice(9);
  if (!configPath) throw Error("STAGING_PRIVATE_CONFIG_REQUIRED");
  const config = JSON.parse(readFileSync(configPath,"utf8")) as {databaseUrl:string;password:string};
  const connectionString = cloud ? config.databaseUrl : "postgresql://li@localhost:5432/orbit_staging_20260917";
  validateStagingTarget(connectionString,cloud);
  const seed = await buildMinimalStagingSeed(config.password,new Date().toISOString());
  if (!args.includes("--apply")) {
    console.info(JSON.stringify({dryRun:true,records:seed.records.length,events:seed.events.count,seedBytes:seed.seedBytes,limits:STAGING_LIMITS}));return;
  }
  const pg = new Client({connectionString,statement_timeout:15000,connectionTimeoutMillis:15000});
  let queries = 0, returnedBytes = 0;
  // One outer transaction covers all migrations and data; nested service transactions share it.
  const client: EventOperationsPostgresClient = {
    async query<TRow>(sql:string,values?:readonly unknown[]) {
      if (++queries > STAGING_LIMITS.queries || returnedBytes > STAGING_LIMITS.returnedBytes) throw Error("STAGING_QUERY_BUDGET_EXCEEDED");
      const raw = await pg.query(sql,values ? [...values] : undefined);
      const results: QueryResult[] = Array.isArray(raw) ? raw : [raw];
      const rows = results.flatMap(r=>r.rows) as TRow[];
      returnedBytes += Buffer.byteLength(JSON.stringify(rows));
      if (returnedBytes > STAGING_LIMITS.returnedBytes) throw Error("STAGING_RETURN_BUDGET_EXCEEDED");
      return {rows,rowCount:results.reduce((count,result)=>count+(result.rowCount ?? result.rows.length),0)};
    },
    transaction: async operation => operation(client),
    close: async () => {},
  };
  await pg.connect();
  try {
    await pg.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended('orbit:small-staging:init',0))");
    const existing = await client.query<{count:string}>("select count(*)::text as count from pg_tables where schemaname='public'");
    if (existing.rows[0]?.count !== "0") throw Error("STAGING_DATABASE_NOT_EMPTY_NO_CHANGES");
    await runOrbitRecordsMigration(client);
    await runEventExperienceMigrations(client);
    await runEventAnalyticsMigrations(client);
    await runAppointmentMigrations(client);
    await runBusinessCardIngestV2Migrations(client);
    const store = createPostgresLiveRecordStore({client});
    for (const record of seed.records) await store.upsertRecord(record);
    await applyEventCoreBackfillPlan({client,workspaceId:STAGING_WORKSPACE,plan:seed.events,now:seed.now});
    const access = createEventAccessService(createPostgresEventAccessRepository({client,workspaceId:STAGING_WORKSPACE}));
    const admission = createEventAdmissionService({repository:createPostgresEventAdmissionRepository({client,workspaceId:STAGING_WORKSPACE}),requireCapability:(actorId,eventId,capability)=>requireEventCapability({actorId,eventId,capability,service:access})});
    const ops = createPostgresEventOperationsRepository({client,workspaceId:STAGING_WORKSPACE});
    const published = seed.events.events.find(e=>e.lifecycleState==="published")!;
    const at = (offsetHours:number) => new Date(Date.parse(published.startsAt)+offsetHours*3600000).toISOString();
    await requireEventCapability({actorId:seed.accounts.organizer!.id,eventId:published.eventId,capability:"operations.configure",service:access});
    let denied=false;
    try {await requireEventCapability({actorId:seed.accounts.participantA!.id,eventId:published.eventId,capability:"operations.configure",service:access});} catch {denied=true;}
    if (!denied) throw Error("STAGING_OWNER_ISOLATION_FAILED");
    await ops.saveConfigurationAsOperator({actorId:seed.accounts.organizer!.id,capability:"operations.configure",configuration:{eventId:published.eventId,organizerActorId:seed.accounts.organizer!.id,checkInOpensAt:at(-1),eventStartsAt:published.startsAt,eventEndsAt:published.endsAt,profileEditDeadlineAt:at(-2),registrationCutoffAt:at(-2),resultsAvailableAt:at(0),roundOneStartsAt:at(0),roundTwoStartsAt:at(1),recommendationCount:1,tableSize:2,shardSize:4,maxAttemptsPerTask:1,updatedAt:seed.now}});
    await admission.configurePolicy(seed.accounts.organizer!.id,{eventId:published.eventId,admissionMode:"instant",capacity:8,waitlistEnabled:true,registrationOpensAt:seed.now,registrationClosesAt:at(-2),profileEditDeadlineAt:at(-2)});
    await activateCanonicalRegistrationsWithExecutor({executor:client,workspaceId:STAGING_WORKSPACE,eventId:published.eventId,registrations:[]});
    const counts = await client.query("select collection_name,count(*)::int as records from orbit_records group by collection_name order by collection_name");
    const totals = await client.query("select (select count(*) from event_ops_events)::int as events, (select count(*) from event_ops_generations)::int as generations");
    await pg.query("commit");
    console.info(JSON.stringify({applied:true,cloud,workspaceId:STAGING_WORKSPACE,accounts:seed.accounts,collections:counts.rows,totals:totals.rows,seedBytes:seed.seedBytes,queries,approximateReturnedBytes:returnedBytes,limits:STAGING_LIMITS}));
  } catch(error) {
    await pg.query("rollback");
    if (!cloud && error instanceof Error) console.error(error.stack?.split("\n").slice(1).join("\n"));
    throw error;
  } finally {await pg.end();}
}
main().catch(error=>{
  // Never print raw PG errors/connection strings or credential-bearing seed payloads.
  const message = error instanceof Error && /^STAGING_[A-Z_]+$/.test(error.message) ? error.message : "STAGING_SETUP_FAILED_ROLLED_BACK";
  console.error(message);process.exitCode=1;
});
