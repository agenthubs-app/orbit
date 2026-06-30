/**
 * 忘记密码页 route adapter。
 *
 * 这个文件只选择 forgot 模式 view model，并复用账号认证组件渲染页面。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAccountAuth } from "../orbit-real-account-auth";

export default async function AppAccountForgotPasswordPage() {
  const language = await getOrbitServerLanguage();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAccountAuth viewModel={localizeOrbitTree(getOrbitAccountAuthViewModel("forgot"), language)} />
    </>
  );
}
