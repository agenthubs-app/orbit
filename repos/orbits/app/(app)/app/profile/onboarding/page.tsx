/**
 * 新用户引导 route adapter（Orbit_0918 新用户引导.dc.html）。
 * 首次登录 / 资料门禁未通过时，proxy 与 /app/profile/continue 把用户带到这里（门禁豁免路由）。
 * 只做鉴权与名片识别可用性判定；资料在客户端经 /api/profile 读写。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../../features/acquisition/business-card-capture-availability";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OnboardingFlow } from "../onboarding-0918/onboarding-flow";
import {
  normalizeProfileOnboardingNext,
  profileOnboardingFlowPath,
} from "../profile-onboarding-navigation";

export const dynamic = "force-dynamic";

export default async function AppProfileOnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>;
} = {}) {
  const params = await searchParams;
  const next = normalizeProfileOnboardingNext(params?.next);
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(profileOnboardingFlowPath(next))}`);
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-real-page="onboarding-0918" data-orbit-route="app-profile-onboarding-route">
        <OnboardingFlow
          actorKey={session.user.id}
          cardScanAvailable={resolveBusinessCardCaptureAvailability().available}
          next={next}
          todayIso={new Date().toISOString().slice(0, 10)}
        />
      </div>
    </>
  );
}
