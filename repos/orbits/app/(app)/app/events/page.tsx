import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitLandingViewModel } from "../orbit-landing-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealExploreClient } from "./orbit-real-explore-client";

export default async function AppEventsPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealExploreClient viewModel={localizeOrbitTree(getOrbitLandingViewModel(), language)} />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
