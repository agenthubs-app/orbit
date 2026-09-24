/**
 * 关系管线页 route adapter。
 *
 * 这里只连接 live-capable contacts route model + contacts analysis 和 Network v2 管线屏。
 */
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  ContactsSubrouteStateBoundary,
  contactsRouteToOrbitContactsViewModel,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import {
  loadAppContactsRouteViewModel,
  type AppContactsSearchParams,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { applyOrbitContactsPresentation } from "../../orbit-contacts-presentation";
import { AccountTopNav } from "../../orbit-account-shell";
import { loadContactsAnalysis } from "../analysis/contacts-analysis-route-service";
import { NetworkPipeline } from "../network-0918/network-pipeline";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";

interface AppContactsPipelinePageProps {
  searchParams?: Promise<AppContactsSearchParams>;
}

export default async function AppContactsPipelinePage({
  searchParams,
}: AppContactsPipelinePageProps = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fpipeline");
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
  const [routeModel, analysis] = await Promise.all([
    loadAppContactsRouteViewModel(params, actor.id),
    loadContactsAnalysis(actor.id, language),
  ]);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        // 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。
        <div data-orbit-real-page="network" data-orbit-route="app-contacts-pipeline-route">
          <AccountTopNav active="cards" />
          <NetworkPipeline
            // 与 dashboard/page.tsx 同一包裹：先做 contacts 展示层归一，再按语言本地化整棵树。
            viewModel={localizeOrbitTree(applyOrbitContactsPresentation(contactsRouteToOrbitContactsViewModel(routeModel.payload), language), language)}
            analysis={analysis}
          />
        </div>
      ) : (
        <ContactsSubrouteStateBoundary
          marker="app-contacts-pipeline-route"
          routeModel={routeModel}
        />
      )}
    </>
  );
}
