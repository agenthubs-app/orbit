import { normalizeOrbitAuthReturnPath } from "../../../../features/auth/app-auth-routing";

const PROFILE_ROUTE_PREFIX = "/app/profile";
const PROFILE_CONTINUE_ROUTE = "/app/profile/continue";
export const PROFILE_ONBOARDING_FLOW_ROUTE = "/app/profile/onboarding";

function pathnameOf(value: string): string | null {
  try {
    const pathname = new URL(value, "https://orbit.local").pathname;
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/**
 * 引导 / 续接这两个流程页自身与账户页（登录、注册、改密等）不能当去处，否则会绕回流程里。
 * 其余资料页（/app/profile、/app/profile/goal-editor …）可以：登录前打开它们，登录后照样回去。
 */
function isBlockedDestination(pathname: string | null): boolean {
  return Boolean(
    pathname &&
      (pathname === PROFILE_CONTINUE_ROUTE ||
        pathname === PROFILE_ONBOARDING_FLOW_ROUTE ||
        pathname === "/app/account" ||
        pathname.startsWith("/app/account/")),
  );
}

/**
 * Normalize a post-onboarding destination and reject destinations that would
 * send the user back through the profile or auth flow indefinitely. A flow
 * page that carries its own `?next=` (login, signup, continue, onboarding) is
 * unwrapped to its innermost safe destination by `normalizeOrbitAuthReturnPath`.
 */
export function normalizeProfileOnboardingNext(
  value: string | string[] | null | undefined,
  fallback = "/app/home",
): string {
  const normalizedFallback = normalizeOrbitAuthReturnPath(fallback, "/app/home");
  const safeFallback = isBlockedDestination(pathnameOf(normalizedFallback))
    ? "/app/home"
    : normalizedFallback;
  const normalized = normalizeOrbitAuthReturnPath(value, safeFallback);
  const pathname = pathnameOf(normalized);

  if (isBlockedDestination(pathname)) {
    return safeFallback;
  }

  return normalized;
}

/**
 * The login / signup forms read `?next=` with this. Kept as the forms' entry
 * point; wrapped flow pages (`/app/profile/continue?next=…`,
 * `/app/profile/onboarding?next=…`, nested login links) are unwrapped to the
 * innermost destination instead of being dropped to the home page.
 */
export function normalizeProfileAuthReturnPath(
  value: string | string[] | null | undefined,
  fallback = "/app/home",
): string {
  return normalizeProfileOnboardingNext(value, normalizeProfileOnboardingNext(fallback));
}

export function profileOnboardingPath(next: string): string {
  const safeNext = normalizeProfileOnboardingNext(next);
  return `${PROFILE_ROUTE_PREFIX}?onboarding=1&next=${encodeURIComponent(safeNext)}`;
}

/** 新用户引导（首次登录 / 资料门禁的落点）；next 为完成或跳过后的去处。 */
export function profileOnboardingFlowPath(next: string): string {
  const safeNext = normalizeProfileOnboardingNext(next);
  return `${PROFILE_ONBOARDING_FLOW_ROUTE}?next=${encodeURIComponent(safeNext)}`;
}

export function profileContinuationPath(next: string): string {
  // 2026-11-26：招待页 `/i/<码>` 也先经续接页——新用户先走完三步引导再回招待页（旧做法 R15 直接回去、跳过引导）。
  const safeNext = normalizeProfileOnboardingNext(next);
  return `${PROFILE_CONTINUE_ROUTE}?next=${encodeURIComponent(safeNext)}`;
}
