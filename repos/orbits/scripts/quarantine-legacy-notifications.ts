/**
 * Quarantine legacy notification records that the notification design says must
 * never become an inbox row.
 *
 * Background: the generated relationship fixtures wrote rows like
 * "复核与 X 的下一步" into the `notifications` collection. They carry no verifiable
 * target, so the legacy feed projected every one of them as "来源已不可用" — 40 rows
 * that tell the reader nothing. The 2026-09-16 notification design is explicit
 * (line 217): such generated records do not migrate into new unread notifications,
 * and an auditable migration record is kept instead of translating them.
 *
 * This marks them quarantined rather than deleting them: the row stays, gains
 * `quarantine` provenance, and leaves every feed.
 *
 * Usage:
 *   npx tsx scripts/quarantine-legacy-notifications.ts                 # dry run
 *   npx tsx scripts/quarantine-legacy-notifications.ts --apply <receipt.json>
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

export const QUARANTINE_REASON = "generated-fixture-below-content-threshold" as const;

export interface LegacyNotificationRow {
  record_id: string;
  title: string | null;
  source_label: string | null;
  quarantined: string | null;
}

/**
 * A row is quarantined when it is a generated fixture notification: it comes from
 * the generated relationship fixture source and its title is one of the template
 * "复核与 X 的下一步" strings. Anything a user or a real producer created is left
 * alone — this script never guesses.
 */
export function planLegacyQuarantine(rows: readonly LegacyNotificationRow[]): LegacyNotificationRow[] {
  return rows.filter((row) => {
    if (row.quarantined) return false;
    const generated = (row.source_label ?? "").includes("Generated relationship");
    const template = /^复核与.+的下一步$/u.test((row.title ?? "").trim());
    return generated && template;
  });
}

const SELECT_SQL = `
  select record_id,
    payload->>'title' as title,
    payload->'source'->>'label' as source_label,
    payload->>'quarantinedAt' as quarantined
  from orbit_records
  where workspace_id = $1 and collection_name = 'notifications' and deleted_at is null
  order by record_id
`;

async function main(argv: readonly string[]): Promise<void> {
  loadLocalEnv();
  const apply = argv[0] === "--apply";
  const receiptPath = argv[1];
  assert.ok(
    argv.length === 0 || (apply && argv.length === 2 && receiptPath && isAbsolute(receiptPath)),
    "Usage: no arguments for a dry run; --apply /absolute/receipt.json to write",
  );

  const database = resolveLiveDatabaseConnectionConfig();
  assert.ok(database, "Configure ORBIT_EVENT_DATABASE_URL before quarantining legacy notifications.");
  const client = createEventOperationsPostgresClient({ connectionString: database.connectionString });

  try {
    const receipt = await client.transaction(async (transaction) => {
      const rows = (await transaction.query(SELECT_SQL, [database.workspaceId])).rows as unknown as LegacyNotificationRow[];
      const planned = planLegacyQuarantine(rows);
      const now = new Date().toISOString();

      if (apply) {
        for (const row of planned) {
          const result = await transaction.query(
            `update orbit_records
               set payload = payload || jsonb_build_object('quarantinedAt', $2::text, 'quarantineReason', $3::text),
                   lifecycle_state = 'archived',
                   updated_at = $2::timestamptz
             where workspace_id = $1 and collection_name = 'notifications' and record_id = $4 and deleted_at is null`,
            [database.workspaceId, now, QUARANTINE_REASON, row.record_id],
          );
          assert.equal(result.rowCount, 1, `Quarantine not acknowledged for ${row.record_id}`);
        }
        const verified = (await transaction.query(SELECT_SQL, [database.workspaceId])).rows as unknown as LegacyNotificationRow[];
        assert.equal(planLegacyQuarantine(verified).length, 0, "Quarantine did not converge");
      }

      return {
        workspaceId: database.workspaceId,
        applied: apply,
        checkedAt: now,
        total: rows.length,
        planned: planned.length,
        reason: QUARANTINE_REASON,
        kept: rows.filter((row) => !planned.includes(row) && !row.quarantined).map((row) => row.record_id),
        quarantined: planned.map((row) => ({ recordId: row.record_id, title: row.title })),
      };
    });

    if (apply && receiptPath) writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ...receipt, quarantined: receipt.quarantined.length }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Quarantine failed"}\n`);
    process.exitCode = 1;
  });
}
