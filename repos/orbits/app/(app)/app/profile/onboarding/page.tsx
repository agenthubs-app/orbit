/**
 * 新用户引导 route adapter（b1 A3 Web #16–#20：无壳的五屏资料）。
 * 首次登录 / 资料门禁未通过时，proxy 与 /app/profile/continue 把用户带到这里（门禁豁免路由）。
 * 只做鉴权与名片识别可用性判定；资料在客户端经 /api/profile 读写。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../../features/acquisition/business-card-capture-availability";
import { OnboardingFlow } from "../../orbit-2026/onboarding/onboarding-flow";
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
    <div data-r28-onboarding data-orbit-route="app-profile-onboarding-route">
      <OnboardingFlow
        actorKey={session.user.id}
        cardScanAvailable={resolveBusinessCardCaptureAvailability().available}
        next={next}
        todayIso={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
