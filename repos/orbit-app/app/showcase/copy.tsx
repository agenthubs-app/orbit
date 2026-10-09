import { Redirect } from "expo-router";

import { showcaseEnabled } from "../../src/components/ui/showcase";
import { CopyShowcaseScreen } from "../../src/screens/showcase/CopyShowcaseScreen";

// R03 / RD-15: development builds and TestFlight only.
export default function CopyShowcaseRoute() {
  if (!showcaseEnabled()) return <Redirect href="/" />;
  return <CopyShowcaseScreen />;
}
