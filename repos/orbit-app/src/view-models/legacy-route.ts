import { resolveSupportedInitialRouteHref } from "./initial-route";

export function resolveLegacyDeepLinkHref(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): string | null {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "legacy" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const search = query.toString();
  return resolveSupportedInitialRouteHref(search ? `${pathname}?${search}` : pathname);
}
