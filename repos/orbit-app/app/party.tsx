import { PartyModeScreen } from "../src/screens/party/PartyModeScreen";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function PartyRoute() {
  return <PartyModeScreen />;
}

export default withOrbitPrivateRoute(PartyRoute);
