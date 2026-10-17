import { useMemo } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { createOrbitApiClient } from "../../api/client";
import { createAccountSettingsApi, settingsFetch } from "./settings-api";
export function useAccountSettingsApi() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl();
  return useMemo(() => createAccountSettingsApi(createOrbitApiClient({ baseUrl: server.baseUrl, authCookieHeader: auth.cookieHeader, fetchImpl: settingsFetch(fetch) })), [auth.actorId, auth.cookieHeader, server.baseUrl]);
}
