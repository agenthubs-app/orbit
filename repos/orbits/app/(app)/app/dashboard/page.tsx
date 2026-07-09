import { getOrbitServerLanguage } from "../orbit-language-server";
import { buildOrbitParty } from "../orbit-party-presentation";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealParty } from "./orbit-real-party";

export default async function AppPartyPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealParty viewModel={buildOrbitParty(language)} />
    </>
  );
}
