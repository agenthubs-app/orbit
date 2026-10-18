import { Redirect } from "expo-router";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function LegacyChatRedirect() { return <Redirect href="/inbox?tab=messages" />; }

export default withOrbitPrivateRoute(LegacyChatRedirect);
