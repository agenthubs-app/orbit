import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { getOrbitHomeViewModel } from "../orbit-home-route-view-model";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealHome } from "./orbit-real-home";

export default async function AppPersonalHomePage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealHome mode="hub" viewModel={localizeOrbitTree(getOrbitHomeViewModel(), language)} />
    </>
  );
}
