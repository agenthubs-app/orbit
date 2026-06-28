import { getOrbitLandingViewModel } from "../orbit-landing-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealExploreClient } from "./orbit-real-explore-client";

export default function AppEventsPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealExploreClient viewModel={getOrbitLandingViewModel()} />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
