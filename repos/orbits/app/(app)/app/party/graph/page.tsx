import { OrbitRealPartyGraph } from "../../dashboard/orbit-real-party";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitPartyViewModel } from "../../orbit-party-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";

export default async function AppPartyGraphPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealPartyGraph viewModel={localizeOrbitTree(getOrbitPartyViewModel(), language)} />
    </>
  );
}
