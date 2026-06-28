import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsGraph } from "../orbit-real-contacts";

export default function AppContactsGraphPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsGraph viewModel={getOrbitContactsViewModel()} />
    </>
  );
}
