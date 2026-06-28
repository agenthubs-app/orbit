import { getOrbitAccountAuthViewModel } from "../../orbit-account-auth-route-view-model";
import { OrbitLangRuntime } from "../../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAccountAuth } from "../orbit-real-account-auth";

export default function AppAccountSignupPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAccountAuth viewModel={getOrbitAccountAuthViewModel("signup")} />
    </>
  );
}
