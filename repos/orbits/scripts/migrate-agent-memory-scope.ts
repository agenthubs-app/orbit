/**
 * agent-design AG14-5 (设计稿 §6 "迁移前做只读映射清点"): the inventory of old Agent memory partitions, and — only with
 * `--apply` — the move of the ones whose owner is proven (features/agent/memory/ownership-inventory.ts).
 *
 *   tsx scripts/migrate-agent-memory-scope.ts --database-url <local url> --workspace <id> [--out <dir>] [--apply]
 *
 * Without `--apply` nothing is written to the database. The database must be local (localhost, 127.0.0.1, ::1):
 * running this against a remote or production database is not part of this script. The report holds counts and
 * hashed ids only — never a memory's words, a name or an e-mail address.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import type { AgentMemoryRecordPayload } from "../features/agent/memory/contract";
import { inventoryMemoryOwnership, moveMemoryPartition, redactedId, type IdentityRows, type MemoryPartitionCount, type MoveResult } from "../features/agent/memory/ownership-inventory";
import { AGENT_MEMORY_COLLECTION } from "../features/agent/memory/service";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

export function assertLocalDatabase(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("The database url is not valid.");
  }
  if (!LOCAL_HOSTS.has(hostname)) throw new Error("Refusing to run: the memory ownership inventory and move run on a local database only.");
}

export async function readInventoryInputs(client: pg.Client, workspaceId: string): Promise<{ partitions: MemoryPartitionCount[]; identity: IdentityRows }> {
  const prefix = `${workspaceId}:agent-actor:`;
  const partitions = await client.query<{ partition_id: string; entries: string; settings: string }>(
    `select substr(workspace_id, char_length($1) + 1) as partition_id,
            count(*) filter (where payload->>'kind' = 'memory') as entries,
            count(*) filter (where payload->>'kind' = 'settings') as settings
       from orbit_records
      where collection_name = $2 and lifecycle_state <> 'deleted' and left(workspace_id, char_length($1)) = $1
      group by workspace_id`,
    [prefix, AGENT_MEMORY_COLLECTION],
  );
  const accounts = await client.query<{ record_id: string }>("select record_id from orbit_records where workspace_id = $1 and collection_name = 'accounts' and lifecycle_state <> 'deleted'", [workspaceId]);
  const profiles = await client.query<{ record_id: string; account_id: string | null }>("select record_id, payload->>'accountId' as account_id from orbit_records where workspace_id = $1 and collection_name = 'profiles' and lifecycle_state <> 'deleted'", [workspaceId]);
  return {
    identity: {
      accountIds: accounts.rows.map((row) => row.record_id),
      profiles: profiles.rows.filter((row) => row.account_id).map((row) => ({ accountId: row.account_id!, id: row.record_id })),
    },
    partitions: partitions.rows.map((row) => ({ entries: Number(row.entries), hasSettings: Number(row.settings) > 0, partitionId: row.partition_id })),
  };
}

async function main(): Promise<void> {
  const url = argument("database-url") ?? process.env.ORBIT_EVENT_DATABASE_URL ?? process.env.ORBIT_LOCAL_DATABASE_URL;
  const workspaceId = argument("workspace") ?? process.env.ORBIT_WORKSPACE_ID;
  const apply = process.argv.includes("--apply");
  const out = argument("out");
  if (!url || !workspaceId) throw new Error("Give --database-url and --workspace (or ORBIT_EVENT_DATABASE_URL and ORBIT_WORKSPACE_ID).");
  assertLocalDatabase(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const inputs = await readInventoryInputs(client, workspaceId);
    const inventory = inventoryMemoryOwnership(inputs.partitions, inputs.identity);
    const moves: MoveResult[] = [];
    if (apply) {
      const sqlClient = createPgLiveRecordSqlClient({ connectionString: url });
      try {
        const store = createPostgresLiveRecordStore<AgentMemoryRecordPayload>({ client: sqlClient });
        for (const row of inventory.rows) {
          if (row.verdict.kind !== "movable") continue;
          moves.push(await moveMemoryPartition({ now: new Date().toISOString(), partitionId: row.partitionId, store, verdict: row.verdict, workspaceId }));
        }
      } finally {
        await sqlClient.close();
      }
    }
    const report = {
      applied: apply,
      generatedAt: new Date().toISOString(),
      moves: moves.map((move) => ({ from: redactedId(move.from), keptForCheck: move.keptForCheck.length, moved: move.moved, settingsMoved: move.settingsMoved, to: redactedId(move.toAccountId) })),
      rows: inventory.rows.map((row) => ({
        entries: row.entries,
        hasSettings: row.hasSettings,
        partition: redactedId(row.partitionId),
        ...(row.verdict.kind === "canonical" || row.verdict.kind === "movable" ? { account: redactedId(row.verdict.accountId) } : { reason: row.verdict.reason }),
        verdict: row.verdict.kind,
      })),
      totals: inventory.totals,
      workspace: redactedId(workspaceId),
    };
    const text = JSON.stringify(report, null, 2);
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      const file = path.join(out, `memory-ownership-${apply ? "applied" : "inventory"}.json`);
      fs.writeFileSync(file, `${text}\n`);
      console.log(`wrote ${file}`);
    }
    console.log(JSON.stringify({ applied: apply, moved: moves.reduce((sum, move) => sum + move.moved, 0), totals: inventory.totals }));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && /migrate-agent-memory-scope\.ts$/u.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
