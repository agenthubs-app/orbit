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
 * W0051：第三个标签 `?tab=insight` 只在该标签读 `loadInsightsTab`（只读 contact_insights 一页 30 位，0 次 AI、0 次配额预留）；
 * 示例模式下同样只显示横条与说明。
 * W0052：概览（无 tab）另外并行读驾驶舱附加数据（`loadOverviewCockpit`：快照只读视图、计划 getCurrent + 纯投影、
 * 待确认匹配、时间线最近 5 条、档位看板前 2 位、一次姓名读取），「按来源」用名单读取已有的全量分面；概览不再读本页档位表，
 * 也不刷新强度缓存（review P1：打开概览对任何表 0 写入，与机会标签同一口径）。
 * 示例模式概览用 `buildDemoNetworkOverviewParts`（0 次读取）。
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
import { buildDemoNetworkAnalysis, buildDemoNetworkOverviewParts } from "../../_demo/demo-network";
import { ensureRelationshipStrengthsForPage, readRelationshipTierLookup } from "../../../../../features/relationship-strength/read-model";
import { loadStructureTabExtras } from "../analysis/structure-tab-loader";
import { loadOpportunitiesTab } from "../analysis/opportunities-route-service";
import { loadInsightsTab } from "../analysis/insights-tab";
import { loadOverviewCockpit } from "../analysis/overview-cockpit-loader";
import { buildNetworkOverviewData } from "../network-0918/network-overview-cockpit-model";

export default async function AppContactsDashboardPage({ searchParams }: {
  searchParams?: Promise<{ tab?: string | string[] } & Record<string, string | string[] | undefined>>;
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
    // zh 中文，en 与 ja 英文（沿用 t() 的 ja→en 回退；W0052 review P2）。
    const lang = language === "zh" ? "zh" : "en";
    const overview = params?.tab !== "structure" && params?.tab !== "opportunities" && params?.tab !== "insight";
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <NetworkDemoFrame guide={guide} route="app-contacts-dashboard-route">
          {overview
            ? (() => {
              const demoAnalysis = buildDemoNetworkAnalysis(now, lang);
              return <NetworkOverview analysis={demoAnalysis} overview={buildNetworkOverviewData(buildDemoNetworkOverviewParts(now, lang), demoAnalysis)} />;
            })()
            : <NetworkDemoAnalysisNotice />}
        </NetworkDemoFrame>
      </>
    );
  }
  const tab = params?.tab === "structure" || params?.tab === "opportunities" || params?.tab === "insight" ? params.tab : "overview";
  // W0047：先刷新关系强度读模型（来源戳与东京日未变时只读一条语句；失败不影响页面），分析里的档位分布读它。
  // W0050（D46③、review P1）：机会标签对任何表 0 写入——不刷新强度缓存，直接读上次算好的结果（待唤醒、档位分布），
  // 刷新交给结构、洞察、管线、名单等其他入口；缓存为空时待唤醒如实显示空态。
  // W0052（review P1）：概览同样对任何表 0 写入——不刷新强度缓存，只读上次算好的档位（缺的如实标「待统计」）。
  const strengthState = tab === "opportunities" || tab === "overview" ? null : await ensureRelationshipStrengthsForPage(actor.id, new Date());
  const analysisPromise = loadContactsAnalysis(actor.id, language);
  // W0050（W50-5）：标签由 URL 驱动，服务端只读当前标签的数据——结构附加数据只在 ?tab=structure，机会数据只在 ?tab=opportunities。
  const goalPromise = analysisPromise.then((value) => (value.state === "ready" && "data" in value.goal ? value.goal.data.text || null : null));
  const [analysis, routeModel, structureExtras, opportunities, insights, cockpit] = await Promise.all([
    analysisPromise,
    loadAppContactsRouteViewModel({}, actor.id),
    tab === "structure" ? loadStructureTabExtras({ actorId: actor.id, language, strengthState }) : Promise.resolve(undefined),
    tab === "opportunities"
      ? loadOpportunitiesTab({
        actorId: actor.id,
        goal: goalPromise,
        language,
        now: new Date(),
      })
      : Promise.resolve(undefined),
    // W0051：只读一页洞察（档位实时取 W0047 读模型），0 次 AI。
    tab === "insight" ? loadInsightsTab({ actorId: actor.id, goal: goalPromise, now: new Date(), search: params ?? {} }) : Promise.resolve(undefined),
    // W0052：概览驾驶舱附加数据（只读：计划 0 写入、快照不排队、0 次 AI）。
    tab === "overview" ? loadOverviewCockpit({ actorId: actor.id, language, now: new Date() }) : Promise.resolve(undefined),
  ]);
  // 本页档位表只给分析标签的名单用；概览的档位与重点联系人来自全量分布与档位看板（W0052）。
  const tiers = routeModel.state === "success" && tab !== "overview"
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
            ? <NetworkOverview
              analysis={analysis}
              overview={buildNetworkOverviewData({
                ...cockpit!,
                sourceFacets: Object.fromEntries(routeModel.payload.availableFilters.sources.map((option) => [option.value, option.count])),
              }, analysis)}
            />
            : <NetworkAnalysis viewModel={toViewModel(routeModel.payload)} analysis={analysis} initialTab={tab === "opportunities" ? "opp" : tab === "insight" ? "insight" : "struct"} structureExtras={structureExtras} opportunities={opportunities} insights={insights} />}
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
