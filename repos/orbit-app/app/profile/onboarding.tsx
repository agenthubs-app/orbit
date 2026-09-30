import { useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { ProfileOnboardingScreen } from "../../src/screens/profile/onboarding/ProfileOnboardingScreen";

function ProfileOnboardingRoute() {
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  return <ProfileOnboardingScreen next={params.next} />;
}

export default withOrbitPrivateRoute(ProfileOnboardingRoute);
