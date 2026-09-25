import { Redirect, type Href, useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { profileContinuationHref } from "../../src/view-models/profile-continuation-route";

function ProfileContinueRoute() {
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  return <Redirect href={profileContinuationHref(params.next) as Href} />;
}

export default withOrbitPrivateRoute(ProfileContinueRoute);
