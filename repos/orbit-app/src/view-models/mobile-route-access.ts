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

const PUBLIC_ROUTE_EXCEPTIONS = new Set(["/admin/access"]);
const NO_PATH_PARAM_KEYS = new Set<string>();
const ID_PATH_PARAM_KEYS = new Set(["id"]);
const CODE_PATH_PARAM_KEYS = new Set(["code"]);
const SLUG_PATH_PARAM_KEYS = new Set(["slug"]);
const INTAKE_PATH_PARAM_KEYS = new Set(["intakeId"]);
const DRAFT_PATH_PARAM_KEYS = new Set(["draftId"]);
const PLAN_TYPE_PATH_PARAM_KEYS = new Set(["planId", "itemId"]);
const PLAN_PATH_PARAM_KEYS = new Set(["planId"]);
const STATIC_CONTACT_ROUTES = new Set([
  "all-actions",
  "dashboard",
  "graph",
  "list",
  "new",
  "pipeline"
]);
const STATIC_EVENT_ROUTES = new Set(["center"]);

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
  if (root === "events" && detail && leaf === "participants" && segments.length === 4) return new Set(["id", "participantId"]);
  // R23: the plan flow and the draft editor keep their id in the path.
  if (root === "plans" && detail === "flow" && segments.length === 3) return INTAKE_PATH_PARAM_KEYS;
  if (root === "plans" && detail === "drafts" && segments.length === 4 && segments[3] === "edit") return DRAFT_PATH_PARAM_KEYS;
  // R24: the person-type page keeps both ids in the path.
  if (root === "plans" && detail !== "flow" && detail !== "drafts" && leaf === "types" && segments.length === 4) return PLAN_TYPE_PATH_PARAM_KEYS;
  // R25: 見直し, 完了 and 以前のプラン keep the plan id in the path.
  if (root === "plans" && detail !== "flow" && detail !== "drafts" && detail !== "legacy" && (leaf === "review" || leaf === "done") && segments.length === 3) return PLAN_PATH_PARAM_KEYS;
  if (root === "plans" && detail === "legacy" && segments.length === 3) return PLAN_PATH_PARAM_KEYS;

  if ((root === "tasks" && detail !== undefined && detail !== "personal" && segments.length === 2) ||
    (root === "tasks" && detail === "relationship" && leaf !== undefined && segments.length === 3) ||
    (root === "schedule" && detail === "personal" && leaf !== undefined && leaf !== "new" && (segments.length === 3 || (segments.length === 4 && segments[3] === "edit")))) return ID_PATH_PARAM_KEYS;

  if (root === "contacts" && detail === "new" && (leaf === "batch" || leaf === "batch2" || leaf === "import") && segments.length === 4) {
    return ID_PATH_PARAM_KEYS;
  }

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
    !STATIC_EVENT_ROUTES.has(detail) &&
    (segments.length === 2 ||
      (segments.length === 3 &&
        (leaf === "analytics" || leaf === "attendees" || leaf === "live" || leaf === "register" || leaf === "operations")) ||
      (segments.length === 4 &&
        segments[2] === "operations" &&
        (segments[3] === "admission" ||
          segments[3] === "check-in" ||
          segments[3] === "experience" ||
          segments[3] === "roles")))
  ) {
    return ID_PATH_PARAM_KEYS;
  }

  if (
    root === "schedule" &&
    (detail === "events" || detail === "meetings") &&
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
    return route === "/events/center" || !/^\/events(?:\/[^/]+)?$/u.test(route);
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

export function mobileLoginHref(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): string {
  return `/account/login?next=${encodeURIComponent(
    mobileAuthReturnHref(pathname, params)
  )}`;
}
