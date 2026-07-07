import { getOrbitServerLanguage } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsDashboard } from "../orbit-real-cards-dashboard";

export default async function AppContactsDashboardPage() {
  await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsDashboard />
    </>
  );
}
