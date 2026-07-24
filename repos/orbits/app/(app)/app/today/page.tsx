/**
 * Today 决策收件箱 route adapter。
 *
 * route 只负责挂样式/runtime 并把 view-model 交给 UI；
 * 数据来源是操作账本 service（mock-first）。
 */
import { AccountTopNav } from "../orbit-account-shell";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppTodayRouteViewModel,
  type AppTodaySearchParams,
} from "./compose-app-today-from-agent-ledger/today-route-view-model";
import { OrbitRealToday } from "./orbit-real-today";
import { OrbitTodayDecisionPanel } from "./orbit-today-decision-panel";

export const dynamic = "force-dynamic";

export default async function AppTodayPage({
  searchParams,
}: {
  searchParams?: Promise<AppTodaySearchParams>;
} = {}) {
  const viewModel = await loadAppTodayRouteViewModel(await searchParams);
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <AccountTopNav active="today" />
      <div data-orbit-route="app-today-route" style={{ margin: "0 auto", maxWidth: 1180, padding: "28px 24px 96px" }}>
        <div style={{ alignItems: "start", display: "grid", gap: 28, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 380px)" }}>
          <OrbitRealToday viewModel={localizeOrbitTree(viewModel, language)} />
          <OrbitTodayDecisionPanel entry={localizeOrbitTree(viewModel.selectedEntry, language)} />
        </div>
      </div>
    </>
  );
}
