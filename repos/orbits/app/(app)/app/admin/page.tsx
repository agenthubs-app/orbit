/**
 * 管理后台首页 route adapter。
 *
 * 负责本地化 admin view model，并挂载管理员工作台组件。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { getOrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealAdminWorkspace } from "./orbit-real-admin";

export default async function AdminPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAdminWorkspace viewModel={localizeOrbitTree(getOrbitAdminViewModel(), language)} />
    </>
  );
}
