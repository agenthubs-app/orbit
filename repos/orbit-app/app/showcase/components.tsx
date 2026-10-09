import { Redirect } from "expo-router";

import { showcaseEnabled } from "../../src/components/ui/showcase";
import { ComponentShowcaseScreen } from "../../src/screens/showcase/ComponentShowcaseScreen";

// R04 / RD-15: development builds and TestFlight only.
export default function ComponentShowcaseRoute() {
  if (!showcaseEnabled()) return <Redirect href="/" />;
  return <ComponentShowcaseScreen />;
}
