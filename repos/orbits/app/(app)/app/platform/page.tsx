import { getOrbitPlatformViewModel } from "../orbit-admin-platform-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealPlatform } from "./orbit-real-platform";

export default function PlatformPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealPlatform viewModel={getOrbitPlatformViewModel()} />
    </>
  );
}
