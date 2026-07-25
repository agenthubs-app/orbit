type InitialRoutePath =
  | "/account"
  | "/account/forgot-password"
  | "/account/login"
  | "/account/permissions"
  | "/account/signup"
  | "/admin"
  | "/admin/access"
  | "/admin/events"
  | "/agent"
  | "/ai"
  | "/chat"
  | "/dashboard"
  | "/events"
  | "/followups"
  | "/home"
  | "/home/events"
  | "/contacts"
  | "/contacts/list"
  | "/inbox"
  | "/login-admin"
  | `/o/${string}`
  | "/party"
  | "/platform"
  | "/party/checkin"
  | "/party/graph"
  | "/register"
  | `/register/${string}`
  | "/schedule"
  | "/settings/api"
  | `/schedule/events/${string}`
  | "/profile"
  | `/ai/${string}`
  | `/chat/${string}`
  | `/contacts/${string}`
  | `/events/${string}`
  | `/events/${string}/attendees`
  | `/events/${string}/register`;

export type InitialRouteHref = InitialRoutePath | `${InitialRoutePath}?${string}`;

const routeByKey: Record<string, InitialRoutePath> = {
  account: "/account",
  "account/forgot-password": "/account/forgot-password",
  "account/login": "/account/login",
  "account/mobile-google": "/account/login",
  "account/permissions": "/account/permissions",
  "account/signup": "/account/signup",
  admin: "/admin",
  "admin/access": "/admin/access",
  "admin/events": "/admin/events",
  agent: "/agent",
  ai: "/ai",
  chat: "/chat",
  contacts: "/contacts",
  "contacts/list": "/contacts/list",
  dashboard: "/dashboard",
  events: "/events",
  followups: "/followups",
  home: "/ai",
  "home/events": "/home/events",
  inbox: "/inbox",
  "login-admin": "/login-admin",
  party: "/party",
  platform: "/platform",
  "party/checkin": "/party/checkin",
  "party/graph": "/party/graph",
  profile: "/profile",
  register: "/register",
  schedule: "/schedule",
  "settings/api": "/settings/api",
};

function parsedConfiguredRoute(configuredRoute?: string): {
  rawQuery: string;
  routeKey: string;
  searchParams: URLSearchParams;
} | null {
  const route = configuredRoute?.trim();

  if (!route) {
    return null;
  }

  const [withoutHash = ""] = route.split("#", 1);
  const queryIndex = withoutHash.indexOf("?");
  const rawPath =
    queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1);
  const routeKey = rawPath
    .replace(/^\/+/, "")
    .replace(/^app(?:\/|$)/u, "");

  return {
    rawQuery,
    routeKey,
    searchParams: new URLSearchParams(rawQuery)
  };
}

function webShellRouteKey(routeKey: string): string {
  if (routeKey === "explore") {
    return "events";
  }

  if (routeKey === "home/cards") {
    return "contacts/list";
  }

  if (routeKey === "home/cards/scan") {
    return "contacts/new";
  }

  if (routeKey === "home/schedule") {
    return "followups";
  }

  if (routeKey === "home/profile") {
    return "profile";
  }

  const homeCardMatch = /^home\/cards\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (homeCardMatch) {
    return `contacts/${homeCardMatch[1]}`;
  }

  return routeKey;
}

function registerCodeRoute(searchParams: URLSearchParams): InitialRoutePath | null {
  const code = searchParams.get("code")?.trim();

  if (!code || !/^[A-Za-z0-9_-]+$/u.test(code)) {
    return null;
  }

  return `/register/${code}` as InitialRoutePath;
}

function hasContactsListQuery(searchParams: URLSearchParams): boolean {
  return [
    "q",
    "query",
    "source",
    "status",
    "tag",
    "value"
  ].some((key) => Boolean(searchParams.get(key)?.trim()));
}

function detailRouteHref(routeKey: string): InitialRoutePath | null {
  const aiMatch = /^ai\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (aiMatch) {
    return `/ai/${aiMatch[1]}` as InitialRoutePath;
  }

  const chatMatch = /^chat\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (chatMatch) {
    return `/chat/${chatMatch[1]}` as InitialRoutePath;
  }

  const eventAttendeesMatch = /^events\/([A-Za-z0-9_-]+)\/attendees$/u.exec(routeKey);
  if (eventAttendeesMatch) {
    return `/events/${eventAttendeesMatch[1]}/attendees` as InitialRoutePath;
  }

  const eventRegistrationMatch = /^events\/([A-Za-z0-9_-]+)\/register$/u.exec(routeKey);
  if (eventRegistrationMatch) {
    return `/events/${eventRegistrationMatch[1]}/register` as InitialRoutePath;
  }

  const scheduleEventMatch = /^schedule\/events\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (scheduleEventMatch) {
    return `/schedule/events/${scheduleEventMatch[1]}` as InitialRoutePath;
  }

  const registerMatch = /^register\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (registerMatch) {
    return `/register/${registerMatch[1]}` as InitialRoutePath;
  }

  const organizerMatch = /^o\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (organizerMatch) {
    return `/o/${organizerMatch[1]}` as InitialRoutePath;
  }

  const match = /^(contacts|events)\/([A-Za-z0-9_-]+)$/u.exec(routeKey);

  if (!match) {
    return null;
  }

  return `/${match[1]}/${match[2]}` as InitialRoutePath;
}

function hrefWithQuery(path: InitialRoutePath, rawQuery: string): InitialRouteHref {
  return rawQuery ? `${path}?${rawQuery}` as InitialRouteHref : path;
}

export function resolveInitialRouteHref(
  configuredRoute = process.env.EXPO_PUBLIC_ORBIT_INITIAL_ROUTE,
): InitialRouteHref {
  const parsedRoute = parsedConfiguredRoute(configuredRoute);

  if (!parsedRoute) {
    return "/ai";
  }

  const routeKey = webShellRouteKey(parsedRoute.routeKey);

  if (routeKey === "register") {
    const codeRoute = registerCodeRoute(parsedRoute.searchParams);

    if (codeRoute) {
      return codeRoute;
    }
  }

  if (routeKey === "contacts" && hasContactsListQuery(parsedRoute.searchParams)) {
    return hrefWithQuery("/contacts/list", parsedRoute.rawQuery);
  }

  const route = routeByKey[routeKey] ?? detailRouteHref(routeKey);

  if (!route) {
    return "/ai";
  }

  return hrefWithQuery(route, parsedRoute.rawQuery);
}
