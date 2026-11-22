/**
 * Backfill the account label that registration used to store as "X 的 Orbit".
 *
 * Why this exists: account provisioning stored `accounts.payload.name` as
 * `${displayName} 的 Orbit` — a fixed Chinese phrase that showed up in the
 * Japanese and English interface. Before 2026-09-26 (ba7817802) a profile save
 * with no company also copied that label into `profiles.payload.organization`,
 * and contacts created from such a profile copied it again into
 * `contacts.payload.organization`, so it appears as the person's company in the
 * contacts list.
 *
 * What it changes (only rows whose value is exactly the old label form):
 *   - accounts.payload.name          "X 的 Orbit" → "X"
 *   - profiles.payload.organization  "X 的 Orbit" → removed (company unknown)
 *   - contacts.payload.organization  "X 的 Orbit" → removed (company unknown)
 * `search_text` drops the same label, and `updated_at` moves so watermarks and
 * device sync pick the rows up. Contacts are a sync collection: the write holds
 * the sync commit-order lock.
 *
 * Usage:
 *   npx tsx scripts/backfill-account-name-label.ts                          # dry run
 *   npx tsx scripts/backfill-account-name-label.ts --apply /abs/receipt.json
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

/** The exact form registration produced: a non-empty name, one space, "的 Orbit", nothing after. */
const LEGACY_LABEL = /^(.+\S) 的 Orbit$/u;

export type LabelField = "name" | "organization";

export interface LabelRow {
  collection_name: string;
  record_id: string;
  value: string | null;
  search_text: string | null;
}

export interface PlannedLabelChange {
  collection: string;
  recordId: string;
  field: LabelField;
  from: string;
  /** null removes the field. */
  to: string | null;
  searchText: string;
}

const FIELD_BY_COLLECTION: Readonly<Record<string, LabelField>> = {
  accounts: "name",
  profiles: "organization",
  contacts: "organization",
};

function stripLabel(searchText: string, label: string, replacement: string): string {
  return searchText.split(label).join(replacement).replace(/\s+/gu, " ").trim();
}

export function planAccountLabelBackfill(rows: readonly LabelRow[]): PlannedLabelChange[] {
  const planned: PlannedLabelChange[] = [];
  for (const row of rows) {
    const field = FIELD_BY_COLLECTION[row.collection_name];
    if (!field || typeof row.value !== "string") continue;
    const value = row.value.trim();
    const match = LEGACY_LABEL.exec(value);
    if (!match) continue;
    const personName = match[1]!.trim();
    const to = field === "name" ? personName : null;
    planned.push({
      collection: row.collection_name,
      recordId: row.record_id,
      field,
      from: row.value,
      to,
      searchText: stripLabel(row.search_text ?? "", value, to ?? ""),
    });
  }
  return planned;
}

const SELECT_SQL = `
  select collection_name, record_id,
         case when collection_name = 'accounts' then payload->>'name' else payload->>'organization' end as value,
         search_text
  from orbit_records
  where workspace_id = $1
    and collection_name in ('accounts', 'profiles', 'contacts')
    and deleted_at is null
    and (case when collection_name = 'accounts' then payload->>'name' else payload->>'organization' end) like '% 的 Orbit'
  order by collection_name, record_id
`;

/** Read-only: any other row that still carries the phrase, so the report shows what this does not cover. */
const RESIDUE_SQL = `
  select collection_name, count(*)::int as rows
  from orbit_records
  where workspace_id = $1 and deleted_at is null and payload::text like '% 的 Orbit%'
  group by collection_name
  order by collection_name
`;

const UPDATE_NAME_SQL = `
  update orbit_records
     set payload = jsonb_set(payload, '{name}', to_jsonb($3::text)),
         search_text = $4, updated_at = $5
   where workspace_id = $1 and collection_name = 'accounts' and record_id = $2
     and deleted_at is null and payload->>'name' = $6`;

const UPDATE_ORGANIZATION_SQL = `
  update orbit_records
     set payload = payload - 'organization',
         search_text = $4, updated_at = $5
   where workspace_id = $1 and collection_name = $3 and record_id = $2
     and deleted_at is null and payload->>'organization' = $6`;

async function main(argv: readonly string[]): Promise<void> {
  loadLocalEnv();
  const apply = argv[0] === "--apply";
  const receiptPath = argv[1];
  assert.ok(
    argv.length === 0 || (apply && argv.length === 2 && receiptPath && isAbsolute(receiptPath)),
    "Usage: no arguments for a dry run; --apply /absolute/receipt.json to write",
  );

  const database = resolveLiveDatabaseConnectionConfig();
  assert.ok(database, "Configure ORBIT_EVENT_DATABASE_URL before running this backfill.");
  const client = createEventOperationsPostgresClient({ connectionString: database.connectionString });

  try {
    const receipt = await client.transaction(async (transaction) => {
      // Contacts are a sync collection; take the commit-order lock before any write.
      await acquireSyncCommitOrderLock(transaction);
      const rows = (await transaction.query(SELECT_SQL, [database.workspaceId])).rows as unknown as LabelRow[];
      const planned = planAccountLabelBackfill(rows);
      const residueBefore = (await transaction.query(RESIDUE_SQL, [database.workspaceId])).rows;
      const now = new Date().toISOString();

      if (apply) {
        for (const change of planned) {
          const result = change.field === "name"
            ? await transaction.query(UPDATE_NAME_SQL, [database.workspaceId, change.recordId, change.to, change.searchText, now, change.from])
            : await transaction.query(UPDATE_ORGANIZATION_SQL, [database.workspaceId, change.recordId, change.collection, change.searchText, now, change.from]);
          assert.equal(result.rowCount, 1, `Update not acknowledged for ${change.collection}/${change.recordId}`);
        }
        const verified = (await transaction.query(SELECT_SQL, [database.workspaceId])).rows as unknown as LabelRow[];
        assert.equal(planAccountLabelBackfill(verified).length, 0, "Backfill did not converge");
      }
      const residueAfter = apply ? (await transaction.query(RESIDUE_SQL, [database.workspaceId])).rows : null;

      const counts: Record<string, number> = {};
      for (const change of planned) counts[change.collection] = (counts[change.collection] ?? 0) + 1;
      return {
        database: database.connectionString.replace(/\/\/[^@]*@/u, "//<redacted>@"),
        workspaceId: database.workspaceId,
        applied: apply,
        checkedAt: now,
        planned: planned.length,
        counts,
        residueBefore,
        residueAfter,
        changes: planned,
      };
    });

    if (apply && receiptPath) writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 });
    // stdout carries counts and a few samples only; the full list (names) stays in the 0600 receipt.
    const samples = receipt.changes.slice(0, 5).map((change) => ({ collection: change.collection, recordId: change.recordId, from: change.from, to: change.to }));
    process.stdout.write(`${JSON.stringify({ ...receipt, changes: undefined, samples }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Backfill failed"}\n`);
    process.exitCode = 1;
  });
}
