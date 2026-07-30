import { PartyModeScreen } from "../../src/screens/party/PartyModeScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function PartyCheckInRoute() {
  return <PartyModeScreen variant="checkin" />;
}

export default withOrbitPrivateRoute(PartyCheckInRoute);
