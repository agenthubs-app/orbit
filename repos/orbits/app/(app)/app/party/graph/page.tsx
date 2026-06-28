import { OrbitRealPartyGraph } from "../../dashboard/orbit-real-party";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { getOrbitPartyViewModel } from "../../orbit-party-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export default function AppPartyGraphPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealPartyGraph viewModel={getOrbitPartyViewModel()} />
    </>
  );
}
