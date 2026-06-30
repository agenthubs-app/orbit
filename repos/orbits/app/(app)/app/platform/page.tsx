/**
 * 平台管理页 route adapter。
 *
 * 这里生成平台级 view model 并交给真实平台组件；route 本身不包含管理业务逻辑。
 */
import { getOrbitPlatformViewModel } from "../orbit-admin-platform-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealPlatform } from "./orbit-real-platform";

export default async function PlatformPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealPlatform viewModel={localizeOrbitTree(getOrbitPlatformViewModel(), language)} />
    </>
  );
}
