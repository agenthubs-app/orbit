import { normalizeOrbitAuthReturnPath } from "../../../../features/auth/app-auth-routing";

const PROFILE_ROUTE_PREFIX = "/app/profile";
const PROFILE_CONTINUE_ROUTE = "/app/profile/continue";

function pathnameOf(value: string): string | null {
  try {
    const pathname = new URL(value, "https://orbit.local").pathname;
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isBlockedDestination(pathname: string | null): boolean {
  return Boolean(
    pathname &&
      (pathname === PROFILE_ROUTE_PREFIX ||
        pathname.startsWith(`${PROFILE_ROUTE_PREFIX}/`) ||
        pathname === "/app/account" ||
        pathname.startsWith("/app/account/")),
  );
}

/**
 * Normalize a post-onboarding destination and reject destinations that would
 * send the user back through the profile or auth flow indefinitely.
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
 * The existing auth boundary may wrap a deep link once as
 * `/app/profile/continue?next=...` before rendering the client form. Unwrap
 * only that known wrapper; the regular onboarding normalizer still rejects a
 * continuation/profile/auth destination supplied as the inner value.
 */
export function normalizeProfileAuthReturnPath(
  value: string | string[] | null | undefined,
  fallback = "/app/home",
): string {
  const safeFallback = normalizeProfileOnboardingNext(fallback);
  const normalized = normalizeOrbitAuthReturnPath(value, safeFallback);

  if (pathnameOf(normalized) !== PROFILE_CONTINUE_ROUTE) {
    return normalizeProfileOnboardingNext(normalized, safeFallback);
  }

  try {
    const innerNext = new URL(normalized, "https://orbit.local").searchParams.get(
      "next",
    );
    return innerNext
      ? normalizeProfileOnboardingNext(innerNext, safeFallback)
      : safeFallback;
  } catch {
    return safeFallback;
  }
}

export function profileOnboardingPath(next: string): string {
  const safeNext = normalizeProfileOnboardingNext(next);
  return `${PROFILE_ROUTE_PREFIX}?onboarding=1&next=${encodeURIComponent(safeNext)}`;
}

export function profileContinuationPath(next: string): string {
  const safeNext = normalizeProfileOnboardingNext(next);
  return `${PROFILE_CONTINUE_ROUTE}?next=${encodeURIComponent(safeNext)}`;
}
