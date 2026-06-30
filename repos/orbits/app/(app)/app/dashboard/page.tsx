/**
 * Dashboard 页 route adapter。
 *
 * 这里加载 party/dashboard view model；实际仪表盘布局由真实 party 组件负责。
 */
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
