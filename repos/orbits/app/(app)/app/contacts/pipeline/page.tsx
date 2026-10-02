/**
 * 关系管线页 route adapter。
 *
 * 这里只连接 live-capable contacts route model + contacts analysis 和 Network v2 管线屏。
 *
 * W0005 示例模式：本人在引导期示例里时用示例人物的数据渲染管线，不调用
 * `loadAppContactsRouteViewModel`／`loadContactsAnalysis`。
 *
 * W0047：四列 = 自动档位。先 `ensureRelationshipStrengthsForPage`（来源戳与东京日未变时只读一条语句；失败不影响页面），
 * 再读档位看板（列头人数统计全部联系人，每列最近往来前 30），只按看板里的联系人 id 读卡片资料。
 * 示例模式用静态档位，0 请求。
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
import { NetworkDemoFrame } from "../network-0918/network-demo-frame";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { buildDemoNetworkAnalysis, buildDemoNetworkTierBoard, buildDemoNetworkViewModel } from "../../_demo/demo-network";
import {
  emptyRelationshipTierBoard,
  ensureRelationshipStrengthsForPage,
  readRelationshipTierBoard,
} from "../../../../../features/relationship-strength/read-model";
import { NETWORK_TIER_GROUPS, type NetworkTierBoardView } from "../network-0918/network-model";
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

  const guide = await readDemoModeViewForActor({ actorId: actor.id, userId: session.user.id });
  const [language, params] = await Promise.all([
    getOrbitServerLanguage(),
    searchParams,
  ]);
  if (guide) {
    const now = new Date();
    const lang = language === "en" ? "en" : "zh";
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <NetworkDemoFrame guide={guide} route="app-contacts-pipeline-route">
          <NetworkPipeline viewModel={buildDemoNetworkViewModel(now, lang)} analysis={buildDemoNetworkAnalysis(now, lang)} board={buildDemoNetworkTierBoard()} />
        </NetworkDemoFrame>
      </>
    );
  }
  await ensureRelationshipStrengthsForPage(actor.id, new Date());
  const tierBoard = await readRelationshipTierBoard({ actorId: actor.id }).catch((error: unknown) => {
    console.error(JSON.stringify({ event: "relationship_tier_board_failed", actorId: actor.id, error: error instanceof Error ? error.name : "unknown" }));
    return emptyRelationshipTierBoard();
  });
  const board: NetworkTierBoardView = {
    counts: tierBoard.counts,
    columns: {
      new: tierBoard.columns.new.map((card) => card.contactId),
      active: tierBoard.columns.active.map((card) => card.contactId),
      core: tierBoard.columns.core.map((card) => card.contactId),
      dormant: tierBoard.columns.dormant.map((card) => card.contactId),
    },
  };
  const boardContactIds = NETWORK_TIER_GROUPS.flatMap((tier) => board.columns[tier]);
  const tiers = new Map(NETWORK_TIER_GROUPS.flatMap((tier) => tierBoard.columns[tier]).map((card) => [card.contactId, card]));
  // 管线自带搜索框；列表的 URL 筛选（params）不作用于看板。
  void params;
  const [routeModel, analysis] = await Promise.all([
    loadAppContactsRouteViewModel(undefined, actor.id, { contactIds: boardContactIds }),
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
            viewModel={localizeOrbitTree(applyOrbitContactsPresentation(contactsRouteToOrbitContactsViewModel(routeModel.payload, tiers), language), language)}
            analysis={analysis}
            board={board}
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
