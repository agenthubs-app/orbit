/**
 * 人脉概览 / AI 人脉分析 route adapter（/app/contacts/dashboard）。
 *
 * 只连接 live-capable contacts route model + contacts analysis 和 Network v2 概览屏 / 分析子页；
 * `?tab=structure|opportunities` 进分析子页（既有 query 语义保留），否则为概览。
 *
 * W0005 示例模式：本人在引导期示例里时概览用示例人物的数据渲染，分析子页只显示横条与说明；
 * 两者都不调用 `loadContactsAnalysis`／`loadAppContactsRouteViewModel`。
 *
 * W0049：「结构」标签另外并行读附加数据（快照诊断与洞察、计划需求高亮、依据姓名），
 * 30 天变化用刷新强度读模型时拿到的 state 行；概览不读这些。
 * W0050：标签由 URL 驱动（W50-5），结构附加数据只在 `?tab=structure` 读；「机会」标签只在 `?tab=opportunities` 读
 * `loadOpportunitiesTab`（对任何表 0 写入、计划只读、0 次 AI）。示例模式两个标签都 0 次读取。
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
import { NetworkDemoFrame } from "../network-0918/network-demo-frame";
import { NetworkDemoAnalysisNotice } from "../network-0918/network-shell";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { buildDemoNetworkAnalysis, buildDemoNetworkViewModel } from "../../_demo/demo-network";
import { ensureRelationshipStrengthsForPage, readRelationshipTierLookup } from "../../../../../features/relationship-strength/read-model";
import { loadStructureTabExtras } from "../analysis/structure-tab-loader";
import { loadOpportunitiesTab } from "../analysis/opportunities-route-service";

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

  const guide = await readDemoModeViewForActor({ actorId: actor.id, userId: session.user.id });
  const [language, params] = await Promise.all([
    getOrbitServerLanguage(),
    searchParams,
  ]);
  if (guide) {
    const now = new Date();
    const lang = language === "en" ? "en" : "zh";
    const overview = params?.tab !== "structure" && params?.tab !== "opportunities";
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <NetworkDemoFrame guide={guide} route="app-contacts-dashboard-route">
          {overview
            ? <NetworkOverview viewModel={buildDemoNetworkViewModel(now, lang)} analysis={buildDemoNetworkAnalysis(now, lang)} />
            : <NetworkDemoAnalysisNotice />}
        </NetworkDemoFrame>
      </>
    );
  }
  // W0047：先刷新关系强度读模型（来源戳与东京日未变时只读一条语句；失败不影响页面），分析里的档位分布读它。
  const strengthState = await ensureRelationshipStrengthsForPage(actor.id, new Date());
  const tab = params?.tab === "structure" || params?.tab === "opportunities" ? params.tab : "overview";
  const analysisPromise = loadContactsAnalysis(actor.id, language);
  // W0050（W50-5）：标签由 URL 驱动，服务端只读当前标签的数据——结构附加数据只在 ?tab=structure，机会数据只在 ?tab=opportunities。
  const [analysis, routeModel, structureExtras, opportunities] = await Promise.all([
    analysisPromise,
    loadAppContactsRouteViewModel({}, actor.id),
    tab === "structure" ? loadStructureTabExtras({ actorId: actor.id, language, strengthState }) : Promise.resolve(undefined),
    tab === "opportunities"
      ? loadOpportunitiesTab({
        actorId: actor.id,
        goal: analysisPromise.then((value) => (value.state === "ready" && "data" in value.goal ? value.goal.data.text || null : null)),
        language,
        now: new Date(),
      })
      : Promise.resolve(undefined),
  ]);
  const tiers = routeModel.state === "success"
    ? await readRelationshipTierLookup({ actorId: actor.id, contactIds: routeModel.payload.contacts.map((contact) => contact.id) })
    : undefined;
  const toViewModel = (payload: Parameters<typeof contactsRouteToOrbitContactsViewModel>[0]) =>
    localizeOrbitTree(applyOrbitContactsPresentation(contactsRouteToOrbitContactsViewModel(payload, tiers), language), language);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        // 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。
        <div data-orbit-real-page="network" data-orbit-route="app-contacts-dashboard-route">
          <AccountTopNav active="cards" />
          {tab === "overview"
            ? <NetworkOverview viewModel={toViewModel(routeModel.payload)} analysis={analysis} />
            : <NetworkAnalysis viewModel={toViewModel(routeModel.payload)} analysis={analysis} initialTab={tab === "opportunities" ? "opp" : "struct"} structureExtras={structureExtras} opportunities={opportunities} />}
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
