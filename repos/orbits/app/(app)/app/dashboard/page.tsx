import { getOrbitServerLanguage } from "../orbit-language-server";
import { buildOrbitParty } from "../orbit-party-presentation";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
// /app/dashboard and /app/party render the same relationship-party UI —
// import it under this route's own name so the JSX below reads honestly
// instead of implying a party-specific component lives here.
import { OrbitRealParty as OrbitRealDashboard } from "./orbit-real-party";

export default async function AppPartyPage() {
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealDashboard viewModel={buildOrbitParty(language)} />
    </>
  );
}
