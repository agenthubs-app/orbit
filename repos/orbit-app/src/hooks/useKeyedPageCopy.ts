import { useCallback, useMemo, useRef } from "react";

import type { PageCopy, PageCopyId } from "../data/sync/page-copies";
import { usePageCopySession } from "./usePageCopySession";

/**
 * LF2: the device's last answer for one opened item (a keyed page copy), for screens that load in an effect.
 * read() resolves the copy (null without a session, a copy, or one that fails `accept`); save() keeps a
 * server answer. Copies are bound to the lease and deleted with the identity's local database (0131).
 */
export function useKeyedPageCopy<T>(copyId: PageCopyId, variant: string, accept: (data: unknown) => boolean): {
  read(): Promise<PageCopy<T> | null>;
  save(data: T): Promise<void>;
} {
  const { whenReady } = usePageCopySession();
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const read = useCallback(async () => {
    try {
      const session = await whenReady();
      const copy = session ? await session.readPageCopy<T>(copyId, variant) : null;
      return copy && acceptRef.current(copy.data) ? copy : null;
    } catch { return null; }
  }, [copyId, variant, whenReady]);
  const save = useCallback(async (data: T) => {
    try { await (await whenReady())?.savePageCopy(copyId, variant, data); } catch { /* a copy is best effort */ }
  }, [copyId, variant, whenReady]);
  return useMemo(() => ({ read, save }), [read, save]);
}
