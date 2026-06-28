import { OrbitRealParty } from "../dashboard/orbit-real-party";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { getOrbitPartyViewModel } from "../orbit-party-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";

export default function AppPartyRoutePage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealParty viewModel={getOrbitPartyViewModel()} />
    </>
  );
}
