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
          .orbit-all-actions-mtabs { display: none; }
          @media (max-width: 760px) {
            .orbit-all-actions-columns { grid-template-columns: 1fr; height: auto; }
            .orbit-all-actions-columns > aside { display: none; }
            /* 桌面端的 CRM 侧栏在移动端隐藏后，用与人脉列表页移动端同款的
               段导航 chips 兜住节内导航，避免 All actions 变成移动端死胡同。 */
            .orbit-all-actions-mtabs { display: flex; gap: 8px; margin: 0 -18px; overflow-x: auto; padding: 14px 18px 4px; }
            .orbit-all-actions-mtabs .chip { flex-shrink: 0; text-decoration: none; }
          }
        `}</style>
        <div data-orbit-route="app-all-actions-route" className="orbit-all-actions-columns">
          <CrmSidebar active="allActions" />
          <div style={{ overflowY: "auto", padding: "28px 32px 80px" }}>
            <nav aria-label="人脉分区" className="orbit-all-actions-mtabs scroll noscroll">
              <a className="chip" href="/app/contacts">全部</a>
              <a className="chip" href="/app/contacts/pipeline">管线</a>
              <a className="chip" href="/app/contacts/graph">图谱</a>
              <a className="chip" href="/app/contacts/intros">引荐</a>
              <a aria-current="page" className="chip is-active" href="/app/contacts/all-actions">All actions</a>
            </nav>
            <OrbitRealAllActions viewModel={localizeOrbitTree(viewModel, language)} />
          </div>
        </div>
      </main>
    </>
  );
}
