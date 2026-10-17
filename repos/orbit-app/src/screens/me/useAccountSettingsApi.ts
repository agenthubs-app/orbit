import { useMemo } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { createAccountSettingsApi, settingsFetch } from "./settings-api";
export function useAccountSettingsApi() {
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([auth.actorId]), fetchAdapter: settingsFetch });
  return useMemo(() => createAccountSettingsApi(client), [client]);
}
