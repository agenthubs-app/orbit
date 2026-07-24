export type InitialRouteHref =
  | "/account"
  | "/account/forgot-password"
  | "/account/login"
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
  | `/schedule/events/${string}`
  | "/profile"
  | `/ai/${string}`
  | `/chat/${string}`
  | `/contacts/${string}`
  | `/events/${string}`
  | `/events/${string}/attendees`
  | `/events/${string}/register`;

const routeByKey: Record<string, InitialRouteHref> = {
  account: "/account",
  "account/forgot-password": "/account/forgot-password",
  "account/login": "/account/login",
  "account/signup": "/account/signup",
  admin: "/admin",
  "admin/access": "/admin/access",
  "admin/events": "/admin/events",
  agent: "/agent",
  ai: "/ai",
  chat: "/chat",
  contacts: "/contacts",
  dashboard: "/dashboard",
  events: "/events",
  followups: "/followups",
  home: "/home",
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
};

function detailRouteHref(routeKey: string): InitialRouteHref | null {
  const aiMatch = /^ai\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (aiMatch) {
    return `/ai/${aiMatch[1]}` as InitialRouteHref;
  }

  const chatMatch = /^chat\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (chatMatch) {
    return `/chat/${chatMatch[1]}` as InitialRouteHref;
  }

  const eventAttendeesMatch = /^events\/([A-Za-z0-9_-]+)\/attendees$/u.exec(routeKey);
  if (eventAttendeesMatch) {
    return `/events/${eventAttendeesMatch[1]}/attendees` as InitialRouteHref;
  }

  const eventRegistrationMatch = /^events\/([A-Za-z0-9_-]+)\/register$/u.exec(routeKey);
  if (eventRegistrationMatch) {
    return `/events/${eventRegistrationMatch[1]}/register` as InitialRouteHref;
  }

  const scheduleEventMatch = /^schedule\/events\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (scheduleEventMatch) {
    return `/schedule/events/${scheduleEventMatch[1]}` as InitialRouteHref;
  }

  const registerMatch = /^register\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (registerMatch) {
    return `/register/${registerMatch[1]}` as InitialRouteHref;
  }

  const organizerMatch = /^o\/([A-Za-z0-9_-]+)$/u.exec(routeKey);
  if (organizerMatch) {
    return `/o/${organizerMatch[1]}` as InitialRouteHref;
  }

  const match = /^(contacts|events)\/([A-Za-z0-9_-]+)$/u.exec(routeKey);

  if (!match) {
    return null;
  }

  return `/${match[1]}/${match[2]}` as InitialRouteHref;
}

export function resolveInitialRouteHref(
  configuredRoute = process.env.EXPO_PUBLIC_ORBIT_INITIAL_ROUTE,
): InitialRouteHref {
  const routeKey = configuredRoute?.trim().replace(/^\/+/, "");

  if (!routeKey) {
    return "/ai";
  }

  return routeByKey[routeKey] ?? detailRouteHref(routeKey) ?? "/ai";
}
