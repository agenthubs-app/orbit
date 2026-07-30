import { PartyModeScreen } from "../../src/screens/party/PartyModeScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function PartyGraphRoute() {
  return <PartyModeScreen variant="graph" />;
}

export default withOrbitPrivateRoute(PartyGraphRoute);
