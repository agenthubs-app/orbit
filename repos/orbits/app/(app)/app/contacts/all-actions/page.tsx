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
      <main data-orbit-real-page="all-actions" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <style>{`
          .orbit-all-actions-columns { display: grid; grid-template-columns: ${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr; height: calc(100dvh - 64px); min-height: 0; }
          @media (max-width: 760px) { .orbit-all-actions-columns { grid-template-columns: 1fr; height: auto; } .orbit-all-actions-columns > aside { display: none; } }
        `}</style>
        <div data-orbit-route="app-all-actions-route" className="orbit-all-actions-columns">
          <CrmSidebar active="allActions" />
          <div style={{ overflowY: "auto", padding: "28px 32px 80px" }}>
            <OrbitRealAllActions viewModel={localizeOrbitTree(viewModel, language)} />
          </div>
        </div>
      </main>
    </>
  );
}
