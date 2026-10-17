import { useIsFocused } from "expo-router";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { NetworkScreen } from "../../src/screens/network/NetworkScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// R11a: the new 人脈 page (src/screens/network). It unmounts while unfocused (no private reads in the
// background); NetworkScreen keeps its tab, filters, search and scroll per account (A-R05-10).
function ContactsMainRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, server.baseUrl]);
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId);
  if (!enabled) return null;
  return <NetworkScreen key={scopeKey} scopeKey={scopeKey} />;
}

export default withOrbitPrivateRoute(ContactsMainRoute);
