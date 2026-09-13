import { useMemo } from "react";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { createOrbitApiClient } from "../api/client";

export function useHomeDashboardClient() {
  const { baseUrl } = useOrbitApiBaseUrl();
  const auth = useOrbitAuthSession();
  const actor = auth.user?.id ?? "";
  return useMemo(() => createOrbitApiClient({
    baseUrl,
    authCookieHeader: auth.cookieHeader,
    // Do not coalesce empty-cookie browser GETs across actors. Reject an
    // aborted response before the client can broadcast a stale 401.
    fetchImpl: async (input, init) => {
      const response = await fetch(input, init);
      if (init?.signal?.aborted) throw new Error("Inactive home request");
      return response;
    },
  }), [actor, auth.cookieHeader, baseUrl]);
}
