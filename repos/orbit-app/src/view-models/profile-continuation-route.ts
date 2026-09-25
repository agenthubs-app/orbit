import {
  resolveSupportedInitialRouteHref,
  type InitialRouteHref
} from "./initial-route";

const FALLBACK_DESTINATION = "/home" as const;
const AUTH_ENTRY_PATHS = new Set([
  "/account/forgot-password",
  "/account/login",
  "/account/reset-password",
  "/account/signup",
  "/login-admin"
]);
const MAX_NESTED_NEXT_DEPTH = 8;

function routeParts(href: string): { pathname: string; query: string } {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  return {
    pathname: queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex),
    query: queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1)
  };
}

function safeDestination(
  candidate: string | undefined,
  ancestry: ReadonlySet<string> = new Set(),
  depth = 0
): InitialRouteHref | null {
  if (depth > MAX_NESTED_NEXT_DEPTH) {
    return null;
  }

  const resolved = resolveSupportedInitialRouteHref(candidate?.trim());
  if (!resolved) {
    return null;
  }

  const { pathname, query } = routeParts(resolved);
  if (
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    AUTH_ENTRY_PATHS.has(pathname)
  ) {
    return null;
  }

  if (ancestry.has(resolved)) {
    return null;
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(resolved);
  for (const nestedNext of new URLSearchParams(query).getAll("next")) {
    if (!safeDestination(nestedNext, nextAncestry, depth + 1)) {
      return null;
    }
  }

  return resolved;
}

export function safeProfileContinuationNext(
  next: string | string[] | undefined
): InitialRouteHref | typeof FALLBACK_DESTINATION {
  const first = Array.isArray(next) ? next[0] : next;
  return safeDestination(first) ?? FALLBACK_DESTINATION;
}

export function profileContinuationHref(
  next: string | string[] | undefined
): InitialRouteHref {
  return `/profile?complete=1&next=${encodeURIComponent(
    safeProfileContinuationNext(next)
  )}`;
}
