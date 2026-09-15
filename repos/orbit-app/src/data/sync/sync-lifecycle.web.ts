import type { LocalSyncDatabase } from "./local-sync-database";
import type { SyncSessionScope } from "./sync-database-key";

// Metro's Web entry never loads native storage or SQLCipher initialization.
export const syncLifecycle = {
  async setScope(_scope: SyncSessionScope | null): Promise<boolean> {
    return true;
  },
  async withDatabase<T>(
    _scope: SyncSessionScope | null,
    _operation: (database: LocalSyncDatabase) => Promise<T>,
  ): Promise<T | null> {
    return null;
  },
};
