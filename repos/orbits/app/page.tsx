/**
 * 根路径 `/` 的页面入口。
 *
 * `/` 是产品首页：先展示 Orbit Agent，再给出活动与人脉上下文。
 * 个人主页继续由 `/app/home` 和 `/app/home/events` 承载，避免根路径退回
 * 到单纯的“我的活动”页面。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "./(app)/app/orbit-language-server";
import { getOrbitLandingViewModel } from "./(app)/app/orbit-landing-route-view-model";
import { OrbitRealLandingPage } from "./(app)/app/orbit-real-landing-page";
import { OrbitReferenceStyles } from "./(app)/app/orbit-reference-styles";
import type { OrbitLanguage } from "./(app)/app/orbit-language-core";

interface RootPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function RootPage(_props: RootPageProps = {}) {
  let language: OrbitLanguage = "zh";

  try {
    language = await getOrbitServerLanguage();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("outside a request scope")) {
      throw error;
    }
    // Node smoke tests render this Server Component without a Next request store.
    // Real product requests still resolve language from headers/cookies above.
  }

  const viewModel = localizeOrbitTree(getOrbitLandingViewModel(), language);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitRealLandingPage language={language} viewModel={viewModel} />
    </>
  );
}
