/**
 * All actions route adapter —— 挂在「人脉」左侧栏下。
 */
import { AccountTopNav } from "../../orbit-account-shell";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../orbit-layout-constants";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { CrmSidebar } from "../orbit-crm-sidebar";
import {
  loadAppAllActionsRouteViewModel,
  type AppAllActionsSearchParams,
} from "./compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitRealAllActions } from "./orbit-real-all-actions";

export const dynamic = "force-dynamic";

export default async function AppAllActionsPage({
  searchParams,
}: {
  searchParams?: Promise<AppAllActionsSearchParams>;
} = {}) {
  const viewModel = await loadAppAllActionsRouteViewModel(await searchParams);
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <AccountTopNav active="cards" />
      <div
        data-orbit-route="app-all-actions-route"
        style={{
          display: "grid",
          gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`,
          height: "calc(100dvh - 64px)",
          minHeight: 0,
        }}
      >
        <CrmSidebar active="allActions" />
        <div style={{ overflowY: "auto", padding: "28px 32px 80px" }}>
          <OrbitRealAllActions viewModel={localizeOrbitTree(viewModel, language)} />
        </div>
      </div>
    </>
  );
}
