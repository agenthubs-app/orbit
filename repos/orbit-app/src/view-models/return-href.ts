// Where a person goes back to after signing in, signing up or finishing the onboarding (2026-11-26; the same rule as Web's
// normalizeOrbitAuthReturnPath): the page they came from, with its query and fragment. Only pages of this App; a page of
// the sign-in flow itself is never a target — the `next` it carries is.
import { appRouteParams } from "./app-routes";
import { resolveSupportedInitialRouteHref } from "./initial-route";

const FLOW_PATHS = new Set([
  "/account/change-password",
  "/account/forgot-password",
  "/account/login",
  "/account/mobile-google",
  "/account/reset-password",
  "/account/signup",
  "/login-admin",
  "/profile/continue",
  "/profile/onboarding",
]);
/** Pages nobody comes from or goes back to. */
const NOT_A_TARGET = new Set(["/", "/account/deleted", "/force-update", "/maintenance"]);
const MAX_UNWRAP = 5;

export const DEFAULT_RETURN_HREF = "/home";

/** The address to go back to; null when `value` is not one (the caller then goes to DEFAULT_RETURN_HREF). */
export function returnHref(value: string | string[] | null | undefined): string | null {
  let candidate = (Array.isArray(value) ? value[0] : value)?.trim();
  for (let depth = 0; depth <= MAX_UNWRAP; depth += 1) {
    if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(candidate)) return null;
    const href: string = candidate === "/app" || candidate.startsWith("/app/") ? candidate.slice(4) || "/" : candidate;
    const pathname = href.split(/[?#]/u, 1)[0]!;
    if (!plainPath(pathname)) return null;
    const route = pathname.replace(/(?<=.)\/+$/u, "");
    const query = new URLSearchParams(href.split("#", 1)[0]!.split("?").slice(1).join("?"));
    // `/profile?complete=1&next=…` and `?onboarding=1` are how older links opened the same flow.
    if (FLOW_PATHS.has(route) || (route === "/profile" && (query.has("complete") || query.has("onboarding")))) {
      candidate = query.get("next")?.trim();
      continue;
    }
    if (NOT_A_TARGET.has(route)) return null;
    // Old Web-shaped addresses open their App page. Invite pages take only a well-formed code.
    const supported = resolveSupportedInitialRouteHref(href);
    if (supported) return supported;
    if (/^\/i(?:\/|$)/u.test(route)) return null;
    return appRouteParams(route) ? route + href.slice(pathname.length) : null;
  }
  return null;
}

/** No `.` / `..` in any shape (an id may itself hold an encoded slash), no backslash, nothing undecodable. */
function plainPath(pathname: string): boolean {
  if (pathname.includes("//")) return false;
  return pathname.split("/").every(segment => {
    try {
      const plain = decodeURIComponent(segment);
      return !plain.split("/").some(part => part === "." || part === "..") && !/[\\\u0000-\u001f\u007f]/u.test(plain);
    } catch {
      return false;
    }
  });
}

export function isDefaultReturnHref(href: string): boolean {
  return href.split(/[?#]/u, 1)[0] === DEFAULT_RETURN_HREF;
}
