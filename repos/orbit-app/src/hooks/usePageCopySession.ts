import { useCallback, useEffect, useRef } from "react";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import type { SyncCoordinatorSession } from "../data/sync/sync-coordinator";
import { useSyncCoordinatorSession } from "./useSyncedCollection";

/** How long a page waits for the coordinator session before giving up on its copy. */
export const PAGE_COPY_SESSION_WAIT_MS = 300;

/**
 * Sprint 0131: the coordinator session that holds page copies, plus
 * `whenReady()` for code that runs before it exists. The session is opened by an
 * effect, so a request that fails (offline) or succeeds before it opens would
 * otherwise miss the copy: `whenReady` resolves as soon as the session opens (or
 * null when signed out, or after PAGE_COPY_SESSION_WAIT_MS).
 */
export function usePageCopySession(enabled = true): { session: SyncCoordinatorSession | null; whenReady(): Promise<SyncCoordinatorSession | null> } {
  const auth = useOrbitAuthSession();
  const active = enabled && auth.ready && auth.signedIn && Boolean(auth.actorId);
  const session = useSyncCoordinatorSession(active);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const activeRef = useRef(active);
  activeRef.current = active;
  const waiters = useRef(new Set<(value: SyncCoordinatorSession | null) => void>());

  useEffect(() => {
    if (!session) return;
    for (const waiter of [...waiters.current]) waiter(session);
  }, [session]);
  useEffect(() => () => {
    for (const waiter of [...waiters.current]) waiter(null);
  }, []);

  const whenReady = useCallback(() => new Promise<SyncCoordinatorSession | null>((resolve) => {
    if (sessionRef.current) { resolve(sessionRef.current); return; }
    if (!activeRef.current) { resolve(null); return; }
    const done = (value: SyncCoordinatorSession | null) => {
      waiters.current.delete(done);
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), PAGE_COPY_SESSION_WAIT_MS);
    waiters.current.add(done);
  }), []);

  return { session, whenReady };
}
