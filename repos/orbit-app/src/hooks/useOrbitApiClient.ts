import { useMemo } from "react";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { createOrbitApiClient, type OrbitApiClient } from "../api/client";

export function useOrbitApiClient(): OrbitApiClient {
  const { baseUrl } = useOrbitApiBaseUrl();
  const auth = useOrbitAuthSession();

  return useMemo(
    () =>
      createOrbitApiClient({
        authCookieHeader: auth.cookieHeader,
        baseUrl
      }),
    [auth.cookieHeader, baseUrl]
  );
}
