import { useLocalSearchParams } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { addDesignMock } from "../../src/screens/add/add-design-mock";
import { EmailVerificationDesignBoard, isEmailVerificationBoard } from "../../src/screens/profile/onboarding/EmailVerificationDesignBoard";
import { OnboardingDesignBoard, isOnboardingBoard } from "../../src/screens/profile/onboarding/OnboardingDesignBoard";
import { ProfileOnboardingScreen } from "../../src/screens/profile/onboarding/ProfileOnboardingScreen";

function ProfileOnboardingRoute() {
  const params = useLocalSearchParams<{ next?: string | string[]; design?: string | string[] }>();
  // `design` is honoured only in a dev build with the pixel-gate switch.
  if (isOnboardingBoard(params.design) && addDesignMock("onboarding")) return <OnboardingDesignBoard board={params.design} />;
  if (isEmailVerificationBoard(params.design) && addDesignMock("onboarding")) return <EmailVerificationDesignBoard board={params.design} />;
  return <ProfileOnboardingScreen next={params.next} />;
}

export default withOrbitPrivateRoute(ProfileOnboardingRoute);
