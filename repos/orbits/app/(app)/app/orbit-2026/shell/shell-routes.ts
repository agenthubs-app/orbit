// R07: which signed-in pages the new shell frames, and which rail item is current.
// Pure (no React) so the route rules are tested on their own.
import { allowsOrbitAsk } from "../../orbit-global-ask/orbit-ask-routes";
export type ShellNavKey = "home" | "network" | "iorbit" | "events" | "task" | "inbox" | "host" | "settings" | "me";

// Pages with their own frame: the public landing, sign-in, the admin host console,
// the public organizer page, the guided demo start, registration hand-offs and the
// onboarding flow (it has its own full-screen steps).
const NO_SHELL_EXACT = new Set(["/app", "/app/start", "/app/platform"]);
const NO_SHELL_PREFIXES = ["/app/account", "/app/login-admin", "/app/admin", "/app/o", "/app/register", "/app/profile/onboarding"];

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * The shell (and with it ⌘K) also keeps the exclusions of the old floating ask
 * (orbit-ask-routes): check-in and admission are kiosk screens — hands busy, a
 * queue waiting — where a rail or a search panel only gets in the way.
 */
export function shellAppliesTo(pathname: string, signedIn: boolean): boolean {
  if (!signedIn) return false;
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (!matches(path, "/app") || NO_SHELL_EXACT.has(path)) return false;
  return !NO_SHELL_PREFIXES.some((prefix) => matches(path, prefix)) && allowsOrbitAsk(path);
}

/** The rail item a page belongs to (deep pages highlight their section). */
export function shellNavKeyFor(pathname: string): ShellNavKey | null {
  const path = pathname.replace(/\/+$/u, "");
  if (matches(path, "/app/home")) return "home";
  if (matches(path, "/app/contacts")) return "network";
  if (matches(path, "/app/agent")) return "iorbit";
  if (matches(path, "/app/events/center") || /^\/app\/events\/[^/]+\/(operations|analytics|live)(\/|$)/u.test(path)) return "host";
  if (matches(path, "/app/events")) return "events";
  if (matches(path, "/app/tasks")) return "task";
  if (matches(path, "/app/inbox")) return "inbox";
  if (matches(path, "/app/settings")) return "settings";
  if (matches(path, "/app/profile")) return "me";
  return null;
}

/** iOrbit is a workspace of its own: no right rail there (web.html). */
export function shellShowsRail(pathname: string): boolean {
  return !matches(pathname.replace(/\/+$/u, ""), "/app/agent");
}

export const SHELL_NAV: readonly { key: Exclude<ShellNavKey, "host" | "settings" | "me">; href: string; icon: "home" | "users" | "sparkle" | "calendar" | "task" | "inbox" }[] = [
  { key: "home", href: "/app/home", icon: "home" },
  { key: "network", href: "/app/contacts", icon: "users" },
  { key: "iorbit", href: "/app/agent", icon: "sparkle" },
  { key: "events", href: "/app/events", icon: "calendar" },
  { key: "task", href: "/app/tasks", icon: "task" },
  { key: "inbox", href: "/app/inbox", icon: "inbox" },
];
