import { AccountTopNav } from "../orbit-account-shell";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { loadProfileEditorPage } from "./profile-0918/load-profile-editor-page";
import { ProfileScreens, type ProfileView } from "./profile-0918/profile-screens";
import {
  normalizeProfileOnboardingNext,
  profileContinuationPath,
  profileOnboardingPath,
} from "./profile-onboarding-navigation";

type AppProfileSearchParams = {
  next?: string | string[];
  onboarding?: string | string[];
  view?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const PROFILE_VIEWS: readonly ProfileView[] = ["profile", "persona", "basic", "connect"];

function profileViewParam(value: string | undefined): ProfileView | undefined {
  return PROFILE_VIEWS.find((view) => view === value);
}

export default async function AppProfilePage({
  searchParams,
}: {
  searchParams?: Promise<AppProfileSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const onboarding = firstSearchParam(resolvedSearchParams?.onboarding) === "1";
  const onboardingNext = onboarding
    ? normalizeProfileOnboardingNext(resolvedSearchParams?.next)
    : undefined;
  const retryHref = onboardingNext
    ? profileOnboardingPath(onboardingNext)
    : "/app/profile";
  // 未指定 view → ProfileScreens 决定默认屏（onboarding=1 且未完成 → basic，否则 profile）。
  const view = profileViewParam(firstSearchParam(resolvedSearchParams?.view));

  const page = await loadProfileEditorPage(
    onboardingNext ? profileContinuationPath(onboardingNext) : "/app/profile",
    retryHref,
  );

  if (page.ok === false) {
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        {page.boundary}
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="profile-0918" data-orbit-route="app-profile-route">
        <AccountTopNav active="me" />
        <ProfileScreens
          onboarding={onboarding}
          onboardingNext={onboardingNext}
          view={view}
          viewModel={page.viewModel}
        />
      </div>
    </>
  );
}
