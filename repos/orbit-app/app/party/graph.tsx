import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { partyRedirectHref } from "../../src/view-models/event-live";

// Sprint 0107: the legacy party mode was removed; old links open the event live page.
function PartyGraphRedirect() {
  const params = useLocalSearchParams<{ eventId?: string | string[]; code?: string | string[] }>();
  return <Redirect href={partyRedirectHref(params, "graph") as Href} />;
}

export default withOrbitPrivateRoute(PartyGraphRedirect);
