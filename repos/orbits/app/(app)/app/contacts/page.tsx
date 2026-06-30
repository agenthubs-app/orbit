/**
 * 联系人列表页 route adapter。
 *
 * 负责构造联系人 view model；列表搜索、卡片展示和交互在真实联系人组件中处理。
 */
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
