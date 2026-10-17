import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useOrbitAuthSession } from "../../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../../src/api/ApiBaseUrlProvider";
import { ContactEditScreen } from "../../../src/screens/network/ContactEditScreen";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";

// R11a: 連絡先の編集 (b5 #42–#44), opened from the contact detail.
function ContactEditRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && contactId);
  return enabled && contactId ? <ContactEditScreen key={`${auth.actorId}:${contactId}`} contactId={contactId} /> : null;
}

export default withOrbitPrivateRoute(ContactEditRoute);
