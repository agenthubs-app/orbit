import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsIntros } from "../orbit-real-contacts";

export default function AppContactsIntrosPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsIntros viewModel={getOrbitContactsViewModel()} />
    </>
  );
}
