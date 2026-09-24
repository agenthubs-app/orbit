/**
 * /app/profile 与 /app/settings 共用的服务端加载：会话 → actor（仅 live 模式）→ 资料路由视图模型。
 * 逻辑原样抽自 profile/page.tsx（actor 解析 + loadAppProfileRouteViewModel + 失败分支）。
 */
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import {
  resolveAuthenticatedApiActorFromSession,
  type AuthenticatedApiActor,
} from "../../../../api/_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  loadAppProfileRouteViewModel,
  type AppProfileRouteStateViewModel,
} from "../compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import {
  profileRouteToOrbitProfileEditorViewModel,
  type OrbitProfileEditorViewModel,
} from "../profile-editor-adapter";

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

export function ProfileRouteStateBoundary({
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

export type ProfileEditorPageLoad =
  | { ok: true; viewModel: OrbitProfileEditorViewModel }
  | { ok: false; boundary: ReactNode };

/**
 * @param next      未登录时登录后回跳的地址（`/app/account/login?next=`）。
 * @param retryHref 失败态「重试」按钮地址（默认与 next 相同）。
 */
export async function loadProfileEditorPage(
  next: string,
  retryHref: string = next,
): Promise<ProfileEditorPageLoad> {
  // 个人资料是登录后的页面:未登录跳登录页,带回跳地址。
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(next)}`);
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

  if (routeModel.state === "success") {
    return { ok: true, viewModel: profileRouteToOrbitProfileEditorViewModel(routeModel) };
  }
  return {
    ok: false,
    boundary: (
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
    ),
  };
}
