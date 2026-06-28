import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { getOrbitPartyViewModel } from "../orbit-party-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealParty } from "./orbit-real-party";

export default function AppPartyPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealParty viewModel={getOrbitPartyViewModel()} />
    </>
  );
}
