import {
  Redirect,
  type Href,
  useLocalSearchParams,
  usePathname
} from "expo-router";

import { resolveInitialRouteHref } from "../src/view-models/initial-route";

function legacyQueryString(
  params: Record<string, string | string[] | undefined>
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "legacy" || value === undefined) {
      continue;
    }

    for (const item of Array.isArray(value) ? value : [value]) {
      searchParams.append(key, item);
    }
  }

  return searchParams.toString();
}

export default function LegacyDeepLinkRoute() {
  const pathname = usePathname();
  const params = useLocalSearchParams() as Record<
    string,
    string | string[] | undefined
  >;
  const query = legacyQueryString(params);
  const configuredRoute = query ? `${pathname}?${query}` : pathname;

  return <Redirect href={resolveInitialRouteHref(configuredRoute) as Href} />;
}
