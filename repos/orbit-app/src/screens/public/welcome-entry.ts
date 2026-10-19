import { resolveSupportedInitialRouteHref } from "../../view-models/initial-route";

export function resolveWelcomeEntry({ ready, userId, configuredRoute }: {
  ready: boolean;
  userId: string | null;
  configuredRoute?: string | undefined;
}): "pending" | "welcome" | string {
  if (!ready) return "pending";
  if (configuredRoute) {
    const target = resolveSupportedInitialRouteHref(configuredRoute);
    if (target) return target;
  }
  return userId ? "/home" : "welcome";
}
