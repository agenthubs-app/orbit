import type { AppVersionGateDecision } from "./app-version-policy";

export function validAppStoreUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "apps.apple.com" || url.port || url.username || url.password) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const appIndex = /^[a-z]{2}$/u.test(segments[0] ?? "") ? 1 : 0;
    const listing = segments.slice(appIndex);
    if (listing[0] !== "app" || listing.length < 2 || listing.length > 3 || !/^id\d+$/u.test(listing.at(-1) ?? "")) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function forceUpdateRouteTarget(decision: AppVersionGateDecision, signedIn: boolean): "/maintenance" | "/" | "/home" | null {
  if (decision.kind === "force-update") return null;
  if (decision.kind === "maintenance") return "/maintenance";
  return signedIn ? "/home" : "/";
}
