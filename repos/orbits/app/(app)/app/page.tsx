import { getOrbitServerLanguage } from "./orbit-language-server";
import { OrbitRealLandingPage } from "./orbit-real-landing-page";

export default async function AppHomePage() {
  const language = await getOrbitServerLanguage();

  return <OrbitRealLandingPage language={language} />;
}
