const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/agent",
  "/ai",
  "/chat",
  "/contacts",
  "/dashboard",
  "/followups",
  "/home",
  "/inbox",
  "/party",
  "/platform",
  "/profile",
  "/schedule",
  "/settings",
  "/today"
] as const;

const PUBLIC_ROUTE_EXCEPTIONS = new Set(["/admin/access"]);
const NO_PATH_PARAM_KEYS = new Set<string>();
const ID_PATH_PARAM_KEYS = new Set(["id"]);
const CODE_PATH_PARAM_KEYS = new Set(["code"]);
const SLUG_PATH_PARAM_KEYS = new Set(["slug"]);
const STATIC_CONTACT_ROUTES = new Set([
  "all-actions",
  "dashboard",
  "graph",
  "intros",
  "list",
  "new",
  "pipeline"
]);

function appRelativePath(pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (normalized === "/app") {
    return "/";
  }

  return normalized.startsWith("/app/")
    ? normalized.slice("/app".length)
    : normalized;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function pathParamKeysForMobileRoute(pathname: string): ReadonlySet<string> {
  const segments = appRelativePath(pathname).split("/").filter(Boolean);
  const [root, detail, leaf] = segments;

  if (
    segments.length === 2 &&
    (root === "ai" ||
      root === "chat" ||
      (root === "contacts" &&
        detail !== undefined &&
        !STATIC_CONTACT_ROUTES.has(detail)))
  ) {
    return ID_PATH_PARAM_KEYS;
  }

  if (
    root === "events" &&
    detail !== undefined &&
    (segments.length === 2 ||
      (segments.length === 3 &&
        (leaf === "attendees" || leaf === "register")))
  ) {
    return ID_PATH_PARAM_KEYS;
  }

  if (
    root === "schedule" &&
    detail === "events" &&
    leaf !== undefined &&
    segments.length === 3
  ) {
    return ID_PATH_PARAM_KEYS;
  }

  if (root === "register" && detail !== undefined && segments.length === 2) {
    return CODE_PATH_PARAM_KEYS;
  }

  if (root === "o" && detail !== undefined && segments.length === 2) {
    return SLUG_PATH_PARAM_KEYS;
  }

  return NO_PATH_PARAM_KEYS;
}

export function isPrivateMobileRoute(pathname: string): boolean {
  const route = appRelativePath(pathname);

  if (PUBLIC_ROUTE_EXCEPTIONS.has(route)) {
    return false;
  }

  if (matchesPrefix(route, "/events")) {
    // The catalogue and one public event detail are discovery surfaces.
    // Every deeper event workspace reads or writes actor-owned records.
    return !/^\/events(?:\/[^/]+)?$/u.test(route);
  }

  return PRIVATE_ROUTE_PREFIXES.some((prefix) =>
    matchesPrefix(route, prefix)
  );
}

export function mobileAuthReturnHref(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): string {
  const route = appRelativePath(pathname);
  const pathParamKeys = pathParamKeysForMobileRoute(route);
  const search = new URLSearchParams();

  for (const key of Object.keys(params).sort()) {
    if (key === "#" || pathParamKeys.has(key)) {
      continue;
    }

    const value = params[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        search.append(key, item);
      }
    }
  }

  const query = search.toString();
  const fragmentValues = Array.isArray(params["#"])
    ? params["#"]
    : [params["#"]];
  const fragment = fragmentValues.find(
    (value): value is string => value !== undefined
  );
  const href = query ? `${route}?${query}` : route;

  return fragment === undefined
    ? href
    : `${href}#${encodeURIComponent(fragment)}`;
}

export function mobileLoginHref(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): string {
  return `/account/login?next=${encodeURIComponent(
    mobileAuthReturnHref(pathname, params)
  )}`;
}
