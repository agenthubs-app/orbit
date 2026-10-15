import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { venueHref } from "../../../src/screens/events/v2/venue-links";

// Sprint 0107: the live page replaced 「参会者与名片交换」; old links open its attendee tab.
function EventAttendeesRedirect() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = (Array.isArray(id) ? id[0] : id) ?? "";
  return <Redirect href={(eventId ? venueHref(eventId, { tab: "people" }) : "/events") as Href} />;
}

export default withOrbitPrivateRoute(EventAttendeesRedirect);
