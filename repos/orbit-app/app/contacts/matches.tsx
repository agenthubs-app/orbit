import { type Href, Redirect } from "expo-router";

import { planTaskSegmentHref } from "../../src/api/compute/plan-href";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// R24: 人脈需求匹配 moved into Task › プラン (the plan's person types and candidates).
// Old links replace themselves with the segment, so back still returns to where the
// user came from (人脈). The old screen file stays until R25 deletes it.
function ContactMatchesRedirect() {
  return <Redirect href={planTaskSegmentHref("app") as Href} />;
}

export default withOrbitPrivateRoute(ContactMatchesRedirect);
