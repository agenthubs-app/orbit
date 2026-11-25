import {
  PROFILE_ONBOARDING_FLOW_ROUTE,
  normalizeProfileOnboardingNext,
  profileOnboardingFlowPath,
} from "./profile-onboarding-navigation";

const APP_ROUTE_PREFIX = "/app";
const ACCOUNT_ROUTE_PREFIX = "/app/account";
const PROFILE_ROUTE = "/app/profile";
const PROFILE_CONTINUE_ROUTE = "/app/profile/continue";

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

/**
 * 引导是不是已经走完（门禁与登录后的 /app/profile/continue 共用这一条；App 同一口径）。
 * 没有流程记录的老账号、走完的、以前点过「あとで設定する」且目标和自我介绍都填过的算走完；其余回引导接着走。
 * 只对资料已 complete 的账号有意义：资料不全一律回引导，不必看流程。
 */
export function profileOnboardingSettled(input: {
  answered: boolean | undefined;
  flow: { deferred: boolean; finishedAt: string | null } | null;
}): boolean {
  return !input.flow || Boolean(input.flow.finishedAt) || Boolean(input.flow.deferred && input.answered);
}

/** 站内换页的请求带 `_rsc`，不属于页面地址。 */
export function requestSearchWithoutRsc(search: string): string {
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
