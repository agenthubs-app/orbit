import { useEffect, useMemo, useState } from "react";

import { contactDetailPath } from "../../api/endpoints";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { localContactDetail } from "../../view-models/contacts-local";
import { contactDetailToSummary, type ContactSummary } from "../../view-models/contacts";

/**
 * Linked-contact names on notes. Sprint 0116: read from the device copy of the
 * contacts (no request per contact, and they show offline); only a contact the
 * device does not hold yet (e.g. created a moment ago on another device) is
 * read from the server.
 */
export function useNoteContactSummaries(contactIds: readonly string[], scopeKey: string): Map<string, ContactSummary> {
  const client = useOrbitApiClient({ scopeKey });
  const local = useLocalContacts(false);
  const idsKey = [...new Set(contactIds.filter(Boolean))].sort().join("\u0000");
  const ids = useMemo(() => idsKey ? idsKey.split("\u0000") : [], [idsKey]);
  const localSummaries = useMemo(() => {
    const found = new Map<string, ContactSummary>();
    if (!local.available || !local.freshness.readable) return found;
    for (const id of ids) {
      const detail = localContactDetail(local.rows, id);
      if (!detail) continue;
      const summary = contactDetailToSummary(detail);
      if (summary.id === id) found.set(id, summary);
    }
    return found;
  }, [ids, local.available, local.freshness.readable, local.rows]);
  // Before the device copy is readable nothing is fetched (it arrives in a moment); after, only what it lacks.
  const waitForDevice = local.available && !local.freshness.readable && !local.freshness.failure;
  const missingKey = waitForDevice ? "" : ids.filter((id) => !localSummaries.has(id)).join("\u0000");
  const missing = useMemo(() => missingKey ? missingKey.split("\u0000") : [], [missingKey]);
  const [fetched, setFetched] = useState<Map<string, ContactSummary>>(() => new Map());

  useEffect(() => {
    const controller = new AbortController();
    if (!missing.length) {
      setFetched(new Map());
      return () => controller.abort();
    }

    void Promise.all(missing.map(async (contactId) => {
      const result = await client.get<unknown>(contactDetailPath(contactId), { signal: controller.signal });
      if (!result.success || result.status < 200 || result.status >= 300) return null;
      const summary = contactDetailToSummary(result.data);
      return summary.id === contactId ? summary : null;
    })).then((items) => {
      if (controller.signal.aborted) return;
      const next = new Map<string, ContactSummary>();
      items.forEach((item) => { if (item) next.set(item.id, item); });
      setFetched(next);
    }).catch(() => {
      if (!controller.signal.aborted) setFetched(new Map());
    });

    return () => controller.abort();
  }, [client, missing, missingKey]);

  return useMemo(() => new Map([...fetched, ...localSummaries]), [fetched, localSummaries]);
}
