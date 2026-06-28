import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitPartyViewModel } from "../orbit-party-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealParty } from "./orbit-real-party";

export default async function AppPartyPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealParty viewModel={localizeOrbitTree(getOrbitPartyViewModel(), language)} />
    </>
  );
}
