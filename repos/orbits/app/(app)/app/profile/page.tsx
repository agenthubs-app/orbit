import { getOrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealProfile } from "./orbit-real-profile";

export default function AppProfilePage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealProfile viewModel={getOrbitProfileViewModel()} />
    </>
  );
}
