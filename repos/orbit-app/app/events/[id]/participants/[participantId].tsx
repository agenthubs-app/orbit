import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { venueHref } from "../../../../src/screens/events/v2/venue-links";

// Sprint 0107: a participant link opens that person's sheet on the live attendee tab.
function EventParticipantRedirect() {
  const params = useLocalSearchParams<{ id?: string | string[]; participantId?: string | string[] }>();
  const eventId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const participant = (Array.isArray(params.participantId) ? params.participantId[0] : params.participantId) ?? "";
  return <Redirect href={(eventId ? venueHref(eventId, { tab: "people", ...(participant ? { person: participant } : {}) }) : "/events") as Href} />;
}

export default withOrbitPrivateRoute(EventParticipantRedirect);
