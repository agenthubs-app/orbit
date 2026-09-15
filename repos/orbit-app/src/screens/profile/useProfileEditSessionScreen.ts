import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { profileDetailSchema, type ProfileDetail } from "../../api/profile-detail-contract";
import type { ManualProfileContract } from "../../api/contract/profile";
import { validateApiResourceState } from "../../api/validated-resource-state";
import {
  getProfileEditSession,
  openProfileEditSession,
  type ProfileEditSession,
  type ProfileEditSessionScope,
} from "../../data/profile-edit-session";
import { useApiResource, type ApiResourceState } from "../../hooks/useApiResource";

export interface ProfileEditSessionScreenState {
  baseProfile: ManualProfileContract | null;
  refresh: () => void;
  resource: ApiResourceState<ProfileDetail>;
  scope: ProfileEditSessionScope | null;
  session: ProfileEditSession | null;
  syncSession: () => void;
}

export function useProfileEditSessionScreen(): ProfileEditSessionScreenState {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const scope = useMemo<ProfileEditSessionScope | null>(() => auth.actorId && server.ready
    ? { actorId: auth.actorId, apiOrigin: server.baseUrl }
    : null, [auth.actorId, server.baseUrl, server.ready]);
  const scopeKey = scope ? JSON.stringify([scope.apiOrigin, scope.actorId]) : null;
  const resource = validateApiResourceState(useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.profile,
    () => false,
    { cachePolicy: "network-only", scopeKey },
  ), profileDetailSchema);
  const [, setRevision] = useState(0);
  const initialized = useRef("");
  const data = resource.kind === "success" || resource.kind === "empty" ? resource.data : null;
  const baseProfile = data?.profile ? data.profile as unknown as ManualProfileContract : null;
  const profileFingerprint = baseProfile
    ? `${scopeKey ?? ""}:${baseProfile.id}:${baseProfile.updatedAt}`
    : "";

  useEffect(() => {
    if (!scope || !baseProfile || (initialized.current === profileFingerprint && getProfileEditSession(scope))) return;
    initialized.current = profileFingerprint;
    openProfileEditSession(scope, baseProfile);
    setRevision(value => value + 1);
  }, [baseProfile, profileFingerprint, scope]);

  const syncSession = useCallback(() => setRevision(value => value + 1), []);
  return {
    baseProfile,
    refresh: resource.refresh,
    resource,
    scope,
    session: scope ? getProfileEditSession(scope) : null,
    syncSession,
  };
}
