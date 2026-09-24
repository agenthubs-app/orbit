/**
 * 注册账号页 route adapter。
 *
 * 负责选择 signup 版本的账号认证 view model，并读取 account session 边界。
 */
import { StateView } from "../../../../../shared/ui/state-view";
import { redirect } from "next/navigation";
import { auth } from "../../../../../auth";
import { normalizeOrbitAuthReturnPath } from "../../../../../features/auth/app-auth-routing";
import type { OrbitLanguage } from "../../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  loadAppAccountAuthRouteViewModel,
  type AppAccountAuthRouteStateViewModel,
  type AppAccountAuthSearchParams,
} from "../compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model";
import { enabledOAuthProviders } from "../../../../../features/auth/oauth-providers";
import { OrbitLanding0918 } from "../../orbit-landing-0918";
import { AuthModal } from "../auth-0918/auth-modal";

async function getAccountSignupPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function AccountSignupRouteStateBoundary({
  routeState,
}: {
  routeState: AppAccountAuthRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-account-signup-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={routeState.recoveryActions.map((action) => ({
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

export default async function AppAccountSignupPage({
  searchParams,
}: {
  searchParams?: Promise<AppAccountAuthSearchParams>;
} = {}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth();
  if (session?.user?.id) {
    redirect(normalizeOrbitAuthReturnPath(resolvedSearchParams?.next));
  }

  const routeModel = await loadAppAccountAuthRouteViewModel({
    authMode: "signup",
    searchParams: resolvedSearchParams,
  });
  const language =
    routeModel.state === "success" ? await getAccountSignupPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-account-signup-route">
          {/* 认证弹窗 任务 2：落地页在下（未登录态）、弹窗在上（设计 342–346）；view model 只取 defaultNext（标题 / 描述 / 按钮文案改由弹窗内 t() 给出设计文案）。 */}
          <OrbitLanding0918 authenticated={false} />
          <AuthModal
            defaultNext={localizeOrbitTree(routeModel.auth, language).defaultNext}
            oauthProviders={enabledOAuthProviders()}
            view="register"
          />
        </div>
      ) : (
        <AccountSignupRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
