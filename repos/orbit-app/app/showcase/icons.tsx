import { Redirect } from "expo-router";

import { showcaseEnabled } from "../../src/components/ui/showcase";
import { IconShowcaseScreen } from "../../src/screens/showcase/IconShowcaseScreen";

// R02 / RD-15: development builds and TestFlight only.
export default function IconShowcaseRoute() {
  if (!showcaseEnabled()) return <Redirect href="/" />;
  return <IconShowcaseScreen />;
}
