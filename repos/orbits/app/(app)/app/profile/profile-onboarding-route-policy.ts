import {
  PROFILE_ONBOARDING_FLOW_ROUTE,
  normalizeProfileOnboardingNext,
  profileOnboardingFlowPath,
} from "./profile-onboarding-navigation";

const APP_ROUTE_PREFIX = "/app";
const ACCOUNT_ROUTE_PREFIX = "/app/account";
const PROFILE_ROUTE = "/app/profile";
const PROFILE_CONTINUE_ROUTE = "/app/profile/continue";
/**
 * W0006 引导页：资料未完成的新用户也要能进（它本身就是引导的一部分）。只豁免这一条路径，
 * 不含子路径；开关关闭时页面自己重定向到 `/app/agent`，那里照常走门禁。
 */
const START_GUIDE_ROUTE = "/app/start";

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProfileOnboardingNavigationExemptPath(
  pathname: string,
): boolean {
  return (
    matchesRoutePrefix(pathname, ACCOUNT_ROUTE_PREFIX) ||
    pathname === PROFILE_ROUTE ||
    pathname === PROFILE_CONTINUE_ROUTE ||
    pathname === PROFILE_ONBOARDING_FLOW_ROUTE ||
    pathname === START_GUIDE_ROUTE ||
    pathname === "/app/admin/access" ||
    pathname === "/app/login-admin"
  );
}

export function shouldGateProfileOnboardingRequest(input: {
  authenticated: boolean;
  method: string;
  pathname: string;
}): boolean {
  if (!input.authenticated || (input.method !== "GET" && input.method !== "HEAD")) {
    return false;
  }

  if (!matchesRoutePrefix(input.pathname, APP_ROUTE_PREFIX)) {
    return false;
  }

  return !isProfileOnboardingNavigationExemptPath(input.pathname);
}

function requestSearchWithoutRsc(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("_rsc");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function profileOnboardingRedirectPath(input: {
  pathname: string;
  search: string;
}): string {
  const next = normalizeProfileOnboardingNext(
    `${input.pathname}${requestSearchWithoutRsc(input.search)}`,
  );
  return profileOnboardingFlowPath(next);
}
