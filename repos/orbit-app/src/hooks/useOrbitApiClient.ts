import { useMemo } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createOrbitApiClient, type FetchLike, type OrbitApiClient } from "../api/client";

export function useOrbitApiClient({ scopeKey }: { scopeKey?: string } = {}): OrbitApiClient {
  const { baseUrl } = useOrbitApiBaseUrl();
  const auth = useOrbitAuthSession();
  const fetchImpl = useMemo<FetchLike>(() => scopeKey === undefined ? fetch : async (input, init) => {
    const response = await fetch(input, init);
    // Opt-in consumers revoke requests when their identity or screen changes.
    // Suppress a revoked response before it can publish a stale session expiry.
    if (init?.signal?.aborted) throw new Error("Inactive scoped request");
    return response;
  }, [scopeKey]);

  return useMemo(
    () =>
      createOrbitApiClient({
        authCookieHeader: auth.cookieHeader,
        baseUrl,
        fetchImpl
      }),
    [auth.cookieHeader, baseUrl, fetchImpl]
  );
}
