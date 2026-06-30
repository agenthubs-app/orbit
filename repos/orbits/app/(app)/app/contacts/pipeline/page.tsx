/**
 * 联系人导入 pipeline 页 route adapter。
 *
 * 这里只连接本地化 view model 和 pipeline UI，草稿处理逻辑留在联系人组件层。
 */
import { getOrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsPipeline } from "../orbit-real-contacts";

export default async function AppContactsPipelinePage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsPipeline viewModel={localizeOrbitTree(getOrbitContactsViewModel(), language)} />
    </>
  );
}
