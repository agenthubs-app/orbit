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
