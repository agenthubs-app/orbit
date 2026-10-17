import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { Redirect } from "expo-router";
function ProfileMoreRoute() { return <Redirect href="/profile/edit" />; }
export default withOrbitPrivateRoute(ProfileMoreRoute);
