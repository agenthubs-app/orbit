import { migrateLocalRead } from "./local-read-migrations";

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

export async function initializeLocalSyncDatabase(
  database: LocalSyncDatabase,
): Promise<void> {
  await migrateLocalRead(database);
}
