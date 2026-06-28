import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitContactsViewModel } from "../orbit-contacts-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealCardsList } from "./orbit-real-contacts";

export default async function AppContactsPage() {
  const language = await getOrbitServerLanguage();
  const viewModel = localizeOrbitTree(getOrbitContactsViewModel(), language);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsList viewModel={viewModel} />
    </>
  );
}
