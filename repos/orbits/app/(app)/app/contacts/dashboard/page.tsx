/**
 * 人脉概览 / AI 人脉分析 route adapter（/app/contacts/dashboard）。
 *
 * 只连接 live-capable contacts route model + contacts analysis 和 Network v2 概览屏 / 分析子页；
 * `?tab=structure|opportunities` 进分析子页（既有 query 语义保留），否则为概览。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { AccountTopNav } from "../../orbit-account-shell";
import { applyOrbitContactsPresentation } from "../../orbit-contacts-presentation";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { loadContactsAnalysis } from "../analysis/contacts-analysis-route-service";
import {
  ContactsSubrouteStateBoundary,
  contactsRouteToOrbitContactsViewModel,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import { loadAppContactsRouteViewModel } from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { NetworkAnalysis } from "../network-0918/network-analysis";
import { NetworkOverview } from "../network-0918/network-overview";

export default async function AppContactsDashboardPage({ searchParams }: {
  searchParams?: Promise<{ tab?: string | string[] }>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fdashboard");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const [language, params] = await Promise.all([
    getOrbitServerLanguage(),
    searchParams,
  ]);
  const [analysis, routeModel] = await Promise.all([
    loadContactsAnalysis(actor.id, language),
    loadAppContactsRouteViewModel({}, actor.id),
  ]);
  const tab = params?.tab === "structure" || params?.tab === "opportunities" ? params.tab : "overview";

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        // 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。
        <div data-orbit-real-page="network" data-orbit-route="app-contacts-dashboard-route">
          <AccountTopNav active="cards" />
          {(() => {
            const viewModel = localizeOrbitTree(
              applyOrbitContactsPresentation(contactsRouteToOrbitContactsViewModel(routeModel.payload), language),
              language,
            );
            return tab === "overview"
              ? <NetworkOverview viewModel={viewModel} analysis={analysis} />
              : <NetworkAnalysis viewModel={viewModel} analysis={analysis} initialTab={tab === "opportunities" ? "opp" : "struct"} />;
          })()}
        </div>
      ) : (
        <ContactsSubrouteStateBoundary
          marker="app-contacts-dashboard-route"
          routeModel={routeModel}
        />
      )}
    </>
  );
}
