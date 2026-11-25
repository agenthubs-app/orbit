import { appRouteParams } from "./app-routes";
import { taskListHref } from "./task-list-scope";

const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/agent",
  "/ai",
  "/chat",
  "/contacts",
  "/dashboard",
  "/followups",
  "/home",
  "/host",
  "/inbox",
  "/notes",
  "/party",
  "/platform",
  "/plans",
  "/profile",
  "/schedule",
  "/settings",
  "/task",
  "/today",
  "/tasks"
] as const;

const PUBLIC_ROUTE_EXCEPTIONS = new Set(["/admin/access", "/settings/help", "/settings/terms", "/settings/privacy"]);
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

export function isPrivateMobileRoute(pathname: string): boolean {
  const route = appRelativePath(pathname);

  if (PUBLIC_ROUTE_EXCEPTIONS.has(route)) {
    return false;
  }

  if (matchesPrefix(route, "/events")) {
    // The catalogue and one public event detail are discovery surfaces.
    // Every deeper event workspace reads or writes actor-owned records.
    // R26: /events/assess (イベント評価の入力) reads and writes the person's own assessments.
    return route === "/events/center" || route === "/events/assess" || !/^\/events(?:\/[^/]+)?$/u.test(route);
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
  const pathParamKeys = new Set(appRouteParams(route) ?? []);
  if (route === "/tasks") return taskListHref(params);
  if (route === "/followups") return taskListHref({ scope: "relationship", view: params.view });
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

/** Where a signed-out person is sent from a private page, keeping the way back in `next`. Sign-up is one tap from there and keeps it too. */
export function mobileLoginHref(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): string {
  return `/account/login?next=${encodeURIComponent(
    mobileAuthReturnHref(pathname, params)
  )}`;
}
