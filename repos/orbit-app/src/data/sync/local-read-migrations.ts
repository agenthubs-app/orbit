import type { LocalSyncDatabase } from "./local-sync-database";
import { LOCAL_SYNC_SCHEMA_STATEMENTS, LOCAL_SYNC_SCHEMA_VERSION } from "./local-sync-schema";

/** One keyed connection and one transaction; legacy rows never acquire an epoch. */
export async function migrateLocalRead(database: LocalSyncDatabase): Promise<void> {
  await database.transaction(async () => {
    const meta = await database.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_meta'");
    const stored = meta ? await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key='schema_version'") : null;
    const version = stored ? Number(stored.value) : 0;
    if (!Number.isInteger(version) || version < 0 || version > LOCAL_SYNC_SCHEMA_VERSION || (meta && !stored)) {
      throw new Error("local sync schema version is unsupported");
    }
    if (version === 1) {
      // Copy/validate before swapping. Outbox and device drafts remain untouched.
      for (const [source, quarantine] of [["sync_records", "legacy_read_records"], ["sync_cursors", "legacy_read_cursors"]] as const) {
        await database.execute(`CREATE TABLE ${quarantine} AS SELECT * FROM ${source}`);
        const mismatch = await database.get<{ count: number }>(`SELECT
          (SELECT COUNT(*) FROM ${source}) - (SELECT COUNT(*) FROM ${quarantine}) AS count`);
        const missing = await database.all(`SELECT * FROM ${source} EXCEPT SELECT * FROM ${quarantine}`);
        if (mismatch?.count !== 0 || missing.length !== 0) throw new Error("local read migration copy validation failed");
      }
      await database.execute("DROP INDEX IF EXISTS sync_records_ordered");
      await database.execute("ALTER TABLE sync_records RENAME TO migration_records_v1");
      await database.execute("ALTER TABLE sync_cursors RENAME TO migration_cursors_v1");
    }
    if (version === 2) {
      // v3: the scope cursor remembers the server high watermark so a manifest can prove "unchanged".
      const columns = await database.all<{ name: string }>("PRAGMA table_info(sync_cursors)");
      if (!columns.some((column) => column.name === "high_watermark")) {
        await database.execute("ALTER TABLE sync_cursors ADD COLUMN high_watermark TEXT");
      }
    }
    for (const statement of LOCAL_SYNC_SCHEMA_STATEMENTS) await database.execute(statement);
    if (version === 1) {
      await database.execute("DROP TABLE migration_records_v1");
      await database.execute("DROP TABLE migration_cursors_v1");
    }
    // Validate replacement key shape, including on re-entry. No CREATE-only upgrade.
    for (const table of ["sync_records", "sync_cursors"]) {
      const columns = await database.all<{ name: string; pk: number }>(`PRAGMA table_info(${table})`);
      const key = columns.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk).map(column => column.name);
      const expected = table === "sync_records" ? ["workspace_id", "domain_id", "authorization_epoch", "record_id"] : ["workspace_id", "domain_id", "authorization_epoch"];
      if (JSON.stringify(key) !== JSON.stringify(expected)) throw new Error("local read schema key validation failed");
    }
    const violations = await database.all("PRAGMA foreign_key_check");
    if (violations.length) throw new Error("local read schema constraint validation failed");
    for (const [key, value] of [["schema_version", String(LOCAL_SYNC_SCHEMA_VERSION)], ["encryption_state", "encrypted"], ["migration_checkpoint", String(LOCAL_SYNC_SCHEMA_VERSION)]] as const) {
      await database.run(`INSERT INTO sync_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
    }
  });
}
