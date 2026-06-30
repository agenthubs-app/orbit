/**
 * 联系人关系图页 route adapter。
 *
 * 复用联系人 view model，图谱渲染和关系布局由 `OrbitRealCardsGraph` 负责。
 */
import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsGraph } from "../orbit-real-contacts";

export default async function AppContactsGraphPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsGraph viewModel={localizeOrbitTree(getOrbitContactsViewModel(), language)} />
    </>
  );
}
