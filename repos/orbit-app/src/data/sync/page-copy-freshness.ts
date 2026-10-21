/**
 * LF1 (local-first repair): a page copy younger than its page's `freshForMs`
 * is shown without asking the server again, so moving between tabs does not
 * re-read the same server-computed page. Any successful write the app sends
 * (POST/PUT/PATCH/DELETE) ends every fresh window, so the next open after a
 * change reads the server again instead of showing the pre-change copy.
 * Module state only: a cold start has no fresh window older than the process.
 */
let lastWriteAt = 0;

export const pageCopyFreshness = {
  noteWrite(now: number = Date.now()): void {
    lastWriteAt = Math.max(lastWriteAt, now);
  },
  isFresh(syncedAt: string, freshForMs: number, now: number = Date.now()): boolean {
    const saved = Date.parse(syncedAt);
    return Number.isFinite(saved) && saved > lastWriteAt && saved <= now && now - saved < freshForMs;
  },
  /** Tests only. */
  reset(): void {
    lastWriteAt = 0;
  },
};
