import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useOrbitAuthSession } from "../../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../../src/api/ApiBaseUrlProvider";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ContactReachScreen } from "../../../src/screens/network/ContactReachScreen";

// contact-reach R42 ⑦: 連絡する — the full-screen message / e-mail draft for one contact.
function ContactReachRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && contactId);
  return enabled && contactId ? <ContactReachScreen key={`${auth.actorId}:${contactId}`} contactId={contactId} /> : null;
}

export default withOrbitPrivateRoute(ContactReachRoute);
