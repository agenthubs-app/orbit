// R15 招待コード (DESIGN add-and-invite §2.5 第 7 条, §7): which invite links the App opens itself.
//   - `https://<invite host>/i/<code>` — the link the sender shares (server `ORBIT_PUBLIC_ORIGIN`, by default
//     orbitailink.com; the App also knows its own API host, and `EXPO_PUBLIC_ORBIT_PUBLIC_ORIGIN` when set);
//   - `orbit://i/<code>` — the custom scheme (the Web 完了 page's 「開く」);
//   - `/i/<code>` and `/i` — the App's own routes (also the `next` after ログイン / 登録).
// A code is canonicalised (`XXXX-XXXX`); a malformed one, or a link on any other host, does not open the
// invite page (`null`: the caller goes home). Query and fragment are dropped (link trackers add them).
import { formatInviteCode } from "../api/compute/invite-code-format";

export const DEFAULT_INVITE_LINK_HOSTS: readonly string[] = ["orbitailink.com", "www.orbitailink.com"];

function hostOf(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Build-time values (Expo inlines `process.env.EXPO_PUBLIC_*`); a bundle without `process` simply has none. */
function configuredOrigins(): { apiBaseUrl?: string | undefined; publicOrigin?: string | undefined } {
  if (typeof process === "undefined" || !process.env) return {};
  return { apiBaseUrl: process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL, publicOrigin: process.env.EXPO_PUBLIC_ORBIT_PUBLIC_ORIGIN };
}

export function inviteLinkHosts(env: { apiBaseUrl?: string | undefined; publicOrigin?: string | undefined } = configuredOrigins()): Set<string> {
  const hosts = new Set(DEFAULT_INVITE_LINK_HOSTS);
  for (const origin of [env.publicOrigin, env.apiBaseUrl]) {
    const host = hostOf(origin);
    if (host) hosts.add(host);
  }
  return hosts;
}

const SCHEME_LINK = /^orbit:\/\/\/?i(?:\/([^/?#]*))?\/?(?:[?#].*)?$/iu;
const WEB_LINK = /^https?:\/\/([^/?#]+)\/i(?:\/([^/?#]*))?\/?(?:[?#].*)?$/iu;
const APP_PATH = /^\/?i(?:\/([^/?#]*))?(?:[?#].*)?$/u;

function inviteHref(rawCode: string | undefined): string | null {
  if (rawCode === undefined || rawCode === "") return "/i";
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawCode);
  } catch {
    return null;
  }
  const code = formatInviteCode(decoded);
  return code ? `/i/${code}` : null;
}

/**
 * `undefined` = not an invite link (the caller keeps resolving); `null` = an invite link that must not
 * open (malformed code); otherwise `/i` or `/i/XXXX-XXXX`.
 */
export function inviteRouteHref(configuredRoute: string | undefined, hosts: ReadonlySet<string> = inviteLinkHosts()): string | null | undefined {
  const route = configuredRoute?.trim();
  if (!route) return undefined;
  const scheme = SCHEME_LINK.exec(route);
  if (scheme) return inviteHref(scheme[1]);
  const web = WEB_LINK.exec(route);
  if (web) return hosts.has(web[1]!.toLowerCase()) ? inviteHref(web[2]) : undefined;
  const path = APP_PATH.exec(route);
  if (path) return inviteHref(path[1]);
  return undefined;
}
