import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { getOrbitHomeViewModel } from "../orbit-home-route-view-model";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealHome } from "./orbit-real-home";

export default function AppPersonalHomePage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealHome mode="hub" viewModel={getOrbitHomeViewModel()} />
    </>
  );
}
