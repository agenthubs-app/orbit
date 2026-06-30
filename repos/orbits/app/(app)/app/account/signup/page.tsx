/**
 * 注册账号页 route adapter。
 *
 * 负责选择 signup 版本的账号认证 view model；真实表单 UI 在 `OrbitRealAccountAuth` 中。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAccountAuth } from "../orbit-real-account-auth";

export default async function AppAccountSignupPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAccountAuth viewModel={localizeOrbitTree(getOrbitAccountAuthViewModel("signup"), language)} />
    </>
  );
}
