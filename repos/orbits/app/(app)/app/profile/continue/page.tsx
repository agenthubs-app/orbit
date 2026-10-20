import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveProfileOnboardingProgressService } from "../../../../../features/profile/onboarding-progress-factory";
import type { ProfileOnboardingProgress } from "../../../../../features/profile/onboarding-progress";
import { readProfileOnboardingAccess } from "../profile-onboarding-access.server";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import {
  normalizeProfileOnboardingNext,
  profileOnboardingFlowPath,
} from "../profile-onboarding-navigation";

type ProfileContinueSearchParams = {
  next?: string | string[];
};

const RETRY_COPY = {
  profile: {
    en: "Could not load your profile. Reload this page to try again.",
    zh: "无法读取资料。请刷新页面重试。",
    ja: "プロフィールを読み込めませんでした。ページを再読み込みしてください。",
  },
  progress: {
    en: "Could not load your setup progress. Reload this page to try again.",
    zh: "无法读取设置进度。请刷新页面重试。",
    ja: "設定の進捗を読み込めませんでした。ページを再読み込みしてください。",
  },
} as const;

/**
 * The authenticated post-sign-in handoff. It reads only the actor-scoped
 * profile and sends incomplete profiles to the new-user onboarding flow; optional
 * extraction and suggestions are deliberately outside this navigation path.
 */
export default async function AppProfileContinuePage({
  searchParams,
}: {
  searchParams?: Promise<ProfileContinueSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const next = normalizeProfileOnboardingNext(resolvedSearchParams?.next);
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(next)}`);
  }

  let access: Awaited<ReturnType<typeof readProfileOnboardingAccess>> = {
    status: "unavailable",
  };
  try {
    access = await readProfileOnboardingAccess({
      email: session.user.email,
      name: session.user.name,
      userId: session.user.id,
    });
  } catch {
  }

  if (access.status === "unavailable" || !access.actorId) {
    const language = await getOrbitServerLanguage();
    return <main role="alert">{RETRY_COPY.profile[language]}</main>;
  }

  let flow: ProfileOnboardingProgress | null;
  try {
    const service = resolveProfileOnboardingProgressService(access.actorId);
    if (!service) throw new Error("Progress storage unavailable");
    flow = await service.get();
  } catch {
    const language = await getOrbitServerLanguage();
    return <main role="alert">{RETRY_COPY.progress[language]}</main>;
  }
  if (access.status === "complete" && (!flow || flow.finishedAt)) redirect(next);

  redirect(profileOnboardingFlowPath(next));
}
