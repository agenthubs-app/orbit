/**
 * Party 体验页 route adapter。
 *
 * route 只连接 party view model 和真实 party UI，现场交互逻辑不写在这里。
 */
import { OrbitRealParty } from "../dashboard/orbit-real-party";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitPartyViewModel } from "../orbit-party-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";

export default async function AppPartyRoutePage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealParty viewModel={localizeOrbitTree(getOrbitPartyViewModel(), language)} />
    </>
  );
}
