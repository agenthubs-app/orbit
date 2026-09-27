import type { Pool } from "pg";
import {
  assertLifecycleNodeSortRuntime,
  LIFECYCLE_SORT_RUNTIME_CTE,
  lifecycleSortRuntimeSchema,
} from "../../features/followups/storage/lifecycle-task-pages";

/**
 * Lifecycle/relationship task pages refuse to run outside the verified sort
 * runtime (Neon PostgreSQL 16.12 with ICU collation 153.136, Node 25.6.0 with
 * ICU 78.2): SQL ordering must match the legacy localeCompare order exactly.
 * That pin is a product guard, so these tests run only where it holds.
 * Returns a skip reason (with the recovery condition) or null when it holds.
 */
export async function lifecycleSortRuntimeSkipReason(pool: Pool): Promise<string | null> {
  const recovery = "recovery: run with ORBIT_LIFECYCLE_TEST_DATABASE_URL on PostgreSQL 16.12 (ICU und-x-icu 153.136, e.g. a Neon restore) under Node 25.6.0 / ICU 78.2";
  try {
    assertLifecycleNodeSortRuntime();
  } catch {
    return `unverified Node sort runtime ${process.versions.node}/ICU ${process.versions.icu}; ${recovery}`;
  }
  const { rows } = await pool.query(`with ${LIFECYCLE_SORT_RUNTIME_CTE} select to_jsonb(runtime) as runtime from runtime`);
  const runtime = rows[0]?.runtime as Record<string, unknown> | undefined;
  if (!lifecycleSortRuntimeSchema.safeParse(runtime).success) {
    return `unverified PostgreSQL sort runtime pg=${String(runtime?.pg)} icu=${String(runtime?.actual)}; ${recovery}`;
  }
  return null;
}
