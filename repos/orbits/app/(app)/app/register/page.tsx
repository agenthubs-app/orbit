import { getOrbitRegisterViewModel } from "../orbit-register-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitRealRegister } from "./orbit-real-register";

export default async function AppRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealRegister viewModel={localizeOrbitTree(getOrbitRegisterViewModel(code), language)} />
    </>
  );
}
