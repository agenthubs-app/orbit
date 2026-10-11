import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ContactDraftsScreen } from "../../../src/screens/add/ContactDraftsScreen";

// R12 確認待ちの下書き (DESIGN §2.9): the draft queue, `?eventId=` adds 参加者から取り込む.
// Online-only: drafts and the attendee import live on the server (docs/offline/page-inventory.md).
function ContactDraftsRoute() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = (Array.isArray(params.eventId) ? params.eventId[0] : params.eventId)?.trim() || null;
  return <ContactDraftsScreen key={eventId ?? ""} eventId={eventId} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ContactDraftsRoute));
