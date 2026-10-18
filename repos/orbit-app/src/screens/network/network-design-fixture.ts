// PX1: A local, actor-scoped copy of the R11b four-state people for R11a pixel checks.
// The endpoint and this reader are available only in a development build with `network` enabled.
import { useCallback, useEffect, useState } from "react";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { readSnapshot, writeSnapshot } from "../../data/snapshot-store";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { networkDesignEnabled, parseNetworkDesignContacts, type NetworkDesignContacts } from "./network-design-fixture-data";

export const NETWORK_DESIGN_FIXTURE_PATH = "/api/dev/network-design-fixture?contacts=1";

export function useNetworkDesignContacts() {
  const enabled = networkDesignEnabled();
  const auth = useOrbitAuthSession();
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const [data, setData] = useState<NetworkDesignContacts | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [offline, setOffline] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setData(null);
    setLoading(true);
    setOffline(false);
    setFailure(null);
    if (!auth.ready || !baseUrlReady || !auth.actorId || !auth.signedIn) return () => { live = false; };
    const actorId = auth.actorId;
    void (async () => {
      const kept = await readSnapshot<unknown>(baseUrl, actorId, NETWORK_DESIGN_FIXTURE_PATH).catch(() => null);
      const cached = kept?.result.success ? parseNetworkDesignContacts(kept.result.data, actorId) : null;
      if (!live) return;
      if (cached) { setData(cached); setLoading(false); setLastSyncedAt(kept?.syncedAt ?? null); }
      const result = await client.get<unknown>(NETWORK_DESIGN_FIXTURE_PATH).catch(() => null);
      if (!live) return;
      const parsed = result?.success ? parseNetworkDesignContacts(result.data, actorId) : null;
      if (parsed && result?.success) {
        setData(parsed); setLoading(false); setOffline(false); setFailure(null);
        setLastSyncedAt(new Date().toISOString());
        void writeSnapshot(baseUrl, actorId, NETWORK_DESIGN_FIXTURE_PATH, result).catch(() => undefined);
      } else {
        setLoading(false); setOffline(Boolean(cached));
        setFailure(cached ? null : "Network design fixture is unavailable.");
      }
    })();
    return () => { live = false; };
  }, [enabled, auth.ready, auth.actorId, auth.signedIn, baseUrlReady, baseUrl, client, tick]);

  return { enabled, data, loading, offline, failure, lastSyncedAt, refresh };
}
