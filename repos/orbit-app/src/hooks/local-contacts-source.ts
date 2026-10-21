import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ContactSyncPayload } from "../api/contract/contact-local-directory";
import { buildOfflineContactDelete } from "../data/sync/contact-outbox-mutation";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { contactSyncPayloads } from "../view-models/contacts-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0116: the account's contacts from the device mirror (sync domain
 * "contacts"), shared by useLocalContacts (native: the mirror is always the
 * source) and useLocalContacts.web.ts (only when the browser mirror is active).
 * A page's primary consumer probes the server on open (0108 pattern), so a
 * lost connection turns into the 「截至」 notice.
 * LF12: a contact deleted offline waits in the outbox and is left out of `rows`
 * (every screen that reads the device's contacts) until the server acknowledges it.
 */
export interface LocalContactsState {
  /** The device mirror is this platform's source for contacts. */
  available: boolean;
  rows: readonly ContactSyncPayload[];
  freshness: MirrorFreshness;
  refresh(): void;
  /** LF12: queue a delete made offline; false when this device cannot keep it (no mirror, not on the device). */
  queueDelete(contactId: string): Promise<boolean>;
  /** LF12: 元に戻す while the delete is still queued; false once it was sent (restore through the API). */
  cancelDelete(contactId: string): Promise<boolean>;
}

const NO_IDS: ReadonlySet<string> = new Set();

export function useLocalContactsSource(available: boolean, probe: boolean, queueable = true): LocalContactsState {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "contact" });
  const refresh = state.refresh;
  // The session getter through a ref: the callbacks and the returned state stay stable while it is re-created.
  const sessionOf = useRef(() => state.currentSession?.() ?? null);
  sessionOf.current = () => state.currentSession?.() ?? null;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const [pendingDeletes, setPendingDeletes] = useState<ReadonlySet<string>>(NO_IDS);
  const pendingNow = useRef(pendingDeletes);
  // Only an actual change sets state: a same-value update still renders, and a re-created rows array would loop.
  const keepPending = useCallback((ids: readonly string[]) => {
    const previous = pendingNow.current;
    if (previous.size === ids.length && ids.every((id) => previous.has(id))) return;
    pendingNow.current = ids.length ? new Set(ids) : NO_IDS;
    setPendingDeletes(pendingNow.current);
  }, []);
  // Re-read whenever the rows change: an enqueue, a cancel or an acknowledgement emits an outbox change that re-reads them.
  useEffect(() => {
    let live = true;
    const session = available ? sessionOf.current() : null;
    if (!session) { keepPending([]); return; }
    void Promise.resolve().then(() => session.readOutboxOverlay?.("contact") ?? null).then((overlay) => {
      if (!live) return;
      const ids = (overlay?.queuedMutations ?? []).filter((item) => item.operation === "delete" && (item.state === "queued" || item.state === "sending")).map((item) => item.id);
      keepPending(ids);
    }, () => undefined);
    return () => { live = false; };
  }, [available, keepPending, state.records]);
  const all = useMemo(() => (available ? contactSyncPayloads(state.records) : []), [available, state.records]);
  // The routes name a contact by its card id; the mirror row (what is hidden and tombstoned) may carry another id.
  const recordIdOf = useCallback((contactId: string) => (all.find((row) => row.card?.id === contactId) ?? all.find((row) => row.id === contactId))?.id ?? null, [all]);
  const queueDelete = useCallback(async (contactId: string) => {
    const session = available && queueable ? sessionOf.current() : null;
    const recordId = recordIdOf(contactId);
    if (!session || !recordId) return false;
    try {
      await session.enqueueOfflineContactDelete(buildOfflineContactDelete({ mutationId: Crypto.randomUUID(), recordId, contactId, createdAt: new Date().toISOString() }));
      return true;
    } catch { return false; }
  }, [available, queueable, recordIdOf]);
  const cancelDelete = useCallback(async (contactId: string) => {
    const session = available ? sessionOf.current() : null;
    if (!session) return false;
    try { return await session.cancelOfflineContactDelete(contactId); } catch { return false; }
  }, [available]);
  const rows = useMemo(() => (pendingDeletes.size ? all.filter((row) => !pendingDeletes.has(row.id)) : all), [all, pendingDeletes]);
  return useMemo(() => ({ available, rows, freshness, refresh: () => { void refresh(); }, queueDelete, cancelDelete }),
    [available, rows, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh, queueDelete, cancelDelete]);
}
