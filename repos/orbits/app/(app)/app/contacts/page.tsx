import { getOrbitContactsViewModel } from "../orbit-contacts-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealCardsList } from "./orbit-real-contacts";

export default function AppContactsPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsList viewModel={getOrbitContactsViewModel()} />
    </>
  );
}
