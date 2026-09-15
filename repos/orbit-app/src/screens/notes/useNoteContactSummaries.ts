import { useEffect, useMemo, useState } from "react";

import { contactDetailPath } from "../../api/endpoints";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { contactDetailToSummary, type ContactSummary } from "../../view-models/contacts";

export function useNoteContactSummaries(contactIds: readonly string[], scopeKey: string): Map<string, ContactSummary> {
  const client = useOrbitApiClient({ scopeKey });
  const idsKey = [...new Set(contactIds.filter(Boolean))].sort().join("\u0000");
  const ids = useMemo(() => idsKey ? idsKey.split("\u0000") : [], [idsKey]);
  const [summaries, setSummaries] = useState<Map<string, ContactSummary>>(() => new Map());

  useEffect(() => {
    const controller = new AbortController();
    if (!ids.length) {
      setSummaries(new Map());
      return () => controller.abort();
    }

    void Promise.all(ids.map(async (contactId) => {
      const result = await client.get<unknown>(contactDetailPath(contactId), { signal: controller.signal });
      if (!result.success || result.status < 200 || result.status >= 300) return null;
      const summary = contactDetailToSummary(result.data);
      return summary.id === contactId ? summary : null;
    })).then((items) => {
      if (controller.signal.aborted) return;
      const next = new Map<string, ContactSummary>();
      items.forEach((item) => { if (item) next.set(item.id, item); });
      setSummaries(next);
    }).catch(() => {
      if (!controller.signal.aborted) setSummaries(new Map());
    });

    return () => controller.abort();
  }, [client, ids, idsKey]);

  return summaries;
}
