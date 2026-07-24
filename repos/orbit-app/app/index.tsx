import { Redirect, type Href } from "expo-router";

import { resolveInitialRouteHref } from "../src/view-models/initial-route";

export default function IndexRoute() {
  return <Redirect href={resolveInitialRouteHref() as Href} />;
}
