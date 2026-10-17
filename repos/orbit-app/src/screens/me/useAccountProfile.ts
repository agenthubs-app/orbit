import { useLocalSearchParams } from "expo-router";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { profileAccountSchema } from "../../api/schema/profile-account";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { accountProfilePath } from "./account-api";

export function useAccountPath() {
  const params = useLocalSearchParams<{ design?: string }>();
  return accountProfilePath(params.design, typeof __DEV__ !== "undefined" && __DEV__);
}
export function useAccountProfile(scope?: string) {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const path = useAccountPath();
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, server.baseUrl, path, scope]);
  const copied = usePageCopyResource<unknown>(path, () => false, {
    scopeKey, enabled: auth.ready && auth.signedIn && server.ready,
    copy: { id: "self-profile" }, accept: value => profileAccountSchema.safeParse(value).success,
  });
  const resource = validateApiResourceState(copied, profileAccountSchema);
  const data = resource.kind === "success" || resource.kind === "empty" ? resource.data : null;
  return { resource, data, path, scopeKey, offline: copied.copy?.offline === true };
}
