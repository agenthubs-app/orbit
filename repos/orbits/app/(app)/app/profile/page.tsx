import { getOrbitProfileViewModel } from "../orbit-profile-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealProfile } from "./orbit-real-profile";

export default async function AppProfilePage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealProfile viewModel={localizeOrbitTree(getOrbitProfileViewModel(), language)} />
    </>
  );
}
