/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
 * 欢迎区的示例问题来自固定的 starter view model（旧 chat 已于 Sprint 0104 退役，
 * 服务端不再读取旧 chat 数据）；视觉组件采用 Orbit_0918 的 iOrbit 壳
 * （`agent/iorbit-0918/iorbit-shell.tsx`）：home 分支渲染 `iorbit-home.tsx`，chat 分支渲染
 * `iorbit-chat.tsx`。旧的 `OrbitRealAgent` 已于任务 6a 删除。
 *
 * W0004 示例模式：开关 `ORBIT_GUIDE_DEMO` 打开时，服务端按真实数据推导引导进度
 * （`features/guide/progress.ts`），处于引导期的人把 `guide` 下传给壳，壳改渲染示例。
 * 开关关闭时 `readGuideStatusForActor` 不做任何读取、直接返回 null，页面与 W0001 一致。
 *
 * W0008：`?plan=<id>` 以本人身份读这份计划（他人的计划一律视为不存在），映射成回答卡片的
 * 视图模型交给壳，直接落在对话分支；`&reveal=1`（第 3 步生成完跳来）让卡片揭示一次。
 * 示例壳没有对话分支，处于示例期时不读计划。
 *
 * W0014：示例判定挪到最前（`readDemoModeViewForActor`，判定口径不变：目标仍取首页数据的
 * relationshipGoal，首页数据读不到时按真实页面处理）。处于示例期时只读了判定所需的首页数据，
 * 对话路由模型、活动报名／canonical id、社群状态、计划卡片一概不读——示例壳不用它们，真实
 * `viewModel` 的 suggests 还带真实人名与草稿，不能进示例；那些读取出错也不影响示例渲染。
 * 开关关闭时判定零读取，下面的真实路径与改动前一致。
 *
 * W0022：开关状态交给壳：首页无计划时「帮我制定推进计划 →」去 `/app/start?step=3`（开关关闭时
 * 仍是 `/app/agent/strategy`）。W0035 删去引导的「活动」一步后，首页不再判定它、不再提醒，
 * 也不再为它读报名事实（`hasAnyActiveRegistration` 0 次）。
 *
 * W0036（RH-03「活动始终真实」）：示例期唯一新增的真实读取——「近期可报名」活动（公开目录 1 次 +
 * 本人报名 1 次），作为 `demoEventCandidates` 交给示例壳组活动池；其余真实数据仍一概不读、不下传。
 * 真实分支不做这次读取（真实期活动池由首页从 snapshot + 计划算出）。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { redirect } from "next/navigation";
import { createOrbitAgentStarterViewModel } from "../orbit-agent-route-view-model";
import { IOrbitShell } from "./iorbit-0918/iorbit-shell";
import { loadAppHomeRouteViewModel } from "../home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { presentOrbitEvents } from "../orbit-event-presentation";
import { readRuntimeEventRegistrationStates } from "../../../../features/events/registration/runtime";
import { resolveConfiguredActorEventCanonicalIds } from "../canonical-event-detail-view";
import { readCommunityJoinedForActor } from "../../../../features/community/service-factory";
import { readGuideDemoConfig } from "../../../../shared/config/guide-demo";
import { readGuideStatusForActor } from "../../../../features/guide/progress";
import { readDemoModeViewForActor } from "../_demo/demo-guide-view";
import { readDemoHomeEventCandidates } from "../../../../features/agent/home-event-pool-runtime";
import { resolvePlanService } from "../../../../features/plans/service-factory";
import {
  planCardViewFromSnapshot,
  type IOrbitPlanCardView,
} from "./iorbit-0918/iorbit-plan-card-model";

export type AppAgentSearchParams = {
  /** 历史会话深链（由 iOrbit 壳在客户端读取）。 */
  session?: string | string[];
  /** `?history=1`：strategy / contacts 两屏页头的「◷ 历史记录」落点（任务 5）。 */
  history?: string | string[];
  lang?: string | string[];
  /** W0008：`?plan=<id>` 打开一份已保存计划的回答卡片；`&reveal=1` 只在刚生成完时带。 */
  plan?: string | string[];
  q?: string | string[];
  reveal?: string | string[];
};

/** 本人的某份计划 → 回答卡片。读不到、不是本人的、不是第一份计划生成的都返回 null（落回概览）。 */
async function readPlanCard(actorId: string, planId: string): Promise<IOrbitPlanCardView | null> {
  try {
    const resolution = resolvePlanService({ actorId });
    if (resolution.success === false) return null;
    const snapshot = await resolution.service.getPlan(planId);
    return snapshot ? planCardViewFromSnapshot(snapshot) : null;
  } catch {
    return null;
  }
}

async function getAgentPageLanguage(): Promise<OrbitLanguage> {
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

function firstSearchParam(
  searchParams: AppAgentSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];
  const first = Array.isArray(value) ? value[0] : value;

  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function languageSearchParam(
  searchParams: AppAgentSearchParams | undefined,
): OrbitLanguage | null {
  const value = firstSearchParam(searchParams, "lang");

  return value === "en" || value === "zh" ? value : null;
}

export default async function AppAgentPage({
  searchParams,
}: {
  searchParams?: Promise<AppAgentSearchParams>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }
  const actorId = actor.id;

  const resolvedSearchParams = await searchParams;
  const requestedLanguage = languageSearchParam(resolvedSearchParams);
  // iOrbit 工作台首屏（dashboard）与旧 /app/home 同源的数据：账户、统计、活动旅程。
  // 同一次请求只读一次：示例判定（目标）与真实首页共用。
  let loadedHomeModel: Awaited<ReturnType<typeof loadAppHomeRouteViewModel>> | null = null;
  const loadHomeModel = async () =>
    (loadedHomeModel ??= await loadAppHomeRouteViewModel(undefined, {
      displayName:
        session?.user?.name?.trim() ||
        session?.user?.email?.trim() ||
        "Orbit member",
      email: session?.user?.email,
      id: actorId,
      rawSubject: session.user.id,
    }));
  // W0004／W0014：开关关闭时不读任何东西，返回 null。首页数据读不到时目标未知，按真实首页处理。
  const guide = await readDemoModeViewForActor(
    { actorId, userId: session.user.id },
    {
      readGuideStatus: readGuideStatusForActor,
      readRelationshipGoal: async () => {
        const model = await loadHomeModel();
        if (model.state !== "success") throw new Error("Home data is unavailable.");
        return model.home.account?.relationshipGoal ?? "";
      },
    },
  );
  if (guide) {
    // 示例壳只吃引导视图；home／viewModel 一律不带真实数据（起步模型不含任何人物）。
    // W0036：例外只有真实的近期可报名活动（读不到时为空数组，示例照常渲染）。
    const demoEventCandidates = await readDemoHomeEventCandidates({ accountId: actorId });
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <div data-orbit-route="app-agent-route">
          <IOrbitShell
            demoEventCandidates={demoEventCandidates}
            guide={guide}
            home={null}
            initialPlanCard={null}
            viewModel={createOrbitAgentStarterViewModel()}
          />
        </div>
      </>
    );
  }
  const homeModel = await loadHomeModel();
  const registrationEventIds =
    homeModel.state === "success"
      ? homeModel.home.events.map((event) => event.id)
      : [];
  const canonicalEventIdsByRouteId = await resolveConfiguredActorEventCanonicalIds({
    actorId,
    eventIds: registrationEventIds,
  });
  const canonicalRegistrationStates = await readRuntimeEventRegistrationStates({
    eventIds: registrationEventIds.map(
      (routeId) => canonicalEventIdsByRouteId[routeId] ?? routeId,
    ),
    // 报名接口以账号 id（actor.id）写入，键为 eventId + actorId；按同一个 id 读（W0018）。
    userId: actorId,
  });
  const registrationStates = Object.fromEntries(
    registrationEventIds.map((routeId) => {
      const canonicalId = canonicalEventIdsByRouteId[routeId] ?? routeId;
      return [
        routeId,
        canonicalRegistrationStates[canonicalId] ?? {
          availability: "unavailable" as const,
          registered: false,
        },
      ];
    }),
  );
  // W0003：「已报名活动」栏首行的社群状态由服务端读，SSR 首帧即正确。
  const communityJoined = await readCommunityJoinedForActor({ actorId });
  // W0022：开关只决定无计划时「帮我制定推进计划 →」的去向，不做任何读取。
  const guideEnabled = readGuideDemoConfig().enabled;
  const requestedPlanId = firstSearchParam(resolvedSearchParams, "plan");
  const planCard = requestedPlanId ? await readPlanCard(actorId, requestedPlanId) : null;
  const viewModel = createOrbitAgentStarterViewModel();
  const language = requestedLanguage ?? (await getAgentPageLanguage());

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-route="app-agent-route">
          <IOrbitShell
            communityJoined={communityJoined}
            guide={null}
            guideEnabled={guideEnabled}
            initialDeepLink={Boolean(
              firstSearchParam(resolvedSearchParams, "q") ||
                firstSearchParam(resolvedSearchParams, "session") ||
                planCard,
            )}
            initialPlanCard={planCard}
            initialPlanReveal={Boolean(planCard) && firstSearchParam(resolvedSearchParams, "reveal") === "1"}
            initialHistoryOpen={
              firstSearchParam(resolvedSearchParams, "history") === "1"
            }
            home={
              homeModel.state === "success"
                ? localizeOrbitTree(
                    {
                      ...homeModel.home,
                      events: presentOrbitEvents(
                        homeModel.home.events.map((event) => {
                          const registered =
                            registrationStates[event.id]?.registered ?? false;
                          return {
                            ...event,
                            stats: {
                              ...event.stats,
                              youRsvped: registered,
                            },
                            youRsvped: registered,
                          };
                        }),
                        language,
                      ),
                    },
                    language,
                  )
                : null
            }
            viewModel={localizeOrbitTree(viewModel, language)}
          />
      </div>
    </>
  );
}
