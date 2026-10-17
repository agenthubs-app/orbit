import { Redirect, useRouter, type Href } from "expo-router";

import { showcaseEnabled } from "../../../src/components/ui/showcase";
import { ComponentShowcaseScreen } from "../../../src/screens/showcase/ComponentShowcaseScreen";

// R04 / RD-15: development builds and TestFlight only.
export default function ComponentShowcaseRoute() {
  const router = useRouter();
  if (!showcaseEnabled()) return <Redirect href="/" />;
  // R31a: each 01-system spec cell opens as its own section page (the pixel gate's target).
  return <ComponentShowcaseScreen onOpenSection={(id) => router.push(`/showcase/components/${id}` as Href)} />;
}
