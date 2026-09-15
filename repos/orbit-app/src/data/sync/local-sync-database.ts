import {
  LOCAL_SYNC_SCHEMA_STATEMENTS,
  LOCAL_SYNC_SCHEMA_VERSION,
} from "./local-sync-schema";

export type LocalSyncSqlValue = string | number | bigint | null | Uint8Array;

export interface LocalSyncDatabase {
  execute(source: string): Promise<void>;
  run(
    source: string,
    parameters?: readonly LocalSyncSqlValue[],
  ): Promise<{ changes: number }>;
  get<TRow>(
    source: string,
    parameters?: readonly LocalSyncSqlValue[],
  ): Promise<TRow | null>;
  all<TRow>(
    source: string,
    parameters?: readonly LocalSyncSqlValue[],
  ): Promise<TRow[]>;
  transaction<TResult>(operation: () => Promise<TResult>): Promise<TResult>;
}

interface SchemaVersionRow {
  value: string;
}

export async function initializeLocalSyncDatabase(
  database: LocalSyncDatabase,
): Promise<void> {
  await database.transaction(async () => {
    for (const statement of LOCAL_SYNC_SCHEMA_STATEMENTS) {
      await database.execute(statement);
    }

    const storedVersion = await database.get<SchemaVersionRow>(
      "SELECT value FROM sync_meta WHERE key = ?",
      ["schema_version"],
    );
    if (storedVersion) {
      const version = Number(storedVersion.value);
      if (!Number.isInteger(version) || version > LOCAL_SYNC_SCHEMA_VERSION) {
        throw new Error("local sync schema version is unsupported");
      }
    }

    await database.run(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ["schema_version", String(LOCAL_SYNC_SCHEMA_VERSION)],
    );
    await database.run(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ["encryption_state", "encrypted"],
    );
    await database.run(
      `INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ["migration_checkpoint", String(LOCAL_SYNC_SCHEMA_VERSION)],
    );
  });
}
