/**
 * 邀请码注册页 route adapter。
 *
 * route 读取 URL 中的 `code` 参数，交给 live-capable 注册 route loader
 * 组合活动和个人资料上下文，再交给注册表单渲染。
 */
import { StateView } from "../../../../shared/ui/state-view";
import type { OrbitLanguage } from "../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import {
  loadAppRegisterRouteViewModel,
  type AppRegisterRouteStateViewModel,
  type AppRegisterSearchParams,
} from "./compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model";
import { OrbitRealRegister } from "./orbit-real-register";

async function getRegisterPageLanguage(): Promise<OrbitLanguage> {
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

function RegisterRouteStateBoundary({
  routeState,
}: {
  routeState: AppRegisterRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-register-route-state">
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

export default async function AppRegisterPage({
  searchParams,
}: {
  searchParams: Promise<AppRegisterSearchParams>;
}) {
  const query = await searchParams;
  const routeModel = await loadAppRegisterRouteViewModel({
    searchParams: query,
  });
  const language =
    routeModel.state === "success" ? await getRegisterPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-register-route">
          <OrbitRealRegister
            viewModel={localizeOrbitTree(routeModel.register, language)}
          />
        </div>
      ) : (
        <RegisterRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
