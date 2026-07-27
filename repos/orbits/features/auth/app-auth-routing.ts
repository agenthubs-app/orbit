const ORBIT_PRIVATE_APP_PREFIXES = [
  "/app/agent",
  "/app/chat",
  "/app/contacts",
  "/app/dashboard",
  "/app/followups",
  "/app/home",
  "/app/party",
  "/app/profile",
  "/app/schedule",
  "/app/settings",
  "/app/today",
] as const;

const ORBIT_AUTH_ENTRY_PREFIX = "/app/account";
const SAFE_ORIGIN = "https://orbit.local";

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isOrbitPrivateAppPath(pathname: string): boolean {
  return ORBIT_PRIVATE_APP_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

export function isOrbitAuthEntryPath(pathname: string): boolean {
  return matchesRoutePrefix(pathname, ORBIT_AUTH_ENTRY_PREFIX);
}

export function normalizeOrbitAuthReturnPath(
  value: string | string[] | null | undefined,
  fallback = "/app/home",
): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, SAFE_ORIGIN);

    if (
      parsed.origin !== SAFE_ORIGIN ||
      (parsed.pathname !== "/app" &&
        parsed.pathname !== "/" &&
        !parsed.pathname.startsWith("/app/")) ||
      isOrbitAuthEntryPath(parsed.pathname)
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
