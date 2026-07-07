import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsPipelineView } from "../orbit-real-cards-pipeline-view";

export default async function AppContactsPipelinePage() {
  const language = await getOrbitServerLanguage();
  const viewModel = localizeOrbitTree(getOrbitContactsViewModel(), language);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsPipelineView viewModel={viewModel} />
    </>
  );
}
