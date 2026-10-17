import { Redirect } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// R11a: the old full list is the 人脈 page now (tabs, 絞り込み and search live there).
function ContactsListRoute() {
  return <Redirect href="/contacts" />;
}

export default withOrbitPrivateRoute(ContactsListRoute);
