import { useMemo } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createOrbitApiClient, type FetchLike, type OrbitApiClient } from "../api/client";

export function useOrbitApiClient({ scopeKey, fetchAdapter }: { scopeKey?: string; fetchAdapter?: (fetcher: FetchLike) => FetchLike } = {}): OrbitApiClient {
  const { baseUrl } = useOrbitApiBaseUrl();
  const auth = useOrbitAuthSession();
  const fetchImpl = useMemo<FetchLike>(() => {
    const fetcher = fetchAdapter ? fetchAdapter(fetch) : fetch;
    return scopeKey === undefined ? fetcher : async (input, init) => {
      const response = await fetcher(input, init);
      // Opt-in consumers revoke requests when their identity or screen changes.
      // Suppress a revoked response before it can publish a stale session expiry.
      if (init?.signal?.aborted) throw new Error("Inactive scoped request");
      return response;
    };
  }, [scopeKey, fetchAdapter]);

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
