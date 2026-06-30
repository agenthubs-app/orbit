/**
 * 登录页 route adapter。
 *
 * 负责选择 login 版本的账号认证 view model，并挂载共享参考样式和视觉冻结 runtime。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAccountAuth } from "../orbit-real-account-auth";

export default async function AppAccountLoginPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAccountAuth viewModel={localizeOrbitTree(getOrbitAccountAuthViewModel("login"), language)} />
    </>
  );
}
