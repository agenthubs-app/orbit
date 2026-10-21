import type { SyncCoordinatorSession } from "./sync-coordinator";
import type { PageCopyId } from "./page-copies";
import { pageCopyFreshness } from "./page-copy-freshness";

export type PageCopyThrough<R, T> =
  | { from: "copy" | "server"; data: T; offlineAt: string | null }
  | { from: "failed"; result: R };

/**
 * LF9: a read for screens that load imperatively (an effect or a callback). A copy saved within `freshForMs`
 * and after the app's last accepted write is used without a request (unless `force`); otherwise the server is
 * read and an accepted answer saved; when the server cannot be reached the copy is used with `offlineAt` (its
 * save time, for 「截至」). `answer` turns the read's result into data, a network failure, or another failure.
 */
export async function readThroughPageCopy<R, T>(
  whenReady: () => Promise<SyncCoordinatorSession | null>,
  copy: { id: PageCopyId; variant: string },
  options: { freshForMs: number; force?: boolean; accept(value: unknown): boolean },
  read: () => Promise<R>,
  answer: (result: R) => { data: T } | { network: boolean },
): Promise<PageCopyThrough<R, T>> {
  const session = await whenReady().catch(() => null);
  const stored = session ? await session.readPageCopy<T>(copy.id, copy.variant).catch(() => null) : null;
  const kept = stored && options.accept(stored.data) ? stored : null;
  if (kept && !options.force && pageCopyFreshness.isFresh(kept.syncedAt, options.freshForMs)) return { from: "copy", data: kept.data, offlineAt: null };
  const result = await read();
  const outcome = answer(result);
  if ("data" in outcome) {
    if (options.accept(outcome.data)) void session?.savePageCopy(copy.id, copy.variant, outcome.data).catch(() => undefined);
    return { from: "server", data: outcome.data, offlineAt: null };
  }
  return outcome.network && kept ? { from: "copy", data: kept.data, offlineAt: kept.syncedAt } : { from: "failed", result };
}
