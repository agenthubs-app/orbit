/**
 * 注册账号页 route adapter。
 *
 * 负责选择 signup 版本的账号认证 view model，并读取 account session 边界。
 */
import { StateView } from "../../../../../shared/ui/state-view";
import type { OrbitLanguage } from "../../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  loadAppAccountAuthRouteViewModel,
  type AppAccountAuthRouteStateViewModel,
  type AppAccountAuthSearchParams,
} from "../compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model";
import { OrbitRealAccountAuth } from "../orbit-real-account-auth";

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
  const routeModel = await loadAppAccountAuthRouteViewModel({
    authMode: "signup",
    searchParams: await searchParams,
  });
  const language =
    routeModel.state === "success" ? await getAccountSignupPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-account-signup-route">
          <OrbitRealAccountAuth
            viewModel={localizeOrbitTree(routeModel.auth, language)}
          />
        </div>
      ) : (
        <AccountSignupRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
