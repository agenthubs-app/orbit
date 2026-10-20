import { resolveSupportedInitialRouteHref } from "../../view-models/initial-route";

export function resolveWelcomeEntry({ ready, userId, deletionPending = false, configuredRoute }: {
  ready: boolean;
  userId: string | null;
  deletionPending?: boolean;
  configuredRoute?: string | undefined;
}): "pending" | "welcome" | string {
  if (!ready) return "pending";
  if (deletionPending) return "/account/pending";
  if (configuredRoute) {
    const target = resolveSupportedInitialRouteHref(configuredRoute);
    if (target) return target;
  }
  return userId ? "/home" : "welcome";
}
