import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsPipeline } from "../orbit-real-contacts";

export default function AppContactsPipelinePage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsPipeline viewModel={getOrbitContactsViewModel()} />
    </>
  );
}
