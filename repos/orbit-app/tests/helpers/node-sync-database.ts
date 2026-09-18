import { DatabaseSync } from "node:sqlite";

import type {
  LocalSyncDatabase,
  LocalSyncSqlValue,
} from "../../src/data/sync/local-sync-database";

/**
 * In-memory SQLite implementation of the App's LocalSyncDatabase port for
 * Node tests. `failWhenSqlIncludes` injects one failure into the next matching
 * statement so rollback paths can be exercised.
 */
export class NodeTestDatabase implements LocalSyncDatabase {
  readonly database = new DatabaseSync(":memory:");
  statementCount = 0;
  failWhenSqlIncludes: string | null = null;

  async execute(source: string): Promise<void> {
    this.noteStatement(source);
    this.database.exec(source);
  }

  async run(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<{ changes: number }> {
    this.noteStatement(source);
    const result = this.database.prepare(source).run(...parameters);
    return { changes: Number(result.changes) };
  }

  async get<TRow>(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<TRow | null> {
    this.noteStatement(source);
    return (this.database.prepare(source).get(...parameters) as TRow) ?? null;
  }

  async all<TRow>(
    source: string,
    parameters: readonly LocalSyncSqlValue[] = [],
  ): Promise<TRow[]> {
    this.noteStatement(source);
    return this.database.prepare(source).all(...parameters) as TRow[];
  }

  async transaction<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  private noteStatement(source: string): void {
    this.statementCount += 1;
    if (this.failWhenSqlIncludes && source.includes(this.failWhenSqlIncludes)) {
      this.failWhenSqlIncludes = null;
      throw new Error("injected SQL failure");
    }
  }
}
