import type { Pool } from "pg";
import {
  LIFECYCLE_SORT_RUNTIME_CTE,
  lifecycleSortRuntimeSchema,
} from "../../features/followups/storage/lifecycle-task-pages";

/**
 * Lifecycle/relationship task pages refuse to run unless the database collation is
 * the verified one (ICU und-x-icu 153.136, deterministic, UTF8): SQL ordering must
 * match the legacy localeCompare order exactly. Since 0126 the Node version and the
 * PostgreSQL server version are no longer part of that guard, so these tests run on
 * any local PostgreSQL that reports the verified collation.
 * Returns a skip reason (with the recovery condition) or null when it holds.
 */
export async function lifecycleSortRuntimeSkipReason(pool: Pool): Promise<string | null> {
  const recovery = "recovery: run with ORBIT_LIFECYCLE_TEST_DATABASE_URL on a PostgreSQL whose ICU und-x-icu collation version is 153.136";
  const { rows } = await pool.query(`with ${LIFECYCLE_SORT_RUNTIME_CTE} select to_jsonb(runtime) as runtime from runtime`);
  const runtime = rows[0]?.runtime as Record<string, unknown> | undefined;
  if (!lifecycleSortRuntimeSchema.safeParse(runtime).success) {
    return `unverified PostgreSQL sort runtime pg=${String(runtime?.pg)} icu=${String(runtime?.actual)}; ${recovery}`;
  }
  return null;
}
