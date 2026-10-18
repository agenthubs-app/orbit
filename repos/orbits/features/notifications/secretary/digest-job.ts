import type { EventDiscoverRow } from '../../../shared/contract/event-discover';
import type { MaintenanceTask } from '../../operations/maintenance/pass';
import { runSecretaryDigest } from './digest';

const PASS_LIMIT = 100;
const THROTTLE_MS = 10 * 60_000;
export const SECRETARY_DIGEST_TASK = 'secretary-digest';

/** The resolver is local DB only. No AI provider or push delivery runs in this task. */
export function createSecretaryDigestMaintenanceTask(input: { resolve: () => Promise<{
  actors(after: string, limit: number): Promise<string[]>;
  recommendations(actorId: string): Promise<readonly EventDiscoverRow[]>;
  write(actorId: string, winner: EventDiscoverRow, tokyoDate: string, at: string): Promise<unknown>;
  clear(actorId: string, tokyoDate: string, at: string): Promise<boolean>;
} | null> }): MaintenanceTask {
  let cursor = '';
  let lastRun = 0;
  return {
    name: SECRETARY_DIGEST_TASK,
    async run({ now }) {
      const at = now();
      if (lastRun && at.getTime() - lastRun < THROTTLE_MS) return { skipped: 'throttled' };
      const deps = await input.resolve();
      if (!deps) return { skipped: 'database_unconfigured' };
      try {
        const result = await runSecretaryDigest({ ...deps, at, after: cursor, limit: PASS_LIMIT });
        cursor = result.nextCursor;
        lastRun = at.getTime();
        return { examined: result.examined, written: result.written, cleared: result.cleared };
      } catch (error) {
        if ((error as { code?: unknown })?.code === '42P01') return { skipped: 'schema_missing' };
        throw error;
      }
    },
  };
}
