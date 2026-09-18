import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import {
  resolveAuthenticatedApiActorFromSession,
  type AuthenticatedApiActor,
} from "../../../api/_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { bilingualText } from "../../../../shared/ui/bilingual";
import { StateView } from "../../../../shared/ui/state-view";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppProfileRouteViewModel,
  type AppProfileRouteStateViewModel,
} from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileEditorViewModel } from "./profile-editor-adapter";
import { OrbitRealProfile } from "./orbit-real-profile";
import {
  normalizeProfileOnboardingNext,
  profileContinuationPath,
  profileOnboardingPath,
} from "./profile-onboarding-navigation";

type AppProfileSearchParams = {
  next?: string | string[];
  onboarding?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type ProfileAccessFailureCode =
  | "PROFILE_ACTOR_UNAVAILABLE"
  | "PROFILE_LIVE_MODE_REQUIRED";

function profileAccessFailureRouteState(input: {
  code: ProfileAccessFailureCode;
  retryHref: string;
}): AppProfileRouteStateViewModel {
  return {
    copy: {
      description: bilingualText(
        "你的资料暂时无法加载，请稍后重试。",
        "Your profile is temporarily unavailable. Please try again.",
      ),
      emptyState: bilingualText(
        "没有修改你的资料。",
        "Your profile has not been changed.",
      ),
      eyebrow: bilingualText("资料暂时不可用", "Profile temporarily unavailable"),
      guardrail: bilingualText(
        "请点击重试重新加载。",
        "Use Retry to load your profile again.",
      ),
      nextStep: bilingualText("请稍后重试。", "Please try again later."),
      purpose: bilingualText(
        "先确认资料可用，再继续编辑。",
        "Your profile must be available before editing can continue.",
      ),
      title: bilingualText("资料暂时无法加载", "Your profile is temporarily unavailable"),
    },
    errorCode: input.code,
    evidenceIds: [`evidence:${input.code.toLowerCase()}`],
    recoveryActions: [
      {
        id: "profile-access-retry",
        href: input.retryHref,
        label: bilingualText("重试", "Retry"),
        recoveryCopy: bilingualText(
          "稍后重试，不会修改你的资料。",
          "Please retry later. Your profile will not be changed.",
        ),
      },
    ],
    scenario: "failure",
  };
}

type ProfileRouteState =
  | AppProfileRouteStateViewModel
  | {
      copy: AppProfileRouteStateViewModel["copy"];
      evidenceIds: readonly string[];
      recoveryActions?: readonly AppProfileRouteStateViewModel["recoveryActions"][number][];
    };

function ProfileRouteStateBoundary({
  routeState,
}: {
  routeState: ProfileRouteState;
}) {
  return (
    <div data-orbit-route="app-profile-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={(routeState.recoveryActions ?? []).map((action) => ({
          id: action.id,
          label: action.label,
          recoveryCopy: action.recoveryCopy,
          href: action.href,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppProfilePage({
  searchParams,
}: {
  searchParams?: Promise<AppProfileSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const onboardingNext =
    firstSearchParam(resolvedSearchParams?.onboarding) === "1"
      ? normalizeProfileOnboardingNext(resolvedSearchParams?.next)
      : undefined;
  const retryHref = onboardingNext
    ? profileOnboardingPath(onboardingNext)
    : "/app/profile";
  // 个人资料是登录后的页面:未登录跳登录页,带回跳地址。
  const session = await auth();

  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(
        onboardingNext
          ? profileContinuationPath(onboardingNext)
          : "/app/profile",
      )}`,
    );
  }

  const liveMode = resolveFeatureMode() === "live";
  let actor: AuthenticatedApiActor | null = null;

  if (liveMode) {
    try {
      actor = await resolveAuthenticatedApiActorFromSession({
        email: session.user.email,
        name: session.user.name,
        userId: session.user.id,
      });
    } catch {
      actor = null;
    }
  }

  const routeModel = actor
    ? await loadAppProfileRouteViewModel({
        displayName:
          actor.name?.trim() ||
          session.user.name?.trim() ||
          session.user.email?.trim() ||
          "Orbit member",
        email: actor.email ?? session.user.email,
        id: actor.id,
      })
    : {
        state: "route-state" as const,
        routeState: profileAccessFailureRouteState({
          code:
            liveMode ? "PROFILE_ACTOR_UNAVAILABLE" : "PROFILE_LIVE_MODE_REQUIRED",
          retryHref,
        }),
      };
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <OrbitRealProfile
          onboardingNext={onboardingNext}
          viewModel={profileRouteToOrbitProfileEditorViewModel(routeModel)}
        />
      ) : (
        <ProfileRouteStateBoundary
          routeState={
            routeModel.state === "route-state"
              ? routeModel.routeState
              : {
                  copy: routeModel.failure,
                  evidenceIds: routeModel.failure.evidenceIds,
                }
          }
        />
      )}
    </>
  );
}
