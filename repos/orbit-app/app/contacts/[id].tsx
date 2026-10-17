import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { NetworkContactScreen } from "../../src/screens/network/NetworkContactScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// R11a: the new 連絡先詳細 (src/screens/network/NetworkContactScreen).
function ContactDetailRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && contactId);
  return enabled && contactId ? <NetworkContactScreen key={`${auth.actorId}:${contactId}`} contactId={contactId} /> : null;
}

export default withOrbitPrivateRoute(ContactDetailRoute);
