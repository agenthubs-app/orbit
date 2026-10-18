import { Redirect, type Href, useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function LegacyChatDetailRedirect() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <Redirect href={(id ? `/inbox/${encodeURIComponent(id)}` : '/inbox?tab=messages') as Href} />;
}

export default withOrbitPrivateRoute(LegacyChatDetailRedirect);
