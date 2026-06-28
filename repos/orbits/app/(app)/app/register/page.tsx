import { getOrbitRegisterViewModel } from "../orbit-register-route-view-model";
import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitRealRegister } from "./orbit-real-register";

export default async function AppRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitRealRegister viewModel={getOrbitRegisterViewModel(code)} />
    </>
  );
}
