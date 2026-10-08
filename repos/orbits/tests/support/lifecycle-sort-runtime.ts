import type { Pool } from "pg";
import {
  LIFECYCLE_SORT_RUNTIME_CTE,
  lifecycleSortRuntimeEntryFor,
} from "../../features/followups/storage/lifecycle-task-pages";
import { currentNodeSortRuntime } from "../../shared/storage/sort-runtime";

/**
 * Lifecycle/relationship task pages refuse to run unless (Node side, PostgreSQL side)
 * is a differentially verified pair in VERIFIED_LIFECYCLE_SORT_RUNTIMES (W0034): SQL
 * ordering must match the legacy localeCompare order exactly. The Node patch version
 * and the PostgreSQL minor version are not part of the key, so these tests run on any
 * local PostgreSQL/Node combination that belongs to a verified pair.
 * Returns a skip reason (with the recovery condition) or null when it holds.
 */
export async function lifecycleSortRuntimeSkipReason(pool: Pool): Promise<string | null> {
  const recovery = "recovery: run with ORBIT_LIFECYCLE_TEST_DATABASE_URL on a PostgreSQL/Node pair listed in VERIFIED_LIFECYCLE_SORT_RUNTIMES";
  const { rows } = await pool.query(`with ${LIFECYCLE_SORT_RUNTIME_CTE} select to_jsonb(runtime) as runtime from runtime`);
  const runtime = rows[0]?.runtime as Record<string, unknown> | undefined;
  const node = currentNodeSortRuntime();
  if (!lifecycleSortRuntimeEntryFor(node, runtime)) {
    return `unverified sort runtime pair pg=${String(runtime?.pg)} collversion=${String(runtime?.actual)} node icu=${String(node.icu)} locale=${String(node.collatorLocale)}; ${recovery}`;
  }
  return null;
}
