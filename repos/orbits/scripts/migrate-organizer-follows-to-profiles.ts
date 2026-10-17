/**
 * R17-08：旧的 actor 级主办方关注 → 每份资料页的关注（见 features/events/host/storage/follow-migration.ts）。
 * 只对本机 / 回环库执行；生产迁移需用户授权后另行执行（DEFERRED-A §4）。
 *
 *   npx tsx scripts/migrate-organizer-follows-to-profiles.ts
 */
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { migrateActorFollowsToProfiles } from "../features/events/host/storage/follow-migration";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();
const configuration = resolveLiveDatabaseConnectionConfig(process.env);
if (!configuration) throw new Error("No live database is configured.");
const host = new URL(configuration.connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Refusing to migrate a non-loopback database (${host}); production needs authorization.`);
const runtime = createConfiguredEventOperationsPostgresRuntime()!;
void migrateActorFollowsToProfiles({ client: runtime.client, workspaceId: runtime.workspaceId })
  .then((result) => { console.log(JSON.stringify(result)); process.exit(0); })
  .catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
