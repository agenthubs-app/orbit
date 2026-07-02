/**
 * `/app` 的入口页。
 *
 * 这个 route 负责读取服务端语言偏好，并把本地化后的语言传给真实落地页组件。
 */
import { getOrbitServerLanguage } from "./orbit-language-server";
import { OrbitRealLandingPage } from "./orbit-real-landing-page";

export default async function AppHomePage() {
  const language = await getOrbitServerLanguage();

  return <OrbitRealLandingPage language={language} />;
}
