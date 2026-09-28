/**
 * Agent 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable Orbit AI 聊天入口挂到 `/app/agent`。
 * 数据仍走 live 的 chat route view model；视觉组件采用 Orbit_0918 的 iOrbit 壳
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
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import type { OrbitLanguage } from "../orbit-language-core";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { redirect } from "next/navigation";
import {
  loadAppChatRouteViewModel,
  type AppChatRouteStateViewModel,
  type AppChatSearchParams,
} from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { composeOrbitAgentEntryViewModel } from "../chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";
import { IOrbitShell } from "./iorbit-0918/iorbit-shell";
import { loadAppHomeRouteViewModel } from "../home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { presentOrbitEvents } from "../orbit-event-presentation";
import { readRuntimeEventRegistrationStates } from "../../../../features/events/registration/runtime";
import { resolveConfiguredActorEventCanonicalIds } from "../canonical-event-detail-view";
import { readCommunityJoinedForActor } from "../../../../features/community/service-factory";
import { readGuideStatusForActor } from "../../../../features/guide/progress";
import { readDemoModeViewForActor } from "../_demo/demo-guide-view";
import { createOrbitAgentStarterViewModel } from "../orbit-agent-route-view-model";
import { resolvePlanService } from "../../../../features/plans/service-factory";
import {
  planCardViewFromSnapshot,
  type IOrbitPlanCardView,
} from "./iorbit-0918/iorbit-plan-card-model";

export type AppAgentSearchParams = AppChatSearchParams & {
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

function AgentRouteStateBoundary({
  routeState,
}: {
  routeState: AppChatRouteStateViewModel;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-route="app-agent-route-state"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Orbit AI"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={[
          {
            href: "/app/agent",
            id: "agent-recovery-reload",
            label: "Reload Orbit AI",
            recoveryCopy: routeState.copy.nextStep,
          },
          {
            // iOrbit 任务 6a：`/app/chat` 已删除（路由归并）。对话记录与隐私控件现在
            // 都在 iOrbit 的历史抽屉里，恢复链接因此指向 `/app/agent?history=1`。
            href: "/app/agent?history=1",
            id: "agent-recovery-chat",
            label: "Open conversation history",
            recoveryCopy:
              "Open the iOrbit conversation history drawer to review past conversations and their records.",
          },
        ]}
        title={routeState.copy.title}
      />
    </main>
  );
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
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <div data-orbit-route="app-agent-route">
          <IOrbitShell
            guide={guide}
            home={null}
            initialPlanCard={null}
            viewModel={createOrbitAgentStarterViewModel()}
          />
        </div>
      </>
    );
  }
  const routeModel = await loadAppChatRouteViewModel(resolvedSearchParams, {
    actorId,
  });
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
    userId: session.user.id,
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
  const requestedPlanId = firstSearchParam(resolvedSearchParams, "plan");
  const planCard = requestedPlanId ? await readPlanCard(actorId, requestedPlanId) : null;
  const entryModel = composeOrbitAgentEntryViewModel(routeModel);
  const language =
    entryModel.state === "ready"
      ? requestedLanguage ?? (await getAgentPageLanguage())
      : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {entryModel.state === "ready" ? (
        <div data-orbit-route="app-agent-route">
          <IOrbitShell
            communityJoined={communityJoined}
            guide={null}
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
            viewModel={localizeOrbitTree(
              entryModel.viewModel,
              language,
            )}
          />
        </div>
      ) : (
        <AgentRouteStateBoundary routeState={entryModel.routeState} />
      )}
    </>
  );
}
