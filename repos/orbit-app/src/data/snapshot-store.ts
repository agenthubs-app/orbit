import type { ApiResult } from "../api/types";
import { syncLifecycle } from "./sync/sync-lifecycle";
import {
  appPerformanceInput,
  appPerformanceScenarioForPath,
  isAppPerformanceEnabled,
  measureAppPerformance,
} from "../performance/app-performance";

// Old pages retain their snapshot interface; the authenticated lifecycle owns
// the encrypted file. Page parameters can never open or switch an actor scope.
export function snapshotKey(baseUrl: string, actorId: string, path: string): string {
  return `v2|${encodeURIComponent(baseUrl)}|${encodeURIComponent(actorId)}|${path}`;
}

interface SnapshotRow {
  payload: string;
  status: number;
  synced_at: string;
}

export interface SnapshotRecord<TData> {
  result: ApiResult<TData>;
  syncedAt: string;
}

export async function readSnapshot<TData>(
  baseUrl: string,
  actorId: string,
  path: string
): Promise<SnapshotRecord<TData> | null> {
  return syncLifecycle.withDatabase({ baseUrl, actorId }, async db => {
    const readAndParse = async (): Promise<SnapshotRecord<TData> | null> => {
      const row = await db.get<SnapshotRow>(
        "SELECT payload, status, synced_at FROM legacy_api_snapshots WHERE path = ?",
        [snapshotKey(baseUrl, actorId, path)]
      );
      if (!row) return null;
      return {
        result: {
          data: JSON.parse(row.payload) as TData,
          meta: { featureMode: null, privacy: null, runtimeBoundary: null },
          status: row.status,
          success: true
        },
        syncedAt: row.synced_at
      };
    };
    const scenario = isAppPerformanceEnabled()
      ? appPerformanceScenarioForPath(path)
      : null;
    return scenario
      ? measureAppPerformance(appPerformanceInput("app.snapshot", scenario), readAndParse)
      : readAndParse();
  });
}

export async function writeSnapshot<TData>(
  baseUrl: string,
  actorId: string,
  path: string,
  result: ApiResult<TData>
): Promise<void> {
  if (!result.success) {
    return;
  }
  await syncLifecycle.withDatabase({ baseUrl, actorId }, async db => {
    const persist = () => db.run(
      `INSERT INTO legacy_api_snapshots (path, payload, status, synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         payload = excluded.payload,
         status = excluded.status,
         synced_at = excluded.synced_at`,
      [snapshotKey(baseUrl, actorId, path), JSON.stringify(result.data), result.status, new Date().toISOString()]
    );
    const scenario = isAppPerformanceEnabled()
      ? appPerformanceScenarioForPath(path)
      : null;
    if (scenario) {
      await measureAppPerformance(appPerformanceInput("app.snapshot", scenario), persist);
    } else {
      await persist();
    }
  });
}

// Explicit cache invalidation retains the current key and other mirror tables.
// Authentication logout instead purges the whole scope through syncLifecycle.
export async function clearSnapshots(): Promise<void> {
  await syncLifecycle.withDatabase(null, db => db.run("DELETE FROM legacy_api_snapshots"));
}
