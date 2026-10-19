import { Redirect, type Href, useLocalSearchParams, usePathname } from "expo-router";

import { NotFoundScreen } from "../src/screens/public/NotFoundScreen";
import { resolveLegacyDeepLinkHref } from "../src/view-models/legacy-route";

export default function LegacyDeepLinkRoute() {
  const pathname = usePathname();
  const params = useLocalSearchParams() as Record<
    string,
    string | string[] | undefined
  >;
  const href = resolveLegacyDeepLinkHref(pathname, params);
  return href ? <Redirect href={href as Href} /> : <NotFoundScreen />;
}
